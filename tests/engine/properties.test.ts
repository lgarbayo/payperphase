import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PAY_IN_3,
  PERMANENT_TEETH,
  PlanSchema,
  ProcedureCodeSchema,
  type CaseKind,
  type MoveRequest,
  type Plan,
  type ProcedureCode,
} from "@/contracts";
import { applyEdit, buildPlan, catalogEntry, EngineError, fitFor, reschedule, stageFor, validateMove } from "@/engine";
import { addDays, nextClinicDay, weekday } from "@/lib/dates";
import { extractionOf, goldenInput, paidAndDelivered } from "./helpers";

// ≥200 runs each in CI; raise locally with ENGINE_PROP_RUNS=5000.
const RUNS = { numRuns: Math.max(250, Number(process.env.ENGINE_PROP_RUNS ?? 0)) };
const ALL_CODES = ProcedureCodeSchema.options;
const ALIGNER_EXTRAS: ProcedureCode[] = ["EXAM", "PANORAMIC_XRAY", "HYGIENE", "WHITENING", "REVIEW_XRAY", "FILLING"];

// ------------------------------------------------------------------------------------------------
// Generators: random quotes built from the catalog
// ------------------------------------------------------------------------------------------------

const priceArb = fc.oneof(
  { arbitrary: fc.integer({ min: 0, max: 2_000 }), weight: 1 },
  { arbitrary: fc.integer({ min: 2_000, max: 90_000 }), weight: 6 },
  { arbitrary: fc.integer({ min: 90_000, max: 210_000 }), weight: 2 },
  { arbitrary: fc.integer({ min: 210_000, max: 650_000 }), weight: 1 },
);

const lineArb = (codes: readonly ProcedureCode[], maxQty = 5) =>
  fc
    .record({
      code: fc.constantFrom(...codes),
      qty: fc.integer({ min: 1, max: maxQty }),
      unitPriceCents: priceArb,
      perTooth: fc.boolean(),
    })
    .chain(({ perTooth, ...l }) =>
      (perTooth
        ? fc.uniqueArray(fc.constantFrom(...PERMANENT_TEETH), { minLength: l.qty, maxLength: l.qty })
        : fc.constant([] as number[])
      ).map((teeth) => ({ ...l, teeth })),
    );

const implantQuoteArb = fc.array(lineArb(ALL_CODES), { minLength: 1, maxLength: 12 });
const perioQuoteArb = fc.array(lineArb(ALL_CODES), { minLength: 1, maxLength: 10 });
const alignerQuoteArb = fc
  .tuple(
    lineArb(["ORTHO_RECORDS"], 1),
    fc.array(lineArb(["ALIGNER_BATCH"], 6), { minLength: 1, maxLength: 3 }),
    lineArb(["RETAINER"], 1),
    fc.array(lineArb(ALIGNER_EXTRAS, 2), { maxLength: 3 }),
  )
  .map(([records, batches, retainer, extras]) => [records, ...batches, retainer, ...extras]);

const startArb = fc.integer({ min: 0, max: 400 }).map((d) => addDays("2026-11-01", d));

const caseArb: fc.Arbitrary<{ caseKind: CaseKind; plan: Plan; startDate: string }> = fc
  .oneof(
    implantQuoteArb.map((lines) => ({ caseKind: "implant" as const, lines })),
    alignerQuoteArb.map((lines) => ({ caseKind: "aligner" as const, lines })),
    perioQuoteArb.map((lines) => ({ caseKind: "perio" as const, lines })),
  )
  .chain(({ caseKind, lines }) =>
    startArb.map((startDate) => ({
      caseKind,
      startDate,
      plan: buildPlan(goldenInput({ extraction: extractionOf(lines), caseKind, startDate, today: startDate })),
    })),
  );

