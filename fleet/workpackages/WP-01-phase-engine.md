---
id: WP-01
title: Build the deterministic phase engine (catalog, phasing, healing-lag schedule, Pay-in-3 sizing, what-if, exposure, closure stress test, plan diff)
deps: []
owns:
  - src/engine/**
  - tests/engine/**
status: todo
hours: 3
criteria: [Technological Implementation, Potential Impact, Best Use of Bryntum]
---

## Goal
`src/engine` is pure, isomorphic TypeScript that runs in both the browser and the server. It is the **only** producer of money (integer EUR cents) and dates (date-only ISO) in the product. It turns an `ExtractionResult` into a phased, sized, scheduled `Plan`. It also validates and applies drag what-ifs, derives payment statuses for the simulated clock, enforces the no-prepayment rule, and computes the exposure meter, the clinic-closure stress test and plan diffs. Everything is covered by unit and property tests.

## Consumes
- `src/contracts/**`: `Plan`, `Phase`, `PhaseDependency`, `BuildPlanInput`, `MoveRequest`, `MoveValidation`, `WhatIfResult`, `HealingWindow`, `OrderEligibility`, `ExposureReport`, `ClosureStressTest`, `PlanEdit`, `PlanDiff`, `PROCEDURE_CATEGORY`, constants (`PAY_IN_3`, `INSTALLMENTS`, `UPCOMING_WINDOW_DAYS`, `OVERDUE_GRACE_DAYS`, `LINKED_LOAN_ILLUSTRATIVE`, `DSCA_SOURCE_URL`).
- `src/contracts/fixtures/implantCase.ts`: the golden extraction and the golden plan (your parity target).
- `src/lib/dates.ts` and `src/lib/money.ts`. Read the date conventions there: endDate is **exclusive**, and lag is measured from the predecessor's endDate.

## Provides
Keep every exported signature in `src/engine/index.ts`; the scaffold stub already shows them. Replace the bodies, and split the code into modules (`catalog.ts`, `phasing.ts`, `schedule.ts`, `fit.ts`, `whatif.ts`, `payments.ts`, `exposure.ts`, `edit.ts`, `diff.ts`) re-exported from `index.ts`:
- `buildPlan(input): Plan`: a draft plan with no approvals and no baseline.
- `validateMove(plan, move, today): MoveValidation`: **synchronous and fast** (<1 ms for 20 phases). Bryntum's `validatorFn` calls it on every drag frame.
- `reschedule(plan, move, today): WhatIfResult`: moves the phase and cascades to successors, and bumps `version`.
- `applyPaymentStatuses(plan, today): { plan, changes }`
- `canCreateOrder(plan, phaseId, today): OrderEligibility`: the server-side no-prepayment invariant. It recomputes the status at `today` instead of trusting the stored one.
- `markDelivered(plan, phaseId, on)`, `computeExposure(plan, today)`, `closureStressTest(plan, today)`.
- `applyEdit(plan, edit, now)`: re-sizes, re-fits and re-schedules, and bumps `version`. `diffPlans(before, after)`.
- `healingWindows(plan)`, `deadlineFor(plan, phaseId)`, `fitFor(amountCents)`, `captureBaseline(plan, now)`.
- Optional extra exports, such as `catalogEntry(code)` and `EngineError`.

## Acceptance criteria
- [ ] `tests/engine/golden.test.ts`: `buildPlan({ extraction: GOLDEN_EXTRACTION, startDate: "2026-11-16", today: "2026-11-16", … })` produces phases deep-equal to `GOLDEN_PLAN.phases`: ids, kinds, titles, lineIds, teeth, dates, dependencies (56/180, 84/180, 14/60 with the same note ids), amounts, fit and payment statuses. If you believe the golden fixture is clinically wrong, file a Contract change request rather than diverging.
- [ ] `tests/engine/whatif.test.ts`: `GOLDEN_DELAY_MOVE` (ph2 → 2027-02-23) shifts ph2, ph3 and ph4 by +42 days, and their dueDates follow. `GOLDEN_ILLEGAL_MOVE` returns `{ok:false, reason:"MIN_LAG", noteId:"HEALING_EXTRACTION_MIN_8W", earliestStartDate:"2027-01-12"}`. Moving ph2 past 2027-05-16 returns a `DeadlineWarning` with `HEALING_EXTRACTION_MAX_6M`. Paid or delivered phases are rejected (`PHASE_PAID` / `PHASE_DELIVERED`). Dates before `today` are rejected (`IN_THE_PAST`). Weekend drops snap to the next Monday.
- [ ] `tests/engine/payments.test.ts`: at 2026-11-16 ph1 is `due` and the rest are `scheduled`. At 2027-01-04 (+7 weeks) ph2 is `upcoming`. At 2027-01-12 it is `due`, and at 2027-01-20 it is `overdue`. Paid milestones never change. `canCreateOrder` returns `NOT_DUE_YET` for an upcoming phase, `{ok:true, amountCents:36000}` for ph1 on its day, `ALREADY_PAID` and `PLAN_NOT_APPROVED`.
- [ ] `tests/engine/exposure.test.ts`: once ph1 is paid and delivered, exposure is paid €360, delivered €360, prepaid €0. `closureStressTest` at 2026-11-16 gives `linkedLoan.owedForUndeliveredCents === 371000` and `payPerPhase.owedForUndeliveredCents === 0`, with `illustrative: true` and `sourceUrl === DSCA_SOURCE_URL`.
- [ ] `tests/engine/edit.test.ts`: applying `GOLDEN_BONE_GRAFT_EDIT` makes ph2 €1,950, still `PAY_IN_3`. The ph2→ph3 min lag becomes 112 days with `BONE_GRAFT_HEALING_16W`, so ph3 and ph4 move later. `diffPlans` reports ph2 `deltaCents: 45000`, the added line `E1`, and the new start dates. Editing a paid phase throws.
- [ ] `tests/engine/properties.test.ts` (fast-check, ≥200 runs each) over random quotes built from the catalog, for implant and aligner cases, plus random moves:
  - every `successor.startDate >= pred.endDate + minLagDays`;
  - successors never move earlier after a delay;
  - Σ phase amounts = Σ line totals = `plan.totalCents`;
  - every phase is ≤ €2,000 unless `fit.band !== "PAY_IN_3"` with a reason, and money is never moved between phases to make one fit;
  - `dueDate === startDate` and `endDate === startDate + durationDays`;
  - paid phases never change dates;
  - `validateMove` and `reschedule` agree: valid moves never produce a min-lag violation.
- [ ] Indivisible single items over €2,000 are tested: ≤ €5,000 gives `INSTALLMENTS` with reason `INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX` and note `INSTALLMENTS_ONLY_REASON`, and more than that gives `PAYPAL_ONLY`. A divisible phase over €2,000 (e.g. 4 implants) splits into "(1/2)" and "(2/2)" visits linked with `minLagDays: 7` and `SPLIT_VISITS_MIN_1W`.
- [ ] No `Date.now()`, `new Date()` without arguments, `Math.random()` or I/O anywhere in `src/engine` (`tests/engine/purity.test.ts` greps the sources).
- [ ] `npm run typecheck && npm test` are green.

## Notes
- **Catalog** (`catalog.ts`): ProcedureCode → { stage per case kind, visit duration (1 day default), per-tooth divisibility, default note ids }.
  - Implant stages, in order: `PREP` (EXAM, CBCT, PANORAMIC_XRAY, HYGIENE, EXTRACTION, SURGICAL_EXTRACTION, FILLING, ROOT_CANAL, OTHER) → `IMPLANT_SURGERY` (IMPLANT, BONE_GRAFT, SINUS_LIFT) → `IMPRESSIONS` (ABUTMENT, DIGITAL_IMPRESSION, TEMPORARY_CROWN) → `PROSTHETIC` (IMPLANT_CROWN, CROWN, OCCLUSAL_ADJUSTMENT, NIGHT_GUARD, REVIEW_XRAY, WHITENING).
  - Aligner: `ORTHO_START` (ORTHO_RECORDS + first ALIGNER_BATCH) → `ALIGNER_BATCH` × k (min 42, max 84 days; notes `ALIGNER_BATCH_MIN_6W`, `ALIGNER_BATCH_MAX_12W`) → `ORTHO_FINISH` (RETAINER; note `RETENTION_AFTER_ORTHO`).
  - Perio: `PERIO_THERAPY` → `PERIO_REEVALUATION` (min 42; `PERIO_REEVAL_MIN_6W`) → then the implant stages (`PERIO_BEFORE_IMPLANT`).
- **Lags.** PREP→IMPLANT_SURGERY is min 56 / max 180 when PREP contains an extraction, otherwise min 7. IMPLANT_SURGERY→IMPRESSIONS is min 84 / max 180, or min 112 when BONE_GRAFT or SINUS_LIFT is in the surgery. IMPRESSIONS→PROSTHETIC is min 14 / max 60. Clinic days are Mon–Fri (`nextClinicDay`).
- **Titles** come from the catalog, deterministic ES/EN, matching the golden fixture's titles.
- Successor start = max over its deps of `pred.endDate + minLagDays`, then `nextClinicDay`. On a reschedule a successor's new start = `max(current start, required)`.
- **Linked loan.** The loan is signed at ph1's start. `monthsElapsed` = whole calendar months from then to today. `repaid = min(financed, monthly × monthsElapsed)`, `outstanding = financed − repaid`, `owedForUndelivered = total − delivered`.
- Need a new NoteId, PhaseKind or field? File a Contract change request below and keep working against the current contracts.
- Gantt (WP-05), patient page (WP-06), chat (WP-11), server (WP-09) and PayPal (WP-04) all import from `@/engine`, so keep it free of Node-only and React imports.

## Contract change requests
_None yet._
