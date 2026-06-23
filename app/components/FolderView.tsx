"use client";

import { useState } from "react";
import {
  selectFolderProgress,
  selectFolderProgressDeep,
  useStore,
} from "../lib/store";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
} from "./icons";
import ContextMenu, { type MenuItem } from "./ContextMenu";

export default function FolderView() {
  const { state, dispatch } = useStore();
  const folder = state.folders.find((f) => f.id === state.currentFolderId);
  const [creating, setCreating] = useState<null | "file" | "folder">(null);
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
  const deep = selectFolderProgressDeep(state, folder.id);
  const search = state.search.toLowerCase();
  const subFolders = state.folders
    .filter((f) => f.parentId === folder.id)
    .filter((f) => (!search ? true : f.name.toLowerCase().includes(search)));
  const files = state.files
    .filter((f) => f.folderId === folder.id)
    .filter((f) => (!search ? true : f.title.toLowerCase().includes(search)));

  const goBack = () => {
    if (folder.parentId) {
      dispatch({
        type: "SET_VIEW",
        payload: {
          view: "folder",
          folderId: folder.parentId,
          fileId: null,
        },
      });
    } else {
      dispatch({
        type: "SET_VIEW",
        payload: { view: "dashboard", folderId: null, fileId: null },
      });
    }
  };

  const submit = () => {
    const name = newName.trim();
    if (!name) {
      setCreating(null);
      return;
    }
    if (creating === "folder") {
      dispatch({
        type: "ADD_FOLDER",
        payload: { name, parentId: folder.id },
      });
    } else {
      dispatch({
        type: "ADD_FILE",
        payload: { folderId: folder.id, title: name },
      });
    }
    setNewName("");
    setCreating(null);
  };

  return (
    <div className="p-8 fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
        >
          <ChevronLeftIcon size={14} /> Back
        </button>
        <div className="ml-auto flex items-center gap-2">
          {creating ? (
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setCreating(null);
                  setNewName("");
                }
              }}
              placeholder={
                creating === "folder" ? "Subfolder name" : "Note title"
              }
              className="bg-transparent border border-[var(--border)] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          ) : (
            <>
              <button
                onClick={() => {
                  setCreating("folder");
                  setNewName("");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
              >
                <FolderPlusIcon size={14} /> New folder
              </button>
              <button
                onClick={() => {
                  setCreating("file");
                  setNewName("");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
              >
                <PlusIcon size={14} /> New file
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-[var(--muted)]">
            {deep.done} of {deep.total} files completed
            {deep.total !== total && (
              <span className="ml-2 text-[var(--muted)]/70">
                ({done}/{total} in this folder)
              </span>
            )}
          </div>
          <div
            className="text-sm font-medium tabular-nums"
            style={{ color: folder.color }}
          >
            {deep.pct}%
          </div>
        </div>
        <div className="w-full h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${deep.pct}%`, background: folder.color }}
          />
        </div>
      </div>

      {subFolders.length > 0 && (
        <div
          className={
            state.viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"
              : "flex flex-col gap-2 mb-6"
          }
        >
          {subFolders.map((sub) => {
            const sp = selectFolderProgressDeep(state, sub.id);
            return (
              <div
                key={sub.id}
                onClick={() =>
                  dispatch({
                    type: "SET_VIEW",
                    payload: {
                      view: "folder",
                      folderId: sub.id,
                      fileId: null,
                    },
                  })
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: folderItemMenu(sub.id, sub.name, dispatch),
                  });
                }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] p-5 min-h-[140px] flex flex-col cursor-pointer transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <FolderIcon size={20} style={{ color: sub.color }} />
                  <div className="font-semibold text-base flex-1">
                    {sub.name}
                  </div>
                </div>
                <div className="mt-auto">
                  <div className="text-xs text-[var(--muted)] mb-1.5 tabular-nums">
                    {sp.done}/{sp.total} done
                  </div>
                  <div className="w-full h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${sp.pct}%`, background: sub.color }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden divide-y divide-[var(--border)]">
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
            className="group flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-2)] cursor-pointer transition"
          >
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
              className={`shrink-0 size-5 rounded-full border flex items-center justify-center transition ${
                file.isCompleted
                  ? "border-[var(--border)]"
                  : "border-[var(--border)] hover:border-[var(--foreground)]/40"
              }`}
              style={file.isCompleted ? { color: folder.color } : undefined}
            >
              {file.isCompleted ? (
                <CheckIcon size={12} />
              ) : (
                <span className="size-2.5" />
              )}
            </button>
            <FileIcon size={13} className="shrink-0 text-[var(--muted)]" />
            <span
              className={`text-sm truncate flex-1 ${
                file.isCompleted ? "line-through text-[var(--muted)]" : ""
              }`}
            >
              {file.title.replace(/\.md$/i, "")}
            </span>
            <span className="text-[10px] text-[var(--muted)] tabular-nums opacity-60">
              .md
            </span>
            <ChevronRightIcon
              size={12}
              className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition"
            />
          </div>
        ))}

        {creating ? null : (
          <button
            onClick={() => {
              setCreating("file");
              setNewName("");
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition text-sm"
          >
            <PlusIcon size={14} />
            <span>New file</span>
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

function folderItemMenu(
  id: string,
  name: string,
  dispatch: ReturnType<typeof useStore>["dispatch"]
): MenuItem[] {
  return [
    {
      label: "Open",
      onSelect: () =>
        dispatch({
          type: "SET_VIEW",
          payload: { view: "folder", folderId: id },
        }),
    },
    {
      label: "Rename",
      onSelect: () => {
        const next = prompt("Rename folder", name);
        if (next)
          dispatch({ type: "RENAME_FOLDER", payload: { id, name: next } });
      },
    },
    {
      label: "Delete",
      danger: true,
      onSelect: () => {
        if (confirm(`Delete folder "${name}" and all its contents?`))
          dispatch({ type: "DELETE_FOLDER", payload: { id } });
      },
    },
  ];
}
