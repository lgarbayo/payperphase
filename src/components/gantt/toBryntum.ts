/**
 * OWNED BY WP-05. Pure Plan → Bryntum data mapping (no @bryntum import, runs in node tests).
 *
 * Bryntum never computes a date here: every start/end comes from the plan (engine output) and is
 * handed over through `toLocalDate`, the only Date bridge. Every task is `manuallyScheduled`.
 *
 * Row layout (flat, chronological staircase):
 *   visit ph1 · payment ph1 · healing ph1→ph2 · visit ph2 · payment ph2 · healing ph2→ph3 · …
 * - visit:   the 1-day appointment, coloured by `payment.status`, draggable in patient mode when
 *            future + unpaid + undelivered. Carries Bryntum's `deadlineDate` (engine `deadlineFor`).
 * - payment: a milestone (diamond) at `payment.dueDate`, coloured by `payment.status`.
 * - healing: `pred.endDate → phase.startDate`; the `minLagDays` part is hatched, the part past
 *            `maxLagDays` turns red (CSS vars --ppp-min-pct / --ppp-max-pct). No baseline ghost.
 * Dependencies are visit → visit, end-to-start, with the engine's `minLagDays` as lag.
 */
import type {
  ClinicalNote,
  DeadlineWarning,
  FitBand,
  HealingWindow,
  Locale,
  NoteId,
  PaymentStatus,
  Phase,
  PhaseShift,
  Plan,
} from "@/contracts";
import { deadlineFor, healingWindows } from "@/engine";
import { translate, type KeyOf, type Vars } from "@/i18n/core";
import {
  addDays,
  compareIso,
  daysBetween,
  formatIsoDate,
  maxIso,
  minIso,
  toLocalDate,
  type IsoDate,
} from "@/lib/dates";
import { formatCents } from "@/lib/money";

export type GanttMode = "patient" | "clinic" | "readonly";
export type GanttTaskKind = "visit" | "payment" | "healing";
/** Why a visit cannot be dragged (null = draggable). */
export type LockReason = "paid" | "delivered" | "past" | "mode";

/** Bryntum DependencyModel.Type.EndToStart. */
export const DEP_END_TO_START = 2;
export const TODAY_RANGE_ID = "ppp-today";

/** Legend strip under the chart (GanttLegend). Lives here so the height maths stays pure. */
export const LEGEND_HEIGHT = 40;
export const GANTT_ROW_HEIGHT = 38;
const GANTT_HEADER_HEIGHT = 70;
/** Footer summary row ("Pagas este mes"). */
export const GANTT_SUMMARY_HEIGHT = 40;
const GANTT_SCROLLBAR_PAD = 16;
const GANTT_MIN_HEIGHT = 240;
const GANTT_MAX_HEIGHT = 680;

/**
 * Pixel height that shows every row of the plan with no internal vertical scrollbar:
 * two-lane header + rows + summary footer + legend strip + a scrollbar pad, clamped to [240, 680].
 * `hideLegend` drops the legend strip (the chart then needs 40 px less).
 */
export function ganttHeightFor(m: Pick<PlanToBryntum, "tasksData">, opts: { hideLegend?: boolean } = {}): number {
  const legend = opts.hideLegend ? 0 : LEGEND_HEIGHT;
  const raw = GANTT_HEADER_HEIGHT + m.tasksData.length * GANTT_ROW_HEIGHT + GANTT_SUMMARY_HEIGHT + legend + GANTT_SCROLLBAR_PAD;
  return Math.min(GANTT_MAX_HEIGHT, Math.max(GANTT_MIN_HEIGHT, raw));
}

export const visitTaskId = (phaseId: string) => `visit-${phaseId}`;
export const paymentTaskId = (phaseId: string) => `pay-${phaseId}`;
export const healingTaskId = (fromPhaseId: string, toPhaseId: string) => `heal-${fromPhaseId}-${toPhaseId}`;
export const dependencyId = (fromPhaseId: string, toPhaseId: string) => `dep-${fromPhaseId}-${toPhaseId}`;
export const deadlineRangeId = (phaseId: string) => `ppp-deadline-${phaseId}`;

export interface GanttBaselineData {
  startDate: Date;
  endDate: Date;
  cls?: string;
}

/** Bryntum TaskModel config (plus `kind`/`phaseId`, kept on record.data). */
export interface GanttTaskData {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  manuallyScheduled: true;
  draggable: boolean;
  resizable: false;
  cls: string;
  style?: string;
  baselines: GanttBaselineData[];
  deadlineDate?: Date;
  kind: GanttTaskKind;
  phaseId: string;
}

