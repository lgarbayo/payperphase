/** WP-10 guard (pure): every violation has its own reason; valid payloads pass; duplicate numbers bump v{k}. */
import { describe, expect, it } from "vitest";
import { goldenPlan } from "@/contracts/fixtures/implantCase";
import type { PendingApproval, Plan } from "@/contracts";
import { payloadSha256 } from "@/agent/approvals";
import {
  bumpInvoiceNumber,
  checkToolCall,
  isDuplicateInvoiceNumberError,
  nextNumberAfterDuplicate,
  parseInvoiceNumber,
  type GuardContext,
} from "@/agent/guard";
import { buildCreateInvoiceInput, buildQrInput, buildRecordPaymentInput, buildSendInvoiceInput } from "@/agent/policy";

const RECIPIENT = "paciente.demo@example.com";
const TODAY = "2026-11-16";
/** ph4's visit day: every golden phase is due (ph4) or overdue (ph1–ph3), so the visit-day rule passes. */
const ALL_DUE = "2027-04-22";

function ctx(plan: Plan, extra: Partial<GuardContext> = {}): GuardContext {
  return { plan, recipientEmail: RECIPIENT, today: ALL_DUE, ...extra };
}
function withInvoice(plan: Plan, phaseId: string, status: "DRAFT" | "SENT" | "CANCELLED" | "MARKED_AS_PAID", version = 1) {
  const ph = plan.phases.find((p) => p.id === phaseId)!;
  ph.payment.invoice = {
    invoiceId: `INV2-${phaseId.toUpperCase()}-0001`,
    invoiceNumber: `PPP-RIBE-F${ph.n}-v${version}`,
    version,
    status,
    amountCents: ph.amountCents,
    recipientEmail: RECIPIENT,
    hasQr: false,
    updatedAt: "2026-11-16T10:00:00.000Z",
  };
  return ph.payment.invoice;
}
const create = (plan: Plan, n = 2, opts: Parameters<typeof buildCreateInvoiceInput>[4] = {}, version = 1) =>
  buildCreateInvoiceInput(plan, plan.phases[n - 1]!, version, TODAY, opts);

