---
id: WP-14
title: Polish the demo path (Director Mode hotkeys and beat deep links, story landing page, title/closing cards, trust strip and brand, Playwright smoke of the full demo path in mock mode)
deps: [WP-06, WP-07, WP-10, WP-12]
owns:
  - app/page.tsx
  - app/icon.svg
  - app/demo/**
  - src/components/director/**
  - src/components/brand/**
  - public/brand/**
  - src/i18n/landing.ts
  - tests/e2e/**
  - playwright.config.ts
status: todo
hours: 2.5
criteria: [Presentation, Design, Potential Impact]
---

## Goal
Every video beat is reproducible in one keystroke, and the product reads as a finished product rather than a proof of concept. Director Mode (`?director=1` on any page) gives these hotkeys, all with a labelled simulated clock:
- **R** resets the demo;
- **1–6** jump to beat states and their pages;
- **C** advances the clock 7 weeks;
- **G** runs the agent guard test;
- **H** hides the HUD.

A story landing page carries the hook, the problem with its official source, how it works, and the positioning against rivals. Title and closing cards are recordable pages. A Playwright smoke test walks the whole demo path in mock mode.

## Consumes
- The pages from WP-06 (`/p/demo`) and WP-07 (`/clinic`), `<AgentFeed/>` (WP-10), `<ImpactStrip/>`/`<ClinicClosureButton/>` (WP-12).
- API: `POST /api/demo/reset`, `POST /api/demo/beat`, `POST /api/clock`, `POST /api/agent/guard-test`, `GET /api/health`.
- Constants `TRUST_STRIP_COPY`, `COMPLIANCE_COPY`, `GDPR_COPY`, `DSCA_SOURCE_URL`. `src/lib/ui`, `useT("landing")`, motion primitives (WP-08).
- `<DirectorMode/>` is already mounted in `app/layout.tsx` inside `<Suspense>`. Implement it; don't edit the layout.

## Provides
- `src/components/director/DirectorMode.tsx`: renders only with `?director=1` (persisted in sessionStorage for the tab). It is a small HUD showing the beat, the simulated date, mock and live modes and the key legend, and it shows toasts on actions.
- `app/demo/page.tsx`: the public demo hub, with a beat list and deep links (`/clinic?director=1&beat=1` …), a big public **"Reset demo"** button, and links to the sample PDFs.
- `app/demo/title/page.tsx` (hook cards: the 2020 closure line plus the dsca.gob.es FAQ as text), `app/demo/closing/page.tsx` (compliance + tagline + URL).
- `app/page.tsx` (landing), `src/components/brand/**` (`TrustStrip`, `Wordmark`, `PositioningLine`), `app/icon.svg`.
- `playwright.config.ts` and `tests/e2e/demo-path.spec.ts`.

## Acceptance criteria
- [ ] Beat mapping. Each key calls `POST /api/demo/beat` and then navigates:
  - **1** → `/clinic` (B1);
  - **2** → `/p/demo` (B2);
  - **3** → `/p/demo` (B3);
  - **4** → `/p/demo` (B4; scrolls to the Gantt);
  - **5** → `/clinic` (B5; scrolls to the editor and agent feed);
  - **6** → `/p/demo#closure` (B6).
  **C** = `POST /api/clock {advanceDays:49}`, **G** = guard test, **R** = reset. Keys are ignored while typing in inputs. Unit test with jsdom: a keydown dispatches the right fetch.
- [ ] The landing page (ES default, EN toggle) has:
  - the hook ("En 2020 una de las mayores cadenas dentales de España cerró de la noche a la mañana…") with the source as a text link;
  - "Cómo funciona" in 3 steps (Presupuesto → Fases → Pagas cada fase al recibirla);
  - the positioning line *"Presupuesto previo al tratamiento · ventanas clínicas de cicatrización · pago por fase · 0 € de exposición"*;
  - CTAs to `/demo`, `/clinic`, `/p/demo`;
  - the trust strip and the GDPR line.
  No third-party logos. Calm, premium clinical design.
- [ ] Title and closing cards render full-screen 16:9 on a dark background, sized for recording at 1920×1080. The closing card shows `COMPLIANCE_COPY.en`, the tagline and the hosted URL from `PUBLIC_BASE_URL`.
- [ ] `tests/e2e/demo-path.spec.ts` runs against `FORCE_MOCKS=1` `npm run build && npm start` on port 3100. Use the local chromium via `executablePath` if `npx playwright install` is unavailable. The path:
  1. reset;
  2. `/clinic`: sample → 12 lines → check bar ✓ → create plan → tick notes → approve → patient link visible;
  3. `/p/demo`: pay ph1 with the mock button → ph1 shows paid within 5 s (SSE) → ledger "360,00 €";
  4. what-if via `POST /api/plans/demo/whatif` (the GOLDEN_DELAY_MOVE equivalent) → the Gantt shows ph3 moved, and the parity check compares Bryntum DOM dates to the API's if WP-05 asked for it;
  5. the closure button shows "3.710,00 €" vs "0,00 €";
  6. `/clinic`: the bone-graft preset → the diff "+450,00 €" → the agent feed shows `cancel_sent_invoice`, `create_invoice` and an approval card → Approve → `send_invoice` ✓;
  7. C → ph2 upcoming → the feed shows `send_invoice_reminder`.
  Screenshots are saved on failure.
- [ ] `npm run e2e` passes locally. Document how to run it in the spec header.

## Notes
- Feature freeze is Wed 22:00 CET. After that this WP only fixes things.
- Keep Director Mode out of the way in normal use: no HUD without `?director=1`.

## Contract change requests
_None yet._
