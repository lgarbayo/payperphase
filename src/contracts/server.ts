import { z } from "zod";
import type { AgentStep, PendingApproval } from "./agent";
import type { ExtractionResult } from "./extraction";
import type { Plan, PlanSummary } from "./plan";
import { IsoDateSchema } from "./primitives";
import type { WebhookEventRecord } from "./paypal";

/** Simulated clock. ALWAYS rendered with the word "Simulated"/"Simulado" next to it. */
export const SimClockSchema = z.object({
  today: IsoDateSchema,
  startedAt: IsoDateSchema,
  label: z.literal("simulated"),
});
export type SimClock = z.infer<typeof SimClockSchema>;

/**
 * Director Mode beat states (hotkeys 1–6). POST /api/demo/beat {beat} puts the store in this state.
 * Every beat uses the hero implant case (alias "demo") and the original approved dates unless noted.
 */
export const DemoBeatSchema = z.enum([
  /** 1 · Clinic console empty: hero quote not yet uploaded. Clock = SIM_START_DATE. */
  "B1_CLINIC_EMPTY",
  /** 2 · Hero plan approved and sent; phase 1 due today. */
  "B2_PLAN_SENT",
  /** 3 · Phase 1 paid + delivered (ledger €360 / €360, exposure €0). */
  "B3_PHASE1_PAID",
  /** 4 · As B3 — ready for the delay what-if drag (baseline = approved plan). */
  "B4_WHATIF_READY",
  /** 5 · As B3 — ready for the dentist's bone-graft edit and the agent beat. */
  "B5_AGENT_READY",
  /** 6 · As B3 — ready for "What if the clinic closes today?". */
  "B6_CLOSURE_READY",
]);
export type DemoBeat = z.infer<typeof DemoBeatSchema>;

/**
 * Store API implemented by src/server/store.ts (WP-09). JSON file at DATA_DIR/db.json,
 * seeded on boot. All methods are async and safe to call from route handlers.
 * Callers never mutate returned objects in place: use updatePlan(id, fn).
 */
export interface PlanStore {
  resolvePlanId(idOrAlias: string): Promise<string | null>;
  getPlan(id: string): Promise<Plan | null>;
  listPlans(): Promise<PlanSummary[]>;
  /** Insert or replace. */
  savePlan(plan: Plan): Promise<Plan>;
  /** Atomic read-modify-write; fn must be pure. Throws if the plan does not exist. */
  updatePlan(id: string, fn: (plan: Plan) => Plan): Promise<Plan>;

  saveExtraction(extraction: ExtractionResult): Promise<void>;
  getExtraction(quoteId: string): Promise<ExtractionResult | null>;

  getClock(): Promise<SimClock>;
  /** Sets the clock and re-derives every plan's payment statuses (engine.applyPaymentStatuses). */
  setClock(today: string): Promise<SimClock>;

  /** Returns false if the event id was already recorded (UNIQUE). */
  recordWebhookEvent(record: WebhookEventRecord): Promise<boolean>;

  appendAgentStep(step: AgentStep): Promise<void>;
  listAgentSteps(planId: string): Promise<AgentStep[]>;
  savePendingApproval(approval: PendingApproval): Promise<void>;
  getPendingApproval(id: string): Promise<PendingApproval | null>;
  listPendingApprovals(planId: string): Promise<PendingApproval[]>;

  resetDemo(): Promise<void>;
  applyBeat(beat: DemoBeat): Promise<void>;
}
