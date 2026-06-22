export interface Folder {
  id: string;
  name: string;
  color: string;
  createdAt: number;
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

export type View = "dashboard" | "folder" | "editor" | "progress" | "mindmap";

export const FOLDER_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];
