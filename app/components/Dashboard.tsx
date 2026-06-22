"use client";

import { useState } from "react";
import { selectFolderProgress, useStore } from "../lib/store";
import { FolderIcon, PlusIcon } from "./icons";
import ContextMenu, { type MenuItem } from "./ContextMenu";

export default function Dashboard() {
  const { state, dispatch } = useStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  const search = state.search.toLowerCase();
  const folders = state.folders.filter((f) =>
    !search ? true : f.name.toLowerCase().includes(search)
  );

  const create = () => {
    if (!newName.trim()) {
      setCreating(false);
      return;
    }
    dispatch({ type: "ADD_FOLDER", payload: { name: newName } });
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="p-8 fade-in">
      <div className="text-[11px] font-medium tracking-[0.15em] text-[var(--muted)] uppercase mb-4">
        Folders
      </div>

      <div
        className={
          state.viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            : "flex flex-col gap-2"
        }
      >
        {folders.map((folder) => {
          const { total, done, pct } = selectFolderProgress(state, folder.id);
          const tint = `${folder.color}33`;
          if (state.viewMode === "list") {
            return (
              <div
                key={folder.id}
                onClick={() =>
                  dispatch({
                    type: "SET_VIEW",
                    payload: { view: "folder", folderId: folder.id },
                  })
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: folderMenu(folder.id, folder.name, dispatch),
                  });
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] cursor-pointer transition"
              >
                <FolderIcon size={18} style={{ color: folder.color }} />
                <div className="font-medium">{folder.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {done}/{total} done
                </div>
                <div className="flex-1 h-1 max-w-[260px] ml-auto rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${pct}%`, background: folder.color }}
                  />
                </div>
              </div>
            );
          }
          return (
            <button
              key={folder.id}
              onClick={() =>
                dispatch({
                  type: "SET_VIEW",
                  payload: { view: "folder", folderId: folder.id },
                })
              }
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  items: folderMenu(folder.id, folder.name, dispatch),
                });
              }}
              className="relative text-left rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 pb-7 hover:bg-[var(--surface-2)] transition group overflow-hidden"
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div
                  className="size-14 rounded-xl grid place-items-center mb-2"
                  style={{ background: tint, color: folder.color }}
                >
                  <FolderIcon size={28} />
                </div>
                <div className="font-semibold">{folder.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {done}/{total} done
                </div>
              </div>
              <div className="absolute left-0 right-0 bottom-0 h-1 bg-[var(--surface-2)]">
                <div
                  className="h-full transition-[width] duration-300"
                  style={{ width: `${pct}%`, background: folder.color }}
                />
              </div>
            </button>
          );
        })}

        {state.viewMode === "grid" &&
          (creating ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--border)] p-6 grid place-items-center min-h-[180px]">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={create}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Folder name"
                className="bg-transparent text-center outline-none w-full"
              />
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="rounded-2xl border-2 border-dashed border-[var(--border)] p-6 grid place-items-center text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 transition min-h-[180px]"
            >
              <div className="flex flex-col items-center gap-2">
                <PlusIcon size={22} />
                <span className="text-sm">New folder</span>
              </div>
            </button>
          ))}
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

function folderMenu(
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
          dispatch({
            type: "RENAME_FOLDER",
            payload: { id, name: next },
          });
      },
    },
    {
      label: "Delete",
      danger: true,
      onSelect: () => {
        if (confirm(`Delete folder "${name}" and all its notes?`))
          dispatch({ type: "DELETE_FOLDER", payload: { id } });
      },
    },
  ];
}
