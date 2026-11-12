import { z } from "zod";
import { ApprovedNoteRefSchema, NoteIdSchema } from "./notes";
import {
  CaseKindSchema,
  CentsSchema,
  FdiToothSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  LineIdSchema,
  LocaleSchema,
  LocalizedTextSchema,
  PhaseIdSchema,
  PlanIdSchema,
} from "./primitives";
import { PhaseKindSchema } from "./procedures";
import { QuoteLineSchema } from "./extraction";

/**
 * Clinical dependency between phases. All lags are in calendar days, measured from the
 * predecessor's EXCLUSIVE endDate to the successor's startDate (see src/lib/dates.ts).
 */
export const PhaseDependencySchema = z.object({
  phaseId: PhaseIdSchema,
  minLagDays: z.number().int().nonnegative(),
  maxLagDays: z.number().int().positive().optional(),
  /** Shown when a move would break minLagDays (snap-back card). */
  riskNoteId: NoteIdSchema,
  /** Shown when maxLagDays is exceeded (deadline turns red). */
  deadlineNoteId: NoteIdSchema.optional(),
});
export type PhaseDependency = z.infer<typeof PhaseDependencySchema>;

/**
 * scheduled → upcoming (amber, within UPCOMING_WINDOW_DAYS before the visit, NOT payable)
 *           → due (visit day reached, payable) → overdue (after OVERDUE_GRACE_DAYS)
 * due/overdue → processing (capture pending) → paid
 */
export const PaymentStatusSchema = z.enum(["scheduled", "upcoming", "due", "processing", "paid", "overdue"]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const InvoiceStatusSchema = z.enum([
  "DRAFT",
  "SENT",
  "SCHEDULED",
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "MARKED_AS_PAID",
  "CANCELLED",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const PhaseInvoiceSchema = z.object({
  invoiceId: z.string(),
  /** PPP-{plan4}-F{n}-v{k}, <= 25 chars (contracts/agent.ts formatInvoiceNumber). */
  invoiceNumber: z.string().max(25),
  version: z.number().int().positive(),
  status: InvoiceStatusSchema,
  amountCents: CentsSchema,
  recipientEmail: z.string(),
  payerViewUrl: z.string().optional(),
  hasQr: z.boolean(),
  updatedAt: IsoDateTimeSchema,
});
export type PhaseInvoice = z.infer<typeof PhaseInvoiceSchema>;

export const PaymentMilestoneSchema = z.object({
  /** Pay-at-the-visit: dueDate === phase.startDate (engine keeps them in sync). */
  dueDate: IsoDateSchema,
  status: PaymentStatusSchema,
  /** Which instrument settled (or is settling) the milestone. One live instrument per milestone. */
  instrument: z.enum(["order", "invoice"]).optional(),
  orderId: z.string().optional(),
  /** PayPal-Request-Id attempt counter for order create/capture idempotency. */
  orderAttempt: z.number().int().nonnegative().default(0),
  captureId: z.string().optional(),
  paidCents: CentsSchema.optional(),
  paidAt: IsoDateTimeSchema.optional(),
  invoice: PhaseInvoiceSchema.optional(),
});
export type PaymentMilestone = z.infer<typeof PaymentMilestoneSchema>;

/** PAY_IN_3: €20–€2,000. INSTALLMENTS: only when indivisible & <= €5,000. PAYPAL_ONLY otherwise. */
export const FitBandSchema = z.enum(["PAY_IN_3", "INSTALLMENTS", "PAYPAL_ONLY"]);
export type FitBand = z.infer<typeof FitBandSchema>;

export const FitReasonSchema = z.enum([
  "WITHIN_PAY_IN_3_RANGE",
  "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX",
  "BELOW_PAY_IN_3_MIN",
  "OVER_INSTALLMENTS_MAX",
  /** A phase of several items that a dentist edit took over €2,000 (edits never re-split). */
  "OVER_PAY_IN_3_MAX",
]);
export type FitReason = z.infer<typeof FitReasonSchema>;

export const PhaseFitSchema = z.object({ band: FitBandSchema, reason: FitReasonSchema });
export type PhaseFit = z.infer<typeof PhaseFitSchema>;

export const DeliverySchema = z.object({
  status: z.enum(["pending", "delivered"]),
  deliveredOn: IsoDateSchema.optional(),
});
export type Delivery = z.infer<typeof DeliverySchema>;

export const PhaseSchema = z.object({
  id: PhaseIdSchema,
  /** 1-based order, also used in invoice numbers (F{n}). */
  n: z.number().int().positive(),
  kind: PhaseKindSchema,
  /** Deterministic default from the engine catalog; the clinic may approve reworded text. */
  title: LocalizedTextSchema,
  /** Approved patient-facing explanation (wording drafts become this after approval). */
  summary: LocalizedTextSchema.optional(),
  lineIds: z.array(LineIdSchema),
  teeth: z.array(FdiToothSchema),
  startDate: IsoDateSchema,
  durationDays: z.number().int().positive(),
  /** EXCLUSIVE end: startDate + durationDays. */
  endDate: IsoDateSchema,
  dependsOn: z.array(PhaseDependencySchema),
  amountCents: CentsSchema,
  fit: PhaseFitSchema,
  payment: PaymentMilestoneSchema,
  delivery: DeliverySchema,
  /** Note ids relevant to this phase (shown as cards, cited by chat). */
  noteIds: z.array(NoteIdSchema),
});
export type Phase = z.infer<typeof PhaseSchema>;

export const PlanStatusSchema = z.enum(["draft", "approved", "completed", "cancelled"]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const BaselineSchema = z.object({
  capturedAt: IsoDateTimeSchema,
  version: z.number().int().positive(),
  phases: z.array(
    z.object({
      phaseId: PhaseIdSchema,
      startDate: IsoDateSchema,
      endDate: IsoDateSchema,
      dueDate: IsoDateSchema,
      amountCents: CentsSchema,
    }),
  ),
});
export type Baseline = z.infer<typeof BaselineSchema>;

export const PlanSchema = z.object({
  id: PlanIdSchema,
  /** Bumped by every persisted change to phases (edit, what-if). */
  version: z.number().int().positive(),
  caseKind: CaseKindSchema,
  status: PlanStatusSchema,
  currency: z.literal("EUR"),
  clinic: z.object({ name: z.string(), city: z.string(), dentistName: z.string() }),
  patient: z.object({
    alias: z.string(),
    /** Sandbox buyer email; the agent guard only invoices this address. */
    email: z.string(),
    locale: LocaleSchema,
  }),
  quoteId: z.string(),
  /** Every line of the quote (extracted + clinic edits). Phases reference them by id. */
  lines: z.array(QuoteLineSchema),
  totalCents: CentsSchema,
  phases: z.array(PhaseSchema),
  /** Approved schedule snapshot; the Gantt draws it as the ghost during what-ifs. */
  baseline: BaselineSchema.optional(),
  approvedNotes: z.array(ApprovedNoteRefSchema),
  approvedBy: z.string().optional(),
  approvedAt: IsoDateTimeSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Plan = z.infer<typeof PlanSchema>;

export const PlanSummarySchema = z.object({
  id: PlanIdSchema,
  patientAlias: z.string(),
  caseKind: CaseKindSchema,
  status: PlanStatusSchema,
  totalCents: CentsSchema,
  paidCents: CentsSchema,
  nextDue: z.object({ phaseId: PhaseIdSchema, dueDate: IsoDateSchema, status: PaymentStatusSchema }).nullable(),
  updatedAt: IsoDateTimeSchema,
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
