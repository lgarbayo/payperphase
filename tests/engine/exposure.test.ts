import { describe, expect, it } from "vitest";
import { ClosureStressTestSchema, DSCA_SOURCE_URL, ExposureReportSchema, LINKED_LOAN_ILLUSTRATIVE } from "@/contracts";
import { GOLDEN_PLAN, goldenPlan } from "@/contracts/fixtures/implantCase";
import { closureStressTest, computeExposure, markDelivered, wholeMonthsBetween } from "@/engine";
import { paidAndDelivered } from "./helpers";

const afterPh1 = () => paidAndDelivered(goldenPlan(), "ph1", "2026-11-16");

describe("exposure meter", () => {
  it("once ph1 is paid and delivered: paid €360, delivered €360, prepaid €0", () => {
    const e = computeExposure(afterPh1(), "2026-11-16");
    expect(ExposureReportSchema.parse(e)).toBeTruthy();
    expect(e).toMatchObject({
      asOf: "2026-11-16",
      totalCents: 407_000,
      paidCents: 36_000,
      deliveredCents: 36_000,
      prepaidUndeliveredCents: 0,
      remainingCents: 371_000,
    });
    expect(e.byPhase.map((p) => [p.phaseId, p.paid, p.delivered, p.status])).toEqual([
      ["ph1", true, true, "paid"],
      ["ph2", false, false, "scheduled"],
      ["ph3", false, false, "scheduled"],
      ["ph4", false, false, "scheduled"],
    ]);
  });

  it("is all zeros before anything is paid", () => {
    const e = computeExposure(GOLDEN_PLAN, "2026-11-16");
    expect([e.paidCents, e.deliveredCents, e.prepaidUndeliveredCents, e.remainingCents]).toEqual([0, 0, 0, 407_000]);
  });

  it("would honestly show a prepayment (paid but not delivered)", () => {
    const plan = goldenPlan();
    plan.phases[1]!.payment.status = "paid";
    const e = computeExposure(plan, "2026-11-16");
    expect(e.prepaidUndeliveredCents).toBe(150_000);
  });

  it("derives byPhase statuses at asOf", () => {
    const e = computeExposure(afterPh1(), "2027-01-04");
    expect(e.byPhase[1]!.status).toBe("upcoming");
  });
});

describe("clinic-closure stress test", () => {
  it("at 2026-11-16 after ph1: linked loan owes €3,710 for undelivered care, PayPerPhase €0", () => {
    const s = closureStressTest(afterPh1(), "2026-11-16");
    expect(ClosureStressTestSchema.parse(s)).toBeTruthy();
    expect(s.illustrative).toBe(true);
    expect(s.sourceUrl).toBe(DSCA_SOURCE_URL);
    expect(s.linkedLoan.owedForUndeliveredCents).toBe(371_000);
    expect(s.payPerPhase.owedForUndeliveredCents).toBe(0);
    expect(s.payPerPhase).toEqual({ paidCents: 36_000, deliveredCents: 36_000, owedForUndeliveredCents: 0 });
    expect(s.linkedLoan).toMatchObject({
      financedCents: 407_000,
      months: LINKED_LOAN_ILLUSTRATIVE.months,
      monthlyCents: Math.round(407_000 / LINKED_LOAN_ILLUSTRATIVE.months),
      monthsElapsed: 0,
      repaidCents: 0,
      outstandingCents: 407_000,
    });
    expect(s.undeliveredPhaseIds).toEqual(["ph2", "ph3", "ph4"]);
  });

  it("repays the loan monthly from phase 1's visit; the undelivered amount does not shrink", () => {
    const s = closureStressTest(afterPh1(), "2027-01-20");
    expect(s.linkedLoan.monthsElapsed).toBe(2);
    expect(s.linkedLoan.repaidCents).toBe(2 * s.linkedLoan.monthlyCents);
    expect(s.linkedLoan.outstandingCents).toBe(407_000 - 2 * s.linkedLoan.monthlyCents);
    expect(s.linkedLoan.owedForUndeliveredCents).toBe(371_000);
  });

  it("a fully elapsed loan is fully repaid (rounding absorbed)", () => {
    const s = closureStressTest(afterPh1(), "2029-01-01");
    expect(s.linkedLoan.monthsElapsed).toBe(24);
    expect(s.linkedLoan.repaidCents).toBe(407_000);
    expect(s.linkedLoan.outstandingCents).toBe(0);
  });

  it("everything delivered → nothing owed for undelivered care", () => {
    let plan = goldenPlan();
    for (const p of plan.phases) plan = paidAndDelivered(plan, p.id, p.startDate);
    plan = markDelivered(plan, "ph4", "2027-04-22");
    const s = closureStressTest(plan, "2027-04-22");
    expect(s.linkedLoan.owedForUndeliveredCents).toBe(0);
    expect(s.undeliveredPhaseIds).toEqual([]);
  });

  it("counts whole calendar months", () => {
    expect(wholeMonthsBetween("2026-11-16", "2026-11-16")).toBe(0);
    expect(wholeMonthsBetween("2026-11-16", "2026-12-15")).toBe(0);
    expect(wholeMonthsBetween("2026-11-16", "2026-12-16")).toBe(1);
    expect(wholeMonthsBetween("2026-11-16", "2027-11-16")).toBe(12);
    expect(wholeMonthsBetween("2026-11-16", "2026-10-01")).toBe(0);
  });
});
