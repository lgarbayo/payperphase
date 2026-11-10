/**
 * Payment milestones on the simulated clock. Pay at the visit: dueDate === phase.startDate.
 * scheduled → upcoming (≤ UPCOMING_WINDOW_DAYS before, NOT payable) → due (visit day reached)
 * → overdue (more than OVERDUE_GRACE_DAYS after). processing and paid are set by checkout, never here.
 */
import {
  OVERDUE_GRACE_DAYS,
  UPCOMING_WINDOW_DAYS,
  type IsoDate,
  type OrderEligibility,
  type PaymentStatus,
  type Phase,
  type Plan,
} from "@/contracts";
import { daysBetween } from "@/lib/dates";
import { EngineError } from "./errors";

export type StatusChange = { phaseId: string; from: PaymentStatus; to: PaymentStatus };

/** The status a milestone has at `today`. Paid and processing milestones never change. */
export function paymentStatusAt(phase: Phase, today: IsoDate): PaymentStatus {
  const current = phase.payment.status;
  if (current === "paid" || current === "processing") return current;
  const daysUntilDue = daysBetween(today, phase.payment.dueDate);
  if (daysUntilDue > UPCOMING_WINDOW_DAYS) return "scheduled";
  if (daysUntilDue > 0) return "upcoming";
  if (-daysUntilDue > OVERDUE_GRACE_DAYS) return "overdue";
  return "due";
}

/** Re-derive scheduled/upcoming/due/overdue for every unpaid milestone at `today`. */
export function applyPaymentStatuses(plan: Plan, today: IsoDate): { plan: Plan; changes: StatusChange[] } {
  const changes: StatusChange[] = [];
  const phases = plan.phases.map((p) => {
    const to = paymentStatusAt(p, today);
    if (to === p.payment.status) return p;
    changes.push({ phaseId: p.id, from: p.payment.status, to });
    return { ...p, payment: { ...p.payment, status: to } };
  });
  if (changes.length === 0) return { plan, changes };
  return { plan: { ...plan, phases }, changes };
}

/**
 * Server-side no-prepayment invariant: an order may only be created for an unpaid milestone that is
 * due (or overdue) at `today`. The status is recomputed from the dates, never trusted from the store.
 */
export function canCreateOrder(plan: Plan, phaseId: string, today: IsoDate): OrderEligibility {
  const phase = plan.phases.find((p) => p.id === phaseId);
  if (!phase) return { ok: false, reason: "UNKNOWN_PHASE" };
  if (plan.status !== "approved") return { ok: false, reason: "PLAN_NOT_APPROVED" };
  if (phase.payment.status === "paid") return { ok: false, reason: "ALREADY_PAID" };
  if (phase.payment.status === "processing") return { ok: false, reason: "PROCESSING" };
  const status = paymentStatusAt(phase, today);
  if (status !== "due" && status !== "overdue") return { ok: false, reason: "NOT_DUE_YET" };
  return { ok: true, amountCents: phase.amountCents };
}

/** Clinic marks a phase's care as delivered (pay-at-visit also marks it on capture). */
export function markDelivered(plan: Plan, phaseId: string, on: IsoDate): Plan {
  if (!plan.phases.some((p) => p.id === phaseId)) {
    throw new EngineError("UNKNOWN_PHASE", `Unknown phase ${phaseId}`);
  }
  return {
    ...plan,
    phases: plan.phases.map((p) =>
      p.id === phaseId
        ? { ...p, delivery: { status: "delivered" as const, deliveredOn: p.delivery.deliveredOn ?? on } }
        : p,
    ),
  };
}
