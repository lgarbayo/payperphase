import { describe, expect, it } from "vitest";
import { ExtractionResultSchema, PlanSchema, PAY_IN_3, type Plan } from "@/contracts";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { normalizeExtraction } from "@/ai/extract";
import { addDays } from "@/lib/dates";
import { SAMPLE_PDFS, cachedExtractionBySampleId, cachedExtractionBySha, seedCases } from "@data/seed";
import { ALIGNER_RAW_EXTRACTION } from "@data/seed/alignerCase";
import { PERIO_RAW_EXTRACTION } from "@data/seed/perioCase";
import { GOLDEN_RAW_EXTRACTION } from "@/contracts/fixtures/implantCase";

const cases = seedCases();
const byKey = (k: string) => cases.find((c) => c.key === k)!;

describe("seedCases()", () => {
  it("exposes hero + aligner + perio, exactly one hero, keys equal sample ids", () => {
    expect(cases.map((c) => c.key)).toEqual(["implant-ribera", "aligner-ribera", "perio-ribera"]);
    expect(cases.filter((c) => c.hero).map((c) => c.key)).toEqual(["implant-ribera"]);
    expect(SAMPLE_PDFS.map((s) => s.id)).toEqual(cases.map((c) => c.key));
    expect(new Set(cases.map((c) => c.plan.id)).size).toBe(cases.length);
    for (const c of cases) expect(c.samplePdf).toBe(SAMPLE_PDFS.find((s) => s.id === c.key)!.path);
  });

  it("returns fresh copies on every call (the store mutates them)", () => {
    const a = seedCases();
    a[0]!.plan.phases[0]!.amountCents = 1;
    expect(seedCases()[0]!.plan.phases[0]!.amountCents).toBe(36_000);
  });

  for (const c of cases) {
    describe(c.key, () => {
      it("has a valid, approved plan and a valid extraction carrying the real PDF sha256", () => {
        expect(PlanSchema.parse(c.plan)).toBeTruthy();
        expect(ExtractionResultSchema.parse(c.extraction)).toBeTruthy();
        expect(c.plan.status).toBe("approved");
        expect(c.plan.caseKind).toBe(c.caseKind);
        expect(c.plan.baseline?.phases).toHaveLength(c.plan.phases.length);
        expect(c.extraction.pdfSha256).toBe(SAMPLE_PDFS.find((s) => s.id === c.key)!.sha256);
        expect(c.plan.quoteId).toBe(c.extraction.quoteId);
      });

      it("keeps money exact: Σ phases = Σ lines = total = printed total", () => {
        const sumPhases = c.plan.phases.reduce((a, p) => a + p.amountCents, 0);
        const sumLines = c.plan.lines.reduce((a, l) => a + l.totalCents, 0);
        expect(sumPhases).toBe(sumLines);
        expect(sumLines).toBe(c.plan.totalCents);
        expect(c.extraction.totalCents).toBe(c.plan.totalCents);
        expect(c.extraction.checks.printedTotalCents).toBe(c.plan.totalCents);
      });

      it("respects every minimum lag and keeps visits on the calendar in order", () => {
        const phases = new Map(c.plan.phases.map((p) => [p.id, p]));
        for (const p of c.plan.phases) {
          for (const d of p.dependsOn) {
            const pred = phases.get(d.phaseId)!;
            expect(p.startDate >= addDays(pred.endDate, d.minLagDays)).toBe(true);
            if (d.maxLagDays !== undefined) expect(p.startDate <= addDays(pred.endDate, d.maxLagDays)).toBe(true);
          }
        }
      });

      it("has the engine's payment statuses on the seed clock (first visit due, nothing paid)", () => {
        expect(c.plan.phases[0]!.payment.status).toBe("due");
        expect(c.plan.phases.slice(1).every((p) => p.payment.status === "scheduled")).toBe(true);
        expect(c.plan.phases.every((p) => p.delivery.status === "pending")).toBe(true);
      });

      it("approves only notes its phases reference (plus the referral note)", () => {
        const referenced = new Set(c.plan.phases.flatMap((p) => p.noteIds));
        for (const a of c.plan.approvedNotes) {
          expect(referenced.has(a.noteId) || a.noteId === "REFERRAL_ASK_CLINIC").toBe(true);
        }
        for (const id of referenced) expect(c.plan.approvedNotes.some((a) => a.noteId === id)).toBe(true);
      });
    });
  }

  it("hero plan equals GOLDEN_PLAN except for re-id and timestamps", () => {
    const strip = (p: Plan) => {
      const { id, createdAt, updatedAt, approvedAt, baseline, approvedNotes, ...rest } = p;
      void id; void createdAt; void updatedAt; void approvedAt;
      return {
        ...rest,
        baseline: baseline && { ...baseline, capturedAt: "" },
        approvedNotes: approvedNotes.map((n) => ({ ...n, approvedAt: "" })),
      };
    };
    expect(strip(byKey("implant-ribera").plan)).toEqual(strip(GOLDEN_PLAN));
    // The seed also keeps the golden id and timestamps, so it is exactly the golden plan.
    expect(byKey("implant-ribera").plan).toEqual(GOLDEN_PLAN);
  });

  it("the hero extraction equals the golden extraction apart from the real PDF sha256", () => {
    const hero = byKey("implant-ribera").extraction;
    expect({ ...hero, pdfSha256: "" }).toEqual({ ...cachedExtractionBySampleId("implant-ribera"), pdfSha256: "" });
    expect(hero.totalCents).toBe(407_000);
    expect(hero.lines).toHaveLength(12);
  });
});

