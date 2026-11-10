// @vitest-environment jsdom
/** WP-14 landing: hook, DSCA link, positioning line, CTAs, trust strip and GDPR line in ES and EN. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Landing } from "@/components/brand/Landing";
import { DSCA_SOURCE_URL, GDPR_COPY, TRUST_STRIP_COPY } from "@/contracts/constants";
import { LocaleProvider } from "@/i18n";

afterEach(cleanup);
const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

const EXPECT = {
  es: {
    hook: "En 2020 una de las mayores cadenas dentales de España cerró de la noche a la mañana",
    positioning: "Presupuesto previo al tratamiento · ventanas clínicas de cicatrización · pago por fase · 0 € de exposición",
    steps: ["Presupuesto", "Fases", "Pagas cada fase al recibirla"],
    how: "Cómo funciona",
  },
  en: {
    hook: "In 2020 one of Spain's biggest dental chains closed overnight",
    positioning: "Pre-treatment quote · clinical healing windows · pay per phase · €0 exposure",
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
      expect(norm(screen.getByTestId("hook").textContent)).toContain(e.hook);
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

    it("has CTAs to /demo, /clinic and /p/demo", () => {
      mount();
      const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
      for (const h of ["/demo", "/clinic", "/p/demo"]) expect(hrefs).toContain(h);
    });

    it("has the trust strip and the GDPR line, and no images from third parties", () => {
      mount();
      expect(norm(screen.getByTestId("trust-strip").textContent)).toBe(TRUST_STRIP_COPY[locale]);
      expect(norm(screen.getByTestId("gdpr").textContent)).toBe(GDPR_COPY[locale]);
      expect(document.querySelectorAll("img").length).toBe(0);
    });
  });
}
