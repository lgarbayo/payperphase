---
id: WP-16
title: Playwright smoke of the full demo path in mock mode (real PDF upload → plan → pay → what-if → closure → bone-graft agent reissue → clock reminder)
deps: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-09, WP-10, WP-12]
owns:
  - tests/e2e/**
  - playwright.config.ts
status: todo
hours: 1.5
criteria: [Presentation, Technological Implementation]
---

## Goal
One command (`npm run e2e`) proves that the integrated demo path works end to end in mock mode, in the order the video records it. This is the integration gate before Gate B and the feature freeze, and the regression net for the night of fixes. Each dep below backs a step this test asserts, so this WP starts only when all of them have merged.

## Consumes
- Pages: `/clinic` (WP-07), `/p/demo` (WP-06) with the real Gantt (WP-05), the mock PayPal button (WP-04), the impact panel (WP-12) and the agent feed (WP-10).
- API (WP-09 unless noted): `POST /api/demo/reset`, `POST /api/demo/beat`, `POST /api/plans/demo/whatif`, `POST /api/clock`, `GET /api/plans/demo`; `POST /api/extract` (WP-03) with the real hero PDF `public/samples/presupuesto-implantes-ribera.pdf` (WP-02), resolved by sha256 to the cached golden extraction (needs WP-01 for the real plan).
- DOM hooks the owners already promise: `data-testid` values `pay-phase`, `phase-card-{id}`, `plan-gantt`, `closure-button`, `closure-panel`, `agent-feed`, `exposure-meter`; anchors `#gantt`, `#closure`, `#plan-editor`, `#agent-feed`.
- `@playwright/test@1.56.1` (installed). Use the local chromium via `executablePath` if `npx playwright install` is unavailable.

## Provides
- `playwright.config.ts`: a `webServer` that runs `npm run build && npm start` with `FORCE_MOCKS=1`, a fresh temp `DATA_DIR`, and `PORT=$E2E_PORT` (default 3100; pick a free port when it is taken, because builders never assume fixed ports). Traces and screenshots on failure.
- `tests/e2e/demo-path.spec.ts`, with a header comment explaining how to run it.

## Acceptance criteria
- [ ] `tests/e2e/demo-path.spec.ts` walks the path:
  1. `POST /api/demo/reset`;
  2. `/clinic`: upload the hero PDF through the dropzone's file input → 12 lines → check bar ✓ with "1 a revisar" → create plan → tick notes → approve → patient link and QR visible;
  3. `/p/demo`: pay ph1 with the mock button → ph1 shows paid within 5 s (SSE) → ledger "360,00 €" and exposure meter "0,00 €";
  4. what-if via `POST /api/plans/demo/whatif` (`GOLDEN_DELAY_MOVE` equivalent) → after reload the Gantt shows ph3 moved, and the baseline ghost is still present. If WP-05 filed a parity request, compare Bryntum DOM dates to the API's;
  5. the closure button shows "3.710,00 €" vs "0,00 €" and the DSCA link;
  6. `POST /api/demo/beat {beat:"B5_AGENT_READY"}`. Step 4 persisted a 6-week delay of ph2, so without this step 7 could never see ph2 `upcoming` at +7 weeks; the video records beat 7 from B5 too. Then `/clinic`: the bone-graft preset → the diff "+450,00 €" → the agent feed shows `cancel_sent_invoice`, `create_invoice` and an approval card → Approve → `send_invoice` ✓;
  7. `POST /api/clock {advanceDays:49}` → ph2 shows upcoming → the feed shows `send_invoice_reminder`.
- [ ] `npm run e2e` passes locally twice in a row (state is reset at the start, so the run is order-independent and re-runnable).
- [ ] The run takes under 3 minutes and never touches a live PayPal or Anthropic endpoint (`FORCE_MOCKS=1`; assert `GET /api/health` modes are mock).

## Notes
- Reset and the clock are driven through the API, not the Director hotkeys. WP-14 unit-tests the hotkeys, so this smoke does not depend on WP-14.
- If a step fails because of another WP's bug, don't edit that WP's files. File it under Contract change requests with the failing step and the screenshot path (the integrator routes it), and mark the step `test.fixme` with the reason, so the rest of the path keeps running.
- Don't add `tests/e2e` to Vitest: `vitest.config.ts` already excludes it.

## Contract change requests
_None yet._