describe("guard · create_invoice", () => {
  it("passes the engine's amount, EUR, scheme number and the case recipient", () => {
    const plan = goldenPlan();
    const v = checkToolCall("create_invoice", create(plan), ctx(plan));
    expect(v).toEqual({ ok: true, phaseId: "ph2" });
  });

  it.each([-1, 1])("rejects an amount off by %i cent", (delta) => {
    const plan = goldenPlan();
    const v = checkToolCall("create_invoice", create(plan, 2, { amountCents: 150_000 + delta }), ctx(plan));
    expect(v).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH", phaseId: "ph2" });
    if (!v.ok) expect(v.details).toEqual({ actualCents: 150_000 + delta, expectedCents: 150_000 });
  });

  it("shows the pre-edit amount against the engine's: 1.500,00 € ≠ motor 1.950,00 €", () => {
    const plan = goldenPlan();
    plan.phases[1]!.amountCents = 195_000;
    const v = checkToolCall("create_invoice", create(plan, 2, { amountCents: 150_000 }), ctx(plan));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe("AMOUNT_MISMATCH");
      expect(v.reason.es.replace(/[\u00a0\u202f]/g, " ")).toContain("1.500,00 € ≠ motor 1.950,00 €");
      expect(v.reason.en).toContain("engine");
    }
  });

  it("rejects a non-EUR invoice currency and a non-EUR item currency", () => {
    const plan = goldenPlan();
    expect(checkToolCall("create_invoice", { ...create(plan), currency_code: "USD" }, ctx(plan))).toMatchObject({
      ok: false,
      code: "CURRENCY_NOT_EUR",
    });
    const input = create(plan);
    input.items[0]!.unit_amount = { currency_code: "USD" as "EUR", value: "1500.00" };
    expect(checkToolCall("create_invoice", input, ctx(plan))).toMatchObject({ ok: false, code: "CURRENCY_NOT_EUR" });
  });

  it("rejects a malformed invoice number, a foreign plan's number and an unknown phase", () => {
    const plan = goldenPlan();
    expect(checkToolCall("create_invoice", { ...create(plan), invoice_number: "INV-0002" }, ctx(plan))).toMatchObject({
      ok: false,
      code: "BAD_INVOICE_NUMBER",
    });
    expect(checkToolCall("create_invoice", { ...create(plan), invoice_number: undefined }, ctx(plan))).toMatchObject({
      code: "BAD_INVOICE_NUMBER",
    });
    expect(checkToolCall("create_invoice", { ...create(plan), invoice_number: "PPP-ZZZZ-F2-v1" }, ctx(plan))).toMatchObject({
      ok: false,
      code: "FOREIGN_INVOICE_NUMBER",
    });
    expect(checkToolCall("create_invoice", { ...create(plan), invoice_number: "PPP-RIBE-F9-v1" }, ctx(plan))).toMatchObject({
      ok: false,
      code: "UNKNOWN_PHASE",
    });
  });

  it("rejects the wrong recipient (and more than one recipient)", () => {
    const plan = goldenPlan();
    const input = create(plan);
    input.primary_recipients = [{ billing_info: { email_address: "someone.else@example.com" } }];
    expect(checkToolCall("create_invoice", input, ctx(plan))).toMatchObject({ ok: false, code: "WRONG_RECIPIENT" });
    const two = create(plan);
    two.primary_recipients.push({ billing_info: { email_address: RECIPIENT } });
    expect(checkToolCall("create_invoice", two, ctx(plan))).toMatchObject({ ok: false, code: "WRONG_RECIPIENT" });
    // case-insensitive on the right address
    const upper = create(plan);
    upper.primary_recipients = [{ billing_info: { email_address: RECIPIENT.toUpperCase() } }];
    expect(checkToolCall("create_invoice", upper, ctx(plan)).ok).toBe(true);
  });

  it("rejects tax, discount, tips, shipping and partial payments (the model cannot move the total)", () => {
    const plan = goldenPlan();
    for (const extra of [{ allow_tip: true }, { shipping_cost: { amount: { currency_code: "EUR", value: "5.00" } } }, { allow_partial_payment: true }]) {
      expect(checkToolCall("create_invoice", { ...create(plan), ...extra }, ctx(plan))).toMatchObject({ code: "AMOUNT_MODIFIER" });
    }
    const taxed = create(plan);
    (taxed.items[0] as Record<string, unknown>).tax = { name: "IVA", percent: "21" };
    expect(checkToolCall("create_invoice", taxed, ctx(plan))).toMatchObject({ code: "AMOUNT_MODIFIER" });
  });

  it("rejects missing or malformed items; sums several items against the engine's cents", () => {
    const plan = goldenPlan();
    expect(checkToolCall("create_invoice", { ...create(plan), items: [] }, ctx(plan))).toMatchObject({ code: "INVALID_ITEMS" });
    const split = create(plan);
    split.items = [
      { ...split.items[0]!, unit_amount: { currency_code: "EUR", value: "1000.00" } },
      { ...split.items[0]!, unit_amount: { currency_code: "EUR", value: "500.00" } },
    ];
    expect(checkToolCall("create_invoice", split, ctx(plan)).ok).toBe(true);
    split.items[1]!.unit_amount.value = "500.01";
    expect(checkToolCall("create_invoice", split, ctx(plan))).toMatchObject({ code: "AMOUNT_MISMATCH" });
  });

  it("never invoices a paid phase, a phase with an open invoice, or an old version", () => {
    const paid = goldenPlan();
    paid.phases[1]!.payment.status = "paid";
    expect(checkToolCall("create_invoice", create(paid), ctx(paid))).toMatchObject({ code: "PHASE_ALREADY_PAID" });

    const open = goldenPlan();
    withInvoice(open, "ph2", "SENT");
    expect(checkToolCall("create_invoice", create(open, 2, {}, 2), ctx(open))).toMatchObject({ code: "INVOICE_ALREADY_OPEN" });

    const cancelled = goldenPlan();
    withInvoice(cancelled, "ph2", "CANCELLED", 1);
    expect(checkToolCall("create_invoice", create(cancelled, 2, {}, 1), ctx(cancelled))).toMatchObject({
      code: "STALE_INVOICE_VERSION",
      details: { version: 1, next: 2 },
    });
    expect(checkToolCall("create_invoice", create(cancelled, 2, {}, 2), ctx(cancelled)).ok).toBe(true);
  });

  it("checks DEMO_PATIENT_EMAIL-style recipients against the context, not the plan", () => {
    const plan = goldenPlan();
    expect(checkToolCall("create_invoice", create(plan), ctx(plan, { recipientEmail: "sandbox.buyer@personal.example.com" }))).toMatchObject({
      code: "WRONG_RECIPIENT",
    });
  });
});

