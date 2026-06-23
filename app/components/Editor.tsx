"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useStore } from "../lib/store";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  TrashIcon,
} from "./icons";

type Insertion = {
  value: string;
  selStart: number;
  selEnd: number;
};

type Modifier = (
  value: string,
  selStart: number,
  selEnd: number
) => Insertion;

export default function Editor() {
  const { state, dispatch } = useStore();
  const file = state.files.find((f) => f.id === state.currentFileId);
  const folder = state.folders.find((f) => f.id === state.currentFolderId);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, [file?.id]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    const sel = pendingSelection.current;
    if (!ta || !sel) return;
    ta.focus();
    ta.setSelectionRange(sel.start, sel.end);
    pendingSelection.current = null;
  }, [file?.content]);

  const apply = useCallback(
    (mod: Modifier) => {
      const ta = taRef.current;
      if (!ta || !file) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = mod(ta.value, start, end);
      pendingSelection.current = {
        start: next.selStart,
        end: next.selEnd,
      };
      dispatch({
        type: "UPDATE_FILE",
        payload: { id: file.id, content: next.value },
      });
    },
    [dispatch, file]
  );

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

  const wordCount = file.content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

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
          <div className="flex-1" />
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

        <FormatToolbar apply={apply} wordCount={wordCount} />

        <div
          className="h-0.5 w-full rounded-full mt-3"
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

/* ---------------------------- Toolbar ---------------------------- */

function FormatToolbar({
  apply,
  wordCount,
}: {
  apply: (mod: Modifier) => void;
  wordCount: number;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-sm">
      <span className="text-[10px] tracking-[0.18em] uppercase text-[var(--muted)] mr-1">
        Format
      </span>

      <TbGroup>
        <TbButton title="Bold" onClick={() => apply(wrap("**"))}>
          <span className="font-bold">B</span>
        </TbButton>
        <TbButton title="Italic" onClick={() => apply(wrap("_"))}>
          <span className="italic font-serif">I</span>
        </TbButton>
        <TbButton title="Strikethrough" onClick={() => apply(wrap("~~"))}>
          <span className="line-through">S</span>
        </TbButton>
      </TbGroup>

      <HeadingMenu apply={apply} />

      <AlignMenu apply={apply} />

      <TbGroup>
        <TbButton title="Inline code" onClick={() => apply(wrap("`"))}>
          <span className="font-mono">{"</>"}</span>
        </TbButton>
        <TbButton
          title="Code block"
          onClick={() => apply(blockWrap("```\n", "\n```"))}
        >
          <span className="font-mono">{">_"}</span>
        </TbButton>
      </TbGroup>

      <ListMenu apply={apply} />

      <DividerMenu apply={apply} />

      <span className="ml-auto text-xs text-[var(--muted)] tabular-nums pr-1">
        {wordCount} {wordCount === 1 ? "word" : "words"}
      </span>
    </div>
  );
}

function TbGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-[var(--border)] p-0.5 gap-0.5">
      {children}
    </div>
  );
}

