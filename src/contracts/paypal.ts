import { z } from "zod";
import { CentsSchema, IsoDateTimeSchema, PhaseIdSchema, PlanIdSchema } from "./primitives";

/**
 * Server-side PayPal checkout contract (WP-04). The client NEVER sends an amount:
 * the server reads Phase.amountCents from the store and asks engine.canCreateOrder().
 */
export const CreatePhaseOrderRequestSchema = z.object({ planId: PlanIdSchema, phaseId: PhaseIdSchema });
export type CreatePhaseOrderRequest = z.infer<typeof CreatePhaseOrderRequestSchema>;

export const CreatePhaseOrderResponseSchema = z.object({
  orderId: z.string(),
  amountCents: CentsSchema,
  mode: z.enum(["live", "mock"]),
});
export type CreatePhaseOrderResponse = z.infer<typeof CreatePhaseOrderResponseSchema>;

export const CapturePhaseOrderRequestSchema = z.object({
  planId: PlanIdSchema,
  phaseId: PhaseIdSchema,
  orderId: z.string(),
});
export type CapturePhaseOrderRequest = z.infer<typeof CapturePhaseOrderRequestSchema>;

/** COMPLETED → paid; PENDING → processing; DECLINED → JS SDK actions.restart(). */
export const CaptureOutcomeSchema = z.enum(["COMPLETED", "PENDING", "DECLINED", "ALREADY_CAPTURED"]);
export type CaptureOutcome = z.infer<typeof CaptureOutcomeSchema>;

export const CapturePhaseOrderResponseSchema = z.object({
  outcome: CaptureOutcomeSchema,
  captureId: z.string().optional(),
  paidCents: CentsSchema.optional(),
  mode: z.enum(["live", "mock"]),
});
export type CapturePhaseOrderResponse = z.infer<typeof CapturePhaseOrderResponseSchema>;

/** Stored once per PayPal webhook event id (UNIQUE) for dedupe and audit. */
export const WebhookEventRecordSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  receivedAt: IsoDateTimeSchema,
  verified: z.boolean(),
  resourceId: z.string().optional(),
  planId: PlanIdSchema.optional(),
  phaseId: PhaseIdSchema.optional(),
  applied: z.boolean(),
});
export type WebhookEventRecord = z.infer<typeof WebhookEventRecordSchema>;

/** custom_id on every order/invoice so webhooks can be routed back: "{planId}:{phaseId}". */
export function phaseCustomId(planId: string, phaseId: string): string {
  return `${planId}:${phaseId}`;
}
export function parsePhaseCustomId(customId: string): { planId: string; phaseId: string } | null {
  const m = /^(pln_[a-z0-9]{8}):(ph[1-9][0-9]?)$/.exec(customId);
  return m ? { planId: m[1]!, phaseId: m[2]! } : null;
}
