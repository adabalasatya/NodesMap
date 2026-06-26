"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";

type Item =
  | { kind: "file"; id: string; title: string; folderPath: string }
  | { kind: "folder"; id: string; path: string }
  | { kind: "action"; id: string; label: string; run: () => void };

/**
 * Cmd / Ctrl + K command palette.
 * - Jump to any file or folder by typing part of its name/path.
 * - Quick actions: "New note in current folder", "New folder", "Planner",
 *   "Mind map", "Progress".
 */
export default function QuickAdd() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global hotkey listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setHi(0);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Autofocus the input when the palette opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const folderPath = (folderId: string | null): string => {
    if (!folderId) return "";
    const parts: string[] = [];
    let cur = state.folders.find((f) => f.id === folderId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parentId
        ? state.folders.find((x) => x.id === cur!.parentId)
        : undefined;
    }
    return parts.join(" / ");
  };

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesQuery = (s: string) =>
      !q || s.toLowerCase().includes(q);

    // Actions
    const actions: Item[] = ([
      {
        kind: "action" as const,
        id: "new-folder",
        label: "Create a new folder",
        run: () => {
          dispatch({
            type: "ADD_FOLDER",
            payload: { name: "Untitled folder", parentId: null },
          });
        },
      },
      {
        kind: "action" as const,
        id: "new-file",
        label: state.currentFolderId
          ? "Create a new note in this folder"
          : "Create a new note (pick a folder first)",
        run: () => {
          const folderId = state.currentFolderId;
          if (!folderId) return;
          dispatch({
            type: "ADD_FILE",
            payload: { folderId, title: "Untitled note" },
          });
        },
      },
      {
        kind: "action" as const,
        id: "go-planner",
        label: "Open Planner",
        run: () =>
          dispatch({ type: "SET_VIEW", payload: { view: "planner" } }),
      },
      {
        kind: "action" as const,
        id: "go-progress",
        label: "Open Progress",
        run: () =>
          dispatch({ type: "SET_VIEW", payload: { view: "progress" } }),
      },
      {
        kind: "action" as const,
        id: "go-mindmap",
        label: "Open Mind map",
        run: () =>
          dispatch({ type: "SET_VIEW", payload: { view: "mindmap" } }),
      },
      {
        kind: "action" as const,
        id: "go-home",
        label: "Go Home",
        run: () =>
          dispatch({
            type: "SET_VIEW",
            payload: { view: "dashboard", folderId: null, fileId: null },
          }),
      },
    ] satisfies Item[]).filter((a) => matchesQuery(a.label));

    const folders: Item[] = state.folders
      .map((f) => ({
        kind: "folder" as const,
        id: f.id,
        path: folderPath(f.id),
      }))
      .filter((f) => matchesQuery(f.path));

    const files: Item[] = state.files
      .map((f) => ({
        kind: "file" as const,
        id: f.id,
        title: f.title.replace(/\.md$/i, ""),
        folderPath: folderPath(f.folderId),
      }))
      .filter((f) => matchesQuery(`${f.title} ${f.folderPath}`));

    return [...actions, ...folders, ...files].slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, state.folders, state.files, state.currentFolderId]);

  // Reset highlight when the result list changes.
  useEffect(() => {
    setHi(0);
  }, [query]);

  const run = (item: Item) => {
    if (item.kind === "file") {
      const file = state.files.find((f) => f.id === item.id);
      if (file) {
        dispatch({
          type: "SET_VIEW",
          payload: {
            view: "editor",
            folderId: file.folderId,
            fileId: file.id,
          },
        });
      }
    } else if (item.kind === "folder") {
      dispatch({
        type: "SET_VIEW",
        payload: { view: "folder", folderId: item.id, fileId: null },
      });
    } else {
      item.run();
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-start pt-[12vh] p-4 bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl modal-pop overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Quick add"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              const it = items[hi];
              if (it) {
                e.preventDefault();
                run(it);
              }
            }
          }}
          placeholder="Jump to a note, folder, or action…"
          className="w-full px-4 py-3 text-sm outline-none bg-transparent border-b border-[var(--border)]"
        />
        <div className="max-h-72 overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--muted)] text-center">
              No matches.
            </div>
          ) : (
            items.map((it, i) => (
              <button
                key={`${it.kind}-${it.id}`}
                onClick={() => run(it)}
                onMouseEnter={() => setHi(i)}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition ${
                  i === hi
                    ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                    : "text-[var(--foreground)]"
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] w-14 shrink-0">
                  {it.kind === "file"
                    ? "File"
                    : it.kind === "folder"
                    ? "Folder"
                    : "Action"}
                </span>
                <span className="truncate flex-1">
                  {it.kind === "file"
                    ? `${it.folderPath ? it.folderPath + " / " : ""}${it.title}`
                    : it.kind === "folder"
                    ? it.path
                    : it.label}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 text-[11px] text-[var(--muted)] border-t border-[var(--border)] flex items-center justify-between">
          <span>↑↓ to navigate · Enter to select · Esc to close</span>
          <span className="tabular-nums">
            {items.length} result{items.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
