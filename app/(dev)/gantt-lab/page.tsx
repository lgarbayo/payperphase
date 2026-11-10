"use client";
/**
 * OWNED BY WP-05. Gantt lab (/gantt-lab): renders the golden plan for visual work and the
 * Gate A Bryntum smoke check on the Render URL.
 */
import { PlanGantt } from "@/components/gantt/PlanGantt";
import { GOLDEN_PLAN, GOLDEN_START_DATE } from "@/contracts/fixtures/implantCase";

export default function GanttLab() {
  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Gantt lab</h1>
      <PlanGantt plan={GOLDEN_PLAN} today={GOLDEN_START_DATE} locale="es" mode="patient" notes={{}} />
    </main>
  );
}
