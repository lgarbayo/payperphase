/**
 * Clinic billing agent: event-driven Claude tool loop over the PayPal Agent Toolkit
 * invoice tools (wrapped by a deterministic amount/currency/number/recipient/allowlist guard), with a
 * deterministic playbook fallback calling the same tools. Every step → store + AGENT_STEP event.
 *
 * Invoice on the visit day: a phase is invoiced only when it is due, i.e. its payment status recomputed
 * by the engine at the simulated clock's today (src/engine/payments.ts, never the stored status) is
 * "due" or "overdue". Before the visit no invoice exists, so nothing can be paid in advance on either
 * rail (checkout refuses early orders with canCreateOrder; the guard refuses PHASE_NOT_DUE).
 *
 *   PLAN_APPROVED / MANUAL → per unpaid due phase: create_invoice → send_invoice → generate_invoice_qr_code;
 *                            a phase not due yet: no tool call, a note "invoiced on its visit day, <date>"
 *   PAYMENT_CAPTURED       → record_payment_for_invoice on that phase's open invoice (no invoice: a note)
 *   PLAN_EDITED            → explanation → (live invoice, amount changed) cancel_sent_invoice → create_invoice
 *                            v+1 → approval_required → (Approve) send_invoice with the stored payload →
 *                            generate_invoice_qr_code; no invoice and not due: a note with the new amount;
 *                            no invoice and due: issued
 *   PHASE_STATUS_CHANGED   → (to "due", or to "overdue" without an open invoice) issue that phase (+ QR);
 *                            (to "overdue" with an open sent invoice) send_invoice_reminder
 * Runs for one plan are serialized; every run is idempotent.
 */
import { randomUUID } from "node:crypto";
import type { AgentTrigger, DomainEvent, PendingApproval, Plan } from "@/contracts";
import { explainDiff } from "@/ai/wording";
import { subscribe } from "@/server/events";
import { store } from "@/server/store";
import { payloadMatches } from "./approvals";
import { resolveDeps } from "./deps";
import { checkToolCall } from "./guard";
import { runLlmLoop, type LoopOutcome } from "./loop";
import { resetMockInvoices } from "./mockTools";
import { executeActions, hasWork, planFor, type PlaybookAction } from "./playbook";
import { buildCreateInvoiceInput, buildQrInput, isPhaseSettled, liveInvoice, nextInvoiceVersion, recipientFor } from "./policy";
import { AgentRun, approvalInvoiceId, type TriggerPayload } from "./runtime";
import { lt, money } from "./text";

export type { TriggerPayload } from "./runtime";
export { __setAgentDeps } from "./deps";

interface AgentState {
  started: boolean;
  unsubscribe?: () => void;
  queues: Map<string, Promise<unknown>>;
}
const g = globalThis as unknown as { __pppAgent?: AgentState };
const state = (): AgentState => (g.__pppAgent ??= { started: false, queues: new Map() });

/** Serialize work per plan (events, approvals and guard tests never interleave on one plan). */
function enqueue<T>(planId: string, job: () => Promise<T>): Promise<T> {
  const queues = state().queues;
  const prev = queues.get(planId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(job);
  const tail = next.catch(() => undefined);
  queues.set(planId, tail);
  void tail.then(() => {
    if (queues.get(planId) === tail) queues.delete(planId);
  });
  return next;
}

/** Resolves when every queued agent job has finished (tests, graceful shutdown). */
export async function agentIdle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const pending = [...state().queues.values()];
    if (!pending.length) return;
    await Promise.allSettled(pending);
  }
}

