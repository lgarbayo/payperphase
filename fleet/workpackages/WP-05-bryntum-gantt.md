---
id: WP-05
title: Build the Bryntum clinical Gantt (phases, hatched healing windows, lagged dependencies, PayPal-status payment milestones, baseline ghost, simulated today, deadline, drag with engine validation and snap-back)
deps: []
owns:
  - src/components/gantt/**
  - app/(dev)/gantt-lab/**
  - src/i18n/gantt.ts
  - tests/gantt/**
status: todo
hours: 3
criteria: [Best Use of Bryntum, Design, Technological Implementation]
---

## Goal
`<PlanGantt/>` is the hero visual and the main Bryntum-prize evidence. It shows the clinical plan with real dependency arrows, hatched healing windows, a payment diamond per phase coloured by PayPal status, the approved plan as a baseline ghost, a labelled simulated-today line, and a red deadline when a max healing window is exceeded. In patient mode it lets the patient drag future unpaid phases. **Bryntum never computes dates.** Phase tasks are `manuallyScheduled`. The drag `validatorFn` calls `engine.validateMove` synchronously, and a drop previews `engine.reschedule` and then hands the move to the parent, which persists it through the API.

## Consumes
- `PlanGanttProps` in `src/components/gantt/types.ts` (you own it; keep the existing props backward compatible).
- Engine (WP-01; the stub works): `validateMove`, `reschedule`, `healingWindows`, `deadlineFor`.
- `src/lib/dates.ts` (`toLocalDate` / `fromLocalDate` are the only Date bridge), `src/lib/money.ts`, `src/lib/ui/status.ts` (`STATUS_COLOR_VAR`, `STATUS_LABEL`), `useT("gantt")`, the golden fixtures.
- Installed Bryntum 7.3.8: read `node_modules/@bryntum/gantt/CLAUDE.md` and `AGENTS.md`, and verify every config, feature and event name against `node_modules/@bryntum/gantt/gantt.d.ts` (or the Bryntum MCP server). Don't write the API from memory.

## Provides
- `<PlanGantt {...PlanGanttProps}/>` (client-only via `next/dynamic` with `ssr:false`, as in the stub).
- A pure mapping module `toBryntum.ts`: `planToBryntum(plan, opts) → { tasksData, dependenciesData, timeRangesData, … }`, exported for tests and for the parity check.
- `/gantt-lab`: the golden plan with knobs for today, mode, ghost shifts, locale and a paid ph1. This is also the Gate A smoke page on Render.

## Acceptance criteria
- [ ] Rows per phase. The **visit task** is coloured by `payment.status` through the shared CSS vars. There is a **payment milestone** (diamond) at `dueDate` with an amount label. For each dependency there is a **healing task** from `pred.endDate` to `phase.startDate`: the min part is hatched (CSS repeating-linear-gradient on `--ppp-healing`) and its tooltip shows the clinician note title. Dependency arrows are drawn with their lags. Columns: name, amount (`formatCents`), status pill, "Rango Paga en 3" band chip.
- [ ] **Baselines:** `plan.baseline` renders as a ghost under the bars and stays visible after what-ifs. **TimeRanges:** a "Hoy (simulado)" line at `today`. **Deadline:** `deadlineFor` is rendered with Bryntum's deadline support if 7.3.8 has it (check the d.ts), otherwise as an indicator plus a red bar state when a `DeadlineWarning` exists. **Indicators:** the due date on each visit task.
- [ ] **Drag (patient mode only)** is allowed only for future, unpaid, undelivered visit tasks; resizing, the task editor and cell editing are off.
  - `validatorFn` → `engine.validateMove`. When invalid, return Bryntum's invalid result with the approved note text as the message, so the drop snaps back, and call `onMoveRejected({phaseId, noteId, earliestStartDate})`.
  - A valid drop runs `engine.reschedule` to preview successors moving instantly, then calls `onMoveCommitted(move)`.
  - When the parent passes a new `plan`, the chart updates in place with animation, keeping the baseline.
- [ ] **taskMenu:** "Pagar esta fase" (only when `due`/`overdue`) → `onPayPhase(phaseId)`, and "¿Y si lo retraso?" → `onAskDelay(phaseId)`. `ghostShifts` draw as translucent ghost bars.
- [ ] ES/EN: Bryntum locale plus `src/i18n/gantt.ts` follow `useLocale()`.
- [ ] `tests/gantt/toBryntum.test.ts`:
  - The golden plan maps to 4 visit tasks, 4 payment milestones and 3 healing tasks.
  - Phase dependencies are visit→visit with the engine's lag (or healing tasks chained with zero lag; pick one and test it).
  - Every task has `manuallyScheduled:true`.
  - Status CSS classes follow `payment.status`, and baseline dates equal `plan.baseline`.
- [ ] `tests/gantt/validator.test.ts`: the validator wrapper on `GOLDEN_ILLEGAL_MOVE` returns invalid with the `HEALING_EXTRACTION_MIN_8W` note text and triggers `onMoveRejected`. `GOLDEN_DELAY_MOVE` is valid and the preview shifts ph3 and ph4. `vi.mock("@/engine")` with the documented results (`{ok:false, reason:"MIN_LAG", noteId:"HEALING_EXTRACTION_MIN_8W", earliestStartDate:"2027-01-12"}` for the illegal move, and a +42-day cascade for the delay). The test covers the wrapper, the scaffold engine stub accepts every move, and this WP has no deps.
- [ ] `tests/gantt/parity.test.ts`: build a Bryntum `ProjectModel` (jsdom) from `planToBryntum(GOLDEN_PLAN)` and from the delayed plan, `await project.commitAsync()`, and assert each task's start and end (via `fromLocalDate`) equal the engine's dates. If `ProjectModel` cannot load under jsdom, assert on the mapping, explain why in the test, and add a Playwright parity check request to WP-16 under Contract change requests.
- [ ] Visually checked at 1440×900 in `/gantt-lab` (screenshot via Playwright with the local chromium). Calm clinical look, readable at video resolution, no layout collapse. The parent passes `height`.

## Notes
- Use the shared CSS variables, not raw hex. The theme file is `svalbard-light.css`; switch only if another light theme looks calmer, and say so in the PR.
- Healing modelling suggestion: a parent row per phase with children (healing task, visit task, payment milestone), all `manuallyScheduled`. Phase-to-phase dependency arrows go between visit tasks. Keep the patient view uncluttered: if three rows per phase is too busy, render the healing window inside the phase row with a custom `taskRenderer`.
- Keep `GanttInner.tsx` the only module importing `@bryntum/*`, so SSR never touches it.
- Performance: the validator runs on every drag frame, so don't clone the plan per frame. Cache a lightweight index.

## Contract change requests
_None yet._
