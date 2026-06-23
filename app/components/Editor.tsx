"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "../lib/store";
import { renderMarkdown } from "../lib/markdown";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  TrashIcon,
} from "./icons";

const FONT_STEPS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const DEFAULT_FONT = 14;

type Formats = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  h1: boolean;
  h2: boolean;
  h3: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  ul: boolean;
  ol: boolean;
  cb: boolean;
  rb: boolean;
  inCode: boolean;
  fontSize: number;
};

const emptyFormats: Formats = {
  bold: false,
  italic: false,
  strike: false,
  h1: false,
  h2: false,
  h3: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  ul: false,
  ol: false,
  cb: false,
  rb: false,
  inCode: false,
  fontSize: DEFAULT_FONT,
};

export default function Editor() {
  const { state, dispatch } = useStore();
  const file = state.files.find((f) => f.id === state.currentFileId);
  const folder = state.folders.find((f) => f.id === state.currentFolderId);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastWrittenContent = useRef<string>("");
  const loadedFileId = useRef<string | null>(null);
  const [formats, setFormats] = useState<Formats>(emptyFormats);

  const initialHtml = useMemo(() => {
    const content = file?.content ?? "";
    if (!content) return "";
    if (/<[a-z][^>]*>/i.test(content)) return content;
    return renderMarkdown(content);
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editorRef.current || !file) return;
    if (loadedFileId.current === file.id) return;
    loadedFileId.current = file.id;
    editorRef.current.innerHTML = initialHtml;
    lastWrittenContent.current = initialHtml;
    editorRef.current.focus();
  }, [file, initialHtml]);

  const flush = useCallback(() => {
    const el = editorRef.current;
    if (!el || !file) return;
    const html = el.innerHTML;
    if (html === lastWrittenContent.current) return;
    lastWrittenContent.current = html;
    dispatch({
      type: "UPDATE_FILE",
      payload: { id: file.id, content: html },
    });
  }, [dispatch, file]);

  const updateFormats = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    if (!node || !el.contains(node)) return;
    const blockTag = (
      document.queryCommandValue("formatBlock") || ""
    ).toLowerCase();
    const elNode =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    const computedSize = elNode
      ? Math.round(parseFloat(window.getComputedStyle(elNode).fontSize))
      : DEFAULT_FONT;
    setFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      strike: document.queryCommandState("strikeThrough"),
      h1: blockTag === "h1",
      h2: blockTag === "h2",
      h3: blockTag === "h3",
      alignLeft: document.queryCommandState("justifyLeft"),
      alignCenter: document.queryCommandState("justifyCenter"),
      alignRight: document.queryCommandState("justifyRight"),
      ul: document.queryCommandState("insertUnorderedList"),
      ol: document.queryCommandState("insertOrderedList"),
      cb: !!elNode?.closest?.("ul.cb-list"),
      rb: !!elNode?.closest?.("ul.rb-list"),
      inCode: !!elNode?.closest?.("pre, code"),
      fontSize: computedSize || DEFAULT_FONT,
    });
  }, []);

  useEffect(() => {
    const onChange = () => updateFormats();
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [updateFormats]);

  const exec = useCallback(
    (cmd: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(cmd, false, value);
      flush();
      updateFormats();
    },
    [flush, updateFormats]
  );

  /* --- Bold / Italic — apply forward; ok with or without selection.
         execCommand toggles for next-typed-characters when collapsed. --- */
  const toggleBold = useCallback(() => exec("bold"), [exec]);
  const toggleItalic = useCallback(() => exec("italic"), [exec]);

  /* --- Strike — REQUIRES selection. --- */
  const toggleStrike = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    exec("strikeThrough");
  }, [exec]);

  /* --- Headings — apply to next characters: if the current block has text,
         start a NEW heading block after it and place the caret inside. --- */
  const applyHeading = useCallback(
    (tag: "h1" | "h2" | "h3") => {
      editorRef.current?.focus();
      const sel = window.getSelection();
      const el = editorRef.current;
      if (!sel || sel.rangeCount === 0 || !el) return;
      const block = currentBlock(sel.anchorNode, el);
      if (!block || isBlank(block)) {
        document.execCommand("formatBlock", false, `<${tag}>`);
      } else {
        const next = document.createElement(tag);
        next.appendChild(document.createElement("br"));
        block.after(next);
        placeCaretIn(next);
      }
      flush();
      updateFormats();
    },
    [flush, updateFormats]
  );

  /* --- Alignment — REQUIRES selection. --- */
  const applyAlign = useCallback(
    (cmd: "justifyLeft" | "justifyCenter" | "justifyRight") => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      exec(cmd);
    },
    [exec]
  );

  const adjustFont = useCallback(
    (direction: 1 | -1) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) {
        // Expand to the current word so the change is visible.
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? "";
          const offset = range.startOffset;
          let start = offset;
          let end = offset;
          while (start > 0 && /\S/.test(text[start - 1])) start--;
          while (end < text.length && /\S/.test(text[end])) end++;
          if (end > start) {
            range.setStart(node, start);
            range.setEnd(node, end);
            sel.removeAllRanges();
            sel.addRange(range);
          } else {
            return;
          }
        } else {
          return;
        }
      }
      const anchor =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as Element)
          : range.commonAncestorContainer.parentElement;
      const currentSize = anchor
        ? parseFloat(window.getComputedStyle(anchor).fontSize)
        : DEFAULT_FONT;
      let idx = FONT_STEPS.findIndex(
        (s) => Math.abs(s - currentSize) < 0.5 || s > currentSize
      );
      if (idx === -1) idx = FONT_STEPS.length - 1;
      const next =
        direction === 1
          ? FONT_STEPS[Math.min(FONT_STEPS.length - 1, idx + 1)]
          : FONT_STEPS[Math.max(0, idx - 1)];
      const span = document.createElement("span");
      span.style.fontSize = `${next}px`;
      try {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } catch {
        return;
      }
      flush();
      updateFormats();
    },
    [flush, updateFormats]
  );

  /* --- Code block — insert <pre><code></code></pre><p><br></p> and put
         caret inside the <code>. The trailing paragraph stays clickable
         so the user can move out of the code box. --- */
  const insertCodeBlock = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const html = `<pre><code data-caret="1"></code></pre><p><br></p>`;
    document.execCommand("insertHTML", false, html);
    const caret = el.querySelector('code[data-caret="1"]');
    if (caret instanceof HTMLElement) {
      caret.removeAttribute("data-caret");
      placeCaretIn(caret);
    }
    flush();
    updateFormats();
  }, [flush, updateFormats]);

  /* --- Lists — checklist, radio, bullet, numbered. New list with the
         marker class so CSS ::before renders the box/dot, and Enter
         behavior is handled by the browser. --- */
  const insertList = useCallback(
    (kind: "cb" | "rb" | "ul" | "ol") => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      if (kind === "ul") {
        exec("insertUnorderedList");
        return;
      }
      if (kind === "ol") {
        exec("insertOrderedList");
        return;
      }
      const cls = kind === "cb" ? "cb-list" : "rb-list";
      const html = `<ul class="${cls}"><li data-caret="1"><br></li></ul><p><br></p>`;
      document.execCommand("insertHTML", false, html);
      const li = el.querySelector('li[data-caret="1"]');
      if (li instanceof HTMLElement) {
        li.removeAttribute("data-caret");
        placeCaretIn(li);
      }
      flush();
      updateFormats();
    },
    [exec, flush, updateFormats]
  );

  /* --- Dividers — full-width <hr> with marker classes. --- */
  const insertDivider = useCallback(
    (kind: "line" | "dots" | "block") => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const cls =
        kind === "dots"
          ? "div-dots"
          : kind === "block"
          ? "div-block"
          : "div-line";
      document.execCommand(
        "insertHTML",
        false,
        `<hr class="${cls}"><p><br></p>`
      );
      flush();
      updateFormats();
    },
    [flush, updateFormats]
  );

  /* --- Enter handling — exit code block on double-Enter; let lists fall
         back to native browser behavior (Enter in empty <li> exits the
         list and starts a new paragraph). --- */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter") return;
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const node = sel.anchorNode;
      if (!node || !el.contains(node)) return;
      const codeEl =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element).closest("pre")
          : node.parentElement?.closest("pre");
      if (codeEl) {
        // In a <pre><code> block: on a trailing empty line, exit to the
        // next sibling paragraph.
        const codeText = codeEl.textContent ?? "";
        const endsWithNewline = codeText.endsWith("\n");
        if (endsWithNewline) {
          e.preventDefault();
          // Strip the trailing newline we just typed in code.
          const codeInner = codeEl.querySelector("code") ?? codeEl;
          codeInner.textContent = codeText.replace(/\n+$/, "");
          let next = codeEl.nextElementSibling;
          if (!(next instanceof HTMLElement)) {
            const p = document.createElement("p");
            p.appendChild(document.createElement("br"));
            codeEl.after(p);
            next = p;
          }
          placeCaretIn(next as HTMLElement);
          flush();
          return;
        }
      }
    },
    [flush]
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

  const wordCount = (file.content ?? "")
    .replace(/<[^>]+>/g, " ")
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

        <FormatToolbar
          formats={formats}
          toggleBold={toggleBold}
          toggleItalic={toggleItalic}
          toggleStrike={toggleStrike}
          applyHeading={applyHeading}
          applyAlign={applyAlign}
          adjustFont={adjustFont}
          insertCodeBlock={insertCodeBlock}
          insertList={insertList}
          insertDivider={insertDivider}
          wordCount={wordCount}
        />

        <div
          className="h-0.5 w-full rounded-full mt-3"
          style={{ background: folder.color, opacity: 0.7 }}
        />
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={flush}
        onBlur={flush}
        onKeyDown={onKeyDown}
        onKeyUp={updateFormats}
        onMouseUp={updateFormats}
        spellCheck={false}
        data-placeholder="Start writing..."
        className="rich-editor text-sm leading-7 flex-1 px-8 pt-6 pb-12 outline-none overflow-y-auto"
      />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[var(--muted)] opacity-60 pointer-events-none">
        <ArrowDownIcon size={18} />
      </div>
    </div>
  );
}

