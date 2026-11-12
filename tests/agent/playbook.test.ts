/** WP-10 playbook (mock PayPal tools): the deterministic sequences behind every trigger. */
import { beforeEach, describe, expect, it } from "vitest";
import { GOLDEN_BONE_GRAFT_DIFF } from "@/contracts/fixtures/implantCase";
import type { DomainEvent } from "@/contracts";
import { decideApproval, executeRun } from "@/agent";
import { payloadSha256 } from "@/agent/approvals";
import { getMockInvoice } from "@/agent/mockTools";
import { applyPaymentEvent } from "@/lib/paypal/apply";
import { subscribe } from "@/server/events";
import { store } from "@/server/store";
import {
  applyEditedGolden,
  atPhase2VisitDay,
  invoiceOf,
  PH2_VISIT_DAY,
  PLAN_ID,
  resetWorld,
  steps,
  trace,
  usePlaybookDeps,
} from "./helpers";

const issue = () => executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
const edit = () => executeRun(PLAN_ID, "PLAN_EDITED", { type: "PLAN_EDITED", diff: GOLDEN_BONE_GRAFT_DIFF });

beforeEach(async () => {
  await resetWorld();
  usePlaybookDeps();
});

const toolCalls = async (tool?: string) =>
  (await steps()).filter((s) => s.kind === "tool_call" && (!tool || s.tool === tool));

describe("PLAN_APPROVED", () => {
  it("issues only the due phase (number, EUR, engine cents, recipient, sent, QR); later phases get a visit-day note", async () => {
    await issue();
    const plan = (await store.getPlan(PLAN_ID))!;
    const inv = invoiceOf(plan, "ph1"); // due on the start date
    expect(inv).toMatchObject({ invoiceNumber: "PPP-RIBE-F1-v1", amountCents: 36_000, status: "SENT", hasQr: true });
    expect(inv.recipientEmail).toBe(plan.patient.email);
    expect(inv.invoiceId).toMatch(/^INV2-MOCK-/);
    // Phases 2–4 are not due: no invoice exists before the visit, so nothing can be paid in advance.
    for (const id of ["ph2", "ph3", "ph4"]) expect(plan.phases.find((p) => p.id === id)!.payment.invoice).toBeUndefined();

    const created = await toolCalls("create_invoice");
    expect(created.map((s) => s.phaseId)).toEqual(["ph1"]);
    expect((created[0]!.input as { items: Array<{ unit_amount: { currency_code: string; value: string } }> }).items).toEqual([
      expect.objectContaining({ quantity: "1", unit_amount: { currency_code: "EUR", value: "360.00" }, item_date: "2026-11-16" }),
    ]);
    expect(created[0]!.input).not.toHaveProperty("invoice_date"); // note_only: issued today = the visit day
    expect((await toolCalls()).every((s) => s.phaseId === "ph1")).toBe(true);
    const notes = (await steps()).filter((s) => s.kind === "explanation" && s.phaseId);
    expect(notes.map((s) => s.phaseId)).toEqual(["ph2", "ph3", "ph4"]);
    expect(notes[0]!.text).toEqual({
      es: "La fase 2 se facturará el día de su visita, 12 ene 2027",
      en: "Phase 2 will be invoiced on its visit day, 12 Jan 2027",
    });
    expect((await steps()).every((s) => s.mode === "playbook" && s.mock)).toBe(true);
  });

  it("on a later day issues every phase whose visit day has come (due or overdue), and only those", async () => {
    await store.setClock("2027-04-07"); // ph3's visit day: ph1 + ph2 overdue, ph3 due, ph4 not yet
    await issue();
    const plan = (await store.getPlan(PLAN_ID))!;
    expect((await toolCalls("create_invoice")).map((s) => s.phaseId)).toEqual(["ph1", "ph2", "ph3"]);
    for (const id of ["ph1", "ph2", "ph3"]) expect(invoiceOf(plan, id)).toMatchObject({ status: "SENT", hasQr: true });
    expect(plan.phases[3]!.payment.invoice).toBeUndefined();
  });

  it("is idempotent: a second run (and a manual run) never duplicates an invoice", async () => {
    await issue();
    const before = (await steps()).length;
    const again = await issue();
    expect(again.skipped).toBe(true);
    expect((await steps()).length).toBe(before);
    await executeRun(PLAN_ID, "MANUAL", { type: "MANUAL" });
    expect(await toolCalls("create_invoice")).toHaveLength(1);
  });

  it("with no phase due yet, the first run makes no tool call and shows the visit-day notes", async () => {
    await store.updatePlan(PLAN_ID, (p) => {
      p.phases[0]!.payment.status = "paid";
      return p;
    });
    const res = await issue();
    expect(res.skipped).toBeUndefined();
    expect(await toolCalls()).toEqual([]);
    const texts = (await steps()).filter((s) => s.kind === "explanation").map((s) => s.text?.en);
    expect(texts).toEqual([
      "Phase 1 already paid: not invoiced",
      "Phase 2 will be invoiced on its visit day, 12 Jan 2027",
      "Phase 3 will be invoiced on its visit day, 7 Apr 2027",
      "Phase 4 will be invoiced on its visit day, 22 Apr 2027",
    ]);
    // A repeat of the same trigger is quiet.
    expect((await issue()).skipped).toBe(true);
  });

  it("skips phases that are already paid and issues the due one (beat B5 state)", async () => {
    await atPhase2VisitDay();
    await issue();
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(plan.phases[0]!.payment.invoice).toBeUndefined();
    expect(invoiceOf(plan, "ph2")).toMatchObject({ invoiceNumber: "PPP-RIBE-F2-v1", status: "SENT", hasQr: true, amountCents: 150_000 });
    expect(await trace()).toEqual(["call:create_invoice", "call:send_invoice", "call:generate_invoice_qr_code"]);
    expect((await toolCalls()).every((s) => s.phaseId === "ph2")).toBe(true);
  });

  it("bumps v{k} when PayPal already holds the number (duplicate)", async () => {
    const { reserveMockInvoiceNumber } = await import("@/agent/mockTools");
    reserveMockInvoiceNumber("PPP-RIBE-F1-v1");
    await issue();
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph1").invoiceNumber).toBe("PPP-RIBE-F1-v2");
    expect(invoiceOf(plan, "ph1").version).toBe(2);
  });
});

