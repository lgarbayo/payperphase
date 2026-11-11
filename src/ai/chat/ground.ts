/**
 * OWNED BY WP-11. Numeric grounding check. Any number, date, month name or amount in an answer must
 * appear in the sources: the `simulate_delay` tool results and the texts of the cited approved notes.
 * One ungrounded token fails the whole answer; the caller then swaps in a code-built summary.
 */

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};

/** Month words that are also ordinary words ("may", "mar" = sea, "sep"): only counted next to a digit. */
const AMBIGUOUS = new Set(["may", "mar", "march", "sep", "dec", "oct", "nov", "jan", "feb", "apr", "jun", "jul", "aug", "ago", "ene", "abr", "dic"]);

export interface GroundingSources {
  /** Tool results (JSON strings) and cited note texts. */
  texts: readonly string[];
}

export interface GroundingResult {
  ok: boolean;
  /** Tokens in the answer that no source contains (numbers as written, months as written). */
  ungrounded: string[];
}

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Digit groups with their separators, normalised to digits only ("1.500,00" → "150000"). */
function numbersIn(text: string): { raw: string; key: string }[] {
  const out: { raw: string; key: string }[] = [];
  for (const m of text.matchAll(/\d+(?:[.,  ]\d+)*/g)) out.push({ raw: m[0], key: m[0].replace(/\D/g, "") });
  return out;
}

function monthsIn(text: string): { raw: string; month: number }[] {
  const out: { raw: string; month: number }[] = [];
  const s = strip(text);
  for (const m of s.matchAll(/[a-z]+/g)) {
    const word = m[0];
    const month = MONTHS[word];
    if (month === undefined) continue;
    if (AMBIGUOUS.has(word)) {
      const before = s.slice(Math.max(0, m.index - 6), m.index);
      const after = s.slice(m.index + word.length, m.index + word.length + 8);
      if (!/\d\s*(?:de\s+)?$/.test(before) && !/^\.?\s*(?:de\s+)?\d/.test(after)) continue;
    }
    out.push({ raw: word, month });
  }
  return out;
}

export function groundingCheck(answer: string, sources: GroundingSources | readonly string[]): GroundingResult {
  const texts = Array.isArray(sources) ? (sources as readonly string[]) : (sources as GroundingSources).texts;
  const haystack = texts.join("\n");
  const knownNumbers = new Set(numbersIn(haystack).map((n) => n.key));
  const knownMonths = new Set(monthsIn(haystack).map((m) => m.month));

  const ungrounded: string[] = [];
  for (const n of numbersIn(answer)) if (!knownNumbers.has(n.key)) ungrounded.push(n.raw);
  for (const m of monthsIn(answer)) if (!knownMonths.has(m.month)) ungrounded.push(m.raw);
  return { ok: ungrounded.length === 0, ungrounded };
}
