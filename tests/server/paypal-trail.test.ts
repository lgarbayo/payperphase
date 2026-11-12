/**
 * GET /api/plans/:id/paypal-trail against the real (temp-dir) store: 4 phases, mock order and
 * capture ids after a mock pay, webhook dedupe shows once, and no email / payload ever leaks.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HERO_PLAN_ALIAS, type AgentStep, type WebhookEventRecord } from "@/contracts";
import { resetEnvCache } from "@/env";
import { capturePhaseOrder, createPhaseOrder } from "@/lib/paypal";
import { store } from "@/server/store";
import { GET } from "../../app/api/plans/[id]/paypal-trail/route";
import type { PayPalTrailResponse } from "@/components/clinic/PayPalTrail";
import { ctx, get, useTmpDataDir } from "./helpers";

useTmpDataDir();

const trail = async (id: string = HERO_PLAN_ALIAS): Promise<{ status: number; text: string; body: PayPalTrailResponse }> => {
  const res = await GET(get(`http://localhost/api/plans/${id}/paypal-trail`), ctx({ id }));
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as PayPalTrailResponse };
};

beforeEach(() => {
  process.env.FORCE_MOCKS = "1";
  resetEnvCache();
});
afterEach(() => {
  delete process.env.FORCE_MOCKS;
  resetEnvCache();
});

async function heroId(): Promise<string> {
  const id = await store.resolvePlanId(HERO_PLAN_ALIAS);
  if (!id) throw new Error("no hero");
  return id;
}

describe("GET /api/plans/:id/paypal-trail", () => {
  it("returns the 4 phases of the demo plan (alias resolved) and 404 for an unknown plan", async () => {
    const { status, body } = await trail();
    expect(status).toBe(200);
    expect(body.planId).toBe(await heroId());
    expect(body.phases).toHaveLength(4);
    expect(body.phases.map((p) => p.n)).toEqual([1, 2, 3, 4]);
    expect(body.modes).toEqual({ paypal: "mock", paypalWebhooks: "mock" });
    expect((await trail("pln_nonexist")).status).toBe(404);
  });

  it("after the mock pay of phase 1 shows MOCK-… order, MOCK-CAP-… capture and paidAt", async () => {
    // Start from a plan whose phase 1 is still open: B2 seeds phase 1 as already paid, so pay phase 2 is not due.
    const id = await heroId();
    await store.updatePlan(id, (plan) => ({
      ...plan,
      phases: plan.phases.map((p) =>
        p.n === 1
          ? {
              ...p,
              delivery: { status: "pending" as const },
              payment: { ...p.payment, status: "due" as const, orderId: undefined, captureId: undefined, paidAt: undefined, paidCents: undefined, orderAttempt: 0 },
            }
          : p,
      ),
    }));
    const { orderId } = await createPhaseOrder({ planId: id, phaseId: "ph1" });
    const cap = await capturePhaseOrder({ planId: id, phaseId: "ph1", orderId });
    expect(cap.outcome).toBe("COMPLETED");

    const { body } = await trail();
    const ph1 = body.phases[0]!;
    expect(ph1.payment.orderId).toMatch(/^MOCK-/);
    expect(ph1.payment.orderId).toBe(orderId);
    expect(ph1.payment.captureId).toMatch(/^MOCK-CAP-/);
    expect(ph1.payment).toMatchObject({ status: "paid", instrument: "order", orderAttempt: 1 });
    expect(ph1.payment.paidAt).toEqual(expect.any(String));
    expect(body.phases[2]!.payment.orderId).toBeNull();
  });

  it("shows the invoice number and status, and the agent's invoice tool results (ids/statuses only)", async () => {
    const id = await heroId();
    await store.updatePlan(id, (plan) => ({
      ...plan,
      phases: plan.phases.map((p) =>
        p.n === 1
          ? {
              ...p,
              payment: {
                ...p.payment,
                invoice: {
                  invoiceId: "INV2-TEST-1",
                  invoiceNumber: "PPP-ABCD-F1-v2",
                  version: 2,
                  status: "MARKED_AS_PAID" as const,
                  amountCents: p.amountCents,
                  recipientEmail: "buyer@example.test",
                  payerViewUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2TEST1",
                  hasQr: false,
                  updatedAt: "2026-11-16T09:00:00.000Z",
                },
              },
            }
          : p,
      ),
    }));
    const step = (seq: number, tool: AgentStep["tool"], kind: AgentStep["kind"], ok?: boolean): AgentStep => ({
      id: `s${seq}`,
      runId: "run1",
      planId: id,
      phaseId: "ph1",
      seq,
      at: `2026-11-16T09:00:0${seq}.000Z`,
      trigger: "PAYMENT_CAPTURED",
      kind,
      tool,
      ok,
      input: { recipient: "buyer@example.test" },
      output: { detail: "payer@example.test" },
      mode: "playbook",
      mock: true,
    });
    await store.appendAgentStep(step(1, "record_payment_for_invoice", "tool_call"));
    await store.appendAgentStep(step(2, "record_payment_for_invoice", "tool_result", true));
    await store.appendAgentStep(step(3, "get_invoice", "tool_result", true));

    const { body } = await trail();
    const ph1 = body.phases[0]!;
    expect(ph1.invoice).toEqual({
      invoiceNumber: "PPP-ABCD-F1-v2",
      status: "MARKED_AS_PAID",
      payerViewUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2TEST1",
    });
    expect(ph1.agentSteps).toEqual([{ tool: "record_payment_for_invoice", ok: true, at: "2026-11-16T09:00:02.000Z" }]);
  });

  it("lists webhook events per phase once (duplicate event id deduplicated) and never leaks an email", async () => {
    const id = await heroId();
    const first: WebhookEventRecord = {
      eventId: "WH-1",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      receivedAt: "2026-11-16T09:00:05.000Z",
      verified: true,
      resourceId: "CAP-REAL-1",
      planId: id,
      phaseId: "ph1",
      applied: true,
    };
    const second: WebhookEventRecord = { ...first, eventId: "WH-2", receivedAt: "2026-11-16T09:00:09.000Z", applied: false };
    expect(await store.recordWebhookEvent(second)).toBe(true);
    expect(await store.recordWebhookEvent(first)).toBe(true);
    // PayPal redelivers WH-1: the store's UNIQUE event id drops it, so it stays a single row.
    expect(await store.recordWebhookEvent({ ...first, receivedAt: "2026-11-16T09:30:00.000Z" })).toBe(false);
    // Another plan's event must not show up here.
    await store.recordWebhookEvent({ ...first, eventId: "WH-OTHER", planId: "pln_other001" });

    expect((await store.listWebhookEvents(id)).map((e) => e.eventId)).toEqual(["WH-1", "WH-2"]);

    const { body, text } = await trail();
    const hooks = body.phases[0]!.webhooks;
    expect(hooks).toEqual([
      { eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, applied: true, receivedAt: first.receivedAt, resourceId: "CAP-REAL-1" },
      { eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, applied: false, receivedAt: second.receivedAt, resourceId: "CAP-REAL-1" },
    ]);
    expect(body.phases.slice(1).every((p) => p.webhooks.length === 0)).toBe(true);
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/email|token|payer/i);
  });

  it("never contains '@' even when the plan holds patient and invoice emails", async () => {
    const id = await heroId();
    const plan = await store.getPlan(id);
    expect(JSON.stringify(plan)).toContain("@"); // the source data does hold emails
    const { text } = await trail();
    expect(text).not.toContain("@");
  });
});
