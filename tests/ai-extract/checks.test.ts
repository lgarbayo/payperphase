import { describe, expect, it } from "vitest";
import type { RawExtraction } from "@/contracts";
import { GOLDEN_RAW_EXTRACTION } from "@/contracts/fixtures/implantCase";
import { normalizeExtraction, type NormalizeMeta } from "@/ai/extract";

const META: NormalizeMeta = {
  quoteId: "q_test",
  pdfSha256: "",
  source: "fixture",
  model: null,
  extractedAt: "2026-11-16T09:00:00.000Z",
};
const raw = (): RawExtraction => structuredClone(GOLDEN_RAW_EXTRACTION);
const run = (r: RawExtraction) => normalizeExtraction(r, META);

describe("deterministic checks", () => {
  it("drops tooth 19 and flags INVALID_TOOTH", () => {
    const r = raw();
    r.lines[3]!.teeth = [36, 19];
    const res = run(r);
    const l4 = res.lines.find((l) => l.id === "L4")!;
    expect(l4.teeth).toEqual([36]);
    expect(l4.issues).toContain("INVALID_TOOTH");
    expect(res.checks.invalidTeeth).toEqual([{ lineId: "L4", tooth: 19 }]);
    expect(res.checks.toReviewLineIds).toEqual(["L4", "L12"]);
  });

  it("accepts primary teeth (55) and rejects 0, 9, 59, 86", () => {
    const r = raw();
    r.lines[4]!.teeth = [55, 0, 9, 59, 86];
    const res = run(r);
    expect(res.lines[4]!.teeth).toEqual([55]);
    expect(res.checks.invalidTeeth.map((x) => x.tooth)).toEqual([0, 9, 59, 86]);
  });

  it("a changed printed total sets sumMatches:false", () => {
    const r = raw();
    r.printedTotalText = "4.170,00 €";
    const res = run(r);
    expect(res.checks.sumOfLinesCents).toBe(407_000);
    expect(res.checks.printedTotalCents).toBe(417_000);
    expect(res.checks.sumMatches).toBe(false);
  });

  it("an unreadable printed total gives printedTotalCents:null and sumMatches:false", () => {
    const r = raw();
    r.printedTotalText = "";
    const res = run(r);
    expect(res.checks.printedTotalCents).toBeNull();
    expect(res.checks.sumMatches).toBe(false);
  });

  it("qty × unit ≠ total gives QTY_PRICE_MISMATCH and keeps the printed total", () => {
    const r = raw();
    r.lines[5]!.lineTotalText = "1.400,00 €"; // 2 × 750,00 € = 1.500,00 €
    const res = run(r);
    const l6 = res.lines.find((l) => l.id === "L6")!;
    expect(l6.issues).toContain("QTY_PRICE_MISMATCH");
    expect(l6.qty).toBe(2);
    expect(l6.unitPriceCents).toBe(75_000);
    expect(l6.totalCents).toBe(140_000);
    expect(res.checks.sumOfLinesCents).toBe(397_000);
    expect(res.checks.sumMatches).toBe(false);
    expect(res.checks.toReviewLineIds).toContain("L6");
  });

  it("unreadable money is flagged UNPARSEABLE_MONEY", () => {
    const r = raw();
    r.lines[0]!.unitPriceText = "cuarenta";
    r.lines[0]!.lineTotalText = "1.25.0";
    const l1 = run(r).lines[0]!;
    expect(l1.issues).toContain("UNPARSEABLE_MONEY");
    expect(l1.totalCents).toBe(0);
  });

  it("derives a blank unit price or quantity when that is exact", () => {
    const r = raw();
    r.lines[5]!.unitPriceText = "";
    r.lines[6]!.quantityText = "";
    const res = run(r);
    expect(res.lines[5]).toMatchObject({ qty: 2, unitPriceCents: 75_000, totalCents: 150_000, issues: [] });
    expect(res.lines[6]).toMatchObject({ qty: 2, unitPriceCents: 22_000, totalCents: 44_000, issues: [] });
  });

  it("OTHER and off-list codes become OTHER with UNKNOWN_PROCEDURE", () => {
    const r = raw();
    r.lines[9]!.code = "OTHER";
    (r.lines[10] as { code: string }).code = "MYSTERY";
    const res = run(r);
    expect(res.lines[9]).toMatchObject({ code: "OTHER", category: "OTHER", issues: ["UNKNOWN_PROCEDURE"] });
    expect(res.lines[10]).toMatchObject({ code: "OTHER", issues: ["UNKNOWN_PROCEDURE"] });
  });

  it('"12/11/2026" parses to 2026-11-12; an unreadable date is null', () => {
    expect(run(raw()).quoteDate).toBe("2026-11-12");
    const r = raw();
    r.quoteDateText = "pronto";
    expect(run(r).quoteDate).toBeNull();
  });

  it("renumbers lines when the printed numbers are unusable", () => {
    const r = raw();
    r.lines[1]!.lineNo = 1; // duplicate
    const res = run(r);
    expect(res.lines.map((l) => l.id)).toEqual(r.lines.map((_, i) => `L${i + 1}`));
  });
});
