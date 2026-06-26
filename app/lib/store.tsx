"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  Folder,
  NoteFile,
  RepeatKind,
  StreakState,
  Task,
  View,
} from "./types";
import { FOLDER_COLORS } from "./types";
import {
  deleteFileRemote,
  deleteFolderRemote,
  deleteTaskRemote,
  fetchFiles,
  fetchFolders,
  fetchTasks,
  hasSupabaseConfig,
  tasksSyncAvailable,
  upsertFile,
  upsertFolder,
  upsertTask,
} from "./supabase";
import { useAuth } from "./auth";
import { errorMessage } from "./errors";
import { setDraftUser } from "./draftSync";

const STORAGE_PREFIX = "noteflow_state_v1";
const storageKey = (userId: string | null) =>
  userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

export interface AppState {
  folders: Folder[];
  files: NoteFile[];
  tasks: Task[];
  view: View;
  currentFolderId: string | null;
  currentFileId: string | null;
  search: string;
  viewMode: "grid" | "list";
  streak: StreakState;
}

const initialState: AppState = {
  folders: [],
  files: [],
  tasks: [],
  view: "dashboard",
  currentFolderId: null,
  currentFileId: null,
  search: "",
  viewMode: "grid",
  streak: { count: 0, lastDate: null },
};

export type SyncStatus =
  | "offline"
  | "connecting"
  | "syncing"
  | "connected"
  | "error";

export type Action =
  | { type: "HYDRATE"; payload: AppState }
  | { type: "RESET" }
  | {
      type: "MERGE_REMOTE";
      payload: { folders: Folder[]; files: NoteFile[]; tasks?: Task[] };
    }
  | {
      type: "ADD_FOLDER";
      payload: { name: string; color?: string; parentId?: string | null };
    }
  | {
      type: "RENAME_FOLDER";
      payload: { id: string; name?: string; emoji?: string | null };
    }
  | {
      type: "MOVE_FOLDER";
      payload: { id: string; parentId: string | null };
    }
  | { type: "DELETE_FOLDER"; payload: { id: string } }
  | { type: "ADD_FILE"; payload: { folderId: string; title: string } }
  | {
      type: "UPDATE_FILE";
      payload: { id: string; title?: string; content?: string };
    }
  | { type: "TOGGLE_FILE_DONE"; payload: { id: string } }
  | { type: "RENAME_FILE"; payload: { id: string; title: string } }
  | { type: "DELETE_FILE"; payload: { id: string } }
  | {
      type: "SET_VIEW";
      payload: {
        view: View;
        folderId?: string | null;
        fileId?: string | null;
      };
    }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_VIEW_MODE"; payload: "grid" | "list" }
  | {
      type: "ADD_TASK";
      payload: {
        title: string;
        startDate: string;
        time?: string;
        repeat: RepeatKind;
        linkedFileId?: string | null;
        linkedFolderId?: string | null;
      };
    }
  | { type: "DELETE_TASK"; payload: { id: string } }
  | { type: "TOGGLE_TASK_DONE"; payload: { id: string; date: string } }
  | {
      type: "UPDATE_TASK";
      payload: {
        id: string;
        title?: string;
        startDate?: string;
        time?: string | undefined;
        repeat?: RepeatKind;
        weekdays?: number[];
        linkedFileId?: string | null;
        linkedFolderId?: string | null;
      };
    };

function dayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}

export function taskShowsOn(task: Task, date: string): boolean {
  if (task.startDate > date) return false;
  if (task.repeat === "once") return task.startDate === date;
  if (task.repeat === "daily") return true;
  if (task.repeat === "weekly") {
    const dow = dayOfWeek(date);
    if (task.weekdays && task.weekdays.length > 0) return task.weekdays.includes(dow);
    return dayOfWeek(task.startDate) === dow;
  }
  return false;
}

export function taskDoneOn(task: Task, date: string): boolean {
  return task.completedDates.includes(date);
}

/**
 * After files mutate, walk every task with a folder/file link and tick
 * today's instance "done" if the linked content has just gone to done.
 */
