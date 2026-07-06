"use client";

import { useEffect, useRef, useState } from "react";
import {
  selectFolderProgressDeep,
  selectOverallStats,
  useStore,
} from "../lib/store";
import type { Folder } from "../lib/types";
import { useAuth } from "../lib/auth";
import { deleteAccount } from "../lib/supabase";
import { exportWorkspaceAsJson } from "../lib/export";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  DownloadIcon,
  FolderPlusIcon,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SidebarCloseIcon,
  SidebarOpenIcon,
  SunIcon,
  TrashIcon,
} from "./icons";
import { useTheme } from "../lib/theme";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { useDialog } from "./Dialog";
import { useLoading } from "./LoadingOverlay";

export default function Sidebar() {
  const { state, dispatch, sync, syncError, retrySync } = useStore();
  const { user, signOut } = useAuth();
  const dialog = useDialog();
  const loading = useLoading();
  const { theme, toggle: toggleTheme } = useTheme();
  const [creating, setCreating] = useState<null | { parentId: string | null }>(
    null
  );
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (state.currentFolderId) {
      const ancestors: string[] = [];
      let id: string | null | undefined = state.currentFolderId;
      while (id) {
        ancestors.push(id);
        const f = state.folders.find((x) => x.id === id);
        id = f?.parentId ?? null;
      }
      setOpen((o) => {
        const next = { ...o };
        ancestors.forEach((a) => (next[a] = true));
        return next;
      });
    }
  }, [state.currentFolderId, state.folders]);

  const search = state.search.toLowerCase();
  const overall = selectOverallStats(state);

  // A folder is considered "selected" for the New-Subfolder action when
  // the user is anywhere inside a folder context — folder view OR while
  // editing a note inside that folder.
  const insideFolderContext =
    (state.view === "folder" || state.view === "editor") &&
    !!state.currentFolderId;

  const startCreate = () => {
    const parentId = insideFolderContext ? state.currentFolderId : null;
    if (parentId) setOpen((o) => ({ ...o, [parentId]: true }));
    setCreating({ parentId });
    setNewName("");
  };

  const submitNewFolder = () => {
    if (!creating) return;
    if (!newName.trim()) {
      setCreating(null);
      return;
    }
    dispatch({
      type: "ADD_FOLDER",
      payload: { name: newName, parentId: creating.parentId },
    });
    setNewName("");
    setCreating(null);
  };

  const openContext = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const userLabel = user?.email
    ? user.email.split("@")[0].replace(/[._-]/g, " ")
    : "Workspace";
  const userInitial = (user?.email ?? "V")[0].toUpperCase();

  // Build child lookup once.
  const childrenOf = (parentId: string | null) =>
    state.folders.filter((f) => (f.parentId ?? null) === parentId);

  const folderMatches = (folder: Folder, term: string): boolean => {
    if (!term) return true;
    if (folder.name.toLowerCase().includes(term)) return true;
    const files = state.files.filter((f) => f.folderId === folder.id);
    // Match a file by either its title OR the visible text in its body
    // (strip HTML tags so the search term doesn't get diluted by markup).
    if (
      files.some((f) => {
        if (f.title.toLowerCase().includes(term)) return true;
        const bodyText = (f.content ?? "")
          .replace(/<[^>]+>/g, " ")
          .toLowerCase();
        return bodyText.includes(term);
      })
    )
      return true;
    return childrenOf(folder.id).some((c) => folderMatches(c, term));
  };

  if (collapsed) {
    return (
      <aside className="h-screen w-14 shrink-0 flex flex-col items-center border-r border-[var(--border)] bg-[var(--surface)] py-3">
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
        >
          <SidebarOpenIcon size={16} />
        </button>
        <button
          onClick={() => {
            setCollapsed(false);
            startCreate();
          }}
          aria-label="New folder"
          title="New folder"
          className="mt-2 p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
        >
          <FolderPlusIcon size={16} />
        </button>
        <div className="mt-auto size-9 rounded-full bg-[var(--foreground)] grid place-items-center text-[var(--surface)] text-sm font-semibold">
          {userInitial}
        </div>
      </aside>
    );
  }

  const renderFolder = (folder: Folder, depth: number) => {
    if (!folderMatches(folder, search)) return null;
    const folderFiles = state.files.filter((f) => f.folderId === folder.id);
    const visibleFiles = folderFiles.filter((f) =>
      !search ? true : f.title.toLowerCase().includes(search)
    );
    const subFolders = childrenOf(folder.id);
    const hasChildren = subFolders.length > 0 || folderFiles.length > 0;
    const isOpen = open[folder.id] ?? false;
    const isSelected =
      state.currentFolderId === folder.id && state.view !== "dashboard";
    const { total, done } = selectFolderProgressDeep(state, folder.id);
    return (
      <div key={folder.id} className="mb-0.5">
        <div
          className={`group flex items-center gap-1.5 rounded-lg px-2 py-2 cursor-pointer transition ${
            isSelected
              ? "bg-[var(--surface-2)] text-[var(--foreground)]"
              : "hover:bg-[var(--surface-2)]"
          }`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            setOpen((o) => ({ ...o, [folder.id]: true }));
            // Stay on the current "view" type for whole-app views like
            // Mind map / Planner / Progress so the user can re-scope them
            // without being kicked back to the folder content.
            const keepView =
              state.view === "mindmap" ||
              state.view === "planner" ||
              state.view === "progress"
                ? state.view
                : "folder";
            dispatch({
              type: "SET_VIEW",
              payload: {
                view: keepView,
                folderId: folder.id,
                fileId: null,
              },
            });
          }}
          onContextMenu={(e) =>
            openContext(e, [
              {
                label: "Rename",
                onSelect: async () => {
                  const name = await dialog.prompt({
                    title: "Rename folder",
                    placeholder: "Folder name",
                    defaultValue: folder.name,
                    okLabel: "Rename",
                  });
                  if (name && name.trim())
                    dispatch({
                      type: "RENAME_FOLDER",
                      payload: { id: folder.id, name: name.trim() },
                    });
                },
              },
              {
                label: folder.emoji ? "Change emoji" : "Set emoji",
                onSelect: async () => {
                  const emoji = await dialog.prompt({
                    title: folder.emoji ? "Change emoji" : "Set emoji",
                    message:
                      "Pick a single emoji to mark this folder. Leave empty to remove.",
                    placeholder: "📚",
                    defaultValue: folder.emoji ?? "",
                    okLabel: "Save",
                  });
                  if (emoji === null) return;
                  // Keep only the first grapheme so a stray string can't bloat
                  // the cell — emoji can be multi-codepoint.
                  const trimmed = emoji.trim();
                  const single =
                    [...new Intl.Segmenter().segment(trimmed)][0]?.segment ??
                    "";
                  dispatch({
                    type: "RENAME_FOLDER",
                    payload: {
                      id: folder.id,
                      emoji: single ? single : null,
                    },
                  });
                },
              },
              {
                label: "Delete",
                danger: true,
                onSelect: async () => {
                  const ok = await dialog.confirm({
                    title: "Delete folder",
                    message: `Delete folder “${folder.name}” and all its contents?\n\nThis cannot be undone.`,
                    okLabel: "Delete",
                    tone: "danger",
                  });
                  if (ok)
                    dispatch({
                      type: "DELETE_FOLDER",
                      payload: { id: folder.id },
                    });
                },
              },
            ])
          }
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => ({ ...o, [folder.id]: !isOpen }));
            }}
            className={`shrink-0 grid place-items-center w-4 h-4 text-[var(--muted)] ${
              hasChildren ? "" : "opacity-0 pointer-events-none"
            }`}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? (
              <ChevronDownIcon size={12} />
            ) : (
              <ChevronRightIcon size={12} />
            )}
          </button>
          {folder.emoji ? (
            <span
              className="shrink-0 w-4 grid place-items-center text-[14px] leading-none"
              aria-hidden
            >
              {folder.emoji}
            </span>
          ) : (
            <FolderIcon size={16} className="text-[var(--muted)]" />
          )}
          <span
            className={`text-sm truncate flex-1 ${
              isSelected ? "font-medium" : ""
            }`}
            style={undefined}
          >
            {folder.name}
          </span>
          <span className="text-[11px] text-[var(--muted)] tabular-nums">
            {done}/{total}
          </span>
        </div>
        {isOpen && (
          <>
            {subFolders.map((sub) => renderFolder(sub, depth + 1))}
            {visibleFiles.map((file) => {
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
                        onSelect: async () => {
                          const title = await dialog.prompt({
                            title: "Rename note",
                            placeholder: "Note title",
                            defaultValue: file.title,
                            okLabel: "Rename",
                          });
                          if (title && title.trim())
                            dispatch({
                              type: "RENAME_FILE",
                              payload: { id: file.id, title: title.trim() },
                            });
                        },
                      },
                      {
                        label: "Delete",
                        danger: true,
                        onSelect: async () => {
                          const ok = await dialog.confirm({
                            title: "Delete note",
                            message: `Delete note “${file.title}”?\n\nThis cannot be undone.`,
                            okLabel: "Delete",
                            tone: "danger",
                          });
                          if (ok)
                            dispatch({
                              type: "DELETE_FILE",
                              payload: { id: file.id },
                            });
                        },
                      },
                    ])
                  }
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition ${
                    fileSelected
                      ? "text-[var(--foreground)]"
                      : "hover:bg-[var(--surface-2)]"
                  }`}
                  style={{ paddingLeft: 28 + depth * 14 }}
                >
                  {file.isCompleted ? (
                    <CheckBadge color="var(--foreground)" />
                  ) : (
                    <FileIcon size={12} className="text-[var(--muted)]" />
                  )}
                  <span
                    className={`text-xs truncate ${
                      file.isCompleted ? "text-[var(--muted)]" : ""
                    }`}
                  >
                    {file.title}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  };

  const rootFolders = childrenOf(null);
  // If the user has a folder selected (in any of the folder-scoped views),
  // collapse the sidebar tree to just the *root ancestor* of that folder
  // so other root branches stay out of the way. Falls back to every root
  // when no folder is selected (dashboard, planner, etc.).
  const selectedRoot = (() => {
    if (!state.currentFolderId) return null;
    let cur = state.folders.find((f) => f.id === state.currentFolderId);
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const next = state.folders.find((x) => x.id === cur!.parentId);
      if (!next) break;
      cur = next;
    }
    return cur ?? null;
  })();
  const focusedRoots = selectedRoot ? [selectedRoot] : rootFolders;
  const visibleRoots = focusedRoots.filter((f) => folderMatches(f, search));

  const newFolderLabel = insideFolderContext
    ? "+ New Subfolder"
    : "+ New Folder";

  return (
    <aside className="h-screen w-72 shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] p-3">
      {/* Top icon row — brand on the left, collapse on the right */}
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            dispatch({
              type: "SET_VIEW",
              payload: { view: "dashboard", folderId: null, fileId: null },
            })
          }
          className="flex items-center gap-2 px-1 py-0.5 rounded-lg hover:bg-[var(--surface-2)] transition"
          title="Home"
          aria-label="Home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/NodesMap_Icon.png"
            alt="NodesMap"
            className="size-7 rounded-full object-cover"
          />
          <span className="text-sm font-semibold tracking-tight">
            NodesMap
          </span>
        </button>
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          className="ml-auto p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <SunIcon size={14} /> : <MoonIcon size={14} />}
        </button>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
          title="Collapse sidebar"
        >
          <SidebarCloseIcon size={14} />
        </button>
      </div>

      {/* + New Folder pill */}
      <button
        onClick={startCreate}
        className="mt-3 w-full border border-[var(--border)] rounded-xl py-2.5 text-sm font-medium hover:bg-[var(--surface-2)] transition"
      >
        {newFolderLabel}
      </button>

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
        {visibleRoots.length === 0 && (
          <div className="px-2 py-3 text-xs text-[var(--muted)]">
            No folders yet
          </div>
        )}
        {visibleRoots.map((folder) => renderFolder(folder, 0))}
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
      <div
        ref={settingsRef}
        className="relative mt-2 -mx-1 px-3 py-3 border-t border-[var(--border)] flex items-center gap-3"
      >
        <div className="size-10 rounded-full bg-[var(--foreground)] grid place-items-center text-[var(--surface)] font-semibold shrink-0">
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
            onClick={() => setSettingsOpen((v) => !v)}
            className={`shrink-0 p-2 rounded-lg border transition ${
              settingsOpen
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            aria-label="Account settings"
            aria-expanded={settingsOpen}
            title="Account settings"
          >
            <SettingsIcon size={14} />
          </button>
        )}

        {settingsOpen && user && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg p-1.5 z-20">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <div className="size-8 rounded-full bg-[var(--foreground)] grid place-items-center text-[var(--surface)] text-xs font-semibold shrink-0">
                {userInitial}
              </div>
              <div className="text-sm font-medium truncate capitalize">
                {userLabel}
              </div>
            </div>
            <div className="h-px bg-[var(--border)] my-1" />
            <button
              onClick={() => {
                setSettingsOpen(false);
                exportWorkspaceAsJson(state);
              }}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
            >
              <DownloadIcon size={14} />
              Export workspace (JSON)
            </button>
            <div className="h-px bg-[var(--border)] my-1" />
            <button
              onClick={async () => {
                setSettingsOpen(false);
                const ok = await dialog.confirm({
                  title: "Delete your account?",
                  message:
                    "This will permanently delete EVERYTHING:\n" +
                    "• All your folders\n" +
                    "• All your notes\n" +
                    "• Your progress and account data\n\n" +
                    "This action cannot be undone.",
                  okLabel: "Delete forever",
                  tone: "danger",
                });
                if (!ok) return;
                try {
                  const result = await loading.run(
                    () => deleteAccount(),
                    "Deleting your account…"
                  );
                  // Wipe everything tied to this user from the browser too.
                  try {
                    const keysToDrop: string[] = [];
                    for (let i = 0; i < localStorage.length; i++) {
                      const k = localStorage.key(i);
                      if (!k) continue;
                      if (
                        k.startsWith("noteflow_state_v1") ||
                        k.startsWith("noteflow_onboarded_") ||
                        k.startsWith("file_draft_")
                      ) {
                        keysToDrop.push(k);
                      }
                    }
                    keysToDrop.forEach((k) => localStorage.removeItem(k));
                  } catch {}
                  await loading.run(() => signOut(), "Signing you out…");
                  if (result.authDeleted) {
                    await dialog.alert({
                      title: "Account deleted",
                      message:
                        "Your account and all data have been permanently deleted.",
                    });
                  } else {
                    await dialog.alert({
                      title: "Data deleted",
                      message:
                        "Your data has been deleted and you've been signed out.\n\n" +
                        "The account record itself could not be removed automatically — DM @NodesMap on X (https://x.com/NodesMap) to confirm full deletion of the auth record.",
                    });
                  }
                } catch (e) {
                  await dialog.alert({
                    title: "Could not delete account",
                    message:
                      (e instanceof Error ? e.message : String(e)) +
                      "\n\nDM @NodesMap on X (https://x.com/NodesMap) for help.",
                    tone: "danger",
                  });
                }
              }}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-[var(--danger)] hover:bg-[var(--surface-2)] transition"
            >
              <TrashIcon size={14} />
              Delete account
            </button>
            <button
              onClick={async () => {
                setSettingsOpen(false);
                const ok = await dialog.confirm({
                  title: "Sign out of NodesMap?",
                  message: "You'll need to sign in again to continue.",
                  okLabel: "Sign out",
                });
                if (!ok) return;
                await loading.run(() => signOut(), "Signing you out…");
              }}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
            >
              <LogOutIcon size={14} />
              Logout
            </button>
          </div>
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

      {creating && (
        <CreateFolderModal
          parentFolder={
            creating.parentId
              ? state.folders.find((f) => f.id === creating.parentId) ?? null
              : null
          }
          name={newName}
          onName={setNewName}
          onCancel={() => {
            setCreating(null);
            setNewName("");
          }}
          onSubmit={submitNewFolder}
        />
      )}
    </aside>
  );
}

/* ---------------------- Create-folder modal ---------------------- */

function CreateFolderModal({
  parentFolder,
  name,
  onName,
  onCancel,
  onSubmit,
}: {
  parentFolder: Folder | null;
  name: string;
  onName: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  const isSub = !!parentFolder;
  const canSubmit = name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl modal-pop flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isSub ? "New subfolder" : "New folder"}
      >
        <header className="shrink-0 px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold tracking-tight">
            {isSub ? "New subfolder" : "New folder"}
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5 truncate">
            {isSub
              ? `Will be created inside ${parentFolder!.name}`
              : "Will be created at the root"}
          </p>
        </header>

        <div className="px-6 py-5">
          <label className="block">
            <span className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              Folder name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => onName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) onSubmit();
              }}
              placeholder={isSub ? "Subfolder name" : "Folder name"}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </label>
        </div>

        <div className="shrink-0 px-6 py-3 border-t border-[var(--border)] flex items-center gap-2 justify-end rounded-b-3xl">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--foreground)] text-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <FolderPlusIcon size={13} />
            {isSub ? "Create subfolder" : "Create folder"}
          </button>
        </div>
      </div>
    </div>
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
