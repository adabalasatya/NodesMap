"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Drawing,
  Shape,
  ShapeBase,
  RectShape,
  EllipseShape,
  DiamondShape,
  LineShape,
  ArrowShape,
  FreehandShape,
  TextShape,
} from "../lib/drawStore";
import { makeId } from "../lib/drawStore";

type Tool =
  | "select"
  | "hand"
  | "rect"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "freehand"
  | "text"
  | "eraser";

const STROKE_COLORS = [
  "#111111",
  "#e11d48",
  "#f59e0b",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
];
const FILL_COLORS = [
  "transparent",
  "#fee2e2",
  "#fef3c7",
  "#dcfce7",
  "#dbeafe",
  "#ede9fe",
];
const STROKE_WIDTHS = [1, 2, 4, 6];

const HIT_PADDING = 8;

interface Props {
  drawing: Drawing;
  onChange: (next: Drawing) => void;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export default function DrawCanvas({ drawing, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [stroke, setStroke] = useState<string>("#111111");
  const [fill, setFill] = useState<string>("transparent");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<Viewport>(() => ({
    x: drawing.view?.x ?? 0,
    y: drawing.view?.y ?? 0,
    zoom: drawing.view?.zoom ?? 1,
  }));

  // In-progress drag state kept out of React to avoid re-render thrash.
  // `startShape` is the shape captured at mousedown (for translation
  // deltas), `drawing` is the shape currently being drawn.
  const dragRef = useRef<{
    kind: "draw" | "move" | "pan" | "text-caret" | "none";
    startX: number;
    startY: number;
    startShape?: Shape;
    workingId?: string;
    lastX?: number;
    lastY?: number;
  }>({ kind: "none", startX: 0, startY: 0 });

  const shapes = drawing.shapes;

  // Undo / redo — local (not synced across sessions). Keeps last 40 states.
  const undoStack = useRef<Shape[][]>([]);
  const redoStack = useRef<Shape[][]>([]);

  const commit = useCallback(
    (nextShapes: Shape[]) => {
      undoStack.current.push(shapes);
      if (undoStack.current.length > 40) undoStack.current.shift();
      redoStack.current = [];
      onChange({ ...drawing, shapes: nextShapes });
    },
    [drawing, onChange, shapes]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(shapes);
    onChange({ ...drawing, shapes: prev });
  }, [drawing, onChange, shapes]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(shapes);
    onChange({ ...drawing, shapes: next });
  }, [drawing, onChange, shapes]);

  const clearAll = useCallback(() => {
    if (!shapes.length) return;
    commit([]);
    setSelectedId(null);
  }, [commit, shapes.length]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(shapes.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  }, [commit, selectedId, shapes]);

