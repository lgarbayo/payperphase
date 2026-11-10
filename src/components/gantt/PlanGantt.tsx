"use client";
/**
 * OWNED BY WP-05. Public entry: <PlanGantt {...PlanGanttProps}/>. Bryntum is client-only.
 */
import dynamic from "next/dynamic";
import type { PlanGanttProps } from "./types";

const GanttInner = dynamic(() => import("./GanttInner"), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-[var(--ppp-radius)] bg-surface-2" />,
});

export function PlanGantt(props: PlanGanttProps) {
  return <GanttInner {...props} />;
}
export type { PlanGanttProps } from "./types";
