// @vitest-environment jsdom
/** WP-14 landing: hook, DSCA link, positioning line, CTAs, trust strip and GDPR line in ES and EN. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Landing } from "@/components/brand/Landing";
import { DSCA_SOURCE_URL, GDPR_COPY, MONCLOA_DENTIX_URL, TRUST_STRIP_COPY } from "@/contracts/constants";
import { LocaleProvider } from "@/i18n";

afterEach(cleanup);
const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

const EXPECT = {
  es: {
    hook: "2020: una gran cadena dental cierra de un día para otro. 101.481 pacientes tenían tratamientos pagados sin terminar; el 65 %, con un préstamo vinculado.",
    source: "Ministerio de Consumo, 17/11/2020",
    again: "En 2026 volvió a pasar: otra cadena entró en concurso en septiembre y en octubre ya no le quedaba ninguna clínica abierta, con más de 30.000 tratamientos parados.",
    claim: "Con un préstamo vinculado puedes dejar de pagar lo no recibido, pero te toca reclamarlo por escrito.",
    positioning:
      "Tu cicatrización fija las fechas de pago · cada fase cabe en Paga en 3 de PayPal · nada se cobra antes del tratamiento · 0 € perdidos si la clínica cierra",
    steps: ["Presupuesto", "Fases", "Pagas cada fase al recibirla"],
    how: "Cómo funciona",
  },
  en: {
    hook: "2020: a big dental chain closes overnight. 101,481 patients had paid-for treatments left unfinished; 65% of them with a linked loan.",
    source: "Spanish Ministry of Consumer Affairs, 17/11/2020",
    again: "It happened again in 2026: another chain entered insolvency in September and by October had no clinic left open, with more than 30,000 treatments stalled.",
    claim: "With a linked loan you can stop paying for what you did not receive, but it is on you to claim it in writing.",
    positioning:
      "Your healing sets the payment dates · every phase fits PayPal Pay in 3 · nothing is charged before treatment · €0 lost if the clinic closes",
    steps: ["Quote", "Phases", "Pay each phase as you receive it"],
    how: "How it works",
  },
} as const;

for (const locale of ["es", "en"] as const) {
  describe(`landing (${locale})`, () => {
    const e = EXPECT[locale];
    const mount = () =>
      render(
        <LocaleProvider initial={locale}>
          <Landing />
        </LocaleProvider>,
      );

    it("has the hook with the DSCA source as a text link", () => {
      mount();
      expect(norm(screen.getByTestId("hook").textContent)).toBe(e.hook);
      const moncloa = screen.getByTestId("moncloa-source");
      expect(moncloa.getAttribute("href")).toBe(MONCLOA_DENTIX_URL);
      expect(norm(moncloa.textContent)).toBe(e.source);
      expect(norm(screen.getByTestId("hook-2026").textContent)).toBe(e.again);
      expect(norm(screen.getByTestId("hook-claim").textContent)).toBe(e.claim);
      const link = screen.getByTestId("dsca-source");
      expect(link.getAttribute("href")).toBe(DSCA_SOURCE_URL);
      expect(link.textContent).toContain("dsca.gob.es");
    });

    it("has the three how-it-works steps and the positioning line", () => {
      mount();
      expect(screen.getByRole("heading", { name: e.how })).toBeTruthy();
      const steps = screen.getAllByTestId("how-step").map((s) => norm(s.querySelector("h3")?.textContent ?? null));
      expect(steps).toEqual([...e.steps]);
      expect(norm(screen.getByTestId("positioning-line").textContent)).toBe(e.positioning);
    });

    it("has CTAs to /demo, /clinic and /p/demo; the primary opens the sample patient plan", () => {
      mount();
      const links = screen.getAllByRole("link");
      const hrefs = links.map((a) => a.getAttribute("href"));
      for (const h of ["/demo", "/clinic", "/p/demo"]) expect(hrefs).toContain(h);
      expect(links[0]?.getAttribute("href")).toBe("/p/demo");
      expect(links[0]?.className).toContain("bg-primary");
      expect(screen.getByTestId("cta-director").getAttribute("href")).toBe("/demo");
    });

    it("puts the PayPerPhase column right after the row labels", () => {
      mount();
      const heads = Array.from(screen.getByTestId("comparison").querySelectorAll("thead th")).map((h) => norm(h.textContent));
      expect(heads[1]).toBe("PayPerPhase");
      const firstRow = screen.getByTestId("comparison").querySelector("tbody tr")!;
      expect(firstRow.children[1]!.className).toContain("bg-primary/5");
    });

    it("has the trust strip and the GDPR line, and no images from third parties", () => {
      mount();
      expect(norm(screen.getByTestId("trust-strip").textContent)).toBe(TRUST_STRIP_COPY[locale]);
      expect(norm(screen.getByTestId("gdpr").textContent)).toBe(GDPR_COPY[locale]);
      expect(document.querySelectorAll("img").length).toBe(0);
    });
  });
}