function newRunId(): string {
  return `run_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Triggers whose run is skipped entirely (no feed noise) when there is nothing to do. */
const QUIET = new Set<TriggerPayload["type"]>(["PLAN_APPROVED", "PAYMENT_CAPTURED", "PHASE_STATUS_CHANGED"]);

/** "Invoiced on its visit day" notes (the phases that are not due yet). */
const deferredNotes = (actions: readonly PlaybookAction[]) => actions.filter((a) => a.kind === "note" && a.deferred);

/**
 * Skip the run when it has nothing to do. Exception: the first run of an approved plan (PLAN_APPROVED
 * on a plan without agent steps) still shows when no phase is due yet, so the clinic sees each phase's
 * "invoiced on its visit day" note.
 */
async function isQuiet(planId: string, payload: TriggerPayload, actions: readonly PlaybookAction[]): Promise<boolean> {
  if (hasWork(actions) || !QUIET.has(payload.type)) return false;
  if (payload.type !== "PLAN_APPROVED" || deferredNotes(actions).length === 0) return true;
  return (await store.listAgentSteps(planId)).length > 0;
}

/** Short, camera-safe labels for the feed when the Claude call fails. */
const LLM_ERROR_LABELS: Record<string, string> = {
  "400": "bad request",
  "401": "auth",
  "403": "forbidden",
  "404": "not found",
  "408": "timeout",
  "413": "too large",
  "429": "rate limited",
  "500": "server error",
  "502": "bad gateway",
  "503": "unavailable",
  "504": "timeout",
  "529": "overloaded",
};

function fallbackReason(o: Exclude<LoopOutcome, { kind: "done" }>): string {
  if (o.kind === "refusal") return o.category ? `refusal: ${o.category}` : "refusal";
  if (o.kind === "aborted") return `> ${o.iterations} iterations`;
  // The feed is on camera: keep raw API payloads out of it and log them instead.
  console.warn("[agent] LLM run failed, using the deterministic playbook:", o.message);
  const status = /\b([45]\d{2})\b/.exec(o.message)?.[1];
  if (status) return `HTTP ${status}${LLM_ERROR_LABELS[status] ? ` ${LLM_ERROR_LABELS[status]}` : ""}`;
  return /timeout|timed out/i.test(o.message) ? "timeout" : "error";
}

async function explainEdit(run: AgentRun, payload: Extract<TriggerPayload, { type: "PLAN_EDITED" }>, plan: Plan) {
  const changed = plan.phases.filter((p) => {
    const inv = liveInvoice(p);
    return inv && inv.amountCents !== p.amountCents;
  });
  if (payload.diff) {
    try {
      const ex = await explainDiff(payload.diff, plan);
      await run.explain(ex.rendered, { output: { source: ex.source, totalDeltaCents: payload.diff.totalDeltaCents } });
      return;
    } catch (err) {
      console.warn("[agent] explainDiff failed:", err instanceof Error ? err.message : err);
    }
  }
  for (const p of changed) {
    await run.explain(
      lt("explainDiffFallback", (l) => ({
        n: p.n,
        before: money(liveInvoice(p)!.amountCents, l),
        after: money(p.amountCents, l),
      })),
      { phaseId: p.id },
    );
  }
}

/** One full agent run for a trigger. Never throws for agent/tool failures: they become steps. */
export async function executeRun(
  planIdOrAlias: string,
  trigger: AgentTrigger,
  payload: TriggerPayload,
  opts: { runId?: string } = {},
): Promise<{ runId: string; skipped?: boolean }> {
  const planId = await store.resolvePlanId(planIdOrAlias);
  const runId = opts.runId ?? newRunId();
  if (!planId) throw new Error(`Plan not found: ${planIdOrAlias}`);
  const deps = resolveDeps();
  const tools = await deps.createTools(planId);
  const run = new AgentRun({ planId, trigger, mode: deps.mode, tools, payload, runId });

  const actions = await planFor(run, payload);
  if (await isQuiet(planId, payload, actions)) return { runId, skipped: true };

  await run.start();
  try {
    if (payload.type === "PLAN_EDITED") await explainEdit(run, payload, await run.getPlan());

    if (!hasWork(actions)) {
      await executeActions(run, actions);
    } else if (run.mode === "llm" && deps.llm) {
      const outcome = await runLlmLoop(run, payload, { llm: deps.llm, model: deps.model });
      if (outcome.kind !== "done") {
        await run.explain(lt("explainLlmFallback", { reason: fallbackReason(outcome) }), {
          ok: false,
          output: { outcome: outcome.kind },
        });
        run.mode = "playbook";
        await executeActions(run, await planFor(run, payload));
      } else {
        const after = await planFor(run, payload);
        const rest = after.filter((a) => a.kind !== "note");
        if (rest.length) {
          run.mode = "playbook";
          await run.explain(lt("explainCompletion"));
          await executeActions(run, rest);
        }
        // The phases that are not due yet get their "invoiced on its visit day" note on this path too.
        await executeActions(run, deferredNotes(after));
      }
    } else {
      run.mode = "playbook";
      await executeActions(run, actions);
    }
  } catch (err) {
    await run.fail(err instanceof Error ? err.message : String(err));
  }
  await run.finish();
  return { runId };
}

function payloadFor(trigger: AgentTrigger): TriggerPayload {
  // Event-specific triggers without their event data reconcile like a manual run.
  if (trigger === "PLAN_APPROVED" || trigger === "PLAN_EDITED") return { type: trigger };
  return { type: "MANUAL" };
}

/** Queue a run and return its id immediately; `done` settles when it has finished. */
export function startRun(
  planId: string,
  trigger: AgentTrigger,
  payload: TriggerPayload = payloadFor(trigger),
): { runId: string; done: Promise<{ runId: string; skipped?: boolean }> } {
  const runId = newRunId();
  const done = (async () => {
    const real = (await store.resolvePlanId(planId)) ?? planId;
    return enqueue(real, () => executeRun(real, trigger, payload, { runId }));
  })();
  return { runId, done };
}

export async function runAgent(planId: string, trigger: AgentTrigger, payload?: TriggerPayload): Promise<{ runId: string }> {
  const { done } = startRun(planId, trigger, payload);
  const res = await done;
  return { runId: res.runId };
}

function onEvent(e: DomainEvent): void {
  let job: { planId: string; trigger: AgentTrigger; payload: TriggerPayload } | null = null;
  switch (e.type) {
    case "PLAN_APPROVED":
      job = { planId: e.planId, trigger: "PLAN_APPROVED", payload: { type: "PLAN_APPROVED" } };
      break;
    case "PLAN_EDITED":
      job = { planId: e.planId, trigger: "PLAN_EDITED", payload: { type: "PLAN_EDITED", diff: e.diff } };
      break;
    case "PAYMENT_CAPTURED":
      job = {
        planId: e.planId,
        trigger: "PAYMENT_CAPTURED",
        payload: {
          type: "PAYMENT_CAPTURED",
          phaseId: e.phaseId,
          amountCents: e.amountCents,
          captureId: e.captureId,
          orderId: e.orderId,
        },
      };
      break;
    case "PHASE_STATUS_CHANGED":
      // Visit day reached (→ due: issue it) or grace period over (→ overdue: issue or remind).
      if (e.to === "due" || e.to === "overdue") {
        job = {
          planId: e.planId,
          trigger: "PHASE_STATUS_CHANGED",
          payload: { type: "PHASE_STATUS_CHANGED", phaseId: e.phaseId, to: e.to },
        };
      }
      break;
    case "DEMO_RESET":
      resetMockInvoices();
      break;
    default:
      break;
  }
  if (!job) return;
  const { planId, trigger, payload } = job;
  void enqueue(planId, () => executeRun(planId, trigger, payload)).catch((err) =>
    console.error(`[agent] ${trigger} run failed for ${planId}:`, err instanceof Error ? err.message : err),
  );
}

/** Subscribe to domain events (idempotent, survives dev HMR). Called from /instrumentation.ts. */
export function startAgent(): void {
  const s = state();
  if (s.started) return;
  s.started = true;
  s.unsubscribe = subscribe(onEvent);
}

/** Tests: unsubscribe and forget queued work. */
export function stopAgent(): void {
  const s = state();
  s.unsubscribe?.();
  s.unsubscribe = undefined;
  s.started = false;
  s.queues.clear();
}

/** Human decision on a held send_invoice. Approve executes EXACTLY the stored payload (sha256 re-checked). */
export async function decideApproval(
  approvalId: string,
  decidedBy: string,
  decision: "approve" | "reject",
): Promise<PendingApproval | null> {
  const first = await store.getPendingApproval(approvalId);
  if (!first) return null;
  return enqueue(first.planId, async () => {
    const cur = await store.getPendingApproval(approvalId);
    if (!cur) return null;
    if (cur.status !== "pending") return cur;

    const now = new Date().toISOString();
    const runSteps = (await store.listAgentSteps(cur.planId)).filter((s) => s.runId === cur.runId);
    const startSeq = runSteps.reduce((m, s) => Math.max(m, s.seq + 1), 0);
    const last = runSteps[runSteps.length - 1];
    const deps = resolveDeps();
    const tools = await deps.createTools(cur.planId);
    const run = new AgentRun({
      planId: cur.planId,
      trigger: runSteps[0]?.trigger ?? "PLAN_EDITED",
      mode: last?.mode ?? deps.mode,
      tools,
      runId: cur.runId,
      startSeq,
    });
    const invoiceId = approvalInvoiceId(cur);
    const plan = await run.getPlan();
    const number =
      plan.phases.find((p) => p.payment.invoice?.invoiceId === invoiceId)?.payment.invoice?.invoiceNumber ?? invoiceId ?? "";

    if (decision === "reject") {
      const rejected: PendingApproval = { ...cur, status: "rejected", decidedAt: now, decidedBy };
      await store.savePendingApproval(rejected);
      await run.explain(lt("explainRejected", { by: decidedBy, number }), {
        phaseId: cur.phaseId,
        approvalId: cur.id,
        ok: false,
      });
      return rejected;
    }

    // Re-check the stored payload against the digest taken when approval was requested.
    if (!payloadMatches(cur.payload, cur.payloadSha256)) {
      const failed: PendingApproval = { ...cur, status: "failed", decidedAt: now, decidedBy };
      await store.savePendingApproval(failed);
      await run.emit({
        kind: "guard_rejected",
        tool: "send_invoice",
        phaseId: cur.phaseId,
        approvalId: cur.id,
        input: cur.payload,
        output: { code: "APPROVAL_HASH_MISMATCH", expectedSha256: cur.payloadSha256 },
        ok: false,
        text: lt("approvalHashMismatch"),
      });
      return failed;
    }

    const approved: PendingApproval = { ...cur, status: "approved", decidedAt: now, decidedBy };
    await store.savePendingApproval(approved);
    await run.emit({
      kind: "approval_granted",
      tool: "send_invoice",
      phaseId: cur.phaseId,
      approvalId: cur.id,
      ok: true,
      text: lt("approvalGranted", { by: decidedBy }),
      output: { payloadSha256: cur.payloadSha256 },
    });

    const sent = await run.callTool("send_invoice", cur.payload, { approval: approved });
    let final: PendingApproval;
    if (sent.kind === "ok") {
      if (invoiceId) await run.callTool("generate_invoice_qr_code", buildQrInput(invoiceId));
      final = { ...approved, status: "executed" };
    } else {
      final = { ...approved, status: "failed" };
    }
    await store.savePendingApproval(final);
    return final;
  });
}

/** The amount the phase was invoiced at before the last edit (from the audit trail), if any. */
async function staleAmountFor(plan: Plan): Promise<{ phaseId: string; cents: number } | null> {
  const steps = await store.listAgentSteps(plan.id);
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!;
    if (s.kind !== "tool_call" || s.tool !== "create_invoice" || !s.phaseId) continue;
    const phase = plan.phases.find((p) => p.id === s.phaseId);
    const items = (s.input as { items?: Array<{ unit_amount?: { value?: string } }> } | undefined)?.items;
    const value = Number(items?.[0]?.unit_amount?.value);
    const cents = Number.isFinite(value) ? Math.round(value * 100) : NaN;
    if (phase && !isPhaseSettled(phase) && Number.isInteger(cents) && cents !== phase.amountCents) {
      return { phaseId: phase.id, cents };
    }
  }
  for (const phase of plan.phases) {
    const base = plan.baseline?.phases.find((b) => b.phaseId === phase.id);
    if (base && !isPhaseSettled(phase) && base.amountCents !== phase.amountCents) {
      return { phaseId: phase.id, cents: base.amountCents };
    }
  }
  return null;
}

/**
 * Director key G: push one create_invoice with a stale (pre-edit) amount through the guard, labelled
 * "guard test". It is only ever checked, never sent to PayPal.
 */
export async function runGuardTest(
  planIdOrAlias: string,
): Promise<{ runId: string; rejected: boolean; code?: string; reason?: { es: string; en: string } } | null> {
  const planId = await store.resolvePlanId(planIdOrAlias);
  if (!planId) return null;
  return enqueue(planId, async () => {
    const deps = resolveDeps();
    const tools = await deps.createTools(planId);
    const run = new AgentRun({ planId, trigger: "MANUAL", mode: deps.mode, tools, payload: { type: "MANUAL" } });
    const plan = await run.getPlan();
    const stale = await staleAmountFor(plan);
    const phase =
      plan.phases.find((p) => p.id === stale?.phaseId) ?? plan.phases.find((p) => !isPhaseSettled(p)) ?? plan.phases[0]!;
    const cents = stale?.cents ?? Math.max(0, phase.amountCents - 100);
    const input = buildCreateInvoiceInput(plan, phase, nextInvoiceVersion(phase), await run.simToday(), { amountCents: cents });

    await run.emit({
      kind: "run_started",
      text: lt("guardTestRun"),
      output: { label: "guard test", guardTest: true, phaseId: phase.id },
    });
    const verdict = checkToolCall("create_invoice", input, { plan, recipientEmail: recipientFor(plan), today: await run.simToday() });
    if (!verdict.ok) {
      await run.emit({
        kind: "guard_rejected",
        tool: "create_invoice",
        phaseId: verdict.phaseId ?? phase.id,
        input,
        output: { code: verdict.code, reason: verdict.reason, guardTest: true, ...(verdict.details ? { details: verdict.details } : {}) },
        ok: false,
        text: verdict.reason,
      });
    } else {
      await run.emit({ kind: "error", ok: false, phaseId: phase.id, input, text: lt("guardTestUnexpected"), output: { guardTest: true } });
    }
    await run.emit({ kind: "run_finished", ok: !verdict.ok, text: lt("runFinished"), output: { guardTest: true } });
    return verdict.ok
      ? { runId: run.runId, rejected: false }
      : { runId: run.runId, rejected: true, code: verdict.code, reason: verdict.reason };
  });
}
