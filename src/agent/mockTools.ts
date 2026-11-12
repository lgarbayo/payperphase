/**
 * Deterministic stand-in for the PayPal invoicing tools when there are no sandbox
 * credentials. Same tool names and input shapes as the toolkit; ids are `INV2-MOCK-XXXX-XXXX-XXXX`
 * derived from the invoice number; invoice states follow PayPal's (DRAFT → SENT/SCHEDULED → MARKED_AS_PAID
 * or CANCELLED). Outputs mimic the toolkit's decoded outputs (errors are `{ok:false,status,code,message}`).
 * State lives on globalThis (it plays "PayPal"), so it survives runs and dev HMR.
 */
import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { InvoiceToolNameSchema, type InvoiceStatus, type InvoiceToolsClient } from "@/contracts";
import { payPalValueToCents, centsToPayPalValue } from "@/lib/money";
import type { AnthropicToolDef } from "./toolkit";
import { realTodayIso, statusAfterSend } from "./policy";

interface MockInvoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: string;
  invoiceDate?: string;
  amountCents: number;
  recipientEmail: string;
  note?: string;
  payments: Array<{ payment_id: string; amount: unknown; method: unknown; payment_date: unknown }>;
  reminders: number;
}
interface MockState {
  invoices: Map<string, MockInvoice>;
  numbers: Set<string>;
}

const g = globalThis as unknown as { __pppMockInvoices?: MockState };
function state(): MockState {
  return (g.__pppMockInvoices ??= { invoices: new Map(), numbers: new Set() });
}

/** Forget every mock invoice (demo reset, tests). */
export function resetMockInvoices(): void {
  g.__pppMockInvoices = { invoices: new Map(), numbers: new Set() };
}

/** Pre-register a number so the next create_invoice with it fails as a duplicate (tests). */
export function reserveMockInvoiceNumber(invoiceNumber: string): void {
  state().numbers.add(invoiceNumber);
}

export function getMockInvoice(id: string): Readonly<MockInvoice> | undefined {
  return state().invoices.get(id);
}

