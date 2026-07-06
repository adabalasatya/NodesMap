"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "../lib/store";
import { useDialog } from "./Dialog";
import { useAuth } from "../lib/auth";
import { renderMarkdown } from "../lib/markdown";
import { clearDraft, readDraft, writeDraft } from "../lib/draftSync";
import { hasSupabaseConfig, upsertFile } from "../lib/supabase";
import { exportNoteAsMarkdown } from "../lib/export";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  DownloadIcon,
  TrashIcon,
} from "./icons";
import PomodoroTimer from "./PomodoroTimer";

const SYNC_DEBOUNCE_MS = 5_000;
type SaveStatus = "saved" | "editing" | "syncing" | "failed";

const FONT_STEPS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const DEFAULT_FONT = 14;

type Formats = {
  bold: boolean;
  italic: boolean;
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
  const { user } = useAuth();
  const dialog = useDialog();
  const file = state.files.find((f) => f.id === state.currentFileId);
  const folder = state.folders.find((f) => f.id === state.currentFolderId);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastWrittenContent = useRef<string>("");
  const loadedFileId = useRef<string | null>(null);
  const [formats, setFormats] = useState<Formats>(emptyFormats);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const debounceRef = useRef<number | null>(null);
  const pendingFileRef = useRef<string | null>(null);
  const statePulse = useRef(state);
  statePulse.current = state;

  // Compute the HTML to load: a localStorage draft (if present) wins over
  // the Supabase-synced content, since the draft is by definition newer.
  const initialHtml = useMemo(() => {
    if (!file) return "";
    const draft = readDraft(file.id);
    const source = draft?.content ?? file.content ?? "";
    if (!source) return "";
    if (/<[a-z][^>]*>/i.test(source)) return source;
    return renderMarkdown(source);
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Did we load from a draft on open? Reflect that in the status badge.
  const initialStatus = useMemo<SaveStatus>(() => {
    if (!file) return "saved";
    return readDraft(file.id) ? "editing" : "saved";
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editorRef.current || !file) return;
    if (loadedFileId.current === file.id) return;
    loadedFileId.current = file.id;
    editorRef.current.innerHTML = initialHtml;
    lastWrittenContent.current = initialHtml;
    setStatus(initialStatus);
    editorRef.current.focus();
    // If we loaded a draft, hydrate in-memory state so other views see the
    // freshest content too.
    const draft = readDraft(file.id);
    if (draft && draft.content !== file.content) {
      dispatch({
        type: "UPDATE_FILE",
        payload: { id: file.id, content: draft.content },
      });
    }
  }, [file, initialHtml, initialStatus, dispatch]);

  // Push the latest content of `fileId` to Supabase. Returns true on a
  // confirmed save (draft cleared); false otherwise (draft preserved so a
  // later useStaleDraftSync run can retry).
  const syncToServer = useCallback(
    async (fileId: string, content: string): Promise<boolean> => {
      if (!hasSupabaseConfig() || !user) {
        return false;
      }
      const f = statePulse.current.files.find((x) => x.id === fileId);
      if (!f) return false;
      try {
        await upsertFile({
          ...f,
          content,
          updatedAt: Date.now(),
        });
        clearDraft(fileId);
        return true;
      } catch (e) {
        console.warn("Editor sync failed:", e);
        return false;
      }
    },
    [user]
  );

  const armDebounce = useCallback(
    (fileId: string) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      pendingFileRef.current = fileId;
      debounceRef.current = window.setTimeout(async () => {
        debounceRef.current = null;
        const targetId = pendingFileRef.current;
        if (!targetId) return;
        const draft = readDraft(targetId);
        if (!draft) {
          setStatus("saved");
          return;
        }
        setStatus("syncing");
        const ok = await syncToServer(targetId, draft.content);
        setStatus(ok ? "saved" : "failed");
        if (ok) pendingFileRef.current = null;
      }, SYNC_DEBOUNCE_MS);
    },
    [syncToServer]
  );

  // Editor input → write draft instantly, dispatch in-memory state, status
  // "editing", reset the 30-second timer.
  const flush = useCallback(() => {
    const el = editorRef.current;
    if (!el || !file) return;
    const html = el.innerHTML;
    if (html === lastWrittenContent.current) return;
    lastWrittenContent.current = html;
    writeDraft(file.id, html);
    dispatch({
      type: "UPDATE_FILE",
      payload: { id: file.id, content: html },
    });
    setStatus("editing");
    armDebounce(file.id);
  }, [dispatch, file, armDebounce]);

  // Manual retry hook for the failed state.
  const retrySync = useCallback(async () => {
    if (!file) return;
    const draft = readDraft(file.id);
    if (!draft) {
      setStatus("saved");
      return;
    }
    setStatus("syncing");
    const ok = await syncToServer(file.id, draft.content);
    setStatus(ok ? "saved" : "failed");
  }, [file, syncToServer]);

  // On file switch / unmount, flush any pending draft synchronously to
  // Supabase before letting go.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const targetId = pendingFileRef.current;
      pendingFileRef.current = null;
      if (!targetId) return;
      const draft = readDraft(targetId);
      if (!draft) return;
      // fire-and-forget; the draft survives until the upsert resolves.
      void syncToServer(targetId, draft.content);
    };
  }, [file?.id, syncToServer]);

  // beforeunload — flush whatever's pending. We can't await the network,
  // but the upsert is dispatched and the draft remains for stale recovery.
  useEffect(() => {
    const onBeforeUnload = () => {
      const targetId = pendingFileRef.current;
      if (!targetId) return;
      const draft = readDraft(targetId);
      if (!draft) return;
      void syncToServer(targetId, draft.content);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [syncToServer]);

  const updateFormats = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    if (!node || !el.contains(node)) return;
    // Some browsers return "<h1>" with brackets, others return "h1" or
    // "heading 1" — normalize.
    const rawBlock = String(document.queryCommandValue("formatBlock") || "")
      .toLowerCase()
      .replace(/[<>]/g, "")
      .trim();
    // Walk up to find the innermost block element as a fallback.
    let walker: Element | null = elNodeFromSelection(node);
    let foundBlock = "";
    while (walker && walker !== el) {
      const t = walker.tagName?.toLowerCase();
      if (
        t === "h1" ||
        t === "h2" ||
        t === "h3" ||
        t === "h4" ||
        t === "h5" ||
        t === "h6" ||
        t === "p" ||
        t === "pre" ||
        t === "blockquote"
      ) {
        foundBlock = t;
        break;
      }
      walker = walker.parentElement;
    }
    const blockTag = foundBlock || rawBlock;
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
  /* --- Headings — three behaviors:
         (a) Caret already inside the same heading (tap H1 while on an H1)
             → toggle OFF, demote to <p> in place.
         (b) Caret inside a different heading (tap H2 while on H1)
             → swap the tag in place, keeping the content.
         (c) Caret not inside a heading → build a fresh empty heading and
             insert it on the next line (never re-styles existing text). --- */
  const applyHeading = useCallback(
    (tag: "h1" | "h2" | "h3") => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const node = sel.anchorNode;
      if (!node || !el.contains(node)) return;

      const startEl = elNodeFromSelection(node);
      const existingHeading = startEl?.closest(
        "h1, h2, h3, h4, h5, h6"
      ) as HTMLElement | null;

      if (existingHeading && el.contains(existingHeading)) {
        const currentTag = existingHeading.tagName.toLowerCase();
        if (currentTag === tag) {
          // (a) Toggle off — convert heading back to a paragraph.
          const p = document.createElement("p");
          while (existingHeading.firstChild) {
            p.appendChild(existingHeading.firstChild);
          }
          if (!p.firstChild) p.appendChild(document.createElement("br"));
          existingHeading.replaceWith(p);
        } else {
          // (b) Swap heading level in place.
          const swapped = document.createElement(tag);
          while (existingHeading.firstChild) {
            swapped.appendChild(existingHeading.firstChild);
          }
          if (!swapped.firstChild)
            swapped.appendChild(document.createElement("br"));
          existingHeading.replaceWith(swapped);
        }
        flush();
        updateFormats();
        return;
      }

      // (c) Not inside a heading — create a new one on the next row.
      const heading = document.createElement(tag);
      heading.appendChild(document.createElement("br"));

      const block = currentBlock(node, el);
      if (block && block !== el) {
        if (isBlank(block)) {
          block.replaceWith(heading);
        } else {
          block.after(heading);
        }
      } else {
        let top: Node = node;
        while (top.parentNode && top.parentNode !== el) {
          top = top.parentNode;
        }
        if (top.parentNode === el) {
          const next = top.nextSibling;
          if (next) el.insertBefore(heading, next);
          else el.appendChild(heading);
        } else {
          el.appendChild(heading);
        }
      }

      placeCaretIn(heading);
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

  /* Font ± behaviour:
       - With a selection → wrap the selected text in <span style="font-size: N">.
       - With NO selection → insert an empty sized span (containing a
         zero-width space) and place the caret inside it, so the very next
         typed character inherits the new size. */
  const adjustFont = useCallback(
    (direction: 1 | -1) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

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

      if (range.collapsed) {
        // No selection — drop a sized empty span at the caret with a
        // zero-width space so the browser keeps the caret inside it.
        // Inserting *at* the caret means the span becomes a child of
        // the current inline parent (e.g. <b>), so bold/italic state
        // are preserved for anything the user types next.
        const zws = document.createTextNode("​");
        span.appendChild(zws);
        range.insertNode(span);
        const r = document.createRange();
        r.setStart(zws, 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        flush();
        updateFormats();
        return;
      }

      // For a real selection: prefer `surroundContents` — it wraps the
      // range in the new span WITHOUT stripping the surrounding inline
      // tags, so a selection entirely inside <b> stays inside <b> after
      // the resize. Fall back to extract+wrap only when the range
      // straddles element boundaries and surroundContents throws.
      try {
        try {
          range.surroundContents(span);
        } catch {
          const contents = range.extractContents();
          span.appendChild(contents);
          range.insertNode(span);
        }
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

  /* --- Code block — always lands on its own new line.
         If the current block is empty, we replace it with <pre>; if it has
         content we append the <pre> right after it (the typed text stays
         in its paragraph). A trailing empty <p> sits below so the user
         has a clickable line to escape into. --- */
  const insertCodeBlock = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = "#";
    pre.appendChild(code);

    const trailing = document.createElement("p");
    trailing.appendChild(document.createElement("br"));

    let inserted = false;
    if (sel && sel.rangeCount > 0) {
      const block = currentBlock(sel.anchorNode, el);
      if (block && block !== el) {
        if (isBlank(block)) {
          block.replaceWith(pre);
        } else {
          block.after(pre);
        }
        pre.after(trailing);
        inserted = true;
      }
    }
    if (!inserted) {
      el.appendChild(pre);
      el.appendChild(trailing);
    }

    // Caret at end of "#" so the user can keep typing right after it.
    const textNode = code.firstChild as Text | null;
    const range = document.createRange();
    if (textNode) {
      range.setStart(textNode, textNode.textContent?.length ?? 0);
    } else {
      range.setStart(code, code.childNodes.length);
    }
    range.collapse(true);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);

    flush();
    updateFormats();
  }, [flush, updateFormats]);

  /* --- Lists — checkbox / radio / bullet / numbered.
         Behaviour rules:
           • Tapping the *same* kind while already in that list → REMOVE
             it (unwrap items into paragraphs — toggle-off).
           • Tapping a *different* list kind → convert in place.
           • With a multi-line selection and no current list → wrap all
             selected lines in the requested list.
           • Otherwise → insert a fresh single-item list. --- */
  const insertList = useCallback(
    (kind: "cb" | "rb" | "ul" | "ol") => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      const node =
        sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null;
      const startEl = node ? elNodeFromSelection(node) : null;
      // Find any list ancestor — also try via the focusNode in case the
      // selection collapsed across boundaries during the click.
      let currentList: HTMLElement | null = null;
      if (startEl && el.contains(startEl)) {
        currentList = startEl.closest("ul, ol") as HTMLElement | null;
      }
      if (!currentList && sel?.focusNode) {
        const fEl = elNodeFromSelection(sel.focusNode);
        if (fEl && el.contains(fEl)) {
          currentList = fEl.closest("ul, ol") as HTMLElement | null;
        }
      }

      // Already in a list.
      if (currentList) {
        const currentKind = detectListKind(currentList);
        if (currentKind === kind) {
          // Toggle OFF — unwrap items back into paragraphs.
          unwrapList(currentList);
        } else {
          convertListInPlace(currentList, kind);
        }
        flush();
        updateFormats();
        return;
      }

      // Not in a list — plain bullet / numbered handle multi-line
      // selection natively via execCommand.
      if (kind === "ul" || kind === "ol") {
        exec(
          kind === "ul" ? "insertUnorderedList" : "insertOrderedList"
        );
        return;
      }

      // Checkbox / radio — piggy-back on execCommand for multi-line
      // handling, then swap the resulting <ul> class to our custom
      // marker.
      const cls = kind === "cb" ? "cb-list" : "rb-list";
      const hasSelection =
        sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
      if (hasSelection) {
        document.execCommand("insertUnorderedList");
        const after = window.getSelection();
        const afterNode =
          after && after.rangeCount > 0 ? after.anchorNode : null;
        const afterEl = afterNode
          ? elNodeFromSelection(afterNode)
          : null;
        const madeUl = afterEl?.closest("ul") as HTMLElement | null;
        if (madeUl) madeUl.className = cls;
        flush();
        updateFormats();
        return;
      }

      // No selection → fresh single-item list.
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
      // Keyboard shortcuts ----------------------------------------------
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === "b") {
          e.preventDefault();
          toggleBold();
          return;
        }
        if (k === "i") {
          e.preventDefault();
          toggleItalic();
          return;
        }
        if (k === "1" || k === "2" || k === "3") {
          e.preventDefault();
          applyHeading(`h${k}` as "h1" | "h2" | "h3");
          return;
        }
        if (k === "s") {
          // Manual "save" — flush whatever's pending right now.
          e.preventDefault();
          if (file) {
            void syncToServer(
              file.id,
              editorRef.current?.innerHTML ?? ""
            ).then((ok) => setStatus(ok ? "saved" : "failed"));
          }
          return;
        }
      }

      // Tab — insert a Word-style indent instead of moving focus out
      // of the editor. Shift-Tab could later be used to outdent.
      if (e.key === "Tab") {
        e.preventDefault();
        // Four non-breaking spaces render as a stable indent that
        // survives the HTML round-trip through the store.
        document.execCommand(
          "insertText",
          false,
          "    "
        );
        flush();
        return;
      }

      if (e.key !== "Enter") return;
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const node = sel.anchorNode;
      if (!node || !el.contains(node)) return;
      const startEl = elNodeFromSelection(node);

      // 1) Inside <pre><code> — exit on a trailing-blank-line Enter.
      const codeEl = startEl?.closest("pre");
      if (codeEl) {
        const codeText = codeEl.textContent ?? "";
        if (codeText.endsWith("\n")) {
          e.preventDefault();
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
          updateFormats();
          return;
        }
        return; // let default insert a newline inside the code block
      }

      // 2) Inside any <li> — on Enter at an empty item, exit the list.
      const li = startEl?.closest("li");
      if (li) {
        const liText = (li.textContent ?? "").replace(/​/g, "");
        const onlyBr = li.children.length === 1 && li.firstElementChild?.tagName === "BR";
        const isEmpty = liText.trim() === "" || onlyBr || li.innerHTML === "";
        if (isEmpty) {
          e.preventDefault();
          const list = li.parentElement;
          const p = document.createElement("p");
          p.appendChild(document.createElement("br"));
          if (list) {
            list.after(p);
            li.remove();
            if (list.children.length === 0) list.remove();
          } else {
            li.replaceWith(p);
          }
          placeCaretIn(p);
          flush();
          updateFormats();
          return;
        }
        // Non-empty li: let the browser create a new <li>. The new <li>
        // inherits the parent <ul class="cb-list|rb-list"> so the marker
        // is drawn by our CSS.
        return;
      }
    },
    [
      flush,
      updateFormats,
      toggleBold,
      toggleItalic,
      applyHeading,
      file,
      syncToServer,
    ]
  );

  /* Background click in the editor — place the caret where the user
     actually tapped (above / below / between blocks), not at the
     bottom. We map the click coordinates to a caret position via
     `caretRangeFromPoint`. If the resulting position lands inside a
     <pre> but the click was visually outside it, we escape to (or
     create) a sibling paragraph on the matching side. */
  const onEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = editorRef.current;
      if (!el) return;
      const target = e.target as Element;

      const ensureAdjacentP = (
        pre: HTMLElement,
        isAbove: boolean
      ): HTMLElement => {
        const sib = isAbove
          ? pre.previousElementSibling
          : pre.nextElementSibling;
        if (sib instanceof HTMLElement && sib.tagName !== "PRE") return sib;
        const p = document.createElement("p");
        p.appendChild(document.createElement("br"));
        if (isAbove) pre.before(p);
        else pre.after(p);
        return p;
      };

      // Browser-native caret placement is correct for clicks that hit a
      // real content element — leave it alone.
      if (target !== el) return;

      const x = e.clientX;
      const y = e.clientY;

      // 1) Try caret-from-point so the caret lands as close as possible
      //    to where the user actually clicked.
      type CaretPoint = {
        offsetNode: Node;
        offset: number;
      };
      const docAny = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => CaretPoint | null;
      };
      let range: Range | null = null;
      if (docAny.caretRangeFromPoint) {
        range = docAny.caretRangeFromPoint(x, y);
      } else if (docAny.caretPositionFromPoint) {
        const pos = docAny.caretPositionFromPoint(x, y);
        if (pos) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }

      if (range && el.contains(range.startContainer)) {
        // If the caret resolved to inside a <pre> but the click landed
        // visually above/below the code box, escape to the matching
        // sibling paragraph.
        const startEl =
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element)
            : range.startContainer.parentElement;
        const preAncestor = startEl?.closest("pre") as HTMLElement | null;
        if (preAncestor) {
          const preRect = preAncestor.getBoundingClientRect();
          if (y < preRect.top - 2 || y > preRect.bottom + 2) {
            const above = y < preRect.top;
            const p = ensureAdjacentP(preAncestor, above);
            placeCaretIn(p);
            flush();
            return;
          }
        }
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }

      // 2) Fallback: caret-from-point unavailable / off the document.
      //    Pick the block nearest to the click's y-coordinate and place
      //    the caret at its start (click above the block) or end
      //    (click below).
      const blocks = Array.from(el.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement
      );
      if (blocks.length === 0) return;

      let nearest: HTMLElement = blocks[0];
      let minDist = Infinity;
      for (const b of blocks) {
        const rect = b.getBoundingClientRect();
        let dist;
        if (y < rect.top) dist = rect.top - y;
        else if (y > rect.bottom) dist = y - rect.bottom;
        else dist = 0;
        if (dist < minDist) {
          minDist = dist;
          nearest = b;
        }
      }

      const nearestRect = nearest.getBoundingClientRect();
      const aboveBlock = y < nearestRect.top;

      // Click landed near a code block — pop out to the adjacent paragraph.
      if (nearest.tagName === "PRE") {
        const p = ensureAdjacentP(nearest, aboveBlock);
        placeCaretIn(p);
        flush();
        return;
      }

      // Place caret at the start of the nearest block when clicked
      // above it, at the end when clicked below.
      const r = document.createRange();
      r.selectNodeContents(nearest);
      r.collapse(aboveBlock);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
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
      {/* Sticky editor header — action row + format toolbar stay pinned to
          the top of the workspace so you never have to scroll up to reach
          a formatting button. */}
      <div className="relative sticky top-0 z-20 px-8 pt-6 pb-3 bg-[var(--background)] border-b border-[var(--border)]">
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
          <SyncBadge status={status} onRetry={retrySync} />
          {/* Pomodoro timer — absolute-centered over the action row so
              it always sits in the top-middle regardless of how long
              the left / right button clusters get. */}
          <div className="absolute left-1/2 top-6 -translate-x-1/2 z-10">
            <PomodoroTimer />
          </div>
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
              const folderName = folder?.name;
              exportNoteAsMarkdown(file, folderName);
            }}
            className="p-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
            aria-label="Download as Markdown"
            title="Download as Markdown"
          >
            <DownloadIcon size={14} />
          </button>
          <button
            onClick={async () => {
              const ok = await dialog.confirm({
                title: "Delete note",
                message: `Delete note “${file.title}”?\n\nThis cannot be undone.`,
                okLabel: "Delete",
                tone: "danger",
              });
              if (ok)
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
          applyHeading={applyHeading}
          applyAlign={applyAlign}
          adjustFont={adjustFont}
          insertCodeBlock={insertCodeBlock}
          insertList={insertList}
          insertDivider={insertDivider}
          wordCount={wordCount}
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
        onClick={onEditorClick}
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

function elNodeFromSelection(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function placeCaretIn(el: HTMLElement) {
  const r = document.createRange();
  r.setStart(el, 0);
  r.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

/**
 * Convert an existing list (ul / ul.cb-list / ul.rb-list / ol) to any of
 * the four kinds. Works for every direction:
 *   ul ↔ ol            (different tag → swap tag)
 *   ul ↔ ul.cb-list    (same tag → swap class)
 *   ol ↔ ul.cb-list    (different tag AND different class)
 *   …all 16 combinations.
 *
 * Caret position is saved and restored explicitly because some browsers
 * detach the selection when `replaceChild` mutates the DOM.
 */
/** Which of our four list kinds does this <ul>/<ol> represent? */
function detectListKind(
  list: HTMLElement
): "cb" | "rb" | "ul" | "ol" {
  if (list.tagName.toLowerCase() === "ol") return "ol";
  if (list.classList.contains("cb-list")) return "cb";
  if (list.classList.contains("rb-list")) return "rb";
  return "ul";
}

/** Toggle a list off by replacing it with paragraphs — one per <li>. */
function unwrapList(list: HTMLElement) {
  const parent = list.parentNode;
  if (!parent) return;
  const frag = document.createDocumentFragment();
  Array.from(list.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    const p = document.createElement("p");
    while (child.firstChild) p.appendChild(child.firstChild);
    if (!p.firstChild) p.appendChild(document.createElement("br"));
    frag.appendChild(p);
  });
  parent.replaceChild(frag, list);
}

function convertListInPlace(
  list: HTMLElement,
  kind: "cb" | "rb" | "ul" | "ol"
) {
  const newTag = kind === "ol" ? "ol" : "ul";
  const newClass =
    kind === "cb" ? "cb-list" : kind === "rb" ? "rb-list" : "";

  // Snapshot the caret so we can re-anchor it after DOM swap.
  const sel = window.getSelection();
  let savedNode: Node | null = null;
  let savedOffset = 0;
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    savedNode = r.startContainer;
    savedOffset = r.startOffset;
  }

  const restoreCaret = () => {
    if (!sel || !savedNode) return;
    if (!savedNode.isConnected && !document.contains(savedNode)) return;
    try {
      const max =
        savedNode.nodeType === Node.TEXT_NODE
          ? (savedNode.textContent?.length ?? 0)
          : savedNode.childNodes.length;
      const r = document.createRange();
      r.setStart(savedNode, Math.min(savedOffset, max));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch {
      /* ignore */
    }
  };

  // Strip any per-item list-style inline styles (browsers occasionally
  // leave behind `list-style-type` on <li>s from execCommand) so the new
  // marker can render cleanly.
  const cleanListItems = (host: HTMLElement) => {
    host.querySelectorAll("li").forEach((li) => {
      if (li instanceof HTMLElement) {
        li.style.removeProperty("list-style");
        li.style.removeProperty("list-style-type");
      }
    });
  };

  const currentTag = list.tagName.toLowerCase();

  // Same tag — just adjust the class (covers ul ↔ ul.cb-list ↔ ul.rb-list).
  if (currentTag === newTag) {
    list.className = newClass;
    cleanListItems(list);
    restoreCaret();
    return;
  }

  // Different tag — swap the wrapper element.
  const parent = list.parentNode;
  if (!parent) return;
  const replacement = document.createElement(newTag);
  if (newClass) replacement.className = newClass;
  while (list.firstChild) replacement.appendChild(list.firstChild);
  parent.replaceChild(replacement, list);
  cleanListItems(replacement);
  restoreCaret();
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

      {/* Checkbox + Radio share one group */}
      <TbGroup>
        <TbButton
          title="Checklist"
          active={formats.cb}
          onClick={() => insertList("cb")}
        >
          <ListGlyph kind="check" />
        </TbButton>
        <TbButton
          title="Radio list"
          active={formats.rb}
          onClick={() => insertList("rb")}
        >
          <ListGlyph kind="radio" />
        </TbButton>
      </TbGroup>

      {/* Bullet + Numbered share one group */}
      <TbGroup>
        <TbButton
          title="Bullet list"
          active={formats.ul && !formats.cb && !formats.rb}
          onClick={() => insertList("ul")}
        >
          <ListGlyph kind="bullet" />
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
          ? "bg-[var(--foreground)] text-[var(--surface)] shadow-sm"
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

function SyncBadge({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tabular-nums select-none";
  if (status === "editing") {
    return (
      <span
        className={`${base} bg-[var(--surface-2)] text-[var(--muted)]`}
        title="You have unsaved changes — syncing in 5s"
      >
        <span className="inline-block size-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
        Editing…
      </span>
    );
  }
  if (status === "syncing") {
    return (
      <span
        className={`${base} bg-[var(--surface-2)] text-[var(--muted)]`}
        title="Saving to cloud"
      >
        <span className="inline-block size-3 rounded-full border border-[var(--accent)] border-t-transparent animate-spin" />
        Syncing…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={`${base} text-[var(--danger)] border border-[var(--danger)]/40 bg-[var(--danger)]/5 hover:bg-[var(--danger)]/10`}
        title="Sync failed — click to retry"
      >
        ⚠ Sync failed · retry
      </button>
    );
  }
  return (
    <span
      className={`${base} text-[var(--muted)]`}
      title="All changes saved"
    >
      <CheckIcon size={11} /> Saved
    </span>
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
