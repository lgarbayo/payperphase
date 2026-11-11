/**
 * OWNED BY WP-10. Deterministic playbook: the same toolkit tools, in a fixed order, through the same
 * guard. Used when the LLM is unavailable (no key, refusal, error, runaway loop) and, after an LLM run,
 * to complete anything the model left out. `planActions` is pure (state → actions); execution re-reads
 * the plan before every call, so it is idempotent: invoices that already exist are never re-created.
 */
import { formatInvoiceNumber, type LocalizedText, type PendingApproval, type Plan } from "@/contracts";
import { store } from "@/server/store";
import {
  buildCancelInput,
  buildCreateInvoiceInput,
  buildQrInput,
  buildRecordPaymentInput,
  buildReminderInput,
  buildSendInvoiceInput,
  isOpenInvoice,
  isPhaseSettled,
  liveInvoice,
  nextInvoiceVersion,
  PAID_INVOICE_STATUSES,
} from "./policy";
import { approvalInvoiceId, type AgentRun, type TriggerPayload } from "./runtime";
import { lt } from "./text";

export type PlaybookAction =
  | { kind: "issue"; phaseId: string; qr: boolean }
  | { kind: "send"; phaseId: string; qr: boolean }
  | { kind: "qr"; phaseId: string }
  | { kind: "reissue"; phaseId: string }
  | { kind: "record_payment"; phaseId: string; amountCents: number; captureId?: string }
  | { kind: "remind"; phaseId: string }
  | { kind: "note"; text: LocalizedText; phaseId?: string };

export interface PlanContext {
  approvals: readonly PendingApproval[];
  /** Phases already reminded in this run. */
  remindedPhaseIds?: ReadonlySet<string>;
}

const isDue = (status: string) => status === "due" || status === "overdue";

function approvalsFor(ctx: PlanContext, invoiceId: string) {
  return ctx.approvals.filter((a) => a.tool === "send_invoice" && approvalInvoiceId(a) === invoiceId);
}

/** Pure: what the playbook would do for this trigger on this plan state. */
export function planActions(plan: Plan, payload: TriggerPayload, ctx: PlanContext): PlaybookAction[] {
  const actions: PlaybookAction[] = [];
  const notApproved = (): PlaybookAction[] => [{ kind: "note", text: lt("explainPlanNotApproved") }];

  switch (payload.type) {
    case "PLAN_APPROVED":
    case "MANUAL": {
      if (plan.status !== "approved") return notApproved();
      for (const phase of plan.phases) {
        const inv = phase.payment.invoice;
        if (isPhaseSettled(phase) || (inv && PAID_INVOICE_STATUSES.includes(inv.status))) {
          actions.push({ kind: "note", phaseId: phase.id, text: lt("explainSkipPaid", { n: phase.n }) });
          continue;
        }
        const due = isDue(phase.payment.status);
        if (!inv || inv.status === "CANCELLED") {
          actions.push({ kind: "issue", phaseId: phase.id, qr: due });
          continue;
        }
        const related = approvalsFor(ctx, inv.invoiceId);
        if (related.some((a) => a.status === "pending") && inv.amountCents === phase.amountCents) {
          actions.push({ kind: "note", phaseId: phase.id, text: lt("explainAwaiting", { number: inv.invoiceNumber }) });
          continue;
        }
        if (inv.amountCents !== phase.amountCents) {
          actions.push({ kind: "reissue", phaseId: phase.id });
          continue;
        }
        if (inv.status === "DRAFT") {
          // A draft whose send the dentist rejected stays a draft.
          if (!related.some((a) => a.status === "rejected")) actions.push({ kind: "send", phaseId: phase.id, qr: due });
          continue;
        }
        if (due && !inv.hasQr) actions.push({ kind: "qr", phaseId: phase.id });
      }
      if (!actions.some((a) => a.kind !== "note")) actions.push({ kind: "note", text: lt("explainNoChanges") });
      return actions;
    }

    case "PLAN_EDITED": {
      if (plan.status !== "approved") return notApproved();
      const diffChanged = new Set(
        (payload.diff?.phases ?? []).filter((d) => d.deltaCents !== 0).map((d) => d.phaseId),
      );
      for (const phase of plan.phases) {
        const inv = liveInvoice(phase);
        const changed = inv ? inv.amountCents !== phase.amountCents : diffChanged.has(phase.id);
        if (!changed) continue;
        if (isPhaseSettled(phase) || (inv && PAID_INVOICE_STATUSES.includes(inv.status))) {
          actions.push({ kind: "note", phaseId: phase.id, text: lt("explainSkipPaid", { n: phase.n }) });
          continue;
        }
        actions.push({ kind: "reissue", phaseId: phase.id });
      }
      if (!actions.length) actions.push({ kind: "note", text: lt("explainNoChanges") });
      return actions;
    }

    case "PAYMENT_CAPTURED": {
      const phase = plan.phases.find((p) => p.id === payload.phaseId);
      if (!phase) return [];
      const inv = phase.payment.invoice;
      if (inv && PAID_INVOICE_STATUSES.includes(inv.status)) {
        return [{ kind: "note", phaseId: phase.id, text: lt("explainAlreadyRecorded", { n: phase.n }) }];
      }
      if (!isOpenInvoice(inv)) {
        return [{ kind: "note", phaseId: phase.id, text: lt("explainNoOpenInvoice", { n: phase.n }) }];
      }
      return [{ kind: "record_payment", phaseId: phase.id, amountCents: payload.amountCents, captureId: payload.captureId }];
    }

    case "PHASE_STATUS_CHANGED": {
      if (payload.to !== "upcoming") return [];
      const phase = plan.phases.find((p) => p.id === payload.phaseId);
      if (!phase) return [];
      if (!isOpenInvoice(phase.payment.invoice)) {
        return [{ kind: "note", phaseId: phase.id, text: lt("explainNothingToRemind", { n: phase.n }) }];
      }
      if (ctx.remindedPhaseIds?.has(phase.id)) return [];
      return [{ kind: "remind", phaseId: phase.id }];
    }
  }
}