export function mockInvoiceId(invoiceNumber: string): string {
  const h = createHash("sha256").update(invoiceNumber).digest("hex").toUpperCase();
  return `INV2-MOCK-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

function err(status: number, message: string) {
  return { ok: false as const, output: { ok: false, status, code: "PAYPAL_API_HTTP_ERROR", message } };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const OPEN: readonly InvoiceStatus[] = ["SENT", "SCHEDULED", "UNPAID", "PARTIALLY_PAID"];

export interface MockToolsOptions {
  /** Anthropic tool schemas to advertise (the real toolkit's, from loadToolkitToolSchemas). */
  tools?: AnthropicToolDef[];
  /** Payer view link for an invoice (default: sandbox payer-view URL shape). */
  payerUrl?: (invoiceId: string, invoiceNumber: string) => string;
  /** Real (wall-clock) date used for SENT vs SCHEDULED. */
  realToday?: () => string;
}

export function defaultPayerUrl(invoiceId: string): string {
  return `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`;
}

function invoiceView(inv: MockInvoice, payerUrl: string) {
  return {
    id: inv.id,
    status: inv.status,
    detail: {
      invoice_number: inv.invoiceNumber,
      currency_code: inv.currency,
      ...(inv.invoiceDate ? { invoice_date: inv.invoiceDate } : {}),
      note: inv.note,
      metadata: { recipient_view_url: payerUrl },
    },
    primary_recipients: [{ billing_info: { email_address: inv.recipientEmail } }],
    amount: { currency_code: inv.currency, value: centsToPayPalValue(inv.amountCents) },
    payments: inv.payments.length ? { transactions: inv.payments } : undefined,
    links: [{ rel: "self", href: `https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${inv.id}`, method: "GET" }],
  };
}

export function createMockInvoiceTools(opts: MockToolsOptions = {}): InvoiceToolsClient {
  const payerUrl = (inv: MockInvoice) => (opts.payerUrl ? opts.payerUrl(inv.id, inv.invoiceNumber) : defaultPayerUrl(inv.id));
  const realToday = opts.realToday ?? realTodayIso;
  const tools = opts.tools ?? [];

  return {
    mode: "mock",
    listTools: () => tools,
    async call(name, rawInput) {
      if (!InvoiceToolNameSchema.safeParse(name).success) return err(400, `Unknown tool ${String(name)}`);
      const input = asRecord(rawInput);
      const s = state();

      if (name === "create_invoice") {
        const number = input.invoice_number;
        if (typeof number !== "string" || !number) return err(400, "invoice_number is required");
        if (s.numbers.has(number)) {
          return err(422, `Invoice number already exists. DUPLICATE_INVOICE_NUMBER: ${number}`);
        }
        let amountCents = 0;
        try {
          for (const it of Array.isArray(input.items) ? input.items : []) {
            const item = asRecord(it);
            amountCents += Number(item.quantity ?? 1) * payPalValueToCents(String(asRecord(item.unit_amount).value ?? ""));
          }
        } catch {
          return err(400, "INVALID_PARAMETER_SYNTAX: items[].unit_amount.value");
        }
        const firstRecipient = Array.isArray(input.primary_recipients) ? asRecord(input.primary_recipients[0]) : {};
        const recipient = asRecord(firstRecipient.billing_info);
        const inv: MockInvoice = {
          id: mockInvoiceId(number),
          invoiceNumber: number,
          status: "DRAFT",
          currency: String(input.currency_code ?? "EUR"),
          invoiceDate: typeof input.invoice_date === "string" ? input.invoice_date : undefined,
          amountCents,
          recipientEmail: String(recipient.email_address ?? ""),
          note: typeof input.note === "string" ? input.note : undefined,
          payments: [],
          reminders: 0,
        };
        s.numbers.add(number);
        s.invoices.set(inv.id, inv);
        return { ok: true, output: invoiceView(inv, payerUrl(inv)) };
      }

      const id = input.invoice_id;
      const inv = typeof id === "string" ? s.invoices.get(id) : undefined;
      if (!inv) return err(404, `RESOURCE_NOT_FOUND: invoice ${String(id)}`);

      switch (name) {
        case "get_invoice":
          return { ok: true, output: invoiceView(inv, payerUrl(inv)) };
        case "send_invoice": {
          if (inv.status !== "DRAFT") return err(422, `INVOICE_ALREADY_SENT: invoice is ${inv.status}`);
          inv.status = statusAfterSend(inv.invoiceDate, realToday());
          return { ok: true, output: { rel: "payer-view", href: payerUrl(inv), method: "GET" } };
        }
        case "send_invoice_reminder": {
          if (!OPEN.includes(inv.status)) return err(422, `CANT_REMIND: invoice is ${inv.status}`);
          inv.reminders += 1;
          return { ok: true, output: "" };
        }
        case "cancel_sent_invoice": {
          if (!OPEN.includes(inv.status)) return err(422, `CANT_CANCEL: invoice is ${inv.status}`);
          inv.status = "CANCELLED";
          return { ok: true, output: { success: true, invoice_id: inv.id } };
        }
        case "generate_invoice_qr_code": {
          if (inv.status === "CANCELLED") return err(422, "INVOICE_CANCELLED");
          const width = Number(input.width ?? 300) || 300;
          const dataUrl = await QRCode.toDataURL(payerUrl(inv), { width, margin: 1, errorCorrectionLevel: "M" });
          // PayPal returns the PNG as bare base64 text; the agent turns it back into a data URL.
          return { ok: true, output: dataUrl.replace(/^data:image\/png;base64,/, "") };
        }
        case "record_payment_for_invoice": {
          if (!OPEN.includes(inv.status)) return err(422, `CANT_RECORD_PAYMENT: invoice is ${inv.status}`);
          const paymentId = `EXTR-MOCK-${createHash("sha256").update(`${inv.id}:${inv.payments.length}`).digest("hex").slice(0, 10).toUpperCase()}`;
          inv.payments.push({
            payment_id: paymentId,
            amount: input.amount,
            method: input.method,
            payment_date: input.payment_date,
          });
          inv.status = "MARKED_AS_PAID";
          return { ok: true, output: { payment_id: paymentId } };
        }
        default:
          return err(400, `Unsupported tool ${name}`);
      }
    },
  };
}
