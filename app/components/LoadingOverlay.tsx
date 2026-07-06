"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

type Ctx = {
  show: (message?: string) => void;
  hide: () => void;
  run: <T>(task: () => Promise<T>, message?: string) => Promise<T>;
};

const C = createContext<Ctx | null>(null);

export function LoadingOverlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState<string | undefined>(undefined);

  const show = useCallback((m?: string) => {
    setMsg(m);
    setVisible(true);
  }, []);
  const hide = useCallback(() => setVisible(false), []);
  const run = useCallback(
    async <T,>(task: () => Promise<T>, message?: string): Promise<T> => {
      setMsg(message);
      setVisible(true);
      try {
        return await task();
      } finally {
        setVisible(false);
      }
    },
    []
  );

  return (
    <C.Provider value={{ show, hide, run }}>
      {children}
      {visible && (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-black/40 backdrop-blur-sm fade-in"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl modal-pop min-w-[180px]">
            <span className="loading-spinner" />
            <span className="text-sm text-[var(--muted)]">
              {msg ?? "Loading…"}
            </span>
          </div>
        </div>
      )}
    </C.Provider>
  );
}

export function useLoading(): Ctx {
  const v = useContext(C);
  if (!v)
    throw new Error("useLoading must be used inside a LoadingOverlayProvider");
  return v;
}