/* ---------------------- helpers ---------------------- */

function placeCaretIn(el: HTMLElement) {
  const r = document.createRange();
  r.setStart(el, 0);
  r.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

function currentBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  if (!node) return null;
  let cur: Node | null =
    node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  while (cur && cur !== root) {
    if (cur instanceof HTMLElement) {
      const tag = cur.tagName;
      if (
        tag === "P" ||
        tag === "DIV" ||
        tag === "H1" ||
        tag === "H2" ||
        tag === "H3" ||
        tag === "H4" ||
        tag === "H5" ||
        tag === "H6" ||
        tag === "BLOCKQUOTE" ||
        tag === "PRE" ||
        tag === "LI"
      ) {
        return cur;
      }
    }
    cur = cur.parentNode;
  }
  return null;
}

function isBlank(el: HTMLElement): boolean {
  const text = el.textContent ?? "";
  if (text.trim() !== "") return false;
  // Treat blocks containing only <br> as blank.
  return true;
}

/* ---------------------- Toolbar ---------------------- */

function FormatToolbar({
  formats,
  toggleBold,
  toggleItalic,
  toggleStrike,
  applyHeading,
  applyAlign,
  adjustFont,
  insertCodeBlock,
  insertList,
  insertDivider,
  wordCount,
}: {
  formats: Formats;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleStrike: () => void;
  applyHeading: (tag: "h1" | "h2" | "h3") => void;
  applyAlign: (cmd: "justifyLeft" | "justifyCenter" | "justifyRight") => void;
  adjustFont: (dir: 1 | -1) => void;
  insertCodeBlock: () => void;
  insertList: (kind: "cb" | "rb" | "ul" | "ol") => void;
  insertDivider: (kind: "line" | "dots" | "block") => void;
  wordCount: number;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-sm">
      <span className="text-[10px] tracking-[0.18em] uppercase text-[var(--muted)] mr-1">
        Format
      </span>

      <TbGroup>
        <TbButton title="Bold" active={formats.bold} onClick={toggleBold}>
          <span className="font-bold">B</span>
        </TbButton>
        <TbButton
          title="Italic"
          active={formats.italic}
          onClick={toggleItalic}
        >
          <span className="italic font-serif">I</span>
        </TbButton>
        <TbButton
          title="Strikethrough (select text first)"
          active={formats.strike}
          onClick={toggleStrike}
        >
          <span className="line-through">S</span>
        </TbButton>
      </TbGroup>

      <TbGroup>
        <TbButton title="Decrease font size" onClick={() => adjustFont(-1)}>
          <span className="text-[10px] font-semibold leading-none">
            A<span className="text-[8px]">−</span>
          </span>
        </TbButton>
        <span className="px-1.5 text-[11px] text-[var(--muted)] tabular-nums min-w-[2ch] text-center">
          {formats.fontSize}
        </span>
        <TbButton title="Increase font size" onClick={() => adjustFont(1)}>
          <span className="text-[12px] font-semibold leading-none">
            A<span className="text-[8px]">+</span>
          </span>
        </TbButton>
      </TbGroup>

      <TbGroup>
        <TbButton
          title="Heading 1"
          active={formats.h1}
          onClick={() => applyHeading("h1")}
        >
          <span className="font-bold text-[11px]">H1</span>
        </TbButton>
        <TbButton
          title="Heading 2"
          active={formats.h2}
          onClick={() => applyHeading("h2")}
        >
          <span className="font-semibold text-[11px]">H2</span>
        </TbButton>
        <TbButton
          title="Heading 3"
          active={formats.h3}
          onClick={() => applyHeading("h3")}
        >
          <span className="font-medium text-[11px]">H3</span>
        </TbButton>
      </TbGroup>

      <TbGroup>
        <TbButton
          title="Align left (select text first)"
          active={formats.alignLeft}
          onClick={() => applyAlign("justifyLeft")}
        >
          <AlignGlyph kind="left" />
        </TbButton>
        <TbButton
          title="Align center (select text first)"
          active={formats.alignCenter}
          onClick={() => applyAlign("justifyCenter")}
        >
          <AlignGlyph kind="center" />
        </TbButton>
        <TbButton
          title="Align right (select text first)"
          active={formats.alignRight}
          onClick={() => applyAlign("justifyRight")}
        >
          <AlignGlyph kind="right" />
        </TbButton>
      </TbGroup>

      <TbGroup>
        <TbButton
          title="Code block"
          active={formats.inCode}
          onClick={insertCodeBlock}
        >
          <span className="font-mono">{">_"}</span>
        </TbButton>
      </TbGroup>

      <TbGroup>
        <TbButton
          title="Checklist"
          active={formats.cb}
          onClick={() => insertList("cb")}
        >
          <ListGlyph kind="check" />
        </TbButton>
        <TbButton
          title="Bullet list"
          active={formats.ul && !formats.cb && !formats.rb}
          onClick={() => insertList("ul")}
        >
          <ListGlyph kind="bullet" />
        </TbButton>
        <TbButton
          title="Radio list"
          active={formats.rb}
          onClick={() => insertList("rb")}
        >
          <ListGlyph kind="radio" />
        </TbButton>
        <TbButton
          title="Numbered list"
          active={formats.ol}
          onClick={() => insertList("ol")}
        >
          <ListGlyph kind="number" />
        </TbButton>
      </TbGroup>

      <TbGroup>
        <TbButton title="Line divider" onClick={() => insertDivider("line")}>
          <DividerGlyph kind="line" />
        </TbButton>
        <TbButton title="Dotted divider" onClick={() => insertDivider("dots")}>
          <DividerGlyph kind="dots" />
        </TbButton>
        <TbButton title="Dashed divider" onClick={() => insertDivider("block")}>
          <DividerGlyph kind="block" />
        </TbButton>
      </TbGroup>

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
      aria-pressed={!!active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-7 h-7 px-2 rounded-md text-xs grid place-items-center transition ${
        active
          ? "bg-[var(--surface-2)] text-[var(--foreground)] ring-1 ring-[var(--accent)]/40"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
    </button>
  );
}

function AlignGlyph({ kind }: { kind: "left" | "center" | "right" }) {
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
      <path d="M3 6h18" />
      {kind === "left" && <path d="M3 12h12M3 18h16" />}
      {kind === "center" && <path d="M6 12h12M5 18h14" />}
      {kind === "right" && <path d="M9 12h12M5 18h16" />}
    </svg>
  );
}

function ListGlyph({
  kind,
}: {
  kind: "check" | "bullet" | "radio" | "number";
}) {
  if (kind === "check") {
    return (
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 12l3 3 5-6" />
      </svg>
    );
  }
  if (kind === "radio") {
    return (
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "number") {
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
        <text x="2" y="11" fontSize="9" fill="currentColor" stroke="none">
          1.
        </text>
        <text x="2" y="20" fontSize="9" fill="currentColor" stroke="none">
          2.
        </text>
        <path d="M10 7h12M10 17h12" />
      </svg>
    );
  }
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
      <circle cx="5" cy="7" r="1.2" fill="currentColor" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="5" cy="17" r="1.2" fill="currentColor" />
      <path d="M10 7h12M10 12h12M10 17h12" />
    </svg>
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
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d="M4 12h3M9 12h3M14 12h3M19 12h2" />
      </svg>
    );
  }
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
      <path d="M4 12h16" />
    </svg>
  );
}
