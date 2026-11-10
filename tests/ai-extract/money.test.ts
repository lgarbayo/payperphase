import { describe, expect, it } from "vitest";
import { parseQuantity, parseSpanishDate, parseSpanishMoney } from "@/ai/extract";

describe("parseSpanishMoney", () => {
  it.each([
    ["1.250,00 €", 125_000],
    ["1250,00", 125_000],
    ["40 €", 4_000],
    ["4.070,00 €", 407_000],
    ["1,5", 150],
    ["€ 90,00", 9_000],
    ["1.500,00 €", 150_000],
    ["750,00 EUR", 75_000],
    ["0,00 €", 0],
    ["1.250", 125_000],
    ["1.000.000,00 €", 100_000_000],
  ])("parses %j → %i cents", (text, cents) => {
    expect(parseSpanishMoney(text)).toBe(cents);
  });

  it.each(["abc", "1.25.0", "12,345", "", "   ", "€", "1,250.00", "-50,00 €", "1.2345,00", "12,", "1.5"])(
    "rejects %j",
    (text) => {
      expect(parseSpanishMoney(text)).toBeNull();
    },
  );
});

describe("parseQuantity", () => {
  it.each([
    ["1", 1],
    ["2", 2],
    ["2 ud.", 2],
    ["3 uds", 3],
    ["x2", 2],
    ["2,00", 2],
  ])("parses %j → %i", (text, n) => {
    expect(parseQuantity(text)).toBe(n);
  });

  it.each(["", "0", "1,5", "dos", "-1"])("rejects %j", (text) => {
    expect(parseQuantity(text)).toBeNull();
  });
});

describe("parseSpanishDate", () => {
  it.each([
    ["12/11/2026", "2026-11-12"],
    ["1/2/2027", "2027-02-01"],
    ["12-11-2026", "2026-11-12"],
    ["12.11.26", "2026-11-12"],
    ["12 de noviembre de 2026", "2026-11-12"],
    [" 3 de Enero de 2027 ", "2027-01-03"],
  ])("parses %j → %s", (text, iso) => {
    expect(parseSpanishDate(text)).toBe(iso);
  });

  it.each(["31/02/2026", "2026-11-12", "12/13/2026", "", "noviembre 2026", "12 de brumario de 2026"])(
    "rejects %j",
    (text) => {
      expect(parseSpanishDate(text)).toBeNull();
    },
  );
});