describe("PLAN_EDITED with GOLDEN_BONE_GRAFT_DIFF", () => {
  it("emits explanation → cancel → create (195 000) → approval_required, in exactly that order", async () => {
    await atPhase2VisitDay();
    await issue();
    const mark = (await steps()).length;
    await applyEditedGolden();
    await edit();

    const run = (await steps()).slice(mark);
    const kinds = run
      .filter((s) => ["explanation", "tool_call", "approval_required", "run_started", "run_finished"].includes(s.kind))
      .map((s) => (s.kind === "tool_call" ? `call:${s.tool}` : s.kind));
    expect(kinds).toEqual(["run_started", "explanation", "call:cancel_sent_invoice", "call:create_invoice", "approval_required", "run_finished"]);

    const create = run.find((s) => s.kind === "tool_call" && s.tool === "create_invoice")!;
    const input = create.input as { invoice_number: string; items: Array<{ unit_amount: { value: string } }> };
    expect(input.invoice_number).toBe("PPP-RIBE-F2-v2");
    expect(input.items[0]!.unit_amount.value).toBe("1950.00");

    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph2")).toMatchObject({ invoiceNumber: "PPP-RIBE-F2-v2", status: "DRAFT", amountCents: 195_000, version: 2 });
    // The old invoice is cancelled at PayPal, the new one is NOT sent yet.
    const old = [...(await steps())].find((s) => s.kind === "tool_result" && s.tool === "cancel_sent_invoice");
    expect(old?.ok).toBe(true);
    expect(getMockInvoice(invoiceOf(plan, "ph2").invoiceId)?.status).toBe("DRAFT");
    // Phases that are not due still have no invoice (they are invoiced on their visit day).
    expect(plan.phases.find((p) => p.id === "ph3")!.payment.invoice).toBeUndefined();

    const [approval] = await store.listPendingApprovals(PLAN_ID);
    expect(approval).toMatchObject({ status: "pending", tool: "send_invoice", phaseId: "ph2" });
    expect(approval!.payloadSha256).toBe(payloadSha256(approval!.payload));
    expect(run.find((s) => s.kind === "approval_required")?.approvalId).toBe(approval!.id);
  });

  it("Approve → send_invoice with exactly the stored payload → generate_invoice_qr_code", async () => {
    await atPhase2VisitDay();
    await issue();
    await applyEditedGolden();
    await edit();
    const [approval] = await store.listPendingApprovals(PLAN_ID);
    const mark = (await steps()).length;

    const done = await decideApproval(approval!.id, "Dra. Lucía Ruiz", "approve");
    expect(done).toMatchObject({ status: "executed", decidedBy: "Dra. Lucía Ruiz" });

    const after = (await steps()).slice(mark);
    expect(after.filter((s) => ["approval_granted", "tool_call"].includes(s.kind)).map((s) => (s.kind === "tool_call" ? `call:${s.tool}` : s.kind))).toEqual([
      "approval_granted",
      "call:send_invoice",
      "call:generate_invoice_qr_code",
    ]);
    const send = after.find((s) => s.kind === "tool_call" && s.tool === "send_invoice")!;
    expect(send.input).toEqual(approval!.payload);
    expect(payloadSha256(send.input)).toBe(approval!.payloadSha256);

    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph2")).toMatchObject({ status: "SENT", hasQr: true, amountCents: 195_000 });
    // Deciding again is a no-op.
    expect((await decideApproval(approval!.id, "x", "approve"))?.status).toBe("executed");
    expect((await steps()).length).toBe(mark + after.length);
  });

  it("refuses a payload whose hash changed after the request (nothing is sent)", async () => {
    await atPhase2VisitDay();
    await issue();
    await applyEditedGolden();
    await edit();
    const [approval] = await store.listPendingApprovals(PLAN_ID);
    const tampered = { ...approval!, payload: { ...(approval!.payload as object), note: "tampered" } };
    await store.savePendingApproval(tampered);

    const result = await decideApproval(approval!.id, "Dra. Lucía Ruiz", "approve");
    expect(result?.status).toBe("failed");
    const last = (await steps()).at(-1)!;
    expect(last).toMatchObject({ kind: "guard_rejected", tool: "send_invoice", ok: false });
    expect(last.output).toMatchObject({ code: "APPROVAL_HASH_MISMATCH" });
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph2").status).toBe("DRAFT");
    expect(getMockInvoice(invoiceOf(plan, "ph2").invoiceId)?.status).toBe("DRAFT");
  });

  it("Reject keeps the draft unsent and a later reconcile does not send it", async () => {
    await atPhase2VisitDay();
    await issue();
    await applyEditedGolden();
    await edit();
    const [approval] = await store.listPendingApprovals(PLAN_ID);
    expect((await decideApproval(approval!.id, "Dra. Lucía Ruiz", "reject"))?.status).toBe("rejected");
    await executeRun(PLAN_ID, "MANUAL", { type: "MANUAL" });
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph2").status).toBe("DRAFT");
    expect(await decideApproval("apr_unknown", "x", "approve")).toBeNull();
  });
});

