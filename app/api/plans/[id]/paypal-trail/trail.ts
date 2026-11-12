/**
 * Builds the PayPal trail of a plan: per phase the order → capture → webhook → invoice → agent steps.
 * IDS AND STATUSES ONLY: no emails, tokens, payer names or payload bodies ever leave this function
 * (the invoice's recipientEmail and the agent steps' input/output are deliberately never read).
 */
import type { AgentStep, InvoiceToolName, Plan, WebhookEventRecord } from "@/contracts";
import type { PayPalTrailResponse, TrailAgentStep, TrailPhase, TrailWebhook } from "@/components/clinic/PayPalTrail";
import { modes } from "@/env";

/** The invoice tools worth showing in the trail (reads like get_invoice are noise). */
export const TRAIL_TOOLS: readonly InvoiceToolName[] = [
  "create_invoice",
  "send_invoice",
  "record_payment_for_invoice",
  "cancel_sent_invoice",
];

export function buildTrail(plan: Plan, webhooks: WebhookEventRecord[], steps: AgentStep[]): PayPalTrailResponse {
  const m = modes();
  const phases: TrailPhase[] = [...plan.phases]
    .sort((a, b) => a.n - b.n)
    .map((ph) => {
      const pay = ph.payment;
      const hooks: TrailWebhook[] = webhooks
        .filter((w) => w.phaseId === ph.id)
        .map((w) => ({
          eventType: w.eventType,
          verified: w.verified,
          applied: w.applied,
          receivedAt: w.receivedAt,
          resourceId: w.resourceId ?? null,
        }));
      const agentSteps: TrailAgentStep[] = steps
        .filter((s) => s.phaseId === ph.id && s.kind === "tool_result" && s.tool && (TRAIL_TOOLS as readonly string[]).includes(s.tool))
        .map((s) => ({ tool: s.tool as InvoiceToolName, ok: s.ok === true, at: s.at }));
      return {
        phaseId: ph.id,
        n: ph.n,
        /** The visit day: the phase's invoice is issued on (or after) it. */
        dueDate: pay.dueDate,
        payment: {
          instrument: pay.instrument ?? null,
          orderId: pay.orderId ?? null,
          orderAttempt: pay.orderAttempt,
          captureId: pay.captureId ?? null,
          paidAt: pay.paidAt ?? null,
          status: pay.status,
        },
        invoice: pay.invoice
          ? {
              invoiceNumber: pay.invoice.invoiceNumber,
              status: pay.invoice.status,
              payerViewUrl: pay.invoice.payerViewUrl ?? null,
            }
          : null,
        webhooks: hooks,
        agentSteps,
      };
    });
  return { planId: plan.id, modes: { paypal: m.paypal, paypalWebhooks: m.paypalWebhooks }, phases };
}
