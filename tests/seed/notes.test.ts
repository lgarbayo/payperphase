import { describe, expect, it } from "vitest";
import { ClinicalNoteSchema, NoteIdSchema } from "@/contracts";
import { NOTE_LIBRARY, getNote } from "@data/seed/notes";

const LOCALES = ["es", "en"] as const;
const MAX_CHARS = 240;

describe("clinician note library", () => {
  it("has exactly one entry per NoteId, keyed by its own id", () => {
    expect(Object.keys(NOTE_LIBRARY).sort()).toEqual([...NoteIdSchema.options].sort());
    for (const id of NoteIdSchema.options) {
      expect(NOTE_LIBRARY[id].id).toBe(id);
      expect(getNote(id)).toBe(NOTE_LIBRARY[id]);
      expect(ClinicalNoteSchema.parse(NOTE_LIBRARY[id])).toBeTruthy();
    }
  });

  for (const id of NoteIdSchema.options) {
    for (const locale of LOCALES) {
      describe(`${id} (${locale})`, () => {
        const note = NOTE_LIBRARY[id];
        const title = note.title[locale];
        const text = note.text[locale];

        it("has a non-empty title and text, within the length limit", () => {
          expect(title.trim()).not.toBe("");
          expect(text.trim()).not.toBe("");
          expect(title.length).toBeLessThanOrEqual(40);
          expect(text.length).toBeLessThanOrEqual(MAX_CHARS);
        });

        it("has no prices, no dosages and no dates", () => {
          for (const s of [title, text]) {
            expect(s).not.toMatch(/[€$£]/);
            expect(s).not.toMatch(/\b(eur|euros?|usd|dollars?)\b/i);
            expect(s).not.toMatch(/\d\s?(mg|mcg|µg|ml|g)\b/i);
            expect(s).not.toMatch(/\bmg\b/i);
            expect(s).not.toMatch(/\d+[.,]\d{2}\b/); // price-like 1.500,00 / 20.50
            expect(s).not.toMatch(/\d{3,}/); // 3+ digit numbers (prices, years)
            expect(s).not.toMatch(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/); // dates
          }
        });
      });
    }
  }

  it("ES and EN texts are different strings (nothing left untranslated)", () => {
    for (const id of NoteIdSchema.options) {
      expect(NOTE_LIBRARY[id].text.es).not.toBe(NOTE_LIBRARY[id].text.en);
      expect(NOTE_LIBRARY[id].title.es.trim().toLowerCase()).not.toBe("");
    }
  });

  it("states no diagnosis or prescription in imperative medical terms", () => {
    const banned = /\b(diagnos(is|ed)|diagnóstico|prescri|receta|antibiótic|antibiotic|ibuprofen|paracetamol|dosis|dose)\b/i;
    for (const id of NoteIdSchema.options) {
      for (const l of LOCALES) expect(NOTE_LIBRARY[id].text[l]).not.toMatch(banned);
    }
  });
});