export function hasWork(actions: readonly PlaybookAction[]): boolean {
  return actions.some((a) => a.kind !== "note");
}

/** Phases the run already reminded (successful send_invoice_reminder). */
export function remindedIn(run: AgentRun): Set<string> {
  return new Set(run.executed.filter((e) => e.tool === "send_invoice_reminder" && e.phaseId).map((e) => e.phaseId!));
}

export async function planFor(run: AgentRun, payload: TriggerPayload): Promise<PlaybookAction[]> {
  const plan = await run.getPlan();
  const approvals = await store.listPendingApprovals(plan.id);
  return planActions(plan, payload, { approvals, remindedPhaseIds: remindedIn(run) });
}

async function phaseNow(run: AgentRun, phaseId: string) {
  const plan = await run.getPlan();
  const phase = plan.phases.find((p) => p.id === phaseId);
  if (!phase) throw new Error(`Unknown phase ${phaseId}`);
  return { plan, phase };
}

async function sendAndQr(run: AgentRun, invoiceId: string, qr: boolean) {
  const sent = await run.callTool("send_invoice", buildSendInvoiceInput(invoiceId));
  if (sent.kind === "ok" && qr) await run.callTool("generate_invoice_qr_code", buildQrInput(invoiceId));
}

async function execute(run: AgentRun, action: PlaybookAction): Promise<void> {
  switch (action.kind) {
    case "note":
      await run.explain(action.text, action.phaseId ? { phaseId: action.phaseId } : {});
      return;

    case "issue": {
      const { plan, phase } = await phaseNow(run, action.phaseId);
      const input = buildCreateInvoiceInput(plan, phase, nextInvoiceVersion(phase), await run.simToday());
      const created = await run.callTool("create_invoice", input);
      if (created.kind !== "ok") return;
      const { phase: after } = await phaseNow(run, action.phaseId);
      if (after.payment.invoice) await sendAndQr(run, after.payment.invoice.invoiceId, action.qr);
      return;
    }

    case "send": {
      const { phase } = await phaseNow(run, action.phaseId);
      if (phase.payment.invoice) await sendAndQr(run, phase.payment.invoice.invoiceId, action.qr);
      return;
    }

    case "qr": {
      const { phase } = await phaseNow(run, action.phaseId);
      if (phase.payment.invoice) await run.callTool("generate_invoice_qr_code", buildQrInput(phase.payment.invoice.invoiceId));
      return;
    }

    case "reissue": {
      // cancel (old, if it is a live instrument) → create v+1 (engine amount) → send held for approval.
      const first = await phaseNow(run, action.phaseId);
      const old = first.phase.payment.invoice;
      const version = nextInvoiceVersion(first.phase);
      if (old && isOpenInvoice(old)) {
        const nextNumber = formatInvoiceNumber(first.plan.id, first.phase.n, version);
        const cancelled = await run.callTool("cancel_sent_invoice", buildCancelInput(first.plan, old.invoiceId, nextNumber));
        if (cancelled.kind !== "ok") return;
      }
      const { plan, phase } = await phaseNow(run, action.phaseId);
      const created = await run.callTool(
        "create_invoice",
        buildCreateInvoiceInput(plan, phase, nextInvoiceVersion(phase), await run.simToday()),
      );
      if (created.kind !== "ok") return;
      const { phase: after } = await phaseNow(run, action.phaseId);
      if (after.payment.invoice) {
        await run.callTool("send_invoice", buildSendInvoiceInput(after.payment.invoice.invoiceId), { requireApproval: true });
      }
      return;
    }

    case "record_payment": {
      const { plan, phase } = await phaseNow(run, action.phaseId);
      const inv = phase.payment.invoice;
      if (!inv) return;
      await run.callTool(
        "record_payment_for_invoice",
        buildRecordPaymentInput(plan, inv.invoiceId, action.amountCents, await run.simToday(), action.captureId),
      );
      return;
    }

    case "remind": {
      const { plan, phase } = await phaseNow(run, action.phaseId);
      const inv = phase.payment.invoice;
      if (!inv) return;
      await run.callTool("send_invoice_reminder", buildReminderInput(plan, phase, inv.invoiceId));
      return;
    }
  }
}

/** Execute actions in order; one failing action never stops the others. */
export async function executeActions(run: AgentRun, actions: readonly PlaybookAction[]): Promise<void> {
  for (const action of actions) {
    try {
      await execute(run, action);
    } catch (err) {
      await run.fail(err instanceof Error ? err.message : String(err), "phaseId" in action ? action.phaseId : undefined);
    }
  }
}
