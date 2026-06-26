/**
 * Extract a human-readable message from an unknown thrown value.
 * Centralised here so every Supabase / fetch / dispatch error path
 * surfaces consistent text in dialogs and the sync badge.
 */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error_description === "string")
      return o.error_description as string;
    try {
      return JSON.stringify(e);
    } catch {
      return "Unknown error";
    }
  }
  return String(e ?? "Unknown error");
}
