import type { Dictionary } from "./types";

/** Owned by WP-08. Add keys to BOTH es and en (tests/i18n checks parity). */
export default {
  es: {
    title: "odontogram",
  },
  en: {
    title: "odontogram",
  },
} as const satisfies Dictionary;
