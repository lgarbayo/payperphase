/**
 * Legal-accuracy regression: the patient never "still owes" the undelivered treatment. The Ministerio de Consumo
 * (17/11/2020) and the DSCA say a patient with a linked loan can stop paying; the burden is claiming it.
 */
import { describe, expect, it } from "vitest";
import impact from "@/i18n/impact";
import landing from "@/i18n/landing";
import { DSCA_ADVICE_URL, DSCA_SOURCE_URL, MONCLOA_DENTIX_URL } from "@/contracts/constants";

const BANNED = /\bdebes\b|aún debes|debes el total|still owe|you owe/i;

describe("closure and hook copy makes no 'you still owe' claim", () => {
  for (const [name, dict] of [["impact", impact], ["landing", landing]] as const) {
    for (const locale of ["es", "en"] as const) {
      it(`${name}.${locale} has no banned phrase`, () => {
        for (const [key, value] of Object.entries(dict[locale])) {
          expect(String(value), `${name}.${locale}.${key}`).not.toMatch(BANNED);
        }
      });
    }
  }

  it("the closure leads say the patient claims back, and the continuity line exists in both languages", () => {
    expect(impact.es.closureLoanLead).toBe("Te toca reclamar");
    expect(impact.es.closurePppLead).toBe("Te toca reclamar");
    expect(impact.en.closureLoanLead).toBe("Yours to claim back");
    expect(impact.en.closurePppLead).toBe("Yours to claim back");
    expect(impact.es.closureLine1).toContain("Banco de España");
    expect(impact.en.closureLine1).toContain("Bank of Spain");
    expect(impact.es.closureContinuity).toContain("llévalos a otra clínica");
    expect(impact.en.closureContinuity).toContain("another clinic");
  });
});

describe("source URLs", () => {
  it("point at the Spanish-language official pages", () => {
    expect(DSCA_SOURCE_URL).toMatch(/^https:\/\/www\.dsca\.gob\.es\/es\//);
    expect(DSCA_ADVICE_URL).toBe("https://www.dsca.gob.es/es/consumo/notas-informativas/bienes-y-servicios/clinicas-dentales");
    expect(MONCLOA_DENTIX_URL).toBe("https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/consumo/Paginas/2020/171120-dentix.aspx");
  });
});
