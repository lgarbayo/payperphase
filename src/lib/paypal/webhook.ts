/**
 * PayPal webhooks: signature verification, dedupe on the PayPal event id, routing,
 * and the pure transition(). Independent confirmation of what the capture response already applied.
 *
 *   PAYMENT.CAPTURE.COMPLETED|PENDING|DENIED|DECLINED → routed by the capture's custom_id
 *   INVOICING.INVOICE.PAID                           → routed by the phase's stored invoice.invoiceId
 *   anything else, unroutable, or out-of-order       → GET reconcile (read-only)
 */
import { parsePhaseCustomId, type WebhookEventRecord } from "@/contracts";
import { modes, serverEnv } from "@/env";
import { nowIso } from "@/lib/http";
import { payPalValueToCents } from "@/lib/money";
import { store } from "@/server/store";
import { applyPaymentEvent, captureRefusal } from "./apply";
import { paypalRequest } from "./client";
import { eurCents, reconcileOrder } from "./orders";
import { transition, type PaymentEvent, type TransitionResult } from "./transition";
import type { PayPalCapture, PayPalInvoice, PayPalWebhookEvent } from "./types";

export const WEBHOOK_HEADERS = {
  authAlgo: "paypal-auth-algo",
  certUrl: "paypal-cert-url",
  transmissionId: "paypal-transmission-id",
  transmissionSig: "paypal-transmission-sig",
  transmissionTime: "paypal-transmission-time",
} as const;

type HeaderSource = Headers | Record<string, string | undefined>;

function header(h: HeaderSource, name: string): string | undefined {
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | undefined>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  return key ? rec[key] : undefined;
}

/**
 * Verify a webhook delivery with POST /v1/notifications/verify-webhook-signature.
 * The raw body is spliced in verbatim (not re-serialised) so PayPal checks the exact bytes it signed.
 * Returns false (never throws) when anything is missing, malformed or not SUCCESS.
 */
