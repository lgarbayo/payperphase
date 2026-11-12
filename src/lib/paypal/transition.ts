/**
 * The ONE place a PayPal fact changes a payment milestone.
 *
 * `transition(milestone, event)` is pure (never mutates its input, no I/O, no clock) and monotonic
 * in settlement progress:
 *
 *   unpaid (scheduled | upcoming | due | overdue)  →  processing  →  paid
 *        rank 0                                        rank 1         rank 2
 *
 * - `paid` is absorbing: once paid, every later event is ignored and the milestone never changes.
 * - An event whose rank is below the current rank is OUT_OF_ORDER and ignored
 *   (e.g. PAYMENT.CAPTURE.PENDING arriving after PAYMENT.CAPTURE.COMPLETED).
 * - Re-applying an event the milestone already reflects is a DUPLICATE and ignored (idempotent).
 * - The only backward edge is processing → due, and only when PayPal DENIES the very capture that
 *   put the milestone in processing. Without it a denied pending capture would block the patient
 *   from paying again (canCreateOrder refuses PROCESSING). `paid` is never left.
 *
 * Capture responses, webhooks and the redirect-return reconcile all funnel through here, so they
 * converge on the same state no matter which arrives first or how often.
 */
import type { PaymentMilestone, PaymentStatus } from "@/contracts";

export type PaymentEvent =
  /** Server created an Orders v2 order for this milestone (attempt = PayPal-Request-Id counter). */
  | { type: "ORDER_CREATED"; orderId: string; attempt: number }
  /** Capture accepted but held by PayPal (e.g. receiving preferences, eCheck). */
  | { type: "CAPTURE_PENDING"; orderId: string; captureId: string; amountCents?: number }
  /** Money captured on the per-phase checkout order. */
  | { type: "CAPTURE_COMPLETED"; orderId: string; captureId: string; amountCents: number; paidAt: string }
  /** PayPal denied a previously pending capture. */
  | { type: "CAPTURE_DENIED"; orderId: string; captureId: string }
  /** The phase invoice (issued by the agent) was paid directly on PayPal. */
  | { type: "INVOICE_PAID"; invoiceId: string; amountCents: number; paidAt: string; paymentId?: string };

export type PaymentEventType = PaymentEvent["type"];

export type IgnoredReason = "DUPLICATE" | "OUT_OF_ORDER";

export type TransitionResult =
  | { changed: true; milestone: PaymentMilestone; from: PaymentStatus; to: PaymentStatus }
  | { changed: false; milestone: PaymentMilestone; ignored: IgnoredReason };

const UNPAID: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>(["scheduled", "upcoming", "due", "overdue"]);

/** Settlement progress: unpaid 0 · processing 1 · paid 2. */
export function settlementRank(status: PaymentStatus): 0 | 1 | 2 {
  if (status === "paid") return 2;
  if (status === "processing") return 1;
  return 0;
}

function eventRank(e: PaymentEvent): 0 | 1 | 2 {
  switch (e.type) {
    case "ORDER_CREATED":
      return 0;
    case "CAPTURE_PENDING":
    case "CAPTURE_DENIED":
      return 1;
    case "CAPTURE_COMPLETED":
    case "INVOICE_PAID":
      return 2;
  }
}

export function isUnpaid(status: PaymentStatus): boolean {
  return UNPAID.has(status);
}

const ignore = (milestone: PaymentMilestone, ignored: IgnoredReason): TransitionResult => ({
  changed: false,
  milestone,
  ignored,
});

const change = (prev: PaymentMilestone, next: PaymentMilestone): TransitionResult => ({
  changed: true,
  milestone: next,
  from: prev.status,
  to: next.status,
});

export function transition(milestone: PaymentMilestone, event: PaymentEvent): TransitionResult {
  const m = milestone;
  const rank = settlementRank(m.status);

  // paid is absorbing.
  if (m.status === "paid") {
    const same =
      (event.type === "CAPTURE_COMPLETED" && event.captureId === m.captureId) ||
      // The phase invoice turns PAID when the agent records our checkout capture on it (or when it
      // was the instrument that settled the milestone): that is the same settlement, not a new one.
      (event.type === "INVOICE_PAID" && (m.invoice?.invoiceId === event.invoiceId || m.instrument === "invoice"));
    return ignore(m, same ? "DUPLICATE" : "OUT_OF_ORDER");
  }

  if (event.type !== "CAPTURE_DENIED" && eventRank(event) < rank) return ignore(m, "OUT_OF_ORDER");

  switch (event.type) {
    case "ORDER_CREATED": {
      if (event.attempt <= m.orderAttempt) {
        return ignore(m, event.orderId === m.orderId && event.attempt === m.orderAttempt ? "DUPLICATE" : "OUT_OF_ORDER");
      }
      return change(m, { ...m, orderId: event.orderId, orderAttempt: event.attempt });
    }

    case "CAPTURE_PENDING": {
      if (m.status === "processing") {
        return ignore(m, m.captureId === event.captureId ? "DUPLICATE" : "OUT_OF_ORDER");
      }
      return change(m, {
        ...m,
        status: "processing",
        instrument: "order",
        orderId: event.orderId,
        captureId: event.captureId,
      });
    }

    case "CAPTURE_COMPLETED":
      return change(m, {
        ...m,
        status: "paid",
        instrument: "order",
        orderId: event.orderId,
        captureId: event.captureId,
        paidCents: event.amountCents,
        paidAt: event.paidAt,
      });

    case "INVOICE_PAID":
      return change(m, {
        ...m,
        status: "paid",
        instrument: "invoice",
        captureId: event.paymentId ?? m.captureId,
        paidCents: event.amountCents,
        paidAt: event.paidAt,
        invoice:
          m.invoice && m.invoice.invoiceId === event.invoiceId ? { ...m.invoice, status: "PAID" } : m.invoice,
      });

    case "CAPTURE_DENIED": {
      if (m.status === "processing" && m.captureId === event.captureId) {
        const { captureId: _dropped, ...rest } = m;
        void _dropped;
        return change(m, { ...rest, status: "due", instrument: undefined });
      }
      return ignore(m, isUnpaid(m.status) && m.captureId === undefined ? "DUPLICATE" : "OUT_OF_ORDER");
    }
  }
}
