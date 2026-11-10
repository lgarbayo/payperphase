"use client";
/**
 * OWNED BY WP-07. "Σ líneas = total impreso ✓ · 0 piezas inválidas · 1 a revisar".
 * Every figure comes from `extraction.checks` (WP-03's deterministic validation), never from the UI.
 */
import type { ExtractionChecks, Locale } from "@/contracts";
import { formatCents } from "@/lib/money";
import { cx } from "@/lib/ui";
import { Icon, type ClinicT } from "./shared";

export interface CheckBarProps {
  checks: ExtractionChecks;
  locale: Locale;
  t: ClinicT;
  /** "a revisar" click: scroll to the flagged lines. */
  onReviewClick?: () => void;
}

export function CheckBar({ checks, locale, t, onReviewClick }: CheckBarProps) {
  const sum = formatCents(checks.sumOfLinesCents, locale);
  const printed = checks.printedTotalCents === null ? null : formatCents(checks.printedTotalCents, locale);
  const invalid = checks.invalidTeeth.length;
  const review = checks.toReviewLineIds.length;

  const sumText =
    printed === null
      ? t("checkSumNoPrinted", { sum })
      : checks.sumMatches
        ? t("checkSumOk", { sum, printed })
        : t("checkSumMismatch", { sum, printed });

  return (
    <div
      data-testid="check-bar"
      data-sum-matches={String(checks.sumMatches)}
      className="flex flex-col gap-2 rounded-[var(--ppp-radius)] border border-border bg-surface px-4 py-3 shadow-[var(--ppp-shadow)] md:flex-row md:items-center md:justify-between"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span
          data-testid="check-sum"
          className={cx(
            "inline-flex items-center gap-1.5 font-medium tabular-nums",
            checks.sumMatches ? "text-status-paid" : "text-status-overdue",
          )}
        >
          <span className="text-ink">{sumText}</span>
          <span
            className={cx(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white",
              checks.sumMatches ? "bg-status-paid" : "bg-status-overdue",
            )}
          >
            {checks.sumMatches ? "✓" : "✗"}
          </span>
        </span>
        <span aria-hidden className="text-muted">
          ·
        </span>
        <span
          data-testid="check-invalid"
          className={cx("font-medium", invalid === 0 ? "text-ink" : "text-status-overdue")}
        >
          {invalid === 1 ? t("checkInvalidOne") : t("checkInvalidMany", { count: invalid })}
        </span>
        <span aria-hidden className="text-muted">
          ·
        </span>
        {review > 0 ? (
          <button
            type="button"
            data-testid="check-review"
            onClick={onReviewClick}
            title={t("checkReviewHint")}
            className="inline-flex items-center gap-1 rounded-full bg-status-upcoming/15 px-2.5 py-0.5 font-medium text-status-upcoming underline-offset-2 transition-colors hover:bg-status-upcoming/25 hover:underline"
          >
            <Icon.Alert width={14} height={14} />
            {t("checkReview", { count: review })}
          </button>
        ) : (
          <span data-testid="check-review" className="font-medium text-ink">
            {t("checkReview", { count: 0 })}
          </span>
        )}
      </div>
      <span className="text-xs text-muted">{t("checkVerifiedBy")}</span>
    </div>
  );
}
