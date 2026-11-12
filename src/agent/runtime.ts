/**
 * OWNED BY WP-10. One agent run: every step is redacted, persisted (store.appendAgentStep) and streamed
 * (AGENT_STEP). `callTool` is the single choke point for LLM and playbook alike:
 *   guard (incl. "invoice on the visit day" at the simulated today) → (human-approval gate) → toolkit call → phase.payment.invoice update + INVOICE_UPDATED.
 */
import { randomUUID } from "node:crypto";
import {
  AgentToolNameSchema,
  HUMAN_APPROVAL_TOOLS,
  InvoiceStatusSchema,
  type AgentStep,
  type AgentToolName,
  type AgentTrigger,
  type InvoiceToolName,
  type InvoiceToolsClient,
  type LocalizedText,
  type PendingApproval,
  type PhaseInvoice,
  type Plan,
  type PlanDiff,
} from "@/contracts";
import { publish } from "@/server/events";
import { store } from "@/server/store";
import { payloadSha256 } from "./approvals";
import { checkToolCall, nextNumberAfterDuplicate, parseInvoiceNumber, phaseOfInvoiceId, type GuardCode } from "./guard";
import { billingView, invoiceDateFor, realTodayIso, recipientFor, statusAfterSend } from "./policy";
import { redact } from "./redact";
import { day, errorMessageOf, lt, money } from "./text";

export type AgentRunMode = "llm" | "playbook";

/** Payload of the domain event that started the run (what the playbook / task prompt needs). */
export type TriggerPayload =
  | { type: "PLAN_APPROVED" }
  | { type: "MANUAL" }
  | { type: "PLAN_EDITED"; diff?: PlanDiff }
  | { type: "PAYMENT_CAPTURED"; phaseId: string; amountCents: number; captureId?: string; orderId?: string }
  | { type: "PHASE_STATUS_CHANGED"; phaseId: string; to: string };

export type ToolOutcome =
  | { kind: "ok"; output: unknown; modelResult: unknown; phaseId?: string }
  | { kind: "guard"; code: GuardCode; reason: LocalizedText; phaseId?: string }
  | { kind: "pending_approval"; approval: PendingApproval }
  | { kind: "error"; message: string; output: unknown; phaseId?: string };

export interface CallOptions {
  /** Executing a human-approved payload (decideApproval). */
  approval?: PendingApproval;
  /** Force the human gate for send_invoice (reissue after an edit). */
  requireApproval?: boolean;
  /** Internal: duplicate-number retries so far. */
  duplicateRetries?: number;
}

const MAX_DUPLICATE_RETRIES = 5;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** invoice_id carried by a stored approval payload. */
export function approvalInvoiceId(a: Pick<PendingApproval, "payload">): string | undefined {
  return isRecord(a.payload) && typeof a.payload.invoice_id === "string" ? a.payload.invoice_id : undefined;
}

