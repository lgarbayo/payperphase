import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as captureRoute } from "../../app/api/paypal/orders/[orderId]/capture/route";
import { markDelivered } from "@/engine";
import { capturePhaseOrder } from "@/lib/paypal";
import {
  approvedOrder,
  completedOrder,
  eventsOfType,
  fakeStore,
  mockPayPal,
  paypalError,
  published,
  resetStore,
  restoreEnv,
  storedPlan,
  useLiveEnv,
  withPayment,
} from "./fakes";

vi.mock("@/server/store", async () => ({ store: (await import("./fakes")).fakeStore }));
vi.mock("@/server/events", async () => (await import("./fakes")).fakeEventsModule());
vi.mock("@/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/engine")>();
  return { ...real, markDelivered: vi.fn(real.markDelivered) };
});

const PLAN = "pln_ribera01";
const ORDER = "5O190127TN364715T";
const REQ = { planId: PLAN, phaseId: "ph1", orderId: ORDER };
const CAPTURE_PATH = `/v2/checkout/orders/${ORDER}/capture`;

function postCapture(orderIdInPath: string, body: unknown) {
  return captureRoute(
    new Request(`http://localhost/api/paypal/orders/${orderIdInPath}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderId: orderIdInPath }) },
  );
}

describe("capturePhaseOrder (Orders v2, live sandbox)", () => {
  beforeEach(() => {
    useLiveEnv();
    // The order was created for ph1 (attempt 1) and approved by the buyer in the popup.
    resetStore(withPayment("ph1", { orderId: ORDER, orderAttempt: 1 }));
    vi.mocked(markDelivered).mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("COMPLETED → milestone paid (order instrument), phase delivered today, PAYMENT_CAPTURED {via:capture}", async () => {
    const { apiCalls } = mockPayPal([
      { method: "POST", path: CAPTURE_PATH, reply: () => ({ status: 201, body: completedOrder(ORDER) }) },
    ]);
    const out = await capturePhaseOrder(REQ);
    expect(out).toEqual({ outcome: "COMPLETED", captureId: "CAP-1", paidCents: 36_000, mode: "live" });

    const [call] = apiCalls();
    expect(call!.path).toBe(CAPTURE_PATH);
    expect(call!.headers["paypal-request-id"]).toBe(`${ORDER}-capture`);

    expect(fakeStore.updatePlan).toHaveBeenCalledTimes(1);
    const ph1 = storedPlan().phases[0]!;
    expect(ph1.payment).toMatchObject({
      status: "paid",
      instrument: "order",
      orderId: ORDER,
      captureId: "CAP-1",
      paidCents: 36_000,
      paidAt: "2026-11-16T10:00:00Z",
    });
    expect(markDelivered).toHaveBeenCalledWith(expect.objectContaining({ id: PLAN }), "ph1", "2026-11-16");
    expect(ph1.delivery).toEqual({ status: "delivered", deliveredOn: "2026-11-16" });

    expect(eventsOfType("PAYMENT_CAPTURED")).toEqual([
      expect.objectContaining({
        planId: PLAN,
        phaseId: "ph1",
        orderId: ORDER,
        captureId: "CAP-1",
        amountCents: 36_000,
        via: "capture",
      }),
    ]);
    expect(eventsOfType("PHASE_STATUS_CHANGED")).toEqual([expect.objectContaining({ from: "due", to: "paid" })]);
    expect(eventsOfType("PHASE_DELIVERED")).toHaveLength(1);
  });

  it("PENDING → processing (not delivered, no PAYMENT_CAPTURED)", async () => {
    mockPayPal([
      {
        method: "POST",
        path: CAPTURE_PATH,
        reply: () => ({ status: 201, body: completedOrder(ORDER, { captureId: "CAP-P", captureStatus: "PENDING" }) }),
      },
    ]);
    const out = await capturePhaseOrder(REQ);
    expect(out.outcome).toBe("PENDING");
    expect(storedPlan().phases[0]!.payment).toMatchObject({ status: "processing", captureId: "CAP-P" });
    expect(storedPlan().phases[0]!.delivery.status).toBe("pending");
    expect(markDelivered).not.toHaveBeenCalled();
    expect(eventsOfType("PAYMENT_CAPTURED")).toHaveLength(0);
    expect(eventsOfType("PHASE_STATUS_CHANGED")).toEqual([expect.objectContaining({ from: "due", to: "processing" })]);
  });

  it("INSTRUMENT_DECLINED → DECLINED (the button restarts), state untouched, next try uses a fresh request id", async () => {
    let n = 0;
    const { apiCalls } = mockPayPal([
      {
        method: "POST",
        path: CAPTURE_PATH,
        reply: () => (++n === 1 ? paypalError(422, "INSTRUMENT_DECLINED") : { status: 201, body: completedOrder(ORDER) }),
      },
    ]);
    const first = await capturePhaseOrder(REQ);
    expect(first).toEqual({ outcome: "DECLINED", mode: "live" });
    expect(storedPlan().phases[0]!.payment.status).toBe("due");
    expect(published).toHaveLength(0);

    // actions.restart() → buyer picks another funding source → onApprove → capture again.
    const second = await capturePhaseOrder(REQ);
    expect(second.outcome).toBe("COMPLETED");
    expect(apiCalls().map((c) => c.headers["paypal-request-id"])).toEqual([`${ORDER}-capture`, `${ORDER}-capture-r1`]);
  });

  it("ORDER_ALREADY_CAPTURED → GET the order and reconcile it into the store", async () => {
    const { apiCalls } = mockPayPal([
      { method: "POST", path: CAPTURE_PATH, reply: () => paypalError(422, "ORDER_ALREADY_CAPTURED") },
      { method: "GET", path: `/v2/checkout/orders/${ORDER}`, reply: () => ({ status: 200, body: completedOrder(ORDER) }) },
    ]);
    const out = await capturePhaseOrder(REQ);
    expect(out).toMatchObject({ outcome: "ALREADY_CAPTURED", captureId: "CAP-1", paidCents: 36_000 });
    expect(apiCalls().map((c) => `${c.method} ${c.path}`)).toEqual([`POST ${CAPTURE_PATH}`, `GET /v2/checkout/orders/${ORDER}`]);
    expect(storedPlan().phases[0]!.payment).toMatchObject({ status: "paid", captureId: "CAP-1" });
    expect(eventsOfType("PAYMENT_CAPTURED")).toHaveLength(1);
  });

  it("is idempotent: capturing a paid phase again does not call PayPal and publishes nothing", async () => {
    const { apiCalls } = mockPayPal([
      { method: "POST", path: CAPTURE_PATH, reply: () => ({ status: 201, body: completedOrder(ORDER) }) },
    ]);
    await capturePhaseOrder(REQ);
    const again = await capturePhaseOrder(REQ);
    expect(again).toMatchObject({ outcome: "ALREADY_CAPTURED", captureId: "CAP-1", paidCents: 36_000 });
    expect(apiCalls()).toHaveLength(1);
    expect(eventsOfType("PAYMENT_CAPTURED")).toHaveLength(1);
  });

  it("refuses to capture an order that belongs to another phase (409 ORDER_MISMATCH)", async () => {
    const other = "9XY12345AB678901C";
    const { apiCalls } = mockPayPal([
      {
        method: "GET",
        path: `/v2/checkout/orders/${other}`,
        reply: () => ({ status: 200, body: approvedOrder(other, "pln_ribera01:ph2") }),
      },
    ]);
    const res = await postCapture(other, { planId: PLAN, phaseId: "ph1", orderId: other });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "ORDER_MISMATCH" } });
    expect(apiCalls().every((c) => c.method === "GET")).toBe(true);
  });

  it("route: the path order id must match the body (400) and a good capture returns the outcome", async () => {
    mockPayPal([{ method: "POST", path: CAPTURE_PATH, reply: () => ({ status: 201, body: completedOrder(ORDER) }) }]);
    expect((await postCapture("OTHER", REQ)).status).toBe(400);
    const res = await postCapture(ORDER, REQ);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "COMPLETED", captureId: "CAP-1", mode: "live" });
  });
});
