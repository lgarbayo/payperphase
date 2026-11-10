/**
 * OWNED BY WP-03. Quote extraction: PDF → Claude (structured output RawExtraction) → deterministic
 * parsing/validation → ExtractionResult. The LLM never produces cents or dates.
 * SCAFFOLD STUB: returns the golden extraction (source "cached").
 */
import type { ExtractionResult } from "@/contracts";
import { goldenExtraction } from "@/contracts/fixtures/implantCase";

export type ExtractInput = { pdf: Uint8Array; filename?: string } | { sampleId: string };

export async function extractQuote(input: ExtractInput): Promise<ExtractionResult> {
  void input;
  return { ...goldenExtraction(), source: "cached", extractedAt: new Date().toISOString() };
}

/** "1.250,00 €" → 125000. Returns null when the text is not a Spanish money amount. */
export function parseSpanishMoney(text: string): number | null {
  const cleaned = text.replace(/[€\s ]/g, "").replace(/EUR/i, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) return null;
  const [int, frac = ""] = cleaned.replace(/\./g, "").split(",");
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}
