import { describe, expect, it } from "vitest";
import { ExtractionResultSchema } from "@/contracts";
import { GOLDEN_EXTRACTION, GOLDEN_RAW_EXTRACTION } from "@/contracts/fixtures/implantCase";
import { normalizeExtraction, type NormalizeMeta } from "@/ai/extract";

const META: NormalizeMeta = {
  quoteId: GOLDEN_EXTRACTION.quoteId,
  pdfSha256: "abc123",
  source: "live",
  model: "claude-sonnet-5-5",
  extractedAt: "2026-11-16T09:00:00.000Z",
};

describe("normalizeExtraction(GOLDEN_RAW_EXTRACTION)", () => {
  const result = normalizeExtraction(GOLDEN_RAW_EXTRACTION, META);

  it("matches GOLDEN_EXTRACTION on lines, totals and checks", () => {
    const strip = ({ source, extractedAt, pdfSha256, model, ...rest }: typeof result) => {
      void source;
      void extractedAt;
      void pdfSha256;
      void model;
      return rest;
    };
    expect(strip(result)).toEqual(strip(GOLDEN_EXTRACTION));
    expect(result.lines).toEqual(GOLDEN_EXTRACTION.lines);
    expect(result.totalCents).toBe(407_000);
    expect(result.checks).toEqual(GOLDEN_EXTRACTION.checks);
  });

  it("flags L12 as LOW_CONFIDENCE (< 0.8) and nothing else", () => {
    const l12 = result.lines.find((l) => l.id === "L12")!;
    expect(l12.confidence).toBeLessThan(0.8);
    expect(l12.issues).toEqual(["LOW_CONFIDENCE"]);
    expect(result.checks.lowConfidenceLineIds).toEqual(["L12"]);
    expect(result.checks.toReviewLineIds).toEqual(["L12"]);
    expect(result.lines.filter((l) => l.issues.length > 0)).toHaveLength(1);
  });

  it("carries the meta through and satisfies the contract", () => {
    expect(result.source).toBe("live");
    expect(result.model).toBe("claude-sonnet-5-5");
    expect(result.pdfSha256).toBe("abc123");
    expect(result.extractedAt).toBe(META.extractedAt);
    expect(result.quoteDate).toBe("2026-11-12");
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("is pure: same input, same output, input untouched", () => {
    const before = structuredClone(GOLDEN_RAW_EXTRACTION);
    expect(normalizeExtraction(GOLDEN_RAW_EXTRACTION, META)).toEqual(result);
    expect(GOLDEN_RAW_EXTRACTION).toEqual(before);
  });
});