const moveArb = (plan: Plan) =>
  fc.record({
    idx: fc.integer({ min: 0, max: plan.phases.length - 1 }),
    delta: fc.integer({ min: -150, max: 250 }),
  }).map(({ idx, delta }): MoveRequest => {
    const p = plan.phases[idx]!;
    return { phaseId: p.id, newStartDate: addDays(p.startDate, delta) };
  });

// ------------------------------------------------------------------------------------------------
// Invariants
// ------------------------------------------------------------------------------------------------

function minLagViolations(plan: Plan): string[] {
  const byId = new Map(plan.phases.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const p of plan.phases) {
    for (const d of p.dependsOn) {
      const pred = byId.get(d.phaseId)!;
      if (p.startDate < addDays(pred.endDate, d.minLagDays)) out.push(`${p.id} < ${pred.id}.end + ${d.minLagDays}`);
    }
  }
  return out;
}

/**
 * "Money is never moved between phases": each phase amount is made of whole lines plus whole units of
 * lines split across visits, and every split line's units add up to exactly its quantity.
 */
function allocationExists(plan: Plan): boolean {
  const lines = new Map(plan.lines.map((l) => [l.id, l]));
  const owners = new Map<string, string[]>();
  for (const p of plan.phases) for (const id of p.lineIds) owners.set(id, [...(owners.get(id) ?? []), p.id]);
  if ([...lines.keys()].some((id) => !owners.has(id))) return false; // every line is billed somewhere
  const residual = new Map<string, number>();
  const vars: { phaseId: string; lineId: string; last: boolean }[] = [];
  for (const p of plan.phases) {
    let r = p.amountCents;
    for (const id of p.lineIds) {
      const o = owners.get(id)!;
      if (o.length === 1) r -= lines.get(id)!.totalCents;
      else vars.push({ phaseId: p.id, lineId: id, last: o[o.length - 1] === p.id });
    }
    residual.set(p.id, r);
  }
  const remaining = new Map<string, number>();
  for (const v of vars) {
    const l = lines.get(v.lineId)!;
    if (l.totalCents !== l.qty * l.unitPriceCents || !catalogEntry(l.code).divisible) return false;
    remaining.set(v.lineId, l.qty);
  }
  const solve = (i: number): boolean => {
    if (i === vars.length) return [...residual.values()].every((r) => r === 0);
    const v = vars[i]!;
    const unit = lines.get(v.lineId)!.unitPriceCents;
    const left = remaining.get(v.lineId)!;
    const later = vars.slice(i + 1).filter((x) => x.lineId === v.lineId).length;
    const options = v.last ? [left] : Array.from({ length: Math.max(0, left - later) }, (_, k) => k + 1);
    for (const k of options) {
      if (k < 1) continue;
      const r = residual.get(v.phaseId)! - k * unit;
      if (r < 0) continue;
      residual.set(v.phaseId, r);
      remaining.set(v.lineId, left - k);
      if (solve(i + 1)) return true;
      residual.set(v.phaseId, r + k * unit);
      remaining.set(v.lineId, left);
    }
    return false;
  };
  return solve(0);
}

