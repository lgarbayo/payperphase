/** WP-10 playbook (mock PayPal tools): the deterministic sequences behind every trigger. */
import { beforeEach, describe, expect, it } from "vitest";
import { GOLDEN_BONE_GRAFT_DIFF } from "@/contracts/fixtures/implantCase";
import type { DomainEvent } from "@/contracts";
import { decideApproval, executeRun } from "@/agent";
import { payloadSha256 } from "@/agent/approvals";
import { getMockInvoice } from "@/agent/mockTools";
import { subscribe } from "@/server/events";
import { store } from "@/server/store";
import { applyEditedGolden, invoiceOf, PLAN_ID, resetWorld, steps, trace, usePlaybookDeps } from "./helpers";

const issue = () => executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
const edit = () => executeRun(PLAN_ID, "PLAN_EDITED", { type: "PLAN_EDITED", diff: GOLDEN_BONE_GRAFT_DIFF });

beforeEach(async () => {
  await resetWorld();
  usePlaybookDeps();
});

describe("PLAN_APPROVED", () => {
  it("issues one invoice per unpaid phase (number, EUR, engine cents, recipient), sends it, QR only for the due phase", async () => {
    await issue();
    const plan = (await store.getPlan(PLAN_ID))!;
    const cents = [36_000, 150_000, 52_000, 169_000];
    plan.phases.forEach((ph, i) => {
      const inv = invoiceOf(plan, ph.id);
      expect(inv.invoiceNumber).toBe(`PPP-RIBE-F${i + 1}-v1`);
      expect(inv.amountCents).toBe(cents[i]);
      expect(inv.status).toBe("SENT");
      expect(inv.recipientEmail).toBe(plan.patient.email);
      expect(inv.invoiceId).toMatch(/^INV2-MOCK-/);
    });
    expect(invoiceOf(plan, "ph1").hasQr).toBe(true); // due on the start date
    expect(invoiceOf(plan, "ph2").hasQr).toBe(false);

    const created = (await steps()).filter((s) => s.kind === "tool_call" && s.tool === "create_invoice");
    expect(created).toHaveLength(4);
    expect((created[1]!.input as { items: Array<{ unit_amount: { currency_code: string; value: string } }> }).items).toEqual([
      expect.objectContaining({ quantity: "1", unit_amount: { currency_code: "EUR", value: "1500.00" } }),
    ]);
    expect((await steps()).every((s) => s.mode === "playbook" && s.mock)).toBe(true);
  });

  it("is idempotent: a second run (and a manual run) never duplicates an invoice", async () => {
    await issue();
    const before = (await steps()).length;
    const again = await issue();
    expect(again.skipped).toBe(true);
    expect((await steps()).length).toBe(before);
    await executeRun(PLAN_ID, "MANUAL", { type: "MANUAL" });
    const created = (await steps()).filter((s) => s.kind === "tool_call" && s.tool === "create_invoice");
    expect(created).toHaveLength(4);
  });

  it("skips phases that are already paid at approval", async () => {
    await store.updatePlan(PLAN_ID, (p) => {
      p.phases[0]!.payment.status = "paid";
      return p;
    });
    await issue();
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(plan.phases[0]!.payment.invoice).toBeUndefined();
    expect(invoiceOf(plan, "ph2").invoiceNumber).toBe("PPP-RIBE-F2-v1");
    const created = (await steps()).filter((s) => s.kind === "tool_call" && s.tool === "create_invoice");
    expect(created.map((s) => s.phaseId)).toEqual(["ph2", "ph3", "ph4"]);
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
    // Untouched phases keep their v1 invoice.
    expect(invoiceOf(plan, "ph3").invoiceNumber).toBe("PPP-RIBE-F3-v1");

    const [approval] = await store.listPendingApprovals(PLAN_ID);
    expect(approval).toMatchObject({ status: "pending", tool: "send_invoice", phaseId: "ph2" });
    expect(approval!.payloadSha256).toBe(payloadSha256(approval!.payload));
    expect(run.find((s) => s.kind === "approval_required")?.approvalId).toBe(approval!.id);
  });

  it("Approve → send_invoice with exactly the stored payload → generate_invoice_qr_code", async () => {
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

  it("sends a reminder when a phase becomes upcoming, once", async () => {
    await issue();
    await executeRun(PLAN_ID, "PHASE_STATUS_CHANGED", { type: "PHASE_STATUS_CHANGED", phaseId: "ph2", to: "upcoming" });
    const calls = (await steps()).filter((s) => s.kind === "tool_call" && s.tool === "send_invoice_reminder");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.phaseId).toBe("ph2");
    expect(calls[0]!.input).toMatchObject({ invoice_id: invoiceOf((await store.getPlan(PLAN_ID))!, "ph2").invoiceId });
    expect(getMockInvoice(invoiceOf((await store.getPlan(PLAN_ID))!, "ph2").invoiceId)?.reminders).toBe(1);
    // Other transitions are ignored entirely.
    const idle = await executeRun(PLAN_ID, "PHASE_STATUS_CHANGED", { type: "PHASE_STATUS_CHANGED", phaseId: "ph3", to: "due" });
    expect(idle.skipped).toBe(true);
  });
});

describe("streaming and persistence", () => {
  it("every step is stored and published as AGENT_STEP; invoice changes publish INVOICE_UPDATED", async () => {
    const seen: DomainEvent[] = [];
    const off = subscribe((e) => seen.push(e));
    try {
      await issue();
    } finally {
      off();
    }
    const stored = await steps();
    const streamed = seen.filter((e): e is Extract<DomainEvent, { type: "AGENT_STEP" }> => e.type === "AGENT_STEP");
    expect(streamed.map((e) => e.step.id)).toEqual(stored.map((s) => s.id));
    expect(stored.map((s) => s.seq)).toEqual(stored.map((_, i) => i));
    expect(seen.filter((e) => e.type === "INVOICE_UPDATED").length).toBeGreaterThanOrEqual(8); // create + send per phase
  });

  it("redacts secrets from persisted step input/output", async () => {
    const { redact } = await import("@/agent/redact");
    const out = redact({ access_token: "A21AAL-secret", Authorization: "Bearer abc.def.ghi", nested: { client_secret: "shh", ok: "fine" } });
    expect(JSON.stringify(out)).not.toMatch(/A21AAL-secret|abc\.def\.ghi|shh/);
    expect(JSON.stringify(out)).toContain("fine");
  });
});
