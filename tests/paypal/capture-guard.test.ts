/**
 * paypal-payments-4: every confirmation path (capture route, webhook, return reconcile) settles a
 * phase only for the server-set amount in EUR, and only once its visit day has come (ADR-4).
 * A PayPal order made outside the server (e.g. with the public client id) that merely carries the
 * phase's custom_id is refused before any money moves, or ignored when PayPal reports it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as captureRoute } from "../../app/api/paypal/orders/[orderId]/capture/route";
import { POST as webhookRoute } from "../../app/api/paypal/webhook/route";
import { handleWebhookEvent, reconcileReturn } from "@/lib/paypal";
import {
  approvedOrder,
  completedOrder,
  mockPayPal,
  published,
  resetStore,
  restoreEnv,
  storedPlan,
  storedWebhookEvents,
  useLiveEnv,
  withPayment,
  type Route,
} from "./fakes";

vi.mock("@/server/store", async () => ({ store: (await import("./fakes")).fakeStore }));
vi.mock("@/server/events", async () => (await import("./fakes")).fakeEventsModule());

const PLAN = "pln_ribera01";
const EVIL = "9XEVIL0000000000A";
const ORDER = "5O190127TN364715T";

const SIG_HEADERS = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-transmission-id": "69cd13f0-d67a-11e5-baa3-778b53f4ae55",
  "paypal-transmission-sig": "c2lnbmF0dXJl",
  "paypal-transmission-time": "2026-11-16T10:00:05Z",
};
const verifyOk: Route = {
  method: "POST",
  path: "/v1/notifications/verify-webhook-signature",
  reply: () => ({ status: 200, body: { verification_status: "SUCCESS" } }),
};

/** An order someone created in the browser: right custom_id, their own amount/currency. */
function foreignOrder(id: string, customId: string, value: string, currency = "EUR", status = "APPROVED") {
  return {
    id,
    status,
    purchase_units: [{ reference_id: "x", custom_id: customId, amount: { currency_code: currency, value } }],
  };
}

function captureEvent(opts: { id: string; customId: string; value: string; currency?: string; type?: string; orderId?: string }) {
  const type = opts.type ?? "PAYMENT.CAPTURE.COMPLETED";
  return {
    id: opts.id,
    event_type: type,
    create_time: "2026-11-16T10:00:04Z",
    resource_type: "capture",
    resource: {
      id: `CAP-${opts.id}`,
      status: type === "PAYMENT.CAPTURE.PENDING" ? "PENDING" : "COMPLETED",
      amount: { currency_code: opts.currency ?? "EUR", value: opts.value },
      custom_id: opts.customId,
      create_time: "2026-11-16T10:00:00Z",
      supplementary_data: { related_ids: { order_id: opts.orderId ?? EVIL } },
    },
  };
}

