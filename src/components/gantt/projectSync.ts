/**
 * OWNED BY WP-05. Pushes a fresh `planToBryntum` mapping into a live Bryntum ProjectModel.
 * Duck-typed (no @bryntum import) so the parity test can drive a real ProjectModel under jsdom.
 *
 * Same rows/arrows/baselines → records are updated in place, which lets Bryntum animate the bars
 * (successors glide to their new dates after a what-if). Anything structural → reload the data.
 */
import { structureKey, type GanttTaskData, type PlanToBryntum } from "./toBryntum";

interface RecordLike {
  set(field: string | object, value?: unknown, silent?: boolean): void;
}
interface StoreLike {
  getById(id: string | number): RecordLike | null | undefined;
}
export interface ProjectLike {
  taskStore: StoreLike;
  dependencyStore: StoreLike;
  timeRangeStore: StoreLike;
  loadInlineData(dataPackage: object): Promise<void>;
  commitAsync(): Promise<void>;
}

const iso = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function baselineKey(tasks: GanttTaskData[]): string {
  return tasks
    .map((t) => `${t.id}:${t.baselines.map((b) => `${iso(b.startDate)}>${iso(b.endDate)}${b.cls ?? ""}`).join("+")}`)
    .join(",");
}

function rangeIdsKey(m: PlanToBryntum): string {
  return m.timeRangesData.map((r) => r.id).join(",");
}

/** Data package for ProjectModel construction / loadInlineData (7.x names: tasks/dependencies/timeRanges). */
export function projectData(m: PlanToBryntum) {
  return { tasks: m.tasksData, dependencies: m.dependenciesData, timeRanges: m.timeRangesData };
}

export function needsReload(prev: PlanToBryntum | null, next: PlanToBryntum): boolean {
  if (!prev) return true;
  return (
    structureKey(prev) !== structureKey(next) ||
    rangeIdsKey(prev) !== rangeIdsKey(next) ||
    baselineKey(prev.tasksData) !== baselineKey(next.tasksData)
  );
}

export async function syncProject(
  project: ProjectLike,
  prev: PlanToBryntum | null,
  next: PlanToBryntum,
): Promise<"reload" | "inplace"> {
  if (needsReload(prev, next)) {
    await project.loadInlineData(projectData(next));
    await project.commitAsync();
    return "reload";
  }
  for (const t of next.tasksData) {
    project.taskStore.getById(t.id)?.set({
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      cls: t.cls,
      style: t.style ?? "",
      draggable: t.draggable,
      deadlineDate: t.deadlineDate ?? null,
      kind: t.kind,
      phaseId: t.phaseId,
    });
  }
  for (const d of next.dependenciesData) project.dependencyStore.getById(d.id)?.set({ lag: d.lag });
  for (const r of next.timeRangesData) project.timeRangeStore.getById(r.id)?.set({ name: r.name, startDate: r.startDate });
  await project.commitAsync();
  return "inplace";
}
