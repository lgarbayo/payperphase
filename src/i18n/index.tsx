"use client";
/**
 * Scaffold-owned i18n. ES is the default UI language; EN toggle for the demo.
 *   const t = useT("pay");  t("payNow", { amount: "360,00 €" })
 * Interpolation: "{{name}}" placeholders. Feature WPs only edit their own src/i18n/<feature>.ts.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@/contracts/primitives";
import { translate, type KeyOf, type Namespace, type Vars } from "./core";

export { dictionaries, interpolate, translate } from "./core";
export type { KeyOf, Namespace, Vars } from "./core";

const STORAGE_KEY = "ppp.locale";

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
}
const Ctx = createContext<LocaleCtx>({ locale: "es", setLocale: () => {} });

export function LocaleProvider({ children, initial = "es" }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("lang");
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const next = fromUrl === "en" || fromUrl === "es" ? fromUrl : stored === "en" || stored === "es" ? stored : null;
      if (next) setLocaleState(next);
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  return useContext(Ctx);
}

export function useT<N extends Namespace>(ns: N) {
  const { locale } = useLocale();
  return useCallback((key: KeyOf<N>, vars?: Vars) => translate(ns, locale, key, vars), [ns, locale]);
}