function postCapture(orderId: string, phaseId: string) {
  return captureRoute(
    new Request(`http://localhost/api/paypal/orders/${orderId}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: PLAN, phaseId, orderId }),
    }),
    { params: Promise.resolve({ orderId }) },
  );
}

function postWebhook(body: unknown) {
  return webhookRoute(
    new Request("http://localhost/api/paypal/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...SIG_HEADERS },
      body: JSON.stringify(body),
    }),
  );
}

const phase = (id: string) => storedPlan().phases.find((p) => p.id === id)!;

describe("paypal-payments-4: confirmation paths check payability, amount and currency", () => {
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

  describe("capture route", () => {
    it("refuses a foreign order for a scheduled phase (409) without capturing it", async () => {
      const { apiCalls } = mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${EVIL}`, reply: () => ({ status: 200, body: foreignOrder(EVIL, `${PLAN}:ph2`, "0.01") }) },
        {
          method: "POST",
          path: `/v2/checkout/orders/${EVIL}/capture`,
          reply: () => ({ status: 201, body: completedOrder(EVIL, { customId: `${PLAN}:ph2`, value: "0.01" }) }),
        },
      ]);
      const res = await postCapture(EVIL, "ph2");
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: "NOT_DUE_YET" } });
      expect(apiCalls().some((c) => c.path.endsWith("/capture"))).toBe(false);
      expect(phase("ph2").payment.status).toBe("scheduled");
      expect(phase("ph2").payment.paidCents).toBeUndefined();
    });

    it("refuses a foreign €0.01 order for the due phase (409 AMOUNT_MISMATCH) before any money moves", async () => {
      const { apiCalls } = mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${EVIL}`, reply: () => ({ status: 200, body: foreignOrder(EVIL, `${PLAN}:ph1`, "0.01") }) },
        {
          method: "POST",
          path: `/v2/checkout/orders/${EVIL}/capture`,
          reply: () => ({ status: 201, body: completedOrder(EVIL, { value: "0.01" }) }),
        },
      ]);
      const res = await postCapture(EVIL, "ph1");
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: "AMOUNT_MISMATCH" } });
      expect(apiCalls().some((c) => c.path.endsWith("/capture"))).toBe(false);
      expect(phase("ph1").payment.status).toBe("due");
      expect(phase("ph1").delivery.status).toBe("pending");
      expect(published).toHaveLength(0);
    });

    it("refuses an order in another currency for the right value", async () => {
      const { apiCalls } = mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${EVIL}`, reply: () => ({ status: 200, body: foreignOrder(EVIL, `${PLAN}:ph1`, "360.00", "USD") }) },
      ]);
      const res = await postCapture(EVIL, "ph1");
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: "AMOUNT_MISMATCH" } });
      expect(apiCalls().some((c) => c.path.endsWith("/capture"))).toBe(false);
      expect(phase("ph1").payment.status).toBe("due");
    });

    it("refuses our own stored order once the clinic changed the phase price (stale amount)", async () => {
      resetStore((p) => withPayment("ph1", { orderId: ORDER, orderAttempt: 1 })({
        ...p,
        phases: p.phases.map((ph) => (ph.id === "ph1" ? { ...ph, amountCents: 40_000 } : ph)),
      }));
      const { apiCalls } = mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${ORDER}`, reply: () => ({ status: 200, body: approvedOrder(ORDER) }) },
        { method: "POST", path: `/v2/checkout/orders/${ORDER}/capture`, reply: () => ({ status: 201, body: completedOrder(ORDER) }) },
      ]);
      const res = await postCapture(ORDER, "ph1");
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: "AMOUNT_MISMATCH" } });
      expect(apiCalls().some((c) => c.path.endsWith("/capture"))).toBe(false);
      expect(phase("ph1").payment.status).toBe("due");
    });
  });

  describe("webhook", () => {
    it("a verified €0.01 capture for the due phase is recorded but never marks it paid or delivered", async () => {
      mockPayPal([verifyOk]);
      const res = await postWebhook(captureEvent({ id: "WH-EVIL-1", customId: `${PLAN}:ph1`, value: "0.01" }));
      expect(res.status).toBe(200);
      expect(phase("ph1").payment.status).toBe("due");
      expect(phase("ph1").payment.paidCents).toBeUndefined();
      expect(phase("ph1").delivery.status).toBe("pending");
      expect(published).toHaveLength(0);
      expect(storedWebhookEvents()).toEqual([expect.objectContaining({ eventId: "WH-EVIL-1", applied: false })]);
    });

    it("a full-amount capture on a phase whose visit has not come is not applied (order rail)", async () => {
      mockPayPal([]);
      await handleWebhookEvent(captureEvent({ id: "WH-EARLY", customId: `${PLAN}:ph2`, value: "1500.00" }), { verified: true });
      expect(phase("ph2").payment.status).toBe("scheduled");
      expect(phase("ph2").delivery.status).toBe("pending");
      expect(published).toHaveLength(0);
    });

    it("a capture in another currency is not applied", async () => {
      mockPayPal([
        {
          method: "GET",
          path: `/v2/checkout/orders/${EVIL}`,
          reply: () => {
            const o = completedOrder(EVIL);
            o.purchase_units[0]!.payments.captures[0]!.amount.currency_code = "USD";
            return { status: 200, body: o };
          },
        },
      ]);
      await handleWebhookEvent(captureEvent({ id: "WH-USD", customId: `${PLAN}:ph1`, value: "360.00", currency: "USD" }), {
        verified: true,
      });
      expect(phase("ph1").payment.status).toBe("due");
    });

    it("a foreign pending capture does not lock the phase in processing", async () => {
      mockPayPal([]);
      await handleWebhookEvent(
        captureEvent({ id: "WH-PEND", customId: `${PLAN}:ph1`, value: "0.01", type: "PAYMENT.CAPTURE.PENDING" }),
        { verified: true },
      );
      expect(phase("ph1").payment.status).toBe("due");
    });

    it("the genuine capture (server amount, due phase) is still applied", async () => {
      mockPayPal([]);
      const r = await handleWebhookEvent(captureEvent({ id: "WH-OK", customId: `${PLAN}:ph1`, value: "360.00", orderId: ORDER }), {
        verified: true,
      });
      expect(r.status).toBe("applied");
      expect(phase("ph1").payment).toMatchObject({ status: "paid", paidCents: 36_000 });
    });
  });

  describe("return reconcile", () => {
    it("an already-captured €0.01 order in ?token= does not mark the phase paid", async () => {
      mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${EVIL}`, reply: () => ({ status: 200, body: completedOrder(EVIL, { value: "0.01" }) }) },
      ]);
      const r = await reconcileReturn({ planId: PLAN, orderId: EVIL });
      expect(r.outcome).toBe("UNKNOWN_ORDER");
      expect(phase("ph1").payment.status).toBe("due");
      expect(phase("ph1").delivery.status).toBe("pending");
    });

    it("an approved foreign order for a scheduled phase is never captured", async () => {
      const { apiCalls } = mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${EVIL}`, reply: () => ({ status: 200, body: foreignOrder(EVIL, `${PLAN}:ph2`, "0.01") }) },
        {
          method: "POST",
          path: `/v2/checkout/orders/${EVIL}/capture`,
          reply: () => ({ status: 201, body: completedOrder(EVIL, { customId: `${PLAN}:ph2`, value: "0.01" }) }),
        },
      ]);
      await reconcileReturn({ planId: PLAN, orderId: EVIL });
      expect(apiCalls().some((c) => c.path.endsWith("/capture"))).toBe(false);
      expect(phase("ph2").payment.status).toBe("scheduled");
    });
  });
});
