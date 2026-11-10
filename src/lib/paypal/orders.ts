/**
 * OWNED BY WP-04. Per-phase Orders v2 checkout: create, capture, and the redirect-return reconcile.
 *
 * Invariants:
 * - The amount ALWAYS comes from the stored plan (engine.canCreateOrder), never from the client.
 * - No order unless the milestone is due/overdue (no prepayment).
 * - One one-time order per phase (Pay Later excludes recurring/reference transactions).
 * - Mock mode (no credentials or FORCE_MOCKS=1) runs the very same create → capture → apply path,
 *   only the PayPal HTTP calls are replaced, so SSE turns the milestone green in mock mode too.
 */
import {
  CURRENCY,
  parsePhaseCustomId,
  phaseCustomId,
  planShortCode,
  type CapturePhaseOrderRequest,
  type CapturePhaseOrderResponse,
  type CaptureOutcome,
  type CreatePhaseOrderRequest,
  type CreatePhaseOrderResponse,
  type Phase,
  type Plan,
} from "@/contracts";
import { canCreateOrder } from "@/engine";
import { modes, serverEnv } from "@/env";
import { nowIso } from "@/lib/http";
import { centsToPayPalValue, payPalValueToCents } from "@/lib/money";
import { store } from "@/server/store";
import { applyPaymentEvent, type PaymentVia } from "./apply";
import { PayPalApiError, paypalRequest } from "./client";
import type { CreateOrderBody, PayPalCapture, PayPalOrder } from "./types";

export class PaymentNotAllowedError extends Error {
  constructor(public readonly reason: string) {
    super(`Order not allowed: ${reason}`);
    this.name = "PaymentNotAllowedError";
  }
}

type Mode = "live" | "mock";

// ---------------------------------------------------------------------------------------------
// Naming and idempotency keys
// ---------------------------------------------------------------------------------------------

/** Order invoice_id: PPP-{plan4}-F{n}-O{attempt}. `O` keeps it disjoint from invoices' `v{k}`. */
export function orderInvoiceId(planId: string, phaseN: number, attempt: number): string {
  return `PPP-${planShortCode(planId)}-F${phaseN}-O${attempt}`;
}

/** PayPal-Request-Id for order creation. */
export function createRequestId(planId: string, phaseId: string, attempt: number): string {
  return `${planId}-${phaseId}-create-${attempt}`;
}

const g = globalThis as unknown as { __pppCaptureDeclines?: Map<string, number> };
const declines = (g.__pppCaptureDeclines ??= new Map<string, number>());

/**
 * PayPal-Request-Id for a capture: "{orderId}-capture". After an INSTRUMENT_DECLINED the buyer picks
 * another funding source (actions.restart()) and we must not replay the cached decline, so later
 * tries on the same order get "-r{n}".
 */
export function captureRequestId(orderId: string): string {
  const n = declines.get(orderId) ?? 0;
  return n === 0 ? `${orderId}-capture` : `${orderId}-capture-r${n}`;
}

function paypalLocale(plan: Plan): string {
  return plan.patient.locale === "en" ? "en-GB" : "es-ES";
}

function orderDescription(plan: Plan, phase: Phase): string {
  const loc = plan.patient.locale;
  const label = loc === "en" ? "Phase" : "Fase";
  return `${plan.clinic.name} · ${label} ${phase.n}: ${phase.title[loc]}`.slice(0, 127);
}

/** The exact Orders v2 body for a phase (exported for tests and docs). */
export function buildCreateOrderBody(plan: Plan, phase: Phase, amountCents: number, attempt: number): CreateOrderBody {
  const base = serverEnv().PUBLIC_BASE_URL.replace(/\/+$/, "");
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: phase.id,
        description: orderDescription(plan, phase),
        custom_id: phaseCustomId(plan.id, phase.id),
        invoice_id: orderInvoiceId(plan.id, phase.n, attempt),
        amount: { currency_code: CURRENCY, value: centsToPayPalValue(amountCents) },
      },
    ],
    application_context: {
      brand_name: plan.clinic.name.slice(0, 127),
      locale: paypalLocale(plan),
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      return_url: `${base}/p/${plan.id}/return`,
      cancel_url: `${base}/p/${plan.id}`,
    },
  };
}

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

