// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMANENT_TEETH } from "@/contracts";
import { GOLDEN_LINES, GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { Odontogram, marksFromLines } from "@/components/odontogram/Odontogram";
import { dictionaries } from "@/i18n/core";

function mockMotionPreference(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })),
  );
}

const marks = marksFromLines(GOLDEN_LINES, GOLDEN_PLAN.phases);
const teeth = (c: HTMLElement) => [...c.querySelectorAll<SVGGElement>("[data-tooth]")];

beforeEach(() => mockMotionPreference(false));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Odontogram render", () => {
  it("renders the 32 permanent teeth, each with data-tooth", () => {
    const { container } = render(<Odontogram marks={[]} locale="es" />);
    const nums = teeth(container).map((g) => Number(g.dataset.tooth));
    expect(nums).toHaveLength(32);
    expect([...nums].sort()).toEqual([...PERMANENT_TEETH].sort());
  });

  it("draws the arches in FDI order: 18→11 | 21→28 above, 48→41 | 31→38 below", () => {
    const { container } = render(<Odontogram marks={[]} locale="es" />);
    const order = teeth(container).map((g) => Number(g.dataset.tooth));
    const x = (n: number) => Number(/translate\(([\d.]+)/.exec(teeth(container).find((g) => g.dataset.tooth === String(n))!.getAttribute("transform")!)![1]);
    const upper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
    const lower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
    for (const row of [upper, lower]) {
      const xs = row.map(x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    }
    expect(order).toHaveLength(32);
  });

  it("draws the primary dentition (55–85) only when asked", () => {
    const off = render(<Odontogram marks={[]} locale="es" />);
    expect(teeth(off.container)).toHaveLength(32);
    off.unmount();
    const on = render(<Odontogram marks={[]} locale="es" primary />);
    const nums = teeth(on.container).map((g) => Number(g.dataset.tooth));
    expect(nums).toHaveLength(52);
    for (const n of [51, 55, 61, 65, 71, 75, 81, 85]) expect(nums).toContain(n);
  });

  it("highlight sets data-highlight on exactly those teeth", () => {
    const { container } = render(<Odontogram marks={marks} highlight={[36, 46]} locale="es" />);
    const hi = teeth(container).filter((g) => g.hasAttribute("data-highlight"));
    expect(hi.map((g) => g.dataset.tooth).sort()).toEqual(["36", "46"]);
  });

  it("names every tooth for assistive tech, in Spanish and English", () => {
    const es = render(<Odontogram marks={marks} locale="es" />);
    expect(screen.getByRole("img", { name: /^Pieza 36: extracción \(fase 1\), implante \(fase 2\), pilar \(fase 3\), corona \(fase 4\)$/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Pieza 37: obturación (fase 1)" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Pieza 18" })).toBeTruthy();
    es.unmount();
    render(<Odontogram marks={marks} locale="en" />);
    expect(screen.getByRole("img", { name: "Tooth 36: extraction (phase 1), implant (phase 2), abutment (phase 3), crown (phase 4)" })).toBeTruthy();
  });

  it("puts the phase badge on marked teeth only", () => {
    const { container } = render(<Odontogram marks={marks} locale="es" />);
    expect(container.querySelector('[data-testid="phase-badge-37"]')?.textContent).toBe("1");
    expect(container.querySelector('[data-testid="phase-badge-46"]')?.textContent).toBe("2·3·4");
    expect(container.querySelector('[data-testid="phase-badge-18"]')).toBeNull();
  });

  it("makes extraction, missing, implant and crown visibly different", () => {
    const sig = (m: Parameters<typeof marksFromLines>[0] extends never ? never : import("@/components/odontogram/marks").ToothMark[]) => {
      const { container, unmount } = render(<Odontogram marks={m} locale="es" />);
      const html = teeth(container).find((g) => g.dataset.tooth === "26")!.innerHTML;
      unmount();
      return html;
    };
    const base = { tooth: 26, category: "SURGICAL" as const, phaseN: 1 };
    const extract = sig([{ ...base, state: "extract", code: "EXTRACTION" }]);
    const missing = sig([{ ...base, state: "missing", code: "EXTRACTION" }]);
    const implant = sig([{ ...base, category: "IMPLANT", state: "planned", code: "IMPLANT" }]);
    const crown = sig([{ ...base, category: "PROSTHETIC", state: "planned", code: "CROWN" }]);
    expect(new Set([extract, missing, implant, crown]).size).toBe(4);
    expect(extract).toContain("<line"); // cross
    expect(missing).toContain("url(#"); // hatch
  });

  it("shows a legend for the treatments present, and a calm empty state otherwise", () => {
    const full = render(<Odontogram marks={marks} locale="es" />);
    expect(screen.getByTestId("odontogram-legend").textContent).toMatch(/implante/);
    full.unmount();
    render(<Odontogram marks={[]} locale="es" />);
    expect(screen.getByTestId("odontogram-empty").textContent).toBe(dictionaries.odontogram.es.empty);
  });
});

describe("Odontogram reveal stagger", () => {
  it("staggers new marks by revealStaggerMs, in mark order", () => {
    const { container } = render(<Odontogram marks={marks} revealStaggerMs={150} locale="es" />);
    expect(screen.getByTestId("odontogram").dataset.reveal).toBe("staggered");
    const d = (n: number) => Number(teeth(container).find((g) => g.dataset.tooth === String(n))!.dataset.revealDelay);
    expect(d(36)).toBe(0);
    expect(d(37)).toBe(150);
    expect(d(46)).toBe(300);
  });

  it("skips the stagger under reduced motion", () => {
    mockMotionPreference(true);
    const { container } = render(<Odontogram marks={marks} revealStaggerMs={150} locale="es" />);
    expect(screen.getByTestId("odontogram").dataset.reveal).toBe("instant");
    for (const g of teeth(container).filter((t) => t.dataset.marked)) expect(g.dataset.revealDelay).toBe("0");
  });

  it("with revealStaggerMs 0 (the clinic console) there is no stagger at all", () => {
    const { container } = render(<Odontogram marks={marks} revealStaggerMs={0} locale="es" />);
    expect(screen.getByTestId("odontogram").dataset.reveal).toBe("instant");
    for (const g of teeth(container).filter((t) => t.dataset.marked)) expect(g.dataset.revealDelay).toBe("0");
  });

  it("marks added later reveal one after the other without re-staggering old ones", () => {
    const first = marks.filter((m) => m.tooth === 37);
    const { container, rerender } = render(<Odontogram marks={first} revealStaggerMs={100} locale="es" />);
    rerender(<Odontogram marks={marks.filter((m) => m.tooth !== 46)} revealStaggerMs={100} locale="es" />);
    const d = (n: number) => Number(teeth(container).find((g) => g.dataset.tooth === String(n))!.dataset.revealDelay);
    expect(d(36)).toBe(0); // the only new tooth in this render starts immediately
  });
});
