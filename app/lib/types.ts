export interface Folder {
  id: string;
  name: string;
  color: string;
  /** Optional emoji shown next to / replacing the folder icon. */
  emoji?: string | null;
  createdAt: number;
  parentId?: string | null;
}

export interface NoteFile {
  id: string;
  folderId: string;
  title: string;
  content: string;
  isCompleted: boolean;
  updatedAt: number;
}

export interface StreakState {
  count: number;
  lastDate: string | null;
}

export type View =
  | "dashboard"
  | "folder"
  | "editor"
  | "progress"
  | "mindmap"
  | "planner";

export type RepeatKind = "once" | "daily" | "weekly";

export interface Task {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  time?: string; // HH:MM (24h)
  repeat: RepeatKind;
  /** For `repeat === "weekly"`, the specific weekdays (0=Sun … 6=Sat).
   *  Empty array falls back to "same weekday as startDate" for back-compat. */
  weekdays?: number[];
  linkedFileId?: string | null;
  linkedFolderId?: string | null;
  /** Dates (YYYY-MM-DD) where this task has been ticked. */
  completedDates: string[];
  /** Subset of completedDates that were filled by the linked file/folder
   *  going to "done" rather than by an explicit user tap. */
  autoCompletedDates: string[];
  createdAt: number;
  updatedAt: number;
}

// Monochrome palette — folders no longer have a visible per-folder color.
// The field is kept on the type for backwards-compat with existing data.
export const FOLDER_COLORS = ["#111111"];
