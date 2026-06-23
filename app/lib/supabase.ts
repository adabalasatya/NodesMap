import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Folder, NoteFile } from "./types";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local."
    );
  }
  _client = createBrowserClient(url, key, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      // We exchange the OAuth code ourselves in AuthProvider so the UI can
      // wait for it; disabling auto-detection avoids a race that left the
      // user on the landing page after the first Google sign-in.
      detectSessionInUrl: false,
    },
  });
  return _client;
}

export function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

async function uid(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

// `parent_id` was added later. If the column is missing in the deployed
// schema, fall back so the app keeps working until the user runs the
// migration in supabase-schema.sql.
let parentIdSupported: boolean | null = null;
function isMissingParentIdError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "42703") return true;
  return !!e.message && /parent_id/i.test(e.message);
}

export async function fetchFolders(): Promise<Folder[]> {
  const userId = await uid();
  if (!userId) return [];
  const cols =
    parentIdSupported === false
      ? "id,name,color,created_at"
      : "id,name,color,created_at,parent_id";
  const { data, error } = await getSupabase()
    .from("folders")
    .select(cols)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    if (parentIdSupported !== false && isMissingParentIdError(error)) {
      parentIdSupported = false;
      return fetchFolders();
    }
    throw error;
  }
  if (parentIdSupported === null) parentIdSupported = true;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: new Date(row.created_at as string).getTime(),
    parentId: (row.parent_id as string | null | undefined) ?? null,
  }));
}

export async function fetchFiles(): Promise<NoteFile[]> {
  const userId = await uid();
  if (!userId) return [];
  const { data, error } = await getSupabase()
    .from("files")
    .select("id,folder_id,title,content,is_completed,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    folderId: r.folder_id as string,
    title: r.title as string,
    content: (r.content as string) ?? "",
    isCompleted: !!r.is_completed,
    updatedAt: new Date(r.updated_at as string).getTime(),
  }));
}

export async function upsertFolder(folder: Folder) {
  const userId = await uid();
  if (!userId) return;
  const base: Record<string, unknown> = {
    id: folder.id,
    user_id: userId,
    name: folder.name,
    color: folder.color,
    created_at: new Date(folder.createdAt).toISOString(),
  };
  const payload =
    parentIdSupported === false
      ? base
      : { ...base, parent_id: folder.parentId ?? null };
  const { error } = await getSupabase().from("folders").upsert(payload);
  if (error) {
    if (parentIdSupported !== false && isMissingParentIdError(error)) {
      parentIdSupported = false;
      const { error: retryError } = await getSupabase()
        .from("folders")
        .upsert(base);
      if (retryError) throw retryError;
      return;
    }
    throw error;
  }
}

export async function upsertFile(file: NoteFile) {
  const userId = await uid();
  if (!userId) return;
  const { error } = await getSupabase().from("files").upsert({
    id: file.id,
    user_id: userId,
    folder_id: file.folderId,
    title: file.title,
    content: file.content,
    is_completed: file.isCompleted,
    updated_at: new Date(file.updatedAt).toISOString(),
  });
  if (error) throw error;
}

export async function deleteFolderRemote(id: string) {
  const userId = await uid();
  if (!userId) return;
  const { error } = await getSupabase()
    .from("folders")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteFileRemote(id: string) {
  const userId = await uid();
  if (!userId) return;
  const { error } = await getSupabase()
    .from("files")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
