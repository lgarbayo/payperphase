/**
 * OWNED BY WP-14. "Claude reads · Code decides money & dates · Your dentist approves every word".
 * Props are consumed by WP-07 (under the clinic Gantt): keep `{ locale }`. The full sentence stays one text node.
 */
import { TRUST_STRIP_COPY } from "@/contracts/constants";
import type { Locale } from "@/contracts";
import { cx } from "@/lib/ui/cx";

export function TrustStrip({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <p
      data-testid="trust-strip"
      className={cx(
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-ink shadow-[var(--ppp-shadow)]",
        className,
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-primary">
        <path
          d="M12 2l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M8.5 12.2l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{TRUST_STRIP_COPY[locale]}</span>
    </p>
  );
}
