"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { taskDoneOn, taskShowsOn, useStore } from "../lib/store";
import type { RepeatKind, Task } from "../lib/types";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
} from "./icons";

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

const TODAY = () => ymd(new Date());

export default function PlannerView() {
  const { state, dispatch } = useStore();
  const [selectedDate, setSelectedDate] = useState<string>(() => TODAY());
  const [stripStart, setStripStart] = useState<string>(() => {
    // Start the strip on the Sunday of the current week so each "page" of
    // the strip lines up cleanly with calendar weeks.
    const t = new Date();
    t.setDate(t.getDate() - t.getDay());
    return ymd(t);
  });
  const [adding, setAdding] = useState(false);

  const STRIP_DAYS = 7;
  const stripDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < STRIP_DAYS; i++) dates.push(shiftDays(stripStart, i));
    return dates;
  }, [stripStart]);

  const shownTasks = useMemo(
    () => state.tasks.filter((t) => taskShowsOn(t, selectedDate)),
    [state.tasks, selectedDate]
  );

  const incomplete = shownTasks.filter((t) => !taskDoneOn(t, selectedDate));
  const completed = shownTasks.filter((t) => taskDoneOn(t, selectedDate));

  const monthLabel = (() => {
    const d = parseYmd(selectedDate);
    return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  })();

  const goBack = () =>
    dispatch({
      type: "SET_VIEW",
      payload: { view: "dashboard", folderId: null, fileId: null },
    });

  const todayCount = shownTasks.length;
  const doneCount = completed.length;

  const headerLabel = selectedDate === TODAY() ? "Today" : (() => {
    const d = parseYmd(selectedDate);
    return `${DAY_LABELS[d.getDay()].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
  })();

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

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--border)]">
          <h1 className="text-3xl font-bold tracking-tight">Planner</h1>
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
          >
            <PlusIcon size={14} /> Add task
          </button>
        </div>

        {/* Date strip */}
        <div className="px-8 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-base font-semibold">{monthLabel}</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStripStart((s) => shiftDays(s, -7))}
                className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
                aria-label="Previous week"
              >
                <ChevronLeftIcon size={14} />
              </button>
              <button
                onClick={() => setStripStart((s) => shiftDays(s, 7))}
                className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
                aria-label="Next week"
              >
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
          <div className="flex gap-2 w-full">
            {stripDates.map((d) => {
              const date = parseYmd(d);
              const dow = DAY_LABELS[date.getDay()];
              const dayNum = date.getDate();
              const isSelected = d === selectedDate;
              const hasTasks = state.tasks.some((t) => taskShowsOn(t, d));
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`flex-1 min-w-0 h-16 flex flex-col items-center justify-center rounded-2xl border transition relative ${
                    isSelected
                      ? "bg-[var(--foreground)] text-[var(--surface)] border-[var(--foreground)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <span
                    className={`text-[10px] tracking-wider ${
                      isSelected
                        ? "text-[var(--surface)]/80"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {dow}
                  </span>
                  <span className="text-lg font-semibold tabular-nums leading-none mt-1">
                    {dayNum}
                  </span>
                  {hasTasks && (
                    <span
                      className={`absolute bottom-1.5 size-1 rounded-full ${
                        isSelected
                          ? "bg-[var(--surface)]"
                          : "bg-[var(--muted)]"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tasks */}
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-base font-semibold">{headerLabel}</div>
            <div className="text-sm text-[var(--muted)] tabular-nums">
              {doneCount}/{todayCount} done
            </div>
          </div>

          {todayCount === 0 && !adding && (
            <div className="rounded-2xl border border-dashed border-[var(--border)] py-10 text-center text-sm text-[var(--muted)]">
              Nothing scheduled. Tap “Add task” to plan something.
            </div>
          )}

          <div className="flex flex-col gap-2">
            {incomplete.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                date={selectedDate}
                done={false}
                onToggle={() =>
                  dispatch({
                    type: "TOGGLE_TASK_DONE",
                    payload: { id: task.id, date: selectedDate },
                  })
                }
                onDelete={() =>
                  dispatch({ type: "DELETE_TASK", payload: { id: task.id } })
                }
              />
            ))}
          </div>

          {completed.length > 0 && (
            <>
              <div className="flex items-center gap-3 my-5">
                <span className="h-px flex-1 bg-[var(--border)]" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                  Completed
                </span>
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <div className="flex flex-col gap-2">
                {completed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    date={selectedDate}
                    done
                    onToggle={() =>
                      dispatch({
                        type: "TOGGLE_TASK_DONE",
                        payload: { id: task.id, date: selectedDate },
                      })
                    }
                    onDelete={() =>
                      dispatch({
                        type: "DELETE_TASK",
                        payload: { id: task.id },
                      })
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {adding && (
        <AddTaskModal
          defaultDate={selectedDate}
          onClose={() => setAdding(false)}
          onSubmit={(p) => {
            dispatch({ type: "ADD_TASK", payload: p });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

/* ----------------------- Add task modal ----------------------- */

function AddTaskModal({
  defaultDate,
  onClose,
  onSubmit,
}: {
  defaultDate: string;
  onClose: () => void;
  onSubmit: (p: {
    title: string;
    startDate: string;
    time?: string;
    repeat: RepeatKind;
    linkedFileId?: string | null;
    linkedFolderId?: string | null;
  }) => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    // Lock body scroll while the modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden modal-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New task"
      >
        <header className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">New task</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Schedule something for {prettyDate(defaultDate)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="size-8 grid place-items-center rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="px-6 py-5">
          <AddTaskForm
            defaultDate={defaultDate}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function prettyDate(s: string): string {
  const d = parseYmd(s);
  return `${DAY_LABELS[d.getDay()].toLowerCase().replace(/\b\w/g, (c) =>
    c.toUpperCase()
  )}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

/* ----------------------- Task row ----------------------- */

function TaskRow({
  task,
  date,
  done,
  onToggle,
  onDelete,
}: {
  task: Task;
  date: string;
  done: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { state } = useStore();
  const linkedFile = task.linkedFileId
    ? state.files.find((f) => f.id === task.linkedFileId) ?? null
    : null;
  const linkedFolder = task.linkedFolderId
    ? state.folders.find((f) => f.id === task.linkedFolderId) ?? null
    : null;
  const linkedFolderForFile = linkedFile
    ? state.folders.find((f) => f.id === linkedFile.folderId)
    : null;
  const linkPath = linkedFile
    ? `${linkedFolderForFile?.name ?? ""}${
        linkedFolderForFile ? " / " : ""
      }${linkedFile.title.replace(/\.md$/i, "")}`
    : linkedFolder
    ? linkedFolder.name
    : null;

  const autoCompleted =
    done && task.autoCompletedDates.includes(date);

  return (
    <div
      className={`group rounded-2xl border border-[var(--border)] px-4 py-3 flex items-start gap-3 transition ${
        done ? "bg-[var(--surface-2)]/60" : "bg-[var(--surface)]"
      }`}
    >
      <button
        onClick={onToggle}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={`shrink-0 mt-0.5 grid place-items-center size-6 rounded-full border transition ${
          done
            ? "bg-[var(--foreground)] border-[var(--foreground)] text-[var(--surface)]"
            : "border-[var(--muted)]/60 hover:border-[var(--foreground)]"
        }`}
      >
        {done && <CheckIcon size={13} />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={`text-sm font-semibold ${
            done ? "line-through text-[var(--muted)]" : ""
          }`}
        >
          {task.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)] flex-wrap">
          <span className="px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[10px]">
            {task.repeat === "once"
              ? "Today"
              : task.repeat === "daily"
              ? "Every day"
              : "Every week"}
          </span>
          {task.time && (
            <span className="tabular-nums text-[10px]">{task.time}</span>
          )}
          {autoCompleted && (
            <span className="inline-flex items-center gap-1 text-[10px]">
              <CheckIcon size={10} />
              Auto-completed
            </span>
          )}
          {linkPath && (
            <span className="truncate">
              <span className="text-[var(--muted)]/70">·</span>{" "}
              {linkPath}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="shrink-0 p-1.5 rounded-lg text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] hover:bg-[var(--surface-2)] transition"
        aria-label="Delete task"
        title="Delete task"
      >
        <TrashIcon size={13} />
      </button>
    </div>
  );
}

/* ----------------------- Add task form ----------------------- */

function AddTaskForm({
  defaultDate,
  onCancel,
  onSubmit,
}: {
  defaultDate: string;
  onCancel: () => void;
  onSubmit: (p: {
    title: string;
    startDate: string;
    time?: string;
    repeat: RepeatKind;
    linkedFileId?: string | null;
    linkedFolderId?: string | null;
  }) => void;
}) {
  const { state } = useStore();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [repeat, setRepeat] = useState<RepeatKind>("once");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkedFileId, setLinkedFileId] = useState<string | null>(null);
  const [linkedFolderId, setLinkedFolderId] = useState<string | null>(null);
  const linkRef = useRef<HTMLDivElement | null>(null);

  const folderPath = (folderId: string): string => {
    const parts: string[] = [];
    let cur = state.folders.find((f) => f.id === folderId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parentId
        ? state.folders.find((x) => x.id === cur!.parentId)
        : undefined;
    }
    return parts.join(" / ");
  };

  const linkLabel = (() => {
    if (linkedFileId) {
      const f = state.files.find((x) => x.id === linkedFileId);
      if (!f) return "Linked";
      const path = folderPath(f.folderId);
      return `${path ? path + " / " : ""}${f.title.replace(/\.md$/i, "")}`;
    }
    if (linkedFolderId) {
      return folderPath(linkedFolderId);
    }
    return null;
  })();

  const matches = (label: string) =>
    !linkSearch || label.toLowerCase().includes(linkSearch.toLowerCase());

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({
      title,
      startDate: defaultDate,
      time: time || undefined,
      repeat,
      linkedFileId,
      linkedFolderId,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Field label="Task name">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="What do you want to get done?"
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Time (optional)">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </Field>
        <Field label="Repeat">
          <div className="inline-flex w-full rounded-xl border border-[var(--border)] p-1">
            {(
              [
                { v: "once", label: "Today" },
                { v: "daily", label: "Daily" },
                { v: "weekly", label: "Weekly" },
              ] as { v: RepeatKind; label: string }[]
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setRepeat(opt.v)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition ${
                  repeat === opt.v
                    ? "bg-[var(--foreground)] text-[var(--surface)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Link a folder or file (optional)">
        <div className="relative" ref={linkRef}>
          <button
            type="button"
            onClick={() => setLinkOpen((v) => !v)}
            className={`w-full inline-flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition ${
              linkLabel
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
            }`}
          >
            <span className="truncate text-left">
              {linkLabel ? linkLabel : "Pick something to link"}
            </span>
            <span className="text-[var(--muted)] shrink-0">
              {linkOpen ? "▴" : "▾"}
            </span>
          </button>
          {linkOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg z-30 p-1.5">
              <input
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Search folders / files…"
                className="w-full bg-[var(--surface-2)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--accent)] mb-2"
              />
              <button
                type="button"
                onClick={() => {
                  setLinkedFileId(null);
                  setLinkedFolderId(null);
                  setLinkOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-[var(--muted)] hover:bg-[var(--surface-2)] transition"
              >
                No link
              </button>
              {state.folders.length > 0 && (
                <>
                  <div className="h-px bg-[var(--border)] my-1" />
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    Folders
                  </div>
                  {state.folders
                    .filter((f) => matches(f.name))
                    .map((f) => (
                      <button
                        key={`folder-${f.id}`}
                        type="button"
                        onClick={() => {
                          setLinkedFolderId(f.id);
                          setLinkedFileId(null);
                          setLinkOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-[var(--surface-2)] transition truncate"
                      >
                        {folderPath(f.id)}
                      </button>
                    ))}
                </>
              )}
              {state.files.length > 0 && (
                <>
                  <div className="h-px bg-[var(--border)] my-1" />
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    Files
                  </div>
                  {state.files
                    .filter((f) =>
                      matches(`${f.title} ${folderPath(f.folderId)}`)
                    )
                    .map((f) => (
                      <button
                        key={`file-${f.id}`}
                        type="button"
                        onClick={() => {
                          setLinkedFileId(f.id);
                          setLinkedFolderId(null);
                          setLinkOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-[var(--surface-2)] transition truncate"
                      >
                        {folderPath(f.folderId)} /{" "}
                        {f.title.replace(/\.md$/i, "")}
                      </button>
                    ))}
                </>
              )}
            </div>
          )}
        </div>
        {linkLabel && (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            This task will auto-complete when the linked content is marked
            done.
          </p>
        )}
      </Field>

      <div className="flex items-center gap-2 justify-end pt-2 border-t border-[var(--border)] mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--foreground)] text-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <PlusIcon size={13} /> Create task
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--muted)] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
