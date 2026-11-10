import { describe, expect, it } from "vitest";
import { PlanDiffSchema, PlanSchema, type PlanEdit } from "@/contracts";
import {
  GOLDEN_BONE_GRAFT_DIFF,
  GOLDEN_BONE_GRAFT_EDIT,
  GOLDEN_PLAN,
  goldenPlan,
} from "@/contracts/fixtures/implantCase";
import { applyEdit, diffPlans, EngineError } from "@/engine";
import { addDays } from "@/lib/dates";
import { paidAndDelivered, planOf } from "./helpers";

const NOW = "2026-11-18T10:00:00.000Z";

/** The golden bone-graft line added to another phase. */
function graftOn(phaseId: string): PlanEdit {
  if (GOLDEN_BONE_GRAFT_EDIT.kind !== "ADD_LINE") throw new Error("expected ADD_LINE");
  return { ...GOLDEN_BONE_GRAFT_EDIT, phaseId };
}

describe("applyEdit: the golden bone graft", () => {
  const after = applyEdit(GOLDEN_PLAN, GOLDEN_BONE_GRAFT_EDIT, NOW);

  it("makes ph2 €1,950, still within Pay in 3", () => {
    const ph2 = after.phases[1]!;
    expect(ph2.amountCents).toBe(195_000);
    expect(ph2.fit).toEqual({ band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" });
    expect(ph2.lineIds).toEqual(["L6", "E1"]);
    expect(after.totalCents).toBe(452_000);
    expect(after.phases.reduce((a, p) => a + p.amountCents, 0)).toBe(after.totalCents);
  });

  it("lengthens the ph2→ph3 min lag to 112 days (BONE_GRAFT_HEALING_16W) and moves ph3/ph4 later", () => {
    const [, ph2, ph3, ph4] = after.phases;
    expect(ph3!.dependsOn).toEqual([
      {
        phaseId: "ph2",
        minLagDays: 112,
        maxLagDays: 180,
        riskNoteId: "BONE_GRAFT_HEALING_16W",
        deadlineNoteId: "OSSEOINTEGRATION_MAX_6M",
      },
    ]);
    expect(ph3!.startDate).toBe(addDays(ph2!.endDate, 112));
    expect(ph3!.startDate).toBe("2027-05-05");
    expect(ph4!.startDate).toBe("2027-05-20");
    expect(ph3!.payment.dueDate).toBe("2027-05-05");
    expect(ph4!.payment.dueDate).toBe("2027-05-20");
    expect(ph3!.noteIds).toContain("BONE_GRAFT_HEALING_16W");
    expect(ph2!.startDate).toBe("2027-01-12");
  });

  it("bumps the version, stamps updatedAt, keeps the baseline and does not mutate the input", () => {
    expect(after.version).toBe(2);
    expect(after.updatedAt).toBe(NOW);
    expect(after.baseline).toEqual(GOLDEN_PLAN.baseline);
    expect(PlanSchema.parse(after)).toBeTruthy();
    expect(GOLDEN_PLAN.phases[1]!.amountCents).toBe(150_000);
    expect(GOLDEN_PLAN.lines).toHaveLength(12);
  });

  it("diffPlans(GOLDEN_PLAN, after) deep-equals GOLDEN_BONE_GRAFT_DIFF", () => {
    const diff = diffPlans(GOLDEN_PLAN, after);
    expect(PlanDiffSchema.parse(diff)).toBeTruthy();
    expect(diff).toEqual(GOLDEN_BONE_GRAFT_DIFF);
  });

  it("numbers further clinic lines E2, E3 … with increasing lineNo", () => {
    const again = applyEdit(after, graftOn("ph4"), NOW);
    const added = again.lines.at(-1)!;
    expect([added.id, added.lineNo, added.source]).toEqual(["E2", 14, "clinic_edit"]);
    expect(again.version).toBe(3);
  });
});

describe("applyEdit: other edits", () => {
  it("throws when editing a paid phase", () => {
    const paid = paidAndDelivered(goldenPlan(), "ph1", "2026-11-16");
    const add = graftOn("ph1");
    expect(() => applyEdit(paid, add, NOW)).toThrow(EngineError);
    expect(() => applyEdit(paid, add, NOW)).toThrow(/paid/);
    expect(() => applyEdit(paid, { kind: "SET_UNIT_PRICE", lineId: "L1", unitPriceCents: 1 }, NOW)).toThrow(EngineError);
    expect(() => applyEdit(paid, { kind: "REMOVE_LINE", lineId: "L5" }, NOW)).toThrow(EngineError);
  });

  it("throws when editing a delivered phase, an unknown phase or an unknown line", () => {
    const delivered = goldenPlan();
    delivered.phases[1]!.delivery = { status: "delivered", deliveredOn: "2027-01-12" };
    expect(() => applyEdit(delivered, GOLDEN_BONE_GRAFT_EDIT, NOW)).toThrow(/delivered/);
    expect(() => applyEdit(GOLDEN_PLAN, graftOn("ph9"), NOW)).toThrow(EngineError);
    expect(() => applyEdit(GOLDEN_PLAN, { kind: "REMOVE_LINE", lineId: "L99" }, NOW)).toThrow(EngineError);
  });

  it("SET_UNIT_PRICE re-sizes and re-fits the phase", () => {
    const out = applyEdit(GOLDEN_PLAN, { kind: "SET_UNIT_PRICE", lineId: "L9", unitPriceCents: 90_000 }, NOW);
    const ph4 = out.phases[3]!;
    expect(ph4.amountCents).toBe(169_000 + 2 * 18_000);
    expect(ph4.fit).toEqual({ band: "INSTALLMENTS", reason: "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX" });
    expect(ph4.noteIds).toContain("INSTALLMENTS_ONLY_REASON");
    expect(ph4.noteIds).not.toContain("PAY_IN_3_RANGE");
    expect(out.lines.find((l) => l.id === "L9")).toMatchObject({ unitPriceCents: 90_000, totalCents: 180_000 });
    expect(out.totalCents).toBe(407_000 + 36_000);
    const diff = diffPlans(GOLDEN_PLAN, out);
    expect(diff.phases).toHaveLength(1);
    expect(diff.phases[0]).toMatchObject({ phaseId: "ph4", deltaCents: 36_000, fitBefore: "PAY_IN_3", fitAfter: "INSTALLMENTS" });
  });

  it("REMOVE_LINE shrinks the phase; removing the extraction shortens no booked visit", () => {
    const out = applyEdit(GOLDEN_PLAN, { kind: "REMOVE_LINE", lineId: "L4" }, NOW);
    const [ph1, ph2] = out.phases;
    expect(ph1!.amountCents).toBe(36_000 - 11_000);
    expect(ph1!.lineIds).toEqual(["L1", "L2", "L3", "L5"]);
    expect(ph1!.teeth).toEqual([37]);
    expect(ph1!.noteIds).not.toContain("AFTERCARE_EXTRACTION");
    // No extraction → only a 1-week minimum, but successors never move earlier on their own.
    expect(ph2!.dependsOn[0]).toEqual({ phaseId: "ph1", minLagDays: 7, riskNoteId: "SPLIT_VISITS_MIN_1W" });
    expect(ph2!.startDate).toBe("2027-01-12");
    const diff = diffPlans(GOLDEN_PLAN, out);
    expect(diff.phases).toHaveLength(1);
    expect(diff.phases[0]!.removedLines.map((l) => l.id)).toEqual(["L4"]);
    expect(diff.totalDeltaCents).toBe(-11_000);
  });

  it("refuses to empty a phase and to edit a line split across visits", () => {
    expect(() => applyEdit(GOLDEN_PLAN, { kind: "REMOVE_LINE", lineId: "L6" }, NOW)).toThrow(/without treatment/);
    const split = planOf([{ code: "IMPLANT", qty: 4, unitPriceCents: 75_000, teeth: [36, 37, 46, 47] }]);
    expect(split.phases).toHaveLength(2);
    expect(() => applyEdit(split, { kind: "SET_UNIT_PRICE", lineId: "L1", unitPriceCents: 70_000 }, NOW)).toThrow(
      /split/,
    );
  });
});

describe("diffPlans", () => {
  it("is empty for identical plans", () => {
    const diff = diffPlans(GOLDEN_PLAN, goldenPlan());
    expect(diff.phases).toEqual([]);
    expect(diff.totalDeltaCents).toBe(0);
  });
});
