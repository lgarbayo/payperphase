"use client";
/** OWNED BY WP-05. Legend strip under the Gantt (also shows the snap-back reason briefly). */
import type { Locale } from "@/contracts";
import { tg } from "./toBryntum";

export const LEGEND_HEIGHT = 40;

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
