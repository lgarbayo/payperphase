// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp, Reveal, Ripple, Stagger } from "@/components/motion";

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

const eur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

beforeEach(() => mockMotionPreference(false));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CountUp", () => {
  it("shows the final formatted value immediately under reduced motion", () => {
    mockMotionPreference(true);
    render(<CountUp value={371_000} format={eur} durationMs={900} />);
    expect(screen.getByText("3710,00 €")).toBeTruthy();
  });

  it("keeps showing the final value after a change under reduced motion", () => {
    mockMotionPreference(true);
    const { rerender } = render(<CountUp value={100} format={eur} />);
    rerender(<CountUp value={250} format={eur} />);
    expect(screen.getByText("2,50 €")).toBeTruthy();
  });

  it("counts up from 0 and lands exactly on the value", async () => {
    const { container } = render(<CountUp value={10_000} format={(v) => String(v)} durationMs={300} />);
    expect(container.textContent).toBe("0");
    await waitFor(() => expect(Number(container.textContent)).toBeGreaterThan(0));
    const mid = Number(container.textContent);
    expect(Number.isInteger(mid)).toBe(true);
    await waitFor(() => expect(container.textContent).toBe("10000"), { timeout: 3000 });
  });
});

describe("Ripple", () => {
  it("does not fire on mount", () => {
    const { container } = render(<Ripple trigger={0}>x</Ripple>);
    expect(container.querySelector("[data-ripple-count]")?.getAttribute("data-ripple-count")).toBe("0");
    expect(screen.queryAllByTestId("ripple-wave")).toHaveLength(0);
  });

  it("re-triggers every time `trigger` changes, and not when it is unchanged", () => {
    const { container, rerender } = render(<Ripple trigger={0}>x</Ripple>);
    const count = () => container.querySelector("[data-ripple-count]")?.getAttribute("data-ripple-count");
    rerender(<Ripple trigger={1}>x</Ripple>);
    expect(count()).toBe("1");
    expect(screen.queryAllByTestId("ripple-wave").length).toBeGreaterThan(0);
    rerender(<Ripple trigger={1}>x</Ripple>);
    expect(count()).toBe("1");
    rerender(<Ripple trigger={2}>x</Ripple>);
    expect(count()).toBe("2");
  });

  it("uses a non-travelling single flash under reduced motion", () => {
    mockMotionPreference(true);
    const { rerender } = render(<Ripple trigger={0}>x</Ripple>);
    rerender(<Ripple trigger={1}>x</Ripple>);
    expect(screen.getAllByTestId("ripple-wave")).toHaveLength(1);
  });
});

describe("Reveal and Stagger", () => {
  it("render their children with and without motion", () => {
    const a = render(
      <Reveal delayMs={100}>
        <p>hello</p>
      </Reveal>,
    );
    expect(screen.getByText("hello")).toBeTruthy();
    expect(a.container.querySelector('[data-motion="reveal"]')).toBeTruthy();
    a.unmount();
    mockMotionPreference(true);
    const b = render(
      <Reveal>
        <p>hello</p>
      </Reveal>,
    );
    expect(b.container.querySelector('[data-motion="static"]')).toBeTruthy();
    expect(b.container.querySelector('[data-motion="reveal"]')).toBeNull();
  });

  it("Stagger wraps each child once, keeping order", () => {
    const { container } = render(
      <Stagger stepMs={50}>
        <span key="a">a</span>
        <span key="b">b</span>
        <span key="c">c</span>
      </Stagger>,
    );
    const items = [...container.querySelectorAll('[data-motion="stagger"]')];
    expect(items.map((i) => i.textContent)).toEqual(["a", "b", "c"]);
  });

  it("Stagger under reduced motion adds no animation", () => {
    mockMotionPreference(true);
    const { container } = render(
      <Stagger>
        <span key="a">a</span>
        <span key="b">b</span>
      </Stagger>,
    );
    expect(container.querySelectorAll('[data-motion="stagger"]')).toHaveLength(0);
    expect(container.textContent).toBe("ab");
  });
});
