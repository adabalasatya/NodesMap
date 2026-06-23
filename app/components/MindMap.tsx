"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { Folder, NoteFile } from "../lib/types";
import { ChevronLeftIcon } from "./icons";

const W = 1600;
const H = 1100;

type MNode = {
  id: string;
  kind: "folder" | "file";
  label: string;
  folder?: Folder;
  file?: NoteFile;
  children: MNode[];
  x: number;
  y: number;
  depth: number;
  _px?: number;
  _py?: number;
  _ax?: number;
};

export default function MindMap() {
  const { state, dispatch } = useStore();

  const selectedFolder = state.currentFolderId
    ? state.folders.find((f) => f.id === state.currentFolderId) ?? null
    : null;

  const rootFolders = useMemo(
    () => state.folders.filter((f) => !f.parentId),
    [state.folders]
  );

  if (state.folders.length === 0) {
    return (
      <div className="p-10 fade-in">
        <h1 className="text-2xl font-semibold">Mind map</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          Add a folder to see it on the mind map.
        </p>
      </div>
    );
  }

  const goBack = () => {
    if (selectedFolder) {
      dispatch({
        type: "SET_VIEW",
        payload: {
          view: "folder",
          folderId: selectedFolder.id,
          fileId: null,
        },
      });
    } else {
      dispatch({
        type: "SET_VIEW",
        payload: { view: "dashboard", folderId: null, fileId: null },
      });
    }
  };

  return (
    <div className="h-full w-full fade-in flex flex-col">
      <div className="px-6 pt-4 pb-2 flex items-center gap-3">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
        >
          <ChevronLeftIcon size={14} /> Back
        </button>
        <div className="text-sm text-[var(--muted)] truncate">
          {selectedFolder
            ? `Mind map · ${selectedFolder.name}`
            : "Mind map · Home"}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {selectedFolder ? (
          <FolderMindMap folder={selectedFolder} />
        ) : (
          <div className="flex flex-col gap-8 p-6">
            {rootFolders.map((folder) => (
              <div key={folder.id}>
                <div className="text-xs uppercase tracking-[0.15em] mb-2 font-medium text-[var(--muted)]">
                  {folder.name}
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                  <FolderMindMap folder={folder} compact />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FolderMindMap({
  folder,
  compact = false,
}: {
  folder: Folder;
  compact?: boolean;
}) {
  const { state, dispatch } = useStore();
  const cx = W / 2;
  const cy = H / 2;
  // Animated reveal — bumps a key when the visible folder changes so the
  // SVG re-mounts with fresh CSS animations.
  const [revealKey, setRevealKey] = useState(0);
  useEffect(() => {
    setRevealKey((k) => k + 1);
  }, [folder.id]);

  const tree = useMemo(
    () => buildTree(folder, state.folders, state.files),
    [folder, state.folders, state.files]
  );

  const ringRadius = (depth: number) => {
    if (depth === 0) return 0;
    if (depth === 1) return 280;
    return 280 + (depth - 1) * 170;
  };

  layoutTree(tree, cx, cy, ringRadius);

  const edges: Array<{ from: MNode; to: MNode; idx: number; isFile: boolean }> =
    [];
  walk(tree, (node) => {
    node.children.forEach((c, i) => {
      edges.push({ from: node, to: c, idx: i, isFile: c.kind === "file" });
    });
  });

  const allNodes: MNode[] = [];
  walk(tree, (n) => allNodes.push(n));

  const pad = 80;
  const minX = Math.min(...allNodes.map((n) => n.x)) - pad;
  const maxX = Math.max(...allNodes.map((n) => n.x)) + pad;
  const minY = Math.min(...allNodes.map((n) => n.y)) - pad;
  const maxY = Math.max(...allNodes.map((n) => n.y)) + pad;
  const vbW = Math.max(W, maxX - minX);
  const vbH = Math.max(H, maxY - minY);
  const vbX = minX - (vbW - (maxX - minX)) / 2;
  const vbY = minY - (vbH - (maxY - minY)) / 2;

  const maxDepth = treeDepth(tree);

  return (
    <svg
      key={revealKey}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className={`${compact ? "w-full" : "w-full h-full"} mm-svg`}
      style={
        compact
          ? { maxHeight: 360 }
          : { minHeight: 600, height: Math.min(960, 360 + maxDepth * 180) }
      }
      preserveAspectRatio="xMidYMid meet"
    >
      {edges.map((e, i) => {
        const d = curvedPath(e.from, e.to, e.idx);
        const delay = stagger(e.from.depth) + i * 8;
        return (
          <path
            key={i}
            d={d}
            className="mm-edge"
            stroke={e.isFile ? "var(--muted)" : "var(--foreground)"}
            strokeWidth={e.isFile ? 1 : 1.5}
            strokeOpacity={e.isFile ? 0.45 : 0.7}
            fill="none"
            strokeLinecap="round"
            style={{
              animationDelay: `${delay}ms`,
            }}
          />
        );
      })}

      {allNodes.map((n) => {
        if (n === tree) return null;
        if (n.kind === "file" && n.file) {
          return (
            <FileNode
              key={n.id}
              node={n}
              parentFolderId={(n.file as NoteFile).folderId}
              delay={stagger(n.depth)}
              onOpen={(fid, fileId) =>
                dispatch({
                  type: "SET_VIEW",
                  payload: { view: "editor", folderId: fid, fileId },
                })
              }
            />
          );
        }
        if (n.kind === "folder" && n.folder) {
          return (
            <FolderNode
              key={n.id}
              node={n}
              isRoot={false}
              delay={stagger(n.depth)}
              onOpen={(fid) =>
                dispatch({
                  type: "SET_VIEW",
                  payload: { view: "folder", folderId: fid },
                })
              }
            />
          );
        }
        return null;
      })}

      <FolderNode
        node={tree}
        isRoot
        delay={0}
        onOpen={(fid) =>
          dispatch({
            type: "SET_VIEW",
            payload: { view: "folder", folderId: fid },
          })
        }
      />
    </svg>
  );
}

function stagger(depth: number): number {
  // ms — earlier rings draw first, deeper rings follow.
  return depth * 120;
}

function FolderNode({
  node,
  isRoot,
  delay,
  onOpen,
}: {
  node: MNode;
  isRoot: boolean;
  delay: number;
  onOpen: (id: string) => void;
}) {
  const r = isRoot ? 50 : Math.max(28, 40 - node.depth * 3);
  const fontSize = isRoot ? 14 : Math.max(9, 12 - Math.max(0, node.depth - 1));
  const lines = wrapLabel(node.label, 12);
  const lineHeight = fontSize + 2;
  const totalH = (lines.length - 1) * lineHeight;
  const stroke = isRoot ? "var(--foreground)" : "var(--foreground)";
  const fill = isRoot ? "var(--foreground)" : "var(--surface)";
  const textFill = isRoot ? "var(--surface)" : "var(--foreground)";
  return (
    <g
      className="mm-node cursor-pointer"
      transform={`translate(${node.x} ${node.y})`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onOpen(node.folder!.id)}
    >
      {isRoot && (
        <circle
          cx={0}
          cy={0}
          r={r + 16}
          fill="var(--foreground)"
          opacity={0.08}
          className="mm-halo"
        />
      )}
      <circle
        cx={0}
        cy={0}
        r={r + (isRoot ? 6 : 4)}
        fill="var(--foreground)"
        opacity={isRoot ? 0.1 : 0.05}
      />
      <circle
        cx={0}
        cy={0}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={isRoot ? 2 : 1.8}
        className="mm-circle"
      />
      <text
        x={0}
        y={-totalH / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={isRoot ? 700 : 600}
        fill={textFill}
        style={{ pointerEvents: "none" }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function FileNode({
  node,
  parentFolderId,
  delay,
  onOpen,
}: {
  node: MNode;
  parentFolderId: string;
  delay: number;
  onOpen: (folderId: string, fileId: string) => void;
}) {
  const fileR = 12;
  const angle = node._ax ?? 0;
  const labelOffset = 22;
  const lx = labelOffset * Math.cos(angle);
  const ly = labelOffset * Math.sin(angle);
  const dxn = Math.cos(angle);
  const anchor = dxn > 0.3 ? "start" : dxn < -0.3 ? "end" : "middle";
  const isDone = !!node.file?.isCompleted;
  return (
    <g
      className="mm-node cursor-pointer"
      transform={`translate(${node.x} ${node.y})`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onOpen(parentFolderId, node.file!.id)}
    >
      {isDone ? (
        <>
          <circle cx={0} cy={0} r={fileR} fill="var(--foreground)" />
          <path
            d={`M -4 0 L -1 3.2 L 5 -3.5`}
            stroke="var(--surface)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <circle
          cx={0}
          cy={0}
          r={fileR}
          fill="var(--surface)"
          stroke="var(--muted)"
          strokeWidth={1.6}
          opacity={0.9}
        />
      )}
      <text
        x={lx}
        y={ly}
        fill="var(--muted)"
        fontSize={12}
        dominantBaseline="middle"
        textAnchor={anchor}
        style={{ pointerEvents: "none" }}
      >
        {truncate(node.label.replace(/\.md$/i, ""), 18)}
      </text>
    </g>
  );
}

/* ----------------------- Tree build + layout ----------------------- */

function buildTree(
  rootFolder: Folder,
  folders: Folder[],
  files: NoteFile[]
): MNode {
  const buildFolder = (f: Folder, depth: number): MNode => {
    const subs = folders.filter((x) => x.parentId === f.id);
    const ff = files.filter((x) => x.folderId === f.id);
    return {
      id: f.id,
      kind: "folder",
      label: f.name,
      folder: f,
      depth,
      x: 0,
      y: 0,
      children: [
        ...subs.map((s) => buildFolder(s, depth + 1)),
        ...ff.map<MNode>((file) => ({
          id: file.id,
          kind: "file",
          label: file.title,
          file,
          depth: depth + 1,
          x: 0,
          y: 0,
          children: [],
        })),
      ],
    };
  };
  return buildFolder(rootFolder, 0);
}

function treeDepth(node: MNode): number {
  if (node.children.length === 0) return node.depth;
  return Math.max(...node.children.map(treeDepth));
}

function walk(node: MNode, cb: (n: MNode) => void) {
  cb(node);
  node.children.forEach((c) => walk(c, cb));
}

function layoutTree(
  root: MNode,
  cx: number,
  cy: number,
  ringRadius: (depth: number) => number
) {
  root.x = cx;
  root.y = cy;
  const N = root.children.length;
  if (N === 0) return;
  root.children.forEach((child, i) => {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    placeNode(child, cx, cy, angle, ringRadius);
    const baseSpan = Math.min((Math.PI * 2) / Math.max(N, 1) * 1.4, Math.PI);
    layoutChildren(child, angle, baseSpan, ringRadius);
  });
}

function placeNode(
  node: MNode,
  parentX: number,
  parentY: number,
  angle: number,
  ringRadius: (depth: number) => number
) {
  const stepOut = ringRadius(node.depth) - ringRadius(node.depth - 1);
  node.x = parentX + stepOut * Math.cos(angle);
  node.y = parentY + stepOut * Math.sin(angle);
  node._px = parentX;
  node._py = parentY;
  node._ax = angle;
}

function layoutChildren(
  node: MNode,
  outwardAngle: number,
  span: number,
  ringRadius: (depth: number) => number
) {
  const N = node.children.length;
  if (N === 0) return;
  const startAngle = outwardAngle - span / 2;
  node.children.forEach((child, i) => {
    const t = N === 1 ? 0.5 : i / (N - 1);
    const angle = startAngle + t * span;
    placeNode(child, node.x, node.y, angle, ringRadius);
    const subSpan = Math.min(
      (span / Math.max(N, 1)) * 1.4,
      Math.PI * 0.7
    );
    layoutChildren(child, angle, subSpan, ringRadius);
  });
}

function curvedPath(from: MNode, to: MNode, seed: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const sign = seed % 2 === 0 ? 1 : -1;
  const lift = Math.min(40, len * 0.08) * sign;
  const mx = (from.x + to.x) / 2 - (dy / len) * lift;
  const my = (from.y + to.y) / 2 + (dx / len) * lift;
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function wrapLabel(name: string, maxLen: number): string[] {
  const trimmed = name.trim();
  if (trimmed.length <= maxLen) return [trimmed];
  const words = trimmed.split(/\s+/);
  if (words.length === 1) return [trimmed];
  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    const diff = Math.abs(a - b);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }
  return [
    words.slice(0, bestSplit).join(" "),
    words.slice(bestSplit).join(" "),
  ];
}
