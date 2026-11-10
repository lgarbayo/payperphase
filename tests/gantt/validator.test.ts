/**
 * The drag validator wrapper (Bryntum validatorFn → engine.validateMove, drop → engine.reschedule
 * preview → onMoveCommitted, snap-back → onMoveRejected). The engine is mocked with the documented
 * results so this covers the wrapper, not WP-01's rules.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MoveRequest, Plan, WhatIfResult } from "@/contracts";
import { GOLDEN_DELAY_MOVE, GOLDEN_ILLEGAL_MOVE, GOLDEN_START_DATE, goldenPlan } from "@/contracts/fixtures/implantCase";
import { NOTE_LIBRARY } from "@data/seed/notes";

vi.mock("@/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine")>();
  const { addDays, daysBetween } = await import("@/lib/dates");
  return {
    ...actual,
    validateMove: vi.fn((_plan: Plan, move: MoveRequest) =>
      move.phaseId === "ph2" && move.newStartDate === "2026-12-29"
        ? { ok: false, reason: "MIN_LAG", noteId: "HEALING_EXTRACTION_MIN_8W", earliestStartDate: "2027-01-12" }
        : move.newStartDate < "2026-11-16"
          ? { ok: false, reason: "IN_THE_PAST", earliestStartDate: "2027-01-12" }
          : { ok: true },
    ),
    // +42-day cascade for the demo delay: ph2 moves, ph3 and ph4 follow by the same amount.
    reschedule: vi.fn((plan: Plan, move: MoveRequest): WhatIfResult => {
      const next = structuredClone(plan);
      const moved = next.phases.find((p) => p.id === move.phaseId)!;
      const delta = daysBetween(moved.startDate, move.newStartDate);
      const shifts: WhatIfResult["shifts"] = [];
      for (const p of next.phases) {
        if (p.n < moved.n) continue;
        const fromStart = p.startDate;
        p.startDate = addDays(p.startDate, delta);
        p.endDate = addDays(p.endDate, delta);
        p.payment.dueDate = p.startDate;
        shifts.push({ phaseId: p.id, fromStart, toStart: p.startDate, deltaDays: delta, fromDue: fromStart, toDue: p.startDate });
      }
      next.version = plan.version + 1;
      return { plan: next, request: move, shifts, warnings: [] };
    }),
  };
});

const engine = await import("@/engine");
const { createDragController } = await import("@/components/gantt/dragController");
const { planToBryntum } = await import("@/components/gantt/toBryntum");
const { fromLocalDate } = await import("@/lib/dates");

function setup(locale: "es" | "en" = "es") {
  let plan = goldenPlan();
  const onMoveRejected = vi.fn();
  const onMoveCommitted = vi.fn();
  const onPreview = vi.fn();
  const controller = createDragController({
    getPlan: () => plan,
    getToday: () => GOLDEN_START_DATE,
    getLocale: () => locale,
    getNotes: () => NOTE_LIBRARY,
    onMoveRejected,
    onMoveCommitted,
    onPreview,
  });
  return { controller, onMoveRejected, onMoveCommitted, onPreview, setPlan: (p: Plan) => (plan = p) };
}

beforeEach(() => vi.clearAllMocks());

describe("validator wrapper: illegal move (GOLDEN_ILLEGAL_MOVE)", () => {
  it("returns Bryntum's invalid result with the approved note text as the message", () => {
    const { controller, onMoveRejected } = setup();
    const v = controller.validate(GOLDEN_ILLEGAL_MOVE.phaseId, GOLDEN_ILLEGAL_MOVE.newStartDate);
    expect(v.valid).toBe(false);
    if (v.valid) return;
    expect(v.message).toContain(NOTE_LIBRARY.HEALING_EXTRACTION_MIN_8W.text.es);
    expect(v.message).toContain("Primera fecha posible: 12 ene 2027");
    expect(v.reason).toBe("MIN_LAG");
    expect(v.noteId).toBe("HEALING_EXTRACTION_MIN_8W");
    // Validation alone (every drag frame) never spams the parent.
    expect(onMoveRejected).not.toHaveBeenCalled();
  });

  it("the snap-back (Bryntum rejected the drop) triggers onMoveRejected with the note and earliest date", () => {
    const { controller, onMoveRejected, onMoveCommitted, onPreview } = setup();
    const out = controller.snapBack(GOLDEN_ILLEGAL_MOVE.phaseId, GOLDEN_ILLEGAL_MOVE.newStartDate);
    expect(out.kind).toBe("rejected");
    expect(onMoveRejected).toHaveBeenCalledTimes(1);
    expect(onMoveRejected).toHaveBeenCalledWith({
      phaseId: "ph2",
      noteId: "HEALING_EXTRACTION_MIN_8W",
      earliestStartDate: "2027-01-12",
    });
    expect(onMoveCommitted).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();
    expect(engine.reschedule).not.toHaveBeenCalled();
  });

  it("a drop that reaches the wrapper anyway is re-checked and rejected, never committed", () => {
    const { controller, onMoveRejected, onMoveCommitted } = setup();
    const out = controller.drop(GOLDEN_ILLEGAL_MOVE.phaseId, GOLDEN_ILLEGAL_MOVE.newStartDate);
    expect(out.kind).toBe("rejected");
    expect(onMoveRejected).toHaveBeenCalledTimes(1);
    expect(onMoveCommitted).not.toHaveBeenCalled();
  });

  it("uses the English note text when the locale is en", () => {
    const { controller } = setup("en");
    const v = controller.validate("ph2", "2026-12-29");
    expect(!v.valid && v.message).toContain(NOTE_LIBRARY.HEALING_EXTRACTION_MIN_8W.text.en);
  });

  it("non-clinical rejections get a plain message", () => {
    const { controller } = setup();
    const v = controller.validate("ph2", "2026-11-02");
    expect(!v.valid && v.message).toContain("No se puede mover una visita al pasado.");
  });
});

describe("validator wrapper: legal delay (GOLDEN_DELAY_MOVE)", () => {
  it("is valid, previews engine.reschedule (ph3 and ph4 shift) and hands the move to the parent", () => {
    const { controller, onMoveCommitted, onPreview, onMoveRejected } = setup();
    expect(controller.validate(GOLDEN_DELAY_MOVE.phaseId, GOLDEN_DELAY_MOVE.newStartDate)).toEqual({ valid: true });

    const out = controller.drop(GOLDEN_DELAY_MOVE.phaseId, GOLDEN_DELAY_MOVE.newStartDate);
    expect(out.kind).toBe("committed");
    expect(engine.reschedule).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onMoveCommitted).toHaveBeenCalledWith({ phaseId: "ph2", newStartDate: "2027-02-23" });
    expect(onMoveRejected).not.toHaveBeenCalled();
    // Preview first (successors move instantly), then the parent persists.
    expect(onPreview.mock.invocationCallOrder[0]!).toBeLessThan(onMoveCommitted.mock.invocationCallOrder[0]!);

    const preview = onPreview.mock.calls[0]![0] as WhatIfResult;
    const start = (id: string) => preview.plan.phases.find((p) => p.id === id)!.startDate;
    expect(start("ph2")).toBe("2027-02-23");
    expect(start("ph3")).toBe("2027-05-19");
    expect(start("ph4")).toBe("2027-06-03");

    // What the chart draws from the preview: the visit bars and payment diamonds of ph3/ph4 moved,
    // the baseline ghost did not.
    const m = planToBryntum(preview.plan, { today: GOLDEN_START_DATE, locale: "es", mode: "patient" });
    const task = (id: string) => m.tasksData.find((t) => t.id === id)!;
    expect(fromLocalDate(task("visit-ph3").startDate)).toBe("2027-05-19");
    expect(fromLocalDate(task("pay-ph4").startDate)).toBe("2027-06-03");
    expect(fromLocalDate(task("visit-ph3").baselines[0]!.startDate)).toBe("2027-04-07");
  });

  it("dropping a visit back on its own day is a no-op", () => {
    const { controller, onMoveCommitted } = setup();
    expect(controller.drop("ph2", "2027-01-12").kind).toBe("noop");
    expect(onMoveCommitted).not.toHaveBeenCalled();
  });

  it("a snap-back on a legal date (Bryntum's own reason) does not show a clinical card", () => {
    const { controller, onMoveRejected } = setup();
    expect(controller.snapBack("ph2", "2027-02-23").kind).toBe("noop");
    expect(onMoveRejected).not.toHaveBeenCalled();
  });
});

describe("per-frame performance", () => {
  it("memoises the verdict per day and does not clone the plan per frame", () => {
    const { controller, setPlan } = setup();
    const clone = vi.spyOn(globalThis, "structuredClone");
    for (let i = 0; i < 60; i++) controller.validate("ph2", "2027-02-23");
    for (let i = 0; i < 60; i++) controller.validate("ph2", "2026-12-29");
    expect(engine.validateMove).toHaveBeenCalledTimes(2);
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
    // A new plan (e.g. the parent persisted a what-if) invalidates the cache.
    setPlan(goldenPlan());
    controller.validate("ph2", "2027-02-23");
    expect(engine.validateMove).toHaveBeenCalledTimes(3);
  });

  it("canDrag follows the patient rule (future, unpaid, undelivered)", () => {
    const { controller, setPlan } = setup();
    expect(controller.canDrag("ph1")).toBe(false);
    expect(controller.canDrag("ph2")).toBe(true);
    const paid = goldenPlan();
    paid.phases[1]!.payment.status = "paid";
    setPlan(paid);
    expect(controller.canDrag("ph2")).toBe(false);
  });
});
