"use client";

import { useStore } from "../lib/store";
import { ChartIcon, NetworkIcon } from "./icons";

export default function TopBar() {
  const { state, dispatch } = useStore();
  const folder = state.folders.find((f) => f.id === state.currentFolderId);
  const file = state.files.find((f) => f.id === state.currentFileId);

  let title: React.ReactNode = "All folders";
  if (state.view === "folder" && folder) title = folder.name;
  if (state.view === "editor" && folder && file)
    title = (
      <>
        <span className="text-[var(--muted)]">{folder.name}</span>
        <span className="mx-1 text-[var(--muted)]">/</span>
        <span className="font-semibold">{file.title}</span>
      </>
    );
  if (state.view === "progress") title = "Progress";
  if (state.view === "mindmap") title = "Mind map";

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur">
      <button
        className="text-base text-[var(--muted)] hover:text-[var(--foreground)] transition truncate"
        onClick={() =>
          dispatch({
            type: "SET_VIEW",
            payload: { view: "dashboard", folderId: null, fileId: null },
          })
        }
      >
        {title}
      </button>

      <div className="ml-auto flex items-center gap-2">
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
