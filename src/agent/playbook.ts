/**
 * OWNED BY WP-10. Deterministic playbook: the same toolkit tools, in a fixed order, through the same
 * guard. Used when the LLM is unavailable (no key, refusal, error, runaway loop) and, after an LLM run,
 * to complete anything the model left out. `planActions` is pure (state + simulated today → actions);
 * execution re-reads the plan before every call, so it is idempotent: invoices that already exist are
 * never re-created.
 *
 * Invoice on the visit day: a phase is invoiced only when it is due (engine status at the simulated
 * today is "due" or "overdue", see isPhaseDueAt). A phase that is not due yet gets no tool call, only a
 * note that it will be invoiced on its visit day, so no invoice exists before the visit.
 */
import { formatInvoiceNumber, type LocalizedText, type PendingApproval, type Phase, type Plan } from "@/contracts";
import { store } from "@/server/store";
import {
  buildCancelInput,
  buildCreateInvoiceInput,
  buildQrInput,
  buildRecordPaymentInput,
  buildReminderInput,
  buildSendInvoiceInput,
  isOpenInvoice,
  isPhaseDueAt,
  isPhaseSettled,
  liveInvoice,
  nextInvoiceVersion,
  PAID_INVOICE_STATUSES,
} from "./policy";
import { approvalInvoiceId, type AgentRun, type TriggerPayload } from "./runtime";
import { day, lt, money } from "./text";

export type PlaybookAction =
  | { kind: "issue"; phaseId: string; qr: boolean }
  | { kind: "send"; phaseId: string; qr: boolean }
  | { kind: "qr"; phaseId: string }
  | { kind: "reissue"; phaseId: string }
  | { kind: "record_payment"; phaseId: string; amountCents: number; captureId?: string }
  | { kind: "remind"; phaseId: string }
  /** Cancel a live invoice of a phase that is not due (issued before the visit-day rule); no new one. */
  | { kind: "withdraw"; phaseId: string }
  /** `deferred`: "will be invoiced on its visit day" (kept even when the LLM did the tool work). */
  | { kind: "note"; text: LocalizedText; phaseId?: string; deferred?: true };

export interface PlanContext {
  approvals: readonly PendingApproval[];
  /** The simulated clock's today: "due" is recomputed from the engine dates at this day. */
  today: string;
  /** Phases already reminded in this run. */
  remindedPhaseIds?: ReadonlySet<string>;
  /** Phases whose invoice was created or sent in this run (no reminder right after issuing it). */
  issuedPhaseIds?: ReadonlySet<string>;
}

/** "Phase n will be invoiced on its visit day, <date>" (with the new amount after an edit). */
function deferredNote(phase: Phase, withAmount = false): PlaybookAction {
  const text = withAmount
    ? lt("explainInvoiceOnVisitDayAmount", (l) => ({ n: phase.n, date: day(phase.payment.dueDate, l), amount: money(phase.amountCents, l) }))
    : lt("explainInvoiceOnVisitDay", (l) => ({ n: phase.n, date: day(phase.payment.dueDate, l) }));
  return { kind: "note", phaseId: phase.id, text, deferred: true };
}

function isPaidPhase(phase: Phase): boolean {
  const inv = phase.payment.invoice;
  return isPhaseSettled(phase) || (!!inv && PAID_INVOICE_STATUSES.includes(inv.status));
}

function approvalsFor(ctx: PlanContext, invoiceId: string) {
  return ctx.approvals.filter((a) => a.tool === "send_invoice" && approvalInvoiceId(a) === invoiceId);
}

/**
 * One unpaid phase brought to the rule: due → issued, sent and QR'd (or reissued at the engine amount);
 * not due → no tool call, a "will be invoiced on its visit day" note.
 */
function reconcilePhase(phase: Phase, ctx: PlanContext): PlaybookAction[] {
  if (isPaidPhase(phase)) return [{ kind: "note", phaseId: phase.id, text: lt("explainSkipPaid", { n: phase.n }) }];
  const due = isPhaseDueAt(phase, ctx.today);
  const inv = liveInvoice(phase);
  if (!inv) return due ? [{ kind: "issue", phaseId: phase.id, qr: true }] : [deferredNote(phase)];
  const related = approvalsFor(ctx, inv.invoiceId);
  if (related.some((a) => a.status === "pending") && inv.amountCents === phase.amountCents) {
    return [{ kind: "note", phaseId: phase.id, text: lt("explainAwaiting", { number: inv.invoiceNumber }) }];
  }
  if (inv.amountCents !== phase.amountCents) {
    return due ? [{ kind: "reissue", phaseId: phase.id }] : [{ kind: "withdraw", phaseId: phase.id }, deferredNote(phase, true)];
  }
  // A live invoice on a phase that is not due predates the visit-day rule: it is left as it is.
  if (!due) return [];
  if (inv.status === "DRAFT") {
    // A draft whose send the dentist rejected stays a draft.
    return related.some((a) => a.status === "rejected") ? [] : [{ kind: "send", phaseId: phase.id, qr: true }];
  }
  return inv.hasQr ? [] : [{ kind: "qr", phaseId: phase.id }];
}

