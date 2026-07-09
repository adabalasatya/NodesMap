import type { AppState } from "./store";
import type { NoteFile } from "./types";

/* ----------------------- HTML → Markdown ----------------------- */

/**
 * Convert the editor's stored HTML to a reasonable Markdown approximation.
 * Not a full parser — covers the formats the editor itself can produce:
 * headings, paragraphs, lists, code blocks, inline code, bold, italic,
 * strikethrough, hr, links, and the cb-list / rb-list checkboxes.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return "";
  return walk(root).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function walk(el: Node, depth = 0): string {
  if (el.nodeType === Node.TEXT_NODE) return el.textContent ?? "";
  if (el.nodeType !== Node.ELEMENT_NODE) return "";
  const e = el as HTMLElement;
  const tag = e.tagName.toLowerCase();
  const children = () =>
    Array.from(e.childNodes).map((c) => walk(c, depth + 1)).join("");

  switch (tag) {
    case "h1":
      return `\n# ${children().trim()}\n\n`;
    case "h2":
      return `\n## ${children().trim()}\n\n`;
    case "h3":
      return `\n### ${children().trim()}\n\n`;
    case "h4":
      return `\n#### ${children().trim()}\n\n`;
    case "p":
    case "div": {
      const inner = children().trim();
      return inner ? `${inner}\n\n` : "";
    }
    case "br":
      return "\n";
    case "hr":
      return "\n---\n\n";
    case "strong":
    case "b":
      return `**${children()}**`;
    case "em":
    case "i":
      return `*${children()}*`;
    case "s":
    case "del":
    case "strike":
      return `~~${children()}~~`;
    case "code":
      // <pre><code> handled below
      if (e.parentElement?.tagName.toLowerCase() === "pre") return children();
      return `\`${children()}\``;
    case "pre": {
      // Read from the inner <code> child (if present) so any UI-only
      // chip like the editor's Text/Code toggle never gets serialised
      // into the exported markdown.
      const codeEl = e.querySelector(":scope > code");
      const raw = (codeEl?.textContent ?? e.textContent ?? "").replace(
        /\n+$/,
        ""
      );
      return `\n\`\`\`\n${raw}\n\`\`\`\n\n`;
    }
    case "a": {
      const href = e.getAttribute("href") ?? "";
      return `[${children()}](${href})`;
    }
    case "ul": {
      const cls = e.getAttribute("class") ?? "";
      const marker =
        cls.includes("cb-list") ? "- [ ] " :
        cls.includes("rb-list") ? "- ( ) " :
        "- ";
      return (
        "\n" +
        Array.from(e.children)
          .filter((c) => c.tagName.toLowerCase() === "li")
          .map((li) => `${"  ".repeat(depth)}${marker}${walk(li, depth + 1).trim()}`)
          .join("\n") +
        "\n\n"
      );
    }
    case "ol": {
      return (
        "\n" +
        Array.from(e.children)
          .filter((c) => c.tagName.toLowerCase() === "li")
          .map(
            (li, i) =>
              `${"  ".repeat(depth)}${i + 1}. ${walk(li, depth + 1).trim()}`
          )
          .join("\n") +
        "\n\n"
      );
    }
    case "li":
      return children();
    case "blockquote":
      return (
        "\n" +
        children()
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") +
        "\n\n"
      );
    default:
      return children();
  }
}

/* ----------------------- Triggers ----------------------- */

function download(filename: string, content: string, mime: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

function safeName(s: string, fallback: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned || fallback;
}

export function exportNoteAsMarkdown(file: NoteFile, folderName?: string) {
  const md = htmlToMarkdown(file.content || "");
  const front =
    `# ${file.title}\n\n` +
    (folderName ? `_Folder: ${folderName}_\n\n` : "");
  const body = md.startsWith("#") ? md : front + md;
  download(`${safeName(file.title.replace(/\.md$/i, ""), "note")}.md`, body, "text/markdown");
}

export function exportWorkspaceAsJson(state: AppState) {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    folders: state.folders,
    files: state.files,
    tasks: state.tasks,
    streak: state.streak,
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  download(
    `nodesmap-export-${stamp}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
}
