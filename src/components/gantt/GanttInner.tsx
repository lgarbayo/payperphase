"use client";
/**
 * Client-only Bryntum Gantt (loaded via next/dynamic ssr:false from PlanGantt).
 * The ONLY module that imports @bryntum/*.
 *
 * Bryntum draws, our clinical engine decides:
 * - every task is manuallyScheduled and comes from planToBryntum() (engine dates via toLocalDate),
 *   so Bryntum's own scheduler never moves a date the engine did not compute;
 * - TaskDrag.validatorFn → engine.validateMove (sync, memoised per day by the drag controller);
 * - a valid drop previews engine.reschedule (successors glide) and calls onMoveCommitted;
 * - an invalid drop snaps back (Bryntum) and calls onMoveRejected with the clinician note;
 * - a new `plan` prop updates the records in place (animated via `transition`), the baseline ghost stays.
 *
 * Bryntum features used, and why:
 * - baselines: the approved plan as a ghost bar under each visit, plus a ghost for chat what-if previews;
 * - timeRanges: the simulated "today" line, a red line per breached deadline, and temporary
 *   healing/safe zones while dragging;
 * - indicators.deadlineDate: per-visit deadline flag, pinned to the exact day;
 * - labels / taskRenderer / column renderers: dates, amounts and statuses from the engine meta;
 * - summary: a "paid this month" footer row summed from the payment milestones;
 * - taskMenu: patient actions (pay a phase, ask for a delay), everything else filtered out;
 * - dependencies tooltip: explains the healing lag between two phases;
 * - svalbard-dark theme + LocaleManager (Es / EnGb), restyled through ./gantt.css.
 */
import "@bryntum/gantt/gantt.css";
import "@bryntum/gantt/svalbard-dark.css";
import "@bryntum/gantt/fontawesome/css/fontawesome.css";
import "@bryntum/gantt/fontawesome/css/solid.css";
import "@bryntum/gantt/locales/gantt.locale.Es.js";
import "@bryntum/gantt/locales/gantt.locale.EnGb.js";
import "./gantt.css";
import { Gantt, LocaleManager, type DomConfig, type GanttConfig, type TaskModel } from "@bryntum/gantt";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeadlineWarning, Locale, Plan } from "@/contracts";
import { daysBetween, fromLocalDate, toLocalDate } from "@/lib/dates";
import { createDragController } from "./dragController";
import {
  afterLabel,
  amountCell,
  bandCell,
  dependencyTipHtml,
  dragTipHtml,
  escapeHtml,
  nameCell,
  statusCell,
  tooltipHtml,
} from "./ganttText";
import { GanttLegend, LEGEND_HEIGHT } from "./GanttLegend";
import { syncProject, type ProjectLike } from "./projectSync";
import { amountLabel, planToBryntum, shortDate, tg, type GanttTaskMeta, type PlanToBryntum } from "./toBryntum";
import type { PlanGanttProps } from "./types";

const BRYNTUM_LOCALE: Record<Locale, string> = { es: "Es", en: "EnGb" };
const FLASH_MS = 7000;
/** Temporary drag-time constraint zones. Never produced by planToBryntum, so projectSync never touches them. */
const ZONE_HEAL_ID = "ppp-zone-heal";
const ZONE_SAFE_ID = "ppp-zone-safe";

type Shown = { plan: Plan; warnings?: DeadlineWarning[]; mapping: PlanToBryntum };

function sameRange(a: PlanToBryntum | null, b: PlanToBryntum) {
  return !!a && a.rangeIso.startDate === b.rangeIso.startDate && a.rangeIso.endDate === b.rangeIso.endDate;
}

