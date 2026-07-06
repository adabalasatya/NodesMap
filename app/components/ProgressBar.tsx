interface Props {
  value: number;
  color?: string;
  className?: string;
  height?: number;
}

export default function ProgressBar({
  value,
  color = "var(--success)",
  className = "",
  height = 6,
}: Props) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`w-full rounded-full bg-[var(--surface-2)] overflow-hidden ${className}`}
      style={{ height }}
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      role="progressbar"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${v}%`, background: color }}
      />
    </div>
  );
}
