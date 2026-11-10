import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

export const LocaleSchema = z.enum(["es", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const LocalizedTextSchema = z.object({ es: z.string(), en: z.string() });
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Date-only ISO "YYYY-MM-DD" (see src/lib/dates.ts for conventions). */
export const IsoDateSchema = z.string().refine(isIsoDate, { message: "Expected YYYY-MM-DD" });
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Full ISO timestamp for audit fields (createdAt, paidAt …). Real wall-clock time. */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Integer EUR cents, >= 0. */
export const CentsSchema = z.number().int().nonnegative();
export type Cents = z.infer<typeof CentsSchema>;

/** Signed cents (diffs). */
export const DeltaCentsSchema = z.number().int();

/** FDI two-digit tooth numbers: permanent 11–48, primary 51–85. */
export function isValidFdi(n: number): boolean {
  if (!Number.isInteger(n)) return false;
  const q = Math.floor(n / 10);
  const t = n % 10;
  if (q >= 1 && q <= 4) return t >= 1 && t <= 8;
  if (q >= 5 && q <= 8) return t >= 1 && t <= 5;
  return false;
}
export const FdiToothSchema = z.number().int().refine(isValidFdi, { message: "Invalid FDI tooth number" });
export type FdiTooth = z.infer<typeof FdiToothSchema>;

export const PERMANENT_TEETH: readonly FdiTooth[] = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

/** "pln_" + 8 lowercase alphanumerics, e.g. pln_ribera01. */
export const PlanIdSchema = z.string().regex(/^pln_[a-z0-9]{8}$/);
export type PlanId = z.infer<typeof PlanIdSchema>;

/** "ph" + 1-based phase order, e.g. ph1. Stable across reschedules; re-numbered only by buildPlan. */
export const PhaseIdSchema = z.string().regex(/^ph[1-9][0-9]?$/);
export type PhaseId = z.infer<typeof PhaseIdSchema>;

/** Quote line id, e.g. L1 (extracted) or E1 (added by the clinic editor). */
export const LineIdSchema = z.string().regex(/^[LE][1-9][0-9]*$/);
export type LineId = z.infer<typeof LineIdSchema>;

export const CaseKindSchema = z.enum(["implant", "aligner", "perio"]);
export type CaseKind = z.infer<typeof CaseKindSchema>;
