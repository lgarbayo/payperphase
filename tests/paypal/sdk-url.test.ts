import { describe, expect, it } from "vitest";
import { buildSdkUrl, isInPayLaterRange, sdkLocale, sdkNamespace } from "@/lib/paypal/sdk-url";

describe("PayPal JS SDK v5 URL", () => {
  it("matches the spike URL exactly (capture, es_ES, buyer-country ES)", () => {
    expect(buildSdkUrl({ clientId: "sb", locale: "es", buyerCountry: "ES" })).toBe(
      "https://www.paypal.com/sdk/js?client-id=sb&currency=EUR&components=buttons,messages&enable-funding=paylater&buyer-country=ES&locale=es_ES&intent=capture",
    );
  });

  it("supports intent=authorize and the en_GB locale, and omits buyer-country when unset", () => {
    const url = buildSdkUrl({ clientId: "AbC-123", locale: "en", intent: "authorize", buyerCountry: null });
    expect(url).toBe(
      "https://www.paypal.com/sdk/js?client-id=AbC-123&currency=EUR&components=buttons,messages&enable-funding=paylater&locale=en_GB&intent=authorize",
    );
    expect(sdkLocale("es")).toBe("es_ES");
    expect(sdkLocale("en")).toBe("en_GB");
  });

  it("gives each SDK configuration a stable, distinct JS-identifier namespace", () => {
    const a = buildSdkUrl({ clientId: "sb", locale: "es" });
    const b = buildSdkUrl({ clientId: "sb", locale: "en" });
    expect(sdkNamespace(a)).toBe(sdkNamespace(a));
    expect(sdkNamespace(a)).not.toBe(sdkNamespace(b));
    expect(sdkNamespace(a)).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
  });

  it("Pay Later range: €20 … €5,000 (Pay in 3 + installments)", () => {
    expect(isInPayLaterRange(1_999)).toBe(false);
    expect(isInPayLaterRange(2_000)).toBe(true);
    expect(isInPayLaterRange(36_000)).toBe(true);
    expect(isInPayLaterRange(195_000)).toBe(true);
    expect(isInPayLaterRange(500_000)).toBe(true);
    expect(isInPayLaterRange(500_001)).toBe(false);
    expect(isInPayLaterRange(12.5)).toBe(false);
  });
});
