import { z } from "zod";
import { INVOICE_NUMBER_MAX } from "./constants";
import { IsoDateTimeSchema, LocalizedTextSchema, PhaseIdSchema, PlanIdSchema } from "./primitives";

/**
 * PayPal Agent Toolkit invoice tools the clinic agent may call (allowlist).
 * Names are the toolkit's `method` names in @paypal/agent-toolkit@1.11.0
 * (configuration.actions.invoices: create, send, sendReminder, cancel, get, generateQRC, recordPayment).
 */
export const InvoiceToolNameSchema = z.enum([
  "create_invoice",
  "send_invoice",
  "send_invoice_reminder",
  "cancel_sent_invoice",
  "get_invoice",
  "generate_invoice_qr_code",
  "record_payment_for_invoice",
]);
export type InvoiceToolName = z.infer<typeof InvoiceToolNameSchema>;

/** Local read-only tools the agent also gets (served from the store/engine, not PayPal). */
export const LocalAgentToolNameSchema = z.enum(["get_plan", "get_plan_diff"]);
export type LocalAgentToolName = z.infer<typeof LocalAgentToolNameSchema>;

export const AgentToolNameSchema = z.union([InvoiceToolNameSchema, LocalAgentToolNameSchema]);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;

/** Tools that execute only after one human "Approve" click on the stored payload. */
export const HUMAN_APPROVAL_TOOLS: readonly InvoiceToolName[] = ["send_invoice"];

/** Toolkit configuration.actions.invoices flags that enable exactly the allowlist. */
export const TOOLKIT_INVOICE_ACTIONS = {
  create: true,
  send: true,
  sendReminder: true,
  cancel: true,
  get: true,
  generateQRC: true,
  recordPayment: true,
} as const;

/** PPP-{plan4}-F{n}-v{k}; plan4 = chars 4..8 of the plan id, upper-cased. */
export const INVOICE_NUMBER_RE = /^PPP-[A-Z0-9]{4}-F[1-9][0-9]?-v[1-9][0-9]{0,3}$/;

export function planShortCode(planId: string): string {
  return planId.slice(4, 8).toUpperCase();
}

export function formatInvoiceNumber(planId: string, phaseN: number, version: number): string {
  const s = `PPP-${planShortCode(planId)}-F${phaseN}-v${version}`;
  if (s.length > INVOICE_NUMBER_MAX || !INVOICE_NUMBER_RE.test(s)) throw new Error(`Bad invoice number ${s}`);
  return s;
}

export const AgentTriggerSchema = z.enum([
  "PLAN_APPROVED",
  "PLAN_EDITED",
  "PAYMENT_CAPTURED",
  "PHASE_STATUS_CHANGED",
  "MANUAL",
]);
export type AgentTrigger = z.infer<typeof AgentTriggerSchema>;

export const AgentStepKindSchema = z.enum([
  "run_started",
  /** Plain-language explanation for the clinic (e.g. the PlanDiff summary). */
  "explanation",
  "tool_call",
  "tool_result",
  /** The deterministic guard refused a tool call; the model sees an is_error tool_result. */
  "guard_rejected",
  "approval_required",
  "approval_granted",
  "error",
  "run_finished",
]);
export type AgentStepKind = z.infer<typeof AgentStepKindSchema>;

export const AgentStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  planId: PlanIdSchema,
  phaseId: PhaseIdSchema.optional(),
  seq: z.number().int().nonnegative(),
  at: IsoDateTimeSchema,
  trigger: AgentTriggerSchema,
  kind: AgentStepKindSchema,
  tool: AgentToolNameSchema.optional(),
  /** JSON-serialisable tool input/output (already redacted of secrets). */
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  ok: z.boolean().optional(),
  /** Human-readable line for the feed. */
  text: LocalizedTextSchema.optional(),
  /** llm = Claude tool loop; playbook = deterministic fallback calling the same toolkit tools. */
  mode: z.enum(["llm", "playbook"]),
  /** True when PayPal calls were mocked (no credentials). */
  mock: z.boolean(),
  approvalId: z.string().optional(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

export const PendingApprovalSchema = z.object({
  id: z.string(),
  runId: z.string(),
  planId: PlanIdSchema,
  phaseId: PhaseIdSchema,
  tool: InvoiceToolNameSchema,
  /** Exactly what will be executed after approval. */
  payload: z.unknown(),
  /** sha256 of the canonical JSON payload; re-checked before execution. */
  payloadSha256: z.string(),
  summary: LocalizedTextSchema,
  status: z.enum(["pending", "approved", "rejected", "executed", "failed"]),
  createdAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.optional(),
  decidedBy: z.string().optional(),
});
export type PendingApproval = z.infer<typeof PendingApprovalSchema>;

/**
 * Abstraction over the toolkit so the agent can run against the real
 * PayPal Agent Toolkit or a mock. WP-10 implements both.
 */
export interface InvoiceToolsClient {
  readonly mode: "live" | "mock";
  /** JSON schemas for the allowlisted tools (from toolkit.getTools(), mapped to Anthropic tool shape). */
  listTools(): Array<{ name: InvoiceToolName; description: string; input_schema: Record<string, unknown> }>;
  call(name: InvoiceToolName, input: Record<string, unknown>): Promise<{ ok: boolean; output: unknown }>;
}