describe("PAYMENT_CAPTURED and PHASE_STATUS_CHANGED", () => {
  it("records the checkout payment on that phase's open invoice (PAYPAL, captured cents, sim today)", async () => {
    await issue();
    // The checkout capture settles the phase first; PAYMENT_CAPTURED is published after that.
    await applyPaymentEvent({
      planId: PLAN_ID,
      phaseId: "ph1",
      event: { type: "CAPTURE_COMPLETED", orderId: "ORD7K2", captureId: "CAP7K2", amountCents: 36_000, paidAt: "2026-11-16T10:00:00.000Z" },
      via: "capture",
    });
    await executeRun(PLAN_ID, "PAYMENT_CAPTURED", { type: "PAYMENT_CAPTURED", phaseId: "ph1", amountCents: 36_000, captureId: "CAP7K2" });
    const rec = (await steps()).find((s) => s.kind === "tool_call" && s.tool === "record_payment_for_invoice")!;
    expect(rec.input).toMatchObject({
      method: "PAYPAL",
      payment_id: "CAP7K2",
      payment_date: (await store.getClock()).today,
      amount: { currency_code: "EUR", value: "360.00" },
    });
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph1").status).toBe("MARKED_AS_PAID");
    // One live instrument: a second capture event does nothing more.
    const n = (await steps()).length;
    await executeRun(PLAN_ID, "PAYMENT_CAPTURED", { type: "PAYMENT_CAPTURED", phaseId: "ph1", amountCents: 36_000, captureId: "CAP7K2" });
    expect((await steps()).length).toBe(n);
  });

  it("does nothing for a capture without an open invoice", async () => {
    const res = await executeRun(PLAN_ID, "PAYMENT_CAPTURED", { type: "PAYMENT_CAPTURED", phaseId: "ph1", amountCents: 36_000 });
    expect(res.skipped).toBe(true);
  });

  it("issues a phase's invoice (+QR) when it becomes due on its visit day", async () => {
    await issue();
    await atPhase2VisitDay();
    const res = await executeRun(PLAN_ID, "PHASE_STATUS_CHANGED", { type: "PHASE_STATUS_CHANGED", phaseId: "ph2", to: "due" });
    expect(res.skipped).toBeUndefined();
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph2")).toMatchObject({ invoiceNumber: "PPP-RIBE-F2-v1", status: "SENT", hasQr: true, amountCents: 150_000 });
    const calls = (await toolCalls()).filter((s) => s.phaseId === "ph2").map((s) => s.tool);
    expect(calls).toEqual(["create_invoice", "send_invoice", "generate_invoice_qr_code"]);
    expect(plan.phases[2]!.payment.invoice).toBeUndefined(); // only that phase
  });

  it("an overdue phase with an open sent invoice gets one reminder", async () => {
    await atPhase2VisitDay();
    await issue();
    await store.setClock("2027-01-20"); // 8 days after the visit: overdue
    await executeRun(PLAN_ID, "PHASE_STATUS_CHANGED", { type: "PHASE_STATUS_CHANGED", phaseId: "ph2", to: "overdue" });
    const calls = await toolCalls("send_invoice_reminder");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.phaseId).toBe("ph2");
    const inv = invoiceOf((await store.getPlan(PLAN_ID))!, "ph2");
    expect(calls[0]!.input).toMatchObject({ invoice_id: inv.invoiceId });
    expect(getMockInvoice(inv.invoiceId)?.reminders).toBe(1);
    expect(await toolCalls("create_invoice")).toHaveLength(1); // no second invoice
  });

  it("a phase that jumps straight to overdue without an invoice is issued (no reminder)", async () => {
    await atPhase2VisitDay();
    await store.setClock("2027-02-01");
    await executeRun(PLAN_ID, "PHASE_STATUS_CHANGED", { type: "PHASE_STATUS_CHANGED", phaseId: "ph2", to: "overdue" });
    expect((await toolCalls()).map((s) => s.tool)).toEqual(["create_invoice", "send_invoice", "generate_invoice_qr_code"]);
    expect(invoiceOf((await store.getPlan(PLAN_ID))!, "ph2").status).toBe("SENT");
  });

  it("upcoming / scheduled transitions do nothing: there is no invoice before the visit", async () => {
    await issue();
    for (const to of ["upcoming", "scheduled"]) {
      const idle = await executeRun(PLAN_ID, "PHASE_STATUS_CHANGED", { type: "PHASE_STATUS_CHANGED", phaseId: "ph2", to });
      expect(idle.skipped).toBe(true);
    }
    // A stale "due" event for a phase whose visit day has not come (clock moved back) does nothing either.
    const stale = await executeRun(PLAN_ID, "PHASE_STATUS_CHANGED", { type: "PHASE_STATUS_CHANGED", phaseId: "ph3", to: "due" });
    expect(stale.skipped).toBe(true);
    expect((await toolCalls()).some((s) => s.phaseId !== "ph1")).toBe(false);
  });
});

