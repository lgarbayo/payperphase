/**
 * OWNED BY WP-10. Deterministic billing policy shared by the guard, the playbook and the LLM's
 * `get_plan` view: who is invoiced, how invoices are numbered and dated, and the exact tool payloads.
 * Amounts are ALWAYS the engine's integer cents (phase.amountCents), formatted with centsToPayPalValue.
 */
import {
  CURRENCY,
  formatInvoiceNumber,
  type InvoiceStatus,
  type Locale,
  type Phase,
  type PhaseInvoice,
  type Plan,
} from "@/contracts";
import { serverEnv } from "@/env";
import { formatIsoDate } from "@/lib/dates";
import { centsToPayPalValue } from "@/lib/money";
import { translate } from "@/i18n/core";

/**
 * The case's invoice recipient: DEMO_PATIENT_EMAIL (live sandbox buyer) when set, else the plan's
 * synthetic patient email. The guard checks against this same function.
 */
export function recipientFor(plan: Plan): string {
  return serverEnv().DEMO_PATIENT_EMAIL ?? plan.patient.email;
}

/**
 * How invoices are dated (docs/spikes/agent-toolkit.md):
 * - "visit_date": invoice_date = visit date while the visit is in the future, so PayPal delivers the
 *   bill on the visit day (a SCHEDULED invoice). Preferred, but only if the sandbox lets
 *   cancel_sent_invoice / send_invoice_reminder / record_payment_for_invoice act on SCHEDULED invoices.
 * - "note_only": invoice_date omitted (issued today); the visit date goes on the item (item_date) and
 *   in the note "Pagar el día de la visita (…)". The toolkit 1.11.0 create_invoice exposes no
 *   due_date / payment_term, so this is the toolkit-compatible form of the due-date fallback.
 * Default: "note_only" until the live spike confirms SCHEDULED invoices support the whole flow.
 */
export type InvoiceDatingPolicy = "visit_date" | "note_only";
export const INVOICE_DATING_POLICY: InvoiceDatingPolicy = "note_only";

export function invoiceDateFor(
  phase: Phase,
  simToday: string,
  policy: InvoiceDatingPolicy = INVOICE_DATING_POLICY,
): string | undefined {
  if (policy === "note_only") return undefined;
  return phase.payment.dueDate > simToday ? phase.payment.dueDate : undefined;
}

/** PayPal decides SENT vs SCHEDULED by the invoice date against the real (not simulated) date. */
export function statusAfterSend(invoiceDate: string | undefined, realToday: string): InvoiceStatus {
  return invoiceDate && invoiceDate > realToday ? "SCHEDULED" : "SENT";
}

export function realTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Invoices the patient can still pay through PayPal (a live instrument). */
export const OPEN_INVOICE_STATUSES: readonly InvoiceStatus[] = ["SENT", "SCHEDULED", "UNPAID", "PARTIALLY_PAID"];
export const PAID_INVOICE_STATUSES: readonly InvoiceStatus[] = ["PAID", "MARKED_AS_PAID"];

export function isOpenInvoice(inv: PhaseInvoice | undefined): boolean {
  return !!inv && OPEN_INVOICE_STATUSES.includes(inv.status);
}

/** A phase's invoice that still counts (anything but CANCELLED). */
export function liveInvoice(phase: Phase): PhaseInvoice | undefined {
  const inv = phase.payment.invoice;
  return inv && inv.status !== "CANCELLED" ? inv : undefined;
}

export function isPhaseSettled(phase: Phase): boolean {
  return phase.payment.status === "paid" || phase.payment.status === "processing";
}

/** Next invoice version for a phase: one above whatever invoice it has (cancelled or not). */
export function nextInvoiceVersion(phase: Phase): number {
  return (phase.payment.invoice?.version ?? 0) + 1;
}

export function invoiceNote(plan: Plan, phase: Phase, locale: Locale = plan.patient.locale): string {
  return translate("agent", locale, "invoiceNote", {
    date: formatIsoDate(phase.payment.dueDate, locale),
    n: phase.n,
    title: phase.title[locale],
  });
}

export interface CreateInvoiceInput {
  currency_code: "EUR";
  invoice_number: string;
  invoice_date?: string;
  note: string;
  invoicer_business_name: string;
  invoicer_email_address?: string;
  primary_recipients: Array<{ billing_info: { email_address: string; language?: string } }>;
  items: Array<{
    name: string;
    description?: string;
    quantity: string;
    unit_amount: { currency_code: "EUR"; value: string };
    item_date: string;
  }>;
  [key: string]: unknown;
}

