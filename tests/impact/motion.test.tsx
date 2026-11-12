// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClinicClosureButton } from "@/components/impact/ClinicClosureButton";
import { goldenImpactProps, norm } from "./fixtures";

// Record what the closure panel asks of the shared CountUp primitive (src/components/motion owns the animation
// and its reduced-motion handling); here we pin the ~1 s duration and the cents → text format.
const countUps: Array<{ value: number; durationMs?: number; sample: string }> = [];
vi.mock("@/components/motion", () => ({
  Reveal: ({ children }: { children: unknown }) => children,
  CountUp: ({ value, format, durationMs }: { value: number; format: (v: number) => string; durationMs?: number }) => {
    countUps.push({ value, durationMs, sample: format(value * 0.5 + 0.4) });
    return format(value);
  },
}));

afterEach(() => {
  cleanup();
  countUps.length = 0;
});

describe("closure counters", () => {
  it("animate both counters with CountUp over about one second", () => {
    const { stress } = goldenImpactProps();
    render(<ClinicClosureButton stress={stress} locale="es" />);
    expect(countUps).toHaveLength(0); // nothing animates before the click
    fireEvent.click(screen.getByTestId("closure-button"));

    const values = [...new Set(countUps.map((c) => c.value))];
    expect(values).toEqual([371_000, 0]);
    for (const c of countUps) expect(c.durationMs).toBeGreaterThanOrEqual(800);
    for (const c of countUps) expect(c.durationMs).toBeLessThanOrEqual(1200);
    // Intermediate frames are rounded to whole cents before formatting.
    expect(norm(countUps.find((c) => c.value === 371_000)!.sample)).toBe("1.855,00 €");
  });
});
