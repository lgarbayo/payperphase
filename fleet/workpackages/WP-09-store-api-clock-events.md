---
id: WP-09
title: Build the plan store (JSON file), plan/what-if/approve/edit/deliver API, simulated clock with status transitions, event bus + SSE, demo reset and Director beats
deps: []
owns:
  - src/server/**
  - app/api/plans/**
  - app/api/clock/**
  - app/api/events/**
  - app/api/demo/**
  - tests/server/**
status: todo
hours: 2.5
criteria: [Technological Implementation, Presentation]
---

## Goal
This is the runtime backbone. It covers:
- a durable JSON store at `DATA_DIR/db.json`, seeded on boot and atomically written;
- the plan API (list, view, create, approve, what-if, edit, deliver);
- the labelled simulated clock, which re-derives payment statuses and emits transitions;
- the in-process event bus streamed over SSE;
- a public demo reset, plus Director Mode beat states so every video beat is reproducible.

## Consumes
- Contracts: `PlanStore`, `SimClock`, `DemoBeat`, `DomainEvent(Input)`, `PlanViewResponse`, `CreatePlanRequest`, `ApprovePlanRequest`, `WhatIfRequest/Response`, `EditPlanRequest/Response`, `ClockRequest/Response`, `DemoBeatRequestSchema`, `DemoResponse`, `HERO_PLAN_ALIAS`, `SIM_DEFAULT_START`.
- Engine (WP-01; the stub works): `buildPlan`, `validateMove`, `reschedule`, `applyPaymentStatuses`, `markDelivered`, `applyEdit`, `diffPlans`, `captureBaseline`, `computeExposure`, `closureStressTest`.
- `@data/seed` (`seedCases`, `NOTE_LIBRARY`; WP-02, the stub works), `explainDiff` from `@/ai/wording` (WP-03; the stub works), `src/env.ts`, `src/lib/http.ts`.

## Provides
- `src/server/store.ts` exporting `store: PlanStore`, `src/server/events.ts` (`publish`, `subscribe`, `setEventSimToday`), `src/server/boot.ts` (`boot()`, called by `/instrumentation.ts`), `src/server/views.ts` (`buildPlanView`). Keep the exported names.
- Routes:
  - `GET/POST /api/plans`, `GET /api/plans/[id]` (`?view=patient|clinic`; id may be `demo`);
  - `POST /api/plans/[id]/approve`, `POST /api/plans/[id]/whatif`, `POST /api/plans/[id]/edit`, `POST /api/plans/[id]/phases/[phaseId]/deliver`;
  - `GET/POST /api/clock`, `GET /api/events` (SSE), `POST /api/demo/reset`, `POST /api/demo/beat`.
- Every one of these routes already has a typed stub (approve, edit, deliver and beat included) that WP-06, WP-07, WP-10 and WP-14 build against. Replace the bodies, and keep the paths, request schemas and response shapes.

## Acceptance criteria
- [ ] `tests/server/store.test.ts` (tmp `DATA_DIR`):
  - Round-trip persistence works, and writes are atomic (temp file + rename) and serialized (a promise queue, so concurrent `updatePlan` calls never lose writes).
  - A corrupt or invalid `db.json` (validated with `PlanSchema`) reseeds.
  - The `demo` alias resolves to the hero plan.
  - `recordWebhookEvent` returns false on a duplicate event id.
  - Agent steps and approvals round-trip.
- [ ] Boot seeds state **B2** when no db exists: the hero plan is approved, the clock is `SIM_START_DATE`, and ph1 is due. `resetDemo()` re-ids the hero plan with a fresh `pln_` + 8 random chars, giving a new `plan4` and therefore unique PayPal invoice numbers. It clears agent steps, approvals and webhook records and publishes `DEMO_RESET`. Tested.
- [ ] `tests/server/clock.test.ts`: `POST /api/clock {advanceDays:49}` sets 2027-01-04 and calls `engine.applyPaymentStatuses` for every plan. It persists the result, publishes one `PHASE_STATUS_CHANGED` per returned change, then `CLOCK_ADVANCED`, and updates `setEventSimToday`. Mock `@/engine` with `vi.mock` so this test does not depend on WP-01's merge.
- [ ] `tests/server/routes.test.ts` (calling the route handlers directly with `Request` objects; `vi.mock("@/engine")` wherever an assertion depends on engine behaviour, for example the invalid move → 409, because the scaffold stub accepts every move):
  - **whatif** returns 409 with the validation on an invalid move. A valid move persists when `persist !== false`, publishes `PLAN_RESCHEDULED`, and keeps `baseline` untouched. `persist:false` returns a preview without saving.
  - **approve** sets `status:"approved"`, `approvedNotes` (with `noteVersion` from the library), `approvedBy`/`approvedAt`, phase `summary` texts and the `captureBaseline`. It applies statuses, makes the plan the hero if it is an implant case, and publishes `PLAN_APPROVED`.
  - **edit** runs `engine.applyEdit` + `diffPlans` + `explainDiff`, saves, publishes `PLAN_EDITED {diff}` and returns `EditPlanResponse`.
  - **deliver** calls `markDelivered` and publishes `PHASE_DELIVERED`.
  - **create** builds a draft from a stored extraction.
- [ ] `GET /api/events` streams `data: <DomainEvent>` frames filtered by `planId` (events without a planId always pass), sends a heartbeat every 15 s, and cleans up on abort. A test reads the first frames from the `ReadableStream`.
- [ ] `POST /api/demo/beat {beat}` implements every `DemoBeat` (see `src/contracts/server.ts`):
  - **B1:** no hero plan; the clinic console starts empty, with the seeded quote extraction available.
  - **B2:** the hero plan is approved.
  - **B3–B6:** as B2, plus ph1 is paid and delivered with mock capture ids. The clock is at `SIM_START_DATE` and the original dates are kept.
  B2–B6 publish `PLAN_APPROVED` after persisting, so the agent (idempotently) issues the phase invoices that beat 5 needs. Each beat is tested for the resulting hero state.
- [ ] All route bodies are validated with the contract schemas, and errors use `{error:{code,message}}` (`src/lib/http.ts`).

## Notes
- `store` is a module singleton on `globalThis` so it survives Next dev HMR. Keep the `PlanStore` interface; if you need more methods, add them to the implementation and file a Contract change request for the interface.
- Set `updatedAt` (wall clock, `nowIso()`) on every save. Plan `version` is bumped by the engine on reschedule and edit.
- The hero alias makes `/p/demo` stable across resets for Director Mode and the README.
- The agent (WP-10) reacts to the events you publish, so publish *after* persisting.

## Contract change requests
_None yet._
