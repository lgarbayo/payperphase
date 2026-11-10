import { describe, expect, it } from "vitest";
import { MoveValidationSchema, WhatIfResultSchema } from "@/contracts";
import { GOLDEN_DELAY_MOVE, GOLDEN_ILLEGAL_MOVE, GOLDEN_PLAN, goldenPlan } from "@/contracts/fixtures/implantCase";
import { EngineError, reschedule, validateMove } from "@/engine";
import { addDays, weekday } from "@/lib/dates";
import { paidAndDelivered } from "./helpers";

const TODAY = "2026-11-16";

describe("validateMove / reschedule on the golden plan", () => {
  it("GOLDEN_DELAY_MOVE shifts ph2, ph3 and ph4 by +42 days and their due dates follow", () => {
    expect(validateMove(GOLDEN_PLAN, GOLDEN_DELAY_MOVE, TODAY)).toEqual({ ok: true });
    const r = reschedule(GOLDEN_PLAN, GOLDEN_DELAY_MOVE, TODAY);
    expect(WhatIfResultSchema.parse(r)).toBeTruthy();
    expect(r.shifts.map((s) => [s.phaseId, s.deltaDays])).toEqual([
      ["ph2", 42],
      ["ph3", 42],
      ["ph4", 42],
    ]);
    for (const s of r.shifts) {
      expect(s.toStart).toBe(addDays(s.fromStart, 42));
      expect(s.fromDue).toBe(s.fromStart);
      expect(s.toDue).toBe(s.toStart);
    }
    const [ph1, ph2, ph3, ph4] = r.plan.phases;
    expect(ph1!.startDate).toBe("2026-11-16");
    expect([ph2!.startDate, ph3!.startDate, ph4!.startDate]).toEqual(["2027-02-23", "2027-05-19", "2027-06-03"]);
    for (const p of r.plan.phases) {
      expect(p.payment.dueDate).toBe(p.startDate);
      expect(p.endDate).toBe(addDays(p.startDate, p.durationDays));
    }
    expect(r.plan.version).toBe(GOLDEN_PLAN.version + 1);
    expect(r.request).toEqual(GOLDEN_DELAY_MOVE);
    expect(r.warnings).toEqual([]);
  });

  it("does not mutate the input plan", () => {
    const plan = goldenPlan();
    reschedule(plan, GOLDEN_DELAY_MOVE, TODAY);
    expect(plan).toEqual(GOLDEN_PLAN);
  });

  it("GOLDEN_ILLEGAL_MOVE snaps back with the extraction-healing note and the earliest legal date", () => {
    const v = validateMove(GOLDEN_PLAN, GOLDEN_ILLEGAL_MOVE, TODAY);
    expect(MoveValidationSchema.parse(v)).toBeTruthy();
    expect(v).toEqual({
      ok: false,
      reason: "MIN_LAG",
      noteId: "HEALING_EXTRACTION_MIN_8W",
      earliestStartDate: "2027-01-12",
    });
    expect(() => reschedule(GOLDEN_PLAN, GOLDEN_ILLEGAL_MOVE, TODAY)).toThrow(EngineError);
  });

  it("moving ph3 before osseointegration ends cites the osseointegration note", () => {
    const v = validateMove(GOLDEN_PLAN, { phaseId: "ph3", newStartDate: "2027-03-10" }, TODAY);
    expect(v).toMatchObject({ ok: false, reason: "MIN_LAG", noteId: "OSSEOINTEGRATION_MIN_12W", earliestStartDate: "2027-04-07" });
  });

  it("moving ph2 past 2027-05-16 returns a deadline warning (HEALING_EXTRACTION_MAX_6M)", () => {
    const onDeadline = reschedule(GOLDEN_PLAN, { phaseId: "ph2", newStartDate: "2027-05-14" }, TODAY);
    expect(onDeadline.warnings.filter((w) => w.phaseId === "ph2")).toEqual([]);

    const r = reschedule(GOLDEN_PLAN, { phaseId: "ph2", newStartDate: "2027-05-17" }, TODAY);
    expect(r.warnings).toContainEqual({
      phaseId: "ph2",
      deadlineDate: "2027-05-16",
      exceededByDays: 1,
      noteId: "HEALING_EXTRACTION_MAX_6M",
    });
    expect(r.warnings.every((w) => w.phaseId === "ph2")).toBe(true);
  });

  it("rejects paid and delivered phases", () => {
    const paid = paidAndDelivered(goldenPlan(), "ph1", TODAY);
    expect(validateMove(paid, { phaseId: "ph1", newStartDate: "2026-11-23" }, TODAY)).toEqual({
      ok: false,
      reason: "PHASE_PAID",
    });
    const processing = goldenPlan();
    processing.phases[0]!.payment.status = "processing";
    expect(validateMove(processing, { phaseId: "ph1", newStartDate: "2026-11-23" }, TODAY)).toMatchObject({
      reason: "PHASE_PAID",
    });
    const delivered = goldenPlan();
    delivered.phases[0]!.delivery = { status: "delivered", deliveredOn: TODAY };
    expect(validateMove(delivered, { phaseId: "ph1", newStartDate: "2026-11-23" }, TODAY)).toEqual({
      ok: false,
      reason: "PHASE_DELIVERED",
    });
    expect(() => reschedule(delivered, { phaseId: "ph1", newStartDate: "2026-11-23" }, TODAY)).toThrow(/PHASE_DELIVERED/);
  });

  it("rejects a move whose cascade would have to move a paid successor", () => {
    // ph3 paid out of order (synthetic): delaying ph2 would push it.
    const plan = paidAndDelivered(goldenPlan(), "ph3", "2027-04-07");
    expect(validateMove(plan, GOLDEN_DELAY_MOVE, TODAY)).toEqual({ ok: false, reason: "PHASE_PAID" });
  });

  it("rejects dates before today", () => {
    const v = validateMove(GOLDEN_PLAN, { phaseId: "ph1", newStartDate: "2026-11-13" }, TODAY);
    expect(v).toEqual({ ok: false, reason: "IN_THE_PAST", earliestStartDate: TODAY });
    const later = validateMove(GOLDEN_PLAN, { phaseId: "ph2", newStartDate: "2027-01-12" }, "2027-01-20");
    expect(later).toMatchObject({ ok: false, reason: "IN_THE_PAST", earliestStartDate: "2027-01-20" });
  });

  it("rejects unknown phases", () => {
    expect(validateMove(GOLDEN_PLAN, { phaseId: "ph9", newStartDate: "2027-01-12" }, TODAY)).toEqual({
      ok: false,
      reason: "UNKNOWN_PHASE",
    });
  });

  it("snaps weekend drops to the next Monday", () => {
    // 2027-02-27 is a Saturday, 2027-02-28 a Sunday.
    for (const drop of ["2027-02-27", "2027-02-28"]) {
      expect(weekday(drop) === 6 || weekday(drop) === 0).toBe(true);
      const r = reschedule(GOLDEN_PLAN, { phaseId: "ph2", newStartDate: drop }, TODAY);
      expect(r.plan.phases[1]!.startDate).toBe("2027-03-01");
      expect(r.shifts[0]!.toStart).toBe("2027-03-01");
    }
    // A weekend drop just before the healing minimum ends lands on a legal Monday.
    const w = validateMove(GOLDEN_PLAN, { phaseId: "ph2", newStartDate: "2027-01-10" }, TODAY);
    expect(w).toMatchObject({ ok: false, reason: "MIN_LAG" });
  });

  it("successors stay put when a phase moves earlier (never earlier on a cascade)", () => {
    const delayed = reschedule(GOLDEN_PLAN, GOLDEN_DELAY_MOVE, TODAY).plan;
    const back = reschedule(delayed, { phaseId: "ph2", newStartDate: "2027-01-19" }, TODAY);
    expect(back.shifts.map((s) => s.phaseId)).toEqual(["ph2"]);
    expect(back.plan.phases[2]!.startDate).toBe(delayed.phases[2]!.startDate);
    expect(back.plan.version).toBe(delayed.version + 1);
  });

  it("re-derives the moved milestone's status at today", () => {
    // At 2027-01-04 ph2 is upcoming; delayed by 6 weeks it is scheduled again.
    const r = reschedule(GOLDEN_PLAN, GOLDEN_DELAY_MOVE, "2027-01-04");
    expect(r.plan.phases[1]!.payment.status).toBe("scheduled");
  });

  it("validateMove is fast enough for a drag validatorFn (<1 ms for 20 phases)", () => {
    const base = goldenPlan();
    const proto = base.phases[3]!;
    const phases = [...base.phases];
    for (let n = 5; n <= 20; n++) {
      const prev = phases[n - 2]!;
      const start = addDays(prev.endDate, 14);
      phases.push({
        ...structuredClone(proto),
        id: `ph${n}`,
        n,
        startDate: start,
        endDate: addDays(start, 1),
        payment: { ...proto.payment, dueDate: start },
        dependsOn: [{ ...proto.dependsOn[0]!, phaseId: prev.id }],
      });
    }
    const plan = { ...base, phases };
    const move = { phaseId: "ph2", newStartDate: "2027-02-23" };
    expect(validateMove(plan, move, TODAY)).toEqual({ ok: true });
    const runs = 2_000;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) validateMove(plan, move, TODAY);
    const perCall = (performance.now() - t0) / runs;
    expect(perCall).toBeLessThan(1);
  });
});
