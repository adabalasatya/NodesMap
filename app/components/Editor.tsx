"use client";

import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { ArrowDownIcon, CheckIcon, ChevronLeftIcon, TrashIcon } from "./icons";

export default function Editor() {
  const { state, dispatch } = useStore();
  const file = state.files.find((f) => f.id === state.currentFileId);
  const folder = state.folders.find((f) => f.id === state.currentFolderId);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, [file?.id]);

  if (!file || !folder) {
    return (
      <div className="p-8 fade-in">
        <button
          onClick={() =>
            dispatch({
              type: "SET_VIEW",
              payload: { view: "dashboard", folderId: null, fileId: null },
            })
          }
          className="text-sm text-[var(--muted)] flex items-center gap-1"
        >
          <ChevronLeftIcon size={14} /> Back
        </button>
        <p className="mt-4 text-[var(--muted)]">Note not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full fade-in">
      <div className="px-8 pt-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() =>
              dispatch({
                type: "SET_VIEW",
                payload: { view: "folder", fileId: null },
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
          >
            <ChevronLeftIcon size={14} /> Files
          </button>
          <input
            value={file.title}
            onChange={(e) =>
              dispatch({
                type: "UPDATE_FILE",
                payload: { id: file.id, title: e.target.value },
              })
            }
            className={`mx-auto bg-transparent text-lg font-semibold outline-none text-center max-w-md min-w-0 ${
              file.isCompleted ? "line-through text-[var(--muted)]" : ""
            }`}
          />
          <button
            onClick={() =>
              dispatch({ type: "TOGGLE_FILE_DONE", payload: { id: file.id } })
            }
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition ${
              file.isCompleted
                ? "border-[var(--success)]/40 text-[var(--success)] bg-[var(--success)]/10"
                : "border-[var(--border)] hover:bg-[var(--surface-2)]"
            }`}
          >
            <CheckIcon size={14} />
            {file.isCompleted ? "Completed" : "Mark done"}
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete note "${file.title}"?`))
                dispatch({ type: "DELETE_FILE", payload: { id: file.id } });
            }}
            className="p-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--danger)] transition"
            aria-label="Delete note"
            title="Delete"
          >
            <TrashIcon size={14} />
          </button>
        </div>

        <div
          className="h-0.5 w-full rounded-full"
          style={{ background: folder.color, opacity: 0.7 }}
        />
      </div>

      <textarea
        ref={taRef}
        value={file.content}
        onChange={(e) =>
          dispatch({
            type: "UPDATE_FILE",
            payload: { id: file.id, content: e.target.value },
          })
        }
        spellCheck={false}
        placeholder="Start writing..."
        className="font-mono text-sm leading-7 flex-1 px-8 pt-6 pb-12 bg-transparent outline-none resize-none placeholder:text-[var(--muted)]"
      />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[var(--muted)] opacity-60 pointer-events-none">
        <ArrowDownIcon size={18} />
      </div>
    </div>
  );
}
