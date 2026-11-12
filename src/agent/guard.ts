/**
 * Deterministic policy gate wrapped around EVERY agent tool call (LLM or playbook).
 * Pure: no I/O; the simulated clock's day comes in the context. A violation becomes an `is_error` tool_result for the model and a red
 * `guard_rejected` step in the feed. The model never chooses money: amounts must equal the engine's cents.
 */
import {
  AgentToolNameSchema,
  CURRENCY,
  INVOICE_NUMBER_RE,
  LocalAgentToolNameSchema,
  planShortCode,
  type LocalizedText,
  type PendingApproval,
  type Phase,
  type Plan,
} from "@/contracts";
import { payPalValueToCents } from "@/lib/money";
import { payloadSha256 } from "./approvals";
import { paymentStatusAt } from "@/engine/payments";
import { isOpenInvoice, isPhaseDueAt, isPhaseSettled, PAID_INVOICE_STATUSES } from "./policy";
import { day, lt, money } from "./text";

export type GuardCode =
  | "TOOL_NOT_ALLOWED"
  | "INVALID_INPUT"
  | "CURRENCY_NOT_EUR"
  | "BAD_INVOICE_NUMBER"
  | "FOREIGN_INVOICE_NUMBER"
  | "UNKNOWN_PHASE"
  | "WRONG_RECIPIENT"
  | "AMOUNT_MODIFIER"
  | "INVALID_ITEMS"
  | "AMOUNT_MISMATCH"
  | "PHASE_ALREADY_PAID"
  | "PHASE_NOT_PAID"
  | "INVOICE_ALREADY_OPEN"
  | "STALE_INVOICE_VERSION"
  | "FOREIGN_INVOICE_ID"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_HASH_MISMATCH"
  | "PAYMENT_METHOD_NOT_PAYPAL"
  | "PHASE_NOT_DUE";

export interface GuardContext {
  plan: Plan;
  /** recipientFor(plan): the only address the agent may invoice. */
  recipientEmail: string;
  /** The simulated clock's today: create_invoice / send_invoice need the phase due at this day. */
  today: string;
  /** send_invoice must carry a human-approved payload (after a plan edit, or the invoice has an approval). */
  requiresApproval?: boolean;
  /** The approval being executed, when send_invoice runs from decideApproval. */
  approval?: Pick<PendingApproval, "status" | "payloadSha256"> | null;
}

export type GuardResult =
  | { ok: true; phaseId?: string }
  | {
      ok: false;
      code: GuardCode;
      reason: LocalizedText;
      phaseId?: string;
      /** Machine-readable facts behind the reason (e.g. actual/expected cents). */
      details?: Record<string, unknown>;
    };

type Violation = Extract<GuardResult, { ok: false }>;

function reject(
  code: GuardCode,
  reason: LocalizedText,
  extra: { phaseId?: string; details?: Record<string, unknown> } = {},
): Violation {
  return { ok: false, code, reason, ...extra };
}

