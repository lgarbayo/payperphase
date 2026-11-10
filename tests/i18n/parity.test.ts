import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/core";

describe("i18n dictionaries", () => {
  for (const [ns, dict] of Object.entries(dictionaries)) {
    it(`${ns}: es and en have the same keys and no empty strings`, () => {
      const es = Object.keys(dict.es).sort();
      const en = Object.keys(dict.en).sort();
      expect(en).toEqual(es);
      for (const v of [...Object.values(dict.es), ...Object.values(dict.en)]) expect(String(v).trim()).not.toBe("");
    });
  }
});
