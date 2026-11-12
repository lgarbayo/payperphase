// @vitest-environment jsdom
/**
 * Parity: a real Bryntum ProjectModel (jsdom), loaded from planToBryntum(), must end up with
 * exactly the engine's dates after its own scheduling pass (commitAsync). Bryntum never moves
 * a date: every task is manuallyScheduled and dependencies only carry the engine's lag.
 */
import { describe, expect, it } from "vitest";
import { GOLDEN_DELAY_MOVE, GOLDEN_PLAN, GOLDEN_START_DATE, goldenPlan } from "@/contracts/fixtures/implantCase";
import type { Plan } from "@/contracts";
import { reschedule } from "@/engine";
import { addDays, fromLocalDate } from "@/lib/dates";
import { syncProject } from "@/components/gantt/projectSync";
import {
  healingTaskId,
  paymentTaskId,
  planToBryntum,
  visitTaskId,
  type PlanToBryntum,
} from "@/components/gantt/toBryntum";
import { loadBryntum } from "./helpers/bryntum";

const today = GOLDEN_START_DATE;
const opts = { today, locale: "es" as const, mode: "patient" as const };

/** The documented +42-day cascade of the demo's delay move (what the engine returns). */
function delayedPlan(): Plan {
  const plan = goldenPlan();
  for (const p of plan.phases) {
    if (p.n < 2) continue;
    p.startDate = addDays(p.startDate, 42);
    p.endDate = addDays(p.endDate, 42);
    p.payment.dueDate = p.startDate;
  }
  return plan;
}

async function buildProject(m: PlanToBryntum) {
  const { ProjectModel } = await loadBryntum();
  const project = new ProjectModel({ tasks: m.tasksData, dependencies: m.dependenciesData, timeRanges: m.timeRangesData });
  await project.commitAsync();
  return project;
}

type Rec = { id: string; startDate: Date; endDate: Date; manuallyScheduled: boolean; isMilestone: boolean };

function expectParity(project: { taskStore: { getById(id: string): unknown } }, plan: Plan) {
  const get = (id: string) => project.taskStore.getById(id) as Rec;
  for (const phase of plan.phases) {
    const visit = get(visitTaskId(phase.id));
    expect(visit.manuallyScheduled).toBe(true);
    expect(fromLocalDate(visit.startDate)).toBe(phase.startDate);
    expect(fromLocalDate(visit.endDate)).toBe(phase.endDate);

    const pay = get(paymentTaskId(phase.id));
    expect(pay.isMilestone).toBe(true);
    expect(fromLocalDate(pay.startDate)).toBe(phase.payment.dueDate);
    expect(fromLocalDate(pay.endDate)).toBe(phase.payment.dueDate);

    for (const d of phase.dependsOn) {
      const pred = plan.phases.find((p) => p.id === d.phaseId)!;
      const heal = get(healingTaskId(d.phaseId, phase.id));
      expect(fromLocalDate(heal.startDate)).toBe(pred.endDate);
      expect(fromLocalDate(heal.endDate)).toBe(phase.startDate);
    }
  }
}

describe("Bryntum ProjectModel parity with the engine", () => {
  it("golden plan: every task keeps the engine's start and end after commitAsync", async () => {
    const project = await buildProject(planToBryntum(GOLDEN_PLAN, opts));
    expectParity(project, GOLDEN_PLAN);
    // Dependencies keep the engine's lag and are visit → visit.
    const dep = project.dependencyStore.getById("dep-ph1-ph2") as unknown as { lag: number; fromEvent: { id: string } };
    expect(dep.lag).toBe(56);
    expect(dep.fromEvent.id).toBe("visit-ph1");
  });

  it("delayed plan (+42 d cascade, across the DST change): parity holds", async () => {
    const plan = delayedPlan();
    const project = await buildProject(planToBryntum(plan, opts));
    expectParity(project, plan);
  });

  it("the engine's own reschedule output keeps parity", async () => {
    const { plan } = reschedule(GOLDEN_PLAN, GOLDEN_DELAY_MOVE, today);
    const project = await buildProject(planToBryntum(plan, opts));
    expectParity(project, plan);
  });

  it("an in-place update (what the chart does when the parent passes a new plan) lands on the engine's dates", async () => {
    const before = planToBryntum(GOLDEN_PLAN, opts);
    const project = await buildProject(before);
    const plan = delayedPlan();
    const mode = await syncProject(project as never, before, planToBryntum(plan, opts));
    expect(mode).toBe("inplace");
    expectParity(project, plan);
    // Baseline ghost survives the what-if: it is still the approved plan.
    const visit2 = project.taskStore.getById("visit-ph2") as unknown as { baselines: { first: { startDate: Date } } };
    expect(fromLocalDate(visit2.baselines.first.startDate)).toBe("2027-01-12");
  });

  it("a structural change (deadline line appears) reloads and still matches the engine", async () => {
    const before = planToBryntum(GOLDEN_PLAN, opts);
    const project = await buildProject(before);
    // Implants 5 months late: past the 6-month extraction window → deadline line + red state.
    const plan = goldenPlan();
    const shift = 140;
    for (const p of plan.phases) {
      if (p.n < 2) continue;
      p.startDate = addDays(p.startDate, shift);
      p.endDate = addDays(p.endDate, shift);
      p.payment.dueDate = p.startDate;
    }
    const next = planToBryntum(plan, opts);
    expect(next.timeRangesData.map((r) => r.id)).toContain("ppp-deadline-ph2");
    const mode = await syncProject(project as never, before, next);
    expect(mode).toBe("reload");
    expectParity(project, plan);
  });
});
