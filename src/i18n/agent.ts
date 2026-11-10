import type { Dictionary } from "./types";

/** Owned by WP-10. Add keys to BOTH es and en (tests/i18n checks parity). */
export default {
  es: {
    title: "agent",
  },
  en: {
    title: "agent",
  },
} as const satisfies Dictionary;
