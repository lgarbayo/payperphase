import { z } from "zod";
import { ExtractionResultSchema, QuoteLineSchema } from "./extraction";
import { NoteIdSchema } from "./notes";
import { FitBandSchema, PaymentStatusSchema, PlanSchema } from "./plan";
import {
  CaseKindSchema,
  CentsSchema,
  DeltaCentsSchema,
  FdiToothSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  LineIdSchema,
  LocaleSchema,
  PhaseIdSchema,
  PlanIdSchema,
} from "./primitives";
import { ProcedureCodeSchema } from "./procedures";

/**
 * Engine I/O types. The engine (src/engine, WP-01) is pure, isomorphic TypeScript and the ONLY
 * producer of money (integer cents) and dates (IsoDate). Signatures live in src/engine/index.ts.
 */

export const BuildPlanInputSchema = z.object({
  planId: PlanIdSchema,
  extraction: ExtractionResultSchema,
  caseKind: CaseKindSchema,
  /** First visit (phase 1) date. Defaults to the simulated today at the call site. */
  startDate: IsoDateSchema,
  /** Simulated today, for payment statuses. */
  today: IsoDateSchema,
  clinic: z.object({ name: z.string(), city: z.string(), dentistName: z.string() }),
  patient: z.object({ alias: z.string(), email: z.string(), locale: LocaleSchema }),
  /** Wall-clock timestamp for createdAt/updatedAt (pass it in; the engine never reads the clock). */
  now: IsoDateTimeSchema,
});
export type BuildPlanInput = z.infer<typeof BuildPlanInputSchema>;

export const MoveRequestSchema = z.object({
  phaseId: PhaseIdSchema,
  newStartDate: IsoDateSchema,
});
export type MoveRequest = z.infer<typeof MoveRequestSchema>;

export const MoveRejectReasonSchema = z.enum([
  /** Would start before predecessor.endDate + minLagDays. */
  "MIN_LAG",
  "PHASE_PAID",
  "PHASE_DELIVERED",
  /** Cannot move a phase to before the simulated today. */
  "IN_THE_PAST",
  "UNKNOWN_PHASE",
]);
export type MoveRejectReason = z.infer<typeof MoveRejectReasonSchema>;

export const MoveValidationSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: MoveRejectReasonSchema,
    /** Clinician note to show on the snap-back card (MIN_LAG → the dependency's riskNoteId). */
    noteId: NoteIdSchema.optional(),
    /** Earliest legal start for this phase, when one exists. */
    earliestStartDate: IsoDateSchema.optional(),
  }),
]);
export type MoveValidation = z.infer<typeof MoveValidationSchema>;

export const DeadlineWarningSchema = z.object({
  phaseId: PhaseIdSchema,
  /** predecessor.endDate + maxLagDays — Bryntum deadlineDate. */
  deadlineDate: IsoDateSchema,
  exceededByDays: z.number().int().positive(),
  noteId: NoteIdSchema,
});
export type DeadlineWarning = z.infer<typeof DeadlineWarningSchema>;

export const PhaseShiftSchema = z.object({
  phaseId: PhaseIdSchema,
  fromStart: IsoDateSchema,
  toStart: IsoDateSchema,
  deltaDays: z.number().int(),
  fromDue: IsoDateSchema,
  toDue: IsoDateSchema,
});
export type PhaseShift = z.infer<typeof PhaseShiftSchema>;

/** Result of engine.reschedule(): the moved phase plus every successor that had to follow. */
export const WhatIfResultSchema = z.object({
  plan: PlanSchema,
  request: MoveRequestSchema,
  shifts: z.array(PhaseShiftSchema),
  warnings: z.array(DeadlineWarningSchema),
});
export type WhatIfResult = z.infer<typeof WhatIfResultSchema>;

export const HealingWindowSchema = z.object({
  fromPhaseId: PhaseIdSchema,
  toPhaseId: PhaseIdSchema,
  /** = predecessor.endDate */
  startDate: IsoDateSchema,
  /** startDate + minLagDays: the hatched, non-negotiable part. */
  minEndDate: IsoDateSchema,
  /** startDate + maxLagDays when a max exists. */
  maxEndDate: IsoDateSchema.optional(),
  /** = successor.startDate (actual gap, >= minEndDate). */
  actualEndDate: IsoDateSchema,
  noteId: NoteIdSchema,
});
export type HealingWindow = z.infer<typeof HealingWindowSchema>;

