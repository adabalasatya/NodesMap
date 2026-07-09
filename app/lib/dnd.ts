/* Shared drag-and-drop payload helpers.

   Native HTML5 DnD is fine for the moving-files-and-folders UX, but the
   `dataTransfer` API is stringy and awkward. This module wraps it so
   every callsite marshals the same JSON shape under a private MIME
   type, and typos become type errors instead of silent no-drops. */

export const DND_MIME = "application/x-nodesmap-item";

export type DragItem =
  | { kind: "folder"; id: string }
  | { kind: "file"; id: string };

export function setDragItem(dt: DataTransfer, item: DragItem) {
  const json = JSON.stringify(item);
  dt.setData(DND_MIME, json);
  // Plain-text fallback so a drag onto a browser tab / external app
  // degrades to a meaningful string instead of silence.
  dt.setData("text/plain", `${item.kind}:${item.id}`);
  dt.effectAllowed = "move";
}

export function readDragItem(dt: DataTransfer): DragItem | null {
  const raw = dt.getData(DND_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragItem;
    if (
      parsed &&
      (parsed.kind === "folder" || parsed.kind === "file") &&
      typeof parsed.id === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** `dragover` fires ~60x/sec — inspecting `dataTransfer.types` (an array
    of MIME strings the source added) avoids parsing JSON per event. */
export function hasNodesMapPayload(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes(DND_MIME);
}
