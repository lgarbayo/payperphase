"use client";
/**
 * OWNED BY WP-06. Live state for the patient page: the server-rendered PlanViewResponse, kept fresh
 * over SSE (useDomainEvents) with a coalescing refetch of GET /api/plans/:id?view=patient.
 *
 * `planRef` is what the URL used (a plan id or the alias "demo"). Refetches go through it so the
 * page follows the hero plan across demo resets (which re-id the plan); SSE subscribes to the
 * real plan id from the current view.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiFetch,
  type DomainEvent,
  type DomainEventType,
  type PhaseShift,
  type Plan,
  type PlanViewResponse,
} from "@/contracts";
import { useDomainEvents } from "@/lib/sse/useDomainEvents";

/** Events that change what the patient page shows: refetch the view. */
export const REFETCH_EVENTS: ReadonlySet<DomainEventType> = new Set<DomainEventType>([
  "PAYMENT_CAPTURED",
  "PHASE_STATUS_CHANGED",
  "PLAN_RESCHEDULED",
  "PLAN_EDITED",
  "PHASE_DELIVERED",
  "CLOCK_ADVANCED",
  "DEMO_RESET",
  "PLAN_APPROVED",
]);

/** Same phase paid twice within this window (onPaid + PAYMENT_CAPTURED) ripples once. */
const PULSE_DEDUPE_MS = 3_000;

export interface PlanLive {
  view: PlanViewResponse;
  /** Replace the plan (e.g. after a persisted what-if). The current baseline is kept if the new plan has none. */
  setPlan: (plan: Plan) => void;
  /** Coalescing refetch: concurrent calls share one request and one follow-up. */
  refetch: () => Promise<void>;
  refreshing: boolean;
  error: string | null;
  /** Chat what-if preview drawn as a Gantt ghost (undefined = none). */
  ghostShifts: PhaseShift[] | undefined;
  setGhostShifts: (shifts: PhaseShift[] | null) => void;
  /** phaseId → ripple counter; bumps on each (deduped) payment. */
  pulses: Readonly<Record<string, number>>;
  /** Bump the ripple for a phase. Returns false when deduped. */
  pulse: (phaseId: string) => boolean;
  /** Wall-clock ms of the last SSE event (UI "live" indicator only). */
  lastEventAt: number | null;
}

export function usePlanLive(
  planRef: string,
  initial: PlanViewResponse,
  opts?: { onEvent?: (e: DomainEvent, accepted: { pulsed: boolean }) => void },
): PlanLive {
  const [view, setView] = useState<PlanViewResponse>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghost, setGhost] = useState<PhaseShift[] | undefined>(undefined);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const mounted = useRef(true);
  const inflight = useRef<Promise<void> | null>(null);
  const dirty = useRef(false);
  const lastPulse = useRef<Record<string, number>>({});
  const onEventRef = useRef(opts?.onEvent);
  onEventRef.current = opts?.onEvent;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refetch = useCallback((): Promise<void> => {
    if (inflight.current) {
      dirty.current = true;
      return inflight.current;
    }
    const run = async () => {
      if (mounted.current) setRefreshing(true);
      do {
        dirty.current = false;
        try {
          const next = await apiFetch<PlanViewResponse>(`/api/plans/${encodeURIComponent(planRef)}?view=patient`, {
            cache: "no-store",
          });
          if (mounted.current) {
            setView(next);
            setError(null);
          }
        } catch (e) {
          if (mounted.current) setError(e instanceof Error ? e.message : String(e));
        }
      } while (dirty.current && mounted.current);
      if (mounted.current) setRefreshing(false);
    };
    const p = run().finally(() => {
      inflight.current = null;
    });
    inflight.current = p;
    return p;
  }, [planRef]);

  const pulse = useCallback((phaseId: string): boolean => {
    const now = Date.now();
    const last = lastPulse.current[phaseId];
    if (last !== undefined && now - last < PULSE_DEDUPE_MS) return false;
    lastPulse.current[phaseId] = now;
    setPulses((p) => ({ ...p, [phaseId]: (p[phaseId] ?? 0) + 1 }));
    return true;
  }, []);

  const setPlan = useCallback((plan: Plan) => {
    setView((v) => ({ ...v, plan: { ...plan, baseline: plan.baseline ?? v.plan.baseline } }));
  }, []);

  const setGhostShifts = useCallback((shifts: PhaseShift[] | null) => {
    setGhost(shifts && shifts.length > 0 ? shifts : undefined);
  }, []);

  useDomainEvents(view.plan.id, (e) => {
    setLastEventAt(Date.now());
    let pulsed = false;
    if (e.type === "PAYMENT_CAPTURED") pulsed = pulse(e.phaseId);
    if (e.type === "CHAT_PREVIEW") setGhostShifts(e.shifts);
    if (e.type === "DEMO_RESET") setGhost(undefined);
    if (REFETCH_EVENTS.has(e.type)) void refetch();
    onEventRef.current?.(e, { pulsed });
  });

  // Catch up after the tab was hidden (e.g. the PayPal popup or a redirect), in case SSE dropped frames.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);

  return {
    view,
    setPlan,
    refetch,
    refreshing,
    error,
    ghostShifts: ghost,
    setGhostShifts,
    pulses,
    pulse,
    lastEventAt,
  };
}
