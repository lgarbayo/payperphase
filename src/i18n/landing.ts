import type { Dictionary } from "./types";

/** Owned by WP-14. Add keys to BOTH es and en (tests/i18n checks parity). */
export default {
  es: {
    title: "landing",
  },
  en: {
    title: "landing",
  },
} as const satisfies Dictionary;
