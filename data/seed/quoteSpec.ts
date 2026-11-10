/**
 * OWNED BY WP-02. Builds a synthetic quote once and derives BOTH what the PDF prints (RawExtraction,
 * printed text) and the post-parse ExtractionResult the engine consumes, so the two can never drift.
 * Pure: no I/O, no clock.
 */
import {
  PROCEDURE_CATEGORY,
  type ExtractionResult,
  type ProcedureCode,
  type QuoteLine,
  type RawExtraction,
} from "@/contracts";

export interface QuoteLineSpec {
  description: string;
  code: ProcedureCode;
  teeth: number[];
  qty: number;
  unitPriceCents: number;
  confidence: number;
}

export interface QuoteSpec {
  quoteId: string;
  clinicName: string;
  dentistName: string;
  patientName: string;
  quoteRef: string;
  /** Printed date, es-ES "dd/mm/yyyy". */
  quoteDateText: string;
  /** Same date as an IsoDate. */
  quoteDate: string;
  lines: QuoteLineSpec[];
  /** ISO timestamp for `extractedAt`. */
  extractedAt: string;
}

/** Spanish money as printed on a quote: "1.500,00 €" (no ICU dependency, so it is stable everywhere). */
export function fmtEuroEs(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${euros},${String(abs % 100).padStart(2, "0")} €`;
}

export function totalOf(spec: QuoteSpec): number {
  return spec.lines.reduce((a, l) => a + l.qty * l.unitPriceCents, 0);
}

export function rawOf(spec: QuoteSpec): RawExtraction {
  return {
    clinicName: spec.clinicName,
    patientName: spec.patientName,
    dentistName: spec.dentistName,
    quoteRef: spec.quoteRef,
    quoteDateText: spec.quoteDateText,
    printedTotalText: fmtEuroEs(totalOf(spec)),
    lines: spec.lines.map((l, i) => ({
      lineNo: i + 1,
      description: l.description,
      code: l.code,
      teeth: [...l.teeth],
      quantityText: String(l.qty),
      unitPriceText: fmtEuroEs(l.unitPriceCents),
      lineTotalText: fmtEuroEs(l.qty * l.unitPriceCents),
      confidence: l.confidence,
    })),
  };
}

export function extractionOf(spec: QuoteSpec, pdfSha256: string): ExtractionResult {
  const lines: QuoteLine[] = spec.lines.map((l, i) => ({
    id: `L${i + 1}`,
    lineNo: i + 1,
    description: l.description,
    code: l.code,
    category: PROCEDURE_CATEGORY[l.code],
    teeth: [...l.teeth],
    qty: l.qty,
    unitPriceCents: l.unitPriceCents,
    totalCents: l.qty * l.unitPriceCents,
    confidence: l.confidence,
    issues: [],
    source: "extracted",
  }));
  const total = totalOf(spec);
  return {
    quoteId: spec.quoteId,
    pdfSha256,
    clinicName: spec.clinicName,
    dentistName: spec.dentistName,
    patientName: spec.patientName,
    quoteRef: spec.quoteRef,
    quoteDate: spec.quoteDate,
    lines,
    totalCents: total,
    checks: {
      sumOfLinesCents: total,
      printedTotalCents: total,
      sumMatches: true,
      invalidTeeth: [],
      lowConfidenceLineIds: [],
      toReviewLineIds: [],
    },
    source: "fixture",
    model: null,
    extractedAt: spec.extractedAt,
  };
}
