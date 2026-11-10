"use client";
/**
 * OWNED BY WP-08. Motion primitives for the plan-assembly reveal and payment moments (framer-motion).
 * Must respect prefers-reduced-motion. SCAFFOLD STUB: pass-through / static renders.
 */
import type { ReactNode } from "react";

/** Fade/slide-in a block after `delayMs`. */
export function Reveal({ children, delayMs = 0 }: { children: ReactNode; delayMs?: number }) {
  void delayMs;
  return <>{children}</>;
}

/** Reveal children one by one, `stepMs` apart (extraction lines, Gantt rows). */
export function Stagger({ children, stepMs = 80 }: { children: ReactNode; stepMs?: number }) {
  void stepMs;
  return <>{children}</>;
}

/** One-shot success ripple around children when `trigger` changes (phase paid → green). */
export function Ripple({ children, trigger, color }: { children: ReactNode; trigger: unknown; color?: string }) {
  void trigger;
  void color;
  return <>{children}</>;
}

/** Animated number (counters, meters). `format` turns the current value into text (e.g. formatCents). */
export function CountUp({
  value,
  format,
  durationMs = 900,
}: {
  value: number;
  format: (v: number) => string;
  durationMs?: number;
}) {
  void durationMs;
  return <>{format(value)}</>;
}