const INVOICE_ID_RE = /^[A-Za-z0-9_-]{1,127}$/;
const POSITIVE_INT_RE = /^[1-9][0-9]{0,5}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function sameEmail(a: unknown, b: string): boolean {
  return typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Parse PPP-{plan4}-F{n}-v{k}. */
export function parseInvoiceNumber(value: unknown): { plan4: string; n: number; version: number } | null {
  if (typeof value !== "string" || !INVOICE_NUMBER_RE.test(value)) return null;
  const m = /^PPP-([A-Z0-9]{4})-F(\d+)-v(\d+)$/.exec(value);
  if (!m) return null;
  return { plan4: m[1]!, n: Number(m[2]), version: Number(m[3]) };
}

export function phaseOfInvoiceId(plan: Plan, invoiceId: string): Phase | undefined {
  return plan.phases.find((p) => p.payment.invoice?.invoiceId === invoiceId);
}

function moneyCents(m: unknown): { cents: number; currency: unknown } | null {
  if (!isRecord(m) || typeof m.value !== "string") return null;
  try {
    return { cents: payPalValueToCents(m.value), currency: m.currency_code };
  } catch {
    return null;
  }
}

function amountMismatch(actual: number, expected: number, phaseId: string): Violation {
  return reject(
    "AMOUNT_MISMATCH",
    lt("guardAmount", (l) => ({ actual: money(actual, l), expected: money(expected, l) })),
    { phaseId, details: { actualCents: actual, expectedCents: expected } },
  );
}

/** Invoice on the visit day: the engine status at ctx.today must be due or overdue (stored status ignored). */
function checkPhaseDue(phase: Phase, ctx: GuardContext): Violation | null {
  if (isPhaseDueAt(phase, ctx.today)) return null;
  return reject("PHASE_NOT_DUE", lt("guardNotDue", (l) => ({ n: phase.n, date: day(phase.payment.dueDate, l) })), {
    phaseId: phase.id,
    details: { visitDate: phase.payment.dueDate, today: ctx.today, status: paymentStatusAt(phase, ctx.today) },
  });
}

function checkExtraRecipients(input: Record<string, unknown>, ctx: GuardContext): Violation | null {
  const extra = input.additional_recipients;
  if (Array.isArray(extra) && extra.length > 0) {
    return reject("WRONG_RECIPIENT", lt("guardRecipient", { actual: String(extra[0]), expected: ctx.recipientEmail }));
  }
  return null;
}

function checkCreateInvoice(input: Record<string, unknown>, ctx: GuardContext): GuardResult {
  const { plan } = ctx;

  if (input.currency_code !== CURRENCY) {
    return reject("CURRENCY_NOT_EUR", lt("guardCurrency", { currency: String(input.currency_code ?? "—") }));
  }

  const num = parseInvoiceNumber(input.invoice_number);
  if (!num) {
    return reject("BAD_INVOICE_NUMBER", lt("guardNumberFormat", { number: String(input.invoice_number ?? "—") }));
  }
  const plan4 = planShortCode(plan.id);
  if (num.plan4 !== plan4) {
    return reject("FOREIGN_INVOICE_NUMBER", lt("guardNumberForeign", { number: String(input.invoice_number), plan4 }));
  }
  const phase = plan.phases.find((p) => p.n === num.n);
  if (!phase) return reject("UNKNOWN_PHASE", lt("guardUnknownPhase", { n: num.n }));

  const recipients = input.primary_recipients;
  const first = Array.isArray(recipients) && recipients.length === 1 ? recipients[0] : undefined;
  const email = isRecord(first) && isRecord(first.billing_info) ? first.billing_info.email_address : undefined;
  if (!sameEmail(email, ctx.recipientEmail)) {
    const actual = Array.isArray(recipients) && recipients.length > 1 ? `${recipients.length} recipients` : String(email ?? "—");
    return reject("WRONG_RECIPIENT", lt("guardRecipient", { actual, expected: ctx.recipientEmail }), {
      phaseId: phase.id,
    });
  }

  const items = input.items;
  const modifiers =
    input.shipping_cost !== undefined ||
    input.allow_tip === true ||
    input.allow_partial_payment === true ||
    input.minimum_partial_payment_amount !== undefined ||
    (Array.isArray(items) && items.some((it) => isRecord(it) && (it.tax !== undefined || it.discount !== undefined)));
  if (modifiers) return reject("AMOUNT_MODIFIER", lt("guardModifier"), { phaseId: phase.id });

  if (!Array.isArray(items) || items.length === 0) {
    return reject("INVALID_ITEMS", lt("guardItems"), { phaseId: phase.id });
  }
  let total = 0;
  for (const it of items) {
    if (!isRecord(it) || typeof it.quantity !== "string" || !POSITIVE_INT_RE.test(it.quantity)) {
      return reject("INVALID_ITEMS", lt("guardItems"), { phaseId: phase.id });
    }
    const unit = moneyCents(it.unit_amount);
    if (!unit) return reject("INVALID_ITEMS", lt("guardItems"), { phaseId: phase.id });
    if (unit.currency !== CURRENCY) {
      return reject("CURRENCY_NOT_EUR", lt("guardCurrency", { currency: String(unit.currency ?? "—") }), {
        phaseId: phase.id,
      });
    }
    total += Number(it.quantity) * unit.cents;
  }
  if (total !== phase.amountCents) return amountMismatch(total, phase.amountCents, phase.id);

  const existing = phase.payment.invoice;
  if (isPhaseSettled(phase) || (existing && PAID_INVOICE_STATUSES.includes(existing.status))) {
    return reject("PHASE_ALREADY_PAID", lt("guardPaid", { n: phase.n }), { phaseId: phase.id });
  }
  if (existing && isOpenInvoice(existing)) {
    return reject("INVOICE_ALREADY_OPEN", lt("guardOpen", { n: phase.n, number: existing.invoiceNumber }), {
      phaseId: phase.id,
    });
  }
  if (existing && num.version <= existing.version) {
    return reject("STALE_INVOICE_VERSION", lt("guardStale", { version: num.version, next: existing.version + 1 }), {
      phaseId: phase.id,
      details: { version: num.version, next: existing.version + 1 },
    });
  }
  const notDue = checkPhaseDue(phase, ctx);
  if (notDue) return notDue;
  return { ok: true, phaseId: phase.id };
}

function checkInvoiceIdTool(name: string, input: Record<string, unknown>, ctx: GuardContext): GuardResult {
  const id = input.invoice_id;
  if (typeof id !== "string" || !INVOICE_ID_RE.test(id)) {
    return reject("INVALID_INPUT", lt("guardInvalid", { detail: "invoice_id" }));
  }
  const phase = phaseOfInvoiceId(ctx.plan, id);
  if (!phase) return reject("FOREIGN_INVOICE_ID", lt("guardInvoiceId", { invoiceId: id }));

  const extra = checkExtraRecipients(input, ctx);
  if (extra) return { ...extra, phaseId: phase.id };

  // A payable invoice (or its QR) never goes out for a settled phase, nor at an amount the engine
  // no longer holds (a held send whose phase was paid or edited again before the Approve click).
  if (name === "send_invoice" || name === "generate_invoice_qr_code") {
    if (isPhaseSettled(phase)) return reject("PHASE_ALREADY_PAID", lt("guardPaid", { n: phase.n }), { phaseId: phase.id });
    const invoiced = phase.payment.invoice!.amountCents;
    if (name === "send_invoice" && invoiced !== phase.amountCents) return amountMismatch(invoiced, phase.amountCents, phase.id);
  }

  if (name === "send_invoice") {
    const notDue = checkPhaseDue(phase, ctx);
    if (notDue) return notDue;
  }

  if (name === "send_invoice" && ctx.requiresApproval) {
    if (!ctx.approval || ctx.approval.status !== "approved") {
      return reject("APPROVAL_REQUIRED", lt("guardApproval"), { phaseId: phase.id });
    }
    if (payloadSha256(input) !== ctx.approval.payloadSha256) {
      return reject("APPROVAL_HASH_MISMATCH", lt("guardApprovalHash"), { phaseId: phase.id });
    }
  }

  if (name === "record_payment_for_invoice") {
    // The record only mirrors a completed checkout capture onto the phase invoice; it never marks
    // an unpaid phase's invoice as paid.
    if (phase.payment.status !== "paid" || phase.payment.instrument !== "order") {
      return reject("PHASE_NOT_PAID", lt("guardNotPaid", { n: phase.n }), { phaseId: phase.id });
    }
    if (input.method !== "PAYPAL") {
      return reject("PAYMENT_METHOD_NOT_PAYPAL", lt("guardMethod", { method: String(input.method ?? "—") }), {
        phaseId: phase.id,
      });
    }
    const amount = moneyCents(input.amount);
    if (!amount) return reject("INVALID_INPUT", lt("guardInvalid", { detail: "amount" }), { phaseId: phase.id });
    if (amount.currency !== CURRENCY) {
      return reject("CURRENCY_NOT_EUR", lt("guardCurrency", { currency: String(amount.currency ?? "—") }), {
        phaseId: phase.id,
      });
    }
    if (amount.cents !== phase.amountCents) return amountMismatch(amount.cents, phase.amountCents, phase.id);
  }
  return { ok: true, phaseId: phase.id };
}

/** The policy gate. Call it with the CURRENT plan right before executing the tool. */
export function checkToolCall(name: string, input: unknown, ctx: GuardContext): GuardResult {
  const tool = AgentToolNameSchema.safeParse(name);
  if (!tool.success) return reject("TOOL_NOT_ALLOWED", lt("guardTool", { tool: String(name).slice(0, 60) }));
  if (LocalAgentToolNameSchema.safeParse(name).success) return { ok: true };
  if (!isRecord(input)) return reject("INVALID_INPUT", lt("guardInvalid", { detail: "input must be an object" }));
  if (name === "create_invoice") return checkCreateInvoice(input, ctx);
  return checkInvoiceIdTool(name, input, ctx);
}

/**
 * PayPal rejects a reused invoice_number (demo resets, earlier runs). The toolkit flattens the error
 * into a message; live sandbox text (spike): "Invoice number is duplicate." (HTTP 422).
 */
export function isDuplicateInvoiceNumberError(output: unknown): boolean {
  let text: string;
  try {
    text = typeof output === "string" ? output : JSON.stringify(output ?? "");
  } catch {
    return false;
  }
  return /DUPLICATE_INVOICE_(ID|NUMBER)|invoice number (is duplicate|already exists|is already (in use|used))|already been used/i.test(
    text,
  );
}

/** PPP-XXXX-F2-v1 → PPP-XXXX-F2-v2. */
export function bumpInvoiceNumber(invoiceNumber: string): string {
  const parsed = parseInvoiceNumber(invoiceNumber);
  if (!parsed) throw new Error(`Not an invoice number: ${invoiceNumber}`);
  return `PPP-${parsed.plan4}-F${parsed.n}-v${parsed.version + 1}`;
}

/** The next number to try after a create_invoice result, or null when it was not a duplicate. */
export function nextNumberAfterDuplicate(output: unknown, invoiceNumber: string): string | null {
  return isDuplicateInvoiceNumberError(output) ? bumpInvoiceNumber(invoiceNumber) : null;
}
