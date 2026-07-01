import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: Props) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export const GoogleIcon = ({ size = 16, ...rest }: Props) => (
  <svg width={size} height={size} viewBox="0 0 48 48" {...rest}>
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);
export const FolderIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);
export const FileIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);
export const PlusIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const FolderPlusIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 11v6M9 14h6" />
  </svg>
);
export const ArrowDownIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </svg>
);
export const SearchIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);
export const GridIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);
export const ListIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
export const ChevronLeftIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
export const ChevronRightIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);
export const ChevronDownIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const CheckIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M5 13l4 4L19 7" />
  </svg>
);
export const TrashIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
  </svg>
);
export const EditIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
export const NetworkIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="2" />
    <circle cx="4" cy="4" r="2" />
    <circle cx="20" cy="4" r="2" />
    <circle cx="4" cy="20" r="2" />
    <circle cx="20" cy="20" r="2" />
    <path d="M6 6l5 5M18 6l-5 5M6 18l5-5M18 18l-5-5" />
  </svg>
);
export const ChartIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 4 4 5-7" />
  </svg>
);
export const LinkIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.41 1.41" />
    <path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.41-1.41" />
  </svg>
);
export const CalendarIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18" />
    <path d="M8 3v4M16 3v4" />
  </svg>
);
export const TimerIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5" />
    <path d="M9 2h6" />
  </svg>
);
export const PlayIcon = (p: Props) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M6 4v16l14-8z" />
  </svg>
);
export const PauseIcon = (p: Props) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);
export const RotateCcwIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
export const SpeakerIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H2v6h4l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 5a10 10 0 0 1 0 14" />
  </svg>
);
export const FlameIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 2s5 6 5 11a5 5 0 0 1-10 0c0-2 1-4 3-6-1 4 2 4 2 4s-2-3 0-9z" />
  </svg>
);
export const HomeIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
);
export const SettingsIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M19.14 12.94a8 8 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a8 8 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.94 2h-3.88a.5.5 0 0 0-.5.42l-.36 2.54a8 8 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.66 8.48a.5.5 0 0 0 .12.61l2.03 1.58a8 8 0 0 0 0 1.88L2.78 14.13a.5.5 0 0 0-.12.61l1.92 3.32c.14.24.42.34.66.24l2.39-.96c.5.39 1.05.71 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.88a.5.5 0 0 0 .5-.42l.36-2.54c.57-.23 1.12-.55 1.62-.94l2.39.96c.24.1.52 0 .66-.24l1.92-3.32a.5.5 0 0 0-.12-.61z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const SunIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);
export const MoonIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
export const DownloadIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);
export const ClockIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const SidebarCloseIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <path d="M16 9l-3 3 3 3" />
  </svg>
);
export const SidebarOpenIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <path d="M13 9l3 3-3 3" />
  </svg>
);
export const LogOutIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);
