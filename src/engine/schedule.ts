/**
 * Healing-lag schedule. Dates are IsoDate strings (lexicographic order = chronological order).
 * endDate is EXCLUSIVE and every lag is measured from the predecessor's endDate (src/lib/dates.ts).
 * Visits only land on clinic days (Mon–Fri).
 */
import type { DeadlineWarning, HealingWindow, IsoDate, Phase, PhaseDependency, Plan } from "@/contracts";
import { addDays, daysBetween, nextClinicDay } from "@/lib/dates";

/** Phases in dependency order (predecessors first), ties broken by phase number. */
export function topoOrder(phases: readonly Phase[]): Phase[] {
  const byId = new Map(phases.map((p) => [p.id, p]));
  const state = new Map<string, "visiting" | "done">();
  const out: Phase[] = [];
  const visit = (p: Phase) => {
    if (state.has(p.id)) return; // done, or a cycle (ignored: plans never contain one)
    state.set(p.id, "visiting");
    for (const d of p.dependsOn) {
      const pred = byId.get(d.phaseId);
      if (pred) visit(pred);
    }
    state.set(p.id, "done");
    out.push(p);
  };
  for (const p of [...phases].sort((a, b) => a.n - b.n)) visit(p);
  return out;
}

/** Paid, in-flight or delivered phases are frozen: their dates never change. */
export function lockReason(phase: Phase): "PHASE_PAID" | "PHASE_DELIVERED" | null {
  if (phase.payment.status === "paid" || phase.payment.status === "processing") return "PHASE_PAID";
  if (phase.delivery.status === "delivered") return "PHASE_DELIVERED";
  return null;
}

/** Moves a phase (mutates): start, exclusive end and the pay-at-the-visit due date stay in sync. */
export function setPhaseStart(phase: Phase, startDate: IsoDate): void {
  phase.startDate = startDate;
  phase.endDate = addDays(startDate, phase.durationDays);
  phase.payment.dueDate = startDate;
}

export interface Requirement {
  /** Earliest start allowed by the min lags (not yet snapped to a clinic day). */
  date: IsoDate;
  /** The dependency that sets it (the binding healing window). */
  dep: PhaseDependency;
}

/** max over the phase's dependencies of `pred.endDate + minLagDays`, or null when it has none. */
export function requiredStart(phase: Phase, endOf: (phaseId: string) => IsoDate | undefined): Requirement | null {
  let best: Requirement | null = null;
  for (const dep of phase.dependsOn) {
    const end = endOf(dep.phaseId);
    if (end === undefined) continue;
    const date = addDays(end, dep.minLagDays);
    if (!best || date > best.date) best = { date, dep };
  }
  return best;
}

export interface CascadeResult {
  /** New start for every phase whose start changes (including the moved phase). */
  starts: Map<string, IsoDate>;
  /** A frozen successor that would have to move; the move is then illegal. */
  blockedBy: Phase | null;
}

/**
 * Moves `phaseId` to `newStart` and pushes every (transitive) successor that would break its min lag
 * to `nextClinicDay(pred.endDate + minLagDays)`. Successors never move earlier: new start =
 * max(current start, required). Pure: the plan is not modified.
 */
export function cascade(plan: Plan, phaseId: string, newStart: IsoDate): CascadeResult {
  const byId = new Map(plan.phases.map((p) => [p.id, p]));
  const starts = new Map<string, IsoDate>([[phaseId, newStart]]);
  const startOf = (id: string) => starts.get(id) ?? byId.get(id)?.startDate;
  const endOf = (id: string) => {
    const s = startOf(id);
    const p = byId.get(id);
    return s === undefined || !p ? undefined : addDays(s, p.durationDays);
  };
  for (const p of topoOrder(plan.phases)) {
    if (p.id === phaseId) continue;
    if (!p.dependsOn.some((d) => starts.has(d.phaseId))) continue;
    const req = requiredStart(p, endOf);
    if (!req || req.date <= p.startDate) continue;
    if (lockReason(p)) return { starts, blockedBy: p };
    starts.set(p.id, nextClinicDay(req.date));
  }
  return { starts, blockedBy: null };
}

/** Every dependency whose max lag is exceeded (the Gantt's red deadline). */
export function deadlineWarnings(plan: Plan): DeadlineWarning[] {
  const byId = new Map(plan.phases.map((p) => [p.id, p]));
  const out: DeadlineWarning[] = [];
  for (const p of [...plan.phases].sort((a, b) => a.n - b.n)) {
    for (const d of p.dependsOn) {
      const pred = byId.get(d.phaseId);
      if (!pred || d.maxLagDays === undefined) continue;
      const deadlineDate = addDays(pred.endDate, d.maxLagDays);
      if (p.startDate <= deadlineDate) continue;
      out.push({
        phaseId: p.id,
        deadlineDate,
        exceededByDays: daysBetween(deadlineDate, p.startDate),
        noteId: d.deadlineNoteId ?? d.riskNoteId,
      });
    }
  }
  return out;
}

/** Hatched healing windows between dependent phases (for the Gantt). */
export function healingWindows(plan: Plan): HealingWindow[] {
  const byId = new Map(plan.phases.map((p) => [p.id, p]));
  const out: HealingWindow[] = [];
  for (const p of [...plan.phases].sort((a, b) => a.n - b.n)) {
    for (const d of p.dependsOn) {
      const pred = byId.get(d.phaseId);
      if (!pred) continue;
      const w: HealingWindow = {
        fromPhaseId: pred.id,
        toPhaseId: p.id,
        startDate: pred.endDate,
        minEndDate: addDays(pred.endDate, d.minLagDays),
        actualEndDate: p.startDate,
        noteId: d.riskNoteId,
      };
      if (d.maxLagDays !== undefined) w.maxEndDate = addDays(pred.endDate, d.maxLagDays);
      out.push(w);
    }
  }
  return out;
}

/** predecessor.endDate + maxLagDays (Bryntum deadlineDate), the earliest one when several apply; null when unconstrained. */
export function deadlineFor(plan: Plan, phaseId: string): IsoDate | null {
  let best: IsoDate | null = null;
  for (const w of healingWindows(plan)) {
    if (w.toPhaseId !== phaseId || w.maxEndDate === undefined) continue;
    if (best === null || w.maxEndDate < best) best = w.maxEndDate;
  }
  return best;
}

/** Snapshot current dates and amounts as the baseline ghost (on approval). */
export function captureBaseline(plan: Plan, now: string): Plan {
  return {
    ...plan,
    baseline: {
      capturedAt: now,
      version: plan.version,
      phases: [...plan.phases]
        .sort((a, b) => a.n - b.n)
        .map((p) => ({
          phaseId: p.id,
          startDate: p.startDate,
          endDate: p.endDate,
          dueDate: p.payment.dueDate,
          amountCents: p.amountCents,
        })),
    },
  };
}
