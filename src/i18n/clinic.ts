import type { Dictionary } from "./types";

/** Owned by WP-07. Add keys to BOTH es and en (tests/i18n checks parity). */
export default {
  es: {
    title: "clinic",
  },
  en: {
    title: "clinic",
  },
} as const satisfies Dictionary;
