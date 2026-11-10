import { describe, expect, it } from "vitest";
import { GOLDEN_PLAN, goldenPlan } from "@/contracts/fixtures/implantCase";
import { applyPaymentStatuses, canCreateOrder, markDelivered, paymentStatusAt, EngineError } from "@/engine";
import { NOW, paidAndDelivered } from "./helpers";

const statusesAt = (today: string, plan = GOLDEN_PLAN) =>
  applyPaymentStatuses(plan, today).plan.phases.map((p) => p.payment.status);

describe("payment statuses on the simulated clock", () => {
  it("at 2026-11-16 ph1 is due and the rest are scheduled", () => {
    expect(statusesAt("2026-11-16")).toEqual(["due", "scheduled", "scheduled", "scheduled"]);
    expect(applyPaymentStatuses(GOLDEN_PLAN, "2026-11-16")).toEqual({ plan: GOLDEN_PLAN, changes: [] });
  });

  it("ph2: upcoming at +7 weeks (2027-01-04), due on 2027-01-12, overdue on 2027-01-20", () => {
    const paid = paidAndDelivered(goldenPlan(), "ph1", "2026-11-16");
    expect(statusesAt("2027-01-04", paid)[1]).toBe("upcoming");
    expect(statusesAt("2027-01-12", paid)[1]).toBe("due");
    expect(statusesAt("2027-01-19", paid)[1]).toBe("due");
    expect(statusesAt("2027-01-20", paid)[1]).toBe("overdue");
  });

  it("window edges: upcoming exactly 14 days before, scheduled 15 days before", () => {
    const ph2 = GOLDEN_PLAN.phases[1]!;
    expect(paymentStatusAt(ph2, "2026-12-29")).toBe("upcoming");
    expect(paymentStatusAt(ph2, "2026-12-28")).toBe("scheduled");
    expect(paymentStatusAt(ph2, "2027-01-11")).toBe("upcoming");
  });

  it("reports one change per milestone that moved", () => {
    const { plan, changes } = applyPaymentStatuses(GOLDEN_PLAN, "2027-01-04");
    expect(changes).toEqual([
      { phaseId: "ph1", from: "due", to: "overdue" },
      { phaseId: "ph2", from: "scheduled", to: "upcoming" },
    ]);
    expect(plan.version).toBe(GOLDEN_PLAN.version);
    expect(GOLDEN_PLAN.phases[0]!.payment.status).toBe("due"); // input untouched
  });

  it("paid and processing milestones never change", () => {
    const paid = paidAndDelivered(goldenPlan(), "ph1", "2026-11-16");
    paid.phases[1]!.payment.status = "processing";
    for (const today of ["2026-11-01", "2026-11-16", "2027-01-12", "2027-12-31"]) {
      const out = applyPaymentStatuses(paid, today).plan;
      expect(out.phases[0]!.payment.status).toBe("paid");
      expect(out.phases[1]!.payment.status).toBe("processing");
    }
  });
});

describe("canCreateOrder (no-prepayment invariant)", () => {
  it("allows ph1 on its visit day for exactly its amount", () => {
    expect(canCreateOrder(GOLDEN_PLAN, "ph1", "2026-11-16")).toEqual({ ok: true, amountCents: 36_000 });
  });

  it("allows an overdue milestone", () => {
    expect(canCreateOrder(GOLDEN_PLAN, "ph1", "2026-12-01")).toEqual({ ok: true, amountCents: 36_000 });
  });

  it("refuses an upcoming phase: NOT_DUE_YET", () => {
    expect(canCreateOrder(GOLDEN_PLAN, "ph2", "2027-01-04")).toEqual({ ok: false, reason: "NOT_DUE_YET" });
    expect(canCreateOrder(GOLDEN_PLAN, "ph2", "2026-11-16")).toEqual({ ok: false, reason: "NOT_DUE_YET" });
  });

  it("recomputes the status at today instead of trusting the stored one", () => {
    const tampered = goldenPlan();
    tampered.phases[3]!.payment.status = "due"; // stored status says due, the date says otherwise
    expect(canCreateOrder(tampered, "ph4", "2026-11-16")).toEqual({ ok: false, reason: "NOT_DUE_YET" });
    const stale = goldenPlan();
    stale.phases[1]!.payment.status = "scheduled"; // stale stored status, but the visit day has come
    expect(canCreateOrder(stale, "ph2", "2027-01-12")).toEqual({ ok: true, amountCents: 150_000 });
  });

  it("refuses ALREADY_PAID, PROCESSING, PLAN_NOT_APPROVED and UNKNOWN_PHASE", () => {
    const paid = paidAndDelivered(goldenPlan(), "ph1", "2026-11-16");
    expect(canCreateOrder(paid, "ph1", "2026-11-16")).toEqual({ ok: false, reason: "ALREADY_PAID" });
    const processing = goldenPlan();
    processing.phases[0]!.payment.status = "processing";
    expect(canCreateOrder(processing, "ph1", "2026-11-16")).toEqual({ ok: false, reason: "PROCESSING" });
    expect(canCreateOrder({ ...goldenPlan(), status: "draft" }, "ph1", "2026-11-16")).toEqual({
      ok: false,
      reason: "PLAN_NOT_APPROVED",
    });
    expect(canCreateOrder(GOLDEN_PLAN, "ph7", "2026-11-16")).toEqual({ ok: false, reason: "UNKNOWN_PHASE" });
  });
});

describe("markDelivered", () => {
  it("marks one phase delivered without touching payment or other phases", () => {
    const out = markDelivered(GOLDEN_PLAN, "ph1", "2026-11-16");
    expect(out.phases[0]!.delivery).toEqual({ status: "delivered", deliveredOn: "2026-11-16" });
    expect(out.phases[0]!.payment).toEqual(GOLDEN_PLAN.phases[0]!.payment);
    expect(out.phases.slice(1)).toEqual(GOLDEN_PLAN.phases.slice(1));
    expect(GOLDEN_PLAN.phases[0]!.delivery.status).toBe("pending");
    // idempotent: the first delivery date is kept
    expect(markDelivered(out, "ph1", "2026-11-20").phases[0]!.delivery.deliveredOn).toBe("2026-11-16");
    void NOW;
  });

  it("throws on an unknown phase", () => {
    expect(() => markDelivered(GOLDEN_PLAN, "ph9", "2026-11-16")).toThrow(EngineError);
  });
});