describe("guard · invoice on the visit day (PHASE_NOT_DUE)", () => {
  it("rejects create_invoice for a phase whose visit day has not come, recomputing the status from the dates", () => {
    const plan = goldenPlan();
    // The stored status says "due"; the engine at TODAY says scheduled: the stored one is never trusted.
    plan.phases[1]!.payment.status = "due";
    const v = checkToolCall("create_invoice", create(plan), ctx(plan, { today: TODAY }));
    expect(v).toMatchObject({ ok: false, code: "PHASE_NOT_DUE", phaseId: "ph2" });
    if (!v.ok) {
      expect(v.details).toEqual({ visitDate: "2027-01-12", today: TODAY, status: "scheduled" });
      expect(v.reason.es).toContain("día de su visita");
      expect(v.reason.en).toContain("visit day");
    }
    // Upcoming (within the window before the visit) is still not payable, so not invoiceable.
    expect(checkToolCall("create_invoice", create(plan), ctx(plan, { today: "2027-01-05" }))).toMatchObject({ code: "PHASE_NOT_DUE" });
  });

  it("passes create_invoice on the visit day and after it (due, overdue)", () => {
    const plan = goldenPlan();
    plan.phases[1]!.payment.status = "scheduled"; // stale stored status, ignored
    expect(checkToolCall("create_invoice", create(plan), ctx(plan, { today: "2027-01-12" }))).toEqual({ ok: true, phaseId: "ph2" });
    expect(checkToolCall("create_invoice", create(plan), ctx(plan, { today: "2027-02-01" }))).toEqual({ ok: true, phaseId: "ph2" });
    // Phase 1 is due on TODAY.
    expect(checkToolCall("create_invoice", create(plan, 1), ctx(plan, { today: TODAY }))).toEqual({ ok: true, phaseId: "ph1" });
  });

  it("rejects send_invoice for a phase that is not due, even with an approved payload", () => {
    const plan = goldenPlan();
    withInvoice(plan, "ph2", "DRAFT");
    const payload = buildSendInvoiceInput("INV2-PH2-0001");
    expect(checkToolCall("send_invoice", payload, ctx(plan, { today: TODAY }))).toMatchObject({ ok: false, code: "PHASE_NOT_DUE", phaseId: "ph2" });
    const approved: Pick<PendingApproval, "status" | "payloadSha256"> = { status: "approved", payloadSha256: payloadSha256(payload) };
    expect(
      checkToolCall("send_invoice", payload, ctx(plan, { today: TODAY, requiresApproval: true, approval: approved })),
    ).toMatchObject({ ok: false, code: "PHASE_NOT_DUE" });
    expect(checkToolCall("send_invoice", payload, ctx(plan, { today: "2027-01-12" }))).toMatchObject({ ok: true, phaseId: "ph2" });
  });

  it("leaves reminders, QR, cancel and record_payment to their own rules", () => {
    const plan = goldenPlan();
    withInvoice(plan, "ph2", "SENT");
    for (const tool of ["send_invoice_reminder", "generate_invoice_qr_code", "cancel_sent_invoice"]) {
      expect(checkToolCall(tool, { invoice_id: "INV2-PH2-0001" }, ctx(plan, { today: TODAY })).ok).toBe(true);
    }
  });

  it("keeps the wrong-amount demo (key G) an AMOUNT_MISMATCH, even before the visit day", () => {
    const plan = goldenPlan();
    plan.phases[1]!.amountCents = 195_000;
    expect(checkToolCall("create_invoice", create(plan, 2, { amountCents: 150_000 }), ctx(plan, { today: TODAY }))).toMatchObject({
      ok: false,
      code: "AMOUNT_MISMATCH",
    });
  });
});