export default function GanttInner(props: PlanGanttProps) {
  const { plan, today, locale, mode, notes, ghostShifts, warnings, height = 420, hideLegend = false } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<Gantt | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const shownRef = useRef<Shown | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastAttemptRef = useRef<{ phaseId: string; date: string } | null>(null);
  const lastPropPlanRef = useRef<Plan>(plan);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const metaOf = (id: string | number | undefined): GanttTaskMeta | undefined =>
    id === undefined ? undefined : shownRef.current?.mapping.meta[String(id)];

  const mappingFor = useCallback((p: Plan, w?: DeadlineWarning[]) => {
    const cur = latest.current;
    return planToBryntum(p, {
      today: cur.today,
      locale: cur.locale,
      mode: cur.mode,
      notes: cur.notes,
      ghostShifts: cur.ghostShifts,
      warnings: w ?? cur.warnings,
    });
  }, []);

  /** Draw `p` (prop plan or engine preview). Updates are queued so they land in order. */
  const renderPlan = useCallback(
    (p: Plan, w?: DeadlineWarning[]) => {
      const gantt = ganttRef.current;
      if (!gantt) return;
      const prev = shownRef.current?.mapping ?? null;
      const next = mappingFor(p, w);
      shownRef.current = { plan: p, warnings: w, mapping: next };
      queueRef.current = queueRef.current
        .then(async () => {
          if (gantt.isDestroyed) return;
          await syncProject(gantt.project as unknown as ProjectLike, prev, next);
          if (gantt.isDestroyed) return;
          if (!sameRange(prev, next)) gantt.setTimeSpan(next.range.startDate, next.range.endDate);
          gantt.refreshRows();
        })
        .catch((err) => console.error("[PlanGantt] update failed", err));
    },
    [mappingFor],
  );

  const showFlash = useCallback((message: string) => {
    setFlash(message);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  }, []);

  const controller = useMemo(
    () =>
      createDragController({
        getPlan: () => shownRef.current?.plan ?? latest.current.plan,
        getToday: () => latest.current.today,
        getLocale: () => latest.current.locale,
        getNotes: () => latest.current.notes,
        onMoveRejected: (info) => latest.current.onMoveRejected?.(info),
        onMoveCommitted: (move) => latest.current.onMoveCommitted?.(move),
        onPreview: (res) => renderPlan(res.plan, res.warnings),
      }),
    [renderPlan],
  );

  // ── Mount Bryntum once ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let gantt: Gantt | null = null;
    try {
      void LocaleManager.applyLocale(BRYNTUM_LOCALE[latest.current.locale]);
      const first = mappingFor(latest.current.plan);
      shownRef.current = { plan: latest.current.plan, mapping: first };
      lastPropPlanRef.current = latest.current.plan;
      gantt = new Gantt({ appendTo: host, ...buildConfig(first) });
      ganttRef.current = gantt;
      // Esc / drag aborted: no drop event, so the zones must go here (not in GanttListeners' typings).
      (gantt as unknown as { on(name: string, fn: () => void): void }).on("taskDragAbortFinalized", () => clearZones());
      setStatus("ready");
    } catch (err) {
      console.error("[PlanGantt] Bryntum failed to start", err);
      setStatus("error");
    }
    return () => {
      clearZones();
      ganttRef.current = null;
      gantt?.destroy();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Narrow parents: drop the band chip, then the status pill, so the timeline keeps its room ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const apply = (width: number) => {
      const gantt = ganttRef.current;
      if (!gantt || gantt.isDestroyed) return;
      const columns = gantt.columns as unknown as { getById(id: string): { hidden: boolean; width: number } | undefined };
      const band = columns.getById("band");
      const st = columns.getById("status");
      // Phones (patients open the plan from the QR code): only the phase column stays, ~150 px wide,
      // so the timeline keeps ≥200 px and "Hoy (simulado)" is readable.
      const phone = width < 640;
      const amount = columns.getById("amount");
      const name = columns.getById("name");
      if (amount) amount.hidden = phone;
      if (name) name.width = phone ? 150 : 228;
      // Patient mode never shows "Forma de pago": the phase cards already carry that chip.
      if (band) band.hidden = latest.current.mode === "patient" || width < 1080;
      if (st) st.hidden = width < 860;
    };
    const ro = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? host.clientWidth));
    ro.observe(host);
    apply(host.clientWidth);
    return () => ro.disconnect();
  }, [status, mode]);

  // ── Props → chart (in place) ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt || gantt.isDestroyed) return;
    void LocaleManager.applyLocale(BRYNTUM_LOCALE[locale]);
    for (const [id, key] of [
      ["name", "colPhase"],
      ["amount", "colAmount"],
      ["status", "colStatus"],
      ["band", "colBand"],
    ] as const) {
      const columns = gantt.columns as unknown as { getById(id: string): { text: string } | undefined };
      const col = columns.getById(id);
      if (col) col.text = tg(locale, key);
    }
    gantt.readOnly = mode !== "patient";
    // A new plan from the parent wins; otherwise redraw what is shown (e.g. an unpersisted preview).
    const source = plan !== lastPropPlanRef.current ? plan : (shownRef.current?.plan ?? plan);
    const sourceWarnings = plan !== lastPropPlanRef.current ? undefined : shownRef.current?.warnings;
    lastPropPlanRef.current = plan;
    renderPlan(source, sourceWarnings);
  }, [plan, today, locale, mode, notes, ghostShifts, warnings, renderPlan]);

  function buildConfig(first: PlanToBryntum): Partial<GanttConfig> {
    const L = () => latest.current.locale;
    const cell =
      (fn: (m: GanttTaskMeta, locale: Locale) => unknown) =>
      ({ record }: { record: { id: string | number } }) => {
        const m = metaOf(record.id);
        return (m ? fn(m, L()) : "") as DomConfig | string;
      };

    return {
      cls: "ppp-gantt",
      project: { tasks: first.tasksData, dependencies: first.dependenciesData, timeRanges: first.timeRangesData },
      startDate: first.range.startDate,
      endDate: first.range.endDate,
      viewPreset: {
        id: "pppYearMonth",
        base: "monthAndYear",
        // Top lane is left blank for the time-range labels ("Hoy (simulado)", deadline), so they
        // never cover a month name; months carry the year on the first cell and on January.
        headers: [
          { unit: "year", renderer: () => "" },
          {
            unit: "month",
            renderer: (start: Date, end: Date, _cfg: unknown, index: number) =>
              monthHeader(start, end, index, L(), (hostRef.current?.clientWidth ?? 1000) < 640),
          },
        ],
      },
      forceFit: true,
      autoAdjustTimeAxis: false,
      weekStartDay: 1,
      rowHeight: 38,
      barMargin: 4,
      snap: true,
      timeResolution: { unit: "day", increment: 1 },
      readOnly: latest.current.mode !== "patient",
      transition: { changeEvent: true },
      zoomOnMouseWheel: false,
      zoomOnTimeAxisDoubleClick: false,
      columns: [
        {
          id: "name",
          type: "name",
          text: tg(latest.current.locale, "colPhase"),
          width: 228,
          sortable: false,
          renderer: cell(nameCell),
        },
        {
          id: "amount",
          text: tg(latest.current.locale, "colAmount"),
          width: 92,
          align: "end",
          sortable: false,
          renderer: cell(amountCell),
        },
        {
          id: "status",
          text: tg(latest.current.locale, "colStatus"),
          width: 116,
          sortable: false,
          renderer: cell(statusCell),
        },
        {
          id: "band",
          text: tg(latest.current.locale, "colBand"),
          width: 126,
          sortable: false,
          renderer: cell(bandCell),
        },
      ],
      taskRenderer: ({ taskRecord }) => {
        const m = metaOf(taskRecord.id);
        // Visit pills carry their phase number (white on the status colour), so they read at plan scale.
        if (m?.kind === "visit") return { tag: "span", className: "ppp-visit-n", text: String(m.n) };
        // Text only on windows long enough to hold it (lab fabrication's 2 weeks stays clean).
        if (m?.kind === "healing" && m.minLagDays !== undefined && daysBetween(m.startDate, m.endDate) >= 35) {
          return { tag: "span", className: "ppp-heal-text", text: shortHealing(m, L()) };
        }
        return "";
      },
      features: {
        baselines: {
          template: ({ baseline }) => {
            const b = baseline as unknown as { startDate: Date; cls?: { value?: string } | string };
            const ghost = String((b.cls as { value?: string })?.value ?? b.cls ?? "").includes("ppp-ghost-shift");
            const date = shortDate(fromLocalDate(b.startDate), L());
            return `<div class="ppp-tip">${tg(L(), ghost ? "tipPreview" : "tipBaseline", { date })}</div>`;
          },
        },
        dependencies: {
          allowCreate: false,
          showLagInTooltip: true,
          radius: 6,
          clickWidth: 6,
          tooltipTemplate: (dependency) => {
            const d = dependency as unknown as { id: string; lag: number; fromEvent?: { id: string }; toEvent?: { id: string } };
            const from = metaOf(d.fromEvent?.id);
            const to = metaOf(d.toEvent?.id);
            if (!from || !to) return "";
            const heal = metaOf(`heal-${from.phaseId}-${to.phaseId}`);
            return dependencyTipHtml(from, to, d.lag, heal?.noteTitle, L());
          },
        },
        dependencyEdit: false,
        indicators: {
          items: {
            earlyDates: false,
            lateDates: false,
            constraintDate: false,
            // TaskModel.deadlineDate drawn by Bryntum's deadline indicator, pinned to the exact day
            // (the built-in snaps to the end of the month tick at this zoom).
            deadlineDate: (taskRecord: TaskModel) => {
              const m = metaOf(taskRecord.id);
              // Once breached, the red deadline time range takes over (and the flag would cover the date label).
              if (!m || m.kind !== "visit" || !m.deadlineDate || m.deadlineExceededDays) return null;
              if (m.deadlineDate > (shownRef.current?.mapping.rangeIso.endDate ?? m.deadlineDate)) return null;
              return {
                startDate: toLocalDate(m.deadlineDate),
                cls: `b-deadline-date ppp-deadline${m.deadlineExceededDays ? " ppp-deadline-hit" : ""}`,
                name: tg(L(), "tipDeadline", { date: shortDate(m.deadlineDate, L()) }),
              };
            },
            // No € indicator on visit pills: the pill carries the phase number and the payment
            // diamond row right below already shows the money.
            dueDate: false,
          },
        },
        labels: {
          // Date before the visit pill (the dependency line leaves from its end), amount after the diamond.
          before: {
            renderer: ({ taskRecord, domConfig }) => {
              const m = metaOf(taskRecord.id);
              domConfig.text = m?.kind === "visit" ? afterLabel(m, L()) : "";
            },
          },
          after: {
            renderer: ({ taskRecord, domConfig }) => {
              const m = metaOf(taskRecord.id);
              domConfig.text = m?.kind === "payment" ? afterLabel(m, L()) : "";
            },
          },
        },
        timeRanges: { showCurrentTimeLine: false, showHeaderElements: true },
        // Footer "Pagas este mes": the money over time, summed from the payment milestones due in each month tick.
        summary: {
          showTooltip: false,
          summaries: [
            {
              label: tg(latest.current.locale, "summaryPaid"),
              renderer: ({ startDate, endDate }: { startDate: Date; endDate: Date }) =>
                monthPaymentsHtml(shownRef.current?.mapping.meta ?? {}, fromLocalDate(startDate), fromLocalDate(endDate), L()),
            },
          ] as never, // the shipped typings model a summary as a tick, not as { label, renderer }
        },
        taskTooltip: {
          hoverDelay: 120,
          maxWidth: 340,
          template: ({ taskRecord }) => {
            const m = metaOf(taskRecord.id);
            return m ? tooltipHtml(m, L(), latest.current.notes) : "";
          },
        },
        taskMenu: {
          items: {
            pppPay: {
              text: tg(latest.current.locale, "menuPay"),
              icon: "fa fa-credit-card",
              weight: 100,
              onItem: ({ taskRecord }) => {
                const m = metaOf(taskRecord?.id as string);
                if (m) latest.current.onPayPhase?.(m.phaseId);
              },
            },
            pppDelay: {
              text: tg(latest.current.locale, "menuAskDelay"),
              icon: "fa fa-clock",
              weight: 110,
              onItem: ({ taskRecord }) => {
                const m = metaOf(taskRecord?.id as string);
                if (m) latest.current.onAskDelay?.(m.phaseId);
              },
            },
          },
          processItems: ({ taskRecord, items }) => {
            for (const key of Object.keys(items)) if (key !== "pppPay" && key !== "pppDelay") items[key] = false;
            const cur = latest.current;
            const m = metaOf(taskRecord.id);
            if (!m || cur.mode !== "patient") return false;
            const canPay = Boolean(cur.onPayPhase) && (m.status === "due" || m.status === "overdue");
            const canDelay = Boolean(cur.onAskDelay) && m.lock === null;
            if (!canPay && !canDelay) return false;
            items.pppPay = canPay ? { ...(items.pppPay as object), text: tg(cur.locale, "menuPay") } : false;
            items.pppDelay = canDelay ? { ...(items.pppDelay as object), text: tg(cur.locale, "menuAskDelay") } : false;
          },
        },
        taskDrag: {
          showExactDropPosition: true,
          tip: { maxWidth: 320 },
          tooltipTemplate: ({ taskRecord, startDate }) => {
            const m = metaOf(taskRecord.id);
            if (!m) return "";
            const date = fromLocalDate(startDate);
            return dragTipHtml(m, date, L(), controller.validate(m.phaseId, date));
          },
          validatorFn: (taskRecords, startDate) => {
            const m = metaOf(taskRecords[0]?.id);
            if (!m || m.kind !== "visit") return { valid: false, message: "" };
            const date = fromLocalDate(startDate);
            lastAttemptRef.current = { phaseId: m.phaseId, date };
            const verdict = controller.validate(m.phaseId, date);
            return verdict.valid ? { valid: true, message: "" } : { valid: false, message: verdict.message };
          },
        },
        // Calm, read-mostly chart: no editing UIs.
        taskEdit: false,
        cellEdit: false,
        taskResize: false,
        taskDragCreate: false,
        percentBar: false,
        cellMenu: false,
        headerMenu: false,
        scheduleMenu: false,
        timeAxisHeaderMenu: false,
        rowReorder: false,
        sort: false,
        columnReorder: false,
        taskCopyPaste: false,
        projectLines: false,
        nonWorkingTime: false,
        scheduleTooltip: false,
        taskSegmentDrag: false,
        taskSegmentResize: false,
        rollups: false,
      },
      listeners: {
        beforeTaskDrag: ({ taskRecord }: { taskRecord: TaskModel }) => {
          const m = metaOf(taskRecord.id);
          const ok = Boolean(
            m && m.kind === "visit" && m.draggable && latest.current.mode === "patient" && controller.canDrag(m.phaseId),
          );
          clearZones();
          if (ok && m) {
            setFlash(null); // a new drag starts: drop the previous snap-back message
            showZones(m);
          }
          return ok;
        },
        afterTaskDrop: ({ taskRecords, valid }: { taskRecords: TaskModel[]; valid: boolean }) => {
          clearZones();
          const rec = taskRecords[0];
          const m = metaOf(rec?.id);
          if (!rec || !m || m.kind !== "visit") return;
          const attempt = lastAttemptRef.current?.phaseId === m.phaseId ? lastAttemptRef.current.date : null;
          lastAttemptRef.current = null;
          if (!valid) {
            if (!attempt) return;
            const out = controller.snapBack(m.phaseId, attempt);
            if (out.kind === "rejected") {
              showFlash(out.verdict.message);
              nudge(rec);
            }
            return;
          }
          const dropped = attempt ?? fromLocalDate(rec.startDate as Date);
          const out = controller.drop(m.phaseId, dropped);
          if (out.kind !== "committed") {
            // Bryntum already moved the bar: put the engine's dates back.
            const shown = shownRef.current;
            if (shown) renderPlan(shown.plan, shown.warnings);
            if (out.kind === "rejected") {
              showFlash(out.verdict.message);
              nudge(rec);
            }
          } else {
            setFlash(null);
          }
        },
      },
    };
  }

  /** Remove the drag-time zones (idempotent: valid drop, invalid drop, next drag start, unmount). */
  function clearZones() {
    const gantt = ganttRef.current;
    if (!gantt || gantt.isDestroyed) return;
    const store = gantt.project.timeRangeStore as unknown as { getById(id: string): unknown; remove(r: unknown): void };
    for (const id of [ZONE_HEAL_ID, ZONE_SAFE_ID]) {
      const rec = store.getById(id);
      if (rec) store.remove(rec);
    }
  }

  /**
   * Make validatorFn's invisible rule visible while a visit is dragged: the hatched "still healing" span
   * (pred end → engine minEndDate) and the soft-green safe window (minEndDate → clinical deadline).
   * Built only from the healing meta the engine already produced (no second rule here).
   */
  function showZones(visit: GanttTaskMeta) {
    const gantt = ganttRef.current;
    const shown = shownRef.current;
    if (!gantt || gantt.isDestroyed || !shown) return;
    const heal = Object.values(shown.mapping.meta).find(
      (h) => h.kind === "healing" && h.phaseId === visit.phaseId && h.minEndDate,
    );
    if (!heal?.minEndDate) return;
    const loc = latest.current.locale;
    const records: object[] = [
      {
        id: ZONE_HEAL_ID,
        name: tg(loc, "zoneHealing", { date: shortDate(heal.minEndDate, loc) }),
        startDate: toLocalDate(heal.startDate),
        endDate: toLocalDate(heal.minEndDate),
        cls: "ppp-zone ppp-zone-heal",
      },
    ];
    const safeEnd = heal.maxEndDate ?? visit.deadlineDate;
    if (safeEnd && safeEnd > heal.minEndDate) {
      records.push({
        id: ZONE_SAFE_ID,
        name: tg(loc, "zoneSafe"),
        startDate: toLocalDate(heal.minEndDate),
        endDate: toLocalDate(safeEnd),
        cls: "ppp-zone ppp-zone-safe",
      });
    }
    gantt.project.timeRangeStore.add(records as never);
  }

  /** Nudge the bar Bryntum just snapped back, so the rejection is felt as well as read. */
  function nudge(rec: TaskModel) {
    const el = ganttRef.current?.getElementFromTaskRecord(rec);
    if (!el) return;
    el.classList.remove("ppp-rejected");
    void el.offsetWidth; // force a reflow so the nudge animation restarts on repeated rejections
    el.classList.add("ppp-rejected");
    setTimeout(() => el.classList.remove("ppp-rejected"), 900);
  }

  const chartHeight = Math.max(160, height - (hideLegend ? 0 : LEGEND_HEIGHT));
  return (
    <div
      className="ppp-gantt-root"
      style={{ height, "--ppp-sum-label": JSON.stringify(tg(locale, "summaryPaid")) } as CSSProperties}
      data-testid="plan-gantt"
      data-mode={mode}
      data-status={status}
    >
      <div ref={hostRef} className="ppp-gantt-host" style={{ height: chartHeight }} />
      {status === "loading" && (
        <div className="ppp-gantt-overlay" aria-live="polite">
          {tg(locale, "loading")}
        </div>
      )}
      {status === "error" && (
        <div className="ppp-gantt-overlay ppp-gantt-overlay-error" role="alert">
          {tg(locale, "error")}
        </div>
      )}
      {!hideLegend && (
        <GanttLegend
          locale={locale}
          mode={mode}
          hasBaseline={Boolean(plan.baseline)}
          hasPreview={Boolean(ghostShifts?.length)}
          flash={flash}
        />
      )}
    </div>
  );
}