function extractInvoiceId(output: unknown): string | undefined {
  if (!isRecord(output)) return undefined;
  if (typeof output.id === "string" && output.id) return output.id;
  const href = typeof output.href === "string" ? output.href : undefined;
  const fromHref = href?.match(/\/invoices\/([A-Za-z0-9_-]+)/)?.[1];
  if (fromHref) return fromHref;
  const links = Array.isArray(output.links) ? output.links : [];
  for (const l of links) {
    const m = isRecord(l) && typeof l.href === "string" ? l.href.match(/\/invoices\/([A-Za-z0-9_-]+)/) : null;
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function extractPayerUrl(output: unknown, invoiceId: string): string {
  if (isRecord(output) && typeof output.href === "string" && /^https?:\/\//.test(output.href)) return output.href;
  return `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`;
}

/** PayPal answers generate-qr-code with base64 PNG text (sometimes inside a multipart body). */
export function extractQrDataUrl(output: unknown): string | undefined {
  const text = typeof output === "string" ? output : isRecord(output) && typeof output.image === "string" ? output.image : "";
  if (text.startsWith("data:image/")) return text;
  const m = text.match(/iVBORw0KGgo[A-Za-z0-9+/=\r\n]+/);
  return m ? `data:image/png;base64,${m[0].replace(/[\r\n]/g, "")}` : undefined;
}

function asToolName(name: string): AgentToolName | undefined {
  const p = AgentToolNameSchema.safeParse(name);
  return p.success ? p.data : undefined;
}

export interface AgentRunInit {
  planId: string;
  trigger: AgentTrigger;
  mode: AgentRunMode;
  tools: InvoiceToolsClient;
  payload?: TriggerPayload;
  runId?: string;
  /** Continue an existing run's trace (approval execution). */
  startSeq?: number;
}

export class AgentRun {
  readonly runId: string;
  readonly planId: string;
  readonly trigger: AgentTrigger;
  readonly tools: InvoiceToolsClient;
  readonly payload: TriggerPayload | undefined;
  mode: AgentRunMode;
  issues = 0;
  /** Successful toolkit calls in this run (playbook completion uses it, e.g. reminders). */
  readonly executed: Array<{ tool: InvoiceToolName; input: Record<string, unknown>; phaseId?: string }> = [];
  private seq: number;

  constructor(init: AgentRunInit) {
    this.runId = init.runId ?? `run_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    this.planId = init.planId;
    this.trigger = init.trigger;
    this.mode = init.mode;
    this.tools = init.tools;
    this.payload = init.payload;
    this.seq = init.startSeq ?? 0;
  }

  get mock(): boolean {
    return this.tools.mode === "mock";
  }

  async emit(
    step: Pick<AgentStep, "kind"> & Partial<Omit<AgentStep, "id" | "runId" | "planId" | "seq" | "at" | "trigger" | "mode" | "mock">>,
  ): Promise<AgentStep> {
    const full: AgentStep = {
      id: `${this.runId}.${this.seq}`,
      runId: this.runId,
      planId: this.planId,
      seq: this.seq++,
      at: new Date().toISOString(),
      trigger: this.trigger,
      mode: this.mode,
      mock: this.mock,
      ...step,
      ...(step.input !== undefined ? { input: redact(step.input) } : {}),
      ...(step.output !== undefined ? { output: redact(step.output) } : {}),
    };
    await store.appendAgentStep(full);
    publish({ type: "AGENT_STEP", planId: this.planId, step: full });
    return full;
  }

  async explain(text: LocalizedText, extra: Partial<Pick<AgentStep, "phaseId" | "ok" | "output" | "approvalId">> = {}) {
    return this.emit({ kind: "explanation", text, ...extra });
  }

  async fail(message: string, phaseId?: string) {
    this.issues++;
    return this.emit({ kind: "error", ok: false, phaseId, text: lt("errorGeneric", { message }), output: { message } });
  }

  async getPlan(): Promise<Plan> {
    const plan = await store.getPlan(this.planId);
    if (!plan) throw new Error(`Plan not found: ${this.planId}`);
    return plan;
  }

  async simToday(): Promise<string> {
    return (await store.getClock()).today;
  }

  /** Does send_invoice on this invoice need a human-approved payload? */
  async sendNeedsApproval(plan: Plan, invoiceId: unknown, forced = false): Promise<boolean> {
    if (forced || this.trigger === "PLAN_EDITED") return true;
    if (typeof invoiceId !== "string") return false;
    const approvals = await store.listPendingApprovals(plan.id);
    if (approvals.some((a) => a.tool === "send_invoice" && approvalInvoiceId(a) === invoiceId)) return true;
    // A reissued version on an edited plan is a post-edit send, whatever event triggered this run.
    const phase = phaseOfInvoiceId(plan, invoiceId);
    const inv = phase?.payment.invoice;
    if (!phase || !inv) return false;
    if (inv.version > 1 && plan.version > 1) return true;
    // So is any invoice (even a first v1) at an amount the dentist's plan approval did not cover,
    // e.g. an edit saved while the PLAN_APPROVED run was still issuing invoices.
    const approved = plan.baseline?.phases.find((b) => b.phaseId === phase.id);
    return !!approved && approved.amountCents !== inv.amountCents;
  }

  /** The single gated entry point for every tool call. */
  async callTool(name: string, rawInput: unknown, opts: CallOptions = {}): Promise<ToolOutcome> {
    const plan = await this.getPlan();
    const input = isRecord(rawInput) ? rawInput : {};
    const recipientEmail = recipientFor(plan);
    const today = await this.simToday();
    const tool = asToolName(name);
    const isSend = tool !== undefined && (HUMAN_APPROVAL_TOOLS as readonly string[]).includes(tool);
    const requiresApproval = isSend ? await this.sendNeedsApproval(plan, input.invoice_id, opts.requireApproval) : false;

    // Human gate: hold the exact payload for one Approve click instead of executing it.
    if (isSend && requiresApproval && !opts.approval) {
      const pre = checkToolCall(name, rawInput, { plan, recipientEmail, today, requiresApproval: false });
      if (!pre.ok) return this.rejected(name, rawInput, pre);
      const existing = (await store.listPendingApprovals(plan.id)).find(
        (a) => a.status === "pending" && approvalInvoiceId(a) === input.invoice_id,
      );
      if (existing) return { kind: "pending_approval", approval: existing };
      return { kind: "pending_approval", approval: await this.requestApproval(plan, input) };
    }

    const verdict = checkToolCall(name, rawInput, { plan, recipientEmail, today, requiresApproval, approval: opts.approval });
    if (!verdict.ok) return this.rejected(name, rawInput, verdict);
    const phaseId = verdict.phaseId;

    if (tool === "get_plan" || tool === "get_plan_diff") {
      await this.emit({ kind: "tool_call", tool, input, text: lt(tool === "get_plan" ? "callGetPlan" : "callGetDiff") });
      const output = tool === "get_plan" ? billingView(plan, today) : this.diffView(plan);
      await this.emit({ kind: "tool_result", tool, ok: true, text: lt(tool === "get_plan" ? "resultPlan" : "resultDiff") });
      return { kind: "ok", output, modelResult: output };
    }

    const invoiceTool = tool as InvoiceToolName;
    await this.emit({ kind: "tool_call", tool: invoiceTool, phaseId, input, text: this.callText(invoiceTool, input, plan) });

    let res: { ok: boolean; output: unknown };
    try {
      res = await this.tools.call(invoiceTool, input);
    } catch (err) {
      res = { ok: false, output: { error: { message: err instanceof Error ? err.message : String(err) } } };
    }

    if (!res.ok && invoiceTool === "create_invoice" && typeof input.invoice_number === "string") {
      const next = nextNumberAfterDuplicate(res.output, input.invoice_number);
      const retries = opts.duplicateRetries ?? 0;
      if (next && retries < MAX_DUPLICATE_RETRIES) {
        await this.emit({
          kind: "tool_result",
          tool: invoiceTool,
          phaseId,
          ok: false,
          output: res.output,
          text: lt("resultDuplicate", { number: input.invoice_number, next }),
        });
        return this.callTool(name, { ...input, invoice_number: next }, { ...opts, duplicateRetries: retries + 1 });
      }
    }

    // Live spike: method PAYPAL needs a transaction PayPal knows (404 otherwise). Deterministic fallback
    // (never model-chosen, amount already guard-checked): record it as an external payment so the invoice
    // still closes and the patient cannot pay twice. The capture id goes into the note.
    if (!res.ok && invoiceTool === "record_payment_for_invoice" && isRecord(res.output) && res.output.status === 404) {
      const { payment_id: captureId, ...rest } = input;
      await this.emit({
        kind: "tool_result",
        tool: invoiceTool,
        phaseId,
        ok: false,
        output: res.output,
        text: lt("resultRecordFallback"),
      });
      const note = `PayPal capture ${typeof captureId === "string" ? captureId : "—"}${typeof input.note === "string" ? ` · ${input.note}` : ""}`;
      res = await this.tools.call(invoiceTool, { ...rest, method: "OTHER", note: note.slice(0, 2000) });
    }

    if (!res.ok) {
      const message = errorMessageOf(res.output);
      this.issues++;
      await this.emit({
        kind: "tool_result",
        tool: invoiceTool,
        phaseId,
        ok: false,
        output: res.output,
        text: lt("resultError", { message }),
      });
      return { kind: "error", message, output: res.output, phaseId };
    }

    try {
      const applied = await this.applyResult(invoiceTool, input, res.output, plan, recipientEmail);
      this.executed.push({ tool: invoiceTool, input, phaseId });
      await this.emit({
        kind: "tool_result",
        tool: invoiceTool,
        phaseId,
        ok: true,
        output: applied.output,
        text: applied.text,
      });
      return { kind: "ok", output: applied.output, modelResult: applied.modelResult, phaseId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.issues++;
      await this.emit({ kind: "tool_result", tool: invoiceTool, phaseId, ok: false, output: res.output, text: lt("resultError", { message }) });
      return { kind: "error", message, output: res.output, phaseId };
    }
  }

  private async rejected(name: string, input: unknown, v: Extract<ReturnType<typeof checkToolCall>, { ok: false }>): Promise<ToolOutcome> {
    const tool = asToolName(name);
    await this.emit({
      kind: "guard_rejected",
      ...(tool ? { tool } : {}),
      phaseId: v.phaseId,
      input: tool ? input : { tool: String(name).slice(0, 60), input },
      output: { code: v.code, reason: v.reason, ...(v.details ? { details: v.details } : {}) },
      ok: false,
      text: v.reason,
    });
    return { kind: "guard", code: v.code, reason: v.reason, phaseId: v.phaseId };
  }

  private diffView(plan: Plan) {
    const diff = this.payload?.type === "PLAN_EDITED" ? this.payload.diff : undefined;
    if (diff) return diff;
    return {
      planId: plan.id,
      phases: plan.phases.map((p) => ({
        phaseId: p.id,
        n: p.n,
        invoiceAmountCents: p.payment.invoice?.amountCents ?? null,
        engineAmountCents: p.amountCents,
      })),
    };
  }

  private callText(tool: InvoiceToolName, input: Record<string, unknown>, plan: Plan): LocalizedText {
    const number = (() => {
      if (typeof input.invoice_number === "string") return input.invoice_number;
      const id = typeof input.invoice_id === "string" ? input.invoice_id : "";
      return phaseOfInvoiceId(plan, id)?.payment.invoice?.invoiceNumber ?? id;
    })();
    switch (tool) {
      case "create_invoice": {
        const items = Array.isArray(input.items) ? input.items : [];
        const cents = items.reduce<number>((sum, it) => {
          const v = isRecord(it) && isRecord(it.unit_amount) ? Number(it.unit_amount.value) : NaN;
          const q = isRecord(it) ? Number(it.quantity ?? 1) : 1;
          return sum + (Number.isFinite(v) ? Math.round(v * 100) * q : 0);
        }, 0);
        const recips = Array.isArray(input.primary_recipients) ? input.primary_recipients : [];
        const first = recips[0];
        const email = isRecord(first) && isRecord(first.billing_info) ? String(first.billing_info.email_address ?? "") : "";
        return lt("callCreate", (l) => ({ number, amount: money(cents, l), email }));
      }
      case "send_invoice":
        return lt("callSend", { number });
      case "send_invoice_reminder":
        return lt("callRemind", { number });
      case "cancel_sent_invoice":
        return lt("callCancel", { number });
      case "get_invoice":
        return lt("callGet", { number });
      case "generate_invoice_qr_code":
        return lt("callQr", { number });
      case "record_payment_for_invoice": {
        const v = isRecord(input.amount) ? Number(input.amount.value) : NaN;
        return lt("callRecord", (l) => ({ number, amount: money(Number.isFinite(v) ? Math.round(v * 100) : 0, l) }));
      }
    }
  }

  /** Mirror a successful PayPal result onto phase.payment.invoice and publish INVOICE_UPDATED. */
  private async applyResult(
    tool: InvoiceToolName,
    input: Record<string, unknown>,
    output: unknown,
    plan: Plan,
    recipientEmail: string,
  ): Promise<{ output: unknown; modelResult: unknown; text: LocalizedText }> {
    const now = new Date().toISOString();
    if (tool === "create_invoice") {
      const invoiceId = extractInvoiceId(output);
      if (!invoiceId) throw new Error("PayPal returned no invoice id");
      const number = String(input.invoice_number);
      const parsed = parseInvoiceNumber(number)!;
      const phase = plan.phases.find((p) => p.n === parsed.n)!;
      const invoice: PhaseInvoice = {
        invoiceId,
        invoiceNumber: number,
        version: parsed.version,
        status: "DRAFT",
        amountCents: phase.amountCents,
        recipientEmail,
        hasQr: false,
        updatedAt: now,
      };
      await this.setInvoice(phase.id, invoice);
      return {
        output: { invoiceId, invoiceNumber: number, status: "DRAFT" },
        modelResult: { invoice_id: invoiceId, invoice_number: number, status: "DRAFT" },
        text: lt("resultCreate", { number }),
      };
    }

    const invoiceId = String(input.invoice_id);
    const phase = phaseOfInvoiceId(plan, invoiceId)!;
    const current = phase.payment.invoice!;
    const number = current.invoiceNumber;

    switch (tool) {
      case "send_invoice": {
        const status = statusAfterSend(invoiceDateFor(phase, await this.simToday()), realTodayIso());
        const payerViewUrl = extractPayerUrl(output, invoiceId);
        await this.setInvoice(phase.id, { ...current, status, payerViewUrl, updatedAt: now });
        return {
          output: { invoiceId, invoiceNumber: number, status, payerViewUrl },
          modelResult: { invoice_id: invoiceId, status, payer_view_url: payerViewUrl },
          text:
            status === "SCHEDULED"
              ? lt("resultScheduled", (l) => ({ number, date: day(phase.payment.dueDate, l) }))
              : lt("resultSend", { number }),
        };
      }
      case "send_invoice_reminder":
        await this.setInvoice(phase.id, { ...current, updatedAt: now });
        return { output: { invoiceId, invoiceNumber: number, reminded: true }, modelResult: { invoice_id: invoiceId, reminded: true }, text: lt("resultRemind") };
      case "cancel_sent_invoice":
        await this.setInvoice(phase.id, { ...current, status: "CANCELLED", updatedAt: now });
        return { output: { invoiceId, invoiceNumber: number, status: "CANCELLED" }, modelResult: { invoice_id: invoiceId, status: "CANCELLED" }, text: lt("resultCancel", { number }) };
      case "generate_invoice_qr_code": {
        const qrDataUrl = extractQrDataUrl(output);
        await this.setInvoice(phase.id, { ...current, hasQr: true, updatedAt: now });
        return {
          output: { invoiceId, invoiceNumber: number, ...(qrDataUrl ? { qrDataUrl } : { raw: output }) },
          modelResult: { invoice_id: invoiceId, qr_code: qrDataUrl ? "generated (PNG)" : "generated" },
          text: lt("resultQr"),
        };
      }
      case "record_payment_for_invoice":
        await this.setInvoice(phase.id, { ...current, status: "MARKED_AS_PAID", updatedAt: now });
        return {
          output: { invoiceId, invoiceNumber: number, status: "MARKED_AS_PAID", result: output },
          modelResult: { invoice_id: invoiceId, status: "MARKED_AS_PAID" },
          text: lt("resultRecord", { number }),
        };
      case "get_invoice": {
        const st = isRecord(output) ? InvoiceStatusSchema.safeParse(output.status) : null;
        const status = st?.success ? st.data : current.status;
        if (status !== current.status) await this.setInvoice(phase.id, { ...current, status, updatedAt: now });
        return {
          output: isRecord(output) ? { id: output.id, status: output.status, detail: output.detail, amount: output.amount } : output,
          modelResult: { invoice_id: invoiceId, status },
          text: lt("resultGet", { status }),
        };
      }
      default:
        throw new Error(`Unexpected tool ${tool}`);
    }
  }

  private async setInvoice(phaseId: string, invoice: PhaseInvoice): Promise<void> {
    await store.updatePlan(this.planId, (p) => ({
      ...p,
      phases: p.phases.map((ph) => (ph.id === phaseId ? { ...ph, payment: { ...ph.payment, invoice } } : ph)),
    }));
    publish({
      type: "INVOICE_UPDATED",
      planId: this.planId,
      phaseId,
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
    });
  }

  /** Store the exact send payload and ask for one human Approve click. */
  async requestApproval(plan: Plan, payload: Record<string, unknown>): Promise<PendingApproval> {
    const invoiceId = String(payload.invoice_id);
    const phase = phaseOfInvoiceId(plan, invoiceId)!;
    const inv = phase.payment.invoice!;
    const now = new Date().toISOString();

    for (const old of await store.listPendingApprovals(plan.id)) {
      if (old.status === "pending" && old.phaseId === phase.id && approvalInvoiceId(old) !== invoiceId) {
        await store.savePendingApproval({ ...old, status: "rejected", decidedAt: now, decidedBy: "agent:superseded" });
        const oldNumber = String(approvalInvoiceId(old) ?? "");
        await this.explain(lt("explainSuperseded", { number: oldNumber }), { phaseId: phase.id, approvalId: old.id });
      }
    }

    const summary = lt("approvalSummary", (l) => ({
      number: inv.invoiceNumber,
      amount: money(inv.amountCents, l),
      email: inv.recipientEmail,
    }));
    const approval: PendingApproval = {
      id: `apr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      runId: this.runId,
      planId: plan.id,
      phaseId: phase.id,
      tool: "send_invoice",
      payload,
      payloadSha256: payloadSha256(payload),
      summary,
      status: "pending",
      createdAt: now,
    };
    await store.savePendingApproval(approval);
    await this.emit({
      kind: "approval_required",
      tool: "send_invoice",
      phaseId: phase.id,
      input: payload,
      output: {
        invoiceNumber: inv.invoiceNumber,
        amountCents: inv.amountCents,
        recipientEmail: inv.recipientEmail,
        payloadSha256: approval.payloadSha256,
      },
      approvalId: approval.id,
      text: summary,
    });
    publish({ type: "APPROVAL_REQUESTED", planId: plan.id, approval });
    return approval;
  }

  async start(): Promise<void> {
    await this.emit({
      kind: "run_started",
      text: lt("runStarted", (l) => ({ trigger: triggerLabel(this.trigger, l) })),
      output: { trigger: this.trigger, mode: this.mode, paypal: this.tools.mode },
    });
  }

  async finish(): Promise<void> {
    await this.emit({ kind: "run_finished", ok: this.issues === 0, text: lt(this.issues === 0 ? "runFinished" : "runFinishedIssues") });
  }
}

export function triggerLabel(trigger: AgentTrigger, locale: "es" | "en"): string {
  return lt(`trigger_${trigger}`)[locale];
}
