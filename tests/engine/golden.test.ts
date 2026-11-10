import { describe, expect, it } from "vitest";
import { PlanSchema } from "@/contracts";
import { GOLDEN_EXTRACTION, GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { applyPaymentStatuses, buildPlan, captureBaseline, deadlineFor, healingWindows } from "@/engine";
import { goldenInput, NOW } from "./helpers";

describe("buildPlan on the golden implant case", () => {
  const plan = buildPlan(goldenInput());

  it("produces phases deep-equal to GOLDEN_PLAN.phases", () => {
    expect(plan.phases).toEqual(GOLDEN_PLAN.phases);
  });

  it("checks the parity target field by field (ids, kinds, dates, lags, amounts, fit, statuses)", () => {
    expect(plan.phases.map((p) => [p.id, p.kind, p.startDate, p.endDate, p.amountCents])).toEqual([
      ["ph1", "PREP", "2026-11-16", "2026-11-17", 36_000],
      ["ph2", "IMPLANT_SURGERY", "2027-01-12", "2027-01-13", 150_000],
      ["ph3", "IMPRESSIONS", "2027-04-07", "2027-04-08", 52_000],
      ["ph4", "PROSTHETIC", "2027-04-22", "2027-04-23", 169_000],
    ]);
    expect(plan.phases.map((p) => p.dependsOn.map((d) => [d.minLagDays, d.maxLagDays, d.riskNoteId]))).toEqual([
      [],
      [[56, 180, "HEALING_EXTRACTION_MIN_8W"]],
      [[84, 180, "OSSEOINTEGRATION_MIN_12W"]],
      [[14, 60, "LAB_FABRICATION_MIN_2W"]],
    ]);
    expect(plan.phases.map((p) => p.payment.status)).toEqual(["due", "scheduled", "scheduled", "scheduled"]);
    expect(plan.phases.every((p) => p.fit.band === "PAY_IN_3")).toBe(true);
  });

  it("is a valid draft plan: no approvals, no baseline, lines and total from the quote", () => {
    expect(PlanSchema.parse(plan)).toBeTruthy();
    expect(plan.status).toBe("draft");
    expect(plan.version).toBe(1);
    expect(plan.baseline).toBeUndefined();
    expect(plan.approvedNotes).toEqual([]);
    expect(plan.approvedBy).toBeUndefined();
    expect(plan.lines).toEqual(GOLDEN_EXTRACTION.lines);
    expect(plan.totalCents).toBe(GOLDEN_PLAN.totalCents);
    expect(plan.createdAt).toBe(NOW);
  });

  it("approving it (baseline + statuses) gives the golden baseline", () => {
    const approved = captureBaseline({ ...plan, status: "approved" }, NOW);
    expect(approved.baseline).toEqual(GOLDEN_PLAN.baseline);
    expect(applyPaymentStatuses(approved, "2026-11-16").changes).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = goldenInput();
    const snapshot = structuredClone(input);
    buildPlan(input);
    expect(input).toEqual(snapshot);
  });

  it("snaps a weekend start date to Monday", () => {
    const p = buildPlan(goldenInput({ startDate: "2026-11-14" }));
    expect(p.phases[0]!.startDate).toBe("2026-11-16");
  });

  it("derives healing windows and deadlines for the Gantt", () => {
    const windows = healingWindows(GOLDEN_PLAN);
    expect(windows[0]).toEqual({
      fromPhaseId: "ph1",
      toPhaseId: "ph2",
      startDate: "2026-11-17",
      minEndDate: "2027-01-12",
      maxEndDate: "2027-05-16",
      actualEndDate: "2027-01-12",
      noteId: "HEALING_EXTRACTION_MIN_8W",
    });
    expect(windows).toHaveLength(3);
    expect(deadlineFor(GOLDEN_PLAN, "ph2")).toBe("2027-05-16");
    expect(deadlineFor(GOLDEN_PLAN, "ph4")).toBe("2027-06-07");
    expect(deadlineFor(GOLDEN_PLAN, "ph1")).toBeNull();
  });
});
