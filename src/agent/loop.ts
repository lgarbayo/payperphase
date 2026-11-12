/**
 * Manual Claude tool loop (claude-api skill: manual loop so every call can be gated and
 * paused). Model from ANTHROPIC_MODEL_AGENT, tool_choice auto, `refusal` handled before content is read,
 * server-side fallbacks in the documented form (beta `server-side-fallback-2026-07-01`, `fallbacks:"default"`).
 * Every tool_use goes through AgentRun.callTool → guard; a violation returns an `is_error` tool_result so
 * the model corrects itself. send_invoice after an edit is held for a human Approve click.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PlanDiff } from "@/contracts";
import type { AgentRun, ToolOutcome, TriggerPayload } from "./runtime";
import { lt } from "./text";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type BetaToolUnion = Anthropic.Beta.Messages.BetaToolUnion;
type BetaToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
type BetaTool = Anthropic.Beta.Messages.BetaTool;

/** Minimal client seam (tests inject a scripted fake). */
export interface LlmClient {
  create(params: CreateParams): Promise<BetaMessage>;
}

export const MAX_LOOP_ITERATIONS = 12;
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type LoopOutcome =
  | { kind: "done"; iterations: number }
  | { kind: "refusal"; iterations: number; category: string | null }
  | { kind: "aborted"; iterations: number }
  | { kind: "error"; iterations: number; message: string };

export const AGENT_SYSTEM_PROMPT = `You are the billing agent of a Spanish dental clinic using PayPerPhase. Patients pay for treatment one clinical phase at a time, on the day each phase is delivered, never in advance. You issue and maintain one PayPal invoice per phase through the PayPal invoicing tools, and a phase is invoiced only on or after its visit day. Everything runs in the PayPal sandbox with synthetic patients.

Hard rules (a deterministic guard enforces every one of them on every call):
1. Money comes only from get_plan. For an invoice use exactly one item: name = phases[].itemName, quantity "1", unit_amount = {"currency_code":"EUR","value": phases[].amountValue}, item_date = phases[].visitDate. Never compute, round, add or change an amount, and never add tax, discount, tip, shipping or partial payments.
2. currency_code is always "EUR".
3. invoice_number is exactly phases[].nextInvoiceNumber (scheme PPP-{plan4}-F{n}-v{k}).
4. primary_recipients is exactly [{"billing_info":{"email_address": recipientEmail, "language": patientLanguage}}]. Never add other recipients.
5. invoice_date = phases[].invoiceDate when it is not null; otherwise omit invoice_date. note = phases[].note. invoicer_business_name = invoicerBusinessName; invoicer_email_address = invoicerEmail when it is not null.
6. Only touch invoices whose invoice_id appears in get_plan. A phase whose paymentStatus is "paid" or "processing" is never invoiced again.
7. Invoice on the visit day: create_invoice and send_invoice only for a phase whose invoiceableNow is true (its paymentStatus, recomputed at simToday, is "due" or "overdue"). A phase that is "scheduled" or "upcoming" gets no invoice and no tool call: it will be invoiced on its visit day (visitDate). The guard rejects anything else with PHASE_NOT_DUE.
8. To record a checkout payment use record_payment_for_invoice with method "PAYPAL", amount {"currency_code":"EUR","value": the phase amountValue}, payment_date = simToday, payment_id = the capture id when it has at most 22 characters.

How to work:
- Start with get_plan. Call tools one at a time unless the calls are independent.
- If a tool result is an error from the guard (error "GUARD_REJECTED"), read the reason, fix the input from get_plan and try once more. Never work around the guard.
- If a tool result says PENDING_HUMAN_APPROVAL, the dentist must approve that exact payload in the clinic console: do not retry it and do not call anything else for that invoice.
- If PayPal returns an error, do not retry the same call more than once.
- When the task is done, reply with one short sentence. Do not ask questions.`;