/** Pure: what the playbook would do for this trigger on this plan state at the simulated today. */
export function planActions(plan: Plan, payload: TriggerPayload, ctx: PlanContext): PlaybookAction[] {
  const actions: PlaybookAction[] = [];
  const notApproved = (): PlaybookAction[] => [{ kind: "note", text: lt("explainPlanNotApproved") }];

  switch (payload.type) {
    case "PLAN_APPROVED":
    case "MANUAL": {
      if (plan.status !== "approved") return notApproved();
      for (const phase of plan.phases) actions.push(...reconcilePhase(phase, ctx));
      if (!actions.some((a) => a.kind !== "note" || a.deferred)) actions.push({ kind: "note", text: lt("explainNoChanges") });
      return actions;
    }

    case "PLAN_EDITED": {
      if (plan.status !== "approved") return notApproved();
      const diffChanged = new Set(
        (payload.diff?.phases ?? []).filter((d) => d.deltaCents !== 0).map((d) => d.phaseId),
      );
      for (const phase of plan.phases) {
        const inv = liveInvoice(phase);
        const due = isPhaseDueAt(phase, ctx.today);
        const changed = inv ? inv.amountCents !== phase.amountCents : diffChanged.has(phase.id);
        if (isPaidPhase(phase)) {
          if (changed) actions.push({ kind: "note", phaseId: phase.id, text: lt("explainSkipPaid", { n: phase.n }) });
          continue;
        }
        if (inv) {
          // Live invoice at a stale amount: cancel → create v+1 → approval → send → QR (or, before the
          // visit day, cancel only: the new amount is invoiced on the visit day).
          if (changed) {
            actions.push(
              ...(due ? [{ kind: "reissue" as const, phaseId: phase.id }] : [{ kind: "withdraw" as const, phaseId: phase.id }, deferredNote(phase, true)]),
            );
          }
          continue;
        }
        if (due) actions.push({ kind: "issue", phaseId: phase.id, qr: true });
        else if (changed) actions.push(deferredNote(phase, true));
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
      // Only the visit day (→ due) and the end of the grace period (→ overdue) matter; there is no
      // invoice to remind about before the visit.
      if (payload.to !== "due" && payload.to !== "overdue") return [];
      if (plan.status !== "approved") return [];
      const phase = plan.phases.find((p) => p.id === payload.phaseId);
      if (!phase || isPaidPhase(phase)) return [];
      if (!isPhaseDueAt(phase, ctx.today)) return [];
      const inv = phase.payment.invoice;
      if (payload.to === "overdue" && isOpenInvoice(inv) && !ctx.issuedPhaseIds?.has(phase.id)) {
        const remind: PlaybookAction[] = ctx.remindedPhaseIds?.has(phase.id) ? [] : [{ kind: "remind", phaseId: phase.id }];
        return [...remind, ...reconcilePhase(phase, ctx)];
      }
      return reconcilePhase(phase, ctx);
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

/** Phases the run already issued (successful create_invoice / send_invoice). */
export function issuedIn(run: AgentRun): Set<string> {
  return new Set(
    run.executed.filter((e) => (e.tool === "create_invoice" || e.tool === "send_invoice") && e.phaseId).map((e) => e.phaseId!),
  );
}

export async function planFor(run: AgentRun, payload: TriggerPayload): Promise<PlaybookAction[]> {
  const plan = await run.getPlan();
  const approvals = await store.listPendingApprovals(plan.id);
  return planActions(plan, payload, {
    approvals,
    today: await run.simToday(),
    remindedPhaseIds: remindedIn(run),
    issuedPhaseIds: issuedIn(run),
  });
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

    case "withdraw": {
      const { plan, phase } = await phaseNow(run, action.phaseId);
      const old = phase.payment.invoice;
      if (!old || !isOpenInvoice(old)) return;
      const nextNumber = formatInvoiceNumber(plan.id, phase.n, nextInvoiceVersion(phase));
      await run.callTool("cancel_sent_invoice", buildCancelInput(plan, old.invoiceId, nextNumber));
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
