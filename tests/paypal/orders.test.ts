import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createRoute } from "../../app/api/paypal/orders/route";
import { createPhaseOrder, PaymentNotAllowedError } from "@/lib/paypal";
import {
  fakeStore,
  mockPayPal,
  paypalError,
  resetStore,
  restoreEnv,
  storedPlan,
  TOKEN,
  useLiveEnv,
  withPayment,
  type PayPalCall,
} from "./fakes";

vi.mock("@/server/store", async () => ({ store: (await import("./fakes")).fakeStore }));
vi.mock("@/server/events", async () => (await import("./fakes")).fakeEventsModule());

const PLAN = "pln_ribera01";

function okOrder(call: PayPalCall) {
  const n = (call.body as { purchase_units: Array<{ invoice_id: string }> }).purchase_units[0]!.invoice_id;
  return { status: 201, body: { id: `ORDER-${n}`, status: "CREATED" } };
}

function post(body: unknown) {
  return createRoute(
    new Request("http://localhost/api/paypal/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("createPhaseOrder (Orders v2, live sandbox)", () => {
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

  it("refuses a phase that is not due yet (NOT_DUE_YET → HTTP 409) without calling PayPal", async () => {
    const { calls } = mockPayPal([{ method: "POST", path: "/v2/checkout/orders", reply: okOrder }]);

    await expect(createPhaseOrder({ planId: PLAN, phaseId: "ph2" })).rejects.toMatchObject({
      reason: "NOT_DUE_YET",
    });
    await expect(createPhaseOrder({ planId: PLAN, phaseId: "ph2" })).rejects.toBeInstanceOf(PaymentNotAllowedError);

    const res = await post({ planId: PLAN, phaseId: "ph2" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_DUE_YET" } });
    expect(calls).toHaveLength(0);
  });

  it("refuses already-paid and processing phases too", async () => {
    mockPayPal([{ method: "POST", path: "/v2/checkout/orders", reply: okOrder }]);
    resetStore(withPayment("ph1", { status: "paid", captureId: "CAP-0", paidCents: 36_000 }));
    expect((await post({ planId: PLAN, phaseId: "ph1" })).status).toBe(409);
    resetStore(withPayment("ph1", { status: "processing", captureId: "CAP-0" }));
    expect((await post({ planId: PLAN, phaseId: "ph1" })).status).toBe(409);
  });

  it("ignores any amount in the request body: the amount comes from the stored plan", async () => {
    const { apiCalls } = mockPayPal([{ method: "POST", path: "/v2/checkout/orders", reply: okOrder }]);
    const res = await post({ planId: PLAN, phaseId: "ph1", amountCents: 1, amount: { value: "0.01" } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ amountCents: 36_000, mode: "live" });
    const body = apiCalls()[0]!.body as { purchase_units: Array<{ amount: unknown }> };
    expect(body.purchase_units[0]!.amount).toEqual({ currency_code: "EUR", value: "360.00" });
  });

  it("sends the exact Orders v2 body, ids and idempotency key", async () => {
    const { apiCalls } = mockPayPal([{ method: "POST", path: "/v2/checkout/orders", reply: okOrder }]);
    const out = await createPhaseOrder({ planId: PLAN, phaseId: "ph1" });
    expect(out).toEqual({ orderId: "ORDER-PPP-RIBE-F1-O1", amountCents: 36_000, mode: "live" });

    const [call] = apiCalls();
    expect(call!.method).toBe("POST");
    expect(call!.path).toBe("/v2/checkout/orders");
    expect(call!.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(call!.headers["paypal-request-id"]).toBe("pln_ribera01-ph1-create-1");

    const body = call!.body as Record<string, any>;
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units).toHaveLength(1);
    const pu = body.purchase_units[0];
    expect(pu.amount).toEqual({ currency_code: "EUR", value: "360.00" });
    expect(pu.custom_id).toBe("pln_ribera01:ph1");
    expect(pu.invoice_id).toBe("PPP-RIBE-F1-O1");
    expect(pu.invoice_id).toMatch(/^PPP-[A-Z0-9]{4}-F\d+-O\d+$/);
    expect(pu.description.length).toBeLessThanOrEqual(127);
    expect(body.application_context).toMatchObject({
      return_url: "https://ppp.example.com/p/pln_ribera01/return",
      cancel_url: "https://ppp.example.com/p/pln_ribera01",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      locale: "es-ES",
    });
  });

  it("stores the order on the milestone and bumps the attempt on the next create", async () => {
    const { apiCalls } = mockPayPal([{ method: "POST", path: "/v2/checkout/orders", reply: okOrder }]);
    await createPhaseOrder({ planId: PLAN, phaseId: "ph1" });
    expect(storedPlan().phases[0]!.payment).toMatchObject({ orderId: "ORDER-PPP-RIBE-F1-O1", orderAttempt: 1, status: "due" });

    await createPhaseOrder({ planId: PLAN, phaseId: "ph1" });
    expect(storedPlan().phases[0]!.payment).toMatchObject({ orderId: "ORDER-PPP-RIBE-F1-O2", orderAttempt: 2 });
    expect(apiCalls()[1]!.headers["paypal-request-id"]).toBe("pln_ribera01-ph1-create-2");
    expect(fakeStore.updatePlan).toHaveBeenCalledTimes(2);
  });

  it("DUPLICATE_INVOICE_ID bumps the attempt and retries once", async () => {
    let n = 0;
    const { apiCalls } = mockPayPal([
      {
        method: "POST",
        path: "/v2/checkout/orders",
        reply: (call) => (++n === 1 ? paypalError(422, "DUPLICATE_INVOICE_ID") : okOrder(call)),
      },
    ]);
    const out = await createPhaseOrder({ planId: PLAN, phaseId: "ph1" });
    expect(out.orderId).toBe("ORDER-PPP-RIBE-F1-O2");
    const orderCalls = apiCalls();
    expect(orderCalls).toHaveLength(2);
    expect((orderCalls[0]!.body as any).purchase_units[0].invoice_id).toBe("PPP-RIBE-F1-O1");
    expect(orderCalls[0]!.headers["paypal-request-id"]).toBe("pln_ribera01-ph1-create-1");
    expect((orderCalls[1]!.body as any).purchase_units[0].invoice_id).toBe("PPP-RIBE-F1-O2");
    expect(orderCalls[1]!.headers["paypal-request-id"]).toBe("pln_ribera01-ph1-create-2");
    expect(storedPlan().phases[0]!.payment.orderAttempt).toBe(2);
  });

  it("retries DUPLICATE_INVOICE_ID only once, then reports a 502 to the browser", async () => {
    const { apiCalls } = mockPayPal([
      { method: "POST", path: "/v2/checkout/orders", reply: () => paypalError(422, "DUPLICATE_INVOICE_ID") },
    ]);
    const res = await post({ planId: PLAN, phaseId: "ph1" });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "DUPLICATE_INVOICE_ID" } });
    expect(apiCalls()).toHaveLength(2);
  });

  it("validates the body (bad ids → 422) and resolves only real plans (unknown → 404 PLAN_NOT_FOUND)", async () => {
    mockPayPal([]);
    expect((await post({ planId: "demo", phaseId: "ph1" })).status).toBe(422);
    const res = await post({ planId: "pln_zzzzzzzz", phaseId: "ph1" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "PLAN_NOT_FOUND" } });
  });
});
