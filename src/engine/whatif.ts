/**
 * Drag what-ifs. validateMove is synchronous and allocation-light: the Gantt's validatorFn calls it on
 * every drag frame. reschedule applies a valid move and cascades it to successors.
 */
import type { IsoDate, MoveRequest, MoveValidation, Plan, WhatIfResult } from "@/contracts";
import { addDays, daysBetween, maxIso, nextClinicDay } from "@/lib/dates";
import { EngineError } from "./errors";
import { paymentStatusAt } from "./payments";
import { cascade, deadlineWarnings, lockReason, requiredStart, setPhaseStart } from "./schedule";

/** Where a drop actually lands: weekend drops snap to the next Monday. */
export function snapToClinicDay(date: IsoDate): IsoDate {
  return nextClinicDay(date);
}

/** Pure check used by the Gantt validatorFn (sync) and the server before persisting a what-if. */
export function validateMove(plan: Plan, move: MoveRequest, today: IsoDate): MoveValidation {
  const phase = plan.phases.find((p) => p.id === move.phaseId);
  if (!phase) return { ok: false, reason: "UNKNOWN_PHASE" };
  const locked = lockReason(phase);
  if (locked) return { ok: false, reason: locked };

  const endOf = (id: string) => plan.phases.find((p) => p.id === id)?.endDate;
  const req = requiredStart(phase, endOf);
  const earliestStartDate = nextClinicDay(req ? maxIso(req.date, today) : today);

  if (move.newStartDate < today) return { ok: false, reason: "IN_THE_PAST", earliestStartDate };
  const target = snapToClinicDay(move.newStartDate);
  if (req && target < req.date) {
    return { ok: false, reason: "MIN_LAG", noteId: req.dep.riskNoteId, earliestStartDate };
  }
  const { blockedBy } = cascade(plan, phase.id, target);
  if (blockedBy) return { ok: false, reason: lockReason(blockedBy) ?? "PHASE_PAID" };
  return { ok: true };
}

/**
 * Apply a valid move and cascade successors (new start = max(current, required), on clinic days).
 * Successors never move earlier; paid and delivered phases never move. Bumps `version`.
 * Throws EngineError("INVALID_MOVE") for a move validateMove rejects.
 */
export function reschedule(plan: Plan, move: MoveRequest, today: IsoDate): WhatIfResult {
  const validation = validateMove(plan, move, today);
  if (!validation.ok) {
    throw new EngineError("INVALID_MOVE", `Move rejected: ${validation.reason}`, validation);
  }
  const target = snapToClinicDay(move.newStartDate);
  const { starts } = cascade(plan, move.phaseId, target);

  const next = structuredClone(plan);
  const shifts: WhatIfResult["shifts"] = [];
  for (const p of [...next.phases].sort((a, b) => a.n - b.n)) {
    const to = starts.get(p.id);
    if (to === undefined) continue;
    const fromStart = p.startDate;
    const fromDue = p.payment.dueDate;
    setPhaseStart(p, to);
    p.payment.status = paymentStatusAt(p, today);
    shifts.push({ phaseId: p.id, fromStart, toStart: to, deltaDays: daysBetween(fromStart, to), fromDue, toDue: to });
  }
  next.version = plan.version + 1;
  return { plan: next, request: { ...move }, shifts, warnings: deadlineWarnings(next) };
}

/** Convenience for "what if I wait N days?" (chat simulate_delay): the start date N days later. */
export function delayedStart(plan: Plan, phaseId: string, days: number): IsoDate | null {
  const phase = plan.phases.find((p) => p.id === phaseId);
  return phase ? snapToClinicDay(addDays(phase.startDate, days)) : null;
}
