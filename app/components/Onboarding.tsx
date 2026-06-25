"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth";

const STEPS = [
  {
    img: "/onboardingImages/folder.jpeg",
    title: "Welcome to NodesMap",
    desc: "Every topic starts as a folder. Spin one up for each subject and your notes stay tidy from the very first line you write.",
  },
  {
    img: "/onboardingImages/folder2.jpeg",
    title: "Nest as deep as you like",
    desc: "Folders inside folders. Group sub-topics, drag files into them, and let the structure grow with what you're learning.",
  },
  {
    img: "/onboardingImages/planner.jpeg",
    title: "Plan your study",
    desc: "Open the Planner, schedule tasks for any day, and link them to a folder or file — they auto-complete when the work is done.",
  },
  {
    img: "/onboardingImages/mindmap.jpeg",
    title: "See it all at a glance",
    desc: "Switch to the Mind map for a radial picture of every folder, sub-folder, and note with progress wrapped around each node.",
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/NodesMap_Icon.png"
              alt="NodesMap"
              className="size-8 rounded-full object-cover"
            />
            <span className="font-semibold tracking-tight">NodesMap</span>
          </div>
          <button
            onClick={finish}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
          >
            Skip
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
          {/* Fixed-height letterbox so all four screenshots show in full
              without cropping, regardless of their native aspect ratio. */}
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)] h-64 grid place-items-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.img}
              alt={current.title}
              className="max-w-full max-h-full w-auto h-auto object-contain"
            />
          </div>
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
                      ? "w-5 bg-[var(--foreground)]"
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
                className="flex-1 rounded-lg bg-[var(--foreground)] text-[var(--surface)] py-2.5 text-sm font-medium hover:opacity-90 transition"
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
