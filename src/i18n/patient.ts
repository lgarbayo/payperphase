import type { Dictionary } from "./types";

/** Owned by WP-06. Add keys to BOTH es and en (tests/i18n checks parity). */
export default {
  es: {
    title: "patient",
  },
  en: {
    title: "patient",
  },
} as const satisfies Dictionary;
