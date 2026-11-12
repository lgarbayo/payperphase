"use client";
/**
 * Legend strip under the Gantt: explains the healing hatch, extra wait, payment diamond,
 * baseline / preview ghosts (when present) and the deadline indicator flag, plus a drag (or
 * read-only) hint. After a rejected drag, the snap-back reason briefly replaces the strip.
 */
import type { Locale } from "@/contracts";
import { LEGEND_HEIGHT, tg } from "./toBryntum";

// Re-exported so the chart can size itself next to the component that owns the strip.
export { LEGEND_HEIGHT };

export function GanttLegend({
  locale,
  mode,
  hasBaseline,
  hasPreview,
  flash,
}: {
  locale: Locale;
  mode: "patient" | "clinic" | "readonly";
  hasBaseline: boolean;
  hasPreview: boolean;
  flash: string | null;
}) {
  return (
    <div className="ppp-legend" style={{ height: LEGEND_HEIGHT }} data-testid="plan-gantt-legend">
      {/* While a snap-back reason is shown it takes the whole strip, so it never truncates. */}
      {!flash && (
      <ul className="ppp-legend-items">
        <li>
          <span className="ppp-legend-swatch ppp-legend-heal" aria-hidden />
          {tg(locale, "legendHealing")}
        </li>
        <li>
          <span className="ppp-legend-swatch ppp-legend-wait" aria-hidden />
          {tg(locale, "legendWait")}
        </li>
        <li>
          <span className="ppp-diamond ppp-status-due" aria-hidden />
          {tg(locale, "legendPayment")}
        </li>
        {hasBaseline && (
          <li>
            <span className="ppp-legend-swatch ppp-legend-ghost" aria-hidden />
            {tg(locale, "legendBaseline")}
          </li>
        )}
        {hasPreview && (
          <li>
            <span className="ppp-legend-swatch ppp-legend-preview" aria-hidden />
            {tg(locale, "legendPreview")}
          </li>
        )}
        <li>
          <i className="fa fa-flag ppp-legend-flag" aria-hidden />
          {tg(locale, "legendDeadline")}
        </li>
      </ul>
      )}
      {flash ? (
        <p className="ppp-legend-flash" role="status" data-testid="plan-gantt-flash">
          <i className="fa fa-rotate-left" aria-hidden /> {flash}
        </p>
      ) : (
        <p className="ppp-legend-hint">
          {mode === "patient" ? (
            <>
              <i className="fa fa-arrows-left-right" aria-hidden /> {tg(locale, "legendDrag")}
            </>
          ) : (
            tg(locale, "legendReadonly")
          )}
        </p>
      )}
    </div>
  );
}
