import type { NoteFile } from "./types";
import { hasSupabaseConfig, upsertFile } from "./supabase";

// Drafts are namespaced per user so multiple accounts on the same
// browser can't see each other's unsaved content.
//   file_draft_<userId>_<fileId>  →  preferred shape
//   file_draft_<fileId>           →  legacy (pre-namespacing) — still
//                                    read for backwards compatibility
//                                    and rewritten on next save.
const DRAFT_PREFIX = "file_draft_";

export type FileDraft = {
  content: string;
  updatedAt: number;
};

let activeUserId: string | null = null;
export function setDraftUser(userId: string | null) {
  activeUserId = userId;
}

function keyFor(fileId: string): string {
  return activeUserId
    ? `${DRAFT_PREFIX}${activeUserId}_${fileId}`
    : `${DRAFT_PREFIX}${fileId}`;
}

function legacyKey(fileId: string): string {
  return `${DRAFT_PREFIX}${fileId}`;
}

export function readDraft(fileId: string): FileDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem(keyFor(fileId)) ??
      // Fall back to legacy unscoped key so users with old drafts don't
      // lose them on first load after the upgrade.
      localStorage.getItem(legacyKey(fileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FileDraft;
    if (typeof parsed?.content !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(fileId: string, content: string) {
  if (typeof window === "undefined") return;
  try {
    const d: FileDraft = { content, updatedAt: Date.now() };
    localStorage.setItem(keyFor(fileId), JSON.stringify(d));
    // Clear the legacy unscoped key once the new namespaced one is set.
    if (activeUserId) localStorage.removeItem(legacyKey(fileId));
  } catch {}
}

export function clearDraft(fileId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(keyFor(fileId));
    localStorage.removeItem(legacyKey(fileId));
  } catch {}
}

/**
 * Enumerate all draft fileIds owned by the currently active user, plus
 * any legacy unscoped drafts (those are claimed by whoever signs in
 * first since they pre-date namespacing).
 */
export function listDraftIds(): string[] {
  if (typeof window === "undefined") return [];
  const scopedPrefix = activeUserId
    ? `${DRAFT_PREFIX}${activeUserId}_`
    : null;
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
    if (scopedPrefix && k.startsWith(scopedPrefix)) {
      ids.push(k.slice(scopedPrefix.length));
    } else if (!k.slice(DRAFT_PREFIX.length).includes("_")) {
      // legacy `file_draft_<uuid>` — uuid contains '-' but never '_'
      ids.push(k.slice(DRAFT_PREFIX.length));
    }
  }
  return ids;
}

/**
 * Push any leftover drafts to Supabase, then clear them.
 * Called on app start to recover content from a previous crash / tab close.
 */
export async function syncStaleDrafts(files: NoteFile[]): Promise<void> {
  if (typeof window === "undefined") return;
  if (!hasSupabaseConfig()) return;
  const ids = listDraftIds();
  for (const fileId of ids) {
    const draft = readDraft(fileId);
    if (!draft) continue;
    const file = files.find((f) => f.id === fileId);
    if (!file) {
      clearDraft(fileId);
      continue;
    }
    try {
      await upsertFile({
        ...file,
        content: draft.content,
        updatedAt: draft.updatedAt,
      });
      clearDraft(fileId);
    } catch (e) {
      console.warn("stale draft sync failed for", fileId, e);
    }
  }
}