export async function verifyWebhookSignature(args: { headers: HeaderSource; rawBody: string }): Promise<boolean> {
  const env = serverEnv();
  if (modes(env).paypalWebhooks !== "live" || !env.PAYPAL_WEBHOOK_ID) return false;
  const values = {
    auth_algo: header(args.headers, WEBHOOK_HEADERS.authAlgo),
    cert_url: header(args.headers, WEBHOOK_HEADERS.certUrl),
    transmission_id: header(args.headers, WEBHOOK_HEADERS.transmissionId),
    transmission_sig: header(args.headers, WEBHOOK_HEADERS.transmissionSig),
    transmission_time: header(args.headers, WEBHOOK_HEADERS.transmissionTime),
  };
  if (Object.values(values).some((v) => !v)) return false;
  try {
    JSON.parse(args.rawBody);
  } catch {
    return false;
  }
  const fields = Object.entries({ ...values, webhook_id: env.PAYPAL_WEBHOOK_ID })
    .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
    .join(",");
  const body = `{${fields},"webhook_event":${args.rawBody}}`;
  try {
    const r = await paypalRequest<{ verification_status?: string }>(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      { body },
    );
    return r.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

export type WebhookHandleStatus = "applied" | "duplicate" | "already_applied" | "reconciled" | "ignored";

export interface WebhookHandleResult {
  status: WebhookHandleStatus;
  eventId: string;
  eventType: string;
  planId?: string;
  phaseId?: string;
}

interface Routed {
  target?: { planId: string; phaseId: string; event: PaymentEvent };
  /** What to GET when the event cannot be applied directly. */
  reconcile?: { orderId?: string; invoiceId?: string };
  resourceId?: string;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

function moneyCents(v: unknown): number | undefined {
  const value = str((v as { value?: unknown } | undefined)?.value);
  if (!value) return undefined;
  try {
    return payPalValueToCents(value);
  } catch {
    return undefined;
  }
}

async function findPhaseByInvoiceId(invoiceId: string): Promise<{ planId: string; phaseId: string } | null> {
  for (const summary of await store.listPlans()) {
    const plan = await store.getPlan(summary.id);
    const phase = plan?.phases.find((p) => p.payment.invoice?.invoiceId === invoiceId);
    if (plan && phase) return { planId: plan.id, phaseId: phase.id };
  }
  return null;
}

async function route(event: PayPalWebhookEvent): Promise<Routed> {
  const resource = (event.resource ?? {}) as Record<string, unknown>;
  const type = event.event_type;

  if (type.startsWith("PAYMENT.CAPTURE.")) {
    const capture = resource as unknown as PayPalCapture;
    const captureId = str(capture.id);
    const orderId = str(capture.supplementary_data?.related_ids?.order_id);
    const reconcile = orderId ? { orderId } : undefined;
    const target = parsePhaseCustomId(str(capture.custom_id) ?? "");
    if (!captureId || !target) return { reconcile, resourceId: captureId };
    let paymentEvent: PaymentEvent | null = null;
    if (type === "PAYMENT.CAPTURE.COMPLETED") {
      const amountCents = eurCents(capture.amount);
      if (orderId && amountCents !== undefined) {
        paymentEvent = {
          type: "CAPTURE_COMPLETED",
          orderId,
          captureId,
          amountCents,
          paidAt: str(capture.create_time) ?? str(event.create_time) ?? nowIso(),
        };
      }
    } else if (type === "PAYMENT.CAPTURE.PENDING" && orderId) {
      paymentEvent = { type: "CAPTURE_PENDING", orderId, captureId, amountCents: eurCents(capture.amount) ?? 0 };
    } else if ((type === "PAYMENT.CAPTURE.DENIED" || type === "PAYMENT.CAPTURE.DECLINED") && orderId) {
      paymentEvent = { type: "CAPTURE_DENIED", orderId, captureId };
    }
    return { target: paymentEvent ? { ...target, event: paymentEvent } : undefined, reconcile, resourceId: captureId };
  }

  if (type.startsWith("INVOICING.INVOICE.")) {
    const invoice = ((resource.invoice as PayPalInvoice | undefined) ?? (resource as unknown as PayPalInvoice)) as PayPalInvoice;
    const invoiceId = str(invoice.id);
    if (!invoiceId) return {};
    const reconcile = { invoiceId };
    if (type !== "INVOICING.INVOICE.PAID") return { reconcile, resourceId: invoiceId };
    const phase = await findPhaseByInvoiceId(invoiceId);
    const amountCents = moneyCents(invoice.payments?.paid_amount) ?? moneyCents(invoice.amount);
    if (!phase || amountCents === undefined) return { reconcile, resourceId: invoiceId };
    return {
      target: {
        ...phase,
        event: {
          type: "INVOICE_PAID",
          invoiceId,
          amountCents,
          paidAt: str(event.create_time) ?? nowIso(),
          paymentId: str(invoice.payments?.transactions?.[0]?.payment_id),
        },
      },
      reconcile,
      resourceId: invoiceId,
    };
  }

  // Unknown type: reconcile whatever order/invoice it points at.
  const resourceId = str(resource.id);
  const related = str((resource.supplementary_data as PayPalCapture["supplementary_data"])?.related_ids?.order_id);
  if (related) return { reconcile: { orderId: related }, resourceId };
  if (type.startsWith("CHECKOUT.ORDER.") && resourceId) return { reconcile: { orderId: resourceId }, resourceId };
  return { resourceId };
}

/** GET the invoice and, if PayPal says it is paid, apply INVOICE_PAID to the phase that holds it. */
async function reconcileInvoice(invoiceId: string): Promise<{ planId: string; phaseId: string } | null> {
  const invoice = await paypalRequest<PayPalInvoice>("GET", `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`);
  const phase = await findPhaseByInvoiceId(invoiceId);
  if (!phase || (invoice.status !== "PAID" && invoice.status !== "MARKED_AS_PAID")) return phase;
  const amountCents = moneyCents(invoice.payments?.paid_amount) ?? moneyCents(invoice.amount);
  if (amountCents === undefined) return phase;
  await applyPaymentEvent({
    ...phase,
    event: {
      type: "INVOICE_PAID",
      invoiceId,
      amountCents,
      paidAt: nowIso(),
      paymentId: str(invoice.payments?.transactions?.[0]?.payment_id),
    },
    via: "webhook",
  });
  return phase;
}

/**
 * Handle one VERIFIED webhook event. Dedupe first (store.recordWebhookEvent is UNIQUE on the PayPal
 * event id), then apply through transition(); unknown or out-of-order events trigger a GET reconcile.
 */
export async function handleWebhookEvent(
  event: PayPalWebhookEvent,
  opts: { verified: boolean } = { verified: true },
): Promise<WebhookHandleResult> {
  const routed = await route(event);
  const target = routed.target;

  // Preview the transition (pure) so the audit record says whether this event changes anything.
  let preview: TransitionResult | null = null;
  let refused: string | null = null;
  if (target) {
    const plan = await store.getPlan(target.planId);
    const phase = plan?.phases.find((p) => p.id === target.phaseId);
    if (plan && phase) {
      preview = transition(phase.payment, target.event);
      if (preview.changed) refused = captureRefusal(plan, phase, target.event, (await store.getClock()).today);
    }
  }

  const record: WebhookEventRecord = {
    eventId: event.id,
    eventType: event.event_type,
    receivedAt: nowIso(),
    verified: opts.verified,
    resourceId: routed.resourceId,
    planId: target?.planId,
    phaseId: target?.phaseId,
    applied: (preview?.changed ?? false) && !refused,
  };
  const base = { eventId: event.id, eventType: event.event_type, planId: target?.planId, phaseId: target?.phaseId };
  if (!(await store.recordWebhookEvent(record))) return { ...base, status: "duplicate" };
  // Not the server's amount, or not payable yet (ADR-4): recorded, never applied, nothing to reconcile.
  if (refused) {
    console.warn(`[paypal] webhook ${event.event_type} ${event.id} refused for ${target?.planId}:${target?.phaseId}: ${refused}`);
    return { ...base, status: "ignored" };
  }

  if (target && preview?.changed) {
    const r = await applyPaymentEvent({ ...target, via: "webhook" });
    if (r.changed) return { ...base, status: "applied" };
  }
  // Already reflected (e.g. the capture response got here first): nothing to do.
  if (preview && !preview.changed && preview.ignored === "DUPLICATE") return { ...base, status: "already_applied" };

  // Unknown, unroutable or out-of-order: ask PayPal for the truth.
  if (modes().paypal !== "live") return { ...base, status: "ignored" };
  // The event id is already recorded, so a PayPal retry would be dropped as a duplicate: a failed GET
  // must not turn into a 500. The capture response and the /return reconcile cover the same ground.
  try {
    if (routed.reconcile?.orderId) {
      const r = await reconcileOrder(routed.reconcile.orderId, "webhook");
      return { ...base, planId: r.route?.planId ?? base.planId, phaseId: r.route?.phaseId ?? base.phaseId, status: "reconciled" };
    }
    if (routed.reconcile?.invoiceId) {
      const r = await reconcileInvoice(routed.reconcile.invoiceId);
      return { ...base, planId: r?.planId ?? base.planId, phaseId: r?.phaseId ?? base.phaseId, status: "reconciled" };
    }
  } catch (e) {
    console.warn(`[paypal] webhook ${event.event_type} reconcile failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { ...base, status: "ignored" };
}
