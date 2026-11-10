"use client";
/**
 * OWNED BY WP-04. Per-phase PayPal button (JS SDK v5 Buttons, EUR) + the official Pay Later message.
 * Creates the order via POST /api/paypal/orders {planId, phaseId} (server reads the amount),
 * captures via POST /api/paypal/orders/:id/capture. Mock mode renders a labelled mock button.
 * SCAFFOLD STUB: disabled placeholder.
 */
import type { Locale, PaymentStatus } from "@/contracts";
import { formatCents } from "@/lib/money";
import { Button } from "@/lib/ui";

export interface PayPhaseButtonProps {
  planId: string;
  phaseId: string;
  /** Display only; the server never trusts it. */
  amountCents: number;
  status: PaymentStatus;
  locale: Locale;
  onPaid?: (r: { phaseId: string; captureId?: string }) => void;
  onError?: (message: string) => void;
}

export function PayPhaseButton({ amountCents, status, locale }: PayPhaseButtonProps) {
  const payable = status === "due" || status === "overdue";
  return (
    <Button disabled={!payable} data-testid="pay-phase">
      {locale === "es" ? "Pagar" : "Pay"} {formatCents(amountCents, locale)}
    </Button>
  );
}