export async function createPhaseOrder(req: CreatePhaseOrderRequest): Promise<CreatePhaseOrderResponse> {
  const plan = await store.getPlan(req.planId);
  if (!plan) throw new PaymentNotAllowedError("UNKNOWN_PLAN");
  const clock = await store.getClock();
  const ok = canCreateOrder(plan, req.phaseId, clock.today);
  if (!ok.ok) throw new PaymentNotAllowedError(ok.reason);
  const phase = plan.phases.find((p) => p.id === req.phaseId);
  if (!phase) throw new PaymentNotAllowedError("UNKNOWN_PHASE");

  const mode: Mode = modes().paypal;
  let attempt = phase.payment.orderAttempt + 1;
  let orderId: string;

  if (mode === "mock") {
    orderId = `MOCK-${planShortCode(plan.id)}-${phase.id}-O${attempt}-${randomSuffix()}`;
  } else {
    const post = (n: number) =>
      paypalRequest<PayPalOrder>("POST", "/v2/checkout/orders", {
        body: buildCreateOrderBody(plan, phase, ok.amountCents, n),
        requestId: createRequestId(plan.id, phase.id, n),
      });
    try {
      orderId = (await post(attempt)).id;
    } catch (e) {
      if (!(e instanceof PayPalApiError && e.is("DUPLICATE_INVOICE_ID"))) throw e;
      attempt += 1;
      orderId = (await post(attempt)).id;
    }
  }

  await applyPaymentEvent({
    planId: plan.id,
    phaseId: phase.id,
    event: { type: "ORDER_CREATED", orderId, attempt },
    via: "capture",
  });
  return { orderId, amountCents: ok.amountCents, mode };
}

// ---------------------------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------------------------

export async function capturePhaseOrder(req: CapturePhaseOrderRequest): Promise<CapturePhaseOrderResponse> {
  return captureInternal(req, "capture");
}