describe("no create_invoice for a phase that is not due, on any trigger", () => {
  const notDueCreates = async () => (await toolCalls()).filter((s) => ["create_invoice", "send_invoice"].includes(s.tool ?? "") && s.phaseId !== "ph1");

  it("PLAN_APPROVED, MANUAL, PLAN_EDITED, PHASE_STATUS_CHANGED and PAYMENT_CAPTURED at the start date", async () => {
    await issue();
    await executeRun(PLAN_ID, "MANUAL", { type: "MANUAL" });
    await applyEditedGolden(); // ph2 → €1,950, still months away
    const mark = (await steps()).length;
    await edit();
    const edited = (await steps()).slice(mark);
    expect(edited.filter((s) => s.kind === "tool_call")).toEqual([]);
    expect(edited.find((s) => s.kind === "explanation" && s.phaseId === "ph2")?.text?.en).toBe(
      "Phase 2 will be invoiced on its visit day, 12 Jan 2027, at the new amount €1,950.00",
    );
    for (const to of ["upcoming", "due", "overdue"]) {
      await executeRun(PLAN_ID, "PHASE_STATUS_CHANGED", { type: "PHASE_STATUS_CHANGED", phaseId: "ph2", to });
    }
    const captured = await executeRun(PLAN_ID, "PAYMENT_CAPTURED", { type: "PAYMENT_CAPTURED", phaseId: "ph2", amountCents: 195_000 });
    expect(captured.skipped).toBe(true); // no invoice: nothing to record
    expect(await notDueCreates()).toEqual([]);
    expect((await steps()).some((s) => s.kind === "guard_rejected")).toBe(false);
    expect((await store.getPlan(PLAN_ID))!.phases.slice(1).every((p) => !p.payment.invoice)).toBe(true);
  });

  it("an edit on a due phase without an invoice issues it (held for approval, as after any edit)", async () => {
    await atPhase2VisitDay();
    await applyEditedGolden();
    await edit();
    expect(await trace()).toEqual(["call:create_invoice", "approval_required:send_invoice"]);
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph2")).toMatchObject({ invoiceNumber: "PPP-RIBE-F2-v1", amountCents: 195_000, status: "DRAFT" });
    expect(plan.phases[2]!.payment.invoice).toBeUndefined();
  });

  it("a live invoice left on a phase that is not due (issued before this rule) is cancelled on an edit, not reissued", async () => {
    await store.setClock(PH2_VISIT_DAY);
    await issue(); // ph1 (overdue) + ph2 (due) invoiced
    await store.setClock("2026-11-16"); // the clock is moved back: ph2 not due any more
    await applyEditedGolden();
    const mark = (await steps()).length;
    await edit();
    const run = (await steps()).slice(mark);
    expect(run.filter((s) => s.kind === "tool_call").map((s) => s.tool)).toEqual(["cancel_sent_invoice"]);
    expect(run.some((s) => s.kind === "guard_rejected")).toBe(false);
    expect((await store.getPlan(PLAN_ID))!.phases[1]!.payment.invoice?.status).toBe("CANCELLED");
  });
});

