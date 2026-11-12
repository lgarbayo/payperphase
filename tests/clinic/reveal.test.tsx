// @vitest-environment jsdom
/**
 * staggered extraction reveal: ~120 ms between lines, each revealed line pulses its teeth
 * on the odontogram (`highlight`) and adds marks; the check bar lands once every line is shown.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionReveal, REVEAL_STEP_MS } from "@/components/clinic/ExtractionReveal";
import { translate, type KeyOf, type Vars } from "@/i18n/core";
import type { ClinicT } from "@/components/clinic/shared";
import { cachedGolden } from "./helpers";

vi.mock("@/components/odontogram/Odontogram", () => ({
  Odontogram: (p: { marks: { tooth: number }[]; highlight?: number[] }) => (
    <div
      data-testid="odontogram"
      data-marks={p.marks.map((m) => m.tooth).join(",")}
      data-highlight={(p.highlight ?? []).join(",")}
    />
  ),
  marksFromLines: (lines: { teeth: number[]; category: string }[]) =>
    lines.flatMap((l) => l.teeth.map((tooth) => ({ tooth, category: l.category, state: "planned" }))),
}));
vi.mock("@/components/motion", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Stagger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const t = ((key: KeyOf<"clinic">, vars?: Vars) => translate("clinic", "es", key, vars)) as ClinicT;
const lineCount = () => screen.queryAllByTestId("quote-line").length;
const odo = () => screen.getByTestId("odontogram");

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ExtractionReveal", () => {
  it("staggers the 12 golden lines ~120 ms apart, pulsing and marking teeth as they appear", () => {
    expect(REVEAL_STEP_MS).toBe(120);
    const done = vi.fn();
    render(<ExtractionReveal extraction={cachedGolden()} locale="es" t={t} onRevealComplete={done} />);

    expect(lineCount()).toBe(1);
    expect(screen.queryByTestId("check-bar")).toBeNull();
    expect(odo().getAttribute("data-marks")).toBe("");

    act(() => vi.advanceTimersByTime(REVEAL_STEP_MS * 3)); // L4 "Extracción simple pieza 36"
    expect(lineCount()).toBe(4);
    expect(odo().getAttribute("data-highlight")).toBe("36");
    expect(odo().getAttribute("data-marks")).toBe("36");

    act(() => vi.advanceTimersByTime(REVEAL_STEP_MS * 2)); // L6 implants 36 and 46
    expect(lineCount()).toBe(6);
    expect(odo().getAttribute("data-highlight")).toBe("36,46");
    expect(odo().getAttribute("data-marks")).toBe("36,37,36,46");

    act(() => vi.advanceTimersByTime(REVEAL_STEP_MS * 6));
    expect(lineCount()).toBe(12);
    expect(screen.getByTestId("check-bar")).toBeTruthy();
    expect(done).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(2_000)); // the last pulse fades out
    expect(odo().getAttribute("data-highlight")).toBe("");
  });

  it("shows everything at once with stepMs 0 or prefers-reduced-motion", () => {
    const mm = vi.fn(() => ({ matches: true }) as MediaQueryList);
    vi.stubGlobal("matchMedia", mm);
    window.matchMedia = mm;
    render(<ExtractionReveal extraction={cachedGolden()} locale="es" t={t} />);
    expect(lineCount()).toBe(12);
    expect(screen.getByTestId("check-bar")).toBeTruthy();
    vi.unstubAllGlobals();
    // @ts-expect-error reset the jsdom default (no matchMedia)
    delete window.matchMedia;
  });

  it("'a revisar' mid-reveal shows every line and scrolls to the first flagged one", () => {
    render(<ExtractionReveal extraction={cachedGolden()} locale="es" t={t} stepMs={0} />);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    act(() => screen.getByTestId("check-review").click());
    act(() => vi.advanceTimersByTime(10));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe("quote-line-L12");
  });
});
