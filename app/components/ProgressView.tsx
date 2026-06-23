"use client";

import {
  selectFolderProgressDeep,
  selectOverallStats,
  useStore,
} from "../lib/store";
import { ChevronLeftIcon, FlameIcon } from "./icons";
import type { Folder } from "../lib/types";

export default function ProgressView() {
  const { state, dispatch } = useStore();
  const stats = selectOverallStats(state);
  const rootFolders = state.folders.filter((f) => !f.parentId);

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

  return (
    <div className="p-6 fade-in max-w-3xl mx-auto">
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
            <p className="text-sm text-[var(--muted)] mt-1.5">
              {stats.done} of {stats.total} files across {rootFolders.length}{" "}
              folder{rootFolders.length === 1 ? "" : "s"}
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
              {stats.pct}%
            </div>
            <div className="text-sm text-[var(--muted)] pb-1">
              overall completion
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${stats.pct}%`,
                background: "var(--foreground)",
              }}
            />
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3 mb-8">
          <StatCard value={stats.done} label="Files completed" />
          <StatCard value={stats.remaining} label="Remaining" />
          <StatCard value={stats.foldersCompleted} label="Folders done" />
        </section>

        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
            By folder
          </div>
          {rootFolders.length === 0 && (
            <div className="text-sm text-[var(--muted)] py-6 text-center">
              No folders yet. Create one from the sidebar.
            </div>
          )}
          <div className="flex flex-col gap-1">
            {rootFolders.map((folder, i) => {
              const p = selectFolderProgressDeep(state, folder.id);
              const complete = p.total > 0 && p.done === p.total;
              return (
                <FolderRow
                  key={folder.id}
                  index={i + 1}
                  folder={folder}
                  done={p.done}
                  total={p.total}
                  pct={p.pct}
                  complete={complete}
                  onOpen={() =>
                    dispatch({
                      type: "SET_VIEW",
                      payload: { view: "folder", folderId: folder.id },
                    })
                  }
                />
              );
            })}
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

function FolderRow({
  index,
  folder,
  done,
  total,
  pct,
  complete,
  onOpen,
}: {
  index: number;
  folder: Folder;
  done: number;
  total: number;
  pct: number;
  complete: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
        complete
          ? "bg-[var(--surface-2)]"
          : "hover:bg-[var(--surface-2)]"
      }`}
    >
      <span
        className={`size-2.5 rounded-full shrink-0 ${
          complete
            ? "bg-[var(--foreground)]"
            : "border border-[var(--muted)]/60"
        }`}
        aria-hidden
      />
      <span
        className={`text-sm font-medium min-w-[140px] max-w-[200px] truncate ${
          complete ? "line-through text-[var(--muted)]" : ""
        }`}
      >
        <span className="text-[var(--muted)] tabular-nums">
          {String(index).padStart(2, "0")}.
        </span>{" "}
        {folder.name}
      </span>
      <div className="flex-1 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            background: complete
              ? "var(--muted)"
              : "var(--foreground)",
          }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums w-12 text-right shrink-0">
        {pct}%
      </span>
      <span className="text-xs text-[var(--muted)] tabular-nums w-10 text-right shrink-0">
        {done}/{total}
      </span>
    </button>
  );
}