function applyAutoCompletion(
  tasks: Task[],
  folders: Folder[],
  files: NoteFile[]
): Task[] {
  const today = todayStr();
  const completedFolderIds = new Set<string>();
  folders.forEach((folder) => {
    const folderFiles = files.filter((f) => f.folderId === folder.id);
    if (folderFiles.length > 0 && folderFiles.every((f) => f.isCompleted))
      completedFolderIds.add(folder.id);
  });
  return tasks.map((task) => {
    if (!task.linkedFileId && !task.linkedFolderId) return task;
    if (!taskShowsOn(task, today)) return task;
    if (task.completedDates.includes(today)) return task;
    let shouldComplete = false;
    if (task.linkedFileId) {
      const f = files.find((x) => x.id === task.linkedFileId);
      if (f?.isCompleted) shouldComplete = true;
    }
    if (!shouldComplete && task.linkedFolderId) {
      if (completedFolderIds.has(task.linkedFolderId)) shouldComplete = true;
    }
    if (!shouldComplete) return task;
    return {
      ...task,
      completedDates: [...task.completedDates, today],
      autoCompletedDates: [...task.autoCompletedDates, today],
      updatedAt: Date.now(),
    };
  });
}

function tickStreak(streak: StreakState): StreakState {
  const today = todayStr();
  if (streak.lastDate === today) return streak;
  if (streak.lastDate === yesterdayStr()) {
    return { count: streak.count + 1, lastDate: today };
  }
  return { count: 1, lastDate: today };
}