function checkPlan(plan: Plan, caseKind: CaseKind): void {
  // Σ phase amounts = Σ line totals = plan.totalCents
  const phaseSum = plan.phases.reduce((a, p) => a + p.amountCents, 0);
  const lineSum = plan.lines.reduce((a, l) => a + l.totalCents, 0);
  expect(phaseSum).toBe(lineSum);
  expect(lineSum).toBe(plan.totalCents);

  expect(minLagViolations(plan)).toEqual([]);
  expect(allocationExists(plan)).toBe(true);

  const lines = new Map(plan.lines.map((l) => [l.id, l]));
  plan.phases.forEach((p, i) => {
    expect(p.id).toBe(`ph${i + 1}`);
    expect(p.n).toBe(i + 1);
    // pay at the visit, exclusive end, clinic days
    expect(p.payment.dueDate).toBe(p.startDate);
    expect(p.endDate).toBe(addDays(p.startDate, p.durationDays));
    expect([1, 2, 3, 4, 5]).toContain(weekday(p.startDate));
    // ≤ €2,000 unless flagged; an oversize phase is one indivisible unit
    expect(p.fit).toEqual(fitFor(p.amountCents));
    if (p.amountCents > PAY_IN_3.maxCents) {
      expect(p.fit.band).not.toBe("PAY_IN_3");
      expect(p.fit.reason).toBeTruthy();
      expect(p.lineIds).toHaveLength(1);
      const l = lines.get(p.lineIds[0]!)!;
      expect([l.totalCents, l.unitPriceCents]).toContain(p.amountCents);
    } else {
      expect(p.amountCents < PAY_IN_3.minCents ? p.fit.band : "PAY_IN_3").toBe(p.fit.band);
    }
    // lines only ever land in their own clinical stage
    for (const id of p.lineIds) {
      const l = lines.get(id)!;
      const stage = stageFor(l.code, caseKind);
      const ok = stage === p.kind || (caseKind === "aligner" && l.code === "ALIGNER_BATCH" && p.kind === "ORTHO_START");
      expect(ok, `${l.code} in ${p.kind}`).toBe(true);
    }
  });
}

// ------------------------------------------------------------------------------------------------
// Properties
// ------------------------------------------------------------------------------------------------