export const OrderEligibilitySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), amountCents: CentsSchema }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["NOT_DUE_YET", "ALREADY_PAID", "PROCESSING", "PLAN_NOT_APPROVED", "UNKNOWN_PHASE"]),
  }),
]);
export type OrderEligibility = z.infer<typeof OrderEligibilitySchema>;

/** "Paid for treatment not yet received" meter. Invariant under PayPerPhase: prepaidUndeliveredCents === 0. */
export const ExposureReportSchema = z.object({
  asOf: IsoDateSchema,
  totalCents: CentsSchema,
  paidCents: CentsSchema,
  deliveredCents: CentsSchema,
  prepaidUndeliveredCents: CentsSchema,
  remainingCents: CentsSchema,
  byPhase: z.array(
    z.object({
      phaseId: PhaseIdSchema,
      amountCents: CentsSchema,
      paid: z.boolean(),
      delivered: z.boolean(),
      status: PaymentStatusSchema,
    }),
  ),
});
export type ExposureReport = z.infer<typeof ExposureReportSchema>;

/** "What if the clinic closes today?" — illustrative, computed from undelivered phases. */
export const ClosureStressTestSchema = z.object({
  asOf: IsoDateSchema,
  illustrative: z.literal(true),
  sourceUrl: z.string().url(),
  linkedLoan: z.object({
    financedCents: CentsSchema,
    months: z.number().int().positive(),
    monthlyCents: CentsSchema,
    monthsElapsed: z.number().int().nonnegative(),
    repaidCents: CentsSchema,
    outstandingCents: CentsSchema,
    /** Headline: money paid or still owed for treatment never received (= total − delivered). */
    owedForUndeliveredCents: CentsSchema,
  }),
  payPerPhase: z.object({
    paidCents: CentsSchema,
    deliveredCents: CentsSchema,
    /** Headline: always 0 when the no-prepayment invariant holds. */
    owedForUndeliveredCents: CentsSchema,
  }),
  undeliveredPhaseIds: z.array(PhaseIdSchema),
});
export type ClosureStressTest = z.infer<typeof ClosureStressTestSchema>;

/** Dentist edits (clinic console). The engine re-sizes, re-fits and re-schedules. */
export const NewQuoteLineSchema = z.object({
  description: z.string().min(1),
  code: ProcedureCodeSchema,
  teeth: z.array(FdiToothSchema),
  qty: z.number().int().positive(),
  unitPriceCents: CentsSchema,
});
export type NewQuoteLine = z.infer<typeof NewQuoteLineSchema>;

export const PlanEditSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ADD_LINE"), phaseId: PhaseIdSchema, line: NewQuoteLineSchema }),
  z.object({ kind: z.literal("REMOVE_LINE"), lineId: LineIdSchema }),
  z.object({ kind: z.literal("SET_UNIT_PRICE"), lineId: LineIdSchema, unitPriceCents: CentsSchema }),
]);
export type PlanEdit = z.infer<typeof PlanEditSchema>;

export const PhaseDiffSchema = z.object({
  phaseId: PhaseIdSchema,
  n: z.number().int().positive(),
  amountBeforeCents: CentsSchema,
  amountAfterCents: CentsSchema,
  deltaCents: DeltaCentsSchema,
  fitBefore: FitBandSchema,
  fitAfter: FitBandSchema,
  addedLines: z.array(QuoteLineSchema),
  removedLines: z.array(QuoteLineSchema),
  startBefore: IsoDateSchema,
  startAfter: IsoDateSchema,
});
export type PhaseDiff = z.infer<typeof PhaseDiffSchema>;

export const PlanDiffSchema = z.object({
  planId: PlanIdSchema,
  fromVersion: z.number().int().positive(),
  toVersion: z.number().int().positive(),
  totalBeforeCents: CentsSchema,
  totalAfterCents: CentsSchema,
  totalDeltaCents: DeltaCentsSchema,
  /** Only phases whose amount, lines or dates changed. */
  phases: z.array(PhaseDiffSchema),
});
export type PlanDiff = z.infer<typeof PlanDiffSchema>;
