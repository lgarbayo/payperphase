"use client";
/**
 * OWNED BY WP-04. The OFFICIAL PayPal Pay Later message (JS SDK `messages` component), unedited,
 * with data-pp-amount = the phase amount. Mounted only for amounts inside the Pay Later range; PayPal
 * alone decides what it says. Our own copy never claims eligibility.
 *
 * Mock mode (no PayPal client id): no SDK is loaded; the slot says, in our words, that PayPal's official
 * message appears here, with a ModeBadge. Never an imitation of the message, never an eligibility claim
 * (the phase card already carries the "within Pay in 3 range" fit badge).
 */
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/contracts";
import { translate } from "@/i18n/core";
import { centsToPayPalValue } from "@/lib/money";
import { PAY_IN_3 } from "@/contracts/constants";
import { buildSdkUrl, isInPayLaterRange, type PayPalClientConfig } from "@/lib/paypal/sdk-url";
import { ModeBadge } from "@/lib/ui";
import { loadPayPalSdk } from "./sdk";
import { usePayPalConfig } from "./usePayPalConfig";

/** Pay in 3 range (€20-€2,000): force the Pay in 3 offer, else PayPal shows "hasta 24 plazos" above ~€500. */
function offerFor(amountCents: number): string | undefined {
  return amountCents >= PAY_IN_3.minCents && amountCents <= PAY_IN_3.maxCents ? "PAY_LATER_SHORT_TERM" : undefined;
}

export function PayLaterMessage({ amountCents, locale }: { amountCents: number; locale: Locale }) {
  const { config } = usePayPalConfig();
  if (!isInPayLaterRange(amountCents)) return null;
  const value = centsToPayPalValue(amountCents);

  if (!config) {
    // Reserve the line so the card does not jump when the message arrives.
    return <div data-testid="paylater-message" data-pp-amount={value} aria-hidden className="min-h-5" />;
  }

  if (config.mode === "mock" || !config.clientId) {
    return (
      <div
        data-testid="paylater-message"
        data-pp-amount={value}
        data-mode="mock"
        className="flex flex-wrap items-center gap-2 text-xs text-muted"
      >
        <span>{translate("pay", locale, "payLaterSlot")}</span>
        <ModeBadge mode="mock" what={translate("pay", locale, "payLaterWhat")} locale={locale} />
      </div>
    );
  }

  return <OfficialMessage amountCents={amountCents} value={value} locale={locale} config={config} />;
}

function OfficialMessage({
  amountCents,
  value,
  locale,
  config,
}: {
  amountCents: number;
  value: string;
  locale: Locale;
  config: PayPalClientConfig;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const offer = offerFor(amountCents);
  const url = buildSdkUrl({
    clientId: config.clientId ?? "",
    locale,
    intent: config.intent,
    buyerCountry: config.buyerCountry,
  });

  useEffect(() => {
    let disposed = false;
    setRendered(false);
    loadPayPalSdk(url)
      .then((paypal) => {
        if (disposed || !ref.current || !paypal.Messages) return;
        ref.current.replaceChildren();
        return paypal
          .Messages({
            // Currency comes from the SDK URL (currency=EUR); PayPal validates it against the merchant.
            amount: amountCents / 100,
            placement: "payment",
            ...(offer ? { offer } : {}),
            style: { layout: "text", logo: { type: "inline" }, text: { color: "black", size: 12 } },
            onRender: () => {
              if (!disposed) setRendered(true);
            },
          })
          .render(ref.current);
      })
      .catch(() => {
        /* No message is better than a broken one; the pay button shows its own load error. */
      });
    return () => {
      disposed = true;
    };
  }, [url, amountCents, offer]);

  return (
    <div
      ref={ref}
      data-testid="paylater-message"
      data-pp-amount={value}
      data-pp-currency="EUR"
      data-pp-offer={offer}
      data-mode="live"
      data-rendered={rendered ? "true" : "false"}
      className="min-h-5"
    />
  );
}
