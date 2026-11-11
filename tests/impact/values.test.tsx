// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DSCA_SOURCE_URL, type ExposureReport, type Locale } from "@/contracts";
import { ClinicClosureButton } from "@/components/impact/ClinicClosureButton";
import { ExposureMeter } from "@/components/impact/ExposureMeter";
import { goldenImpactProps, norm, preferReducedMotion } from "./fixtures";

beforeEach(() => preferReducedMotion());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CASES: Array<{ locale: Locale; loan: string; zero: string; illustrative: RegExp; source: RegExp; lead: string; continuity: RegExp }> = [
  {
    locale: "es",
    loan: "3.710,00 €",
    zero: "0,00 €",
    illustrative: /Ilustrativo: préstamo de 24 meses al 0 % que financia todo el presupuesto/,
    source: /Fuente: dsca\.gob\.es — preguntas frecuentes sobre tratamientos dentales financiados/,
    lead: "Te toca reclamar",
    continuity: /Tu plan, las notas aprobadas por tu dentista y tus recibos siguen en este enlace/,
  },
  {
    locale: "en",
    loan: "€3,710.00",
    zero: "€0.00",
    illustrative: /Illustrative: a 24-month 0% loan financing the whole quote/,
    source: /Source: dsca\.gob\.es — FAQ on financed dental treatment/,
    lead: "Yours to claim back",
    continuity: /Your plan, the notes approved by your dentist and your receipts stay on this link/,
  },
];

describe("impact visuals on the golden plan (ph1 paid and delivered)", () => {
  it("engine props are the golden numbers", () => {
    const { report, stress } = goldenImpactProps();
    expect(report.prepaidUndeliveredCents).toBe(0);
    expect(stress.linkedLoan.owedForUndeliveredCents).toBe(371_000);
    expect(stress.payPerPhase.owedForUndeliveredCents).toBe(0);
    expect(stress.undeliveredPhaseIds).toEqual(["ph2", "ph3", "ph4"]);
  });

  for (const c of CASES) {
    describe(c.locale.toUpperCase(), () => {
      it(`closure panel shows ${c.loan} vs ${c.zero}, is illustrative and cites DSCA`, async () => {
        const { stress } = goldenImpactProps();
        render(<ClinicClosureButton stress={stress} locale={c.locale} />);

        expect(screen.queryByTestId("closure-panel")).toBeNull();
        fireEvent.click(screen.getByTestId("closure-button"));
        const panel = await screen.findByTestId("closure-panel");

        const loan = within(panel).getByTestId("closure-loan-owed");
        const ppp = within(panel).getByTestId("closure-ppp-owed");
        // Screen-reader value is final immediately; the visible CountUp settles within ~1 s.
        expect(norm(loan.querySelector(".sr-only")?.textContent)).toBe(c.loan);
        expect(norm(ppp.querySelector(".sr-only")?.textContent)).toBe(c.zero);
        await waitFor(() => expect(norm(loan.querySelector("[aria-hidden]")?.textContent)).toBe(c.loan), { timeout: 2500 });
        await waitFor(() => expect(norm(ppp.querySelector("[aria-hidden]")?.textContent)).toBe(c.zero), { timeout: 2500 });

        expect(within(panel).getByTestId("closure-loan").getAttribute("data-tone")).toBe("alert");
        expect(within(panel).getByTestId("closure-ppp").getAttribute("data-tone")).toBe("ok");

        const text = norm(panel.textContent);
        expect(text).toContain(c.loan);
        expect(text).toContain(c.zero);
        expect(text).toMatch(c.locale === "es" ? /Ilustrativo/ : /Illustrative/);
        expect(text).toMatch(c.illustrative);
        expect(text).toMatch(c.source);
        expect(text).toContain(c.lead);
        expect(text).not.toMatch(/still owe|aún debes|debes /i);
        expect(norm(within(panel).getByTestId("closure-continuity").textContent)).toMatch(c.continuity);

        const link = within(panel).getByTestId("closure-source") as HTMLAnchorElement;
        expect(link.getAttribute("href")).toBe(DSCA_SOURCE_URL);
        expect(DSCA_SOURCE_URL).toContain("dsca.gob.es/es/");
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.getAttribute("rel")).toContain("noopener");
      });

      it(`exposure meter shows ${c.zero} in green`, () => {
        const { report } = goldenImpactProps();
        render(<ExposureMeter report={report} locale={c.locale} />);

        const meter = screen.getByTestId("exposure-meter");
        const hero = screen.getByTestId("exposure-prepaid");
        expect(norm(hero.textContent)).toBe(c.zero);
        expect(meter.getAttribute("data-tone")).toBe("ok");
        expect(hero.className).toContain("text-status-paid");
        expect(hero.className).not.toContain("text-status-overdue");

        const paid = c.locale === "es" ? "360,00 €" : "€360.00";
        const breakdown = norm(screen.getByTestId("exposure-breakdown").textContent);
        expect(breakdown).toBe(
          c.locale === "es"
            ? `Pagado ${paid} · recibido ${paid} · pendiente ${c.loan}`
            : `Paid ${paid} · received ${paid} · remaining ${c.loan}`,
        );
      });
    });
  }

  it("a synthetic report with prepaid > 0 renders the red state", () => {
    const report: ExposureReport = {
      asOf: "2026-11-16",
      totalCents: 407_000,
      paidCents: 186_000,
      deliveredCents: 36_000,
      prepaidUndeliveredCents: 150_000,
      remainingCents: 221_000,
      byPhase: [
        { phaseId: "ph1", amountCents: 36_000, paid: true, delivered: true, status: "paid" },
        { phaseId: "ph2", amountCents: 150_000, paid: true, delivered: false, status: "paid" },
        { phaseId: "ph3", amountCents: 52_000, paid: false, delivered: false, status: "scheduled" },
        { phaseId: "ph4", amountCents: 169_000, paid: false, delivered: false, status: "scheduled" },
      ],
    };
    render(<ExposureMeter report={report} locale="es" />);

    const hero = screen.getByTestId("exposure-prepaid");
    expect(norm(hero.textContent)).toBe("1.500,00 €");
    expect(screen.getByTestId("exposure-meter").getAttribute("data-tone")).toBe("alert");
    expect(hero.className).toContain("text-status-overdue");
    expect(hero.className).not.toContain("text-status-paid");
    expect(norm(screen.getByTestId("exposure-chip").textContent)).toBe("Pagado por adelantado");

    const states = Array.from(screen.getByTestId("exposure-bar").querySelectorAll("[data-state]")).map((el) =>
      el.getAttribute("data-state"),
    );
    expect(states).toEqual(["settled", "prepaid", "future", "future"]);
  });
});
