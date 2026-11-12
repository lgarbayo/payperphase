/**
 * RawExtraction (what Claude read, as printed text) → ExtractionResult (cents, FDI-valid
 * teeth, per-line issues, Σ check). Pure and deterministic: same input, same output.
 */
import {
  ExtractionResultSchema,
  isValidFdi,
  LineIssueSchema,
  PROCEDURE_CATEGORY,
  ProcedureCodeSchema,
  type ExtractionResult,
  type ExtractionSource,
  type LineIssue,
  type QuoteLine,
  type RawExtractedLine,
  type RawExtraction,
} from "@/contracts";
import { parseQuantity, parseSpanishDate, parseSpanishMoney } from "./parse";

/** Lines the model is less sure about than this are flagged LOW_CONFIDENCE ("1 to review"). */
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

export interface NormalizeMeta {
  quoteId: string;
  pdfSha256: string;
  source: ExtractionSource;
  model: string | null;
  /** Wall-clock ISO timestamp (audit only). Passed in so this function stays pure. */
  extractedAt: string;
}

type InvalidTooth = ExtractionResult["checks"]["invalidTeeth"][number];

const ISSUE_ORDER = LineIssueSchema.options;
const isBlank = (s: string) => typeof s !== "string" || s.trim() === "";

interface LineMoney {
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  issues: LineIssue[];
}

/**
 * Resolve qty / unit / total from the three printed texts. Rules:
 * - A blank column is derived from the others when that is exact (many quotes print only the total).
 * - Text that is present but unreadable → UNPARSEABLE_MONEY.
 * - When all three are known and qty × unit ≠ total → QTY_PRICE_MISMATCH; the printed line total wins
 *   because that is what the printed grand total adds up.
 */
function resolveMoney(line: RawExtractedLine): LineMoney {
  const issues: LineIssue[] = [];
  const unitP = isBlank(line.unitPriceText) ? undefined : parseSpanishMoney(line.unitPriceText);
  const totalP = isBlank(line.lineTotalText) ? undefined : parseSpanishMoney(line.lineTotalText);
  const qtyP = isBlank(line.quantityText) ? undefined : parseQuantity(line.quantityText);
  if (unitP === null || totalP === null) issues.push("UNPARSEABLE_MONEY");
  if (qtyP === null) issues.push("QTY_PRICE_MISMATCH");

  const unit = unitP ?? null;
  const total = totalP ?? null;
  let qty = qtyP ?? null;
  if (qty === null) qty = unit !== null && unit > 0 && total !== null && total % unit === 0 ? total / unit : 1;

  let unitPriceCents: number;
  let totalCents: number;
  if (unit !== null && total !== null) {
    unitPriceCents = unit;
    totalCents = total;
  } else if (total !== null) {
    totalCents = total;
    unitPriceCents = total % qty === 0 ? total / qty : Math.round(total / qty);
  } else if (unit !== null) {
    unitPriceCents = unit;
    totalCents = unit * qty;
  } else {
    unitPriceCents = 0;
    totalCents = 0;
    if (!issues.includes("UNPARSEABLE_MONEY")) issues.push("UNPARSEABLE_MONEY");
  }
  if (unitPriceCents * qty !== totalCents && !issues.includes("QTY_PRICE_MISMATCH")) issues.push("QTY_PRICE_MISMATCH");
  return { qty, unitPriceCents, totalCents, issues };
}

function clampConfidence(c: number): number {
  if (typeof c !== "number" || Number.isNaN(c)) return 0;
  return Math.min(1, Math.max(0, c));
}

/** Use the printed line numbers when they are usable (positive, unique); otherwise number by order. */
function lineNumbers(lines: readonly RawExtractedLine[]): number[] {
  const printed = lines.map((l) => l.lineNo);
  const usable =
    printed.every((n) => Number.isInteger(n) && n > 0) && new Set(printed).size === printed.length;
  return usable ? printed : lines.map((_, i) => i + 1);
}

export function normalizeExtraction(raw: RawExtraction, meta: NormalizeMeta): ExtractionResult {
  const numbers = lineNumbers(raw.lines);
  const invalidTeeth: InvalidTooth[] = [];

  const lines: QuoteLine[] = raw.lines.map((rl, i) => {
    const lineNo = numbers[i]!;
    const id = `L${lineNo}`;
    const issues = new Set<LineIssue>();

    const parsedCode = ProcedureCodeSchema.safeParse(rl.code);
    const code = parsedCode.success ? parsedCode.data : "OTHER";
    if (code === "OTHER") issues.add("UNKNOWN_PROCEDURE");

    const teeth: number[] = [];
    for (const t of rl.teeth ?? []) {
      if (isValidFdi(t)) {
        if (!teeth.includes(t)) teeth.push(t);
      } else {
        issues.add("INVALID_TOOTH");
        invalidTeeth.push({ lineId: id, tooth: t });
      }
    }

    const money = resolveMoney(rl);
    money.issues.forEach((x) => issues.add(x));

    const confidence = clampConfidence(rl.confidence);
    if (confidence < LOW_CONFIDENCE_THRESHOLD) issues.add("LOW_CONFIDENCE");

    return {
      id,
      lineNo,
      description: rl.description.trim(),
      code,
      category: PROCEDURE_CATEGORY[code],
      teeth,
      qty: money.qty,
      unitPriceCents: money.unitPriceCents,
      totalCents: money.totalCents,
      confidence,
      issues: ISSUE_ORDER.filter((x) => issues.has(x)),
      source: "extracted",
    };
  });

  const sumOfLinesCents = lines.reduce((a, l) => a + l.totalCents, 0);
  const printedTotalCents = parseSpanishMoney(raw.printedTotalText);

  const result: ExtractionResult = {
    quoteId: meta.quoteId,
    pdfSha256: meta.pdfSha256,
    clinicName: raw.clinicName.trim(),
    dentistName: raw.dentistName.trim(),
    patientName: raw.patientName.trim(),
    quoteRef: raw.quoteRef.trim(),
    quoteDate: parseSpanishDate(raw.quoteDateText),
    lines,
    totalCents: sumOfLinesCents,
    checks: {
      sumOfLinesCents,
      printedTotalCents,
      sumMatches: printedTotalCents !== null && printedTotalCents === sumOfLinesCents,
      invalidTeeth,
      lowConfidenceLineIds: lines.filter((l) => l.issues.includes("LOW_CONFIDENCE")).map((l) => l.id),
      toReviewLineIds: lines.filter((l) => l.issues.length > 0).map((l) => l.id),
    },
    source: meta.source,
    model: meta.model,
    extractedAt: meta.extractedAt,
  };
  // Contract guard: a bug here must fail loudly, never hand the clinic a malformed extraction.
  return ExtractionResultSchema.parse(result);
}
