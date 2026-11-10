import { z } from "zod";
import { AgentStepSchema, PendingApprovalSchema } from "./agent";
import { DiffExplanationSchema, WordingDraftSetSchema } from "./ai";
import {
  ClosureStressTestSchema,
  ExposureReportSchema,
  MoveRequestSchema,
  MoveValidationSchema,
  PlanDiffSchema,
  PlanEditSchema,
  WhatIfResultSchema,
} from "./engine";
import { ExtractionResultSchema } from "./extraction";
import { ClinicalNoteSchema, NoteIdSchema } from "./notes";
import { PlanSchema, PlanSummarySchema } from "./plan";
import { CaseKindSchema, IsoDateSchema, LocalizedTextSchema, PhaseIdSchema, PlanIdSchema } from "./primitives";
import { DemoBeatSchema, SimClockSchema } from "./server";

/**
 * HTTP API contract. Route handlers validate bodies with these schemas; clients use the types.
 * Errors are always { error: { code, message } } with a 4xx/5xx status.
 * Owners: /api/extract & /api/wording WP-03 · /api/paypal/* WP-04 · /api/plans/*, /api/clock,
 * /api/events, /api/demo/* WP-09 · /api/agent/* WP-10 · /api/chat WP-11 · /api/health WP-13.
 */
export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ModesSchema = z.object({
  paypal: z.enum(["live", "mock"]),
  paypalWebhooks: z.enum(["live", "mock"]),
  anthropic: z.enum(["live", "mock"]),
  agent: z.enum(["llm", "playbook"]),
});

// POST /api/extract  — multipart/form-data { file: PDF } OR JSON { sampleId }
export const ExtractJsonRequestSchema = z.object({ sampleId: z.string() });
export const ExtractResponseSchema = z.object({ extraction: ExtractionResultSchema });
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

// POST /api/wording — drafts for a plan's phases (clinic reviews/approves them)
export const WordingRequestSchema = z.object({ planId: PlanIdSchema });
export const WordingResponseSchema = z.object({ drafts: WordingDraftSetSchema });
export type WordingResponse = z.infer<typeof WordingResponseSchema>;

// GET /api/plans
export const ListPlansResponseSchema = z.object({ plans: z.array(PlanSummarySchema) });
export type ListPlansResponse = z.infer<typeof ListPlansResponseSchema>;

// POST /api/plans — build a draft plan from a stored extraction (engine.buildPlan)
export const CreatePlanRequestSchema = z.object({
  quoteId: z.string(),
  caseKind: CaseKindSchema.default("implant"),
  startDate: IsoDateSchema.optional(),
});
export type CreatePlanRequest = z.infer<typeof CreatePlanRequestSchema>;
export const PlanResponseSchema = z.object({ plan: PlanSchema });
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

// GET /api/plans/:id?view=patient|clinic  (id may be the alias "demo")
export const PlanViewResponseSchema = z.object({
  plan: PlanSchema,
  clock: SimClockSchema,
  exposure: ExposureReportSchema,
  stress: ClosureStressTestSchema,
  /** patient view: only notes approved for this plan; clinic view: whole library. */
  notes: z.array(ClinicalNoteSchema),
  modes: ModesSchema,
});
export type PlanViewResponse = z.infer<typeof PlanViewResponseSchema>;

// POST /api/plans/:id/approve
export const ApprovePlanRequestSchema = z.object({
  approvedBy: z.string().min(1),
  noteIds: z.array(NoteIdSchema),
  /** Approved phase texts (from wording drafts), optional. */
  summaries: z.array(z.object({ phaseId: PhaseIdSchema, text: LocalizedTextSchema })).default([]),
});
export type ApprovePlanRequest = z.infer<typeof ApprovePlanRequestSchema>;

// POST /api/plans/:id/whatif   persist=false → preview only (chat ghost)
export const WhatIfRequestSchema = MoveRequestSchema.extend({ persist: z.boolean().default(true) });
export type WhatIfRequest = z.infer<typeof WhatIfRequestSchema>;
export const WhatIfResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: WhatIfResultSchema }),
  z.object({ ok: z.literal(false), validation: MoveValidationSchema }),
]);
export type WhatIfResponse = z.infer<typeof WhatIfResponseSchema>;

// POST /api/plans/:id/edit
export const EditPlanRequestSchema = z.object({ edit: PlanEditSchema, editedBy: z.string().min(1) });
export type EditPlanRequest = z.infer<typeof EditPlanRequestSchema>;
export const EditPlanResponseSchema = z.object({
  plan: PlanSchema,
  diff: PlanDiffSchema,
  explanation: DiffExplanationSchema.optional(),
});
export type EditPlanResponse = z.infer<typeof EditPlanResponseSchema>;

// POST /api/plans/:id/phases/:phaseId/deliver
export const DeliverPhaseResponseSchema = PlanResponseSchema;

// GET /api/clock · POST /api/clock { advanceDays } | { setTo }
export const ClockRequestSchema = z.union([
  z.object({ advanceDays: z.number().int().min(1).max(365) }),
  z.object({ setTo: IsoDateSchema }),
]);
export type ClockRequest = z.infer<typeof ClockRequestSchema>;
export const ClockResponseSchema = z.object({ clock: SimClockSchema });
export type ClockResponse = z.infer<typeof ClockResponseSchema>;

// GET /api/events?planId=…  → text/event-stream, each message `data: <DomainEvent JSON>`

// POST /api/demo/reset · POST /api/demo/beat { beat }
export const DemoBeatRequestSchema = z.object({ beat: DemoBeatSchema });
export const DemoResponseSchema = z.object({ ok: z.literal(true), heroPlanId: PlanIdSchema.nullable() });
export type DemoResponse = z.infer<typeof DemoResponseSchema>;

// POST /api/paypal/orders                     (CreatePhaseOrderRequest → CreatePhaseOrderResponse)
// POST /api/paypal/orders/:orderId/capture    (CapturePhaseOrderRequest → CapturePhaseOrderResponse)
// POST /api/paypal/webhook                    (PayPal → us; signature verified)

// GET /api/agent/steps?planId=…
export const AgentStepsResponseSchema = z.object({
  steps: z.array(AgentStepSchema),
  approvals: z.array(PendingApprovalSchema),
});
export type AgentStepsResponse = z.infer<typeof AgentStepsResponseSchema>;
// POST /api/agent/approve { approvalId, decidedBy, decision }
export const AgentApproveRequestSchema = z.object({
  approvalId: z.string(),
  decidedBy: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
});
export type AgentApproveRequest = z.infer<typeof AgentApproveRequestSchema>;
// POST /api/agent/run { planId } — manual trigger (Director Mode)
export const AgentRunRequestSchema = z.object({ planId: PlanIdSchema });

// POST /api/chat  (ChatRequestSchema → ChatResponseSchema, see ./ai)

// GET /api/health
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  modes: ModesSchema,
  simToday: IsoDateSchema.nullable(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Small typed fetch helper for client components. Throws on non-2xx with the API error message. */
export async function apiFetch<T>(input: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(input, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? `${parsed.data.error.code}: ${parsed.data.error.message}` : `HTTP ${res.status}`);
  }
  return body as T;
}
