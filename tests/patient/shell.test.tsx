// @vitest-environment jsdom
/** single-locale compliance footer, ?lang persistence, LiveBadge. */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COMPLIANCE_COPY } from "@/contracts/constants";
import { ShellCompliance } from "@/components/shell/ShellCompliance";
import { LocaleProvider, useLocale } from "@/i18n";
import { LiveBadge } from "@/lib/ui";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});
beforeEach(() => window.localStorage.clear());

function Probe() {
  return <span data-testid="loc">{useLocale().locale}</span>;
}

describe("ShellCompliance", () => {
  it("renders exactly one compliance line, in the active locale", async () => {
    window.history.replaceState(null, "", "/?lang=en");
    render(
      <LocaleProvider>
        <ShellCompliance />
      </LocaleProvider>,
    );
    await act(async () => {});
    const lines = screen.getAllByTestId("compliance");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toBe(COMPLIANCE_COPY.en);
  });

  it("defaults to Spanish", () => {
    render(
      <LocaleProvider>
        <ShellCompliance />
      </LocaleProvider>,
    );
    expect(screen.getAllByTestId("compliance")).toHaveLength(1);
    expect(screen.getByTestId("compliance").textContent).toBe(COMPLIANCE_COPY.es);
  });
});

describe("?lang persistence", () => {
  it("persists ?lang=en so a new tab without the query stays in English", async () => {
    window.history.replaceState(null, "", "/?lang=en");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId("loc").textContent).toBe("en");
    expect(window.localStorage.getItem("ppp.locale")).toBe("en");
    cleanup();

    window.history.replaceState(null, "", "/p/demo");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId("loc").textContent).toBe("en");
  });

  it("ignores an invalid ?lang", async () => {
    window.history.replaceState(null, "", "/?lang=fr");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId("loc").textContent).toBe("es");
    expect(window.localStorage.getItem("ppp.locale")).toBeNull();
  });
});

describe("LiveBadge", () => {
  it("renders only when live", () => {
    const { container, rerender } = render(<LiveBadge service="paypal" mode="mock" locale="es" />);
    expect(container.textContent).toBe("");
    rerender(<LiveBadge service="claude" mode="cached" locale="es" />);
    expect(container.textContent).toBe("");
    rerender(<LiveBadge service="paypal" mode="live" locale="en" />);
    expect(container.textContent).toBe("PayPal · sandbox");
    rerender(<LiveBadge service="claude" mode="live" locale="en" />);
    expect(container.textContent).toBe("Claude · live");
  });
});