describe("aligner case (Ortodoncia invisible)", () => {
  const { plan } = byKey("aligner-ribera");

  it("is records + 4 aligner batches + retainer for about €3.6k", () => {
    expect(byKey("aligner-ribera").caseKind).toBe("aligner");
    expect(plan.totalCents).toBe(360_000);
    expect(plan.lines.filter((l) => l.code === "ALIGNER_BATCH")).toHaveLength(4);
    expect(plan.lines.some((l) => l.code === "ORTHO_RECORDS")).toBe(true);
    expect(plan.lines.some((l) => l.code === "RETAINER")).toBe(true);
    expect(plan.clinic.name).toBe("Clínica Dental Ribera");
  });

  it("makes every aligner-batch milestone fit Pay in 3, with 42–84 day batch dependencies", () => {
    const batchPhases = plan.phases.filter((p) => p.kind === "ALIGNER_BATCH");
    expect(batchPhases).toHaveLength(3); // batch 1 shares the first visit with the records
    expect(plan.phases.map((p) => p.kind)).toEqual(["ORTHO_START", "ALIGNER_BATCH", "ALIGNER_BATCH", "ALIGNER_BATCH", "ORTHO_FINISH"]);
    for (const p of plan.phases) {
      expect(p.fit.band).toBe("PAY_IN_3");
      expect(p.amountCents).toBeGreaterThanOrEqual(PAY_IN_3.minCents);
      expect(p.amountCents).toBeLessThanOrEqual(PAY_IN_3.maxCents);
    }
    for (const p of plan.phases.slice(1)) {
      expect(p.dependsOn).toHaveLength(1);
      expect(p.dependsOn[0]!.minLagDays).toBe(42);
      expect(p.dependsOn[0]!.maxLagDays).toBe(84);
      expect(p.dependsOn[0]!.riskNoteId).toBe("ALIGNER_BATCH_MIN_6W");
      expect(p.dependsOn[0]!.deadlineNoteId).toBe("ALIGNER_BATCH_MAX_12W");
    }
    expect(plan.phases.at(-1)!.noteIds).toContain("RETENTION_AFTER_ORTHO");
  });
});

describe("perio case (cut #3)", () => {
  const { plan } = byKey("perio-ribera");

  it("flags the indivisible €2,200 sinus lift as INSTALLMENTS with its reason and note", () => {
    expect(byKey("perio-ribera").caseKind).toBe("perio");
    const big = plan.phases.filter((p) => p.amountCents > PAY_IN_3.maxCents);
    expect(big).toHaveLength(1);
    expect(big[0]!.amountCents).toBe(220_000);
    expect(big[0]!.lineIds).toHaveLength(1);
    expect(big[0]!.fit).toEqual({ band: "INSTALLMENTS", reason: "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX" });
    expect(big[0]!.noteIds).toContain("INSTALLMENTS_ONLY_REASON");
    expect(plan.approvedNotes.some((n) => n.noteId === "INSTALLMENTS_ONLY_REASON")).toBe(true);
    // Every other phase still fits Pay in 3.
    for (const p of plan.phases.filter((x) => x !== big[0])) expect(p.fit.band).toBe("PAY_IN_3");
  });

  it("starts with periodontal therapy before any implant surgery", () => {
    const kinds = plan.phases.map((p) => p.kind);
    expect(kinds[0]).toBe("PERIO_THERAPY");
    expect(kinds.indexOf("PERIO_THERAPY")).toBeLessThan(kinds.indexOf("IMPLANT_SURGERY"));
  });
});

describe("cached extraction helpers", () => {
  it("returns the golden extraction for each sample id and sha256, a clone each time", () => {
    for (const s of SAMPLE_PDFS) {
      const byId = cachedExtractionBySampleId(s.id)!;
      const bySha = cachedExtractionBySha(s.sha256)!;
      expect(byId).toBeTruthy();
      expect(bySha).toEqual(byId);
      expect(bySha).not.toBe(byId);
      expect(byId.pdfSha256).toBe(s.sha256);
    }
  });

  it("returns null for unknown or empty keys", () => {
    expect(cachedExtractionBySampleId("nope")).toBeNull();
    expect(cachedExtractionBySha("")).toBeNull();
    expect(cachedExtractionBySha("0".repeat(64))).toBeNull();
  });
});

describe("what the PDFs print parses back to the seed extractions (printed text → cents)", () => {
  for (const [key, raw] of [
    ["implant-ribera", GOLDEN_RAW_EXTRACTION],
    ["aligner-ribera", ALIGNER_RAW_EXTRACTION],
    ["perio-ribera", PERIO_RAW_EXTRACTION],
  ] as const) {
    it(key, () => {
      const seeded = byKey(key).extraction;
      const parsed = normalizeExtraction(raw, {
        quoteId: seeded.quoteId,
        pdfSha256: seeded.pdfSha256,
        source: "fixture",
        model: null,
        extractedAt: seeded.extractedAt,
      });
      expect(parsed.lines.map(({ id, lineNo, description, code, teeth, qty, unitPriceCents, totalCents }) => ({ id, lineNo, description, code, teeth, qty, unitPriceCents, totalCents }))).toEqual(
        seeded.lines.map(({ id, lineNo, description, code, teeth, qty, unitPriceCents, totalCents }) => ({ id, lineNo, description, code, teeth, qty, unitPriceCents, totalCents })),
      );
      expect(parsed.totalCents).toBe(seeded.totalCents);
      expect(parsed.checks.sumMatches).toBe(true);
    });
  }
});
