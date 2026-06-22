"use client";

import { useState } from "react";
import { selectFolderProgress, useStore } from "../lib/store";
import { CheckIcon, ChevronLeftIcon, PlusIcon } from "./icons";
import ContextMenu, { type MenuItem } from "./ContextMenu";

export default function FolderView() {
  const { state, dispatch } = useStore();
  const folder = state.folders.find((f) => f.id === state.currentFolderId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  if (!folder) {
    return (
      <div className="p-8 fade-in">
        <p className="text-[var(--muted)]">Folder not found.</p>
      </div>
    );
  }

  const { total, done, pct } = selectFolderProgress(state, folder.id);
  const search = state.search.toLowerCase();
  const files = state.files
    .filter((f) => f.folderId === folder.id)
    .filter((f) =>
      !search ? true : f.title.toLowerCase().includes(search)
    );

  const createFile = () => {
    const title = newName.trim();
    if (!title) {
      setCreating(false);
      return;
    }
    dispatch({ type: "ADD_FILE", payload: { folderId: folder.id, title } });
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="p-8 fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() =>
            dispatch({
              type: "SET_VIEW",
              payload: { view: "dashboard", folderId: null, fileId: null },
            })
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
        >
          <ChevronLeftIcon size={14} /> Back
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">{folder.name}</h1>
        <div className="ml-auto">
          {creating ? (
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={createFile}
              onKeyDown={(e) => {
                if (e.key === "Enter") createFile();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              placeholder="Note title"
              className="bg-transparent border border-[var(--border)] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
            >
              <PlusIcon size={14} /> New file
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-[var(--muted)]">
            {done} of {total} files completed
          </div>
          <div
            className="text-sm font-medium tabular-nums"
            style={{ color: folder.color }}
          >
            {pct}%
          </div>
        </div>
        <div className="w-full h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: folder.color }}
          />
        </div>
      </div>

      <div
        className={
          state.viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            : "flex flex-col gap-2"
        }
      >
        {files.map((file) => (
          <div
            key={file.id}
            onClick={() =>
              dispatch({
                type: "SET_VIEW",
                payload: {
                  view: "editor",
                  folderId: folder.id,
                  fileId: file.id,
                },
              })
            }
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({
                x: e.clientX,
                y: e.clientY,
                items: fileMenu(file.id, file.title, dispatch, file.isCompleted),
              });
            }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] p-5 min-h-[140px] flex flex-col cursor-pointer transition"
          >
            <div
              className={`font-semibold text-base mb-2 flex-1 ${
                file.isCompleted
                  ? "line-through text-[var(--muted)]"
                  : ""
              }`}
            >
              {file.title.replace(/\.md$/i, "")}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--muted)]">.md</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({
                    type: "TOGGLE_FILE_DONE",
                    payload: { id: file.id },
                  });
                }}
                aria-label={
                  file.isCompleted ? "Mark not done" : "Mark as done"
                }
                className={`shrink-0 h-7 px-2 rounded-full border transition flex items-center justify-center ${
                  file.isCompleted
                    ? "bg-[var(--surface-2)] border-[var(--border)]"
                    : "border-[var(--border)] hover:border-[var(--foreground)]/40"
                }`}
                style={
                  file.isCompleted
                    ? { color: folder.color }
                    : undefined
                }
              >
                {file.isCompleted ? (
                  <CheckIcon size={14} />
                ) : (
                  <span className="size-3" />
                )}
              </button>
            </div>
          </div>
        ))}

        {creating ? null : (
          <button
            onClick={() => setCreating(true)}
            className="rounded-2xl border-2 border-dashed border-[var(--border)] p-5 min-h-[140px] grid place-items-center text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 transition"
          >
            <div className="flex flex-col items-center gap-2">
              <PlusIcon size={20} />
              <span className="text-sm">New file</span>
            </div>
          </button>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function fileMenu(
  id: string,
  title: string,
  dispatch: ReturnType<typeof useStore>["dispatch"],
  isCompleted: boolean
): MenuItem[] {
  return [
    {
      label: "Open",
      onSelect: () =>
        dispatch({
          type: "SET_VIEW",
          payload: { view: "editor", fileId: id },
        }),
    },
    {
      label: isCompleted ? "Mark not done" : "Mark as done",
      onSelect: () => dispatch({ type: "TOGGLE_FILE_DONE", payload: { id } }),
    },
    {
      label: "Rename",
      onSelect: () => {
        const next = prompt("Rename note", title);
        if (next) dispatch({ type: "RENAME_FILE", payload: { id, title: next } });
      },
    },
    {
      label: "Delete",
      danger: true,
      onSelect: () => {
        if (confirm(`Delete note "${title}"?`))
          dispatch({ type: "DELETE_FILE", payload: { id } });
      },
    },
  ];
}
