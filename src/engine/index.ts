/**
 * Deterministic phase engine — pure, isomorphic TypeScript (runs in browser + server).
 * The ONLY producer of money (integer EUR cents) and dates (IsoDate). No I/O, no clock, no randomness.
 *
 * Modules:
 *   catalog   ProcedureCode → stage per case kind, divisibility, notes; stage order, lag rules, titles
 *   phasing   quote → stage groups → Pay-in-3-sized visits → scheduled draft plan (buildPlan)
 *   schedule  healing-lag cascade, deadlines, healing windows, baseline
 *   fit       Pay in 3 / installments / PayPal-only band per amount
 *   whatif    validateMove (Gantt validatorFn, sync) and reschedule
 *   payments  milestone statuses on the simulated clock, no-prepayment invariant, delivery
 *   exposure  "paid for treatment not yet received" meter and clinic-closure stress test
 *   edit      dentist edits → new plan version
 *   diff      plan diff for the clinic panel, the agent and the wording
 */
export { buildPlan, lineUnits, packUnits, phaseNoteIds } from "./phasing";
export { validateMove, reschedule, snapToClinicDay, delayedStart } from "./whatif";
export {
  applyPaymentStatuses,
  canCreateOrder,
  markDelivered,
  paymentStatusAt,
  type StatusChange,
} from "./payments";
export { computeExposure, closureStressTest, wholeMonthsBetween } from "./exposure";
export { applyEdit } from "./edit";
export { diffPlans } from "./diff";
export { healingWindows, deadlineFor, deadlineWarnings, captureBaseline, topoOrder } from "./schedule";
export { fitFor, fitNoteId } from "./fit";
export {
  CATALOG,
  STAGE_ORDER,
  catalogEntry,
  stageFor,
  lagRule,
  stageTitle,
  type CatalogEntry,
  type LagRule,
} from "./catalog";
export { EngineError, type EngineErrorCode } from "./errors";
