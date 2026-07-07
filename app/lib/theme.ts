"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

const KEY = "noteflow_theme";

function readStored(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light") return v;
  } catch {}
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function writeDom(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
}

/* External-store bridge: theme lives in localStorage / matchMedia, both
   of which sit outside React. useSyncExternalStore subscribes cleanly
   without needing a mount-time setState (which the react-hooks
   set-state-in-effect rule flags). */
const subscribers = new Set<() => void>();
function notify() {
  subscribers.forEach((cb) => cb());
}
function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  const mq =
    typeof window !== "undefined"
      ? window.matchMedia?.("(prefers-color-scheme: dark)")
      : null;
  const mqHandler = () => cb();
  mq?.addEventListener?.("change", mqHandler);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    subscribers.delete(cb);
    mq?.removeEventListener?.("change", mqHandler);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

// Static fallback used when a component calls useTheme outside the
// provider — safer than a component-local state that silently drifts.
const staticFallback: Ctx = {
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readStored,
    () => "light"
  );

  useEffect(() => {
    writeDom(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    writeDom(t);
    notify();
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = readStored() === "dark" ? "light" : "dark";
    setTheme(next);
  }, [setTheme]);

  return createElement(
    ThemeContext.Provider,
    { value: { theme, setTheme, toggle } },
    children
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  // Provider is mounted at AppShell, so ctx should always be non-null in
  // practice. The static fallback keeps stray callers from crashing.
  return ctx ?? staticFallback;
}
