import { describe, expect, it } from "vitest";
import {
  ExtractionResultSchema,
  INVOICE_NUMBER_RE,
  PAY_IN_3,
  PlanDiffSchema,
  PlanSchema,
  RawExtractionSchema,
  formatInvoiceNumber,
  isValidFdi,
  parsePhaseCustomId,
  phaseCustomId,
} from "@/contracts";
import {
  GOLDEN_BONE_GRAFT_DIFF,
  GOLDEN_BONE_GRAFT_EDIT,
  GOLDEN_EXTRACTION,
  GOLDEN_PLAN,
  GOLDEN_RAW_EXTRACTION,
  GOLDEN_TOTAL_CENTS,
} from "@/contracts/fixtures/implantCase";
import { addDays } from "@/lib/dates";

describe("golden implant fixture", () => {
  it("validates against the contracts", () => {
    expect(RawExtractionSchema.parse(GOLDEN_RAW_EXTRACTION)).toBeTruthy();
    expect(ExtractionResultSchema.parse(GOLDEN_EXTRACTION)).toBeTruthy();
    expect(PlanSchema.parse(GOLDEN_PLAN)).toBeTruthy();
    expect(PlanDiffSchema.parse(GOLDEN_BONE_GRAFT_DIFF)).toBeTruthy();
  });

  it("bone-graft diff: +€450 on ph2 (still Pay in 3), ph3/ph4 +28 days on clinic days", () => {
    const [ph2, ph3, ph4] = GOLDEN_BONE_GRAFT_DIFF.phases;
    expect(GOLDEN_BONE_GRAFT_EDIT.kind === "ADD_LINE" && GOLDEN_BONE_GRAFT_EDIT.line.unitPriceCents).toBe(45_000);
    expect(ph2?.amountAfterCents).toBe(150_000 + 45_000);
    expect(ph2?.amountAfterCents).toBeLessThanOrEqual(PAY_IN_3.maxCents);
    const ph2End = GOLDEN_PLAN.phases[1]!.endDate;
    expect(ph3?.startAfter).toBe(addDays(ph2End, 112));
    expect(ph4?.startAfter).toBe(addDays(addDays(ph3!.startAfter, 1), 14));
    for (const p of [ph3, ph4]) expect([1, 2, 3, 4, 5]).toContain(new Date(`${p!.startAfter}T00:00:00Z`).getUTCDay());
    expect(GOLDEN_BONE_GRAFT_DIFF.totalDeltaCents).toBe(45_000);
  });

  it("Σ lines = printed total = Σ phases", () => {
    const lines = GOLDEN_EXTRACTION.lines.reduce((a, l) => a + l.totalCents, 0);
    const phases = GOLDEN_PLAN.phases.reduce((a, p) => a + p.amountCents, 0);
    expect(lines).toBe(GOLDEN_TOTAL_CENTS);
    expect(phases).toBe(GOLDEN_TOTAL_CENTS);
    for (const l of GOLDEN_EXTRACTION.lines) expect(l.totalCents).toBe(l.qty * l.unitPriceCents);
  });

  it("each phase amount equals its lines and fits Pay in 3, even after the bone graft", () => {
    const byId = new Map(GOLDEN_PLAN.lines.map((l) => [l.id, l]));
    for (const p of GOLDEN_PLAN.phases) {
      const sum = p.lineIds.reduce((a, id) => a + (byId.get(id)?.totalCents ?? NaN), 0);
      expect(sum).toBe(p.amountCents);
      expect(p.amountCents).toBeGreaterThanOrEqual(PAY_IN_3.minCents);
      expect(p.amountCents).toBeLessThanOrEqual(PAY_IN_3.maxCents);
    }
    const ph2 = GOLDEN_PLAN.phases[1]!;
    if (GOLDEN_BONE_GRAFT_EDIT.kind !== "ADD_LINE") throw new Error("expected ADD_LINE");
    expect(ph2.amountCents + GOLDEN_BONE_GRAFT_EDIT.line.unitPriceCents).toBeLessThanOrEqual(PAY_IN_3.maxCents);
  });

  it("schedule respects every dependency's min lag and keeps due = start, end = start + duration", () => {
    const byId = new Map(GOLDEN_PLAN.phases.map((p) => [p.id, p]));
    for (const p of GOLDEN_PLAN.phases) {
      expect(p.endDate).toBe(addDays(p.startDate, p.durationDays));
      expect(p.payment.dueDate).toBe(p.startDate);
      for (const d of p.dependsOn) {
        const pred = byId.get(d.phaseId)!;
        expect(p.startDate >= addDays(pred.endDate, d.minLagDays)).toBe(true);
      }
    }
  });

  it("invoice numbers and custom ids follow the scheme", () => {
    const num = formatInvoiceNumber(GOLDEN_PLAN.id, 2, 1);
    expect(num).toBe("PPP-RIBE-F2-v1");
    expect(INVOICE_NUMBER_RE.test(num)).toBe(true);
    expect(num.length).toBeLessThanOrEqual(25);
    expect(parsePhaseCustomId(phaseCustomId(GOLDEN_PLAN.id, "ph2"))).toEqual({ planId: GOLDEN_PLAN.id, phaseId: "ph2" });
  });

  it("validates FDI numbers", () => {
    expect([11, 18, 36, 48, 51, 85].every(isValidFdi)).toBe(true);
    expect([10, 19, 49, 56, 90, 0].some(isValidFdi)).toBe(false);
  });
});
