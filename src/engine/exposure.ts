/**
 * The "paid for treatment not yet received" meter and the illustrative clinic-closure stress test
 * (linked consumer loan vs PayPerPhase, source: dsca.gob.es).
 */
import {
  DSCA_SOURCE_URL,
  LINKED_LOAN_ILLUSTRATIVE,
  type ClosureStressTest,
  type ExposureReport,
  type IsoDate,
  type Plan,
} from "@/contracts";
import { paymentStatusAt } from "./payments";

export function computeExposure(plan: Plan, today: IsoDate): ExposureReport {
  const byPhase = [...plan.phases]
    .sort((a, b) => a.n - b.n)
    .map((p) => ({
      phaseId: p.id,
      amountCents: p.amountCents,
      paid: p.payment.status === "paid",
      delivered: p.delivery.status === "delivered",
      status: paymentStatusAt(p, today),
    }));
  const sum = (pred: (p: (typeof byPhase)[number]) => boolean) =>
    byPhase.filter(pred).reduce((a, p) => a + p.amountCents, 0);
  const paidCents = sum((p) => p.paid);
  return {
    asOf: today,
    totalCents: plan.totalCents,
    paidCents,
    deliveredCents: sum((p) => p.delivered),
    prepaidUndeliveredCents: sum((p) => p.paid && !p.delivered),
    remainingCents: Math.max(0, plan.totalCents - paidCents),
    byPhase,
  };
}

/** Whole calendar months from `from` to `to` (0 when `to` is not later). */
export function wholeMonthsBetween(from: IsoDate, to: IsoDate): number {
  if (to <= from) return 0;
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

/**
 * "What if the clinic closes today?" — illustrative. The linked loan finances the whole plan, signed
 * at phase 1's visit, repaid monthly at 0% APR; the patient still owes total − delivered.
 * PayPerPhase owes only what was paid but not delivered, which the no-prepayment rule keeps at 0.
 */
export function closureStressTest(plan: Plan, today: IsoDate): ClosureStressTest {
  const exposure = computeExposure(plan, today);
  const months = LINKED_LOAN_ILLUSTRATIVE.months;
  const financedCents = plan.totalCents;
  const monthlyCents = Math.round(financedCents / months);
  const first = [...plan.phases].sort((a, b) => a.n - b.n)[0];
  const monthsElapsed = first ? Math.min(months, wholeMonthsBetween(first.startDate, today)) : 0;
  // The last instalment absorbs the rounding, so a fully elapsed loan is fully repaid.
  const repaidCents = monthsElapsed >= months ? financedCents : Math.min(financedCents, monthlyCents * monthsElapsed);
  return {
    asOf: today,
    illustrative: true,
    sourceUrl: DSCA_SOURCE_URL,
    linkedLoan: {
      financedCents,
      months,
      monthlyCents,
      monthsElapsed,
      repaidCents,
      outstandingCents: financedCents - repaidCents,
      owedForUndeliveredCents: Math.max(0, plan.totalCents - exposure.deliveredCents),
    },
    payPerPhase: {
      paidCents: exposure.paidCents,
      deliveredCents: exposure.deliveredCents,
      owedForUndeliveredCents: exposure.prepaidUndeliveredCents,
    },
    undeliveredPhaseIds: exposure.byPhase.filter((p) => !p.delivered).map((p) => p.phaseId),
  };
}
