/**
 * OWNED BY WP-03. Deterministic parsers for text Claude copies verbatim from a Spanish presupuesto.
 * The LLM never converts money, quantities or dates: these functions do, and return null when
 * the printed text is not something we can read with certainty.
 */
import { isIsoDate, type IsoDate } from "@/lib/dates";
import type { Cents } from "@/lib/money";

/** Spanish grouping: "1.250" or "1.250.000"; or no grouping at all ("1250"). Up to 2 decimals after ",". */
const SPANISH_MONEY_RE = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

/**
 * "1.250,00 €" → 125000. Accepts "€" / "EUR" before or after, spaces and NBSPs, "1,5" (= 1,50 €).
 * Returns null for anything else: other locales' formats ("1,250.00"), malformed groups ("1.25.0"),
 * more than two decimals ("12,345"), negative amounts and empty text.
 */
export function parseSpanishMoney(text: string): Cents | null {
  if (typeof text !== "string") return null;
  const cleaned = text
    .replace(/€/g, "")
    .replace(/\bEUR\b/gi, "")
    .replace(/[\s  ]/g, "");
  if (!SPANISH_MONEY_RE.test(cleaned)) return null;
  const [intPart = "", fracPart = ""] = cleaned.replace(/\./g, "").split(",");
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** "2", "2 ud.", "x2", "2,00" → 2. Blank, zero, fractional or unreadable text → null. */
export function parseQuantity(text: string): number | null {
  if (typeof text !== "string") return null;
  const m = /^\s*(?:x\s*)?(\d{1,4})(?:[.,]0+)?\s*(?:x|uds?\.?|unidad(?:es)?|u\.?)?\s*$/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

const ES_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/**
 * Spanish printed dates → IsoDate: "12/11/2026" (day first), "12-11-2026", "12.11.26",
 * "12 de noviembre de 2026". Impossible dates ("31/02/2026") → null.
 */
export function parseSpanishDate(text: string): IsoDate | null {
  if (typeof text !== "string") return null;
  const t = text.trim().toLowerCase();
  let d: number, m: number, y: number;
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  const long = /^(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de\s+|del\s+)?(\d{4})$/.exec(t);
  if (numeric) {
    d = Number(numeric[1]);
    m = Number(numeric[2]);
    y = Number(numeric[3]);
    if (numeric[3]!.length === 2) y += 2000;
  } else if (long) {
    const month = ES_MONTHS[long[2]!];
    if (!month) return null;
    d = Number(long[1]);
    m = month;
    y = Number(long[3]);
  } else {
    return null;
  }
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}
