"use client";

import { useStore } from "../lib/store";
import { CalendarIcon, ChartIcon, FlameIcon, NetworkIcon } from "./icons";

export default function TopBar() {
  const { state, dispatch } = useStore();
  const folder = state.folders.find((f) => f.id === state.currentFolderId);
  const file = state.files.find((f) => f.id === state.currentFileId);

  const goFolder = (id: string) =>
    dispatch({
      type: "SET_VIEW",
      payload: { view: "folder", folderId: id, fileId: null },
    });
  const goDashboard = () =>
    dispatch({
      type: "SET_VIEW",
      payload: { view: "dashboard", folderId: null, fileId: null },
    });

  const parentLink = (name: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="text-[var(--muted)] hover:text-[var(--foreground)] transition shrink-0 truncate"
    >
      {name}
    </button>
  );

  const sep = <span className="text-[var(--muted)] shrink-0">/</span>;

  // Two-segment breadcrumb: <parent> / <current>. Tapping the parent
  // moves up exactly one level instead of jumping to Home.
  let crumbs: React.ReactNode = (
    <button
      onClick={goDashboard}
      className="text-base font-medium text-[var(--foreground)] truncate"
    >
      Home
    </button>
  );

  if (state.view === "folder" && folder) {
    const parent = folder.parentId
      ? state.folders.find((x) => x.id === folder.parentId) ?? null
      : null;
    crumbs = (
      <div className="flex items-center gap-1.5 min-w-0 text-base">
        {parent
          ? parentLink(parent.name, () => goFolder(parent.id))
          : parentLink("Home", goDashboard)}
        {sep}
        <span className="font-medium text-[var(--foreground)] truncate">
          {folder.name}
        </span>
      </div>
    );
  } else if (state.view === "editor" && folder && file) {
    crumbs = (
      <div className="flex items-center gap-1.5 min-w-0 text-base">
        {parentLink(folder.name, () => goFolder(folder.id))}
        {sep}
        <span className="font-medium text-[var(--foreground)] truncate">
          {file.title}
        </span>
      </div>
    );
  } else if (state.view === "progress") {
    crumbs = (
      <span className="text-base font-medium truncate">Progress</span>
    );
  } else if (state.view === "mindmap") {
    crumbs = (
      <span className="text-base font-medium truncate">Mind map</span>
    );
  } else if (state.view === "planner") {
    crumbs = (
      <span className="text-base font-medium truncate">Planner</span>
    );
  }

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur">
      <div className="min-w-0 flex-1">{crumbs}</div>

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {state.streak.count > 0 && (
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)] text-xs text-[var(--muted)]"
            title={`Current streak: ${state.streak.count} day${
              state.streak.count === 1 ? "" : "s"
            }`}
          >
            <FlameIcon size={13} />
            <span className="tabular-nums">{state.streak.count}</span>
          </span>
        )}
        <button
          onClick={() =>
            dispatch({ type: "SET_VIEW", payload: { view: "planner" } })
          }
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
        >
          <CalendarIcon size={16} /> Planner
        </button>
        <button
          onClick={() =>
            dispatch({ type: "SET_VIEW", payload: { view: "progress" } })
          }
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
        >
          <ChartIcon size={16} /> Progress
        </button>
        <button
          onClick={() =>
            dispatch({ type: "SET_VIEW", payload: { view: "mindmap" } })
          }
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
        >
          <NetworkIcon size={16} /> Mind map
        </button>
      </div>
    </div>
  );
}
