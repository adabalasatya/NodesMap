"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { GoogleIcon } from "./icons";

const SUPPORT_EMAIL = "satya1adabala@gmail.com";

const SHOWCASE = [
  {
    img: "/showcase/dashboard.jpeg",
    title: "Organize everything in folders",
    desc: "Group your notes into colour-coded folders and watch each one fill up as you complete it.",
  },
  {
    img: "/showcase/editor.jpeg",
    title: "Write in clean Markdown",
    desc: "A distraction-free editor with live Markdown — headings, lists, code and tasks, all formatted as you type.",
  },
  {
    img: "/showcase/progress.jpeg",
    title: "Track your progress",
    desc: "See completion stats, streaks and per-folder breakdowns so you always know what's left to do.",
  },
  {
    img: "/showcase/mindmap.jpeg",
    title: "Visualize as a mind map",
    desc: "A radial mind map connects every folder and note, giving you the whole picture at a glance.",
  },
];

function extractMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error_description === "string")
      return o.error_description as string;
  }
  return String(e ?? "Unknown error");
}

function SignInModal({ onClose }: { onClose: () => void }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      // On success the browser is redirected to Google, so we stay "busy".
    } catch (err) {
      setError(extractMessage(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="size-8 rounded-full bg-[var(--accent)] grid place-items-center text-white font-semibold">
            N
          </div>
          <span className="font-semibold tracking-tight">NoteFlow</span>
        </div>
        <h2 className="text-center text-lg font-semibold mt-3">
          Continue to NoteFlow
        </h2>
        <p className="text-center text-sm text-[var(--muted)] mt-1">
          Pick a Google account. We&apos;ll sign you in, or create your account
          if you&apos;re new.
        </p>

        <button
          onClick={handleGoogle}
          disabled={busy}
          className="mt-5 w-full flex items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3 text-sm font-medium hover:bg-[var(--surface-2)] transition disabled:opacity-60"
        >
          <GoogleIcon size={18} />
          {busy ? "Redirecting to Google…" : "Continue with Google"}
        </button>

        {error && (
          <div className="mt-3 text-sm text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Auth() {
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = showSignIn ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showSignIn]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Soft accent glow behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] -z-10"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(37,99,235,0.10), transparent 70%)",
        }}
      />

      {/* Floating pill nav */}
      <header className="sticky top-4 z-40 mx-auto mt-4 flex max-w-3xl items-center justify-between gap-4 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-2 pl-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-full bg-[var(--accent)] grid place-items-center text-white font-semibold text-sm">
            N
          </div>
          <span className="font-semibold tracking-tight">NoteFlow</span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="hidden sm:block px-3 py-1.5 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
          >
            Home
          </button>
          <button
            onClick={() => scrollTo("support")}
            className="hidden sm:block px-3 py-1.5 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
          >
            Support
          </button>
          <button
            onClick={() => setShowSignIn(true)}
            className="px-4 py-1.5 rounded-full bg-[var(--accent)] text-white font-medium hover:opacity-90 transition"
          >
            Sign in
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-20 pb-14 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">
          <span className="size-1.5 rounded-full bg-[var(--success)]" />
          Markdown notes · progress · mind map
        </div>
        <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
          Your notes,
          <br />
          <span className="text-[var(--accent)]">beautifully organized.</span>
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[var(--muted)] max-w-xl mx-auto">
          Turn Markdown notes into trackable folders, a progress dashboard, and
          a living mind map — all in one calm, focused workspace.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => setShowSignIn(true)}
            className="flex items-center gap-2.5 rounded-full bg-[var(--accent)] text-white px-6 py-3 text-sm font-medium shadow-sm hover:opacity-90 transition"
          >
            <GoogleIcon size={18} />
            Get started with Google
          </button>
          <button
            onClick={() => scrollTo("showcase")}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-6 py-3 text-sm font-medium hover:bg-[var(--surface-2)] transition"
          >
            See what&apos;s inside
          </button>
        </div>
      </section>

      {/* Showcase — what's inside after login */}
      <section id="showcase" className="max-w-5xl mx-auto px-4 pb-24">
        <h2 className="text-center text-2xl sm:text-3xl font-semibold tracking-tight">
          Everything you get inside
        </h2>
        <p className="text-center text-sm text-[var(--muted)] mt-3 mb-12 max-w-md mx-auto">
          A peek at the workspace you&apos;ll step into after signing in.
        </p>

        <div className="grid sm:grid-cols-2 gap-6">
          {SHOWCASE.map((item) => (
            <div
              key={item.title}
              className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
            >
              {/* Faux window frame */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.img}
                alt={item.title}
                className="w-full bg-[var(--surface-2)] transition-transform duration-300 group-hover:scale-[1.02]"
                loading="lazy"
              />
              <div className="p-6">
                <h3 className="font-semibold text-lg">{item.title}</h3>
                <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Support */}
      <section id="support" className="max-w-3xl mx-auto px-4 pb-24">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center shadow-sm">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Need a hand?
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[var(--muted)] max-w-md mx-auto leading-relaxed">
            Stuck, found a bug, or have an idea to make NoteFlow better? We&apos;d
            genuinely love to hear from you — drop us a line any time and we
            usually reply within a day.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 mt-6 rounded-full bg-[var(--accent)] text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition"
          >
            Email {SUPPORT_EMAIL}
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 text-center text-xs text-[var(--muted)]">
        © NoteFlow — Markdown notes &amp; progress tracker
      </footer>

      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
    </div>
  );
}
