"use client";

import { useEffect, useState } from "react";
import {
  selectFolderProgress,
  selectOverallStats,
  useStore,
} from "../lib/store";
import { useAuth } from "../lib/auth";
import {
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  GridIcon,
  ListIcon,
  LogOutIcon,
  SearchIcon,
} from "./icons";
import ContextMenu, { type MenuItem } from "./ContextMenu";

export default function Sidebar() {
  const { state, dispatch, sync, syncError, retrySync } = useStore();
  const { user, signOut } = useAuth();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  useEffect(() => {
    if (state.currentFolderId) {
      setOpen((o) => ({ ...o, [state.currentFolderId!]: true }));
    }
  }, [state.currentFolderId]);

  const search = state.search.toLowerCase();
  const visibleFolders = state.folders.filter((f) =>
    !search ? true : f.name.toLowerCase().includes(search)
  );
  const overall = selectOverallStats(state);

  const submitNewFolder = () => {
    if (!newName.trim()) {
      setCreating(false);
      return;
    }
    dispatch({ type: "ADD_FOLDER", payload: { name: newName } });
    setNewName("");
    setCreating(false);
  };

  const openContext = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const userLabel = user?.email
    ? user.email.split("@")[0].replace(/[._-]/g, " ")
    : "Workspace";
  const userInitial = (user?.email ?? "V")[0].toUpperCase();

  return (
    <aside className="h-screen w-72 shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] p-3">
      {/* Top icon row */}
      <div className="flex items-center gap-1.5">
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          <button
            aria-label="Grid view"
            onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "grid" })}
            className={`p-1.5 rounded-md transition ${
              state.viewMode === "grid"
                ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <GridIcon size={14} />
          </button>
          <button
            aria-label="List view"
            onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "list" })}
            className={`p-1.5 rounded-md transition ${
              state.viewMode === "list"
                ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <ListIcon size={14} />
          </button>
        </div>
        <button
          onClick={() => setCreating(true)}
          aria-label="New folder"
          className="ml-auto p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
          title="New folder"
        >
          <FolderPlusIcon size={14} />
        </button>
      </div>

      {/* + New Folder pill */}
      <button
        onClick={() => setCreating(true)}
        className="mt-3 w-full border border-[var(--border)] rounded-xl py-2.5 text-sm font-medium hover:bg-[var(--surface-2)] transition"
      >
        + New Folder
      </button>

      {/* Inline folder name input */}
      {creating && (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={submitNewFolder}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNewFolder();
            if (e.key === "Escape") {
              setCreating(false);
              setNewName("");
            }
          }}
          placeholder="Folder name"
          className="mt-2 w-full bg-[var(--surface-2)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      )}

      {/* Search (icon on right) */}
      <div className="mt-3 relative">
        <input
          value={state.search}
          onChange={(e) =>
            dispatch({ type: "SET_SEARCH", payload: e.target.value })
          }
          placeholder="Search…"
          className="w-full bg-transparent border border-[var(--border)] rounded-lg pl-3 pr-9 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <SearchIcon
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
        />
      </div>

      {/* Folder tree */}
      <div className="mt-4 flex-1 overflow-y-auto -mx-1 px-1">
        {visibleFolders.length === 0 && (
          <div className="px-2 py-3 text-xs text-[var(--muted)]">
            No folders yet
          </div>
        )}
        {visibleFolders.map((folder) => {
          const folderFiles = state.files.filter(
            (f) => f.folderId === folder.id
          );
          const visibleFiles = folderFiles.filter((f) =>
            !search ? true : f.title.toLowerCase().includes(search)
          );
          const isOpen = open[folder.id] ?? false;
          const isSelected =
            state.currentFolderId === folder.id && state.view !== "dashboard";
          const { total, done } = selectFolderProgress(state, folder.id);
          return (
            <div key={folder.id} className="mb-0.5">
              <div
                className={`group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition ${
                  isSelected
                    ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                    : "hover:bg-[var(--surface-2)]"
                }`}
                onClick={() => {
                  setOpen((o) => ({ ...o, [folder.id]: true }));
                  dispatch({
                    type: "SET_VIEW",
                    payload: {
                      view: "folder",
                      folderId: folder.id,
                      fileId: null,
                    },
                  });
                }}
                onContextMenu={(e) =>
                  openContext(e, [
                    {
                      label: isOpen ? "Collapse" : "Expand",
                      onSelect: () =>
                        setOpen((o) => ({ ...o, [folder.id]: !isOpen })),
                    },
                    {
                      label: "Rename",
                      onSelect: () => {
                        const name = prompt("Rename folder", folder.name);
                        if (name)
                          dispatch({
                            type: "RENAME_FOLDER",
                            payload: { id: folder.id, name },
                          });
                      },
                    },
                    {
                      label: "Delete",
                      danger: true,
                      onSelect: () => {
                        if (
                          confirm(
                            `Delete folder "${folder.name}" and all its notes?`
                          )
                        )
                          dispatch({
                            type: "DELETE_FOLDER",
                            payload: { id: folder.id },
                          });
                      },
                    },
                  ])
                }
              >
                <FolderIcon size={16} style={{ color: folder.color }} />
                <span
                  className={`text-sm truncate flex-1 ${
                    isSelected ? "font-medium" : ""
                  }`}
                  style={isSelected ? { color: folder.color } : undefined}
                >
                  {folder.name}
                </span>
                <span className="text-[11px] text-[var(--muted)] tabular-nums">
                  {done}/{total}
                </span>
              </div>
              {isOpen &&
                visibleFiles.map((file) => {
                  const fileSelected = state.currentFileId === file.id;
                  return (
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
                      onContextMenu={(e) =>
                        openContext(e, [
                          {
                            label: file.isCompleted
                              ? "Mark not done"
                              : "Mark as done",
                            onSelect: () =>
                              dispatch({
                                type: "TOGGLE_FILE_DONE",
                                payload: { id: file.id },
                              }),
                          },
                          {
                            label: "Rename",
                            onSelect: () => {
                              const title = prompt("Rename note", file.title);
                              if (title)
                                dispatch({
                                  type: "RENAME_FILE",
                                  payload: { id: file.id, title },
                                });
                            },
                          },
                          {
                            label: "Delete",
                            danger: true,
                            onSelect: () => {
                              if (confirm(`Delete note "${file.title}"?`))
                                dispatch({
                                  type: "DELETE_FILE",
                                  payload: { id: file.id },
                                });
                            },
                          },
                        ])
                      }
                      className={`ml-6 flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition ${
                        fileSelected
                          ? "text-[var(--foreground)]"
                          : "hover:bg-[var(--surface-2)]"
                      }`}
                      style={
                        fileSelected ? { color: folder.color } : undefined
                      }
                    >
                      {file.isCompleted ? (
                        <CheckBadge color={folder.color} />
                      ) : (
                        <FileIcon size={12} className="text-[var(--muted)]" />
                      )}
                      <span
                        className={`text-xs truncate ${
                          file.isCompleted
                            ? "line-through text-[var(--muted)]"
                            : ""
                        }`}
                      >
                        {file.title}
                      </span>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {/* Sync status (compact) */}
      {sync !== "offline" && sync !== "connected" && (
        <div className="text-[10px] flex items-center gap-1.5 px-1 mb-1 text-[var(--muted)]">
          <SyncDot status={sync} />
          <span className="flex-1 truncate">
            {sync === "syncing" && "Syncing…"}
            {sync === "connecting" && "Connecting…"}
            {sync === "error" && (syncError ?? "Sync error")}
          </span>
          {sync === "error" && (
            <button
              onClick={retrySync}
              className="underline hover:text-[var(--foreground)]"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Bottom user card */}
      <div className="mt-2 -mx-1 px-3 py-3 border-t border-[var(--border)] flex items-center gap-3">
        <div className="size-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-purple-500 grid place-items-center text-white font-semibold shrink-0">
          {userInitial}
        </div>
        <div className="leading-tight min-w-0 flex-1">
          <div className="text-sm font-semibold truncate capitalize">
            {userLabel}
          </div>
          <div className="text-[11px] text-[var(--muted)] tabular-nums">
            {overall.done} / {overall.total} completed
          </div>
        </div>
        {user && (
          <button
            onClick={() => {
              if (confirm("Sign out of NoteFlow?")) signOut();
            }}
            className="shrink-0 p-2 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 transition"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOutIcon size={14} />
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
    </aside>
  );
}

function CheckBadge({ color }: { color: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24">
      <circle
        cx={12}
        cy={12}
        r={9}
        fill="none"
        stroke={color}
        strokeWidth={2}
        opacity={0.6}
      />
      <path
        d="M8 12l3 3 5-6"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SyncDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "var(--success)"
      : status === "syncing" || status === "connecting"
      ? "var(--accent)"
      : status === "error"
      ? "var(--danger)"
      : "var(--muted)";
  return (
    <span
      className="inline-block size-1.5 rounded-full"
      style={{ background: color }}
    />
  );
}
