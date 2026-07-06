import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Folder, NoteFile, RepeatKind, Task } from "./types";

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
  return rows.map((row) => {
    const f: Folder = {
      id: row.id as string,
      name: row.name as string,
      color: row.color as string,
      createdAt: new Date(row.created_at as string).getTime(),
    };
    if ("emoji" in row) {
      const v = row.emoji as string | null | undefined;
      f.emoji = v ?? null;
    }
    if (parentIdSupported && "parent_id" in row) {
      f.parentId = (row.parent_id as string | null) ?? null;
    }
    return f;
  });
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
    emoji: folder.emoji ?? null,
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
  // updated_at is owned by the server trigger now; don't send it.
  const { error } = await getSupabase().from("files").upsert({
    id: file.id,
    user_id: userId,
    folder_id: file.folderId,
    title: file.title,
    content: file.content,
    is_completed: file.isCompleted,
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

/**
 * Permanently delete the currently signed-in user's account.
 *
 *  1. Wipes every `files` row owned by the user.
 *  2. Wipes every `folders` row owned by the user.
 *  3. Calls the `delete_user` RPC (SECURITY DEFINER) to remove the
 *     `auth.users` row itself. If the RPC doesn't exist yet on the
 *     project, the helper still succeeds with `authDeleted: false`
 *     so the UI can surface the partial result.
 *
 * Returns a result object so the caller can communicate exactly what
 * happened to the user.
 */
/* ---------------------------- tasks ---------------------------- */

// Some self-hosted / older Supabase projects may not have the tasks table.
// If we hit "relation does not exist" we flip this flag so the rest of the
// session degrades gracefully (planner becomes local-only, no syncing).
let tasksSupported: boolean | null = null;
function isMissingTasksTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "42P01") return true;
  return !!e.message && /tasks/i.test(e.message) && /(does not exist|not found)/i.test(e.message);
}

export function tasksSyncAvailable(): boolean {
  return tasksSupported !== false;
}

export async function fetchTasks(): Promise<Task[]> {
  if (tasksSupported === false) return [];
  const userId = await uid();
  if (!userId) return [];
  const { data, error } = await getSupabase()
    .from("tasks")
    .select(
      "id,title,start_date,time,repeat,weekdays,linked_file_id,linked_folder_id,completed_dates,auto_completed_dates,created_at,updated_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTasksTableError(error)) {
      tasksSupported = false;
      return [];
    }
    throw error;
  }
  tasksSupported = true;
  return (data ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return {
      id: row.id as string,
      title: row.title as string,
      startDate: row.start_date as string,
      time: (row.time as string | null) ?? undefined,
      repeat: (row.repeat as RepeatKind) ?? "once",
      weekdays:
        (row.weekdays as number[] | null | undefined)?.map((n) => Number(n)) ??
        [],
      linkedFileId: (row.linked_file_id as string | null) ?? null,
      linkedFolderId: (row.linked_folder_id as string | null) ?? null,
      completedDates: (row.completed_dates as string[] | null) ?? [],
      autoCompletedDates:
        (row.auto_completed_dates as string[] | null) ?? [],
      createdAt: new Date(row.created_at as string).getTime(),
      updatedAt: new Date(row.updated_at as string).getTime(),
    };
  });
}

export async function upsertTask(task: Task) {
  if (tasksSupported === false) return;
  const userId = await uid();
  if (!userId) return;
  const payload = {
    id: task.id,
    user_id: userId,
    title: task.title,
    start_date: task.startDate,
    time: task.time ?? null,
    repeat: task.repeat,
    weekdays: task.weekdays ?? [],
    linked_file_id: task.linkedFileId ?? null,
    linked_folder_id: task.linkedFolderId ?? null,
    completed_dates: task.completedDates,
    auto_completed_dates: task.autoCompletedDates,
    created_at: new Date(task.createdAt).toISOString(),
  };
  const { error } = await getSupabase().from("tasks").upsert(payload);
  if (error) {
    if (isMissingTasksTableError(error)) {
      tasksSupported = false;
      return;
    }
    throw error;
  }
}

export async function deleteTaskRemote(id: string) {
  if (tasksSupported === false) return;
  const userId = await uid();
  if (!userId) return;
  const { error } = await getSupabase()
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    if (isMissingTasksTableError(error)) {
      tasksSupported = false;
      return;
    }
    throw error;
  }
}

/* ---------------------------- account ---------------------------- */

export async function deleteAccount(): Promise<{
  dataDeleted: boolean;
  authDeleted: boolean;
  authError?: string;
}> {
  const sb = getSupabase();
  const userId = await uid();
  if (!userId) {
    return { dataDeleted: false, authDeleted: false };
  }

  // 1) Tasks (no FK to other user data — go first, can't block).
  if (tasksSupported !== false) {
    const tasksRes = await sb.from("tasks").delete().eq("user_id", userId);
    if (tasksRes.error && !isMissingTasksTableError(tasksRes.error)) {
      throw tasksRes.error;
    }
  }
  // 2) Files (FK from files → folders).
  const filesRes = await sb.from("files").delete().eq("user_id", userId);
  if (filesRes.error) throw filesRes.error;
  // 3) Folders.
  const foldersRes = await sb.from("folders").delete().eq("user_id", userId);
  if (foldersRes.error) throw foldersRes.error;

  // 3) Try to remove the auth user via the SECURITY DEFINER RPC.
  let authDeleted = false;
  let authError: string | undefined;
  try {
    const { error: rpcError } = await sb.rpc("delete_user");
    if (rpcError) {
      authError = rpcError.message;
    } else {
      authDeleted = true;
    }
  } catch (e) {
    authError = e instanceof Error ? e.message : String(e);
  }

  return { dataDeleted: true, authDeleted, authError };
}
