/**
 * Scaffold-owned. Server-safe i18n core (no React). Server components and plain functions
 * import `translate` from "@/i18n/core"; client components use `useT` from "@/i18n".
 */
import type { Locale } from "@/contracts/primitives";
import agent from "./agent";
import chat from "./chat";
import clinic from "./clinic";
import common from "./common";
import gantt from "./gantt";
import impact from "./impact";
import landing from "./landing";
import odontogram from "./odontogram";
import patient from "./patient";
import pay from "./pay";

export const dictionaries = { common, pay, gantt, patient, clinic, agent, chat, impact, landing, odontogram };
export type Namespace = keyof typeof dictionaries;
export type KeyOf<N extends Namespace> = keyof (typeof dictionaries)[N]["es"] & string;
export type Vars = Record<string, string | number>;

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate<N extends Namespace>(ns: N, locale: Locale, key: KeyOf<N>, vars?: Vars): string {
  const dict = dictionaries[ns] as unknown as Record<Locale, Record<string, string>>;
  return interpolate(dict[locale][key] ?? dict.es[key] ?? key, vars);
}
