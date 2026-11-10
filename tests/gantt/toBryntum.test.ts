import { describe, expect, it } from "vitest";
import type { PaymentStatus, Plan } from "@/contracts";
import { GOLDEN_PLAN, GOLDEN_START_DATE, goldenPlan } from "@/contracts/fixtures/implantCase";
import { NOTE_LIBRARY } from "@data/seed/notes";
import { needsReload } from "@/components/gantt/projectSync";
import { amountCell, bandCell, escapeHtml, nameCell, statusCell, tooltipHtml } from "@/components/gantt/ganttText";
import {
  DEP_END_TO_START,
  TODAY_RANGE_ID,
  planToBryntum,
  structureKey,
  type GanttTaskData,
} from "@/components/gantt/toBryntum";
import { addDays, fromLocalDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

const today = GOLDEN_START_DATE;
const map = (plan: Plan = GOLDEN_PLAN, extra: Partial<Parameters<typeof planToBryntum>[1]> = {}) =>
  planToBryntum(plan, { today, locale: "es", mode: "patient", notes: NOTE_LIBRARY, ...extra });

const byKind = (tasks: GanttTaskData[], kind: GanttTaskData["kind"]) => tasks.filter((t) => t.kind === kind);
const iso = (d: Date) => fromLocalDate(d);

describe("planToBryntum(GOLDEN_PLAN)", () => {
  const m = map();

  it("maps to 4 visit tasks, 4 payment milestones and 3 healing tasks", () => {
    expect(byKind(m.tasksData, "visit")).toHaveLength(4);
    expect(byKind(m.tasksData, "payment")).toHaveLength(4);
    expect(byKind(m.tasksData, "healing")).toHaveLength(3);
    expect(m.tasksData).toHaveLength(11);
  });

  it("orders rows as a chronological staircase: visit, payment, healing → next visit", () => {
    expect(m.tasksData.map((t) => t.id)).toEqual([
      "visit-ph1",
      "pay-ph1",
      "heal-ph1-ph2",
      "visit-ph2",
      "pay-ph2",
      "heal-ph2-ph3",
      "visit-ph3",
      "pay-ph3",
      "heal-ph3-ph4",
      "visit-ph4",
      "pay-ph4",
    ]);
  });

  it("every task is manuallyScheduled and never resizable (Bryntum never computes dates)", () => {
    for (const t of m.tasksData) {
      expect(t.manuallyScheduled).toBe(true);
      expect(t.resizable).toBe(false);
    }
  });

  it("visit and payment dates are the engine's dates (endDate exclusive, milestone at dueDate)", () => {
    for (const p of GOLDEN_PLAN.phases) {
      const visit = m.tasksData.find((t) => t.id === `visit-${p.id}`)!;
      expect(iso(visit.startDate)).toBe(p.startDate);
      expect(iso(visit.endDate)).toBe(p.endDate);
      const pay = m.tasksData.find((t) => t.id === `pay-${p.id}`)!;
      expect(iso(pay.startDate)).toBe(p.payment.dueDate);
      expect(iso(pay.endDate)).toBe(p.payment.dueDate);
    }
  });

  it("healing tasks run from pred.endDate to phase.startDate, hatched for the min lag", () => {
    const heal = m.tasksData.find((t) => t.id === "heal-ph1-ph2")!;
    expect(iso(heal.startDate)).toBe("2026-11-17");
    expect(iso(heal.endDate)).toBe("2027-01-12");
    expect(heal.cls).toContain("ppp-healing");
    // ASAP plan: the whole window is the non-negotiable minimum.
    expect(heal.style).toContain("--ppp-min-pct:100%");
    expect(heal.draggable).toBe(false);
    // Tooltip/row title is the clinician note title.
    expect(m.meta["heal-ph1-ph2"]!.noteTitle).toBe(NOTE_LIBRARY.HEALING_EXTRACTION_MIN_8W.title.es);
    expect(heal.name).toContain("Cicatrización del hueso");
  });

  it("phase dependencies are visit → visit, end-to-start, with the engine's min lag", () => {
    expect(m.dependenciesData).toEqual([
      { id: "dep-ph1-ph2", fromTask: "visit-ph1", toTask: "visit-ph2", type: DEP_END_TO_START, lag: 56, lagUnit: "day", cls: "ppp-dep" },
      { id: "dep-ph2-ph3", fromTask: "visit-ph2", toTask: "visit-ph3", type: DEP_END_TO_START, lag: 84, lagUnit: "day", cls: "ppp-dep" },
      { id: "dep-ph3-ph4", fromTask: "visit-ph3", toTask: "visit-ph4", type: DEP_END_TO_START, lag: 14, lagUnit: "day", cls: "ppp-dep" },
    ]);
  });

  it("status CSS classes follow payment.status on both the visit and the payment diamond", () => {
    expect(m.tasksData.find((t) => t.id === "visit-ph1")!.cls).toContain("ppp-status-due");
    expect(m.tasksData.find((t) => t.id === "pay-ph1")!.cls).toContain("ppp-status-due");
    expect(m.tasksData.find((t) => t.id === "visit-ph2")!.cls).toContain("ppp-status-scheduled");
    const statuses: PaymentStatus[] = ["scheduled", "upcoming", "due", "processing", "paid", "overdue"];
    for (const status of statuses) {
      const plan = goldenPlan();
      plan.phases[2]!.payment.status = status;
      const mm = map(plan);
      expect(mm.tasksData.find((t) => t.id === "visit-ph3")!.cls.split(" ")).toContain(`ppp-status-${status}`);
      expect(mm.tasksData.find((t) => t.id === "pay-ph3")!.cls.split(" ")).toContain(`ppp-status-${status}`);
    }
  });

  it("baseline dates equal plan.baseline (visit bar and payment diamond ghosts)", () => {
    for (const b of GOLDEN_PLAN.baseline!.phases) {
      const visit = m.tasksData.find((t) => t.id === `visit-${b.phaseId}`)!;
      expect(visit.baselines).toHaveLength(1);
      expect(iso(visit.baselines[0]!.startDate)).toBe(b.startDate);
      expect(iso(visit.baselines[0]!.endDate)).toBe(b.endDate);
      const pay = m.tasksData.find((t) => t.id === `pay-${b.phaseId}`)!;
      expect(iso(pay.baselines[0]!.startDate)).toBe(b.dueDate);
    }
  });

  it("the baseline ghost stays on the approved dates after a what-if", () => {
    const plan = goldenPlan();
    for (const p of plan.phases.slice(1)) {
      p.startDate = addDays(p.startDate, 42);
      p.endDate = addDays(p.endDate, 42);
      p.payment.dueDate = p.startDate;
    }
    const mm = map(plan);
    const visit2 = mm.tasksData.find((t) => t.id === "visit-ph2")!;
    expect(iso(visit2.startDate)).toBe("2027-02-23");
    expect(iso(visit2.baselines[0]!.startDate)).toBe("2027-01-12");
    // The extra wait shows as the non-hatched part of the healing window.
    expect(mm.meta["heal-ph1-ph2"]!.extraDays).toBe(42);
    expect(mm.tasksData.find((t) => t.id === "heal-ph1-ph2")!.style).toContain("--ppp-min-pct:57.1%");
  });

  it("deadlines come from engine.deadlineFor as Bryntum deadlineDate; a breach turns the visit red", () => {
    expect(iso(m.tasksData.find((t) => t.id === "visit-ph2")!.deadlineDate!)).toBe("2027-05-16");
    expect(m.tasksData.find((t) => t.id === "visit-ph1")!.deadlineDate).toBeUndefined();
    expect(m.timeRangesData.map((r) => r.id)).toEqual([TODAY_RANGE_ID]);

    const late = goldenPlan();
    for (const p of late.phases.slice(1)) {
      p.startDate = addDays(p.startDate, 140);
      p.endDate = addDays(p.endDate, 140);
      p.payment.dueDate = p.startDate;
    }
    const mm = map(late);
    expect(mm.tasksData.find((t) => t.id === "visit-ph2")!.cls).toContain("ppp-deadline-exceeded");
    expect(mm.meta["visit-ph2"]!.deadlineExceededDays).toBe(16);
    expect(mm.tasksData.find((t) => t.id === "heal-ph1-ph2")!.cls).toContain("ppp-healing-exceeded");
    const line = mm.timeRangesData.find((r) => r.id === "ppp-deadline-ph2")!;
    expect(iso(line.startDate)).toBe("2027-05-16");
  });

  it("draws a labelled simulated-today line", () => {
    const line = m.timeRangesData[0]!;
    expect(line.name).toBe("Hoy (simulado)");
    expect(iso(line.startDate)).toBe(today);
    expect(line.endDate).toBeUndefined();
    expect(map(GOLDEN_PLAN, { locale: "en" }).timeRangesData[0]!.name).toBe("Today (simulated)");
  });

  it("the window covers the plan and reaches past the next draggable deadline", () => {
    expect(m.rangeIso.startDate < today).toBe(true);
    expect(m.rangeIso.endDate > "2027-05-16").toBe(true);
  });
});

describe("drag permissions", () => {
  it("patient mode: only future, unpaid, undelivered visits are draggable", () => {
    const m = map();
    const drag = (id: string) => m.tasksData.find((t) => t.id === id)!.draggable;
    expect(drag("visit-ph1")).toBe(false); // today = visit day
    expect(drag("visit-ph2")).toBe(true);
    expect(drag("visit-ph3")).toBe(true);
    expect(drag("pay-ph2")).toBe(false);
    expect(drag("heal-ph1-ph2")).toBe(false);
    expect(m.meta["visit-ph1"]!.lock).toBe("past");

    const paid = goldenPlan();
    paid.phases[1]!.payment.status = "paid";
    expect(map(paid).meta["visit-ph2"]!.lock).toBe("paid");
    const delivered = goldenPlan();
    delivered.phases[1]!.delivery = { status: "delivered", deliveredOn: "2027-01-12" };
    expect(map(delivered).meta["visit-ph2"]!.lock).toBe("delivered");
  });

  it("clinic and readonly modes never drag", () => {
    for (const mode of ["clinic", "readonly"] as const) {
      const m = map(GOLDEN_PLAN, { mode });
      expect(m.tasksData.every((t) => !t.draggable)).toBe(true);
      expect(m.meta["visit-ph2"]!.lock).toBe("mode");
    }
  });
});

describe("ghost shifts (chat preview)", () => {
  it("adds a translucent preview baseline at the shifted dates", () => {
    const m = map(GOLDEN_PLAN, {
      ghostShifts: [
        { phaseId: "ph2", fromStart: "2027-01-12", toStart: "2027-04-13", deltaDays: 91, fromDue: "2027-01-12", toDue: "2027-04-13" },
      ],
    });
    const visit2 = m.tasksData.find((t) => t.id === "visit-ph2")!;
    expect(visit2.baselines).toHaveLength(2);
    expect(visit2.baselines[1]!.cls).toBe("ppp-ghost-shift");
    expect(iso(visit2.baselines[1]!.startDate)).toBe("2027-04-13");
    expect(iso(visit2.baselines[1]!.endDate)).toBe("2027-04-14");
    const pay2 = m.tasksData.find((t) => t.id === "pay-ph2")!;
    expect(iso(pay2.baselines[1]!.startDate)).toBe("2027-04-13");
    // The real dates do not move: it is only a preview.
    expect(iso(visit2.startDate)).toBe("2027-01-12");
  });
});

describe("in-place updates", () => {
  it("date-only changes keep the structure (animated in place); new rows or ghosts reload", () => {
    const a = map();
    const moved = goldenPlan();
    moved.phases[3]!.startDate = addDays(moved.phases[3]!.startDate, 7);
    moved.phases[3]!.endDate = addDays(moved.phases[3]!.endDate, 7);
    moved.phases[3]!.payment.dueDate = moved.phases[3]!.startDate;
    const b = map(moved);
    expect(structureKey(a)).toBe(structureKey(b));
    expect(needsReload(a, b)).toBe(false);
    const ghost = map(GOLDEN_PLAN, {
      ghostShifts: [{ phaseId: "ph2", fromStart: "2027-01-12", toStart: "2027-02-12", deltaDays: 31, fromDue: "2027-01-12", toDue: "2027-02-12" }],
    });
    expect(needsReload(a, ghost)).toBe(true);
  });
});

describe("cells and tooltips", () => {
  const m = map();
  const visit = m.meta["visit-ph1"]!;

  it("columns: name, amount (formatCents), status pill, Pay-in-3 band chip", () => {
    expect(JSON.stringify(nameCell(visit, "es"))).toContain("Diagnóstico, limpieza y extracción");
    expect(amountCell(visit, "es")).toMatchObject({ text: formatCents(36_000, "es") });
    expect(JSON.stringify(statusCell(visit, "es"))).toContain("A pagar hoy");
    expect(bandCell(visit, "es")).toMatchObject({ text: "Rango Paga en 3" });
    expect(bandCell(visit, "en")).toMatchObject({ text: "Pay in 3 range" });
    expect(statusCell(m.meta["pay-ph1"]!, "es")).toBe("");
  });

  it("healing tooltip shows the clinician note title; text is HTML-escaped", () => {
    const html = tooltipHtml(m.meta["heal-ph1-ph2"]!, "es", NOTE_LIBRARY);
    expect(html).toContain("Cicatrización del hueso");
    expect(html).toContain("8 semanas");
    expect(escapeHtml(`<img src=x onerror="a">`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;");
    const evil = { ...visit, title: "<script>x</script>" };
    expect(tooltipHtml(evil, "es", {})).not.toContain("<script>");
  });
});
