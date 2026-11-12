/**
 * Small helpers shared by the impact visuals. Presentation only: every amount
 * shown by these components arrives as integer cents from the engine and is only formatted here.
 */
import type { Locale } from "@/contracts";
import { translate, type KeyOf, type Vars } from "@/i18n/core";
import { formatCents } from "@/lib/money";

/**
 * Translator bound to the `locale` prop. The components take `locale` as a prop (their contract),
 * so they translate with it directly instead of reading the provider context.
 */
export function impactT(locale: Locale) {
  return (key: KeyOf<"impact">, vars?: Vars) => translate("impact", locale, key, vars);
}

export function money(cents: number, locale: Locale): string {
  return formatCents(cents, locale);
}

/** "ph3" → 3 (phase ids are `ph{n}` by contract); falls back to the 1-based position. */
export function phaseNumber(phaseId: string, fallback: number): number {
  const m = /^ph(\d+)$/.exec(phaseId);
  return m ? Number(m[1]) : fallback;
}

/** Visual state used for colour + copy: green when nothing is at risk, red when something is. */
export type Tone = "ok" | "alert";
export function toneFor(cents: number): Tone {
  return cents > 0 ? "alert" : "ok";
}
