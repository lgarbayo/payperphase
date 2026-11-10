"use client";
/**
 * OWNED BY WP-04. The OFFICIAL PayPal Pay Later message (JS SDK `messages` component), unedited,
 * data-pp-amount = phase amount. Never claim eligibility in our own copy.
 * SCAFFOLD STUB: empty placeholder.
 */
import type { Locale } from "@/contracts";

export function PayLaterMessage({ amountCents, locale }: { amountCents: number; locale: Locale }) {
  void amountCents;
  void locale;
  return <div data-testid="paylater-message" />;
}