export interface GanttDependencyData {
  id: string;
  fromTask: string;
  toTask: string;
  type: number;
  lag: number;
  lagUnit: "day";
  cls: string;
}

export interface GanttTimeRangeData {
  id: string;
  name: string;
  startDate: Date;
  endDate?: Date;
  cls: string;
}

/** Everything the renderers, tooltips and the drag wiring need, keyed by task id. */
export interface GanttTaskMeta {
  id: string;
  kind: GanttTaskKind;
  phaseId: string;
  n: number;
  title: string;
  status: PaymentStatus;
  amountCents: number;
  band: FitBand;
  startDate: IsoDate;
  endDate: IsoDate;
  dueDate: IsoDate;
  draggable: boolean;
  lock: LockReason | null;
  deadlineDate?: IsoDate;
  deadlineExceededDays?: number;
  deadlineNoteId?: NoteId;
  baselineStart?: IsoDate;
  previewStart?: IsoDate;
  // healing only
  fromPhaseId?: string;
  noteId?: NoteId;
  noteTitle?: string;
  minLagDays?: number;
  minEndDate?: IsoDate;
  maxEndDate?: IsoDate;
  extraDays?: number;
  exceeded?: boolean;
}

export interface PlanToBryntumOptions {
  /** Simulated today (date-only ISO). */
  today: IsoDate;
  locale: Locale;
  mode: GanttMode;
  notes?: Partial<Record<NoteId, ClinicalNote>>;
  ghostShifts?: PhaseShift[];
  /** Engine warnings from the last reschedule preview; merged with the ones derived from `deadlineFor`. */
  warnings?: DeadlineWarning[];
}

export interface PlanToBryntum {
  tasksData: GanttTaskData[];
  dependenciesData: GanttDependencyData[];
  timeRangesData: GanttTimeRangeData[];
  meta: Record<string, GanttTaskMeta>;
  /** Visible timeline window (local Dates for Bryntum) and its ISO twin. */
  range: { startDate: Date; endDate: Date };
  rangeIso: { startDate: IsoDate; endDate: IsoDate };
}

type T = KeyOf<"gantt">;
export function tg(locale: Locale, key: T, vars?: Vars): string {
  return translate("gantt", locale, key, vars);
}

export const BAND_KEY: Record<FitBand, T> = {
  PAY_IN_3: "bandPayIn3",
  INSTALLMENTS: "bandInstallments",
  PAYPAL_ONLY: "bandPayPalOnly",
};

/** Patient drag rule: only future, unpaid, undelivered visits move. */
export function phaseLock(phase: Phase, today: IsoDate): Exclude<LockReason, "mode"> | null {
  if (phase.delivery.status === "delivered") return "delivered";
  if (phase.payment.status === "paid" || phase.payment.status === "processing") return "paid";
  if (compareIso(phase.startDate, today) <= 0) return "past";
  return null;
}

export function isPhaseDraggable(phase: Phase, today: IsoDate, mode: GanttMode): boolean {
  return mode === "patient" && phaseLock(phase, today) === null;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "100%";
  const v = Math.max(0, Math.min(100, (part / whole) * 100));
  return `${Math.round(v * 10) / 10}%`;
}

/** "mín. 8 sem" when the lag is whole weeks, else "mín. 10 días". */
export function minLagLabel(days: number, locale: Locale): string {
  return days % 7 === 0
    ? tg(locale, "healingRowMinWeeks", { weeks: days / 7 })
    : tg(locale, "healingRowMinDays", { days });
}


