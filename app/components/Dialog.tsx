"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Tone = "default" | "danger" | "success";

type AlertOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  tone?: Tone;
};

type ConfirmOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
};

type PromptOptions = {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  okLabel?: string;
  cancelLabel?: string;
};

type DialogContextValue = {
  alert: (opts: AlertOptions | string) => Promise<void>;
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  prompt: (opts: PromptOptions | string) => Promise<string | null>;
};

type AnyState =
  | {
      kind: "alert";
      opts: AlertOptions;
      resolve: (v: void) => void;
    }
  | {
      kind: "confirm";
      opts: ConfirmOptions;
      resolve: (v: boolean) => void;
    }
  | {
      kind: "prompt";
      opts: PromptOptions;
      resolve: (v: string | null) => void;
    };

const Ctx = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AnyState | null>(null);
  const [input, setInput] = useState("");

  const alertFn = useCallback(
    (opts: AlertOptions | string) =>
      new Promise<void>((resolve) => {
        const o: AlertOptions =
          typeof opts === "string" ? { message: opts } : opts;
        setState({ kind: "alert", opts: o, resolve });
      }),
    []
  );

  const confirmFn = useCallback(
    (opts: ConfirmOptions | string) =>
      new Promise<boolean>((resolve) => {
        const o: ConfirmOptions =
          typeof opts === "string" ? { message: opts } : opts;
        setState({ kind: "confirm", opts: o, resolve });
      }),
    []
  );

  const promptFn = useCallback(
    (opts: PromptOptions | string) =>
      new Promise<string | null>((resolve) => {
        const o: PromptOptions =
          typeof opts === "string" ? { message: opts } : opts;
        setInput(o.defaultValue ?? "");
        setState({ kind: "prompt", opts: o, resolve });
      }),
    []
  );

  // Esc / body-scroll lock while open.
  useEffect(() => {
    if (!state) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const close = (result: boolean | string | null) => {
    if (!state) return;
    if (state.kind === "alert") state.resolve();
    else if (state.kind === "confirm") state.resolve(!!result);
    else state.resolve(typeof result === "string" ? result : null);
    setState(null);
  };

  const ctxValue: DialogContextValue = {
    alert: alertFn,
    confirm: confirmFn,
    prompt: promptFn,
  };

  return (
    <Ctx.Provider value={ctxValue}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => close(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl modal-pop overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 pt-6 pb-2">
              {state.opts.title && (
                <h2 className="text-lg font-bold tracking-tight mb-1">
                  {state.opts.title}
                </h2>
              )}
              {"message" in state.opts && state.opts.message && (
                <p className="text-sm text-[var(--muted)] leading-relaxed whitespace-pre-line">
                  {state.opts.message}
                </p>
              )}
              {state.kind === "prompt" && (
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") close(input);
                  }}
                  placeholder={state.opts.placeholder}
                  className="mt-4 w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              )}
            </div>

            <div className="px-6 py-4 mt-2 flex items-center gap-2 justify-end border-t border-[var(--border)] bg-[var(--surface)]">
              {state.kind !== "alert" && (
                <button
                  type="button"
                  onClick={() => close(null)}
                  className="px-4 py-2 rounded-xl text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
                >
                  {("cancelLabel" in state.opts &&
                    state.opts.cancelLabel) ||
                    "Cancel"}
                </button>
              )}
              <button
                type="button"
                autoFocus={state.kind === "alert" || state.kind === "confirm"}
                onClick={() =>
                  close(state.kind === "prompt" ? input : true)
                }
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                  "tone" in state.opts && state.opts.tone === "danger"
                    ? "bg-[var(--danger)] text-[var(--surface)] hover:opacity-90"
                    : "bg-[var(--foreground)] text-[var(--surface)] hover:opacity-90"
                }`}
              >
                {state.opts.okLabel ||
                  (state.kind === "confirm"
                    ? "Confirm"
                    : state.kind === "prompt"
                    ? "Save"
                    : "OK")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDialog must be used inside a DialogProvider");
  return v;
}
