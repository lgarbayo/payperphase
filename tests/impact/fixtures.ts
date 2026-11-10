import { closureStressTest, computeExposure } from "@/engine";
import type { ClosureStressTest, ExposureReport } from "@/contracts";
import { GOLDEN_START_DATE, goldenPlan } from "@/contracts/fixtures/implantCase";
import { vi } from "vitest";

/** GOLDEN_PLAN after phase 1 was paid at the visit (capture also marks it delivered). */
export function ph1PaidAndDelivered() {
  const plan = goldenPlan();
  const ph1 = plan.phases.find((p) => p.id === "ph1")!;
  ph1.payment = {
    ...ph1.payment,
    status: "paid",
    instrument: "order",
    paidCents: ph1.amountCents,
    paidAt: `${GOLDEN_START_DATE}T10:30:00.000Z`,
  };
  ph1.delivery = { status: "delivered", deliveredOn: GOLDEN_START_DATE };
  return plan;
}

/** Engine-computed props, exactly as the plan view hands them to the components. */
export function goldenImpactProps(): { report: ExposureReport; stress: ClosureStressTest } {
  const plan = ph1PaidAndDelivered();
  return {
    report: computeExposure(plan, GOLDEN_START_DATE),
    stress: closureStressTest(plan, GOLDEN_START_DATE),
  };
}

/** Collapse NBSP / narrow NBSP from Intl currency output so assertions read naturally. */
export function norm(text: string | null | undefined): string {
  return (text ?? "").replace(/[\s  ]+/g, " ").trim();
}

/** Pretend the viewer prefers reduced motion so counters settle instantly. */
export function preferReducedMotion() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}
