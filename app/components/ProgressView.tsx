"use client";

import { useState } from "react";
import {
  selectFolderProgressDeep,
  selectOverallStats,
  useStore,
} from "../lib/store";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  FlameIcon,
} from "./icons";
import type { AppState } from "../lib/store";
import type { Folder, NoteFile } from "../lib/types";

export default function ProgressView() {
  const { state, dispatch } = useStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Always report for the topmost ancestor of the currently-open folder.
  // Opening Progress from Kotlin or Basics should still show Android.
  const rootAncestor = (() => {
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

  const currentFolder = rootAncestor;

  const scopeFolders = currentFolder
    ? state.folders.filter((f) => f.parentId === currentFolder.id)
    : state.folders.filter((f) => !f.parentId);

  const overall = currentFolder
    ? selectFolderProgressDeep(state, currentFolder.id)
    : (() => {
        const s = selectOverallStats(state);
        return { done: s.done, total: s.total, pct: s.pct };
      })();

  const remaining = Math.max(0, overall.total - overall.done);
  const foldersDone = scopeFolders.filter((f) => {
    const p = selectFolderProgressDeep(state, f.id);
    return p.total > 0 && p.done === p.total;
  }).length;

  const subtitle = currentFolder
    ? `${overall.done} of ${overall.total} files in ${currentFolder.name}`
    : `${overall.done} of ${overall.total} files across ${scopeFolders.length} folder${
        scopeFolders.length === 1 ? "" : "s"
      }`;

  const subListLabel = currentFolder ? "Sub-folders" : "By folder";

  const goBack = () => {
    if (state.currentFolderId) {
      dispatch({
        type: "SET_VIEW",
        payload: {
          view: "folder",
          folderId: state.currentFolderId,
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

  const toggle = (id: string) =>
    setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const openFile = (folderId: string, fileId: string) =>
    dispatch({
      type: "SET_VIEW",
      payload: { view: "editor", folderId, fileId },
    });

  return (
    <div className="p-6 fade-in">
      <div className="mb-4">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
        >
          <ChevronLeftIcon size={14} /> Back
        </button>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
        <header className="flex items-start justify-between gap-4 mb-7">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Progress</h1>
            <p className="text-sm text-[var(--muted)] mt-1.5 truncate">
              {subtitle}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)] text-sm text-[var(--muted)] shrink-0">
            <FlameIcon size={13} />
            <span className="tabular-nums">{state.streak.count}</span> day
            {state.streak.count === 1 ? "" : "s"} streak
          </div>
        </header>

        <section className="mb-7">
          <div className="flex items-end justify-between mb-3">
            <div className="text-6xl font-bold tabular-nums leading-none">
              {overall.pct}%
            </div>
            <div className="text-sm text-[var(--muted)] pb-1">
              overall completion
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${overall.pct}%`,
                background: "var(--foreground)",
              }}
            />
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3 mb-8">
          <StatCard value={overall.done} label="Files completed" />
          <StatCard value={remaining} label="Remaining" />
          <StatCard value={foldersDone} label="Folders done" />
        </section>

        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
            {subListLabel}
          </div>
          {scopeFolders.length === 0 && (
            <div className="text-sm text-[var(--muted)] py-6 text-center">
              {currentFolder
                ? "No sub-folders in this folder yet."
                : "No folders yet. Create one from the sidebar."}
            </div>
          )}
          <div className="flex flex-col">
            {scopeFolders.map((folder, i) => (
              <FolderTreeRow
                key={folder.id}
                folder={folder}
                state={state}
                depth={0}
                index={i + 1}
                expanded={expanded}
                toggle={toggle}
                openFile={openFile}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] px-5 py-4">
      <div className="text-3xl font-bold tabular-nums leading-none mb-2">
        {value}
      </div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}

function FolderTreeRow({
  folder,
  state,
  depth,
  index,
  expanded,
  toggle,
  openFile,
}: {
  folder: Folder;
  state: AppState;
  depth: number;
  index: number;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  openFile: (folderId: string, fileId: string) => void;
}) {
  const childFolders = state.folders.filter((f) => f.parentId === folder.id);
  const childFiles = state.files.filter((f) => f.folderId === folder.id);
  const hasChildren = childFolders.length > 0 || childFiles.length > 0;
  const isOpen = !!expanded[folder.id];
  const p = selectFolderProgressDeep(state, folder.id);
  const complete = p.total > 0 && p.done === p.total;

  const indent = depth * 18;

  return (
    <>
      <button
        type="button"
        onClick={() => hasChildren && toggle(folder.id)}
        className={`group flex items-center gap-2 rounded-xl py-3 pr-4 text-left transition w-full ${
          complete ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"
        } ${hasChildren ? "cursor-pointer" : "cursor-default"}`}
        style={{ paddingLeft: 16 + indent }}
        aria-expanded={isOpen}
      >
        <span
          className={`shrink-0 grid place-items-center size-5 rounded transition ${
            hasChildren
              ? "text-[var(--muted)] group-hover:text-[var(--foreground)]"
              : "opacity-0"
          }`}
          aria-hidden
        >
          {isOpen ? (
            <ChevronDownIcon size={12} />
          ) : (
            <ChevronRightIcon size={12} />
          )}
        </span>
        <span
          className={`size-2.5 rounded-full shrink-0 ${
            complete
              ? "bg-[var(--foreground)]"
              : "border border-[var(--muted)]/60"
          }`}
          aria-hidden
        />
        <span
          className={`text-sm font-medium min-w-[160px] max-w-[260px] truncate ${
            complete ? "text-[var(--muted)]" : ""
          }`}
        >
          <span className="text-[var(--muted)] tabular-nums">
            {String(index).padStart(2, "0")}.
          </span>{" "}
          {folder.name}
        </span>
        <span className="flex-1 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <span
            className="block h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${p.pct}%`,
              background: complete ? "var(--muted)" : "var(--foreground)",
            }}
          />
        </span>
        <span className="text-xs text-[var(--muted)] tabular-nums w-10 text-right shrink-0">
          {p.done}/{p.total}
        </span>
      </button>

      {isOpen && (
        <>
          {childFolders.map((sub, i) => (
            <FolderTreeRow
              key={sub.id}
              folder={sub}
              state={state}
              depth={depth + 1}
              index={i + 1}
              expanded={expanded}
              toggle={toggle}
              openFile={openFile}
            />
          ))}
          {childFiles.map((file) => (
            <FileTreeRow
              key={file.id}
              file={file}
              depth={depth + 1}
              onOpen={() => openFile(folder.id, file.id)}
            />
          ))}
        </>
      )}
    </>
  );
}

function FileTreeRow({
  file,
  depth,
  onOpen,
}: {
  file: NoteFile;
  depth: number;
  onOpen: () => void;
}) {
  const indent = depth * 18;
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 rounded-xl py-2 pr-4 text-left hover:bg-[var(--surface-2)] transition"
      style={{ paddingLeft: 16 + indent + 24 }}
    >
      {file.isCompleted ? (
        <span
          className="shrink-0 grid place-items-center size-4 rounded-full bg-[var(--foreground)] text-[var(--surface)]"
          aria-hidden
        >
          <CheckIcon size={10} />
        </span>
      ) : (
        <FileIcon
          size={12}
          className="shrink-0 text-[var(--muted)]"
        />
      )}
      <span
        className={`text-sm truncate flex-1 ${
          file.isCompleted ? "text-[var(--muted)]" : ""
        }`}
      >
        {file.title.replace(/\.md$/i, "")}
      </span>
    </button>
  );
}
