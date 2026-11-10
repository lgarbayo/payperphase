/**
 * OWNED BY WP-10. Localized step text (AgentStep.text is {es, en}); server-safe (no React).
 */
import type { Locale, LocalizedText } from "@/contracts";
import { translate, type KeyOf, type Vars } from "@/i18n/core";
import { formatCents } from "@/lib/money";
import { formatIsoDate } from "@/lib/dates";

type VarsFor = Vars | ((locale: Locale) => Vars);

/** Both locales of an `agent` dictionary key. Vars may depend on the locale (money, dates). */
export function lt(key: KeyOf<"agent">, vars?: VarsFor): LocalizedText {
  const v = (l: Locale) => (typeof vars === "function" ? vars(l) : vars);
  return { es: translate("agent", "es", key, v("es")), en: translate("agent", "en", key, v("en")) };
}

export function money(cents: number, locale: Locale): string {
  return formatCents(cents, locale);
}

export function day(iso: string, locale: Locale): string {
  return formatIsoDate(iso, locale);
}

/** Short, safe error message from a tool output (PayPal error objects, strings, Errors). */
export function errorMessageOf(output: unknown): string {
  if (output instanceof Error) return output.message.slice(0, 200);
  if (typeof output === "string") return output.slice(0, 200) || "unknown error";
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    const nested = o.error && typeof o.error === "object" ? (o.error as Record<string, unknown>).message : undefined;
    const msg = o.message ?? nested ?? o.error ?? o.code;
    if (typeof msg === "string" && msg) return msg.slice(0, 200);
  }
  return "unknown error";
}