describe("guard · allowlist and invoice ownership", () => {
  it("rejects tools that are not on the allowlist", () => {
    const plan = goldenPlan();
    for (const name of ["create_order", "delete_invoice", "capture_order", "rm -rf", ""]) {
      expect(checkToolCall(name, {}, ctx(plan))).toMatchObject({ ok: false, code: "TOOL_NOT_ALLOWED" });
    }
  });

  it("lets the local read tools through", () => {
    const plan = goldenPlan();
    expect(checkToolCall("get_plan", {}, ctx(plan))).toEqual({ ok: true });
    expect(checkToolCall("get_plan_diff", {}, ctx(plan))).toEqual({ ok: true });
  });

  it("rejects an invoice_id that does not belong to this plan", () => {
    const plan = goldenPlan();
    withInvoice(plan, "ph2", "DRAFT");
    for (const tool of ["send_invoice", "cancel_sent_invoice", "send_invoice_reminder", "generate_invoice_qr_code", "get_invoice"]) {
      expect(checkToolCall(tool, { invoice_id: "INV2-FOREIGN-9999" }, ctx(plan))).toMatchObject({ ok: false, code: "FOREIGN_INVOICE_ID" });
    }
    expect(checkToolCall("send_invoice", { invoice_id: "../etc/passwd" }, ctx(plan))).toMatchObject({ code: "INVALID_INPUT" });
    expect(checkToolCall("send_invoice", buildSendInvoiceInput("INV2-PH2-0001"), ctx(plan))).toMatchObject({ ok: true, phaseId: "ph2" });
    expect(checkToolCall("generate_invoice_qr_code", buildQrInput("INV2-PH2-0001"), ctx(plan)).ok).toBe(true);
  });

  it("rejects extra recipients on send/cancel/reminder", () => {
    const plan = goldenPlan();
    withInvoice(plan, "ph2", "DRAFT");
    expect(
      checkToolCall("send_invoice", { invoice_id: "INV2-PH2-0001", additional_recipients: ["x@y.z"] }, ctx(plan)),
    ).toMatchObject({ code: "WRONG_RECIPIENT" });
  });

  it("rejects a non-object input", () => {
    const plan = goldenPlan();
    expect(checkToolCall("create_invoice", "oops", ctx(plan))).toMatchObject({ code: "INVALID_INPUT" });
    expect(checkToolCall("send_invoice", null, ctx(plan))).toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("guard · send_invoice after an edit needs an executed human approval", () => {
  const plan = (() => {
    const p = goldenPlan();
    withInvoice(p, "ph2", "DRAFT", 2);
    return p;
  })();
  const payload = buildSendInvoiceInput("INV2-PH2-0001");
  const sha = payloadSha256(payload);
  const approval = (status: PendingApproval["status"], hash = sha) => ({ status, payloadSha256: hash });

  it("rejects send_invoice without an approval", () => {
    expect(checkToolCall("send_invoice", payload, ctx(plan, { requiresApproval: true }))).toMatchObject({
      ok: false,
      code: "APPROVAL_REQUIRED",
    });
  });
  it("rejects a pending, rejected or failed approval", () => {
    for (const status of ["pending", "rejected", "failed"] as const) {
      expect(checkToolCall("send_invoice", payload, ctx(plan, { requiresApproval: true, approval: approval(status) }))).toMatchObject({
        code: "APPROVAL_REQUIRED",
      });
    }
  });
  it("rejects a payload that no longer matches the approved sha256", () => {
    const tampered = { ...payload, note: "also pay me a tip" };
    expect(checkToolCall("send_invoice", tampered, ctx(plan, { requiresApproval: true, approval: approval("approved") }))).toMatchObject({
      code: "APPROVAL_HASH_MISMATCH",
    });
  });
  it("passes the exact approved payload", () => {
    expect(checkToolCall("send_invoice", payload, ctx(plan, { requiresApproval: true, approval: approval("approved") }))).toMatchObject({
      ok: true,
      phaseId: "ph2",
    });
  });
  it("does not require approval for the first issue", () => {
    expect(checkToolCall("send_invoice", payload, ctx(plan))).toMatchObject({ ok: true });
  });
});

describe("guard · record_payment_for_invoice", () => {
  const plan = (() => {
    const p = goldenPlan();
    withInvoice(p, "ph1", "SENT");
    return p;
  })();
  it("passes PAYPAL with the phase's cents", () => {
    expect(checkToolCall("record_payment_for_invoice", buildRecordPaymentInput(plan, "INV2-PH1-0001", 36_000, TODAY, "CAP123"), ctx(plan)).ok).toBe(true);
  });
  it("rejects another method, another amount, another currency", () => {
    const ok = buildRecordPaymentInput(plan, "INV2-PH1-0001", 36_000, TODAY, "CAP123");
    expect(checkToolCall("record_payment_for_invoice", { ...ok, method: "CASH" }, ctx(plan))).toMatchObject({ code: "PAYMENT_METHOD_NOT_PAYPAL" });
    expect(checkToolCall("record_payment_for_invoice", buildRecordPaymentInput(plan, "INV2-PH1-0001", 35_999, TODAY), ctx(plan))).toMatchObject({
      code: "AMOUNT_MISMATCH",
    });
    expect(
      checkToolCall("record_payment_for_invoice", { ...ok, amount: { currency_code: "USD", value: "360.00" } }, ctx(plan)),
    ).toMatchObject({ code: "CURRENCY_NOT_EUR" });
  });
});

describe("duplicate invoice numbers bump v{k}", () => {
  it("parses and bumps the scheme", () => {
    expect(parseInvoiceNumber("PPP-RIBE-F2-v1")).toEqual({ plan4: "RIBE", n: 2, version: 1 });
    expect(parseInvoiceNumber("PPP-ribe-F2-v1")).toBeNull();
    expect(bumpInvoiceNumber("PPP-RIBE-F2-v1")).toBe("PPP-RIBE-F2-v2");
    expect(bumpInvoiceNumber("PPP-RIBE-F2-v9")).toBe("PPP-RIBE-F2-v10");
    expect(() => bumpInvoiceNumber("nope")).toThrow();
  });
  it("recognises PayPal's DUPLICATE_INVOICE_ID and the sandbox's real text", () => {
    expect(isDuplicateInvoiceNumberError({ name: "DUPLICATE_INVOICE_ID" })).toBe(true);
    expect(isDuplicateInvoiceNumberError("Invoice number is duplicate.")).toBe(true);
    expect(
      isDuplicateInvoiceNumberError({
        ok: false,
        status: 422,
        message: "The requested action could not be performed, semantically incorrect, or failed business validation.: Invoice number is duplicate.",
      }),
    ).toBe(true);
    expect(isDuplicateInvoiceNumberError({ ok: false, status: 400, message: "too short" })).toBe(false);
    expect(isDuplicateInvoiceNumberError(undefined)).toBe(false);
  });
  it("proposes the next number only after a duplicate error", () => {
    expect(nextNumberAfterDuplicate({ message: "DUPLICATE_INVOICE_ID" }, "PPP-RIBE-F2-v1")).toBe("PPP-RIBE-F2-v2");
    expect(nextNumberAfterDuplicate({ message: "boom" }, "PPP-RIBE-F2-v1")).toBeNull();
  });
});
