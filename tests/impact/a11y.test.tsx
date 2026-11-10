// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClosureStressTest, ExposureReport } from "@/contracts";
import { ClinicClosureButton } from "@/components/impact/ClinicClosureButton";
import { ExposureMeter } from "@/components/impact/ExposureMeter";
import { ImpactStrip } from "@/components/impact/ImpactStrip";
import { goldenPlan } from "@/contracts/fixtures/implantCase";
import { goldenImpactProps, norm, preferReducedMotion } from "./fixtures";

beforeEach(() => preferReducedMotion());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

function openPanel(stress: ClosureStressTest, extra: Partial<Parameters<typeof ClinicClosureButton>[0]> = {}) {
  render(<ClinicClosureButton stress={stress} locale="es" {...extra} />);
  const button = screen.getByTestId("closure-button");
  button.focus();
  fireEvent.click(button);
  return { button, panel: screen.getByTestId("closure-panel") };
}

describe("ClinicClosureButton accessibility", () => {
  it("is a native button with dialog semantics, and the panel is a labelled modal dialog", () => {
    const { stress } = goldenImpactProps();
    render(<ClinicClosureButton stress={stress} locale="es" />);
    const button = screen.getByRole("button", { name: /¿Y si la clínica cierra hoy\?/ });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-testid")).toBe("closure-panel");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(dialog.id);
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!);
    expect(norm(title?.textContent)).toBe("¿Y si la clínica cierra hoy?");
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("Esc closes the panel and returns focus to the button", () => {
    const { stress } = goldenImpactProps();
    const { button } = openPanel(stress);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByTestId("closure-panel")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.style.overflow).toBe("");
  });

  it("the close button and a backdrop click close it too", () => {
    const { stress } = goldenImpactProps();
    const { panel } = openPanel(stress);
    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByTestId("closure-panel")).toBeNull();

    fireEvent.click(screen.getByTestId("closure-button"));
    const backdrop = screen.getByTestId("closure-panel").parentElement!;
    fireEvent.mouseDown(screen.getByTestId("closure-panel")); // inside: stays open
    expect(screen.queryByTestId("closure-panel")).not.toBeNull();
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByTestId("closure-panel")).toBeNull();
  });

  it("Tab and Shift+Tab stay inside the dialog", () => {
    const { stress } = goldenImpactProps();
    const { panel } = openPanel(stress);
    const close = within(panel).getByTestId("closure-close");
    const link = within(panel).getByTestId("closure-source");

    link.focus();
    fireEvent.keyDown(link, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(link);
  });

  it("lists undelivered phases as 'Fase n', or with the titles passed in", () => {
    const { stress } = goldenImpactProps();
    const { panel } = openPanel(stress);
    const items = within(within(panel).getByTestId("closure-undelivered")).getAllByRole("listitem");
    expect(items.map((li) => norm(li.textContent))).toEqual(["Fase 2", "Fase 3", "Fase 4"]);
    cleanup();

    const plan = goldenPlan();
    const titles = Object.fromEntries(plan.phases.map((p) => [p.id, p.title]));
    const { panel: titled } = openPanel(stress, { phaseTitles: { ...titles, ph4: "Coronas" } });
    const titledItems = within(within(titled).getByTestId("closure-undelivered")).getAllByRole("listitem");
    expect(titledItems.map((li) => norm(li.textContent))).toEqual([
      "Fase 2 · Colocación de implantes",
      "Fase 3 · Pilares e impresiones",
      "Fase 4 · Coronas",
    ]);
  });

  it("shows an honest empty state when every phase was delivered", () => {
    const { stress } = goldenImpactProps();
    const done: ClosureStressTest = {
      ...stress,
      linkedLoan: { ...stress.linkedLoan, owedForUndeliveredCents: 0 },
      undeliveredPhaseIds: [],
    };
    const { panel } = openPanel(done);
    expect(within(panel).queryByTestId("closure-undelivered")).toBeNull();
    expect(within(panel).getByTestId("closure-undelivered-empty")).toBeTruthy();
    expect(within(panel).getByTestId("closure-loan").getAttribute("data-tone")).toBe("ok");
  });

  it("can open on mount for Director Mode", () => {
    const { stress } = goldenImpactProps();
    render(<ClinicClosureButton stress={stress} locale="en" defaultOpen />);
    expect(screen.getByTestId("closure-panel")).toBeTruthy();
    expect(norm(screen.getByTestId("closure-illustrative").textContent)).toBe("Illustrative");
  });
});

describe("ExposureMeter accessibility", () => {
  it("has a text alternative for the hero figure and the bar", () => {
    const { report } = goldenImpactProps();
    render(<ExposureMeter report={report} locale="es" />);
    const meter = screen.getByRole("region", { name: "Pagado por tratamiento aún no recibido" });
    const summary = document.getElementById(meter.getAttribute("aria-describedby")!);
    expect(norm(summary?.textContent)).toBe(
      "Pagado por tratamiento aún no recibido: 0,00 €. Has pagado 360,00 € y recibido tratamiento por 360,00 €; quedan 3.710,00 € por pagar en fases futuras.",
    );

    const bar = screen.getByRole("img");
    const label = norm(bar.getAttribute("aria-label"));
    expect(label).toContain("Fase 1: 360,00 €, pagada y recibida");
    expect(label).toContain("Fase 2: 1.500,00 €, pendiente");
    expect(norm(screen.getByTestId("exposure-chip").textContent)).toBe("Nunca pagas por adelantado");
  });

  it("sizes the bar segments by phase amount and separates received from future phases", () => {
    const { report } = goldenImpactProps();
    render(<ExposureMeter report={report} locale="en" />);
    const segments = Array.from(screen.getByTestId("exposure-bar").querySelectorAll<HTMLElement>("[data-phase]"));
    expect(segments.map((s) => s.dataset.state)).toEqual(["settled", "future", "future", "future"]);
    expect(segments.map((s) => s.style.flexGrow)).toEqual(["36000", "150000", "52000", "169000"]);
  });

  it("renders an empty state for a plan without phases", () => {
    const empty: ExposureReport = {
      asOf: "2026-11-16",
      totalCents: 0,
      paidCents: 0,
      deliveredCents: 0,
      prepaidUndeliveredCents: 0,
      remainingCents: 0,
      byPhase: [],
    };
    render(<ExposureMeter report={empty} locale="en" />);
    expect(screen.queryByTestId("exposure-bar")).toBeNull();
    expect(norm(screen.getByTestId("exposure-empty").textContent)).toBe("This plan has no phases yet.");
  });
});

describe("ImpactStrip", () => {
  it("composes the meter and the button", () => {
    const { report, stress } = goldenImpactProps();
    render(<ImpactStrip report={report} stress={stress} locale="es" />);
    const strip = screen.getByTestId("impact-strip");
    expect(within(strip).getByTestId("exposure-meter")).toBeTruthy();
    expect(within(strip).getByTestId("closure-button")).toBeTruthy();
  });
});
