/** test helpers: a clean store + mock PayPal, golden plan builders, step queries. */
import { expect } from "vitest";
import type { AgentStep, Plan } from "@/contracts";
import { GOLDEN_PLAN_ID, goldenPlan } from "@/contracts/fixtures/implantCase";
import { __setAgentDeps } from "@/agent";
import { createMockInvoiceTools, resetMockInvoices } from "@/agent/mockTools";
import type { LlmClient } from "@/agent/loop";
import { __resetStoreForTests, store } from "@/server/store";

export const PLAN_ID = GOLDEN_PLAN_ID;

/**
 * Fresh first-boot store (beat B2, in memory under Vitest). Not `store.resetDemo()`: that re-ids the
 * hero to a random pln_ and publishes DEMO_RESET/PLAN_APPROVED, while these tests drive the golden
 * pln_ribera01 plan and its PPP-RIBE-* invoice numbers explicitly.
 */
export async function resetWorld(): Promise<void> {
  __resetStoreForTests();
  await store.init();
  resetMockInvoices();
  __setAgentDeps(null);
}

/** Playbook (no LLM) over the deterministic mock PayPal. */
export function usePlaybookDeps(): void {
  __setAgentDeps({ mode: "playbook", llm: null, model: "test-model", createTools: async () => createMockInvoiceTools() });
}

/** LLM mode with a scripted client over the mock PayPal. */
export function useLlmDeps(llm: LlmClient): void {
  __setAgentDeps({
    mode: "llm",
    llm,
    model: "test-model",
    createTools: async () =>
      createMockInvoiceTools({
        // Same names/schemas the real toolkit advertises; only the names matter to the loop.
        tools: (["create_invoice", "send_invoice", "cancel_sent_invoice", "generate_invoice_qr_code", "send_invoice_reminder", "record_payment_for_invoice", "get_invoice"] as const).map(
          (name) => ({ name, description: name, input_schema: { type: "object", properties: {} } }),
        ),
      }),
  });
}

/** The post-edit golden plan: ph2 resized to €1,950 (the scaffold applyEdit stub does not resize), version 2. */
export function editedGolden(from: Plan = goldenPlan()): Plan {
  const p = structuredClone(from);
  p.version = 2;
  p.phases.find((x) => x.id === "ph2")!.amountCents = 195_000;
  p.totalCents = p.phases.reduce((a, x) => a + x.amountCents, 0);
  return p;
}

export async function applyEditedGolden(): Promise<Plan> {
  return store.updatePlan(PLAN_ID, (p) => editedGolden(p));
}

/** Phase 2's visit day in the golden plan (the implant). */
export const PH2_VISIT_DAY = "2027-01-12";

/**
 * As beat B5: phase 1 paid at its visit and delivered, the simulated clock on phase 2's visit day, so
 * phase 2 is due (and invoiced) while phases 3–4 are not due yet (invoiced on their own visit day).
 */
export async function atPhase2VisitDay(): Promise<void> {
  await store.updatePlan(PLAN_ID, (p) => ({
    ...p,
    phases: p.phases.map((ph) =>
      ph.id === "ph1"
        ? {
            ...ph,
            payment: {
              ...ph.payment,
              status: "paid" as const,
              instrument: "order" as const,
              orderId: "MOCK-ORDER-RIBE-PH1",
              orderAttempt: 1,
              captureId: "MOCK-CAPTURE-RIBE-PH1",
              paidCents: ph.amountCents,
              paidAt: "2026-11-16T10:00:00.000Z",
            },
            delivery: { status: "delivered" as const, deliveredOn: "2026-11-16" },
          }
        : ph,
    ),
  }));
  await store.setClock(PH2_VISIT_DAY);
}

export const steps = () => store.listAgentSteps(PLAN_ID);

/** tool_call / approval_required / guard_rejected steps in order, as "kind:tool". */
export async function trace(filter: (s: AgentStep) => boolean = () => true): Promise<string[]> {
  return (await steps())
    .filter((s) => ["tool_call", "approval_required", "guard_rejected", "approval_granted"].includes(s.kind))
    .filter(filter)
    .map((s) => (s.kind === "tool_call" ? `call:${s.tool}` : `${s.kind}${s.tool ? `:${s.tool}` : ""}`));
}

export function invoiceOf(plan: Plan, phaseId: string) {
  const inv = plan.phases.find((p) => p.id === phaseId)?.payment.invoice;
  expect(inv, `phase ${phaseId} invoice`).toBeDefined();
  return inv!;
}
