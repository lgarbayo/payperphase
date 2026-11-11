import { describe, expect, it } from "vitest";
import { PERMANENT_TEETH } from "@/contracts";
import { GOLDEN_LINES, GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { kindOfMark, marksFromLines, phaseBadgeText, summarizeTeeth } from "@/components/odontogram/marks";

const marks = marksFromLines(GOLDEN_LINES, GOLDEN_PLAN.phases);
const forTooth = (n: number) => marks.filter((m) => m.tooth === n);
const kinds = (n: number) => forTooth(n).map((m) => [kindOfMark(m), m.phaseN]);

describe("marksFromLines on the golden case", () => {
  it("tooth 36: extraction (phase 1), implant (phase 2), crown (phase 4)", () => {
    const k = kinds(36);
    expect(k).toContainEqual(["extraction", 1]);
    expect(k).toContainEqual(["implant", 2]);
    expect(k).toContainEqual(["crown", 4]);
    expect(forTooth(36).find((m) => m.code === "EXTRACTION")?.state).toBe("extract");
  });

  it("tooth 37: a filling in phase 1", () => {
    expect(kinds(37)).toEqual([["filling", 1]]);
    expect(forTooth(37)[0]).toMatchObject({ category: "RESTORATIVE", state: "planned" });
  });

  it("tooth 46: implant and crown, no extraction", () => {
    const k = kinds(46);
    expect(k).toContainEqual(["implant", 2]);
    expect(k).toContainEqual(["crown", 4]);
    expect(k.map(([kind]) => kind)).not.toContain("extraction");
  });

  it("only teeth 36, 37 and 46 get marks; lines without teeth produce none", () => {
    expect([...new Set(marks.map((m) => m.tooth))].sort()).toEqual([36, 37, 46]);
    const toothless = GOLDEN_LINES.filter((l) => l.teeth.length === 0);
    expect(toothless.length).toBeGreaterThan(0);
    expect(marksFromLines(toothless, GOLDEN_PLAN.phases)).toEqual([]);
  });

  it("works without phases (WP-07 reveals lines before the plan exists)", () => {
    const bare = marksFromLines(GOLDEN_LINES);
    expect(bare.length).toBe(marks.length);
    expect(bare.every((m) => m.phaseN === undefined)).toBe(true);
  });

  it("a delivered phase marks its teeth done; a delivered extraction leaves the tooth missing", () => {
    const delivered = GOLDEN_PLAN.phases.map((p) =>
      p.n === 1 ? { ...p, delivery: { status: "delivered" as const, deliveredOn: "2026-11-16" } } : p,
    );
    const m = marksFromLines(GOLDEN_LINES, delivered);
    expect(m.find((x) => x.tooth === 36 && x.code === "EXTRACTION")?.state).toBe("missing");
    expect(m.find((x) => x.tooth === 37)?.state).toBe("done");
    expect(m.find((x) => x.tooth === 36 && x.code === "IMPLANT")?.state).toBe("planned");
  });

  it("only ever marks valid permanent or primary teeth", () => {
    for (const m of marks) expect(PERMANENT_TEETH).toContain(m.tooth);
  });
});

describe("summarizeTeeth", () => {
  const s = summarizeTeeth(marks);

  it("orders a tooth's kinds by phase and lists distinct phases", () => {
    const t36 = s.get(36)!;
    expect(t36.entries.map((e) => e.kind)).toEqual(["extraction", "implant", "abutment", "crown"]);
    expect(t36.phases).toEqual([1, 2, 3, 4]);
    expect([t36.missing, t36.extractionPending]).toEqual([false, false]); // the implant replaces the tooth
  });

  it("an extraction with nothing planned after it is pending (cross), then missing (hatch) once delivered", () => {
    const base = { tooth: 18, category: "SURGICAL" as const, phaseN: 1, code: "EXTRACTION" as const };
    const planned = summarizeTeeth([{ ...base, state: "extract" }]).get(18)!;
    expect([planned.extractionPending, planned.missing]).toEqual([true, false]);
    const delivered = summarizeTeeth([{ ...base, state: "missing" }]).get(18)!;
    expect([delivered.extractionPending, delivered.missing]).toEqual([false, true]);
  });

  it("derives a kind from the category when a hand-built mark has no code", () => {
    expect(kindOfMark({ category: "IMPLANT", state: "planned" })).toBe("implant");
    expect(kindOfMark({ category: "SURGICAL", state: "extract" })).toBe("extraction");
  });
});

describe("phaseBadgeText", () => {
  it("shows up to three phases, then a range", () => {
    expect(phaseBadgeText([])).toBe("");
    expect(phaseBadgeText([1])).toBe("1");
    expect(phaseBadgeText([1, 2, 4])).toBe("1·2·4");
    expect(phaseBadgeText([1, 2, 3, 4, 5])).toBe("1–5");
  });
});
