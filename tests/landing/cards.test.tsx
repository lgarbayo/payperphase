// @vitest-environment jsdom
/** WP-14 cards: closing card compliance + URL, title card positioning line, keyboard advance. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClosingCard, HookTitleCards } from "@/components/director/Cards";
import { COMPLIANCE_COPY, DSCA_ADVICE_URL } from "@/contracts/constants";
import { LocaleProvider } from "@/i18n";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));

afterEach(() => {
  cleanup();
  nav.search = "";
});
const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
const wrap = (ui: React.ReactNode, initial: "es" | "en" = "en") => render(<LocaleProvider initial={initial}>{ui}</LocaleProvider>);

describe("closing card", () => {
  it("shows the tagline large, then the hosted URL, then the small compliance line in the active locale, full-screen", () => {
    wrap(<ClosingCard url="https://payperphase.onrender.com/" />);
    const card = screen.getByTestId("closing-card");
    expect(card.className).toContain("fixed");
    expect(card.className).toContain("inset-0");
    expect(norm(screen.getByTestId("closing-compliance").textContent)).toBe(COMPLIANCE_COPY.en);
    expect(norm(card.textContent)).toContain("Pay for dental treatment phase by phase, as you receive it. Never in advance.");
    expect(screen.getByTestId("closing-url").textContent).toBe("https://payperphase.onrender.com");
    // The tagline is the largest text on the card; the compliance line is the smallest.
    const vw = (id: string) => Number(/text-\[([\d.]+)vw\]/.exec(screen.getByTestId(id).className)?.[1]);
    expect(vw("closing-tagline")).toBeGreaterThanOrEqual(3.4);
    expect(vw("closing-compliance")).toBeLessThanOrEqual(1);
    const order = [screen.getByTestId("closing-tagline"), screen.getByTestId("closing-url"), screen.getByTestId("closing-compliance")];
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i]!.compareDocumentPosition(order[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("uses the Spanish compliance line in ES", () => {
    wrap(<ClosingCard url="https://payperphase.onrender.com/" />, "es");
    expect(norm(screen.getByTestId("closing-compliance").textContent)).toBe(COMPLIANCE_COPY.es);
  });
});

describe("hook and title cards", () => {
  it("steps hook → source → title with → and space, and ← goes back", () => {
    wrap(<HookTitleCards />);
    expect(norm(screen.getByTestId("card-hook").textContent)).toBe("2020: a big dental chain closes overnight.");
    expect(norm(screen.getByTestId("card-step-0").textContent)).toContain(
      "101,481 patients had paid-for treatments left unfinished; 65% of them with a linked loan.",
    );
    expect(norm(screen.getByTestId("card-hook-source").textContent)).toBe("Spanish Ministry of Consumer Affairs, 17/11/2020");
    expect(screen.getByTestId("card-hint")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("card-source").textContent).toContain("dsca.gob.es");
    expect(norm(screen.getByTestId("card-quote").textContent)).toBe(
      "«Recomendamos no pagar el importe total del tratamiento por adelantado.»",
    );
    expect(norm(screen.getByTestId("card-answer").textContent)).toBe("PayPerPhase does that by default.");
    expect(screen.getByText(DSCA_ADVICE_URL)).toBeTruthy();
    fireEvent.keyDown(window, { key: " " });
    expect(norm(screen.getByTestId("card-title").textContent)).toBe(
      "PayPerPhase: pay for dental treatment phase by phase, as you receive it. Never in advance.",
    );
    expect(norm(screen.getByTestId("positioning-line").textContent)).toBe(
      "Your healing sets the payment dates · every phase fits PayPal Pay in 3 · nothing is charged before treatment · €0 lost if the clinic closes",
    );
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("card-source")).toBeTruthy();
  });

  it("?rec=1 hides the step hint on every card but keeps the compliance line", () => {
    nav.search = "lang=en&rec=1";
    wrap(<HookTitleCards />);
    expect(screen.queryByTestId("card-hint")).toBeNull();
    expect(norm(screen.getByTestId("card-step-0").textContent)).not.toMatch(/Card 1 of 3|space to advance/);
    expect(norm(screen.getByTestId("card-step-0").textContent)).toContain(COMPLIANCE_COPY.en);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(norm(screen.getByTestId("card-step-2").textContent)).not.toMatch(/Card 3 of 3|space to advance/);
  });

  it("ES title card carries the Spanish title and positioning line; ?step deep link starts there", () => {
    wrap(<HookTitleCards initialStep={2} />, "es");
    expect(norm(screen.getByTestId("card-title").textContent)).toBe(
      "PayPerPhase: paga tu tratamiento dental fase a fase, a medida que lo recibes. Nunca por adelantado.",
    );
    expect(norm(screen.getByTestId("positioning-line").textContent)).toContain("0 € perdidos si la clínica cierra");
  });
});