function mergeById<T extends { id: string; updatedAt?: number; createdAt?: number }>(
  current: T[],
  incoming: T[]
): T[] {
  const map = new Map<string, T>();
  current.forEach((x) => map.set(x.id, x));
  incoming.forEach((x) => {
    const existing = map.get(x.id);
    if (!existing) {
      map.set(x.id, x);
    } else {
      const a = (x.updatedAt ?? x.createdAt ?? 0) as number;
      const b = (existing.updatedAt ?? existing.createdAt ?? 0) as number;
      map.set(x.id, a >= b ? x : existing);
    }
  });
  return Array.from(map.values());
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, ...action.payload };

    case "RESET":
      return { ...initialState };

    case "MERGE_REMOTE": {
      const folders = mergeById(state.folders, action.payload.folders).map(
        (merged) => {
          if (merged.parentId !== undefined) return merged;
          const local = state.folders.find((f) => f.id === merged.id);
          if (local && local.parentId !== undefined) {
            return { ...merged, parentId: local.parentId };
          }
          return merged;
        }
      );
      return {
        ...state,
        folders,
        files: mergeById(state.files, action.payload.files),
        tasks: action.payload.tasks
          ? mergeById(state.tasks, action.payload.tasks)
          : state.tasks,
      };
    }

    case "ADD_FOLDER": {
      const parentId = action.payload.parentId ?? null;
      const color =
        action.payload.color ||
        (parentId
          ? state.folders.find((f) => f.id === parentId)?.color ||
            FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length]
          : FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length]);
      const folder: Folder = {
        id: newId(),
        name: action.payload.name.trim() || "Untitled",
        color,
        createdAt: Date.now(),
        parentId,
      };
      return { ...state, folders: [...state.folders, folder] };
    }

    case "RENAME_FOLDER": {
      const { id, name, emoji } = action.payload;
      return {
        ...state,
        folders: state.folders.map((f) => {
          if (f.id !== id) return f;
          const next = { ...f };
          if (typeof name === "string" && name.trim()) next.name = name.trim();
          if (emoji !== undefined) next.emoji = emoji;
          return next;
        }),
      };
    }

    case "MOVE_FOLDER": {
      const { id, parentId } = action.payload;
      if (id === parentId) return state;
      // Disallow moving into self/descendant to keep the tree acyclic.
      const descendants = new Set<string>();
      const walk = (root: string) => {
        descendants.add(root);
        state.folders
          .filter((f) => f.parentId === root)
          .forEach((c) => walk(c.id));
      };
      walk(id);
      if (parentId && descendants.has(parentId)) return state;
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === id ? { ...f, parentId } : f
        ),
      };
    }

    case "DELETE_FOLDER": {
      const toDelete = new Set<string>();
      const collect = (id: string) => {
        if (toDelete.has(id)) return;
        toDelete.add(id);
        state.folders
          .filter((f) => f.parentId === id)
          .forEach((c) => collect(c.id));
      };
      collect(action.payload.id);
      const currentRemoved =
        state.currentFolderId !== null && toDelete.has(state.currentFolderId);
      return {
        ...state,
        folders: state.folders.filter((f) => !toDelete.has(f.id)),
        files: state.files.filter((f) => !toDelete.has(f.folderId)),
        currentFolderId: currentRemoved ? null : state.currentFolderId,
        view: currentRemoved ? "dashboard" : state.view,
      };
    }

    case "ADD_FILE": {
      const file: NoteFile = {
        id: newId(),
        folderId: action.payload.folderId,
        title: action.payload.title.trim() || "Untitled note",
        content: "",
        isCompleted: false,
        updatedAt: Date.now(),
      };
      return { ...state, files: [...state.files, file] };
    }

    case "UPDATE_FILE":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.payload.id
            ? {
                ...f,
                title:
                  action.payload.title !== undefined
                    ? action.payload.title
                    : f.title,
                content:
                  action.payload.content !== undefined
                    ? action.payload.content
                    : f.content,
                updatedAt: Date.now(),
              }
            : f
        ),
      };

    case "TOGGLE_FILE_DONE": {
      let touchedCompletion = false;
      const files = state.files.map((f) => {
        if (f.id === action.payload.id) {
          const next = !f.isCompleted;
          if (next) touchedCompletion = true;
          return { ...f, isCompleted: next, updatedAt: Date.now() };
        }
        return f;
      });
      const streak = touchedCompletion ? tickStreak(state.streak) : state.streak;
      const tasks = touchedCompletion
        ? applyAutoCompletion(state.tasks, state.folders, files)
        : state.tasks;
      return { ...state, files, streak, tasks };
    }

    case "RENAME_FILE":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.payload.id
            ? { ...f, title: action.payload.title.trim() || f.title, updatedAt: Date.now() }
            : f
        ),
      };

    case "DELETE_FILE":
      return {
        ...state,
        files: state.files.filter((f) => f.id !== action.payload.id),
        currentFileId:
          state.currentFileId === action.payload.id
            ? null
            : state.currentFileId,
        view: state.currentFileId === action.payload.id ? "folder" : state.view,
      };

    case "SET_VIEW":
      return {
        ...state,
        view: action.payload.view,
        currentFolderId:
          action.payload.folderId !== undefined
            ? action.payload.folderId
            : state.currentFolderId,
        currentFileId:
          action.payload.fileId !== undefined
            ? action.payload.fileId
            : state.currentFileId,
      };

    case "SET_SEARCH":
      return { ...state, search: action.payload };

    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };

    case "ADD_TASK": {
      const now = Date.now();
      const task: Task = {
        id: newId(),
        title: action.payload.title.trim() || "Untitled task",
        startDate: action.payload.startDate,
        time: action.payload.time,
        repeat: action.payload.repeat,
        linkedFileId: action.payload.linkedFileId ?? null,
        linkedFolderId: action.payload.linkedFolderId ?? null,
        completedDates: [],
        autoCompletedDates: [],
        createdAt: now,
        updatedAt: now,
      };
      // If the linked content is already done today, prefill the
      // completion so the task lands in the "Completed" section.
      const tasks = applyAutoCompletion(
        [...state.tasks, task],
        state.folders,
        state.files
      );
      return { ...state, tasks };
    }

    case "DELETE_TASK":
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload.id),
      };

    case "UPDATE_TASK": {
      const { id, ...patch } = action.payload;
      const tasks = state.tasks.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
      );
      // Re-evaluate auto-completion since the link may have just changed.
      const refreshed = applyAutoCompletion(tasks, state.folders, state.files);
      return { ...state, tasks: refreshed };
    }

    case "TOGGLE_TASK_DONE": {
      const { id, date } = action.payload;
      let touched = false;
      const tasks = state.tasks.map((t) => {
        if (t.id !== id) return t;
        const has = t.completedDates.includes(date);
        const completedDates = has
          ? t.completedDates.filter((d) => d !== date)
          : [...t.completedDates, date];
        // Manual tap clears the "auto" flag for that date.
        const autoCompletedDates = t.autoCompletedDates.filter(
          (d) => d !== date
        );
        if (!has) touched = true;
        return {
          ...t,
          completedDates,
          autoCompletedDates,
          updatedAt: Date.now(),
        };
      });
      const streak = touched ? tickStreak(state.streak) : state.streak;
      return { ...state, tasks, streak };
    }

    default:
      return state;
  }
}

interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  sync: SyncStatus;
  syncError: string | null;
  retrySync: () => void;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [pullReady, setPullReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus>("offline");
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncedRef = useRef<{
    folders: Map<string, Folder>;
    files: Map<string, NoteFile>;
    tasks: Map<string, Task>;
  }>({ folders: new Map(), files: new Map(), tasks: new Map() });
  const [retryNonce, setRetryNonce] = useState(0);
  const prevUserIdRef = useRef<string | null>(null);

  // 0) When the signed-in user changes (sign-out / switch), clear the
  //    in-memory reducer so the previous user's data never flashes.
  useEffect(() => {
    setDraftUser(userId);
    if (prevUserIdRef.current !== userId) {
      if (prevUserIdRef.current !== null) {
        dispatch({ type: "RESET" });
      }
      prevUserIdRef.current = userId;
    }
  }, [userId]);

  // 1) Hydrate from localStorage (or seed) - per user namespace
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHydrated(false);
    setPullReady(false);
    syncedRef.current = {
      folders: new Map(),
      files: new Map(),
      tasks: new Map(),
    };
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppState>;
        // Persisted `view` / `currentFolderId` / `currentFileId` carry the
        // user back to where they left off, but if the persisted view was
        // `editor` we still need a folderId; fall back to dashboard when
        // the referenced ids no longer exist (e.g. file was deleted).
        const persistedFolderId = parsed.currentFolderId ?? null;
        const persistedFileId = parsed.currentFileId ?? null;
        const persistedView = parsed.view ?? "dashboard";
        dispatch({
          type: "HYDRATE",
          payload: {
            ...initialState,
            ...parsed,
            view: persistedView,
            currentFolderId: persistedFolderId,
            currentFileId: persistedFileId,
          },
        });
      } else {
        const sampleFolderId = newId();
        const seed: AppState = {
          ...initialState,
          folders: [
            {
              id: sampleFolderId,
              name: "Getting started",
              color: FOLDER_COLORS[0],
              createdAt: Date.now(),
            },
          ],
          files: [
            {
              id: newId(),
              folderId: sampleFolderId,
              title: "Welcome",
              content:
                "# Welcome to NodesMap\n\nThis is a markdown note. Try:\n\n- **Bold**, _italic_, `inline code`\n- Task lists:\n  - [ ] Open a folder\n  - [ ] Create a new note\n  - [x] Read this file\n\n> Tip: toggle the **Mind map** view from the top-right.",
              isCompleted: false,
              updatedAt: Date.now(),
            },
          ],
        };
        dispatch({ type: "HYDRATE", payload: seed });
      }
    } catch {}
    setHydrated(true);
  }, [userId]);

  // 2) Persist to localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    try {
      const persisted = {
        folders: state.folders,
        files: state.files,
        tasks: state.tasks,
        viewMode: state.viewMode,
        streak: state.streak,
        view: state.view,
        currentFolderId: state.currentFolderId,
        currentFileId: state.currentFileId,
      };
      localStorage.setItem(storageKey(userId), JSON.stringify(persisted));
    } catch {}
  }, [
    state.folders,
    state.files,
    state.tasks,
    state.viewMode,
    state.streak,
    state.view,
    state.currentFolderId,
    state.currentFileId,
    hydrated,
    userId,
  ]);

  // 3) Initial pull from Supabase + mark sync ready
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    if (!hasSupabaseConfig() || !userId) {
      setSync("offline");
      return;
    }
    setSync("connecting");
    setSyncError(null);
    let cancelled = false;
    (async () => {
      try {
        const [remoteFolders, remoteFiles, remoteTasks] = await Promise.all([
          fetchFolders(),
          fetchFiles(),
          fetchTasks(),
        ]);
        if (cancelled) return;
        dispatch({
          type: "MERGE_REMOTE",
          payload: {
            folders: remoteFolders,
            files: remoteFiles,
            tasks: remoteTasks,
          },
        });
        syncedRef.current = {
          folders: new Map(remoteFolders.map((f) => [f.id, f])),
          files: new Map(remoteFiles.map((f) => [f.id, f])),
          tasks: new Map(remoteTasks.map((t) => [t.id, t])),
        };
        setPullReady(true);
        setSync("connected");
      } catch (e) {
        if (cancelled) return;
        const msg = errorMessage(e);
        console.warn("Supabase pull failed:", e);
        setSyncError(msg);
        setSync("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, retryNonce, userId]);

  // 4) Push diffs to Supabase on every local change
  useEffect(() => {
    if (typeof window === "undefined" || !pullReady) return;

    const currFolders = new Map(state.folders.map((f) => [f.id, f]));
    const currFiles = new Map(state.files.map((f) => [f.id, f]));
    const currTasks = new Map(state.tasks.map((t) => [t.id, t]));
    const synced = syncedRef.current;
    const jobs: Promise<unknown>[] = [];

    currFolders.forEach((f) => {
      const prev = synced.folders.get(f.id);
      if (
        !prev ||
        prev.name !== f.name ||
        prev.color !== f.color ||
        (prev.emoji ?? null) !== (f.emoji ?? null) ||
        (prev.parentId ?? null) !== (f.parentId ?? null)
      )
        jobs.push(upsertFolder(f));
    });
    synced.folders.forEach((_, id) => {
      if (!currFolders.has(id)) jobs.push(deleteFolderRemote(id));
    });
    currFiles.forEach((f) => {
      const prev = synced.files.get(f.id);
      // Content sync is owned by the Editor (debounce + draft layer in
      // app/lib/draftSync.ts). Only metadata changes trigger an immediate
      // upsert here.
      if (
        !prev ||
        prev.title !== f.title ||
        prev.isCompleted !== f.isCompleted ||
        prev.folderId !== f.folderId
      )
        jobs.push(upsertFile(f));
    });
    synced.files.forEach((_, id) => {
      if (!currFiles.has(id)) jobs.push(deleteFileRemote(id));
    });
    if (tasksSyncAvailable()) {
      currTasks.forEach((t) => {
        const prev = synced.tasks.get(t.id);
        if (
          !prev ||
          prev.title !== t.title ||
          prev.startDate !== t.startDate ||
          (prev.time ?? null) !== (t.time ?? null) ||
          prev.repeat !== t.repeat ||
          JSON.stringify(prev.weekdays ?? []) !==
            JSON.stringify(t.weekdays ?? []) ||
          (prev.linkedFileId ?? null) !== (t.linkedFileId ?? null) ||
          (prev.linkedFolderId ?? null) !== (t.linkedFolderId ?? null) ||
          JSON.stringify(prev.completedDates) !==
            JSON.stringify(t.completedDates) ||
          JSON.stringify(prev.autoCompletedDates) !==
            JSON.stringify(t.autoCompletedDates)
        )
          jobs.push(upsertTask(t));
      });
      synced.tasks.forEach((_, id) => {
        if (!currTasks.has(id)) jobs.push(deleteTaskRemote(id));
      });
    }

    if (jobs.length === 0) return;

    setSync("syncing");
    setSyncError(null);
    Promise.allSettled(jobs).then((results) => {
      const rejected = results.filter(
        (r) => r.status === "rejected"
      ) as PromiseRejectedResult[];
      if (rejected.length) {
        const msg = errorMessage(rejected[0].reason);
        console.warn("Supabase push errors:", rejected);
        setSyncError(msg);
        setSync("error");
      } else {
        setSync("connected");
      }
      syncedRef.current = {
        folders: currFolders,
        files: currFiles,
        tasks: currTasks,
      };
    });
  }, [state.folders, state.files, state.tasks, pullReady]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      sync,
      syncError,
      retrySync: () => setRetryNonce((n) => n + 1),
    }),
    [state, sync, syncError]
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function selectFolderProgress(state: AppState, folderId: string) {
  const files = state.files.filter((f) => f.folderId === folderId);
  const done = files.filter((f) => f.isCompleted).length;
  const pct = files.length ? Math.round((done / files.length) * 100) : 0;
  return { total: files.length, done, pct };
}

export function selectDescendantFolderIds(
  state: AppState,
  folderId: string
): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    state.folders
      .filter((f) => f.parentId === id)
      .forEach((c) => walk(c.id));
  };
  walk(folderId);
  return out;
}

export function selectFolderProgressDeep(state: AppState, folderId: string) {
  const ids = new Set(selectDescendantFolderIds(state, folderId));
  const files = state.files.filter((f) => ids.has(f.folderId));
  const done = files.filter((f) => f.isCompleted).length;
  const pct = files.length ? Math.round((done / files.length) * 100) : 0;
  return { total: files.length, done, pct };
}

export function selectOverallStats(state: AppState) {
  const done = state.files.filter((f) => f.isCompleted).length;
  const total = state.files.length;
  const remaining = total - done;
  const foldersCompleted = state.folders.filter((folder) => {
    const list = state.files.filter((f) => f.folderId === folder.id);
    return list.length > 0 && list.every((f) => f.isCompleted);
  }).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { done, total, remaining, foldersCompleted, pct };
}