function TbButton({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-7 h-7 px-2 rounded-md text-xs grid place-items-center transition ${
        active
          ? "bg-[var(--surface-2)] text-[var(--foreground)]"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
    </button>
  );
}

function Dropdown({
  label,
  title,
  children,
}: {
  label: React.ReactNode;
  title: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        title={title}
        aria-label={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg border text-xs transition ${
          open
            ? "border-[var(--accent)] text-[var(--foreground)] bg-[var(--surface-2)]"
            : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
        }`}
      >
        {label}
        <ChevronDownIcon size={10} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[10rem] rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg p-1 z-30">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-[var(--foreground)] hover:bg-[var(--surface-2)] transition flex items-center gap-2"
    >
      {children}
    </button>
  );
}

function HeadingMenu({ apply }: { apply: (m: Modifier) => void }) {
  return (
    <Dropdown
      title="Heading"
      label={<span className="font-semibold">H</span>}
    >
      {(close) => (
        <>
          {[1, 2, 3].map((lvl) => (
            <MenuItem
              key={lvl}
              onClick={() => {
                apply(linePrefix(`${"#".repeat(lvl)} `));
                close();
              }}
            >
              <span
                className="font-semibold"
                style={{ fontSize: 16 - (lvl - 1) * 2 }}
              >
                H{lvl}
              </span>
              <span className="text-[var(--muted)]">Heading {lvl}</span>
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

function AlignMenu({ apply }: { apply: (m: Modifier) => void }) {
  const wrapAlign = (align: "left" | "center" | "right"): Modifier => {
    return (value, s, e) => {
      const sel = value.slice(s, e) || "text";
      const open = `<div align="${align}">\n`;
      const close = `\n</div>`;
      const inserted = open + sel + close;
      return {
        value: value.slice(0, s) + inserted + value.slice(e),
        selStart: s + open.length,
        selEnd: s + open.length + sel.length,
      };
    };
  };
  return (
    <Dropdown
      title="Alignment"
      label={<AlignGlyph kind="left" />}
    >
      {(close) => (
        <>
          <MenuItem
            onClick={() => {
              apply(wrapAlign("left"));
              close();
            }}
          >
            <AlignGlyph kind="left" /> Align left
          </MenuItem>
          <MenuItem
            onClick={() => {
              apply(wrapAlign("center"));
              close();
            }}
          >
            <AlignGlyph kind="center" /> Align center
          </MenuItem>
          <MenuItem
            onClick={() => {
              apply(wrapAlign("right"));
              close();
            }}
          >
            <AlignGlyph kind="right" /> Align right
          </MenuItem>
        </>
      )}
    </Dropdown>
  );
}

function AlignGlyph({ kind }: { kind: "left" | "center" | "right" }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 6h18" />
      {kind === "left" && <path d="M3 12h12M3 18h16" />}
      {kind === "center" && <path d="M6 12h12M5 18h14" />}
      {kind === "right" && <path d="M9 12h12M5 18h16" />}
    </svg>
  );
}

function ListMenu({ apply }: { apply: (m: Modifier) => void }) {
  return (
    <Dropdown
      title="Lists"
      label={<ListGlyph kind="bullet" />}
    >
      {(close) => (
        <>
          <MenuItem
            onClick={() => {
              apply(linePrefix("- [ ] "));
              close();
            }}
          >
            <ListGlyph kind="check" /> Checklist
          </MenuItem>
          <MenuItem
            onClick={() => {
              apply(linePrefix("- "));
              close();
            }}
          >
            <ListGlyph kind="bullet" /> Bullet list
          </MenuItem>
          <MenuItem
            onClick={() => {
              apply(linePrefix("( ) "));
              close();
            }}
          >
            <ListGlyph kind="radio" /> Radio list
          </MenuItem>
          <MenuItem
            onClick={() => {
              apply(numberPrefix());
              close();
            }}
          >
            <ListGlyph kind="number" /> Numbered list
          </MenuItem>
        </>
      )}
    </Dropdown>
  );
}

function ListGlyph({
  kind,
}: {
  kind: "check" | "bullet" | "radio" | "number";
}) {
  if (kind === "check") {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 12l3 3 5-6" />
      </svg>
    );
  }
  if (kind === "radio") {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "number") {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <text x="2" y="11" fontSize="9" fill="currentColor" stroke="none">1.</text>
        <text x="2" y="20" fontSize="9" fill="currentColor" stroke="none">2.</text>
        <path d="M10 7h12M10 17h12" />
      </svg>
    );
  }
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="5" cy="7" r="1.2" fill="currentColor" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="5" cy="17" r="1.2" fill="currentColor" />
      <path d="M10 7h12M10 12h12M10 17h12" />
    </svg>
  );
}

function DividerMenu({ apply }: { apply: (m: Modifier) => void }) {
  const insertBlock = (block: string): Modifier => {
    return (value, s) => {
      const before = value.slice(0, s);
      const after = value.slice(s);
      const needsLeading = before.length > 0 && !before.endsWith("\n");
      const needsTrailing = after.length > 0 && !after.startsWith("\n");
      const lead = needsLeading ? "\n" : "";
      const trail = needsTrailing ? "\n" : "";
      const inserted = `${lead}${block}\n${trail}`;
      const cursor = s + inserted.length;
      return {
        value: before + inserted + after,
        selStart: cursor,
        selEnd: cursor,
      };
    };
  };
  return (
    <Dropdown
      title="Divider"
      label={<DividerGlyph kind="line" />}
    >
      {(close) => (
        <>
          <MenuItem
            onClick={() => {
              apply(insertBlock("---"));
              close();
            }}
          >
            <DividerGlyph kind="line" /> Line divider
          </MenuItem>
          <MenuItem
            onClick={() => {
              apply(insertBlock("· · · · · · · · · ·"));
              close();
            }}
          >
            <DividerGlyph kind="dots" /> Dots divider
          </MenuItem>
          <MenuItem
            onClick={() => {
              apply(insertBlock("— — — — — — — — — —"));
              close();
            }}
          >
            <DividerGlyph kind="block" /> Line block divider
          </MenuItem>
        </>
      )}
    </Dropdown>
  );
}

function DividerGlyph({ kind }: { kind: "line" | "dots" | "block" }) {
  if (kind === "dots") {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="9" cy="12" r="1.2" />
        <circle cx="13" cy="12" r="1.2" />
        <circle cx="17" cy="12" r="1.2" />
      </svg>
    );
  }
  if (kind === "block") {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M4 12h3M9 12h3M14 12h3M19 12h2" />
      </svg>
    );
  }
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 12h16" />
    </svg>
  );
}

/* ---------------------------- Modifiers ---------------------------- */

function wrap(marker: string): Modifier {
  return (value, s, e) => {
    if (s === e) {
      const inserted = marker + marker;
      return {
        value: value.slice(0, s) + inserted + value.slice(e),
        selStart: s + marker.length,
        selEnd: s + marker.length,
      };
    }
    const sel = value.slice(s, e);
    const wrapped = marker + sel + marker;
    return {
      value: value.slice(0, s) + wrapped + value.slice(e),
      selStart: s + marker.length,
      selEnd: s + marker.length + sel.length,
    };
  };
}

function blockWrap(open: string, close: string): Modifier {
  return (value, s, e) => {
    const sel = value.slice(s, e) || "code";
    const before = value.slice(0, s);
    const after = value.slice(e);
    const needsLeading = before.length > 0 && !before.endsWith("\n");
    const lead = needsLeading ? "\n" : "";
    const inserted = `${lead}${open}${sel}${close}\n`;
    return {
      value: before + inserted + after,
      selStart: s + lead.length + open.length,
      selEnd: s + lead.length + open.length + sel.length,
    };
  };
}

function linePrefix(prefix: string): Modifier {
  return (value, s, e) => {
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const lineEnd =
      value.indexOf("\n", e) === -1 ? value.length : value.indexOf("\n", e);
    const before = value.slice(0, lineStart);
    const block = value.slice(lineStart, lineEnd);
    const after = value.slice(lineEnd);
    const lines = block.split("\n");
    const transformed = lines
      .map((ln) => (ln.length === 0 ? prefix.trimEnd() : prefix + ln))
      .join("\n");
    return {
      value: before + transformed + after,
      selStart: lineStart + transformed.length,
      selEnd: lineStart + transformed.length,
    };
  };
}

function numberPrefix(): Modifier {
  return (value, s, e) => {
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const lineEnd =
      value.indexOf("\n", e) === -1 ? value.length : value.indexOf("\n", e);
    const before = value.slice(0, lineStart);
    const block = value.slice(lineStart, lineEnd);
    const after = value.slice(lineEnd);
    const lines = block.split("\n");
    const transformed = lines
      .map((ln, i) => (ln.length === 0 ? `${i + 1}.` : `${i + 1}. ${ln}`))
      .join("\n");
    return {
      value: before + transformed + after,
      selStart: lineStart + transformed.length,
      selEnd: lineStart + transformed.length,
    };
  };
}
