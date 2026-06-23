import type { NoteFile } from "./types";
import { hasSupabaseConfig, upsertFile } from "./supabase";

const DRAFT_PREFIX = "file_draft_";

export type FileDraft = {
  content: string;
  updatedAt: number;
};

export function readDraft(fileId: string): FileDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + fileId);
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
    localStorage.setItem(DRAFT_PREFIX + fileId, JSON.stringify(d));
  } catch {}
}

export function clearDraft(fileId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_PREFIX + fileId);
  } catch {}
}

export function listDraftIds(): string[] {
  if (typeof window === "undefined") return [];
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(DRAFT_PREFIX)) {
      ids.push(k.slice(DRAFT_PREFIX.length));
    }
  }
  return ids;
}

/**
 * Push any leftover `file_draft_*` entries to Supabase, then clear them.
 * Called on app start to recover content from a previous crash / tab close.
 * If a draft has no matching file in the local state (orphan), it's dropped.
 * Failures leave the draft intact for the next attempt.
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
      // Leave the draft for the next attempt.
    }
  }
}
