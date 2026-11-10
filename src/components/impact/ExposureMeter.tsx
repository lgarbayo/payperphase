"use client";
/**
 * OWNED BY WP-12. "Paid for treatment not yet received" meter (stays at €0 under PayPerPhase).
 * SCAFFOLD STUB.
 */
import type { ExposureReport, Locale } from "@/contracts";
import { formatCents } from "@/lib/money";

export function ExposureMeter({ report, locale }: { report: ExposureReport; locale: Locale }) {
  return (
    <div data-testid="exposure-meter">
      {formatCents(report.paidCents, locale)} / {formatCents(report.deliveredCents, locale)} ·{" "}
      {formatCents(report.prepaidUndeliveredCents, locale)}
    </div>
  );
}
