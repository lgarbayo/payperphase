import { z } from "zod";
import { AgentStepSchema, PendingApprovalSchema } from "./agent";
import { PhaseShiftSchema, PlanDiffSchema } from "./engine";
import { InvoiceStatusSchema, PaymentStatusSchema } from "./plan";
import { CentsSchema, IsoDateSchema, IsoDateTimeSchema, PhaseIdSchema, PlanIdSchema } from "./primitives";

/**
 * Domain events: published by the server (src/server/events.ts), streamed to browsers
 * over SSE (GET /api/events?planId=…), consumed by the agent (src/agent) and the UIs.
 */
const base = {
  id: z.string(),
  /** Wall-clock time the event was published. */
  at: IsoDateTimeSchema,
  /** Simulated clock day when it happened. */
  simToday: IsoDateSchema,
};

export const DomainEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("PLAN_CREATED"), planId: PlanIdSchema }),
  z.object({ ...base, type: z.literal("PLAN_APPROVED"), planId: PlanIdSchema, version: z.number().int() }),
  z.object({
    ...base,
    type: z.literal("PLAN_EDITED"),
    planId: PlanIdSchema,
    diff: PlanDiffSchema,
  }),
  z.object({
    ...base,
    type: z.literal("PLAN_RESCHEDULED"),
    planId: PlanIdSchema,
    version: z.number().int(),
    shifts: z.array(PhaseShiftSchema),
  }),
  z.object({
    ...base,
    type: z.literal("PHASE_STATUS_CHANGED"),
    planId: PlanIdSchema,
    phaseId: PhaseIdSchema,
    from: PaymentStatusSchema,
    to: PaymentStatusSchema,
  }),
  z.object({
    ...base,
    type: z.literal("PAYMENT_CAPTURED"),
    planId: PlanIdSchema,
    phaseId: PhaseIdSchema,
    orderId: z.string(),
    captureId: z.string(),
    amountCents: CentsSchema,
    via: z.enum(["capture", "webhook", "return"]),
  }),
  z.object({ ...base, type: z.literal("PHASE_DELIVERED"), planId: PlanIdSchema, phaseId: PhaseIdSchema }),
  z.object({
    ...base,
    type: z.literal("INVOICE_UPDATED"),
    planId: PlanIdSchema,
    phaseId: PhaseIdSchema,
    invoiceId: z.string(),
    invoiceNumber: z.string(),
    status: InvoiceStatusSchema,
  }),
  z.object({ ...base, type: z.literal("CLOCK_ADVANCED"), from: IsoDateSchema, to: IsoDateSchema }),
  z.object({ ...base, type: z.literal("AGENT_STEP"), planId: PlanIdSchema, step: AgentStepSchema }),
  z.object({ ...base, type: z.literal("APPROVAL_REQUESTED"), planId: PlanIdSchema, approval: PendingApprovalSchema }),
  /** Chat what-if preview: the Gantt draws these shifts as a ghost (not persisted). */
  z.object({
    ...base,
    type: z.literal("CHAT_PREVIEW"),
    planId: PlanIdSchema,
    shifts: z.array(PhaseShiftSchema),
  }),
  z.object({ ...base, type: z.literal("DEMO_RESET") }),
]);
export type DomainEvent = z.infer<typeof DomainEventSchema>;
export type DomainEventType = DomainEvent["type"];

/** What publishers pass in; the bus stamps id/at/simToday. */
export type DomainEventInput = DomainEvent extends infer E
  ? E extends DomainEvent
    ? Omit<E, "id" | "at" | "simToday">
    : never
  : never;

export function eventPlanId(e: DomainEvent): string | undefined {
  return "planId" in e ? e.planId : undefined;
}
