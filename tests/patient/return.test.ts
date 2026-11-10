/** /p/[planId]/return?token=ORDER_ID → reconcileReturn (mocked) → redirect to /p/[planId]. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  reconcileReturn: vi.fn(async (_args: { planId: string; orderId: string }) => ({ phaseId: "ph1", outcome: "COMPLETED" as const })),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  resolvePlanId: vi.fn(async (idOrAlias: string) => (idOrAlias === "demo" ? "pln_ribera01" : idOrAlias.startsWith("pln_") ? idOrAlias : null)),
}));

vi.mock("@/lib/paypal", () => ({ reconcileReturn: m.reconcileReturn }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/server/store", () => ({ store: { resolvePlanId: m.resolvePlanId } }));

import ReturnPage from "../../app/p/[planId]/return/page";

async function run(planId: string, token?: string | string[]) {
  const err = await ReturnPage({ params: Promise.resolve({ planId }), searchParams: Promise.resolve({ token }) }).then(
    () => null,
    (e: unknown) => e as Error & { url?: string },
  );
  return err;
}

describe("/p/[planId]/return", () => {
  beforeEach(() => {
    m.reconcileReturn.mockClear();
    m.redirect.mockClear();
  });

  it("reconciles the order with the real plan id and redirects to the plan page", async () => {
    const err = await run("demo", "ORDER-123");
    expect(m.reconcileReturn).toHaveBeenCalledWith({ planId: "pln_ribera01", orderId: "ORDER-123" });
    expect(m.redirect).toHaveBeenCalledWith("/p/demo");
    expect(err?.message).toBe("NEXT_REDIRECT");
  });

  it("works with a real plan id", async () => {
    await run("pln_ribera01", "ORDER-9");
    expect(m.reconcileReturn).toHaveBeenCalledWith({ planId: "pln_ribera01", orderId: "ORDER-9" });
    expect(m.redirect).toHaveBeenCalledWith("/p/pln_ribera01");
  });

  it("redirects without reconciling when there is no token", async () => {
    await run("demo");
    expect(m.reconcileReturn).not.toHaveBeenCalled();
    expect(m.redirect).toHaveBeenCalledWith("/p/demo");
  });

  it("still redirects when reconcile fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    m.reconcileReturn.mockRejectedValueOnce(new Error("PayPal down"));
    const err = await run("demo", ["ORDER-1", "ORDER-2"]);
    expect(m.reconcileReturn).toHaveBeenCalledWith({ planId: "pln_ribera01", orderId: "ORDER-1" });
    expect(err?.url).toBe("/p/demo");
    spy.mockRestore();
  });
});
