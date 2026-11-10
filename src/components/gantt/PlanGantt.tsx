"use client";
/**
 * OWNED BY WP-05. Public entry: <PlanGantt {...PlanGanttProps}/>. Bryntum is client-only
 * (next/dynamic, ssr:false); GanttInner is the only module that imports @bryntum/*.
 */
import dynamic from "next/dynamic";
import { useLocale } from "@/i18n";
import { translate } from "@/i18n/core";
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
  const height = props.height ?? 420;
  if (props.plan.phases.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[var(--ppp-radius)] border border-dashed border-border bg-surface text-sm text-muted"
        style={{ height: Math.min(height, 200) }}
        data-testid="plan-gantt-empty"
      >
        {translate("gantt", props.locale, "empty")}
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
