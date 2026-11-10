/**
 * OWNED BY WP-01. Deterministic phase engine — pure, isomorphic TypeScript (runs in browser + server).
 * The ONLY producer of money (integer EUR cents) and dates (IsoDate). No I/O, no Date.now().
 *
 * SCAFFOLD STUB: signatures are the contract; bodies are placeholders returning fixture-shaped data
 * so every other WP compiles and runs from hour 0. WP-01 replaces the bodies, keeps the signatures.
 */
import {
  CURRENCY,
  DSCA_SOURCE_URL,
  LINKED_LOAN_ILLUSTRATIVE,
  PAY_IN_3,
  type BuildPlanInput,
  type ClosureStressTest,
  type ExposureReport,
  type HealingWindow,
  type IsoDate,
  type MoveRequest,
  type MoveValidation,
  type OrderEligibility,
  type PaymentStatus,
  type PhaseFit,
  type Plan,
  type PlanDiff,
  type PlanEdit,
  type WhatIfResult,
} from "@/contracts";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { addDays, daysBetween } from "@/lib/dates";

export type StatusChange = { phaseId: string; from: PaymentStatus; to: PaymentStatus };

/** Quote → phased, sized, scheduled draft plan (status "draft", no approvals, no baseline). */
export function buildPlan(input: BuildPlanInput): Plan {
  const plan = structuredClone(GOLDEN_PLAN);
  return {
    ...plan,
    id: input.planId,
    status: "draft",
    currency: CURRENCY,
    clinic: input.clinic,
    patient: input.patient,
    quoteId: input.extraction.quoteId,
    baseline: undefined,
    approvedNotes: [],
    approvedBy: undefined,
    approvedAt: undefined,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Pure check used by the Gantt validatorFn (sync) and the server before persisting a what-if. */
export function validateMove(plan: Plan, move: MoveRequest, today: IsoDate): MoveValidation {
  void today;
  const phase = plan.phases.find((p) => p.id === move.phaseId);
  if (!phase) return { ok: false, reason: "UNKNOWN_PHASE" };
  return { ok: true };
}

/** Apply a (valid) move and cascade successors. Successors never move earlier on a delay. */
export function reschedule(plan: Plan, move: MoveRequest, today: IsoDate): WhatIfResult {
  void today;
  const next = structuredClone(plan);
  const phase = next.phases.find((p) => p.id === move.phaseId);
  const shifts: WhatIfResult["shifts"] = [];
  if (phase) {
    const delta = daysBetween(phase.startDate, move.newStartDate);
    shifts.push({
      phaseId: phase.id,
      fromStart: phase.startDate,
      toStart: move.newStartDate,
      deltaDays: delta,
      fromDue: phase.payment.dueDate,
      toDue: move.newStartDate,
    });
    phase.startDate = move.newStartDate;
    phase.endDate = addDays(move.newStartDate, phase.durationDays);
    phase.payment.dueDate = move.newStartDate;
  }
  return { plan: next, request: move, shifts, warnings: [] };
}

/** Re-derive scheduled/upcoming/due/overdue for every unpaid milestone at `today`. */
export function applyPaymentStatuses(plan: Plan, today: IsoDate): { plan: Plan; changes: StatusChange[] } {
  void today;
  return { plan, changes: [] };
}

/** No-prepayment invariant: an order may only be created for a DUE (or overdue) unpaid milestone. */
export function canCreateOrder(plan: Plan, phaseId: string, today: IsoDate): OrderEligibility {
  void today;
  const phase = plan.phases.find((p) => p.id === phaseId);
  if (!phase) return { ok: false, reason: "UNKNOWN_PHASE" };
  if (plan.status !== "approved") return { ok: false, reason: "PLAN_NOT_APPROVED" };
  if (phase.payment.status === "paid") return { ok: false, reason: "ALREADY_PAID" };
  if (phase.payment.status === "processing") return { ok: false, reason: "PROCESSING" };
  if (phase.payment.status !== "due" && phase.payment.status !== "overdue") return { ok: false, reason: "NOT_DUE_YET" };
  return { ok: true, amountCents: phase.amountCents };
}

/** Clinic marks a phase's care as delivered (pay-at-visit also marks it on capture). */
export function markDelivered(plan: Plan, phaseId: string, on: IsoDate): Plan {
  return {
    ...plan,
    phases: plan.phases.map((p) => (p.id === phaseId ? { ...p, delivery: { status: "delivered", deliveredOn: on } } : p)),
  };
}

export function computeExposure(plan: Plan, today: IsoDate): ExposureReport {
  const byPhase = plan.phases.map((p) => ({
    phaseId: p.id,
    amountCents: p.amountCents,
    paid: p.payment.status === "paid",
    delivered: p.delivery.status === "delivered",
    status: p.payment.status,
  }));
  const paidCents = byPhase.filter((p) => p.paid).reduce((a, p) => a + p.amountCents, 0);
  const deliveredCents = byPhase.filter((p) => p.delivered).reduce((a, p) => a + p.amountCents, 0);
  const prepaid = byPhase.filter((p) => p.paid && !p.delivered).reduce((a, p) => a + p.amountCents, 0);
  return {
    asOf: today,
    totalCents: plan.totalCents,
    paidCents,
    deliveredCents,
    prepaidUndeliveredCents: prepaid,
    remainingCents: plan.totalCents - paidCents,
    byPhase,
  };
}

export function closureStressTest(plan: Plan, today: IsoDate): ClosureStressTest {
  const exposure = computeExposure(plan, today);
  const months = LINKED_LOAN_ILLUSTRATIVE.months;
  const monthlyCents = Math.round(plan.totalCents / months);
  return {
    asOf: today,
    illustrative: true,
    sourceUrl: DSCA_SOURCE_URL,
    linkedLoan: {
      financedCents: plan.totalCents,
      months,
      monthlyCents,
      monthsElapsed: 0,
      repaidCents: 0,
      outstandingCents: plan.totalCents,
      owedForUndeliveredCents: plan.totalCents - exposure.deliveredCents,
    },
    payPerPhase: {
      paidCents: exposure.paidCents,
      deliveredCents: exposure.deliveredCents,
      owedForUndeliveredCents: exposure.prepaidUndeliveredCents,
    },
    undeliveredPhaseIds: plan.phases.filter((p) => p.delivery.status !== "delivered").map((p) => p.id),
  };
}

/** Dentist edit → new plan version (re-sized, re-fitted, re-scheduled). */
export function applyEdit(plan: Plan, edit: PlanEdit, now: string): Plan {
  void edit;
  return { ...plan, version: plan.version + 1, updatedAt: now };
}

export function diffPlans(before: Plan, after: Plan): PlanDiff {
  return {
    planId: before.id,
    fromVersion: before.version,
    toVersion: after.version,
    totalBeforeCents: before.totalCents,
    totalAfterCents: after.totalCents,
    totalDeltaCents: after.totalCents - before.totalCents,
    phases: [],
  };
}

/** Hatched healing windows between dependent phases (for the Gantt). */
export function healingWindows(plan: Plan): HealingWindow[] {
  const out: HealingWindow[] = [];
  for (const p of plan.phases) {
    for (const d of p.dependsOn) {
      const pred = plan.phases.find((x) => x.id === d.phaseId);
      if (!pred) continue;
      out.push({
        fromPhaseId: pred.id,
        toPhaseId: p.id,
        startDate: pred.endDate,
        minEndDate: addDays(pred.endDate, d.minLagDays),
        maxEndDate: d.maxLagDays ? addDays(pred.endDate, d.maxLagDays) : undefined,
        actualEndDate: p.startDate,
        noteId: d.riskNoteId,
      });
    }
  }
  return out;
}

/** predecessor.endDate + maxLagDays (Bryntum deadlineDate), or null when unconstrained. */
export function deadlineFor(plan: Plan, phaseId: string): IsoDate | null {
  const w = healingWindows(plan).find((h) => h.toPhaseId === phaseId && h.maxEndDate);
  return w?.maxEndDate ?? null;
}

export function fitFor(amountCents: number): PhaseFit {
  if (amountCents >= PAY_IN_3.minCents && amountCents <= PAY_IN_3.maxCents)
    return { band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" };
  if (amountCents < PAY_IN_3.minCents) return { band: "PAYPAL_ONLY", reason: "BELOW_PAY_IN_3_MIN" };
  return { band: "INSTALLMENTS", reason: "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX" };
}

/** Snapshot current dates as the baseline ghost (on approval). */
export function captureBaseline(plan: Plan, now: string): Plan {
  return {
    ...plan,
    baseline: {
      capturedAt: now,
      version: plan.version,
      phases: plan.phases.map((p) => ({
        phaseId: p.id,
        startDate: p.startDate,
        endDate: p.endDate,
        dueDate: p.payment.dueDate,
        amountCents: p.amountCents,
      })),
    },
  };
}
