import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhaseOrder } from "@/lib/paypal";
import { resetOpenOrders } from "@/lib/paypal/orders";
import { mockPayPal, resetStore, restoreEnv, storedPlan, useLiveEnv, useMockEnv, type PayPalCall } from "./fakes";

vi.mock("@/server/store", async () => ({ store: (await import("./fakes")).fakeStore }));
vi.mock("@/server/events", async () => (await import("./fakes")).fakeEventsModule());

const PLAN = "pln_ribera01";

function okOrder(call: PayPalCall) {
  const n = (call.body as { purchase_units: Array<{ invoice_id: string }> }).purchase_units[0]!.invoice_id;
  return { status: 201, body: { id: `ORDER-${n}`, status: "CREATED" } };
}

const parallel = (n: number) =>
  Promise.all(Array.from({ length: n }, () => createPhaseOrder({ planId: PLAN, phaseId: "ph1" })));

describe("createPhaseOrder: one open order per phase under concurrency", () => {
  beforeEach(() => {
    resetOpenOrders();
    resetStore();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("live: 6 parallel POSTs create one PayPal order and all return its orderId", async () => {
    useLiveEnv();
    const { apiCalls } = mockPayPal([{ method: "POST", path: "/v2/checkout/orders", reply: okOrder }]);
    const results = await parallel(6);
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    expect(apiCalls().filter((c) => c.method === "POST" && c.path === "/v2/checkout/orders")).toHaveLength(1);
    // The server still sets the amount.
    const phase = storedPlan(PLAN).phases.find((p) => p.id === "ph1")!;
    for (const r of results) expect(r.amountCents).toBe(phase.amountCents);
    expect(phase.payment.orderId).toBe(results[0]!.orderId);
    expect(phase.payment.orderAttempt).toBe(1);
  });

  it("mock: 6 parallel POSTs return the same orderId", async () => {
    useMockEnv();
    const results = await parallel(6);
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    expect(storedPlan(PLAN).phases.find((p) => p.id === "ph1")!.payment.orderAttempt).toBe(1);
  });

  it("creates a fresh order when the server amount changed since the open one", async () => {
    useMockEnv();
    const [first] = await parallel(1);
    resetStore((p) => ({
      ...p,
      phases: p.phases.map((ph) =>
        ph.id === "ph1"
          ? { ...ph, amountCents: ph.amountCents + 100, payment: { ...ph.payment, orderId: first!.orderId, orderAttempt: 1 } }
          : ph,
      ),
    }));
    const [second] = await parallel(1);
    expect(second!.orderId).not.toBe(first!.orderId);
  });

  it("still refuses a phase that is not due yet", async () => {
    useMockEnv();
    await expect(createPhaseOrder({ planId: PLAN, phaseId: "ph2" })).rejects.toMatchObject({ reason: "NOT_DUE_YET" });
  });
});