async function captureInternal(req: CapturePhaseOrderRequest, via: PaymentVia): Promise<CapturePhaseOrderResponse> {
  const plan = await store.getPlan(req.planId);
  if (!plan) throw new PaymentNotAllowedError("UNKNOWN_PLAN");
  const phase = plan.phases.find((p) => p.id === req.phaseId);
  if (!phase) throw new PaymentNotAllowedError("UNKNOWN_PHASE");
  const mode: Mode = modes().paypal;

  if (phase.payment.status === "paid") {
    return { outcome: "ALREADY_CAPTURED", captureId: phase.payment.captureId, paidCents: phase.payment.paidCents, mode };
  }

  if (mode === "mock") {
    if (phase.payment.orderId !== req.orderId) throw new PaymentNotAllowedError("ORDER_MISMATCH");
    const captureId = `MOCK-CAP-${randomSuffix()}`;
    await applyPaymentEvent({
      planId: plan.id,
      phaseId: phase.id,
      event: {
        type: "CAPTURE_COMPLETED",
        orderId: req.orderId,
        captureId,
        amountCents: phase.amountCents,
        paidAt: nowIso(),
      },
      via,
    });
    return { outcome: "COMPLETED", captureId, paidCents: phase.amountCents, mode };
  }

  // An order we did not just create for this phase: check it really is this phase's order first.
  if (phase.payment.orderId !== req.orderId) {
    const order = await getOrder(req.orderId);
    const route = parsePhaseCustomId(order.purchase_units?.[0]?.custom_id ?? "");
    if (!route || route.planId !== plan.id || route.phaseId !== phase.id) {
      throw new PaymentNotAllowedError("ORDER_MISMATCH");
    }
  }

  let order: PayPalOrder;
  try {
    order = await paypalRequest<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(req.orderId)}/capture`, {
      body: {},
      requestId: captureRequestId(req.orderId),
    });
  } catch (e) {
    if (e instanceof PayPalApiError && e.is("INSTRUMENT_DECLINED")) {
      declines.set(req.orderId, (declines.get(req.orderId) ?? 0) + 1);
      return { outcome: "DECLINED", mode };
    }
    if (e instanceof PayPalApiError && e.is("ORDER_ALREADY_CAPTURED")) {
      const r = await reconcileOrder(req.orderId, via);
      return { outcome: "ALREADY_CAPTURED", captureId: r.captureId, paidCents: r.paidCents, mode };
    }
    throw e;
  }
  declines.delete(req.orderId);

  const applied = await applyOrderCapture(order, { planId: plan.id, phaseId: phase.id }, via);
  return { outcome: applied.outcome, captureId: applied.captureId, paidCents: applied.paidCents, mode };
}

export async function getOrder(orderId: string): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

function firstCapture(order: PayPalOrder): PayPalCapture | undefined {
  return order.purchase_units?.[0]?.payments?.captures?.[0];
}

function routeOf(order: PayPalOrder, capture?: PayPalCapture): { planId: string; phaseId: string } | null {
  return parsePhaseCustomId(capture?.custom_id ?? order.purchase_units?.[0]?.custom_id ?? "");
}

interface CaptureApplied {
  outcome: CaptureOutcome;
  captureId?: string;
  paidCents?: number;
}

/**
 * Turn an order's (first) capture into a PaymentEvent and apply it. The order's custom_id is the
 * routing truth; `fallback` is used only when PayPal did not echo one.
 */
async function applyOrderCapture(
  order: PayPalOrder,
  fallback: { planId: string; phaseId: string } | null,
  via: PaymentVia,
): Promise<CaptureApplied> {
  const capture = firstCapture(order);
  if (!capture) return { outcome: "DECLINED" };
  const route = routeOf(order, capture) ?? fallback;
  if (!route) return { outcome: "DECLINED", captureId: capture.id };
  const paidCents = capture.amount ? payPalValueToCents(capture.amount.value) : undefined;

  switch (capture.status) {
    case "COMPLETED":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED": {
      // A refund is the clinic's business; for the milestone, money was captured.
      await applyPaymentEvent({
        ...route,
        event: {
          type: "CAPTURE_COMPLETED",
          orderId: order.id,
          captureId: capture.id,
          amountCents: paidCents ?? 0,
          paidAt: capture.create_time ?? nowIso(),
        },
        via,
      });
      return { outcome: "COMPLETED", captureId: capture.id, paidCents };
    }
    case "PENDING":
      await applyPaymentEvent({ ...route, event: { type: "CAPTURE_PENDING", orderId: order.id, captureId: capture.id }, via });
      return { outcome: "PENDING", captureId: capture.id, paidCents };
    case "DECLINED":
    case "FAILED":
      await applyPaymentEvent({ ...route, event: { type: "CAPTURE_DENIED", orderId: order.id, captureId: capture.id }, via });
      return { outcome: "DECLINED", captureId: capture.id };
  }
}

/** GET the order and make the store agree with it (read-only towards PayPal: never captures). */
export async function reconcileOrder(
  orderId: string,
  via: PaymentVia,
): Promise<CaptureApplied & { route: { planId: string; phaseId: string } | null; orderStatus: PayPalOrder["status"] }> {
  const order = await getOrder(orderId);
  const route = routeOf(order, firstCapture(order));
  if (!route || !firstCapture(order)) return { outcome: "DECLINED", route, orderStatus: order.status };
  const r = await applyOrderCapture(order, route, via);
  return { ...r, route, orderStatus: order.status };
}

// ---------------------------------------------------------------------------------------------
// Redirect-return reconcile
// ---------------------------------------------------------------------------------------------

/**
 * For buyers who come back via full-page redirect (/p/[planId]/return?token=ORDER_ID). Idempotent:
 * APPROVED → capture; COMPLETED → ensure the milestone is paid. The outcome describes the order's
 * settled state, so calling it twice returns the same thing. Never throws (the return page only
 * redirects): failures are logged and reported as UNKNOWN_ORDER.
 */
export async function reconcileReturn(args: { planId: string; orderId: string }): Promise<{
  phaseId: string | null;
  outcome: CapturePhaseOrderResponse["outcome"] | "UNKNOWN_ORDER";
}> {
  try {
    const plan = await store.getPlan(args.planId);
    if (!plan) return { phaseId: null, outcome: "UNKNOWN_ORDER" };

    if (modes().paypal === "mock") {
      const phase = plan.phases.find((p) => p.payment.orderId === args.orderId);
      if (!phase) return { phaseId: null, outcome: "UNKNOWN_ORDER" };
      if (phase.payment.status === "paid") return { phaseId: phase.id, outcome: "COMPLETED" };
      const r = await captureInternal({ planId: plan.id, phaseId: phase.id, orderId: args.orderId }, "return");
      return { phaseId: phase.id, outcome: r.outcome === "ALREADY_CAPTURED" ? "COMPLETED" : r.outcome };
    }

    const order = await getOrder(args.orderId);
    const route = routeOf(order, firstCapture(order));
    if (!route || route.planId !== plan.id) return { phaseId: null, outcome: "UNKNOWN_ORDER" };

    if (order.status === "APPROVED") {
      const r = await captureInternal({ planId: plan.id, phaseId: route.phaseId, orderId: args.orderId }, "return");
      return { phaseId: route.phaseId, outcome: r.outcome === "ALREADY_CAPTURED" ? "COMPLETED" : r.outcome };
    }
    if (order.status === "COMPLETED") {
      const r = await applyOrderCapture(order, route, "return");
      return { phaseId: route.phaseId, outcome: r.outcome };
    }
    // CREATED / PAYER_ACTION_REQUIRED / VOIDED: the buyer never approved; nothing to reconcile.
    return { phaseId: route.phaseId, outcome: "UNKNOWN_ORDER" };
  } catch (e) {
    console.warn(`[paypal] reconcileReturn failed: ${e instanceof Error ? e.message : String(e)}`);
    return { phaseId: null, outcome: "UNKNOWN_ORDER" };
  }
}
