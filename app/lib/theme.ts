"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
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

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with "light" so SSR and first client render agree; a
  // useEffect below syncs the state to whatever the pre-hydration
  // script in layout.tsx already applied to <html>.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    writeDom(stored);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    writeDom(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      writeDom(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {}
      return next;
    });
  }, []);

  return createElement(
    ThemeContext.Provider,
    { value: { theme, setTheme, toggle } },
    children
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Fallback for any component rendered outside the provider — keeps the
  // old behaviour so nothing crashes, but this shouldn't fire because
  // ThemeProvider wraps the whole app in AppShell.
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? "light" : readStored()
  );
  useEffect(() => {
    writeDom(theme);
  }, [theme]);
  return {
    theme,
    setTheme: (t) => {
      setThemeState(t);
      writeDom(t);
      try {
        localStorage.setItem(KEY, t);
      } catch {}
    },
    toggle: () => {
      setThemeState((prev) => {
        const next: Theme = prev === "dark" ? "light" : "dark";
        writeDom(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {}
        return next;
      });
    },
  };
}
