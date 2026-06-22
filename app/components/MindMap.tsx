"use client";

import { useMemo } from "react";
import { useStore } from "../lib/store";

export default function MindMap() {
  const { state, dispatch } = useStore();

  const W = 1400;
  const H = 900;
  const cx = W / 2;
  const cy = H / 2;
  const centerR = 38;
  const folderR = 26;
  const fileR = 12;
  const orbitFolder = 260;
  const orbitFile = 130;

  const nodes = useMemo(() => {
    const folders = state.folders;
    const N = Math.max(folders.length, 1);
    return folders.map((folder, idx) => {
      const angle = (idx / N) * Math.PI * 2 - Math.PI / 2;
      const fx = cx + orbitFolder * Math.cos(angle);
      const fy = cy + orbitFolder * Math.sin(angle);
      const files = state.files.filter((f) => f.folderId === folder.id);
      const M = Math.max(files.length, 1);
      const spread = Math.PI * 0.9;
      const fileNodes = files.map((file, fi) => {
        const t = (fi - (M - 1) / 2) / Math.max(M - 1, 1);
        const fileAngle = angle + t * spread;
        const x = fx + orbitFile * Math.cos(fileAngle);
        const y = fy + orbitFile * Math.sin(fileAngle);
        return { file, x, y, fileAngle };
      });
      return { folder, x: fx, y: fy, angle, fileNodes };
    });
  }, [state.folders, state.files, cx, cy]);

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

  return (
    <div className="h-full w-full fade-in overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Connections: center -> folder */}
        {nodes.map(({ folder, x, y }) => (
          <line
            key={`l-${folder.id}`}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke={folder.color}
            strokeWidth={1.2}
            opacity={0.7}
          />
        ))}

        {/* Connections: folder -> files */}
        {nodes.map(({ folder, x, y, fileNodes }) =>
          fileNodes.map(({ file, x: fxx, y: fyy }) => (
            <line
              key={`fl-${file.id}`}
              x1={x}
              y1={y}
              x2={fxx}
              y2={fyy}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))
        )}

        {/* File nodes */}
        {nodes.map(({ folder, fileNodes }) =>
          fileNodes.map(({ file, x, y, fileAngle }) => {
            const labelOffset = 22;
            const lx = x + labelOffset * Math.cos(fileAngle);
            const ly = y + labelOffset * Math.sin(fileAngle);
            const anchor =
              Math.cos(fileAngle) > 0.3
                ? "start"
                : Math.cos(fileAngle) < -0.3
                ? "end"
                : "middle";
            return (
              <g
                key={file.id}
                className="cursor-pointer"
                onClick={() =>
                  dispatch({
                    type: "SET_VIEW",
                    payload: {
                      view: "editor",
                      folderId: folder.id,
                      fileId: file.id,
                    },
                  })
                }
              >
                {file.isCompleted ? (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r={fileR}
                      fill="var(--success)"
                      opacity={0.18}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={fileR}
                      fill="none"
                      stroke="var(--success)"
                      strokeWidth={2}
                    />
                    <path
                      d={`M ${x - 4} ${y} L ${x - 1} ${y + 3} L ${x + 5} ${y - 3}`}
                      stroke="var(--success)"
                      strokeWidth={2}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                ) : (
                  <circle
                    cx={x}
                    cy={y}
                    r={fileR}
                    fill="var(--surface)"
                    stroke="var(--border)"
                    strokeWidth={1.5}
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
                  {truncate(file.title.replace(/\.md$/i, ""), 16)}
                </text>
              </g>
            );
          })
        )}

        {/* Folder bubbles */}
        {nodes.map(({ folder, x, y }) => (
          <g
            key={`f-${folder.id}`}
            className="cursor-pointer"
            onClick={() =>
              dispatch({
                type: "SET_VIEW",
                payload: { view: "folder", folderId: folder.id },
              })
            }
          >
            <circle
              cx={x}
              cy={y}
              r={folderR + 4}
              fill={folder.color}
              opacity={0.12}
            />
            <circle
              cx={x}
              cy={y}
              r={folderR}
              fill="var(--surface)"
              stroke={folder.color}
              strokeWidth={2.5}
            />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="var(--foreground)"
              style={{ pointerEvents: "none" }}
            >
              {truncate(folder.name, 12)}
            </text>
          </g>
        ))}

        {/* Center node */}
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={centerR + 4}
            fill="var(--accent)"
            opacity={0.15}
          />
          <circle
            cx={cx}
            cy={cy}
            r={centerR}
            fill="var(--accent)"
            stroke="var(--accent)"
            strokeWidth={2}
          />
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            fontSize={14}
            fontWeight={700}
            fill="#fff"
          >
            Notes
          </text>
        </g>
      </svg>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
