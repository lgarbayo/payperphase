import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as configRoute } from "../../app/api/paypal/config/route";
import { POST as createRoute } from "../../app/api/paypal/orders/route";
import { POST as captureRoute } from "../../app/api/paypal/orders/[orderId]/capture/route";
import { capturePhaseOrder, createPhaseOrder, paypalClientConfig } from "@/lib/paypal";
import { eventsOfType, resetStore, restoreEnv, storedPlan, useLiveEnv, useMockEnv } from "./fakes";

vi.mock("@/server/store", async () => ({ store: (await import("./fakes")).fakeStore }));
vi.mock("@/server/events", async () => (await import("./fakes")).fakeEventsModule());

const PLAN = "pln_ribera01";

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("mock mode (no PayPal credentials / FORCE_MOCKS=1)", () => {
  beforeEach(() => {
    useMockEnv();
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it("runs the same create → capture server path without touching the network, and SSE gets PAYMENT_CAPTURED", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const createRes = await createRoute(new Request("http://localhost/api/paypal/orders", json({ planId: PLAN, phaseId: "ph1" })));
    expect(createRes.status).toBe(201);
    const order = (await createRes.json()) as { orderId: string; amountCents: number; mode: string };
    expect(order).toMatchObject({ amountCents: 36_000, mode: "mock" });
    expect(order.orderId).toMatch(/^MOCK-RIBE-ph1-O1-[A-Z0-9]{8}$/);
    expect(storedPlan().phases[0]!.payment).toMatchObject({ orderId: order.orderId, orderAttempt: 1 });

    const capRes = await captureRoute(
      new Request(`http://localhost/api/paypal/orders/${order.orderId}/capture`, json({ planId: PLAN, phaseId: "ph1", orderId: order.orderId })),
      { params: Promise.resolve({ orderId: order.orderId }) },
    );
    expect(capRes.status).toBe(200);
    const cap = (await capRes.json()) as { outcome: string; captureId: string; paidCents: number; mode: string };
    expect(cap).toMatchObject({ outcome: "COMPLETED", paidCents: 36_000, mode: "mock" });

    const ph1 = storedPlan().phases[0]!;
    expect(ph1.payment).toMatchObject({ status: "paid", instrument: "order", captureId: cap.captureId, paidCents: 36_000 });
    expect(ph1.delivery).toEqual({ status: "delivered", deliveredOn: "2026-11-16" });
    expect(eventsOfType("PAYMENT_CAPTURED")).toEqual([
      expect.objectContaining({ planId: PLAN, phaseId: "ph1", orderId: order.orderId, amountCents: 36_000, via: "capture" }),
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enforces the same rules: not due → 409, wrong order → 409, paid twice → ALREADY_CAPTURED", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const notDue = await createRoute(new Request("http://localhost/api/paypal/orders", json({ planId: PLAN, phaseId: "ph3" })));
    expect(notDue.status).toBe(409);

    const { orderId } = await createPhaseOrder({ planId: PLAN, phaseId: "ph1" });
    await expect(capturePhaseOrder({ planId: PLAN, phaseId: "ph1", orderId: "MOCK-OTHER" })).rejects.toMatchObject({
      reason: "ORDER_MISMATCH",
    });
    await capturePhaseOrder({ planId: PLAN, phaseId: "ph1", orderId });
    await expect(capturePhaseOrder({ planId: PLAN, phaseId: "ph1", orderId })).resolves.toMatchObject({
      outcome: "ALREADY_CAPTURED",
    });
    expect(eventsOfType("PAYMENT_CAPTURED")).toHaveLength(1);
  });

  it("GET /api/paypal/config tells the browser to render the labelled mock button", async () => {
    const res = await configRoute();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ mode: "mock", clientId: null, buyerCountry: "ES", currency: "EUR", intent: "capture" });
  });

  it("live config exposes only the public client id (never the secret)", () => {
    useLiveEnv();
    const cfg = paypalClientConfig();
    expect(cfg).toMatchObject({ mode: "live", clientId: "test-client-id", intent: "capture" });
    expect(JSON.stringify(cfg)).not.toContain("test-client-secret");
  });
});
