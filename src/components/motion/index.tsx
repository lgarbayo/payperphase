"use client";
/**
 * OWNED BY WP-08. Motion primitives for the plan-assembly reveal and payment moments (framer-motion).
 * Every primitive respects prefers-reduced-motion: no transforms, no counting, no travelling waves.
 */
import { Children, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { animate, motion } from "framer-motion";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(REDUCED_QUERY);
  mql.addEventListener?.("change", onChange);
  return () => mql.removeEventListener?.("change", onChange);
}
const reducedNow = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_QUERY).matches;

/**
 * True when the visitor asked for reduced motion. Reads matchMedia on every render and follows
 * live changes (framer's own hook caches the first answer for the whole page, which is wrong for
 * tests and for a user toggling the OS setting mid-demo). Server and first paint assume motion.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, reducedNow, () => false);
}

/** The same easing everywhere: quick start, long soft landing. */
const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade/slide-in a block after `delayMs`. Under reduced motion the block is simply there. */
export function Reveal({ children, delayMs = 0 }: { children: ReactNode; delayMs?: number }) {
  const reduce = usePrefersReducedMotion();
  if (reduce) return <div data-motion="static">{children}</div>;
  return (
    <motion.div
      data-motion="reveal"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.max(0, delayMs) / 1000 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Reveal children one by one, `stepMs` apart (extraction lines, Gantt rows, phase cards).
 * Each child sits in a 1×1 grid cell so grid/flex parents and equal-height cards keep working.
 */
export function Stagger({ children, stepMs = 80 }: { children: ReactNode; stepMs?: number }) {
  const reduce = usePrefersReducedMotion();
  const items = Children.toArray(children);
  return (
    <>
      {items.map((child, i) => {
        const key = typeof child === "object" && child !== null && "key" in child ? (child.key ?? i) : i;
        if (reduce) {
          return (
            <div key={key} className="grid" data-motion="static">
              {child}
            </div>
          );
        }
        return (
          <motion.div
            key={key}
            className="grid"
            data-motion="stagger"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: (i * Math.max(0, stepMs)) / 1000 }}
          >
            {child}
          </motion.div>
        );
      })}
    </>
  );
}

/**
 * One-shot success ripple around children when `trigger` changes (phase paid → green).
 * It never fires on first mount, only on a later change. `data-ripple-count` counts the firings.
 */
export function Ripple({
  children,
  trigger,
  color = "var(--ppp-status-paid)",
}: {
  children: ReactNode;
  trigger: unknown;
  color?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const last = useRef(trigger);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (Object.is(last.current, trigger)) return;
    last.current = trigger;
    setCount((c) => c + 1);
  }, [trigger]);

  return (
    <div className="relative grid" data-motion="ripple" data-ripple-count={count}>
      {children}
      {count > 0 &&
        (reduce ? (
          // Reduced motion: a short non-moving flash of the ring, opacity only.
          <motion.span
            key={count}
            aria-hidden
            data-testid="ripple-wave"
            className="pointer-events-none absolute inset-0 rounded-[var(--ppp-radius)] border-2"
            style={{ borderColor: color }}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        ) : (
          <>
            {[0, 0.16].map((delay, i) => (
              <motion.span
                key={`${count}-${i}`}
                aria-hidden
                data-testid="ripple-wave"
                className="pointer-events-none absolute inset-0 rounded-[var(--ppp-radius)] border-2"
                style={{ borderColor: color, boxShadow: `0 0 28px 2px color-mix(in srgb, ${color} 35%, transparent)` }}
                initial={{ opacity: 0.75, scale: 1 }}
                animate={{ opacity: 0, scale: 1.07 }}
                transition={{ duration: 1.1, ease: "easeOut", delay }}
              />
            ))}
          </>
        ))}
    </div>
  );
}

/**
 * Animated number (counters, meters). `format` turns the current value into text (e.g. formatCents).
 * Counts up from 0 on mount and from the previous value on later changes; whole numbers only.
 * Under reduced motion it shows the final formatted value immediately.
 */
export function CountUp({
  value,
  format,
  durationMs = 900,
}: {
  value: number;
  format: (v: number) => string;
  durationMs?: number;
}) {
  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);

  // Client only, before paint: the first frame starts at 0 instead of flashing the final value.
  useLayoutEffect(() => {
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current ?? 0;
    if (start === value) {
      setShown(value);
      from.current = value;
      return;
    }
    setShown(start);
    const controls = animate(start, value, {
      duration: Math.max(0, durationMs) / 1000,
      ease: EASE,
      onUpdate: (v) => {
        from.current = v;
        setShown(Math.round(v));
      },
      onComplete: () => {
        from.current = value;
        setShown(value);
      },
    });
    return () => controls.stop();
  }, [value, durationMs, reduce]);

  return <span className="tabular-nums">{format(reduce ? value : shown)}</span>;
}
