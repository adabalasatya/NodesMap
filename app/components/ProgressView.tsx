"use client";

import {
  selectFolderProgress,
  selectOverallStats,
  useStore,
} from "../lib/store";
import { FlameIcon } from "./icons";

export default function ProgressView() {
  const { state, dispatch } = useStore();
  const stats = selectOverallStats(state);

  return (
    <div className="p-8 fade-in max-w-5xl">
      <header className="mb-6 flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Your Progress
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2">
            You&apos;ve completed {stats.done} of {stats.total} files across{" "}
            {state.folders.length} folder
            {state.folders.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-500 text-sm">
          <FlameIcon size={14} />
          {state.streak.count} day{state.streak.count === 1 ? "" : "s"} streak
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Files done" value={stats.done} />
        <Stat label="Remaining" value={stats.remaining} />
        <Stat label="Folders done" value={stats.foldersCompleted} />
        <Stat
          label="Overall"
          value={`${stats.pct}%`}
          accent="var(--success)"
        />
      </section>

      <section className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Overall completion</div>
          <div className="text-sm font-semibold tabular-nums">
            {stats.pct}%
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${stats.pct}%`, background: "var(--success)" }}
          />
        </div>
      </section>

      <section className="space-y-4">
        {state.folders.length === 0 && (
          <div className="text-sm text-[var(--muted)]">
            No folders yet. Create one from the sidebar.
          </div>
        )}
        {state.folders.map((folder) => {
          const { total, done, pct } = selectFolderProgress(state, folder.id);
          const files = state.files.filter((f) => f.folderId === folder.id);
          return (
            <div
              key={folder.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() =>
                    dispatch({
                      type: "SET_VIEW",
                      payload: { view: "folder", folderId: folder.id },
                    })
                  }
                  className="font-semibold hover:underline"
                  style={{ color: folder.color }}
                >
                  {folder.name}
                </button>
                <div
                  className="ml-auto text-sm font-medium tabular-nums"
                  style={{ color: folder.color }}
                >
                  {done}/{total} · {pct}%
                </div>
              </div>
              <div className="w-full h-1 rounded-full bg-[var(--surface-2)] overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${pct}%`, background: folder.color }}
                />
              </div>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((f) => (
                    <button
                      key={f.id}
                      onClick={() =>
                        dispatch({
                          type: "TOGGLE_FILE_DONE",
                          payload: { id: f.id },
                        })
                      }
                      className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition ${
                        f.isCompleted
                          ? "border-[var(--success)]/30 text-[var(--success)] bg-[var(--success)]/5"
                          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30"
                      }`}
                      title={
                        f.isCompleted
                          ? "Click to mark not done"
                          : "Click to mark done"
                      }
                    >
                      <span
                        className="inline-block size-1.5 rounded-full"
                        style={{
                          background: f.isCompleted
                            ? "var(--success)"
                            : "var(--muted)",
                        }}
                      />
                      <span
                        className={
                          f.isCompleted ? "" : ""
                        }
                      >
                        {f.title.replace(/\.md$/i, "")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div
        className="text-3xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      <div className="text-xs text-[var(--muted)] mt-1">{label}</div>
    </div>
  );
}
