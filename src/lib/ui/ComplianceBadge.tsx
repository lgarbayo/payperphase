import { COMPLIANCE_COPY } from "@/contracts/constants";
import type { Locale } from "@/contracts/primitives";

export function ComplianceBadge({ locale }: { locale: Locale }) {
  return (
    <p data-testid="compliance" className="text-xs text-muted">
      {COMPLIANCE_COPY[locale]}
    </p>
  );
}