describe("engine properties (fast-check)", () => {
  it("buildPlan: valid plan, Σ invariant, lags, Pay-in-3 sizing, whole-unit allocation, pay at the visit", () => {
    fc.assert(
      fc.property(caseArb, ({ caseKind, plan, startDate }) => {
        expect(PlanSchema.safeParse(plan).success).toBe(true);
        checkPlan(plan, caseKind);
        // today = requested start; a weekend start snaps phase 1 to Monday, so it is upcoming until then
        const first = plan.phases[0]!;
        expect(first.startDate).toBe(nextClinicDay(startDate));
        expect(first.payment.status).toBe(first.startDate === startDate ? "due" : "upcoming");
      }),
      RUNS,
    );
  });

  it("delays: valid, successors never move earlier, every min lag still holds", () => {
    const arb = caseArb.chain(({ caseKind, plan }) =>
      fc
        .record({ idx: fc.integer({ min: 0, max: plan.phases.length - 1 }), delta: fc.integer({ min: 1, max: 250 }) })
        .map(({ idx, delta }) => ({ caseKind, plan, phase: plan.phases[idx]!, delta })),
    );
    fc.assert(
      fc.property(arb, ({ caseKind, plan, phase, delta }) => {
        const today = plan.phases[0]!.startDate;
        const move = { phaseId: phase.id, newStartDate: addDays(phase.startDate, delta) };
        expect(validateMove(plan, move, today)).toEqual({ ok: true });
        const r = reschedule(plan, move, today);
        const before = new Map(plan.phases.map((p) => [p.id, p.startDate]));
        for (const p of r.plan.phases) expect(p.startDate >= before.get(p.id)!).toBe(true);
        expect(r.plan.phases.find((p) => p.id === phase.id)!.startDate).toBe(nextClinicDay(move.newStartDate));
        expect(r.plan.version).toBe(plan.version + 1);
        for (const s of r.shifts) expect(s.deltaDays).toBeGreaterThanOrEqual(0);
        checkPlan(r.plan, caseKind);
      }),
      RUNS,
    );
  });

  it("validateMove and reschedule agree: valid moves never produce a min-lag violation", () => {
    const arb = caseArb.chain(({ caseKind, plan }) =>
      fc
        .tuple(moveArb(plan), fc.integer({ min: 0, max: 120 }))
        .map(([move, todayOffset]) => ({ caseKind, plan, move, today: addDays(plan.phases[0]!.startDate, todayOffset) })),
    );
    fc.assert(
      fc.property(arb, ({ caseKind, plan, move, today }) => {
        const v = validateMove(plan, move, today);
        if (v.ok) {
          const r = reschedule(plan, move, today);
          expect(minLagViolations(r.plan)).toEqual([]);
          checkPlan(r.plan, caseKind);
        } else {
          expect(() => reschedule(plan, move, today)).toThrow(EngineError);
          if (v.reason === "MIN_LAG") {
            expect(v.noteId).toBeDefined();
            expect(v.earliestStartDate).toBeDefined();
            // the suggested earliest date is itself legal
            expect(validateMove(plan, { phaseId: move.phaseId, newStartDate: v.earliestStartDate! }, today)).toEqual({
              ok: true,
            });
          }
        }
      }),
      RUNS,
    );
  });

  it("paid phases never change dates, whatever sequence of moves follows", () => {
    const arb = caseArb.chain(({ caseKind, plan }) =>
      fc
        .tuple(
          fc.integer({ min: 0, max: plan.phases.length }),
          fc.array(moveArb(plan), { minLength: 1, maxLength: 6 }),
        )
        .map(([paidCount, moves]) => {
          let p = plan;
          for (const ph of plan.phases.slice(0, paidCount)) p = paidAndDelivered(p, ph.id, ph.startDate);
          const lastPaid = plan.phases[paidCount - 1];
          const today = lastPaid ? lastPaid.startDate : plan.phases[0]!.startDate;
          return { caseKind, plan: p, moves, today };
        }),
    );
    fc.assert(
      fc.property(arb, ({ caseKind, plan, moves, today }) => {
        const frozen = plan.phases
          .filter((p) => p.payment.status === "paid")
          .map((p) => [p.id, p.startDate, p.endDate, p.payment.dueDate]);
        let current = plan;
        for (const m of moves) {
          const target = current.phases.find((p) => p.id === m.phaseId)!;
          if (target.payment.status === "paid") {
            expect(validateMove(current, m, today)).toMatchObject({ ok: false, reason: "PHASE_PAID" });
          }
          if (validateMove(current, m, today).ok) current = reschedule(current, m, today).plan;
        }
        expect(
          current.phases
            .filter((p) => p.payment.status === "paid")
            .map((p) => [p.id, p.startDate, p.endDate, p.payment.dueDate]),
        ).toEqual(frozen);
        checkPlan(current, caseKind);
      }),
      RUNS,
    );
  });

  it("edits: adding a line keeps Σ invariant and lags, never moves a phase earlier, bumps version", () => {
    const arb = caseArb.chain(({ caseKind, plan }) =>
      fc
        .record({
          idx: fc.integer({ min: 0, max: plan.phases.length - 1 }),
          code: fc.constantFrom(...ALL_CODES),
          qty: fc.integer({ min: 1, max: 3 }),
          unitPriceCents: fc.integer({ min: 0, max: 100_000 }),
        })
        .map((e) => ({ caseKind, plan, ...e })),
    );
    fc.assert(
      fc.property(arb, ({ caseKind, plan, idx, code, qty, unitPriceCents }) => {
        const phase = plan.phases[idx]!;
        const after = applyEdit(
          plan,
          { kind: "ADD_LINE", phaseId: phase.id, line: { description: code, code, teeth: [], qty, unitPriceCents } },
          "2026-11-18T10:00:00.000Z",
        );
        expect(after.version).toBe(plan.version + 1);
        expect(after.totalCents).toBe(plan.totalCents + qty * unitPriceCents);
        expect(after.phases.reduce((a, p) => a + p.amountCents, 0)).toBe(after.totalCents);
        expect(minLagViolations(after)).toEqual([]);
        for (const p of after.phases) {
          const b = plan.phases.find((x) => x.id === p.id)!;
          expect(p.startDate >= b.startDate).toBe(true);
          expect(p.payment.dueDate).toBe(p.startDate);
          expect(p.fit).toEqual(fitFor(p.amountCents));
        }
        void caseKind;
      }),
      RUNS,
    );
  });
});
