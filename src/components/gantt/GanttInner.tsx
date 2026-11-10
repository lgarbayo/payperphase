"use client";
/**
 * OWNED BY WP-05. Client-only Bryntum Gantt (loaded via next/dynamic ssr:false from PlanGantt).
 * SCAFFOLD STUB: minimal "hello Gantt" that proves the trial package renders. Phase tasks are
 * manuallyScheduled — Bryntum never computes dates; src/engine does.
 */
import "@bryntum/gantt/gantt.css";
import "@bryntum/gantt/svalbard-light.css";
import "@bryntum/gantt/fontawesome/css/fontawesome.css";
import "@bryntum/gantt/fontawesome/css/solid.css";
import { BryntumGantt } from "@bryntum/gantt-react";
import { useMemo } from "react";
import { toLocalDate } from "@/lib/dates";
import type { PlanGanttProps } from "./types";

export default function GanttInner({ plan, locale, height = 420 }: PlanGanttProps) {
  const project = useMemo(
    () => ({
      tasksData: plan.phases.map((p) => ({
        id: p.id,
        name: `${p.n}. ${p.title[locale]}`,
        startDate: toLocalDate(p.startDate),
        endDate: toLocalDate(p.endDate),
        manuallyScheduled: true,
      })),
      dependenciesData: plan.phases.flatMap((p) =>
        p.dependsOn.map((d) => ({ id: `${d.phaseId}-${p.id}`, fromTask: d.phaseId, toTask: p.id, lag: d.minLagDays, lagUnit: "day" })),
      ),
    }),
    [plan, locale],
  );

  return (
    <div style={{ height }} data-testid="plan-gantt">
      <BryntumGantt project={project} viewPreset="weekAndMonth" columns={[{ type: "name", width: 260 }]} />
    </div>
  );
}