describe("streaming and persistence", () => {
  it("every step is stored and published as AGENT_STEP; invoice changes publish INVOICE_UPDATED", async () => {
    const seen: DomainEvent[] = [];
    const off = subscribe((e) => {
      seen.push(e);
    });
    try {
      await issue();
    } finally {
      off();
    }
    const stored = await steps();
    const streamed = seen.filter((e): e is Extract<DomainEvent, { type: "AGENT_STEP" }> => e.type === "AGENT_STEP");
    expect(streamed.map((e) => e.step.id)).toEqual(stored.map((s) => s.id));
    expect(stored.map((s) => s.seq)).toEqual(stored.map((_, i) => i));
    expect(seen.filter((e) => e.type === "INVOICE_UPDATED").length).toBeGreaterThanOrEqual(3); // create + send + QR of the due phase
  });

  it("redacts secrets from persisted step input/output", async () => {
    const { redact } = await import("@/agent/redact");
    const out = redact({ access_token: "A21AAL-secret", Authorization: "Bearer abc.def.ghi", nested: { client_secret: "shh", ok: "fine" } });
    expect(JSON.stringify(out)).not.toMatch(/A21AAL-secret|abc\.def\.ghi|shh/);
    expect(JSON.stringify(out)).toContain("fine");
  });
});
