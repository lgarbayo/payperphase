/**
 * Persists a PaymentEvent through the pure transition() and publishes what changed.
 * Capture responses, webhooks and the return reconcile all call this, so a fact that arrives three
 * times changes the store once and publishes once.
 */
import type { IsoDate, Phase, PaymentStatus, Plan } from "@/contracts";
import { markDelivered, paymentStatusAt } from "@/engine";
import { nowIso } from "@/lib/http";
import { publish } from "@/server/events";
import { store } from "@/server/store";
import { transition, type IgnoredReason, type PaymentEvent } from "./transition";

export type PaymentVia = "capture" | "webhook" | "return";

export interface ApplyResult {
  changed: boolean;
  ignored?: IgnoredReason | "UNKNOWN_PHASE";
  /** Set when a capture was refused by captureRefusal(): the milestone was left untouched. */
  refused?: CaptureRefusal;
  from?: PaymentStatus;
  to?: PaymentStatus;
  /** Phase as stored after the call (null when the plan/phase does not exist). */
  phase: Phase | null;
}

/** Statuses at which the visit day has been reached: a payment then also means "delivered". */
const VISIT_REACHED: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>(["due", "overdue", "processing"]);

export type CaptureRefusal = "PLAN_NOT_APPROVED" | "NOT_DUE_YET" | "AMOUNT_MISMATCH";

/**
 * ADR-4 on the way in: a checkout capture settles a phase only for the server-set amount (EUR cents,
 * callers pass 0 for a non-EUR or missing amount) and only once the visit day has come. Anything
 * else (e.g. an order made in the browser with the public client id and this phase's custom_id)
 * is refused here, so no confirmation path (capture, webhook, return) can count it.
 */
export function captureRefusal(plan: Plan, phase: Phase, event: PaymentEvent, today: IsoDate): CaptureRefusal | null {
  if (event.type !== "CAPTURE_COMPLETED" && event.type !== "CAPTURE_PENDING") return null;
  if (plan.status !== "approved") return "PLAN_NOT_APPROVED";
  if (!VISIT_REACHED.has(paymentStatusAt(phase, today))) return "NOT_DUE_YET";
  if (event.amountCents !== undefined && event.amountCents !== phase.amountCents) return "AMOUNT_MISMATCH";
  return null;
}

export async function applyPaymentEvent(args: {
  planId: string;
  phaseId: string;
  event: PaymentEvent;
  via: PaymentVia;
}): Promise<ApplyResult> {
  const { planId, phaseId, event, via } = args;
  const clock = await store.getClock();
  const now = nowIso();

  let result: ApplyResult = { changed: false, ignored: "UNKNOWN_PHASE", phase: null };
  let delivered = false;

  let plan: Plan;
  try {
    plan = await store.updatePlan(planId, (p) => {
      const phase = p.phases.find((x) => x.id === phaseId);
      if (!phase) return p;
      const r = transition(phase.payment, event);
      if (!r.changed) {
        result = { changed: false, ignored: r.ignored, phase };
        return p;
      }
      const refused = captureRefusal(p, phase, event, clock.today);
      if (refused) {
        result = { changed: false, refused, phase };
        return p;
      }
      let next: Plan = {
        ...p,
        updatedAt: now,
        phases: p.phases.map((x) => (x.id === phaseId ? { ...x, payment: r.milestone } : x)),
      };
      // Pay at the visit: a payment on a phase whose visit day has come also marks the care delivered.
      // An early invoice payment (scheduled/upcoming) does not, so the exposure meter shows it honestly.
      if (r.to === "paid" && VISIT_REACHED.has(r.from) && phase.delivery.status !== "delivered") {
        next = markDelivered(next, phaseId, clock.today);
        delivered = true;
      }
      result = { changed: true, from: r.from, to: r.to, phase: next.phases.find((x) => x.id === phaseId) ?? null };
      return next;
    });
  } catch {
    return { changed: false, ignored: "UNKNOWN_PHASE", phase: null };
  }

  if (result.refused) {
    console.warn(`[paypal] ${event.type} via ${via} refused for ${planId}:${phaseId}: ${result.refused}`);
  }
  if (!result.changed) return result;
  const phase = result.phase;
  const realPlanId = plan.id;

  if (event.type === "CAPTURE_COMPLETED") {
    publish({
      type: "PAYMENT_CAPTURED",
      planId: realPlanId,
      phaseId,
      orderId: event.orderId,
      captureId: event.captureId,
      amountCents: event.amountCents,
      via,
    });
  }
  if (result.from && result.to && result.from !== result.to) {
    publish({ type: "PHASE_STATUS_CHANGED", planId: realPlanId, phaseId, from: result.from, to: result.to });
  }
  if (event.type === "INVOICE_PAID" && phase?.payment.invoice?.invoiceId === event.invoiceId) {
    publish({
      type: "INVOICE_UPDATED",
      planId: realPlanId,
      phaseId,
      invoiceId: event.invoiceId,
      invoiceNumber: phase.payment.invoice.invoiceNumber,
      status: "PAID",
    });
  }
  if (delivered) publish({ type: "PHASE_DELIVERED", planId: realPlanId, phaseId });
  return result;
}
