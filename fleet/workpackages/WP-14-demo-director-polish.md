---
id: WP-14
title: Polish the demo path (Director Mode hotkeys and beat deep links, demo hub with public Reset, story landing page, hook/title/closing cards, trust strip and brand)
deps: []
owns:
  - app/page.tsx
  - app/icon.svg
  - app/demo/**
  - src/components/director/**
  - src/components/brand/**
  - public/brand/**
  - src/i18n/landing.ts
  - tests/director/**
  - tests/landing/**
status: todo
hours: 2
criteria: [Presentation, Design, Potential Impact]
---

## Goal
Every video beat is reproducible in one keystroke, and the product reads as a finished product rather than a proof of concept. Director Mode (`?director=1` on any page) gives these hotkeys, all with a labelled simulated clock:
- **R** resets the demo;
- **1–6** jump to beat states and their pages;
- **C** advances the clock 7 weeks;
- **G** runs the agent guard test;
- **H** hides the HUD.

A story landing page carries the hook, the problem with its official source, how it works, and the positioning against rivals. The hook, title and closing cards are recordable pages. (The Playwright smoke of the whole demo path is WP-16.)

## Consumes
- **No deps.** Everything here talks to the API by URL or uses scaffold stubs: `POST /api/demo/reset`, `POST /api/demo/beat`, `POST /api/clock`, `POST /api/agent/guard-test` and `GET /api/health` all exist as typed stubs today (WP-09, WP-10 and WP-13 replace the bodies). The pages `/p/demo` (WP-06) and `/clinic` (WP-07) are navigation targets only.
- Deep-link anchors provided by the page owners: `/p/demo#gantt` and `/p/demo#closure` (WP-06), and `/clinic#plan-editor` and `/clinic#agent-feed` (WP-07).
- Constants `TRUST_STRIP_COPY`, `COMPLIANCE_COPY`, `GDPR_COPY`, `DSCA_SOURCE_URL`, `PUBLIC_BASE_URL` via `publicEnv()`/`serverEnv()`. `SAMPLE_PDFS` from `@data/seed` (links to the sample PDFs). `src/lib/ui`, `useT("landing")`, and the motion primitives (WP-08; stubs work).
- `<DirectorMode/>` is already mounted in `app/layout.tsx` inside `<Suspense>`. Implement it; don't edit the layout. The scaffold's `app/demo/page.tsx` also renders `<DirectorMode/>`, so remove that second copy to avoid two HUDs.
- `<TrustStrip locale/>` is consumed by WP-07 (under the clinic Gantt). Keep its props.

## Provides
- `src/components/director/DirectorMode.tsx`: renders only with `?director=1` (persisted in sessionStorage for the tab). It is a small HUD showing the beat, the simulated date, mock and live modes and the key legend, and it shows toasts on actions.
- `app/demo/page.tsx`: the public demo hub, with a beat list and deep links (`/clinic?director=1&beat=1` …), a big public **"Reset demo"** button, and links to the sample PDFs.
- `app/demo/title/page.tsx`: the beat-1 hook cards (the 2020 closure line plus the dsca.gob.es FAQ as text), then the beat-2 title card ("PayPerPhase: paga tu tratamiento dental fase a fase, a medida que lo recibes. Nunca por adelantado." / EN) with the `PositioningLine` underneath. Advance with → or space.
- `app/demo/closing/page.tsx`: compliance + tagline + URL.
- `app/page.tsx` (landing), `src/components/brand/**` (`TrustStrip`, `Wordmark`, `PositioningLine`), `app/icon.svg`.

## Acceptance criteria
- [ ] Beat mapping. Each key calls `POST /api/demo/beat` and then navigates:
  - **1** → `/clinic` (B1);
  - **2** → `/p/demo` (B2);
  - **3** → `/p/demo` (B3);
  - **4** → `/p/demo#gantt` (B4);
  - **5** → `/clinic#plan-editor` (B5; the agent feed `#agent-feed` sits next to it);
  - **6** → `/p/demo#closure` (B6).
  **C** = `POST /api/clock {advanceDays:49}`, **G** = `POST /api/agent/guard-test {planId:"demo"}`, **R** = `POST /api/demo/reset`. Keys are ignored while typing in inputs, and nothing renders or listens without `?director=1`. `tests/director/hotkeys.test.tsx` (jsdom, mocked `fetch` and router): each keydown dispatches the right request body and navigation, and keys inside an `<input>` do nothing.
- [ ] The landing page (ES default, EN toggle) has:
  - the hook ("En 2020 una de las mayores cadenas dentales de España cerró de la noche a la mañana…") with the source as a text link to `DSCA_SOURCE_URL`;
  - "Cómo funciona" in 3 steps (Presupuesto → Fases → Pagas cada fase al recibirla);
  - the positioning line *"Presupuesto previo al tratamiento · ventanas clínicas de cicatrización · pago por fase · 0 € de exposición"*;
  - CTAs to `/demo`, `/clinic`, `/p/demo`;
  - the trust strip and the GDPR line.
  No third-party logos. Calm, premium clinical design. `tests/landing/landing.test.tsx` (jsdom) asserts the hook, the DSCA link, the positioning line, the three CTAs, the trust strip and the GDPR line in ES and EN.
- [ ] The hook, title and closing cards render full-screen 16:9 on a dark background, sized for recording at 1920×1080. The root layout (scaffold-owned) wraps every page with the header and compliance footer, so render the cards as a `fixed inset-0` overlay above the shell instead of editing the layout. The closing card shows `COMPLIANCE_COPY.en`, the tagline and the hosted URL from `PUBLIC_BASE_URL`. `tests/landing/cards.test.tsx` asserts the closing card's compliance text and URL, and the title card's positioning line.
- [ ] `/demo` has a public "Reset demo" button that calls `POST /api/demo/reset` and confirms with a toast (covered in `tests/director/hotkeys.test.tsx` or its own test).

## Notes
- Feature freeze is Wed 22:00 CET. After that this WP only fixes things.
- Keep Director Mode out of the way in normal use: no HUD without `?director=1`.
- Beat states come from `POST /api/demo/beat`. Until WP-09 merges, the stub just reseeds, which is enough for the hotkey tests.

## Contract change requests
_None yet._
