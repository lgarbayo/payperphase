import type { Dictionary } from "./types";

/** Owned by WP-05. Add keys to BOTH es and en (tests/i18n checks parity). */
export default {
  es: {
    title: "gantt",
  },
  en: {
    title: "gantt",
  },
} as const satisfies Dictionary;
