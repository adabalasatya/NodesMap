"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SpeakerIcon,
  TimerIcon,
} from "./icons";
import { useStore } from "../lib/store";

type Mode = "focus" | "shortBreak" | "longBreak";

type Settings = {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  autoStartBreaks: boolean;
  autoStartPomodoros: boolean;
  longBreakInterval: number; // every N focus sessions
  alarmSound: string;
  alarmVolume: number; // 0..100
  alarmDurationSec: number; // how long the alarm keeps ringing
};

const DEFAULTS: Settings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  autoStartBreaks: false,
  autoStartPomodoros: false,
  longBreakInterval: 4,
  alarmSound: "chime",
  alarmVolume: 60,
  alarmDurationSec: 5,
};

const STORAGE_KEY = "noteflow_pomodoro_settings";
const SOUNDS = ["chime", "bell", "digital", "kitchen"];

// --- Daily focus-time tracking (for streak) ---
//
// The streak ticks when the user accumulates 30 minutes of focus time in
// a day. We keep a `{date, seconds}` record in localStorage so partial
// sessions (start / pause / resume) all count toward the same daily
// total. Rolls over at midnight.
const FOCUS_STORAGE = "noteflow_focus_time";
const STREAK_FOCUS_THRESHOLD_SEC = 30 * 60;

type FocusRecord = { date: string; seconds: number };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadFocus(): FocusRecord {
  const today = todayIso();
  if (typeof window === "undefined") return { date: today, seconds: 0 };
  try {
    const raw = localStorage.getItem(FOCUS_STORAGE);
    if (!raw) return { date: today, seconds: 0 };
    const parsed = JSON.parse(raw) as FocusRecord;
    if (parsed.date !== today) return { date: today, seconds: 0 };
    return parsed;
  } catch {
    return { date: today, seconds: 0 };
  }
}

function saveFocus(rec: FocusRecord) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FOCUS_STORAGE, JSON.stringify(rec));
  } catch {}
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: Settings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

/** Beep tones for the built-in alarms via WebAudio (no assets needed).
    The pattern for the selected sound is repeated on a fixed cadence
    until `durationSec` seconds have elapsed, so the alarm rings for the
    duration the user configured instead of a single short chirp. */
function playAlarm(sound: string, volume: number, durationSec: number) {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume / 100));
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    const beep = (
      freq: number,
      start: number,
      dur = 0.18,
      type: OscillatorType = "sine"
    ) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(1, now + start + 0.005);
      g.gain.linearRampToValueAtTime(0, now + start + dur);
      osc.connect(g).connect(gain);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };

    // One cycle of the pattern for the chosen sound, offset by `t0`.
    const scheduleCycle = (t0: number) => {
      switch (sound) {
        case "bell":
          beep(880, t0, 0.25, "triangle");
          beep(660, t0 + 0.28, 0.35, "triangle");
          break;
        case "digital":
          beep(1200, t0, 0.12, "square");
          beep(1200, t0 + 0.18, 0.12, "square");
          beep(1200, t0 + 0.36, 0.12, "square");
          break;
        case "kitchen":
          beep(1400, t0, 0.08, "square");
          beep(1400, t0 + 0.15, 0.08, "square");
          beep(1400, t0 + 0.3, 0.08, "square");
          beep(1400, t0 + 0.45, 0.08, "square");
          break;
        default: // chime
          beep(660, t0, 0.2);
          beep(880, t0 + 0.22, 0.3);
          break;
      }
    };

    // Each pattern is ~0.6s of tone; leave a short gap between repeats
    // for a natural ringing cadence.
    const cycleLen = 0.85;
    const total = Math.max(0.5, durationSec);
    for (let t = 0; t < total; t += cycleLen) scheduleCycle(t);

    // Close the context a bit after the last cycle finishes.
    setTimeout(
      () => ctx.close().catch(() => {}),
      Math.max(1000, total * 1000 + 400)
    );
  } catch {
    // ignore audio failures (autoplay policies etc.)
  }
}

function modeSeconds(mode: Mode, s: Settings): number {
  if (mode === "focus") return s.focusMin * 60;
  if (mode === "shortBreak") return s.shortBreakMin * 60;
  return s.longBreakMin * 60;
}

