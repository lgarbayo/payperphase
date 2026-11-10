import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhaseOrder, reconcileReturn } from "@/lib/paypal";
import {
  approvedOrder,
  completedOrder,
  eventsOfType,
  mockPayPal,
  resetStore,
  restoreEnv,
  storedPlan,
  useLiveEnv,
  useMockEnv,
  withPayment,
} from "./fakes";

vi.mock("@/server/store", async () => ({ store: (await import("./fakes")).fakeStore }));
vi.mock("@/server/events", async () => (await import("./fakes")).fakeEventsModule());

const PLAN = "pln_ribera01";
const ORDER = "5O190127TN364715T";

describe("reconcileReturn (full-page redirect fallback)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreEnv();
  });

  describe("live sandbox", () => {
    beforeEach(() => {
      useLiveEnv();
      resetStore(withPayment("ph1", { orderId: ORDER, orderAttempt: 1 }));
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("APPROVED → captures; a second call finds it COMPLETED and only ensures paid (idempotent)", async () => {
      let captured = false;
      const { apiCalls } = mockPayPal([
        {
          method: "GET",
          path: `/v2/checkout/orders/${ORDER}`,
          reply: () => ({ status: 200, body: captured ? completedOrder(ORDER) : approvedOrder(ORDER) }),
        },
        {
          method: "POST",
          path: `/v2/checkout/orders/${ORDER}/capture`,
          reply: () => {
            captured = true;
            return { status: 201, body: completedOrder(ORDER) };
          },
        },
      ]);

      const first = await reconcileReturn({ planId: PLAN, orderId: ORDER });
      const second = await reconcileReturn({ planId: PLAN, orderId: ORDER });
      expect(first).toEqual({ phaseId: "ph1", outcome: "COMPLETED" });
      expect(second).toEqual(first);

      const captures = apiCalls().filter((c) => c.path.endsWith("/capture"));
      expect(captures).toHaveLength(1);
      expect(captures[0]!.headers["paypal-request-id"]).toBe(`${ORDER}-capture`);
      expect(storedPlan().phases[0]!.payment).toMatchObject({ status: "paid", captureId: "CAP-1" });
      expect(eventsOfType("PAYMENT_CAPTURED")).toEqual([expect.objectContaining({ via: "return" })]);
    });

    it("COMPLETED (the popup captured, our server never heard back) → ensures paid, no second capture", async () => {
      const { apiCalls } = mockPayPal([
        { method: "GET", path: `/v2/checkout/orders/${ORDER}`, reply: () => ({ status: 200, body: completedOrder(ORDER) }) },
      ]);
      await expect(reconcileReturn({ planId: "demo", orderId: ORDER })).resolves.toEqual({ phaseId: "ph1", outcome: "COMPLETED" });
      expect(apiCalls().every((c) => c.method === "GET")).toBe(true);
      expect(storedPlan().phases[0]!.payment.status).toBe("paid");
      expect(storedPlan().phases[0]!.delivery.status).toBe("delivered");
    });

    it("an order for another plan, a never-approved order, or a PayPal failure → UNKNOWN_ORDER (never throws)", async () => {
      mockPayPal([
        {
          method: "GET",
          path: "/v2/checkout/orders/FOREIGN",
          reply: () => ({ status: 200, body: approvedOrder("FOREIGN", "pln_other001:ph1") }),
        },
        {
          method: "GET",
          path: "/v2/checkout/orders/CREATED1",
          reply: () => ({ status: 200, body: { ...approvedOrder("CREATED1"), status: "CREATED" } }),
        },
        { method: "GET", path: "/v2/checkout/orders/BROKEN", reply: () => ({ status: 500, body: { name: "INTERNAL_SERVER_ERROR" } }) },
      ]);
      await expect(reconcileReturn({ planId: PLAN, orderId: "FOREIGN" })).resolves.toEqual({ phaseId: null, outcome: "UNKNOWN_ORDER" });
      await expect(reconcileReturn({ planId: PLAN, orderId: "CREATED1" })).resolves.toEqual({ phaseId: "ph1", outcome: "UNKNOWN_ORDER" });
      await expect(reconcileReturn({ planId: PLAN, orderId: "BROKEN" })).resolves.toEqual({ phaseId: null, outcome: "UNKNOWN_ORDER" });
      await expect(reconcileReturn({ planId: "pln_zzzzzzzz", orderId: ORDER })).resolves.toEqual({ phaseId: null, outcome: "UNKNOWN_ORDER" });
      expect(storedPlan().phases[0]!.payment.status).toBe("due");
    });
  });

  describe("mock mode", () => {
    beforeEach(() => {
      useMockEnv();
      resetStore();
    });

    it("captures the stored mock order once and is idempotent", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const { orderId } = await createPhaseOrder({ planId: PLAN, phaseId: "ph1" });
      const first = await reconcileReturn({ planId: PLAN, orderId });
      const second = await reconcileReturn({ planId: PLAN, orderId });
      expect(first).toEqual({ phaseId: "ph1", outcome: "COMPLETED" });
      expect(second).toEqual(first);
      expect(eventsOfType("PAYMENT_CAPTURED")).toEqual([expect.objectContaining({ via: "return", orderId })]);
      expect(fetchSpy).not.toHaveBeenCalled();
      await expect(reconcileReturn({ planId: PLAN, orderId: "MOCK-NOPE" })).resolves.toEqual({
        phaseId: null,
        outcome: "UNKNOWN_ORDER",
      });
    });
  });
});
