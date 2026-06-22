"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth";

const STEPS = [
  {
    img: "/showcase/dashboard.jpeg",
    title: "Welcome to nodesmap",
    desc: "Everything lives in colour-coded folders. Create one per topic and your notes stay tidy from day one.",
  },
  {
    img: "/showcase/editor.jpeg",
    title: "Write, then check it off",
    desc: "Draft notes in clean Markdown and mark them complete when you're done. Each folder fills up as you go.",
  },
  {
    img: "/showcase/progress.jpeg",
    title: "Watch your progress",
    desc: "Streaks, completion stats and a radial mind map turn your notes into a picture of how far you've come.",
  },
];

export function onboardingKey(userId: string | undefined) {
  return `noteflow_onboarded_${userId ?? "anon"}`;
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = () => {
    try {
      localStorage.setItem(onboardingKey(user?.id), "1");
    } catch {}
    onDone();
  };

  const name = user?.email ? user.email.split("@")[0] : null;

  return (
    <div className="min-h-screen w-full grid place-items-center bg-[var(--background)] text-[var(--foreground)] px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-[var(--accent)] grid place-items-center text-white font-semibold">
              N
            </div>
            <span className="font-semibold tracking-tight">nodesmap</span>
          </div>
          <button
            onClick={finish}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
          >
            Skip
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.img}
            alt={current.title}
            className="w-full border-b border-[var(--border)] bg-[var(--surface-2)]"
          />
          <div className="p-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              {step === 0 && name ? `Welcome, ${name}` : current.title}
            </h1>
            <p className="text-sm text-[var(--muted)] mt-2">{current.desc}</p>

            {/* Step dots */}
            <div className="flex items-center justify-center gap-1.5 mt-6">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step
                      ? "w-5 bg-[var(--accent)]"
                      : "w-1.5 bg-[var(--border)]"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2 mt-6">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-[var(--surface-2)] transition"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => (last ? finish() : setStep((s) => s + 1))}
                className="flex-1 rounded-lg bg-[var(--accent)] text-white py-2.5 text-sm font-medium hover:opacity-90 transition"
              >
                {last ? "Enter workspace" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