export default function PomodoroTimer() {
  const { dispatch } = useStore();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState<number>(DEFAULTS.focusMin * 60);
  const [running, setRunning] = useState(false);
  const [completedFocus, setCompletedFocus] = useState(0);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Running total of focus seconds for TODAY, mirrored in localStorage.
  const focusSecsRef = useRef(0);
  useEffect(() => {
    focusSecsRef.current = loadFocus().seconds;
  }, []);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Hydrate settings & seed remaining once on mount. Reading localStorage
  // during render would produce a Next.js SSR/CSR mismatch, so this is
  // the canonical mount-effect hydration pattern.
  useEffect(() => {
    const s = loadSettings();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(s);
    setRemaining(s.focusMin * 60);
  }, []);

  // Persist settings whenever they change (after first mount). Adjusting
  // `remaining` in response to a user-changed setting is a legitimate
  // external-input → local-state sync, not a cascade.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    saveSettings(settings);
    // If not running, adjust the visible time to reflect the new mode length.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!running) setRemaining(modeSeconds(mode, settings));
  }, [settings, mode, running]);

  // Countdown tick. While the user is in a focus session we also credit
  // 1 second of daily focus time; the streak is ticked once the daily
  // total reaches 30 minutes (idempotent — the store guards it too).
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (mode === "focus") {
        // Roll over on date change so partials never leak into a new day.
        const today = todayIso();
        const rec = loadFocus();
        if (rec.date !== today) focusSecsRef.current = 0;
        focusSecsRef.current += 1;
        // Persist every 10s (cheap and resilient across reloads).
        if (focusSecsRef.current % 10 === 0) {
          saveFocus({ date: today, seconds: focusSecsRef.current });
        }
        // Crossing the 30-minute mark → tick the streak once for today.
        if (focusSecsRef.current === STREAK_FOCUS_THRESHOLD_SEC) {
          saveFocus({ date: today, seconds: focusSecsRef.current });
          dispatch({ type: "TICK_STREAK" });
        }
      }
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => {
      window.clearInterval(id);
      // Flush the current focus count on pause so we don't lose the tail.
      if (mode === "focus") {
        saveFocus({ date: todayIso(), seconds: focusSecsRef.current });
      }
    };
  }, [running, mode, dispatch]);

  // End-of-session handling — reacts to the timer hitting zero, which is
  // itself driven by the tick effect above. This is a "chained state
  // machine" step (a state transition triggered by another state), so
  // setStates in the effect body are the natural expression.
  useEffect(() => {
    if (remaining > 0 || !running) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setRunning(false);
    playAlarm(
      settings.alarmSound,
      settings.alarmVolume,
      settings.alarmDurationSec
    );
    if (mode === "focus") {
      const next = completedFocus + 1;
      setCompletedFocus(next);
      const isLong = next % settings.longBreakInterval === 0;
      const nextMode: Mode = isLong ? "longBreak" : "shortBreak";
      setMode(nextMode);
      setRemaining(modeSeconds(nextMode, settings));
      if (settings.autoStartBreaks) setRunning(true);
    } else {
      setMode("focus");
      setRemaining(modeSeconds("focus", settings));
      if (settings.autoStartPomodoros) setRunning(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const start = () => setRunning(true);
  const pause = () => setRunning(false);
  const reset = useCallback(() => {
    setRunning(false);
    setRemaining(modeSeconds(mode, settings));
  }, [mode, settings]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setRunning(false);
    setRemaining(modeSeconds(m, settings));
  };

  // Measure trigger button so the popover can float via portal without
  // being clipped by the sticky TopBar's stacking / overflow.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const b = buttonRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      setPos({
        top: r.bottom + 8,
        left: r.left + r.width / 2,
        width: r.width,
      });
    };
    measure();
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      const pop = document.getElementById("__pomodoro-pop");
      if (pop && pop.contains(target)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const modeLabel = useMemo(
    () =>
      mode === "focus"
        ? "Focus"
        : mode === "shortBreak"
        ? "Short break"
        : "Long break",
    [mode]
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => {
          // Measure the trigger's position *before* opening so the
          // popover's first render lands under the timer instead of
          // flashing at a stale/default spot for one frame.
          if (!open && buttonRef.current) {
            const r = buttonRef.current.getBoundingClientRect();
            setPos({
              top: r.bottom + 8,
              left: r.left + r.width / 2,
              width: r.width,
            });
          }
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium tabular-nums transition ${
          running
            ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--surface)]"
            : "border-[var(--border)] hover:bg-[var(--surface-2)]"
        }`}
        title={`${modeLabel} · ${fmt(remaining)}`}
        aria-expanded={open}
      >
        <TimerIcon size={14} />
        <span>{fmt(remaining)}</span>
      </button>

      {open &&
        pos &&
        typeof window !== "undefined" &&
        createPortal(
          (() => {
            // Centre the popover on the trigger button by computing
            // `left` directly instead of using `transform: translateX`.
            // The `.modal-pop` animation sets `transform` in its
            // keyframes, which would override an inline transform for
            // the entire animation duration and make the popover flash
            // uncentered (slightly to the right) before settling.
            const POP_WIDTH = 400;
            const buttonCenter = pos.left; // set by measure()
            const rawLeft = buttonCenter - POP_WIDTH / 2;
            // Clamp so the popover never bleeds off the viewport edges.
            const maxLeft = window.innerWidth - POP_WIDTH - 8;
            const finalLeft = Math.max(8, Math.min(rawLeft, maxLeft));
            return (
              <div
                id="__pomodoro-pop"
                style={{
                  position: "fixed",
                  top: pos.top,
                  left: finalLeft,
                  width: POP_WIDTH,
                  maxHeight: "min(80vh, 640px)",
                  zIndex: 60,
                }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-y-auto modal-pop"
              >
            {/* Header: mode switcher + countdown + controls */}
            <div className="px-5 pt-5">
              <div className="inline-flex w-full rounded-xl border border-[var(--border)] p-1">
                {(
                  [
                    { m: "focus" as const, label: "Focus" },
                    { m: "shortBreak" as const, label: "Break" },
                    { m: "longBreak" as const, label: "Long break" },
                  ]
                ).map(({ m, label }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      mode === m
                        ? "bg-[var(--foreground)] text-[var(--surface)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="text-5xl font-bold tabular-nums text-center mt-5">
                {fmt(remaining)}
              </div>
              {mode === "focus" ? (
                <div className="text-xs text-center text-[var(--muted)] mt-1 mb-4">
                  Session #{completedFocus + 1}
                </div>
              ) : (
                <div className="mt-1 mb-4" />
              )}

              <div className="flex items-center justify-center gap-2 mb-5">
                {running ? (
                  <button
                    onClick={pause}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--foreground)] text-[var(--surface)] text-sm font-medium hover:opacity-90 transition"
                  >
                    <PauseIcon size={14} /> Pause
                  </button>
                ) : (
                  <button
                    onClick={start}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--foreground)] text-[var(--surface)] text-sm font-medium hover:opacity-90 transition"
                  >
                    <PlayIcon size={14} /> Start
                  </button>
                )}
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-sm transition"
                >
                  <RotateCcwIcon size={14} /> Reset
                </button>
              </div>
            </div>

            {/* Timer section */}
            <div className="border-t border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
                <TimerIcon size={12} /> Timer
              </div>

              <label className="block text-sm font-medium mb-2">
                Time (minutes)
              </label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <NumField
                  label="Pomodoro"
                  value={settings.focusMin}
                  min={1}
                  max={180}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, focusMin: v }))
                  }
                />
                <NumField
                  label="Short Break"
                  value={settings.shortBreakMin}
                  min={1}
                  max={60}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, shortBreakMin: v }))
                  }
                />
                <NumField
                  label="Long Break"
                  value={settings.longBreakMin}
                  min={1}
                  max={120}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, longBreakMin: v }))
                  }
                />
              </div>

              <ToggleRow
                label="Auto Start Breaks"
                value={settings.autoStartBreaks}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, autoStartBreaks: v }))
                }
              />
              <ToggleRow
                label="Auto Start Pomodoros"
                value={settings.autoStartPomodoros}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, autoStartPomodoros: v }))
                }
              />

              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">Long Break interval</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={settings.longBreakInterval}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      longBreakInterval: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-16 bg-[var(--surface-2)] rounded-lg px-2 py-1 text-sm text-center tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
            </div>

            {/* Sound section */}
            <div className="border-t border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
                <SpeakerIcon size={12} /> Sound
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">Alarm Sound</span>
                <select
                  value={settings.alarmSound}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, alarmSound: e.target.value }))
                  }
                  className="bg-[var(--surface-2)] rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] capitalize"
                >
                  {SOUNDS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 py-2">
                <span className="text-sm tabular-nums w-8 text-right text-[var(--muted)]">
                  {settings.alarmVolume}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.alarmVolume}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      alarmVolume: Number(e.target.value),
                    }))
                  }
                  className="flex-1 accent-[var(--foreground)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    playAlarm(
                      settings.alarmSound,
                      settings.alarmVolume,
                      settings.alarmDurationSec
                    )
                  }
                  className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-xs hover:bg-[var(--surface-2)] transition"
                >
                  Test
                </button>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">
                  Ring duration (sec)
                </span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.alarmDurationSec}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      alarmDurationSec: Math.max(
                        1,
                        Math.min(30, Number(e.target.value) || 1)
                      ),
                    }))
                  }
                  className="w-16 bg-[var(--surface-2)] rounded-lg px-2 py-1 text-sm text-center tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
            </div>
              </div>
            );
          })(),
          document.body
        )}
    </>
  );
}

/* ------------------------- Sub-components ------------------------- */

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-[var(--muted)] mb-1">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n))
            onChange(Math.max(min, Math.min(max, Math.round(n))));
        }}
        className="w-full bg-[var(--surface-2)] rounded-lg px-3 py-2 text-lg font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />
    </label>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value
            ? "bg-[var(--foreground)]"
            : "bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--border)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--surface)] shadow-sm transition-[left] duration-200 ${
            value ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
