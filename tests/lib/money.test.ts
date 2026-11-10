import { describe, expect, it } from "vitest";
import { centsToPayPalValue, formatCents, payPalValueToCents, sumCents } from "@/lib/money";

describe("lib/money", () => {
  it("converts cents to PayPal values and back", () => {
    expect(centsToPayPalValue(150_000)).toBe("1500.00");
    expect(centsToPayPalValue(36_005)).toBe("360.05");
    expect(payPalValueToCents("1950.00")).toBe(195_000);
    expect(payPalValueToCents("12.5")).toBe(1_250);
    expect(() => centsToPayPalValue(1.5)).toThrow();
  });

  it("formats EUR for es and en", () => {
    expect(formatCents(150_000, "es").replace(/ /g, " ")).toBe("1500,00 €".replace("1500", "1.500"));
    expect(formatCents(150_000, "en")).toBe("€1,500.00");
    expect(formatCents(36_000, "en", { whole: true })).toBe("€360");
  });

  it("sums cents", () => {
    expect(sumCents([1, 2, 3])).toBe(6);
  });
});
