/**
 * OWNED BY WP-03. Plain-language explanation of a PlanDiff for the clinic diff panel, the agent feed and
 * the patient notice. Deterministic (no LLM): every number in the sentence is read from the diff.
 *   ES "Fase 2: +450,00 €, sigue dentro del rango de Paga en 3 · fases 3–4 se mueven 4 semanas"
 *   EN "Phase 2: +€450.00, still within the Pay in 3 range · phases 3–4 move 4 weeks later"
 * Diff templates use their own slots ({{phaseN}} {{amount}} {{phases}} {{count}}), filled by renderSlots.
 * `source` is "cached" because no live model wrote it.
 */
import type { DiffExplanation, FitBand, Locale, LocalizedText, Plan, PlanDiff } from "@/contracts";
import { daysBetween } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { renderSlots } from "./fill";

type PhaseDiff = PlanDiff["phases"][number];

interface Segment {
  template: LocalizedText;
  values: Record<Locale, Record<string, string>>;
}

const BAND: Record<FitBand, LocalizedText> = {
  PAY_IN_3: { es: "Paga en 3", en: "Pay in 3" },
  INSTALLMENTS: { es: "Pagos mensuales", en: "Pay Monthly" },
  PAYPAL_ONLY: { es: "pago único con PayPal", en: "a single PayPal payment" },
};

function fitPhrase(before: FitBand, after: FitBand): LocalizedText {
  if (after === "PAY_IN_3") {
    return before === "PAY_IN_3"
      ? { es: "sigue dentro del rango de Paga en 3", en: "still within the Pay in 3 range" }
      : { es: "ahora entra en el rango de Paga en 3", en: "now within the Pay in 3 range" };
  }
  if (before === "PAY_IN_3") {
    return {
      es: `sale del rango de Paga en 3: pasa a ${BAND[after].es}`,
      en: `leaves the Pay in 3 range: moves to ${BAND[after].en}`,
    };
  }
  return before === after
    ? { es: `sigue con ${BAND[after].es}`, en: `still on ${BAND[after].en}` }
    : { es: `pasa a ${BAND[after].es}`, en: `moves to ${BAND[after].en}` };
}

function amountSegment(p: PhaseDiff): Segment {
  const n = String(p.n);
  if (p.deltaCents === 0) {
    return {
      template: { es: "Fase {{phaseN}}: mismo importe, líneas actualizadas", en: "Phase {{phaseN}}: same amount, lines updated" },
      values: { es: { phaseN: n }, en: { phaseN: n } },
    };
  }
  const sign = p.deltaCents > 0 ? "+" : "−";
  const abs = Math.abs(p.deltaCents);
  const fit = fitPhrase(p.fitBefore, p.fitAfter);
  return {
    template: {
      es: `Fase {{phaseN}}: ${sign}{{amount}}, ${fit.es}`,
      en: `Phase {{phaseN}}: ${sign}{{amount}}, ${fit.en}`,
    },
    values: {
      es: { phaseN: n, amount: formatCents(abs, "es") },
      en: { phaseN: n, amount: formatCents(abs, "en") },
    },
  };
}

/** [3,4] → "3–4"; [2] → "2"; [2,4,6] → "2, 4 y 6" / "2, 4 and 6". */
function phaseList(ns: number[], locale: Locale): string {
  const sorted = [...ns].sort((a, b) => a - b);
  const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1);
  if (sorted.length > 1 && consecutive) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  if (sorted.length <= 1) return sorted.map(String).join("");
  const and = locale === "es" ? " y " : " and ";
  return `${sorted.slice(0, -1).join(", ")}${and}${sorted[sorted.length - 1]}`;
}

function moveSegment(ns: number[], shiftDays: number): Segment {
  const plural = ns.length > 1;
  const inWeeks = shiftDays % 7 === 0;
  const count = Math.abs(inWeeks ? shiftDays / 7 : shiftDays);
  const one = count === 1;
  const unit = inWeeks
    ? { es: one ? "semana" : "semanas", en: one ? "week" : "weeks" }
    : { es: one ? "día" : "días", en: one ? "day" : "days" };
  const later = shiftDays > 0;
  const es = `${plural ? "fases" : "fase"} {{phases}} ${later ? (plural ? "se mueven" : "se mueve") : plural ? "se adelantan" : "se adelanta"} {{count}} ${unit.es}`;
  const en = `${plural ? "phases" : "phase"} {{phases}} ${plural ? "move" : "moves"} {{count}} ${unit.en} ${later ? "later" : "earlier"}`;
  return {
    template: { es, en },
    values: {
      es: { phases: phaseList(ns, "es"), count: String(count) },
      en: { phases: phaseList(ns, "en"), count: String(count) },
    },
  };
}

export function explainDiffSync(diff: PlanDiff): DiffExplanation {
  const phases = [...diff.phases].sort((a, b) => a.n - b.n);
  const segments: Segment[] = [];

  for (const p of phases) {
    if (p.deltaCents !== 0 || p.addedLines.length > 0 || p.removedLines.length > 0) segments.push(amountSegment(p));
  }

  // Group moved phases by their shift, in phase order of first appearance.
  const shifts = new Map<number, number[]>();
  for (const p of phases) {
    const shift = daysBetween(p.startBefore, p.startAfter);
    if (shift !== 0) shifts.set(shift, [...(shifts.get(shift) ?? []), p.n]);
  }
  for (const [shift, ns] of shifts) segments.push(moveSegment(ns, shift));

  if (segments.length === 0) {
    const none = { es: "Sin cambios en importes ni fechas", en: "No changes to amounts or dates" };
    return { template: none, rendered: none, source: "cached" };
  }

  const join = (parts: string[]) => {
    const s = parts.join(" · ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  return {
    template: {
      es: join(segments.map((s) => s.template.es)),
      en: join(segments.map((s) => s.template.en)),
    },
    rendered: {
      es: join(segments.map((s) => renderSlots(s.template.es, s.values.es))),
      en: join(segments.map((s) => renderSlots(s.template.en, s.values.en))),
    },
    source: "cached",
  };
}

export async function explainDiff(diff: PlanDiff, plan: Plan): Promise<DiffExplanation> {
  void plan; // Kept for the stable signature (WP-09's edit route); the diff carries every number used.
  return explainDiffSync(diff);
}
