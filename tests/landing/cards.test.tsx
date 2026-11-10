// @vitest-environment jsdom
/** WP-14 cards: closing card compliance + URL, title card positioning line, keyboard advance. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClosingCard, HookTitleCards } from "@/components/director/Cards";
import { COMPLIANCE_COPY, DSCA_SOURCE_URL } from "@/contracts/constants";
import { LocaleProvider } from "@/i18n";

afterEach(cleanup);
const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
const wrap = (ui: React.ReactNode, initial: "es" | "en" = "en") => render(<LocaleProvider initial={initial}>{ui}</LocaleProvider>);

describe("closing card", () => {
  it("shows the English compliance line, the tagline and the hosted URL, full-screen", () => {
    wrap(<ClosingCard url="https://payperphase.onrender.com/" />);
    const card = screen.getByTestId("closing-card");
    expect(card.className).toContain("fixed");
    expect(card.className).toContain("inset-0");
    expect(norm(screen.getByTestId("closing-compliance").textContent)).toBe(COMPLIANCE_COPY.en);
    expect(norm(card.textContent)).toContain("Pay for dental treatment phase by phase, as you receive it. Never in advance.");
    expect(screen.getByTestId("closing-url").textContent).toBe("https://payperphase.onrender.com");
  });
});

describe("hook and title cards", () => {
  it("steps hook → source → title with → and space, and ← goes back", () => {
    wrap(<HookTitleCards />);
    expect(norm(screen.getByTestId("card-hook").textContent)).toContain("In 2020 one of Spain's biggest dental chains closed overnight");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("card-source").textContent).toContain("dsca.gob.es");
    expect(screen.getByText(DSCA_SOURCE_URL)).toBeTruthy();
    fireEvent.keyDown(window, { key: " " });
    expect(norm(screen.getByTestId("card-title").textContent)).toBe(
      "PayPerPhase: pay for dental treatment phase by phase, as you receive it. Never in advance.",
    );
    expect(norm(screen.getByTestId("positioning-line").textContent)).toBe(
      "Pre-treatment quote · clinical healing windows · pay per phase · €0 exposure",
    );
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("card-source")).toBeTruthy();
  });

  it("ES title card carries the Spanish title and positioning line; ?step deep link starts there", () => {
    wrap(<HookTitleCards initialStep={2} />, "es");
    expect(norm(screen.getByTestId("card-title").textContent)).toBe(
      "PayPerPhase: paga tu tratamiento dental fase a fase, a medida que lo recibes. Nunca por adelantado.",
    );
    expect(norm(screen.getByTestId("positioning-line").textContent)).toContain("0 € de exposición");
  });
});
