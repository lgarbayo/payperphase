/**
 * OWNED BY WP-06. Pure display helpers for the patient page. They only FORMAT values the engine
 * and the server produced (cents, IsoDates, day deltas); they never compute money or dates.
 */
import { PAY_IN_3, type Locale, type PhaseFit, type PhaseShift, type Plan } from "@/contracts";
import { translate, type KeyOf, type Vars } from "@/i18n/core";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

type PatientKey = KeyOf<"patient">;
const tr = (locale: Locale, key: PatientKey, vars?: Vars) => translate("patient", locale, key, vars);

/** "3 y 4" / "3, 4 and 5". */
export function formatList(items: string[], locale: Locale): string {
  return new Intl.ListFormat(locale === "es" ? "es" : "en-GB", { style: "long", type: "conjunction" }).format(items);
}

/** "Fase 2" / "Fases 3 y 4". */
export function formatPhaseGroup(ns: number[], locale: Locale): string {
  if (ns.length === 1) return tr(locale, "phaseOne", { n: ns[0] ?? "" });
  return tr(locale, "phaseMany", { list: formatList(ns.map(String), locale) });
}

/** A whole-day delta as "6 semanas" when it is whole weeks, else "10 días". Sign is ignored. */
export function formatSpan(deltaDays: number, locale: Locale): string {
  const d = Math.abs(deltaDays);
  if (d > 0 && d % 7 === 0) {
    const w = d / 7;
    return w === 1 ? tr(locale, "spanWeekOne") : tr(locale, "spanWeeks", { n: w });
  }
  return d === 1 ? tr(locale, "spanDayOne") : tr(locale, "spanDays", { n: d });
}

/**
 * Toast text for a persisted what-if, built only from `result.shifts`:
 *   "Fase 2 pasa al 23 feb 2027 · Fases 3 y 4 se mueven 6 semanas más tarde".
 */
export function describeShifts(
  shifts: readonly PhaseShift[],
  movedPhaseId: string,
  phases: Pick<Plan, "phases">["phases"],
  locale: Locale,
): string {
  const nOf = (id: string) => phases.find((p) => p.id === id)?.n;
  const parts: string[] = [];

  const moved = shifts.find((s) => s.phaseId === movedPhaseId && s.deltaDays !== 0);
  const movedN = nOf(movedPhaseId);
  if (moved && movedN !== undefined) {
    parts.push(tr(locale, "movedTo", { who: formatPhaseGroup([movedN], locale), date: formatIsoDate(moved.toStart, locale) }));
  }

  // Followers grouped by identical delta, in plan order.
  const groups = new Map<number, number[]>();
  for (const s of shifts) {
    if (s.phaseId === movedPhaseId || s.deltaDays === 0) continue;
    const n = nOf(s.phaseId);
    if (n === undefined) continue;
    groups.set(s.deltaDays, [...(groups.get(s.deltaDays) ?? []), n]);
  }
  for (const [delta, ns] of groups) {
    const sorted = [...ns].sort((a, b) => a - b);
    const many = sorted.length > 1;
    const key: PatientKey =
      delta > 0 ? (many ? "followManyLater" : "followOneLater") : many ? "followManyEarlier" : "followOneEarlier";
    parts.push(tr(locale, key, { who: formatPhaseGroup(sorted, locale), span: formatSpan(delta, locale) }));
  }

  return parts.length ? parts.join(" · ") : tr(locale, "noShift");
}

/** Fit badge copy. Never claims eligibility: "within range" only. */
export function formatFit(fit: PhaseFit, locale: Locale): string {
  switch (fit.reason) {
    case "WITHIN_PAY_IN_3_RANGE":
      return tr(locale, "fitPayIn3", {
        min: formatCents(PAY_IN_3.minCents, locale, { whole: true }),
        max: formatCents(PAY_IN_3.maxCents, locale, { whole: true }),
      });
    case "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX":
      return tr(locale, "fitIndivisible");
    case "BELOW_PAY_IN_3_MIN":
      return tr(locale, "fitBelowMin");
    case "OVER_INSTALLMENTS_MAX":
      return tr(locale, "fitSinglePayment");
  }
}

/** "36, 46" — FDI tooth numbers as printed on the quote. */
export function formatTeeth(teeth: readonly number[], locale: Locale): string {
  return formatList(teeth.map(String), locale);
}

/** Adds "(ficticio)" unless the alias already says it is synthetic. */
export function formatPatientAlias(alias: string, locale: Locale): string {
  return /ficti|synthetic|fictional/i.test(alias) ? alias : tr(locale, "patientAlias", { alias });
}
