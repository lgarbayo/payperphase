import type { BuildPlanInput, CaseKind, ExtractionResult, Plan, QuoteLine } from "@/contracts";
import { PROCEDURE_CATEGORY } from "@/contracts";
import {
  GOLDEN_DENTIST,
  GOLDEN_EXTRACTION,
  GOLDEN_PATIENT_EMAIL,
  GOLDEN_PLAN_ID,
} from "@/contracts/fixtures/implantCase";
import { buildPlan } from "@/engine";

export const NOW = "2026-11-16T08:00:00.000Z";

export function goldenInput(overrides: Partial<BuildPlanInput> = {}): BuildPlanInput {
  return {
    planId: GOLDEN_PLAN_ID,
    extraction: structuredClone(GOLDEN_EXTRACTION),
    caseKind: "implant",
    startDate: "2026-11-16",
    today: "2026-11-16",
    clinic: { name: "Clínica Dental Ribera", city: "Valencia", dentistName: GOLDEN_DENTIST },
    patient: { alias: "María G.", email: GOLDEN_PATIENT_EMAIL, locale: "es" },
    now: NOW,
    ...overrides,
  };
}

type LineSpec = Pick<QuoteLine, "code" | "qty" | "unitPriceCents"> & { teeth?: number[]; description?: string };

/** A synthetic extraction from line specs (L1…Ln). */
export function extractionOf(specs: LineSpec[]): ExtractionResult {
  const lines: QuoteLine[] = specs.map((s, i) => ({
    id: `L${i + 1}`,
    lineNo: i + 1,
    description: s.description ?? s.code,
    code: s.code,
    category: PROCEDURE_CATEGORY[s.code],
    teeth: s.teeth ?? [],
    qty: s.qty,
    unitPriceCents: s.unitPriceCents,
    totalCents: s.qty * s.unitPriceCents,
    confidence: 1,
    issues: [],
    source: "extracted",
  }));
  const total = lines.reduce((a, l) => a + l.totalCents, 0);
  return {
    ...structuredClone(GOLDEN_EXTRACTION),
    quoteId: "q_test",
    lines,
    totalCents: total,
    checks: {
      sumOfLinesCents: total,
      printedTotalCents: total,
      sumMatches: true,
      invalidTeeth: [],
      lowConfidenceLineIds: [],
      toReviewLineIds: [],
    },
  };
}

export function planOf(specs: LineSpec[], caseKind: CaseKind = "implant", startDate = "2026-11-16"): Plan {
  return buildPlan(goldenInput({ extraction: extractionOf(specs), caseKind, startDate, today: startDate }));
}

/** Plan with the given phase paid (and delivered, as a capture at the visit does). */
export function paidAndDelivered(plan: Plan, phaseId: string, on: string): Plan {
  return {
    ...plan,
    phases: plan.phases.map((p) =>
      p.id === phaseId
        ? {
            ...p,
            payment: { ...p.payment, status: "paid" as const, paidCents: p.amountCents, paidAt: NOW, instrument: "order" as const },
            delivery: { status: "delivered" as const, deliveredOn: on },
          }
        : p,
    ),
  };
}

/** Plan with the given phase paid early on PayPal's invoice page (ADR-8): paid, care not yet delivered. */
export function earlyInvoicePaid(plan: Plan, phaseId: string): Plan {
  return {
    ...plan,
    phases: plan.phases.map((p) =>
      p.id === phaseId
        ? {
            ...p,
            payment: { ...p.payment, status: "paid" as const, paidCents: p.amountCents, paidAt: NOW, instrument: "invoice" as const },
          }
        : p,
    ),
  };
}
