---
id: WP-06
title: Build the patient plan page /p/[planId] (Gantt + phase cards + pay buttons + ledger + approved-note cards + live SSE + simulated-clock badge + redirect return)
deps: []
owns:
  - app/p/**
  - src/components/patient/**
  - src/i18n/patient.ts
  - tests/patient/**
status: merged
hours: 3
criteria: [Design, Presentation, Potential Impact]
---

## Goal
This is the page the patient (and the judge) lives on. Demo beats 2, 3, 6 and 8 happen here. In calm clinical Spanish, with an EN toggle, it shows the plan as a Bryntum Gantt, a card per phase with its date, amount, "within Pay in 3 range" badge, status and the PayPal button (only when due), a ledger "Paid X · received Y", the exposure meter and clinic-closure button, approved-note cards, and the chat. It updates live over SSE: paying turns the diamond green with a ripple, and dragging a phase persists the what-if and reloads.

## Consumes
- `buildPlanView` (WP-09), `PlanViewResponse`, `apiFetch`, the `useDomainEvents` SSE hook, `useLocale`/`useT("patient")`, and `src/lib/ui` (`SimClockBadge`, `ModeBadge`, `StatusPill`, `Card`, `Badge`, Toast).
- `<PlanGantt/>` (WP-05), `<PayPhaseButton/>` and `<PayLaterMessage/>` (WP-04), `reconcileReturn` (WP-04).
- `<ExposureMeter/>` and `<ClinicClosureButton/>` (WP-12), `<PlanChat/>` (WP-11), and `Ripple`/`Reveal` from `src/components/motion` (WP-08).
- API: `GET /api/plans/:id`, `POST /api/plans/:id/whatif`, `GET /api/events` (WP-09).
- **No deps: build against the scaffold stubs.** Every import above already exists as a typed, working stub (Bryntum hello-Gantt, disabled pay button, in-memory store, live SSE bus, stub what-if route), and your tests mock the Gantt, pay and chat modules. Use only the documented props; real behaviour arrives as those WPs merge, and WP-16 checks the integrated page.

## Provides
- `app/p/[planId]/page.tsx` (server-renders the initial view), `app/p/[planId]/return/page.tsx` (redirect reconcile), and `src/components/patient/**`: `PatientPlanView`, `PhaseCard`, `Ledger`, `NoteCard`, `usePlanLive(planId, initial)` (state + SSE + refetch).

## Acceptance criteria
- [ ] The layout is designed for a 1440×900 recording:
  - a header with clinic, patient alias "(ficticio)", `SimClockBadge`, and ModeBadges for any mock or cached integration;
  - the Gantt full-width at the top;
  - phase cards and the ledger below;
  - an impact strip with the exposure meter and the closure button;
  - the chat as a side panel or drawer.
  It is responsive down to tablet width.
- [ ] Director deep-link anchors (WP-14 scrolls to them): the Gantt section has `id="gantt"` and the impact strip has `id="closure"`, so `/p/demo#closure` lands on the closure button. Asserted in `tests/patient/view.test.tsx`.
- [ ] Phase card: title (approved `summary` if present), visit date, amount, fit badge ("Dentro del rango de Paga en 3 (20 €–2.000 €)", never "eligible"), and `StatusPill`.
  - **Only due/overdue phases** render `PayPhaseButton` + `PayLaterMessage`.
  - Upcoming and scheduled phases say "Se paga el día de la visita · {fecha}".
  - Paid phases show "Pagado ✓ · recibido".
- [ ] Ledger: per phase and in total, "Pagado {x} · recibido {y}". With the golden plan after ph1 is paid it reads "Pagado 360,00 € · recibido 360,00 €".
- [ ] Live updates via `useDomainEvents(plan.id)`:
  - `PAYMENT_CAPTURED`, `PHASE_STATUS_CHANGED`, `PLAN_RESCHEDULED`, `PLAN_EDITED`, `PHASE_DELIVERED`, `CLOCK_ADVANCED` and `DEMO_RESET` trigger a refetch, plus `onPaid` from the button;
  - `PAYMENT_CAPTURED` triggers a green ripple on that phase's card;
  - `CHAT_PREVIEW` sets `ghostShifts` on the Gantt, and so does `<PlanChat onGhostPreview/>` (`null` clears them).
- [ ] What-if: `onMoveCommitted` → `POST /api/plans/:id/whatif`. On success, set the plan (the baseline stays) and show a toast built from `result.shifts`, with dates formatted by code (e.g. "Fase 3 y 4 se mueven 6 semanas"). A 409 shows the note card. `onMoveRejected` shows a `NoteCard` with the approved note text and "Aprobado por {approvedBy}".
- [ ] Approved-note cards per phase (only `plan.approvedNotes`). Each has a "Aprobado por Dra. …" chip.
- [ ] `/p/[planId]/return?token=ORDER_ID` calls `reconcileReturn` and redirects to `/p/[planId]`. Test it with `reconcileReturn` mocked.
- [ ] `tests/patient/view.test.tsx` (jsdom, `vi.mock` the Gantt, pay and chat modules):
  - the golden view renders 4 phase cards, and only ph1 has an enabled pay button;
  - the ledger shows 0 €;
  - after a simulated `PAYMENT_CAPTURED` + refetch (mocked `fetch`), ph1 shows paid and the ledger reads 360,00 € / 360,00 €;
  - the EN toggle switches labels.
- [ ] ES/EN parity for `src/i18n/patient.ts` (the global i18n test enforces it).

## Notes
- Never compute money or dates here. Format what the engine and server return.
- Keep the page fast. The Gantt loads client-only and shows a skeleton until then.
- `/p/demo` must work: the store resolves the alias.

## Contract change requests
_None yet._
