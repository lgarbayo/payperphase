import { describe, expect, it } from "vitest";
import { DiffExplanationSchema, type PlanDiff } from "@/contracts";
import { GOLDEN_BONE_GRAFT_DIFF, goldenPlan } from "@/contracts/fixtures/implantCase";
import { explainDiff } from "@/ai/wording";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("explainDiff(GOLDEN_BONE_GRAFT_DIFF)", () => {
  it("renders the ES/EN sentence", async () => {
    const ex = await explainDiff(GOLDEN_BONE_GRAFT_DIFF, goldenPlan());
    expect(DiffExplanationSchema.safeParse(ex).success).toBe(true);
    expect(nbsp(ex.rendered.es)).toBe("Fase 2: +450,00 €, sigue dentro del rango de Paga en 3 · fases 3–4 se mueven 4 semanas");
    expect(ex.rendered.en).toBe("Phase 2: +€450.00, still within the Pay in 3 range · phases 3–4 move 4 weeks later");
    expect(ex.template.es).toBe(
      "Fase {{phaseN}}: +{{amount}}, sigue dentro del rango de Paga en 3 · fases {{phases}} se mueven {{count}} semanas",
    );
  });

  it("every number in it comes from the diff", async () => {
    const d = GOLDEN_BONE_GRAFT_DIFF;
    const ex = await explainDiff(d, goldenPlan());
    const fromDiff = new Set<string>([
      ...d.phases.map((p) => String(p.n)),
      "450,00",
      "450.00", // |ph2 delta| = 45 000 cents
      "4", // (2027-05-05 − 2027-04-07) / 7
    ]);
    for (const text of [ex.rendered.es, ex.rendered.en]) {
      const withoutProductName = text.replace(/Paga en 3|Pay in 3/g, "");
      for (const n of withoutProductName.match(/\d[\d.,]*\d|\d/g) ?? []) expect(fromDiff).toContain(n);
    }
  });

  it("follows the diff when it changes (different delta, earlier move, fit change, odd days)", async () => {
    const d: PlanDiff = structuredClone(GOLDEN_BONE_GRAFT_DIFF);
    d.phases[0] = { ...d.phases[0]!, deltaCents: -12_000, amountAfterCents: 138_000, fitAfter: "PAY_IN_3" };
    d.phases[1] = { ...d.phases[1]!, startAfter: "2027-03-24" }; // 2 weeks earlier
    d.phases[2] = { ...d.phases[2]!, startAfter: "2027-04-25", deltaCents: 40_000, amountAfterCents: 209_000, fitAfter: "INSTALLMENTS" }; // +3 days
    const ex = await explainDiff(d, goldenPlan());
    expect(nbsp(ex.rendered.es)).toBe(
      "Fase 2: −120,00 €, sigue dentro del rango de Paga en 3 · Fase 4: +400,00 €, sale del rango de Paga en 3: pasa a Pagos mensuales · fase 3 se adelanta 2 semanas · fase 4 se mueve 3 días",
    );
    expect(ex.rendered.en).toBe(
      "Phase 2: −€120.00, still within the Pay in 3 range · Phase 4: +€400.00, leaves the Pay in 3 range: moves to Pay Monthly · phase 3 moves 2 weeks earlier · phase 4 moves 3 days later",
    );
  });

  it("an empty diff says nothing changed", async () => {
    const d: PlanDiff = { ...GOLDEN_BONE_GRAFT_DIFF, phases: [] };
    const ex = await explainDiff(d, goldenPlan());
    expect(ex.rendered.es).toBe("Sin cambios en importes ni fechas");
  });
});
