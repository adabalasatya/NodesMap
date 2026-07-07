/* Drawing data lives alongside note HTML inside the same file.content
   string. It's serialised as an HTML comment appended at the very end
   of the text HTML, e.g.:

     <p>note text…</p>
     <!--__NODESMAP_DRAW__:eyJzaGFwZXMiOlt...-->

   Comments do not affect the `:empty` CSS selector, do not render, and
   round-trip cleanly through `innerHTML`. Encoding is Base64 (of the
   UTF-8 JSON) so any character inside the JSON is safe to sit inside
   a comment without accidentally producing "-->". */

export type Shape =
  | RectShape
  | EllipseShape
  | DiamondShape
  | LineShape
  | ArrowShape
  | FreehandShape
  | TextShape;

export interface ShapeBase {
  id: string;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
  opacity: number;
}
export interface RectShape extends ShapeBase {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface EllipseShape extends ShapeBase {
  type: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DiamondShape extends ShapeBase {
  type: "diamond";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LineShape extends ShapeBase {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface ArrowShape extends ShapeBase {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface FreehandShape extends ShapeBase {
  type: "freehand";
  points: [number, number][];
}
export interface TextShape extends ShapeBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface Drawing {
  shapes: Shape[];
  /** Reserved for future viewport persistence (pan/zoom). */
  view?: { x: number; y: number; zoom: number };
}

const MARK_START = "<!--__NODESMAP_DRAW__:";
const MARK_END = "-->";

const emptyDrawing: Drawing = { shapes: [] };

function utf8ToBase64(input: string): string {
  if (typeof window === "undefined") return "";
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return window.btoa(bin);
}

function base64ToUtf8(input: string): string {
  if (typeof window === "undefined") return "";
  try {
    const bin = window.atob(input);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/** Split file.content into the text-editor HTML and the parsed drawing. */
export function extractDrawing(content: string): {
  html: string;
  drawing: Drawing;
} {
  const startIdx = content.lastIndexOf(MARK_START);
  if (startIdx < 0) return { html: content, drawing: { ...emptyDrawing } };
  const endIdx = content.indexOf(MARK_END, startIdx + MARK_START.length);
  if (endIdx < 0) return { html: content, drawing: { ...emptyDrawing } };
  const encoded = content.slice(startIdx + MARK_START.length, endIdx);
  const json = base64ToUtf8(encoded);
  const html = content.slice(0, startIdx) + content.slice(endIdx + MARK_END.length);
  if (!json) return { html, drawing: { ...emptyDrawing } };
  try {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.shapes)) {
      return { html, drawing: { ...emptyDrawing } };
    }
    return { html, drawing: parsed as Drawing };
  } catch {
    return { html, drawing: { ...emptyDrawing } };
  }
}

/** Merge text HTML and a drawing back into a single file.content string.
    Empty drawings (no shapes) are dropped so we don't clutter round-trips
    for notes that never use the canvas. */
export function embedDrawing(html: string, drawing: Drawing): string {
  const stripped = extractDrawing(html).html;
  if (!drawing.shapes.length && !drawing.view) return stripped;
  const encoded = utf8ToBase64(JSON.stringify(drawing));
  const sep = stripped.endsWith("\n") ? "" : "\n";
  return `${stripped}${sep}${MARK_START}${encoded}${MARK_END}`;
}

export function makeId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
