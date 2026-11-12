import { z } from "zod";
import { CentsSchema, FdiToothSchema, IsoDateSchema, IsoDateTimeSchema, LineIdSchema } from "./primitives";
import { ProcedureCategorySchema, ProcedureCodeSchema } from "./procedures";

/**
 * ---------- What the LLM returns (structured output) ----------
 * The model copies money and dates AS PRINTED TEXT. It never converts or sums them.
 * Keep this schema free of regex/min/max so it maps cleanly onto structured outputs.
 */
export const RawExtractedLineSchema = z.object({
  lineNo: z.number().int(),
  /** Line description exactly as printed. */
  description: z.string(),
  code: ProcedureCodeSchema,
  /** FDI numbers as printed; validated by code afterwards (may contain invalid numbers). */
  teeth: z.array(z.number().int()),
  quantityText: z.string(),
  unitPriceText: z.string(),
  lineTotalText: z.string(),
  /** Model's own confidence 0..1 for this line. */
  confidence: z.number(),
});
export type RawExtractedLine = z.infer<typeof RawExtractedLineSchema>;

export const RawExtractionSchema = z.object({
  clinicName: z.string(),
  patientName: z.string(),
  dentistName: z.string(),
  quoteRef: z.string(),
  quoteDateText: z.string(),
  lines: z.array(RawExtractedLineSchema),
  printedTotalText: z.string(),
});
export type RawExtraction = z.infer<typeof RawExtractionSchema>;

/** ---------- After deterministic parsing + validation (src/ai/extract) ---------- */
export const LineIssueSchema = z.enum([
  "INVALID_TOOTH",
  "LOW_CONFIDENCE",
  "QTY_PRICE_MISMATCH",
  "UNPARSEABLE_MONEY",
  "UNKNOWN_PROCEDURE",
]);
export type LineIssue = z.infer<typeof LineIssueSchema>;

export const QuoteLineSchema = z.object({
  id: LineIdSchema,
  lineNo: z.number().int().positive(),
  description: z.string(),
  code: ProcedureCodeSchema,
  category: ProcedureCategorySchema,
  /** Only valid FDI numbers; invalid ones are dropped and flagged in `issues`. */
  teeth: z.array(FdiToothSchema),
  qty: z.number().int().positive(),
  unitPriceCents: CentsSchema,
  totalCents: CentsSchema,
  confidence: z.number().min(0).max(1),
  issues: z.array(LineIssueSchema),
  source: z.enum(["extracted", "clinic_edit"]),
});
export type QuoteLine = z.infer<typeof QuoteLineSchema>;

export const ExtractionChecksSchema = z.object({
  sumOfLinesCents: CentsSchema,
  printedTotalCents: CentsSchema.nullable(),
  /** Σ lines === printed total. Drives the check bar "Σ lines = printed total ✓". */
  sumMatches: z.boolean(),
  invalidTeeth: z.array(z.object({ lineId: LineIdSchema, tooth: z.number().int() })),
  lowConfidenceLineIds: z.array(LineIdSchema),
  /** Lines with any issue; the clinic must look at these before approving. */
  toReviewLineIds: z.array(LineIdSchema),
});
export type ExtractionChecks = z.infer<typeof ExtractionChecksSchema>;

export const ExtractionSourceSchema = z.enum(["live", "cached", "fixture"]);
export type ExtractionSource = z.infer<typeof ExtractionSourceSchema>;

export const ExtractionResultSchema = z.object({
  quoteId: z.string().min(1),
  /** sha256 of the PDF bytes (hex). Cache key for the golden fallback. */
  pdfSha256: z.string(),
  clinicName: z.string(),
  dentistName: z.string(),
  /** Synthetic patient name as printed. */
  patientName: z.string(),
  quoteRef: z.string(),
  quoteDate: IsoDateSchema.nullable(),
  lines: z.array(QuoteLineSchema),
  totalCents: CentsSchema,
  checks: ExtractionChecksSchema,
  /** live = Claude call; cached = golden extraction keyed by sha (no key / timeout); fixture = tests. */
  source: ExtractionSourceSchema,
  model: z.string().nullable(),
  extractedAt: IsoDateTimeSchema,
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
