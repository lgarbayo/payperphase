/** Pay-in-3 sizing: which PayPal band a phase amount falls in, and the note that explains it. */
import { INSTALLMENTS, PAY_IN_3, type NoteId, type PhaseFit } from "@/contracts";

/**
 * PAY_IN_3 for €20–€2,000. buildPlan only produces a phase above that when it is a single
 * indivisible item (it splits divisible phases), so the reason is INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX
 * up to the installments max (€5,000) and OVER_INSTALLMENTS_MAX beyond it. A dentist edit can take a
 * phase of several items over €2,000 (edits never re-split): pass `singleUnit: false` and it is
 * PAYPAL_ONLY / OVER_PAY_IN_3_MAX, never called indivisible.
 */
export function fitFor(amountCents: number, { singleUnit = true }: { singleUnit?: boolean } = {}): PhaseFit {
  if (amountCents < PAY_IN_3.minCents) return { band: "PAYPAL_ONLY", reason: "BELOW_PAY_IN_3_MIN" };
  if (amountCents <= PAY_IN_3.maxCents) return { band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" };
  if (amountCents > INSTALLMENTS.maxCents) return { band: "PAYPAL_ONLY", reason: "OVER_INSTALLMENTS_MAX" };
  if (!singleUnit) return { band: "PAYPAL_ONLY", reason: "OVER_PAY_IN_3_MAX" };
  return { band: "INSTALLMENTS", reason: "INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX" };
}

/** The payment note shown on a phase for its fit band, if any. */
export function fitNoteId(fit: PhaseFit): NoteId | null {
  if (fit.band === "PAY_IN_3") return "PAY_IN_3_RANGE";
  if (fit.band === "INSTALLMENTS") return "INSTALLMENTS_ONLY_REASON";
  return null;
}
