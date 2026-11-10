/**
 * WP-06 test fixtures: PlanViewResponse built from the golden hero case. Exposure and stress are
 * hand-built (no engine call) so these tests never depend on WP-01's implementation details.
 */
import type { ClosureStressTest, ExposureReport, Plan, PlanViewResponse } from "@/contracts";
import { DSCA_SOURCE_URL } from "@/contracts/constants";
import { goldenPlan } from "@/contracts/fixtures/implantCase";
import { NOTE_LIBRARY } from "@data/seed/notes";

function exposureOf(plan: Plan, asOf: string): ExposureReport {
  const byPhase = plan.phases.map((p) => ({
    phaseId: p.id,
    amountCents: p.amountCents,
    paid: p.payment.status === "paid",
    delivered: p.delivery.status === "delivered",
    status: p.payment.status,
  }));
  const paidCents = byPhase.filter((b) => b.paid).reduce((a, b) => a + b.amountCents, 0);
  const deliveredCents = byPhase.filter((b) => b.delivered).reduce((a, b) => a + b.amountCents, 0);
  return {
    asOf,
    totalCents: plan.totalCents,
    paidCents,
    deliveredCents,
    prepaidUndeliveredCents: 0,
    remainingCents: plan.totalCents - paidCents,
    byPhase,
  };
}

function stressOf(plan: Plan, asOf: string, exposure: ExposureReport): ClosureStressTest {
  return {
    asOf,
    illustrative: true,
    sourceUrl: DSCA_SOURCE_URL,
    linkedLoan: {
      financedCents: plan.totalCents,
      months: 24,
      monthlyCents: Math.round(plan.totalCents / 24),
      monthsElapsed: 0,
      repaidCents: 0,
      outstandingCents: plan.totalCents,
      owedForUndeliveredCents: plan.totalCents - exposure.deliveredCents,
    },
    payPerPhase: { paidCents: exposure.paidCents, deliveredCents: exposure.deliveredCents, owedForUndeliveredCents: 0 },
    undeliveredPhaseIds: plan.phases.filter((p) => p.delivery.status !== "delivered").map((p) => p.id),
  };
}

export function viewOf(plan: Plan, today = "2026-11-16"): PlanViewResponse {
  const exposure = exposureOf(plan, today);
  const approved = new Set(plan.approvedNotes.map((a) => a.noteId));
  return {
    plan,
    clock: { today, startedAt: "2026-11-16", label: "simulated" },
    exposure,
    stress: stressOf(plan, today, exposure),
    notes: Object.values(NOTE_LIBRARY).filter((n) => approved.has(n.id)),
    modes: { paypal: "mock", paypalWebhooks: "mock", anthropic: "mock", agent: "playbook" },
  };
}

/** B2: golden plan, phase 1 due today, nothing paid. */
export function goldenView(): PlanViewResponse {
  return viewOf(goldenPlan());
}

/** B3: phase 1 paid at the visit and delivered. */
export function paidPhase1Plan(): Plan {
  const plan = goldenPlan();
  const ph1 = plan.phases[0]!;
  ph1.payment = {
    ...ph1.payment,
    status: "paid",
    instrument: "order",
    orderId: "MOCK-ORDER-1",
    captureId: "MOCK-CAPTURE-1",
    paidCents: ph1.amountCents,
    paidAt: "2026-11-16T10:00:00.000Z",
  };
  ph1.delivery = { status: "delivered", deliveredOn: "2026-11-16" };
  return plan;
}

export function paidPhase1View(): PlanViewResponse {
  return viewOf(paidPhase1Plan());
}

/** Minimal fetch Response stand-in. */
export function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}
