"use client";
/**
 * Public entry: <PlanGantt {...PlanGanttProps}/>.
 * Bryntum Gantt touches `window` on import, so it is loaded client-only (next/dynamic, ssr:false)
 * behind a skeleton; GanttInner is the only module that imports @bryntum/*. This wrapper also
 * sizes the chart to the plan (every row visible, no internal scroll) and renders the empty state.
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useLocale } from "@/i18n";
import { translate } from "@/i18n/core";
import { ganttHeightFor, planToBryntum } from "./toBryntum";
import type { PlanGanttProps } from "./types";

function GanttSkeleton() {
  const { locale } = useLocale();
  return (
    <div
      className="flex h-full flex-col gap-3 overflow-hidden rounded-[var(--ppp-radius)] border border-border bg-surface p-4"
      data-testid="plan-gantt-loading"
      aria-busy="true"
    >
      <div className="h-5 w-1/3 animate-pulse rounded bg-surface-2" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-4">
          <div className="h-3.5 w-1/4 rounded bg-surface-2" />
          <div className="h-3 rounded bg-surface-2" style={{ marginLeft: `${6 + i * 8}%`, width: `${12 + (i % 3) * 7}%` }} />
        </div>
      ))}
      <span className="sr-only">{translate("gantt", locale, "loading")}</span>
    </div>
  );
}

const GanttInner = dynamic(() => import("./GanttInner"), { ssr: false, loading: () => <GanttSkeleton /> });

export function PlanGantt(props: PlanGanttProps) {
  const fallback = props.height ?? 420;
  const { plan, today, locale, mode, hideLegend } = props;
  // The chart sizes itself to the plan (every row visible, no internal scroll); `height` is only a fallback.
  const height = useMemo(
    () =>
      plan.phases.length === 0
        ? fallback
        : ganttHeightFor(planToBryntum(plan, { today, locale, mode }), { hideLegend }),
    [plan, today, locale, mode, hideLegend, fallback],
  );
  if (plan.phases.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[var(--ppp-radius)] border border-dashed border-border bg-surface text-sm text-muted"
        style={{ height: Math.min(fallback, 200) }}
        data-testid="plan-gantt-empty"
      >
        {translate("gantt", locale, "empty")}
      </div>
    );
  }
  return (
    <div style={{ height }} className="w-full min-w-0">
      <GanttInner {...props} height={height} />
    </div>
  );
}
export type { PlanGanttProps } from "./types";
