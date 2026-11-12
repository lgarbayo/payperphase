import { describe, expect, it } from "vitest";
import { PlanSchema } from "@/contracts";
import { buildPlan, fitFor } from "@/engine";
import { addDays, weekday } from "@/lib/dates";
import { extractionOf, goldenInput, planOf } from "./helpers";

describe("fitFor", () => {
  it("maps amounts to Pay in 3, installments or PayPal only", () => {
    expect(fitFor(1_999)).toEqual({ band: "PAYPAL_ONLY", reason: "BELOW_PAY_IN_3_MIN" });
    expect(fitFor(2_000)).toEqual({ band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" });
    expect(fitFor(200_000)).toEqual({ band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" });
    expect(fitFor(200_001)).toEqual({ band: "INSTALLMENTS", reason: "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX" });
    expect(fitFor(500_000)).toEqual({ band: "INSTALLMENTS", reason: "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX" });
    expect(fitFor(500_001)).toEqual({ band: "PAYPAL_ONLY", reason: "OVER_INSTALLMENTS_MAX" });
  });

  it("never calls a phase of several items indivisible", () => {
    expect(fitFor(200_000, { singleUnit: false })).toEqual({ band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" });
    expect(fitFor(200_001, { singleUnit: false })).toEqual({ band: "PAYPAL_ONLY", reason: "OVER_PAY_IN_3_MAX" });
    expect(fitFor(500_000, { singleUnit: false })).toEqual({ band: "PAYPAL_ONLY", reason: "OVER_PAY_IN_3_MAX" });
    expect(fitFor(500_001, { singleUnit: false })).toEqual({ band: "PAYPAL_ONLY", reason: "OVER_INSTALLMENTS_MAX" });
  });
});

describe("indivisible single items over €2,000", () => {
  it("≤ €5,000 → INSTALLMENTS with INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX and INSTALLMENTS_ONLY_REASON", () => {
    const plan = planOf([
      { code: "EXAM", qty: 1, unitPriceCents: 5_000 },
      { code: "IMPLANT", qty: 1, unitPriceCents: 120_000, teeth: [36] },
      { code: "IMPLANT_CROWN", qty: 1, unitPriceCents: 240_000, teeth: [36], description: "Corona cerámica premium" },
    ]);
    expect(PlanSchema.parse(plan)).toBeTruthy();
    const crown = plan.phases.find((p) => p.kind === "PROSTHETIC")!;
    expect(crown.amountCents).toBe(240_000);
    expect(crown.fit).toEqual({ band: "INSTALLMENTS", reason: "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX" });
    expect(crown.noteIds).toContain("INSTALLMENTS_ONLY_REASON");
    expect(crown.noteIds).not.toContain("PAY_IN_3_RANGE");
    expect(crown.title.es).not.toMatch(/\(1\//); // a single unit is never "split"
  });

  it("> €5,000 → PAYPAL_ONLY with OVER_INSTALLMENTS_MAX", () => {
    const plan = planOf([{ code: "OTHER", qty: 1, unitPriceCents: 650_000, description: "Prótesis completa sobre implantes" }]);
    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0]!.fit).toEqual({ band: "PAYPAL_ONLY", reason: "OVER_INSTALLMENTS_MAX" });
    expect(plan.phases[0]!.noteIds).not.toContain("INSTALLMENTS_ONLY_REASON");
  });

  it("an indivisible line with qty > 1 stays whole", () => {
    const plan = planOf([{ code: "NIGHT_GUARD", qty: 2, unitPriceCents: 110_000 }]);
    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0]!.amountCents).toBe(220_000);
    expect(plan.phases[0]!.fit.band).toBe("INSTALLMENTS");
  });
});

describe("divisible phases over €2,000 are split into visits", () => {
  const plan = planOf([
    { code: "EXAM", qty: 1, unitPriceCents: 4_000 },
    { code: "IMPLANT", qty: 4, unitPriceCents: 75_000, teeth: [36, 37, 46, 47] },
    { code: "IMPLANT_CROWN", qty: 4, unitPriceCents: 40_000, teeth: [36, 37, 46, 47] },
  ]);

  it("4 implants (€3,000) → '(1/2)' and '(2/2)' linked by 7 days and SPLIT_VISITS_MIN_1W", () => {
    expect(PlanSchema.parse(plan)).toBeTruthy();
    const surgery = plan.phases.filter((p) => p.kind === "IMPLANT_SURGERY");
    expect(surgery).toHaveLength(2);
    const [a, b] = surgery as [(typeof surgery)[0], (typeof surgery)[0]];
    expect(a.title).toEqual({ es: "Colocación de implantes (1/2)", en: "Implant placement (1/2)" });
    expect(b.title).toEqual({ es: "Colocación de implantes (2/2)", en: "Implant placement (2/2)" });
    expect([a.amountCents, b.amountCents]).toEqual([150_000, 150_000]);
    expect([a.teeth, b.teeth]).toEqual([
      [36, 37],
      [46, 47],
    ]);
    expect(a.lineIds).toEqual(["L2"]);
    expect(b.lineIds).toEqual(["L2"]);
    expect(b.dependsOn).toEqual([{ phaseId: a.id, minLagDays: 7, riskNoteId: "SPLIT_VISITS_MIN_1W" }]);
    expect(b.startDate).toBe(addDays(a.endDate, 7));
    expect(b.noteIds).toContain("SPLIT_VISITS_MIN_1W");
    expect([a, b].every((p) => p.fit.band === "PAY_IN_3")).toBe(true);
  });

  it("the next stage waits the healing lag after the LAST split visit", () => {
    const impressionsOrCrowns = plan.phases.find((p) => p.kind === "PROSTHETIC")!;
    const lastSurgery = plan.phases.filter((p) => p.kind === "IMPLANT_SURGERY").at(-1)!;
    expect(impressionsOrCrowns.dependsOn[0]).toMatchObject({ phaseId: lastSurgery.id, minLagDays: 84 });
  });

  it("€1,600 of crowns stays one visit; Σ phases = Σ lines = total", () => {
    expect(plan.phases.filter((p) => p.kind === "PROSTHETIC")).toHaveLength(1);
    const sum = plan.phases.reduce((a, p) => a + p.amountCents, 0);
    expect(sum).toBe(plan.totalCents);
    expect(plan.totalCents).toBe(4_000 + 300_000 + 160_000);
    expect(plan.phases.map((p) => p.id)).toEqual(["ph1", "ph2", "ph3", "ph4"]);
  });

  it("3 implants split 2 + 1 (whole units, never fractions)", () => {
    const p = planOf([{ code: "IMPLANT", qty: 3, unitPriceCents: 75_000, teeth: [36, 37, 46] }]);
    expect(p.phases.map((x) => x.amountCents)).toEqual([150_000, 75_000]);
    expect(p.phases.map((x) => x.title.en)).toEqual(["Implant placement (1/2)", "Implant placement (2/2)"]);
  });

  it("a line whose total is not qty × unit price is never split (money stays exact)", () => {
    const extraction = extractionOf([{ code: "IMPLANT", qty: 4, unitPriceCents: 75_000, teeth: [36, 37, 46, 47] }]);
    extraction.lines[0]!.totalCents = 290_000; // printed discount, flagged QTY_PRICE_MISMATCH upstream
    const p = buildPlan(goldenInput({ extraction }));
    expect(p.phases).toHaveLength(1);
    expect(p.phases[0]!.amountCents).toBe(290_000);
    expect(p.phases[0]!.fit.band).toBe("INSTALLMENTS");
    expect(p.totalCents).toBe(290_000);
  });
});

describe("case kinds", () => {
  it("aligner: records + first batch, one milestone per further batch (42/84), then retention", () => {
    const plan = planOf(
      [
        { code: "ORTHO_RECORDS", qty: 1, unitPriceCents: 30_000 },
        { code: "ALIGNER_BATCH", qty: 4, unitPriceCents: 75_000 },
        { code: "RETAINER", qty: 1, unitPriceCents: 30_000 },
      ],
      "aligner",
    );
    expect(PlanSchema.parse(plan)).toBeTruthy();
    expect(plan.phases.map((p) => [p.kind, p.amountCents, p.title.en])).toEqual([
      ["ORTHO_START", 105_000, "Orthodontics start"],
      ["ALIGNER_BATCH", 75_000, "Aligners, batch 2"],
      ["ALIGNER_BATCH", 75_000, "Aligners, batch 3"],
      ["ALIGNER_BATCH", 75_000, "Aligners, batch 4"],
      ["ORTHO_FINISH", 30_000, "Orthodontics finish and retention"],
    ]);
    for (const p of plan.phases.slice(1)) {
      expect(p.dependsOn[0]).toMatchObject({
        minLagDays: 42,
        maxLagDays: 84,
        riskNoteId: "ALIGNER_BATCH_MIN_6W",
        deadlineNoteId: "ALIGNER_BATCH_MAX_12W",
      });
    }
    expect(plan.phases.at(-1)!.noteIds).toContain("RETENTION_AFTER_ORTHO");
    expect(plan.phases.every((p) => p.fit.band === "PAY_IN_3")).toBe(true);
    expect(plan.phases.reduce((a, p) => a + p.amountCents, 0)).toBe(360_000);
  });

  it("perio: therapy → re-evaluation (≥6 weeks) → implant stages (PERIO_BEFORE_IMPLANT)", () => {
    const plan = planOf(
      [
        { code: "EXAM", qty: 1, unitPriceCents: 5_000 },
        { code: "SCALING_ROOT_PLANING", qty: 4, unitPriceCents: 12_000 },
        { code: "PERIO_MAINTENANCE", qty: 1, unitPriceCents: 8_000 },
        { code: "EXTRACTION", qty: 1, unitPriceCents: 11_000, teeth: [46] },
        { code: "IMPLANT", qty: 1, unitPriceCents: 90_000, teeth: [46] },
        { code: "IMPLANT_CROWN", qty: 1, unitPriceCents: 80_000, teeth: [46] },
      ],
      "perio",
    );
    expect(plan.phases.map((p) => p.kind)).toEqual([
      "PERIO_THERAPY",
      "PERIO_REEVALUATION",
      "PREP",
      "IMPLANT_SURGERY",
      "PROSTHETIC",
    ]);
    expect(plan.phases[1]!.dependsOn[0]).toMatchObject({ minLagDays: 42, riskNoteId: "PERIO_REEVAL_MIN_6W" });
    expect(plan.phases[2]!.dependsOn[0]).toMatchObject({ riskNoteId: "PERIO_BEFORE_IMPLANT" });
    expect(plan.phases[3]!.dependsOn[0]).toMatchObject({ minLagDays: 56, riskNoteId: "HEALING_EXTRACTION_MIN_8W" });
    expect(plan.phases[4]!.dependsOn[0]).toMatchObject({ minLagDays: 84, riskNoteId: "OSSEOINTEGRATION_MIN_12W" });
    expect(plan.phases[3]!.title).toEqual({ es: "Colocación del implante", en: "Implant placement" });
  });

  it("PREP without an extraction needs only a week before surgery; a graft needs 16 weeks after", () => {
    const plan = planOf([
      { code: "EXAM", qty: 1, unitPriceCents: 4_000 },
      { code: "IMPLANT", qty: 1, unitPriceCents: 80_000, teeth: [26] },
      { code: "SINUS_LIFT", qty: 1, unitPriceCents: 60_000, teeth: [26] },
      { code: "IMPLANT_CROWN", qty: 1, unitPriceCents: 70_000, teeth: [26] },
    ]);
    expect(plan.phases[1]!.dependsOn[0]).toEqual({ phaseId: "ph1", minLagDays: 7, riskNoteId: "SPLIT_VISITS_MIN_1W" });
    expect(plan.phases[1]!.title).toEqual({
      es: "Colocación del implante y elevación de seno",
      en: "Implant placement and sinus lift",
    });
    expect(plan.phases[2]!.dependsOn[0]).toMatchObject({ minLagDays: 112, riskNoteId: "BONE_GRAFT_HEALING_16W" });
    for (const p of plan.phases) expect([1, 2, 3, 4, 5]).toContain(weekday(p.startDate));
  });
});
