import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhookRoute } from "../../app/api/paypal/webhook/route";
import type { Plan } from "@/contracts";
import { handleWebhookEvent, verifyWebhookSignature } from "@/lib/paypal";
import {
  completedOrder,
  eventsOfType,
  fakeStore,
  mockPayPal,
  published,
  resetStore,
  restoreEnv,
  storedPlan,
  storedWebhookEvents,
  useLiveEnv,
  useMockEnv,
  withPayment,
  type Route,
} from "./fakes";

vi.mock("@/server/store", async () => ({ store: (await import("./fakes")).fakeStore }));
vi.mock("@/server/events", async () => (await import("./fakes")).fakeEventsModule());

const ORDER = "5O190127TN364715T";
const SIG_HEADERS = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-a5cafa77",
  "paypal-transmission-id": "69cd13f0-d67a-11e5-baa3-778b53f4ae55",
  "paypal-transmission-sig": "lmI95Jx3Y9nhR5SJWlHVIWpg4AgFk7n9bCHSRxbrd8A9zrhdu2rMyFrmz+Zjh3s3boXB07VXCXUZy/UFzUlnGJn0wDugt7FlSvdKeIJenLRemUxYCPVoEZzg9VFNqOa48gMkvF+XTpxBeUx/kWy6B5cp7GkT2+pOowfRK7OaynuxUoKW3JcMWw272VKjLTtTAShncla7tGF+55rxyt2KNZIIqxNMJ48RDZheGU5w1npu9dZHnPgTXB9iomeVRoD8O/jhRpnKsGrDschyNdkeh81BJJMH4Ctc6lnCCquoP/GzCzz33MMsNdid7vL/NIWaCsekQpW26FpWPi/tfj8nLA==",
  "paypal-transmission-time": "2026-11-16T10:00:05Z",
};

function captureCompletedEvent(id = "WH-EVT-1", captureId = "CAP-1", customId = "pln_ribera01:ph1", type = "PAYMENT.CAPTURE.COMPLETED") {
  return {
    id,
    event_type: type,
    create_time: "2026-11-16T10:00:04Z",
    resource_type: "capture",
    resource: {
      id: captureId,
      status: type === "PAYMENT.CAPTURE.PENDING" ? "PENDING" : "COMPLETED",
      amount: { currency_code: "EUR", value: "360.00" },
      custom_id: customId,
      invoice_id: "PPP-RIBE-F1-O1",
      create_time: "2026-11-16T10:00:00Z",
      supplementary_data: { related_ids: { order_id: ORDER } },
    },
  };
}

function invoicePaidEvent(id = "WH-EVT-INV", invoiceId = "INV2-RIBE-0001") {
  return {
    id,
    event_type: "INVOICING.INVOICE.PAID",
    create_time: "2026-11-16T11:00:00Z",
    resource_type: "invoices",
    resource: {
      invoice: {
        id: invoiceId,
        status: "PAID",
        detail: { invoice_number: "PPP-RIBE-F1-v1" },
        amount: { currency_code: "EUR", value: "360.00" },
        payments: { paid_amount: { currency_code: "EUR", value: "360.00" }, transactions: [{ payment_id: "PAY-777" }] },
      },
    },
  };
}

const withInvoice = (invoiceId: string) => (p: Plan) =>
  withPayment("ph1", {
    invoice: {
      invoiceId,
      invoiceNumber: "PPP-RIBE-F1-v1",
      version: 1,
      status: "SENT",
      amountCents: 36_000,
      recipientEmail: "paciente.demo@example.com",
      hasQr: true,
      updatedAt: "2026-11-16T08:00:00Z",
    },
  })(p);

const verifyRoute = (status: "SUCCESS" | "FAILURE"): Route => ({
  method: "POST",
  path: "/v1/notifications/verify-webhook-signature",
  reply: () => ({ status: 200, body: { verification_status: status } }),
});

