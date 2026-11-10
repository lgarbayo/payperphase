/**
 * OWNED BY WP-04. Isomorphic (browser-safe, no server imports): the PayPal JS SDK v5 URL and the
 * config the browser needs. Client components import THIS file, never "@/lib/paypal" (server-only).
 */
import { INSTALLMENTS, PAY_IN_3 } from "@/contracts/constants";
import type { Locale } from "@/contracts/primitives";

/**
 * Pay Later (Spain) spans Pay in 3 (€20–€2,000) and 6/12/24-month installments (up to ~€5,000).
 * The official message is only mounted inside this range; PayPal decides what it says.
 */
export function isInPayLaterRange(amountCents: number): boolean {
  return Number.isSafeInteger(amountCents) && amountCents >= PAY_IN_3.minCents && amountCents <= INSTALLMENTS.maxCents;
}

export type SdkIntent = "capture" | "authorize";

/** What GET /api/paypal/config returns to the browser. */
export interface PayPalClientConfig {
  /** "mock" → no SDK: the button runs the server create → capture path behind a labelled mock button. */
  mode: "live" | "mock";
  /** Public REST client id (null in mock mode). */
  clientId: string | null;
  /** buyer-country only works in the sandbox; ES makes the Spanish Pay Later offer render. */
  buyerCountry: string | null;
  currency: "EUR";
  intent: SdkIntent;
}

export const SDK_BASE_URL = "https://www.paypal.com/sdk/js";

export function sdkLocale(locale: Locale): "es_ES" | "en_GB" {
  return locale === "en" ? "en_GB" : "es_ES";
}

export interface SdkUrlOptions {
  clientId: string;
  locale: Locale;
  intent?: SdkIntent;
  buyerCountry?: string | null;
  components?: readonly string[];
}

/**
 * https://www.paypal.com/sdk/js?client-id=…&currency=EUR&components=buttons,messages
 *   &enable-funding=paylater&buyer-country=ES&locale=es_ES&intent=capture
 */
export function buildSdkUrl(o: SdkUrlOptions): string {
  const parts: Array<[string, string]> = [
    ["client-id", o.clientId],
    ["currency", "EUR"],
    ["components", (o.components ?? ["buttons", "messages"]).join(",")],
    ["enable-funding", "paylater"],
  ];
  if (o.buyerCountry) parts.push(["buyer-country", o.buyerCountry]);
  parts.push(["locale", sdkLocale(o.locale)], ["intent", o.intent ?? "capture"]);
  // Keep commas literal (components=buttons,messages) exactly as PayPal documents it.
  return `${SDK_BASE_URL}?${parts.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/gi, ",")}`).join("&")}`;
}

/** A JS identifier unique per SDK configuration, used as the script's data-namespace. */
export function sdkNamespace(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  return `paypal_ppp_${(h >>> 0).toString(36)}`;
}
