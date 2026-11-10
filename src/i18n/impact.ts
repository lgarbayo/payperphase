import type { Dictionary } from "./types";

/** Owned by WP-12. Add keys to BOTH es and en (tests/i18n checks parity). */
export default {
  es: {
    title: "impact",
  },
  en: {
    title: "impact",
  },
} as const satisfies Dictionary;