function postWebhook(body: unknown, headers: Record<string, string> = SIG_HEADERS) {
  return webhookRoute(
    new Request("http://localhost/api/paypal/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("PayPal webhooks", () => {
  beforeEach(() => {
    useLiveEnv();
    resetStore();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreEnv();
  });

  describe("signature verification", () => {
    it("verifies via /v1/notifications/verify-webhook-signature with PAYPAL_WEBHOOK_ID and the raw event", async () => {
      const { apiCalls } = mockPayPal([verifyRoute("SUCCESS")]);
      const raw = JSON.stringify(captureCompletedEvent());
      const res = await postWebhook(raw);
      expect(res.status).toBe(200);
      const verify = apiCalls().find((c) => c.path === "/v1/notifications/verify-webhook-signature")!;
      expect(verify.method).toBe("POST");
      expect(verify.body).toEqual({
        auth_algo: SIG_HEADERS["paypal-auth-algo"],
        cert_url: SIG_HEADERS["paypal-cert-url"],
        transmission_id: SIG_HEADERS["paypal-transmission-id"],
        transmission_sig: SIG_HEADERS["paypal-transmission-sig"],
        transmission_time: SIG_HEADERS["paypal-transmission-time"],
        webhook_id: "WH-TEST-123",
        webhook_event: JSON.parse(raw),
      });
      // The raw body is spliced verbatim (not re-serialised).
      expect(verify.rawBody).toContain(`"webhook_event":${raw}`);
    });

    it("an invalid signature → 401 and nothing is recorded or applied", async () => {
      mockPayPal([verifyRoute("FAILURE")]);
      const res = await postWebhook(captureCompletedEvent());
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: "INVALID_SIGNATURE" } });
      expect(fakeStore.recordWebhookEvent).not.toHaveBeenCalled();
      expect(storedPlan().phases[0]!.payment.status).toBe("due");
    });

    it("missing transmission headers → 401 without asking PayPal", async () => {
      const { apiCalls } = mockPayPal([verifyRoute("SUCCESS")]);
      const res = await postWebhook(captureCompletedEvent(), {});
      expect(res.status).toBe(401);
      expect(apiCalls()).toHaveLength(0);
    });

    it("cannot verify without a webhook id (mock webhooks) → false", async () => {
      useMockEnv();
      const { calls } = mockPayPal([verifyRoute("SUCCESS")]);
      await expect(
        verifyWebhookSignature({ headers: new Headers(SIG_HEADERS), rawBody: JSON.stringify(captureCompletedEvent()) }),
      ).resolves.toBe(false);
      expect(calls).toHaveLength(0);
    });
  });

  describe("routing, dedupe and transition", () => {
    it("PAYMENT.CAPTURE.COMPLETED routes by custom_id and marks the milestone paid via webhook", async () => {
      mockPayPal([verifyRoute("SUCCESS")]);
      const res = await postWebhook(captureCompletedEvent());
      expect(await res.json()).toMatchObject({ status: "applied", planId: "pln_ribera01", phaseId: "ph1" });
      expect(storedPlan().phases[0]!.payment).toMatchObject({
        status: "paid",
        instrument: "order",
        orderId: ORDER,
        captureId: "CAP-1",
        paidCents: 36_000,
      });
      expect(eventsOfType("PAYMENT_CAPTURED")).toEqual([expect.objectContaining({ via: "webhook", phaseId: "ph1" })]);
      expect(storedWebhookEvents()).toEqual([
        expect.objectContaining({
          eventId: "WH-EVT-1",
          eventType: "PAYMENT.CAPTURE.COMPLETED",
          verified: true,
          resourceId: "CAP-1",
          planId: "pln_ribera01",
          phaseId: "ph1",
          applied: true,
        }),
      ]);
    });

    it("the same event id delivered twice is applied once (store.recordWebhookEvent dedupe)", async () => {
      mockPayPal([verifyRoute("SUCCESS")]);
      const first = await postWebhook(captureCompletedEvent());
      const second = await postWebhook(captureCompletedEvent());
      expect(await first.json()).toMatchObject({ status: "applied" });
      expect(await second.json()).toMatchObject({ status: "duplicate" });
      expect(second.status).toBe(200);
      expect(fakeStore.recordWebhookEvent).toHaveBeenCalledTimes(2);
      expect(fakeStore.updatePlan).toHaveBeenCalledTimes(1);
      expect(eventsOfType("PAYMENT_CAPTURED")).toHaveLength(1);
    });

    it("a webhook for a capture the button already applied is acknowledged without changes", async () => {
      resetStore(withPayment("ph1", { status: "paid", instrument: "order", orderId: ORDER, captureId: "CAP-1", paidCents: 36_000 }));
      const { apiCalls } = mockPayPal([]);
      const r = await handleWebhookEvent(captureCompletedEvent(), { verified: true });
      expect(r.status).toBe("already_applied");
      expect(apiCalls()).toHaveLength(0);
      expect(published).toHaveLength(0);
    });

    it("INVOICING.INVOICE.PAID routes by the phase's stored invoice.invoiceId", async () => {
      resetStore(withInvoice("INV2-RIBE-0001"));
      mockPayPal([]);
      const r = await handleWebhookEvent(invoicePaidEvent(), { verified: true });
      expect(r).toMatchObject({ status: "applied", planId: "pln_ribera01", phaseId: "ph1" });
      const ph1 = storedPlan().phases[0]!;
      expect(ph1.payment).toMatchObject({ status: "paid", instrument: "invoice", paidCents: 36_000, captureId: "PAY-777" });
      expect(ph1.payment.invoice?.status).toBe("PAID");
      expect(ph1.delivery.status).toBe("delivered");
      // Not a checkout capture: the agent must not record it on the invoice again.
      expect(eventsOfType("PAYMENT_CAPTURED")).toHaveLength(0);
      expect(eventsOfType("INVOICE_UPDATED")).toEqual([
        expect.objectContaining({ invoiceId: "INV2-RIBE-0001", invoiceNumber: "PPP-RIBE-F1-v1", status: "PAID" }),
      ]);
      expect(eventsOfType("PHASE_STATUS_CHANGED")).toEqual([expect.objectContaining({ from: "due", to: "paid" })]);
    });

    it("an early invoice payment (phase not due yet) is paid but NOT marked delivered", async () => {
      resetStore((p) =>
        withPayment("ph2", {
          invoice: {
            invoiceId: "INV2-RIBE-0002",
            invoiceNumber: "PPP-RIBE-F2-v1",
            version: 1,
            status: "SENT",
            amountCents: 150_000,
            recipientEmail: "paciente.demo@example.com",
            hasQr: true,
            updatedAt: "2026-11-16T08:00:00Z",
          },
        })(p),
      );
      mockPayPal([]);
      const ev = invoicePaidEvent("WH-EVT-INV2", "INV2-RIBE-0002");
      (ev.resource.invoice.payments.paid_amount as { value: string }).value = "1500.00";
      await handleWebhookEvent(ev, { verified: true });
      const ph2 = storedPlan().phases[1]!;
      expect(ph2.payment.status).toBe("paid");
      expect(ph2.delivery.status).toBe("pending");
      expect(eventsOfType("PHASE_DELIVERED")).toHaveLength(0);
    });

    it("an unknown event type triggers a GET reconcile of the order it points at", async () => {
      const { apiCalls } = mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${ORDER}`, reply: () => ({ status: 200, body: completedOrder(ORDER) }) },
      ]);
      const r = await handleWebhookEvent(
        { id: "WH-EVT-UNK", event_type: "CHECKOUT.ORDER.COMPLETED", resource: { id: ORDER, status: "COMPLETED" } },
        { verified: true },
      );
      expect(r).toMatchObject({ status: "reconciled", planId: "pln_ribera01", phaseId: "ph1" });
      expect(apiCalls().map((c) => `${c.method} ${c.path}`)).toEqual([`GET /v2/checkout/orders/${ORDER}`]);
      expect(storedPlan().phases[0]!.payment).toMatchObject({ status: "paid", captureId: "CAP-1" });
      expect(eventsOfType("PAYMENT_CAPTURED")).toEqual([expect.objectContaining({ via: "webhook" })]);
      expect(storedWebhookEvents()[0]).toMatchObject({ eventId: "WH-EVT-UNK", applied: false });
    });

    it("a failing reconcile GET still acknowledges the event (it is recorded, a retry would be dropped)", async () => {
      mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${ORDER}`, reply: () => ({ status: 500, body: { name: "INTERNAL_SERVICE_ERROR" } }) },
      ]);
      const r = await handleWebhookEvent(
        { id: "WH-EVT-FAIL", event_type: "CHECKOUT.ORDER.COMPLETED", resource: { id: ORDER, status: "COMPLETED" } },
        { verified: true },
      );
      expect(r.status).toBe("ignored");
      expect(storedWebhookEvents()).toHaveLength(1);
    });

    it("an out-of-order event (PENDING after paid) is ignored by transition() and triggers a GET reconcile", async () => {
      resetStore(withPayment("ph1", { status: "paid", instrument: "order", orderId: ORDER, captureId: "CAP-1", paidCents: 36_000 }));
      const { apiCalls } = mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${ORDER}`, reply: () => ({ status: 200, body: completedOrder(ORDER) }) },
      ]);
      const r = await handleWebhookEvent(
        captureCompletedEvent("WH-EVT-PEND", "CAP-1", "pln_ribera01:ph1", "PAYMENT.CAPTURE.PENDING"),
        { verified: true },
      );
      expect(r.status).toBe("reconciled");
      expect(apiCalls().map((c) => c.method)).toEqual(["GET"]);
      expect(storedPlan().phases[0]!.payment.status).toBe("paid");
      expect(published).toHaveLength(0);
    });

    it("an unroutable invoice event GETs the invoice and leaves foreign invoices alone", async () => {
      const { apiCalls } = mockPayPal([
        {
          method: "GET",
          path: "/v2/invoicing/invoices/INV2-FOREIGN",
          reply: () => ({ status: 200, body: { id: "INV2-FOREIGN", status: "PAID", amount: { currency_code: "EUR", value: "10.00" } } }),
        },
      ]);
      const r = await handleWebhookEvent(invoicePaidEvent("WH-EVT-F", "INV2-FOREIGN"), { verified: true });
      expect(r.status).toBe("reconciled");
      expect(apiCalls().map((c) => `${c.method} ${c.path}`)).toEqual(["GET /v2/invoicing/invoices/INV2-FOREIGN"]);
      expect(published).toHaveLength(0);
    });
  });
});
