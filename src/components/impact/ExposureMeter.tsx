"use client";
/**
 * OWNED BY WP-12. "Paid for treatment not yet received" meter (stays at €0 under PayPerPhase).
 *
 * Every number comes from the engine's ExposureReport (props). This component only formats and
 * lays out: a hero figure (green at 0, red above 0, with an icon + label so state is never
 * colour-alone), a "paid · received · remaining" line, a thin per-phase segmented bar that
 * separates paid-and-received from future phases, and a screen-reader text alternative.
 */
import { useId } from "react";
import type { ExposureReport, Locale } from "@/contracts";
import { Badge, cx } from "@/lib/ui";
import { AlertIcon, CheckIcon } from "./icons";
import { impactT, money, phaseNumber, toneFor } from "./shared";

type SegmentState = "settled" | "prepaid" | "future";

function segmentState(p: ExposureReport["byPhase"][number]): SegmentState {
  if (p.paid && p.delivered) return "settled";
  if (p.paid) return "prepaid";
  return "future";
}

const SEGMENT_CLASS: Record<SegmentState, string> = {
  settled: "bg-status-paid",
  prepaid: "bg-status-overdue",
  future: "bg-status-scheduled/35",
};

export function ExposureMeter({ report, locale }: { report: ExposureReport; locale: Locale }) {
  const t = impactT(locale);
  const labelId = useId();
  const summaryId = useId();
  const tone = toneFor(report.prepaidUndeliveredCents);

  const prepaid = money(report.prepaidUndeliveredCents, locale);
  const paid = money(report.paidCents, locale);
  const delivered = money(report.deliveredCents, locale);
  const remaining = money(report.remainingCents, locale);

  const phases = report.byPhase.filter((p) => p.amountCents > 0);
  const phaseLines = phases.map((p, i) => {
    const vars = { n: phaseNumber(p.phaseId, i + 1), amount: money(p.amountCents, locale) };
    const state = segmentState(p);
    return state === "settled"
      ? t("meterPhaseSettled", vars)
      : state === "prepaid"
        ? t("meterPhasePrepaid", vars)
        : t("meterPhaseFuture", vars);
  });

  return (
    <section
      data-testid="exposure-meter"
      data-tone={tone}
      aria-labelledby={labelId}
      aria-describedby={summaryId}
      className="rounded-[var(--ppp-radius)] border border-border bg-surface p-6 shadow-[var(--ppp-shadow)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={labelId} className="text-sm font-medium text-muted">
          {t("meterLabel")}
        </h2>
        {tone === "ok" ? (
          <Badge tone="paid" data-testid="exposure-chip">
            <CheckIcon className="h-3.5 w-3.5" />
            {t("meterOkChip")}
          </Badge>
        ) : (
          <Badge tone="overdue" data-testid="exposure-chip">
            <AlertIcon className="h-3.5 w-3.5" />
            {t("meterAlertChip")}
          </Badge>
        )}
      </div>

      <p
        data-testid="exposure-prepaid"
        data-cents={report.prepaidUndeliveredCents}
        className={cx(
          "mt-3 text-5xl font-semibold leading-none tracking-tight",
          tone === "ok" ? "text-status-paid" : "text-status-overdue",
        )}
      >
        {prepaid}
      </p>

      <p data-testid="exposure-breakdown" className="mt-3 text-sm text-muted">
        {t("meterBreakdown", { paid, delivered, remaining })}
      </p>

      {phases.length > 0 ? (
        <div
          role="img"
          aria-label={`${t("meterBarLabel")}: ${phaseLines.join("; ")}`}
          data-testid="exposure-bar"
          className="mt-5 flex h-2 w-full gap-[2px] overflow-hidden rounded-full"
        >
          {phases.map((p, i) => {
            const state = segmentState(p);
            return (
              <span
                key={p.phaseId}
                data-phase={p.phaseId}
                data-state={state}
                title={phaseLines[i]}
                className={cx("h-full min-w-[4px] transition-colors duration-500", SEGMENT_CLASS[state])}
                style={{ flex: `${p.amountCents} 1 0%` }}
              />
            );
          })}
        </div>
      ) : (
        <p data-testid="exposure-empty" className="mt-5 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
          {t("meterEmpty")}
        </p>
      )}

      <ul aria-hidden="true" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <LegendItem swatch={SEGMENT_CLASS.settled} label={t("meterLegendSettled")} />
        <LegendItem swatch={SEGMENT_CLASS.prepaid} label={t("meterLegendPrepaid")} />
        <LegendItem swatch={SEGMENT_CLASS.future} label={t("meterLegendFuture")} />
      </ul>

      <p id={summaryId} data-testid="exposure-summary" className="sr-only">
        {t("meterSummary", { prepaid, paid, delivered, remaining })}
      </p>
    </section>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className={cx("inline-block h-2 w-3 rounded-full", swatch)} />
      {label}
    </li>
  );
}