export function planToBryntum(plan: Plan, opts: PlanToBryntumOptions): PlanToBryntum {
  const { today, locale, mode } = opts;
  const notes = opts.notes ?? {};
  const phases = [...plan.phases].sort((a, b) => a.n - b.n);
  const byId = new Map(phases.map((p) => [p.id, p]));
  const baseline = new Map((plan.baseline?.phases ?? []).map((b) => [b.phaseId, b]));
  const ghosts = new Map((opts.ghostShifts ?? []).map((s) => [s.phaseId, s]));
  const windows = healingWindows(plan);
  const windowsInto = new Map<string, HealingWindow[]>();
  for (const w of windows) windowsInto.set(w.toPhaseId, [...(windowsInto.get(w.toPhaseId) ?? []), w]);
  const engineWarnings = new Map((opts.warnings ?? []).map((w) => [w.phaseId, w]));

  const tasksData: GanttTaskData[] = [];
  const dependenciesData: GanttDependencyData[] = [];
  const timeRangesData: GanttTimeRangeData[] = [
    { id: TODAY_RANGE_ID, name: tg(locale, "todayLine"), startDate: toLocalDate(today), cls: "ppp-today" },
  ];
  const meta: Record<string, GanttTaskMeta> = {};
  const datesForRange: IsoDate[] = [today];


  for (const phase of phases) {
    const title = phase.title[locale];
    const lock: LockReason | null = mode !== "patient" ? "mode" : phaseLock(phase, today);
    const draggable = lock === null;
    const status = phase.payment.status;
    const base = baseline.get(phase.id);
    const ghost = ghosts.get(phase.id);

    // Deadline: engine's deadlineFor (pred.endDate + maxLagDays). Exceeded when the visit starts after it.
    const deadline = deadlineFor(plan, phase.id) ?? undefined;
    const warning = engineWarnings.get(phase.id);
    const derivedExceed = deadline ? daysBetween(deadline, phase.startDate) : 0;
    const exceededDays = warning?.exceededByDays ?? (derivedExceed > 0 ? derivedExceed : undefined);
    const dep = phase.dependsOn.find((d) => d.maxLagDays !== undefined && d.deadlineNoteId);
    const deadlineNoteId = warning?.noteId ?? dep?.deadlineNoteId;

    const common = {
      phaseId: phase.id,
      n: phase.n,
      title,
      status,
      amountCents: phase.amountCents,
      band: phase.fit.band,
      startDate: phase.startDate,
      endDate: phase.endDate,
      dueDate: phase.payment.dueDate,
      lock,
      draggable,
    };

    // Healing windows into this phase (rows sit between the predecessor's payment and this visit).
    for (const w of windowsInto.get(phase.id) ?? []) {
      const gap = daysBetween(w.startDate, w.actualEndDate);
      if (gap <= 0) continue; // nothing to draw (and a 0-length task would render as a milestone)
      const minLagDays = daysBetween(w.startDate, w.minEndDate);
      const maxLagDays = w.maxEndDate ? daysBetween(w.startDate, w.maxEndDate) : undefined;
      const exceeded = maxLagDays !== undefined && gap > maxLagDays;
      const id = healingTaskId(w.fromPhaseId, phase.id);
      const noteTitle = notes[w.noteId]?.title[locale] ?? tg(locale, "healingFallback");
      tasksData.push({
        id,
        name: `${noteTitle} · ${minLagLabel(minLagDays, locale)}`,
        startDate: toLocalDate(w.startDate),
        endDate: toLocalDate(w.actualEndDate),
        manuallyScheduled: true,
        draggable: false,
        resizable: false,
        cls: ["ppp-healing", exceeded ? "ppp-healing-exceeded" : ""].filter(Boolean).join(" "),
        style: `--ppp-min-pct:${pct(minLagDays, gap)};--ppp-max-pct:${maxLagDays !== undefined ? pct(maxLagDays, gap) : "100%"}`,
        // No ghost under healing windows: the visit and payment ghosts already show the approved plan.
        baselines: [],
        kind: "healing",
        phaseId: phase.id,
      });
      meta[id] = {
        ...common,
        id,
        kind: "healing",
        draggable: false,
        startDate: w.startDate,
        endDate: w.actualEndDate,
        fromPhaseId: w.fromPhaseId,
        noteId: w.noteId,
        noteTitle,
        minLagDays,
        minEndDate: w.minEndDate,
        maxEndDate: w.maxEndDate,
        extraDays: Math.max(0, gap - minLagDays),
        exceeded,
      };
      datesForRange.push(w.startDate, w.actualEndDate);
    }

    // Visit task.
    const visitId = visitTaskId(phase.id);
    const visitBaselines: GanttBaselineData[] = [];
    if (base) visitBaselines.push({ startDate: toLocalDate(base.startDate), endDate: toLocalDate(base.endDate) });
    if (ghost) {
      visitBaselines.push({
        startDate: toLocalDate(ghost.toStart),
        endDate: toLocalDate(addDays(ghost.toStart, phase.durationDays)),
        cls: "ppp-ghost-shift",
      });
    }
    tasksData.push({
      id: visitId,
      name: tg(locale, "phaseRow", { n: phase.n, title }),
      startDate: toLocalDate(phase.startDate),
      endDate: toLocalDate(phase.endDate),
      manuallyScheduled: true,
      draggable,
      resizable: false,
      cls: [
        "ppp-visit",
        `ppp-status-${status}`,
        draggable ? "ppp-draggable" : "ppp-locked",
        phase.delivery.status === "delivered" ? "ppp-delivered" : "",
        exceededDays ? "ppp-deadline-exceeded" : "",
      ]
        .filter(Boolean)
        .join(" "),
      baselines: visitBaselines,
      ...(deadline ? { deadlineDate: toLocalDate(deadline) } : {}),
      kind: "visit",
      phaseId: phase.id,
    });
    meta[visitId] = {
      ...common,
      id: visitId,
      kind: "visit",
      deadlineDate: deadline,
      deadlineExceededDays: exceededDays,
      deadlineNoteId,
      baselineStart: base?.startDate,
      previewStart: ghost?.toStart,
    };
    datesForRange.push(phase.startDate, phase.endDate);
    if (base) datesForRange.push(base.startDate, base.endDate);
    if (ghost) datesForRange.push(ghost.toStart, addDays(ghost.toStart, phase.durationDays));

    if (deadline && exceededDays) {
      timeRangesData.push({
        id: deadlineRangeId(phase.id),
        name: tg(locale, "tipDeadline", { date: shortDate(deadline, locale) }),
        startDate: toLocalDate(deadline),
        cls: "ppp-deadline-line",
      });
    }

    // Payment milestone (diamond) at dueDate.
    const payId = paymentTaskId(phase.id);
    const due = phase.payment.dueDate;
    const payBaselines: GanttBaselineData[] = [];
    if (base) payBaselines.push({ startDate: toLocalDate(base.dueDate), endDate: toLocalDate(base.dueDate) });
    if (ghost) payBaselines.push({ startDate: toLocalDate(ghost.toDue), endDate: toLocalDate(ghost.toDue), cls: "ppp-ghost-shift" });
    tasksData.push({
      id: payId,
      name: tg(locale, "paymentRow", { n: phase.n }),
      startDate: toLocalDate(due),
      endDate: toLocalDate(due),
      manuallyScheduled: true,
      draggable: false,
      resizable: false,
      cls: ["ppp-payment", `ppp-status-${status}`].join(" "),
      baselines: payBaselines,
      kind: "payment",
      phaseId: phase.id,
    });
    meta[payId] = {
      ...common,
      id: payId,
      kind: "payment",
      draggable: false,
      startDate: due,
      endDate: due,
      baselineStart: base?.dueDate,
      previewStart: ghost?.toDue,
    };
    datesForRange.push(due);
  }

  // Phase-to-phase dependencies: visit → visit with the engine's minimum lag.
  for (const phase of phases) {
    for (const d of phase.dependsOn) {
      if (!byId.has(d.phaseId)) continue;
      dependenciesData.push({
        id: dependencyId(d.phaseId, phase.id),
        fromTask: visitTaskId(d.phaseId),
        toTask: visitTaskId(phase.id),
        type: DEP_END_TO_START,
        lag: d.minLagDays,
        lagUnit: "day",
        cls: "ppp-dep",
      });
    }
  }

  // Visible window: ~2.5 weeks before the first date (room for its date label) to past the last date, and far
  // enough right that the next draggable visit can be dragged beyond its clinical deadline.
  const lo = minIso(...datesForRange);
  let hi = addDays(maxIso(...datesForRange), 35);
  const nextDraggableDeadline = phases
    .filter((p) => isPhaseDraggable(p, today, mode))
    .map((p) => meta[visitTaskId(p.id)]?.deadlineDate)
    .find((d): d is IsoDate => Boolean(d));
  if (nextDraggableDeadline) hi = maxIso(hi, addDays(nextDraggableDeadline, 21));
  // Pull in deadline flags that sit just past the edge instead of clipping them.
  for (const m of Object.values(meta)) {
    if (m.deadlineDate && m.deadlineDate > hi && daysBetween(hi, m.deadlineDate) <= 30) hi = addDays(m.deadlineDate, 10);
  }
  // Left padding scales with the span so the first date label never clips when the chart is compressed.
  const startIso = addDays(lo, -Math.max(18, Math.round(daysBetween(lo, hi) * 0.07)));
  const endIso = hi;

  return {
    tasksData,
    dependenciesData,
    timeRangesData,
    meta,
    range: { startDate: toLocalDate(startIso), endDate: toLocalDate(endIso) },
    rangeIso: { startDate: startIso, endDate: endIso },
  };
}

/** "12 ene 2027" / "12 Jan 2027". */
export function shortDate(date: IsoDate, locale: Locale): string {
  return formatIsoDate(date, locale);
}

export function amountLabel(cents: number, locale: Locale): string {
  return formatCents(cents, locale, { whole: true });
}

/**
 * Identity of the rows/arrows. Same key → the chart can update records in place (animated);
 * different key → reload the project data.
 */
export function structureKey(m: Pick<PlanToBryntum, "tasksData" | "dependenciesData">): string {
  return [...m.tasksData.map((t) => t.id), "|", ...m.dependenciesData.map((d) => d.id)].join(",");
}
