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
  StreakState,
  View,
} from "./types";
import { FOLDER_COLORS } from "./types";
import {
  deleteFileRemote,
  deleteFolderRemote,
  fetchFiles,
  fetchFolders,
  hasSupabaseConfig,
  upsertFile,
  upsertFolder,
} from "./supabase";
import { useAuth } from "./auth";

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
  | { type: "MERGE_REMOTE"; payload: { folders: Folder[]; files: NoteFile[] } }
  | { type: "ADD_FOLDER"; payload: { name: string; color?: string } }
  | { type: "RENAME_FOLDER"; payload: { id: string; name: string } }
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
  | { type: "SET_VIEW_MODE"; payload: "grid" | "list" };

function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error_description === "string")
      return o.error_description as string;
    try {
      return JSON.stringify(e);
    } catch {
      return "Unknown error";
    }
  }
  return String(e ?? "Unknown error");
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

    case "MERGE_REMOTE":
      return {
        ...state,
        folders: mergeById(state.folders, action.payload.folders),
        files: mergeById(state.files, action.payload.files),
      };

    case "ADD_FOLDER": {
      const color =
        action.payload.color ||
        FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length];
      const folder: Folder = {
        id: newId(),
        name: action.payload.name.trim() || "Untitled",
        color,
        createdAt: Date.now(),
      };
      return { ...state, folders: [...state.folders, folder] };
    }

    case "RENAME_FOLDER":
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.payload.id
            ? { ...f, name: action.payload.name.trim() || f.name }
            : f
        ),
      };

    case "DELETE_FOLDER":
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.payload.id),
        files: state.files.filter((f) => f.folderId !== action.payload.id),
        currentFolderId:
          state.currentFolderId === action.payload.id
            ? null
            : state.currentFolderId,
        view:
          state.currentFolderId === action.payload.id ? "dashboard" : state.view,
      };

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
      return { ...state, files, streak };
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
  }>({ folders: new Map(), files: new Map() });
  const [retryNonce, setRetryNonce] = useState(0);

  // 1) Hydrate from localStorage (or seed) - per user namespace
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHydrated(false);
    setPullReady(false);
    syncedRef.current = { folders: new Map(), files: new Map() };
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppState>;
        dispatch({
          type: "HYDRATE",
          payload: { ...initialState, ...parsed, view: "dashboard" },
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
                "# Welcome to NoteFlow\n\nThis is a markdown note. Try:\n\n- **Bold**, _italic_, `inline code`\n- Task lists:\n  - [ ] Open a folder\n  - [ ] Create a new note\n  - [x] Read this file\n\n> Tip: toggle the **Mind map** view from the top-right.",
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
        viewMode: state.viewMode,
        streak: state.streak,
      };
      localStorage.setItem(storageKey(userId), JSON.stringify(persisted));
    } catch {}
  }, [state.folders, state.files, state.viewMode, state.streak, hydrated, userId]);

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
        const [remoteFolders, remoteFiles] = await Promise.all([
          fetchFolders(),
          fetchFiles(),
        ]);
        if (cancelled) return;
        dispatch({
          type: "MERGE_REMOTE",
          payload: { folders: remoteFolders, files: remoteFiles },
        });
        syncedRef.current = {
          folders: new Map(remoteFolders.map((f) => [f.id, f])),
          files: new Map(remoteFiles.map((f) => [f.id, f])),
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
    const synced = syncedRef.current;
    const tasks: Promise<unknown>[] = [];

    currFolders.forEach((f) => {
      const prev = synced.folders.get(f.id);
      if (!prev || prev.name !== f.name || prev.color !== f.color)
        tasks.push(upsertFolder(f));
    });
    synced.folders.forEach((_, id) => {
      if (!currFolders.has(id)) tasks.push(deleteFolderRemote(id));
    });
    currFiles.forEach((f) => {
      const prev = synced.files.get(f.id);
      if (
        !prev ||
        prev.title !== f.title ||
        prev.content !== f.content ||
        prev.isCompleted !== f.isCompleted ||
        prev.folderId !== f.folderId
      )
        tasks.push(upsertFile(f));
    });
    synced.files.forEach((_, id) => {
      if (!currFiles.has(id)) tasks.push(deleteFileRemote(id));
    });

    if (tasks.length === 0) return;

    setSync("syncing");
    setSyncError(null);
    Promise.allSettled(tasks).then((results) => {
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
      syncedRef.current = { folders: currFolders, files: currFiles };
    });
  }, [state.folders, state.files, pullReady]);

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