/** Sum of the payment milestones due in [from, to) as one coloured amount ("" when none). */
function monthPaymentsHtml(meta: Record<string, GanttTaskMeta>, from: string, to: string, locale: Locale): string {
  const due = Object.values(meta).filter((m) => m.kind === "payment" && m.dueDate >= from && m.dueDate < to);
  if (due.length === 0) return "";
  const cents = due.reduce((sum, m) => sum + m.amountCents, 0);
  // All paid → green; otherwise the most urgent open status.
  const status = due.every((m) => m.status === "paid")
    ? "paid"
    : (["overdue", "due", "processing", "upcoming"] as const).find((st) => due.some((m) => m.status === st)) ?? "scheduled";
  return `<span class="ppp-sum ppp-status-${status}">${escapeHtml(amountLabel(cents, locale))}</span>`;
}

/** "nov 2026 · dic · ene 2027 · feb …": the year on the first readable month and on January. */
function monthHeader(start: Date, end: Date, index: number, locale: Locale, compact = false): string {
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (index === 0 && days < 12) return ""; // a sliver of the previous month at the left edge
  const month = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { month: "short" }).format(start).replace(".", "");
  const firstReadable = index === 0 || (index === 1 && start.getDate() === 1);
  if (compact) return month; // ~28 px per month on a phone: no room for the year
  return firstReadable || start.getMonth() === 0 ? `${month} ${start.getFullYear()}` : month;
}

/** Short in-bar label for a healing window ("min. 8 wk"), in weeks when it divides evenly. */
function shortHealing(m: GanttTaskMeta, locale: Locale): string {
  const days = m.minLagDays ?? 0;
  return days % 7 === 0 ? tg(locale, "healingRowMinWeeks", { weeks: days / 7 }) : tg(locale, "healingRowMinDays", { days });
}
