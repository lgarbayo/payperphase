/**
 * OWNED BY WP-14. "Claude reads · Code decides money & dates · Your dentist approves every word".
 * SCAFFOLD STUB.
 */
import { TRUST_STRIP_COPY } from "@/contracts/constants";
import type { Locale } from "@/contracts";

export function TrustStrip({ locale }: { locale: Locale }) {
  return (
    <p data-testid="trust-strip" className="text-sm text-muted">
      {TRUST_STRIP_COPY[locale]}
    </p>
  );
}
