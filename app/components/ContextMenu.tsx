"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Measure the actual rendered menu, then clamp to the viewport with an
  // 8px gutter. Done as a layout effect (post-paint) so we read real sizes
  // instead of guessing from `items.length`.
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const w = el.offsetWidth || 200;
    const h = el.offsetHeight || items.length * 36 + 8;
    const gutter = 8;
    const left = Math.max(
      gutter,
      Math.min(x, window.innerWidth - w - gutter)
    );
    const top = Math.max(
      gutter,
      Math.min(y, window.innerHeight - h - gutter)
    );
    setPos({ left, top });
  }, [x, y, items.length]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg py-1 fade-in"
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={`block w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)] transition ${
            item.danger ? "text-[var(--danger)]" : ""
          }`}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