const LOCAL_TOOLS: BetaToolUnion[] = [
  {
    name: "get_plan",
    description:
      "Read the treatment plan's billing view: per phase the engine amount (amountValue, use it verbatim), visit date, payment status, current PayPal invoice, the next invoice number, invoice date and note, plus the recipient email. Always call this first.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_plan_diff",
    description:
      "Read what the dentist's last plan edit changed: per phase the amount before and after, added and removed lines, and moved dates.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function fmtDiff(diff: PlanDiff | undefined): string {
  if (!diff) return "(call get_plan_diff)";
  return diff.phases
    .filter((p) => p.deltaCents !== 0)
    .map((p) => `${p.phaseId}: ${p.amountBeforeCents} → ${p.amountAfterCents} cents`)
    .join("; ");
}

/** The user turn for a trigger. Facts only; amounts still come from get_plan. */
export function taskFor(planId: string, payload: TriggerPayload): string {
  switch (payload.type) {
    case "PLAN_APPROVED":
    case "MANUAL":
      return `Event ${payload.type} for plan ${planId}. The dentist approved the plan; that approval covers the first issue of each phase invoice, made on the phase's visit day. For each phase that is not paid, has invoiceableNow = true and has no invoice (or only a CANCELLED one): create_invoice, then send_invoice, then generate_invoice_qr_code. A DRAFT invoice with the right amount on such a phase only needs send_invoice and generate_invoice_qr_code. Make no tool call for a phase with invoiceableNow = false ("scheduled" or "upcoming"): it will be invoiced on its visit day. Skip phases that already have a sent invoice.`;
    case "PLAN_EDITED":
      return `Event PLAN_EDITED for plan ${planId}. Changed amounts: ${fmtDiff(payload.diff)}. For every unpaid phase with invoiceableNow = true whose current invoice amount differs from the engine amount in get_plan: cancel_sent_invoice on the old invoice (only if it was sent), create_invoice with the phase's nextInvoiceNumber and the new engine amount, then send_invoice for the new invoice (it will be held for the dentist's approval). An unpaid phase with invoiceableNow = true and no invoice (or only a CANCELLED one) is issued: create_invoice, then send_invoice. Make no tool call for a phase with invoiceableNow = false that has no invoice: it will be invoiced on its visit day at the new amount.`;
    case "PAYMENT_CAPTURED":
      return `Event PAYMENT_CAPTURED for plan ${planId}, phase ${payload.phaseId}: PayPal checkout captured ${payload.amountCents} cents (capture id ${payload.captureId ?? "unknown"}). Record this payment on that phase's open invoice with record_payment_for_invoice so the invoice is closed and the patient cannot pay twice. If the invoice is not open, do nothing.`;
    case "PHASE_STATUS_CHANGED":
      return payload.to === "overdue"
        ? `Event PHASE_STATUS_CHANGED for plan ${planId}: phase ${payload.phaseId} is now "overdue" (its visit day has passed and it is still unpaid). If that phase has an open sent invoice in get_plan, send one send_invoice_reminder for it, with a short subject and a note saying the visit of the phase visitDate is still unpaid. If it has no invoice (or only a CANCELLED one), issue it: create_invoice, send_invoice, then generate_invoice_qr_code. Touch no other phase.`
        : `Event PHASE_STATUS_CHANGED for plan ${planId}: phase ${payload.phaseId} is now "${payload.to}": its visit day has come. If that phase is unpaid and has no invoice (or only a CANCELLED one), issue it: create_invoice, send_invoice, then generate_invoice_qr_code. Touch no other phase.`;
  }
}

function toolResultFor(id: string, outcome: ToolOutcome): BetaToolResultBlockParam {
  switch (outcome.kind) {
    case "ok":
      return { type: "tool_result", tool_use_id: id, content: JSON.stringify(outcome.modelResult ?? { ok: true }) };
    case "guard":
      return {
        type: "tool_result",
        tool_use_id: id,
        is_error: true,
        content: JSON.stringify({ error: "GUARD_REJECTED", code: outcome.code, reason: outcome.reason.en }),
      };
    case "pending_approval":
      return {
        type: "tool_result",
        tool_use_id: id,
        content: JSON.stringify({
          status: "PENDING_HUMAN_APPROVAL",
          approval_id: outcome.approval.id,
          message: "Held for the dentist's approval of this exact payload. Do not retry.",
        }),
      };
    case "error":
      return {
        type: "tool_result",
        tool_use_id: id,
        is_error: true,
        content: JSON.stringify({ error: "PAYPAL_ERROR", message: outcome.message }),
      };
  }
}

export interface LoopDeps {
  llm: LlmClient;
  model: string;
  maxIterations?: number;
}

export async function runLlmLoop(run: AgentRun, payload: TriggerPayload, deps: LoopDeps): Promise<LoopOutcome> {
  const max = deps.maxIterations ?? MAX_LOOP_ITERATIONS;
  const toolkitTools = run.tools.listTools();
  if (!toolkitTools.length) return { kind: "error", iterations: 0, message: "no toolkit tool schemas" };
  const tools: BetaToolUnion[] = [
    ...LOCAL_TOOLS,
    ...toolkitTools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as BetaTool["input_schema"] })),
  ];
  const messages: BetaMessageParam[] = [{ role: "user", content: taskFor(run.planId, payload) }];

  for (let i = 1; i <= max; i++) {
    let response: BetaMessage;
    try {
      response = await deps.llm.create({
        model: deps.model,
        max_tokens: 16000,
        system: AGENT_SYSTEM_PROMPT,
        tools,
        tool_choice: { type: "auto" },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        messages,
      });
    } catch (err) {
      return { kind: "error", iterations: i, message: err instanceof Error ? err.message : String(err) };
    }

    // Check refusal before reading content (a refused turn may carry a truncated tool_use).
    if (response.stop_reason === "refusal") {
      return { kind: "refusal", iterations: i, category: response.stop_details?.category ?? null };
    }
    if (response.stop_reason === "max_tokens") return { kind: "error", iterations: i, message: "max_tokens" };

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) return { kind: "done", iterations: i };

    // Execute sequentially (state-dependent), return ALL results in one user message.
    const results: BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const outcome = await run.callTool(use.name, use.input);
      results.push(toolResultFor(use.id, outcome));
    }
    messages.push({ role: "user", content: results });
  }

  await run.emit({ kind: "error", ok: false, text: lt("loopAborted", { n: max }), output: { iterations: max } });
  run.issues++;
  return { kind: "aborted", iterations: max };
}

/** Real client: beta Messages API with server-side fallbacks; retried once without them if rejected. */
export function createAnthropicLlm(apiKey: string): LlmClient {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  let fallbacksAccepted = true;
  return {
    async create(params) {
      if (fallbacksAccepted) {
        try {
          return await client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" });
        } catch (err) {
          if (!(err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message))) throw err;
          fallbacksAccepted = false;
          console.warn("[agent] server-side fallback rejected (400); continuing without it");
        }
      }
      return client.beta.messages.create(params);
    },
  };
}