/** The exact create_invoice payload for a phase (one item = the engine amount). */
export function buildCreateInvoiceInput(
  plan: Plan,
  phase: Phase,
  version: number,
  simToday: string,
  opts: { amountCents?: number; policy?: InvoiceDatingPolicy } = {},
): CreateInvoiceInput {
  const locale = plan.patient.locale;
  const invoiceDate = invoiceDateFor(phase, simToday, opts.policy);
  const merchant = serverEnv().DEMO_MERCHANT_EMAIL;
  return {
    currency_code: CURRENCY,
    invoice_number: formatInvoiceNumber(plan.id, phase.n, version),
    ...(invoiceDate ? { invoice_date: invoiceDate } : {}),
    note: invoiceNote(plan, phase, locale),
    invoicer_business_name: plan.clinic.name,
    ...(merchant ? { invoicer_email_address: merchant } : {}),
    primary_recipients: [
      { billing_info: { email_address: recipientFor(plan), language: locale === "es" ? "es-ES" : "en-GB" } },
    ],
    items: [
      {
        name: `${locale === "es" ? "Fase" : "Phase"} ${phase.n}: ${phase.title[locale]}`.slice(0, 200),
        quantity: "1",
        unit_amount: { currency_code: CURRENCY, value: centsToPayPalValue(opts.amountCents ?? phase.amountCents) },
        item_date: phase.payment.dueDate,
      },
    ],
  };
}

export function buildSendInvoiceInput(invoiceId: string): { invoice_id: string; send_to_recipient: true } {
  return { invoice_id: invoiceId, send_to_recipient: true };
}

export function buildQrInput(invoiceId: string): { invoice_id: string; width: number; height: number } {
  return { invoice_id: invoiceId, width: 300, height: 300 };
}

export function buildReminderInput(plan: Plan, phase: Phase, invoiceId: string) {
  const locale = plan.patient.locale;
  const date = formatIsoDate(phase.payment.dueDate, locale);
  return {
    invoice_id: invoiceId,
    subject: translate("agent", locale, "reminderSubject", { date }),
    note: translate("agent", locale, "reminderNote", { date }),
  };
}

export function buildCancelInput(plan: Plan, invoiceId: string, nextNumber: string) {
  return {
    invoice_id: invoiceId,
    note: translate("agent", plan.patient.locale, "cancelNote", { next: nextNumber }),
    send_to_recipient: true,
  };
}

export function buildRecordPaymentInput(
  plan: Plan,
  invoiceId: string,
  amountCents: number,
  simToday: string,
  captureId?: string,
) {
  return {
    invoice_id: invoiceId,
    method: "PAYPAL" as const,
    payment_date: simToday,
    amount: { currency_code: CURRENCY, value: centsToPayPalValue(amountCents) },
    // payment_id is limited to 22 chars by the toolkit schema; real capture ids are 17.
    ...(captureId && captureId.length <= 22 ? { payment_id: captureId } : {}),
    note: translate("agent", plan.patient.locale, "recordNote", { captureId: captureId ?? "—" }),
  };
}

/** What the LLM's `get_plan` tool returns: everything it needs, with the engine's amounts. */
export function billingView(plan: Plan, simToday: string) {
  return {
    planId: plan.id,
    planVersion: plan.version,
    planStatus: plan.status,
    currency: CURRENCY,
    simToday,
    recipientEmail: recipientFor(plan),
    invoicerBusinessName: plan.clinic.name,
    invoicerEmail: serverEnv().DEMO_MERCHANT_EMAIL ?? null,
    patientLanguage: plan.patient.locale === "es" ? "es-ES" : "en-GB",
    phases: plan.phases.map((ph) => {
      const inv = ph.payment.invoice;
      const invoiceDate = invoiceDateFor(ph, simToday);
      return {
        phaseId: ph.id,
        n: ph.n,
        itemName: `${plan.patient.locale === "es" ? "Fase" : "Phase"} ${ph.n}: ${ph.title[plan.patient.locale]}`,
        visitDate: ph.payment.dueDate,
        paymentStatus: ph.payment.status,
        amountCents: ph.amountCents,
        /** Use this string verbatim as items[0].unit_amount.value. */
        amountValue: centsToPayPalValue(ph.amountCents),
        invoice: inv
          ? {
              invoiceId: inv.invoiceId,
              invoiceNumber: inv.invoiceNumber,
              version: inv.version,
              status: inv.status,
              amountCents: inv.amountCents,
              amountValue: centsToPayPalValue(inv.amountCents),
              hasQr: inv.hasQr,
            }
          : null,
        /** Use verbatim as invoice_number when creating this phase's next invoice. */
        nextInvoiceNumber: formatInvoiceNumber(plan.id, ph.n, nextInvoiceVersion(ph)),
        /** Use as invoice_date when not null; omit invoice_date when null. */
        invoiceDate: invoiceDate ?? null,
        note: invoiceNote(plan, ph),
      };
    }),
  };
}