  // Convert client (mouse) coords into world (drawing) coords.
  const clientToWorld = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const svg = svgRef.current;
      if (!svg) return [0, 0];
      const rect = svg.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      return [px / view.zoom + view.x, py / view.zoom + view.y];
    },
    [view]
  );

  const baseProps = useMemo<ShapeBase>(
    () => ({
      id: "",
      stroke,
      strokeWidth,
      fill: fill === "transparent" ? null : fill,
      opacity: 1,
    }),
    [stroke, strokeWidth, fill]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      svg.setPointerCapture(e.pointerId);
      const [wx, wy] = clientToWorld(e.clientX, e.clientY);

      // Hand tool = pan
      if (tool === "hand" || e.button === 1 || e.shiftKey) {
        dragRef.current = {
          kind: "pan",
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
        };
        return;
      }

      // Select tool — hit-test top-most shape at wx/wy
      if (tool === "select") {
        const hit = hitTest(shapes, wx, wy, view.zoom);
        setSelectedId(hit?.id ?? null);
        if (hit) {
          dragRef.current = {
            kind: "move",
            startX: wx,
            startY: wy,
            startShape: hit,
          };
        } else {
          dragRef.current = { kind: "none", startX: wx, startY: wy };
        }
        return;
      }

      if (tool === "eraser") {
        const hit = hitTest(shapes, wx, wy, view.zoom);
        if (hit) commit(shapes.filter((s) => s.id !== hit.id));
        dragRef.current = { kind: "none", startX: wx, startY: wy };
        return;
      }

      if (tool === "text") {
        const text = window.prompt("Text:", "");
        if (text != null && text.trim() !== "") {
          const shape: TextShape = {
            ...baseProps,
            id: makeId(),
            type: "text",
            x: wx,
            y: wy,
            text,
            fontSize: 20,
          };
          commit([...shapes, shape]);
        }
        dragRef.current = { kind: "none", startX: wx, startY: wy };
        return;
      }

      // Freehand / shape drawing
      const id = makeId();
      let working: Shape;
      if (tool === "freehand") {
        working = {
          ...baseProps,
          id,
          type: "freehand",
          points: [[wx, wy]],
        } as FreehandShape;
      } else if (tool === "line") {
        working = {
          ...baseProps,
          id,
          type: "line",
          x1: wx,
          y1: wy,
          x2: wx,
          y2: wy,
        } as LineShape;
      } else if (tool === "arrow") {
        working = {
          ...baseProps,
          id,
          type: "arrow",
          x1: wx,
          y1: wy,
          x2: wx,
          y2: wy,
        } as ArrowShape;
      } else if (tool === "ellipse") {
        working = {
          ...baseProps,
          id,
          type: "ellipse",
          x: wx,
          y: wy,
          w: 0,
          h: 0,
        } as EllipseShape;
      } else if (tool === "diamond") {
        working = {
          ...baseProps,
          id,
          type: "diamond",
          x: wx,
          y: wy,
          w: 0,
          h: 0,
        } as DiamondShape;
      } else {
        working = {
          ...baseProps,
          id,
          type: "rect",
          x: wx,
          y: wy,
          w: 0,
          h: 0,
        } as RectShape;
      }
      undoStack.current.push(shapes);
      if (undoStack.current.length > 40) undoStack.current.shift();
      redoStack.current = [];
      onChange({ ...drawing, shapes: [...shapes, working] });
      dragRef.current = {
        kind: "draw",
        startX: wx,
        startY: wy,
        workingId: id,
      };
    },
    [
      baseProps,
      clientToWorld,
      commit,
      drawing,
      onChange,
      shapes,
      tool,
      view.zoom,
    ]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const st = dragRef.current;
      if (st.kind === "none") return;

      if (st.kind === "pan") {
        const dx = e.clientX - (st.lastX ?? e.clientX);
        const dy = e.clientY - (st.lastY ?? e.clientY);
        st.lastX = e.clientX;
        st.lastY = e.clientY;
        setView((v) => ({ ...v, x: v.x - dx / v.zoom, y: v.y - dy / v.zoom }));
        return;
      }

      const [wx, wy] = clientToWorld(e.clientX, e.clientY);

      if (st.kind === "move" && st.startShape) {
        const dx = wx - st.startX;
        const dy = wy - st.startY;
        const next = shapes.map((s) => {
          if (s.id !== st.startShape!.id) return s;
          return translate(st.startShape as Shape, dx, dy);
        });
        onChange({ ...drawing, shapes: next });
        return;
      }

      if (st.kind === "draw" && st.workingId) {
        const next = shapes.map((s) => {
          if (s.id !== st.workingId) return s;
          return extend(s, st.startX, st.startY, wx, wy, e.shiftKey);
        });
        onChange({ ...drawing, shapes: next });
      }
    },
    [clientToWorld, drawing, onChange, shapes]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (svg && svg.hasPointerCapture(e.pointerId)) {
        svg.releasePointerCapture(e.pointerId);
      }
      // Drop zero-size shapes created by an accidental click.
      const st = dragRef.current;
      if (st.kind === "draw" && st.workingId) {
        const s = shapes.find((x) => x.id === st.workingId);
        if (s && isDegenerate(s)) {
          onChange({ ...drawing, shapes: shapes.filter((x) => x.id !== s.id) });
        }
      }
      dragRef.current = { kind: "none", startX: 0, startY: 0 };
    },
    [drawing, onChange, shapes]
  );

  // Wheel: zoom in/out around the cursor.
  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((v) => {
        const nextZoom = Math.max(0.2, Math.min(4, v.zoom * factor));
        const nx = v.x + mx / v.zoom - mx / nextZoom;
        const ny = v.y + my / v.zoom - my / nextZoom;
        return { x: nx, y: ny, zoom: nextZoom };
      });
    },
    []
  );

  // Keyboard shortcuts scoped to the canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only when the canvas has focus (or when nothing else has it).
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target !== document.body &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      // Tool shortcuts (v/h/r/o/d/l/a/p/t/e).
      const keyToTool: Record<string, Tool> = {
        v: "select",
        h: "hand",
        r: "rect",
        o: "ellipse",
        d: "diamond",
        l: "line",
        a: "arrow",
        p: "freehand",
        t: "text",
        e: "eraser",
      };
      const t = keyToTool[e.key.toLowerCase()];
      if (t) {
        setTool(t);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, redo, selectedId, undo]);

  return (
    <div className="relative flex-1 overflow-hidden bg-[var(--surface)] flex">
      <Toolbar
        tool={tool}
        setTool={setTool}
        stroke={stroke}
        setStroke={setStroke}
        fill={fill}
        setFill={setFill}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        undo={undo}
        redo={redo}
        clearAll={clearAll}
        deleteSelected={deleteSelected}
        hasSelection={!!selectedId}
        zoom={view.zoom}
        resetZoom={() =>
          setView({ x: 0, y: 0, zoom: 1 })
        }
      />
      <svg
        ref={svgRef}
        className="flex-1 select-none touch-none"
        style={{
          cursor:
            tool === "hand"
              ? "grab"
              : tool === "text"
              ? "text"
              : tool === "eraser"
              ? "cell"
              : tool === "select"
              ? "default"
              : "crosshair",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {/* Grid background so the canvas doesn't feel like a void. */}
        <defs>
          <pattern
            id="grid"
            x={-view.x * view.zoom}
            y={-view.y * view.zoom}
            width={20 * view.zoom}
            height={20 * view.zoom}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={1}
              cy={1}
              r={1}
              fill="var(--border)"
              opacity={0.6}
            />
          </pattern>
          <marker
            id="arrow-head"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g transform={`translate(${-view.x * view.zoom} ${-view.y * view.zoom}) scale(${view.zoom})`}>
          {shapes.map((s) => (
            <ShapeView
              key={s.id}
              shape={s}
              selected={s.id === selectedId}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ------------------ Toolbar ------------------ */

function Toolbar({
  tool,
  setTool,
  stroke,
  setStroke,
  fill,
  setFill,
  strokeWidth,
  setStrokeWidth,
  undo,
  redo,
  clearAll,
  deleteSelected,
  hasSelection,
  zoom,
  resetZoom,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  stroke: string;
  setStroke: (c: string) => void;
  fill: string;
  setFill: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (n: number) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  deleteSelected: () => void;
  hasSelection: boolean;
  zoom: number;
  resetZoom: () => void;
}) {
  return (
    <div className="w-14 border-r border-[var(--border)] bg-[var(--background)] flex flex-col items-center py-3 gap-1 overflow-y-auto">
      <ToolBtn label="Select (V)" active={tool === "select"} onClick={() => setTool("select")}>
        <CursorGlyph />
      </ToolBtn>
      <ToolBtn label="Hand — pan (H)" active={tool === "hand"} onClick={() => setTool("hand")}>
        <HandGlyph />
      </ToolBtn>
      <Divider />
      <ToolBtn label="Rectangle (R)" active={tool === "rect"} onClick={() => setTool("rect")}>
        <RectGlyph />
      </ToolBtn>
      <ToolBtn label="Ellipse (O)" active={tool === "ellipse"} onClick={() => setTool("ellipse")}>
        <EllipseGlyph />
      </ToolBtn>
      <ToolBtn label="Diamond (D)" active={tool === "diamond"} onClick={() => setTool("diamond")}>
        <DiamondGlyph />
      </ToolBtn>
      <ToolBtn label="Line (L)" active={tool === "line"} onClick={() => setTool("line")}>
        <LineGlyph />
      </ToolBtn>
      <ToolBtn label="Arrow (A)" active={tool === "arrow"} onClick={() => setTool("arrow")}>
        <ArrowGlyph />
      </ToolBtn>
      <ToolBtn label="Freehand (P)" active={tool === "freehand"} onClick={() => setTool("freehand")}>
        <PenGlyph />
      </ToolBtn>
      <ToolBtn label="Text (T)" active={tool === "text"} onClick={() => setTool("text")}>
        <TextGlyph />
      </ToolBtn>
      <ToolBtn label="Eraser (E)" active={tool === "eraser"} onClick={() => setTool("eraser")}>
        <EraserGlyph />
      </ToolBtn>
      <Divider />
      <ToolBtn label="Undo (Ctrl+Z)" onClick={undo}>
        <UndoGlyph />
      </ToolBtn>
      <ToolBtn label="Redo (Ctrl+Shift+Z)" onClick={redo}>
        <RedoGlyph />
      </ToolBtn>
      <ToolBtn
        label="Delete selected"
        onClick={deleteSelected}
        disabled={!hasSelection}
      >
        <TrashGlyph />
      </ToolBtn>
      <ToolBtn label="Clear canvas" onClick={clearAll}>
        <ClearGlyph />
      </ToolBtn>
      <Divider />
      <div className="flex flex-col items-center gap-1 py-1">
        <span className="text-[9px] tracking-wider uppercase text-[var(--muted)]">
          Stroke
        </span>
        {STROKE_COLORS.map((c) => (
          <button
            key={c}
            title={c}
            aria-label={`Stroke ${c}`}
            onClick={() => setStroke(c)}
            className={`size-5 rounded-full border ${
              stroke === c ? "ring-2 ring-[var(--foreground)]" : ""
            }`}
            style={{ background: c, borderColor: "var(--border)" }}
          />
        ))}
      </div>
      <Divider />
      <div className="flex flex-col items-center gap-1 py-1">
        <span className="text-[9px] tracking-wider uppercase text-[var(--muted)]">
          Fill
        </span>
        {FILL_COLORS.map((c) => (
          <button
            key={c}
            title={c === "transparent" ? "No fill" : c}
            aria-label={c === "transparent" ? "No fill" : `Fill ${c}`}
            onClick={() => setFill(c)}
            className={`size-5 rounded border grid place-items-center ${
              fill === c ? "ring-2 ring-[var(--foreground)]" : ""
            }`}
            style={{
              background: c === "transparent" ? "var(--background)" : c,
              borderColor: "var(--border)",
            }}
          >
            {c === "transparent" && (
              <span className="text-[10px] text-[var(--muted)] leading-none">
                ø
              </span>
            )}
          </button>
        ))}
      </div>
      <Divider />
      <div className="flex flex-col items-center gap-1 py-1">
        <span className="text-[9px] tracking-wider uppercase text-[var(--muted)]">
          Width
        </span>
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            title={`${w}px`}
            aria-label={`Stroke width ${w}`}
            onClick={() => setStrokeWidth(w)}
            className={`size-5 rounded grid place-items-center border ${
              strokeWidth === w ? "ring-2 ring-[var(--foreground)]" : ""
            }`}
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="block rounded-full bg-[var(--foreground)]"
              style={{ width: w * 2, height: w * 2 }}
            />
          </button>
        ))}
      </div>
      <Divider />
      <button
        onClick={resetZoom}
        title="Reset zoom"
        className="text-[9px] tabular-nums text-[var(--muted)] hover:text-[var(--foreground)] py-1"
      >
        {Math.round(zoom * 100)}%
      </button>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      disabled={disabled}
      className={`size-9 grid place-items-center rounded-md transition ${
        active
          ? "bg-[var(--foreground)] text-[var(--surface)]"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-6 h-px bg-[var(--border)] my-1" />;
}

/* ------------------ Shape rendering ------------------ */

function ShapeView({ shape, selected }: { shape: Shape; selected: boolean }) {
  const stroke = shape.stroke;
  const fill = shape.fill ?? "none";
  const sw = shape.strokeWidth;

  const sel = selected ? (
    <SelectionRect bbox={boundingBox(shape)} />
  ) : null;

  if (shape.type === "rect") {
    return (
      <g>
        <rect
          x={shape.x}
          y={shape.y}
          width={Math.abs(shape.w)}
          height={Math.abs(shape.h)}
          transform={`translate(${shape.w < 0 ? shape.w : 0} ${shape.h < 0 ? shape.h : 0})`}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
          rx={4}
        />
        {sel}
      </g>
    );
  }
  if (shape.type === "ellipse") {
    const w = Math.abs(shape.w);
    const h = Math.abs(shape.h);
    const cx = shape.x + shape.w / 2;
    const cy = shape.y + shape.h / 2;
    return (
      <g>
        <ellipse
          cx={cx}
          cy={cy}
          rx={w / 2}
          ry={h / 2}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
        />
        {sel}
      </g>
    );
  }
  if (shape.type === "diamond") {
    const cx = shape.x + shape.w / 2;
    const cy = shape.y + shape.h / 2;
    const dx = shape.w / 2;
    const dy = shape.h / 2;
    const d = `M ${cx} ${cy - dy} L ${cx + dx} ${cy} L ${cx} ${cy + dy} L ${cx - dx} ${cy} Z`;
    return (
      <g>
        <path d={d} stroke={stroke} strokeWidth={sw} fill={fill} />
        {sel}
      </g>
    );
  }
  if (shape.type === "line") {
    return (
      <g>
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
        />
        {sel}
      </g>
    );
  }
  if (shape.type === "arrow") {
    return (
      <g style={{ color: stroke }}>
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          markerEnd="url(#arrow-head)"
        />
        {sel}
      </g>
    );
  }
  if (shape.type === "freehand") {
    const d = smoothPath(shape.points);
    return (
      <g>
        <path
          d={d}
          stroke={stroke}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {sel}
      </g>
    );
  }
  if (shape.type === "text") {
    return (
      <g>
        <text
          x={shape.x}
          y={shape.y}
          fontSize={shape.fontSize}
          fill={stroke}
          fontFamily="var(--font-geist-sans), system-ui, sans-serif"
        >
          {shape.text}
        </text>
        {sel}
      </g>
    );
  }
  return null;
}

function SelectionRect({ bbox }: { bbox: BBox }) {
  const pad = 4;
  return (
    <rect
      x={bbox.x - pad}
      y={bbox.y - pad}
      width={bbox.w + pad * 2}
      height={bbox.h + pad * 2}
      fill="none"
      stroke="var(--accent)"
      strokeDasharray="4 3"
      strokeWidth={1}
    />
  );
}

/* ------------------ Geometry helpers ------------------ */

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boundingBox(s: Shape): BBox {
  if (s.type === "rect" || s.type === "ellipse" || s.type === "diamond") {
    return {
      x: Math.min(s.x, s.x + s.w),
      y: Math.min(s.y, s.y + s.h),
      w: Math.abs(s.w),
      h: Math.abs(s.h),
    };
  }
  if (s.type === "line" || s.type === "arrow") {
    return {
      x: Math.min(s.x1, s.x2),
      y: Math.min(s.y1, s.y2),
      w: Math.abs(s.x2 - s.x1),
      h: Math.abs(s.y2 - s.y1),
    };
  }
  if (s.type === "freehand") {
    if (!s.points.length) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  // text — rough box from fontSize; SVG can't give us metrics without a
  // measurement pass, so this is enough for hit-testing and selection.
  const approxW = Math.max(s.text.length, 1) * (s.fontSize * 0.55);
  return { x: s.x, y: s.y - s.fontSize, w: approxW, h: s.fontSize * 1.2 };
}

function translate(s: Shape, dx: number, dy: number): Shape {
  if (s.type === "rect" || s.type === "ellipse" || s.type === "diamond") {
    return { ...s, x: s.x + dx, y: s.y + dy };
  }
  if (s.type === "line" || s.type === "arrow") {
    return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  }
  if (s.type === "freehand") {
    return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy]) };
  }
  return { ...s, x: s.x + dx, y: s.y + dy };
}

function extend(
  s: Shape,
  startX: number,
  startY: number,
  wx: number,
  wy: number,
  shiftKey: boolean
): Shape {
  if (s.type === "rect" || s.type === "ellipse" || s.type === "diamond") {
    let w = wx - startX;
    let h = wy - startY;
    if (shiftKey) {
      const size = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * size;
      h = Math.sign(h || 1) * size;
    }
    return { ...s, x: startX, y: startY, w, h };
  }
  if (s.type === "line" || s.type === "arrow") {
    let x2 = wx;
    let y2 = wy;
    if (shiftKey) {
      // Snap to 45° increments.
      const dx = wx - startX;
      const dy = wy - startY;
      const ang = Math.atan2(dy, dx);
      const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      x2 = startX + Math.cos(snap) * len;
      y2 = startY + Math.sin(snap) * len;
    }
    return { ...s, x1: startX, y1: startY, x2, y2 };
  }
  if (s.type === "freehand") {
    const last = s.points[s.points.length - 1];
    // Skip if new point is essentially the same as the last one to keep
    // the polyline compact.
    if (last && Math.hypot(last[0] - wx, last[1] - wy) < 1.5) return s;
    return { ...s, points: [...s.points, [wx, wy]] };
  }
  return s;
}

function isDegenerate(s: Shape): boolean {
  if (s.type === "rect" || s.type === "ellipse" || s.type === "diamond") {
    return Math.abs(s.w) < 2 && Math.abs(s.h) < 2;
  }
  if (s.type === "line" || s.type === "arrow") {
    return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 3;
  }
  if (s.type === "freehand") {
    return s.points.length < 2;
  }
  return false;
}

function hitTest(
  shapes: Shape[],
  wx: number,
  wy: number,
  zoom: number
): Shape | null {
  const padding = HIT_PADDING / zoom;
  // Iterate from top-most (last drawn) down so overlapping shapes work.
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (pointInShape(s, wx, wy, padding)) return s;
  }
  return null;
}

function pointInShape(s: Shape, wx: number, wy: number, pad: number): boolean {
  const b = boundingBox(s);
  if (
    wx < b.x - pad ||
    wx > b.x + b.w + pad ||
    wy < b.y - pad ||
    wy > b.y + b.h + pad
  ) {
    return false;
  }
  // Filled shapes → any point inside the bbox counts. Unfilled shapes
  // (or lines / freehand) need a stroke-proximity test.
  const hasFill = s.type !== "line" && s.type !== "arrow" && s.type !== "freehand" && s.fill;
  if (hasFill) return true;
  if (s.type === "line" || s.type === "arrow") {
    return distToSegment(wx, wy, s.x1, s.y1, s.x2, s.y2) <= pad + s.strokeWidth;
  }
  if (s.type === "freehand") {
    for (let i = 1; i < s.points.length; i++) {
      const [x1, y1] = s.points[i - 1];
      const [x2, y2] = s.points[i];
      if (distToSegment(wx, wy, x1, y1, x2, y2) <= pad + s.strokeWidth) return true;
    }
    return false;
  }
  // Text — bbox is enough.
  if (s.type === "text") return true;
  // Outline hit-test for rect / ellipse / diamond.
  const tol = pad + s.strokeWidth;
  const inner = {
    x: b.x + tol,
    y: b.y + tol,
    w: Math.max(0, b.w - 2 * tol),
    h: Math.max(0, b.h - 2 * tol),
  };
  const inBbox =
    wx >= b.x - tol && wx <= b.x + b.w + tol && wy >= b.y - tol && wy <= b.y + b.h + tol;
  const inInner =
    wx > inner.x && wx < inner.x + inner.w && wy > inner.y && wy < inner.y + inner.h;
  return inBbox && !inInner;
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function smoothPath(points: [number, number][]): string {
  if (!points.length) return "";
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x} ${y} l 0.1 0`; // tiny stroke so a single dot is visible
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    d += ` L ${x} ${y}`;
  }
  return d;
}

/* ------------------ Glyphs ------------------ */

const gp = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CursorGlyph() {
  return (
    <svg {...gp}>
      <path d="M4 3l7 17 2-7 7-2z" />
    </svg>
  );
}
function HandGlyph() {
  return (
    <svg {...gp}>
      <path d="M8 11V6a1 1 0 1 1 2 0v5" />
      <path d="M10 6V4a1 1 0 1 1 2 0v7" />
      <path d="M12 5a1 1 0 1 1 2 0v6" />
      <path d="M14 7a1 1 0 1 1 2 0v6c0 3-2 6-5 6H9c-2 0-3-1-4-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L7 13" />
    </svg>
  );
}
function RectGlyph() {
  return (
    <svg {...gp}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
    </svg>
  );
}
function EllipseGlyph() {
  return (
    <svg {...gp}>
      <ellipse cx="12" cy="12" rx="8" ry="6" />
    </svg>
  );
}
function DiamondGlyph() {
  return (
    <svg {...gp}>
      <path d="M12 3l9 9-9 9-9-9z" />
    </svg>
  );
}
function LineGlyph() {
  return (
    <svg {...gp}>
      <path d="M4 20L20 4" />
    </svg>
  );
}
function ArrowGlyph() {
  return (
    <svg {...gp}>
      <path d="M4 20L18 6" />
      <path d="M11 6h7v7" />
    </svg>
  );
}
function PenGlyph() {
  return (
    <svg {...gp}>
      <path d="M4 20c3-1 4-4 6-6s5-5 8-8" />
      <path d="M14 6l4 4" />
    </svg>
  );
}
function TextGlyph() {
  return (
    <svg {...gp}>
      <path d="M6 5h12M12 5v14M9 19h6" />
    </svg>
  );
}
function EraserGlyph() {
  return (
    <svg {...gp}>
      <path d="M16 4l4 4-9 9H7l-3-3z" />
      <path d="M8 12l4 4" />
    </svg>
  );
}
function UndoGlyph() {
  return (
    <svg {...gp}>
      <path d="M3 10h11a5 5 0 0 1 0 10H8" />
      <path d="M7 6l-4 4 4 4" />
    </svg>
  );
}
function RedoGlyph() {
  return (
    <svg {...gp}>
      <path d="M21 10H10a5 5 0 0 0 0 10h6" />
      <path d="M17 6l4 4-4 4" />
    </svg>
  );
}
function TrashGlyph() {
  return (
    <svg {...gp}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </svg>
  );
}
function ClearGlyph() {
  return (
    <svg {...gp}>
      <path d="M4 6l4 12M8 6l4 12M12 6l4 12M16 6l4 12" opacity={0.35} />
      <path d="M3 20h18" />
    </svg>
  );
}
