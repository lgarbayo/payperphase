import type { Dictionary } from "./types";

/** Owned by WP-11. Add keys to BOTH es and en (tests/i18n checks parity). */
export default {
  es: {
    title: "chat",
  },
  en: {
    title: "chat",
  },
} as const satisfies Dictionary;
