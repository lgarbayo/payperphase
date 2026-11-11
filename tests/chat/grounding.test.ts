import { describe, expect, it } from "vitest";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { groundingCheck } from "@/ai/chat";
import { delayAnswerText } from "@/ai/chat/compose";
import { simulateDelay, factsToToolResult } from "@/ai/chat/delay";
import { NOTE_LIBRARY } from "@data/seed/notes";

const TODAY = "2026-11-16";
const delay = (locale: "es" | "en", amount = 3, unit: "weeks" | "months" = "months") =>
  simulateDelay(GOLDEN_PLAN, TODAY, { phaseN: 2, amount, unit }, locale);

describe("groundingCheck", () => {
  const tool = factsToToolResult(delay("es"));
  const noteTexts = [NOTE_LIBRARY.HEALING_EXTRACTION_MAX_6M.text.es];

  it("accepts numbers, dates and months that the tool result or a cited note contains", () => {
    const ok = "La Fase 2 pasa del 12 ene 2027 al 12 abr 2027; si pasan más de 6 meses el hueso puede reducirse.";
    expect(groundingCheck(ok, [tool, ...noteTexts])).toEqual({ ok: true, ungrounded: [] });
  });

  it("rejects a number that no source contains", () => {
    const r = groundingCheck("La Fase 2 pasa al 12 abr 2027 y costará 1.800 €.", [tool, ...noteTexts]);
    expect(r.ok).toBe(false);
    expect(r.ungrounded).toContain("1.800");
  });

  it("rejects a date whose day or year is not in the sources", () => {
    expect(groundingCheck("Pasa al 13 abr 2027.", [tool]).ok).toBe(false);
    expect(groundingCheck("Pasa al 12 abr 2028.", [tool]).ungrounded).toEqual(["2028"]);
  });

  it("rejects a month name that no source contains, even without digits", () => {
    const r = groundingCheck("Lo mejor sería esperar hasta septiembre.", [tool]);
    expect(r).toEqual({ ok: false, ungrounded: ["septiembre"] });
    expect(groundingCheck("Best to wait until September.", [tool]).ok).toBe(false);
  });

  it("does not mistake ordinary words (may, mar) for months", () => {
    expect(groundingCheck("It may help. El mar está lejos.", [tool]).ok).toBe(true);
    expect(groundingCheck("On 5 may 2027 it will be done.", [tool]).ok).toBe(false);
  });

  it("matches amounts across separators and works with a bare string array", () => {
    expect(groundingCheck("Pagas 1.500,00 €.", ["importe 1500,00"]).ok).toBe(true);
    expect(groundingCheck("Pagas 1.500,00 €.", ["importe 360,00"]).ok).toBe(false);
  });

  it("every code-built what-if answer passes its own check (ES and EN, with and without a deadline warning)", () => {
    for (const locale of ["es", "en"] as const) {
      for (const [amount, unit] of [[3, "months"], [6, "months"], [6, "weeks"]] as const) {
        const r = delay(locale, amount, unit);
        const text = delayAnswerText(r, locale);
        const sources = [factsToToolResult(r), ...Object.values(NOTE_LIBRARY).map((n) => n.text[locale])];
        expect(groundingCheck(text, sources), `${locale} ${amount} ${unit}: ${text}`).toEqual({ ok: true, ungrounded: [] });
      }
    }
  });
});
