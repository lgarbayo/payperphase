/**
 * Invoice on the visit day, end to end in mock mode: the agent subscribed to the real event bus, the
 * Director beats, the real engine edit and the simulated clock. No invoice exists before a phase's
 * visit day; B5 (implant day) issues phase 2 and the bone-graft edit reissues it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HERO_PLAN_ALIAS, type AgentStep, type DomainEvent } from "@/contracts";
import { GOLDEN_BONE_GRAFT_EDIT, GOLDEN_DENTIST } from "@/contracts/fixtures/implantCase";
import { agentIdle, decideApproval, startAgent, stopAgent } from "@/agent";
import { getMockInvoice } from "@/agent/mockTools";
import { subscribe } from "@/server/events";
import { editPlan } from "@/server/plans";
import { store } from "@/server/store";
import { resetWorld, usePlaybookDeps } from "./helpers";

const hero = async () => (await store.getPlan(HERO_PLAN_ALIAS))!;
const heroSteps = async () => store.listAgentSteps(HERO_PLAN_ALIAS);
const label = (s: AgentStep) => (s.kind === "tool_call" ? `call:${s.tool}` : `${s.kind}${s.tool ? `:${s.tool}` : ""}`);
const actionTrace = (steps: AgentStep[]) =>
  steps.filter((s) => ["tool_call", "approval_required", "approval_granted", "guard_rejected"].includes(s.kind)).map(label);

beforeEach(async () => {
  await resetWorld();
  usePlaybookDeps();
  startAgent();
});

afterEach(() => {
  stopAgent();
});

describe("beat B5: implant day", () => {
  it("issues and sends phase 2's invoice (+QR) on its visit day; phases 3–4 get a note, no invoice", async () => {
    await store.applyBeat("B5_AGENT_READY");
    await agentIdle();
    const plan = await hero();
    expect((await store.getClock()).today).toBe(plan.phases[1]!.payment.dueDate);
    expect(plan.phases.map((p) => p.payment.status)).toEqual(["paid", "due", "scheduled", "scheduled"]);
    expect(plan.phases[1]!.payment.invoice).toMatchObject({ version: 1, status: "SENT", hasQr: true, amountCents: 150_000 });
    expect(plan.phases[0]!.payment.invoice).toBeUndefined();
    expect(plan.phases[2]!.payment.invoice).toBeUndefined();
    expect(plan.phases[3]!.payment.invoice).toBeUndefined();

    const steps = await heroSteps();
    expect(actionTrace(steps)).toEqual(["call:create_invoice", "call:send_invoice", "call:generate_invoice_qr_code"]);
    const notes = steps.filter((s) => s.kind === "explanation" && s.phaseId).map((s) => s.text?.en);
    expect(notes).toEqual([
      "Phase 1 already paid: not invoiced",
      expect.stringMatching(/^Phase 3 will be invoiced on its visit day, /),
      expect.stringMatching(/^Phase 4 will be invoiced on its visit day, /),
    ]);
  });

  it("the bone-graft edit on phase 2 cancels and reissues it: cancel → create → approval; Approve sends it and makes the QR", async () => {
    await store.applyBeat("B5_AGENT_READY");
    await agentIdle();
    const v1 = (await hero()).phases[1]!.payment.invoice!;
    const mark = (await heroSteps()).length;

    const res = await editPlan(HERO_PLAN_ALIAS, { edit: GOLDEN_BONE_GRAFT_EDIT, editedBy: GOLDEN_DENTIST });
    expect(res.plan.phases[1]!.amountCents).toBe(195_000);
    await agentIdle();

    const run = (await heroSteps()).slice(mark);
    expect(actionTrace(run)).toEqual(["call:cancel_sent_invoice", "call:create_invoice", "approval_required:send_invoice"]);
    const create = run.find((s) => s.kind === "tool_call" && s.tool === "create_invoice")!;
    expect((create.input as { items: Array<{ unit_amount: { value: string } }> }).items[0]!.unit_amount.value).toBe("1950.00");
    expect(getMockInvoice(v1.invoiceId)?.status).toBe("CANCELLED");
    // Phases 3–4 moved (+28 days) but are still not due: no invoice, no tool call.
    expect(run.filter((s) => s.kind === "tool_call").every((s) => s.phaseId === "ph2")).toBe(true);

    const [approval] = (await store.listPendingApprovals(HERO_PLAN_ALIAS)).filter((a) => a.status === "pending");
    expect(approval).toMatchObject({ tool: "send_invoice", phaseId: "ph2" });
    const markApprove = (await heroSteps()).length;
    expect(await decideApproval(approval!.id, GOLDEN_DENTIST, "approve")).toMatchObject({ status: "executed" });
    expect(actionTrace((await heroSteps()).slice(markApprove))).toEqual([
      "approval_granted:send_invoice",
      "call:send_invoice",
      "call:generate_invoice_qr_code",
    ]);
    expect((await hero()).phases[1]!.payment.invoice).toMatchObject({ version: 2, status: "SENT", hasQr: true, amountCents: 195_000 });
  });

  it("other beats keep their behaviour: B2 invoices phase 1 only, B3 invoices nothing", async () => {
    await store.applyBeat("B2_PLAN_SENT");
    await agentIdle();
    let plan = await hero();
    expect(plan.phases.map((p) => p.payment.invoice?.status ?? null)).toEqual(["SENT", null, null, null]);
    expect(plan.phases[0]!.payment.invoice?.hasQr).toBe(true);

    await store.applyBeat("B3_PHASE1_PAID");
    await agentIdle();
    plan = await hero();
    expect(plan.phases.every((p) => !p.payment.invoice)).toBe(true);
    expect(actionTrace(await heroSteps())).toEqual([]);
  });
});

describe("the simulated clock drives the invoices", () => {
  it("advancing several days at once publishes the status changes; the agent issues each phase on its visit day", async () => {
    await store.applyBeat("B3_PHASE1_PAID");
    await agentIdle();
    const seen: Array<Extract<DomainEvent, { type: "PHASE_STATUS_CHANGED" }>> = [];
    const off = subscribe((e) => {
      if (e.type === "PHASE_STATUS_CHANGED") seen.push(e);
    });
    try {
      const plan = await hero();
      // Jump straight from the start date to phase 2's visit day (scheduled → due in one move).
      await store.setClock(plan.phases[1]!.payment.dueDate);
      await agentIdle();
      expect(seen).toContainEqual(expect.objectContaining({ planId: plan.id, phaseId: "ph2", from: "scheduled", to: "due" }));
      expect((await hero()).phases.map((p) => p.payment.invoice?.status ?? null)).toEqual([null, "SENT", null, null]);
      expect((await hero()).phases[1]!.payment.invoice?.hasQr).toBe(true);

      // 10 days later phase 2 is overdue with an open invoice → one reminder, no new invoice.
      await store.advanceClock(10);
      await agentIdle();
      expect(seen).toContainEqual(expect.objectContaining({ phaseId: "ph2", from: "due", to: "overdue" }));
      const reminders = (await heroSteps()).filter((s) => s.kind === "tool_call" && s.tool === "send_invoice_reminder");
      expect(reminders.map((s) => s.phaseId)).toEqual(["ph2"]);
      expect(getMockInvoice((await hero()).phases[1]!.payment.invoice!.invoiceId)?.reminders).toBe(1);

      // A long jump past phases 3 and 4: each goes straight to overdue without an invoice → issued.
      await store.advanceClock(200);
      await agentIdle();
      const after = await hero();
      expect(after.phases.map((p) => p.payment.status)).toEqual(["paid", "overdue", "overdue", "overdue"]);
      expect(after.phases.map((p) => p.payment.invoice?.status ?? null)).toEqual([null, "SENT", "SENT", "SENT"]);
      const created = (await heroSteps()).filter((s) => s.kind === "tool_call" && s.tool === "create_invoice");
      expect(created.map((s) => s.phaseId)).toEqual(["ph2", "ph3", "ph4"]);
      expect((await heroSteps()).some((s) => s.kind === "guard_rejected")).toBe(false);
    } finally {
      off();
    }
  });
});
