"use client";

import { useState } from "react";
import { selectFolderProgressDeep, useStore } from "../lib/store";
import { FolderIcon, GridIcon, ListIcon, PlusIcon } from "./icons";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { useDialog } from "./Dialog";

export default function Dashboard() {
  const { state, dispatch } = useStore();
  const dialog = useDialog();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  const search = state.search.toLowerCase();
  const folders = state.folders
    .filter((f) => !f.parentId)
    .filter((f) => (!search ? true : f.name.toLowerCase().includes(search)));

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
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] font-medium tracking-[0.15em] text-[var(--muted)] uppercase">
          Folders
        </div>
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          <button
            aria-label="Grid view"
            onClick={() =>
              dispatch({ type: "SET_VIEW_MODE", payload: "grid" })
            }
            className={`p-1.5 rounded-md transition ${
              state.viewMode === "grid"
                ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            title="Grid view"
          >
            <GridIcon size={14} />
          </button>
          <button
            aria-label="List view"
            onClick={() =>
              dispatch({ type: "SET_VIEW_MODE", payload: "list" })
            }
            className={`p-1.5 rounded-md transition ${
              state.viewMode === "list"
                ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            title="List view"
          >
            <ListIcon size={14} />
          </button>
        </div>
      </div>

      <div
        className={
          state.viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            : "flex flex-col gap-2"
        }
      >
        {folders.map((folder) => {
          const { total, done, pct } = selectFolderProgressDeep(state, folder.id);
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
                    items: folderMenu(folder.id, folder.name, dispatch, dialog),
                  });
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] cursor-pointer transition"
              >
                <FolderIcon size={18} className="text-[var(--muted)]" />
                <div className="font-medium">{folder.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {done}/{total} done
                </div>
                <div className="flex-1 h-1 max-w-[260px] ml-auto rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${pct}%`,
                      background: "var(--foreground)",
                    }}
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
                  items: folderMenu(folder.id, folder.name, dispatch, dialog),
                });
              }}
              className="relative text-left rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 pb-7 hover:bg-[var(--surface-2)] transition group overflow-hidden"
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div className="size-14 rounded-xl grid place-items-center mb-2 bg-[var(--surface-2)] text-[var(--muted)]">
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
                  style={{
                    width: `${pct}%`,
                    background: "var(--foreground)",
                  }}
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
  dispatch: ReturnType<typeof useStore>["dispatch"],
  dialog: ReturnType<typeof useDialog>
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
      onSelect: async () => {
        const next = await dialog.prompt({
          title: "Rename folder",
          placeholder: "Folder name",
          defaultValue: name,
          okLabel: "Rename",
        });
        if (next && next.trim())
          dispatch({
            type: "RENAME_FOLDER",
            payload: { id, name: next.trim() },
          });
      },
    },
    {
      label: "Delete",
      danger: true,
      onSelect: async () => {
        const ok = await dialog.confirm({
          title: "Delete folder",
          message: `Delete folder “${name}” and all its notes?\n\nThis cannot be undone.`,
          okLabel: "Delete",
          tone: "danger",
        });
        if (ok) dispatch({ type: "DELETE_FOLDER", payload: { id } });
      },
    },
  ];
}
