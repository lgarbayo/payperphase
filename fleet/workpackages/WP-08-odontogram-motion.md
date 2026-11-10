---
id: WP-08
title: Build the FDI odontogram SVG with per-tooth treatment marks and staggered reveal, plus shared motion primitives (Reveal, Stagger, Ripple, CountUp)
deps: []
owns:
  - src/components/odontogram/**
  - src/components/motion/**
  - src/i18n/odontogram.ts
  - tests/odontogram/**
  - tests/motion/**
status: todo
hours: 2
criteria: [Design, Presentation]
---

## Goal
This is the "quote builds itself" moment. As extracted lines appear, the matching teeth (36, 37, 46…) light up on a clean FDI odontogram, coloured by procedure category and labelled with their phase number. The same WP ships the small motion vocabulary the rest of the app uses: staggered reveals, the green "paid" ripple, and animated counters.

## Consumes
- Contracts: `FdiTooth`, `PERMANENT_TEETH`, `ProcedureCategory`, `PROCEDURE_CATEGORY`, `QuoteLine`, `Phase`. `useT("odontogram")`, `src/lib/ui`, CSS vars (category colours are the scaffold's `--ppp-cat-*` tokens plus `--ppp-tooth-missing` in `app/globals.css`).
- `framer-motion@12.43.0` (already installed).

## Provides
- `<Odontogram marks highlight revealStaggerMs locale size/>` (keep `OdontogramProps` and `ToothMark` as in the stub) and `marksFromLines(lines, phases?) → ToothMark[]` (stubbed already; WP-07 calls it, so keep the signature).
- `src/components/motion`: `Reveal`, `Stagger`, `Ripple`, `CountUp` (keep the stub signatures). Everything respects `prefers-reduced-motion`.

## Acceptance criteria
- [ ] The SVG has the upper arch 18→11 | 21→28 and the lower arch 48→41 | 31→38, with simple tooth glyphs per type (molar, premolar, canine, incisor), and an optional primary dentition (55–85) behind a prop. It scales cleanly from 320 to 720 px wide.
- [ ] Marks are coloured by category via CSS vars, and the phase number badge sits on the tooth. Missing or extracted teeth have a distinct style (cross or hatch). Implant and crown states are visibly different.
- [ ] Each tooth has an accessible name, e.g. "Pieza 36: extracción (fase 1), implante (fase 2), corona (fase 4)" (ES/EN).
- [ ] `tests/odontogram/marks.test.ts`: `marksFromLines(GOLDEN_LINES, GOLDEN_PLAN.phases)` gives tooth 36 extraction (phase 1), implant (phase 2) and crown (phase 4); tooth 37 a filling (phase 1); tooth 46 implant and crown. Lines without teeth produce no marks.
- [ ] `tests/odontogram/render.test.tsx` (jsdom): renders 32 teeth with `data-tooth`. `highlight` sets `data-highlight` on those teeth. Reduced motion skips the stagger (`matchMedia` mocked).
- [ ] `tests/motion/primitives.test.tsx` (jsdom): `CountUp` shows the final formatted value immediately under reduced motion, and `Ripple` re-triggers when `trigger` changes.
- [ ] Looks calm and clinical at video resolution. Check it with a Playwright screenshot of a tiny local page or Storybook-free harness inside the tests.

## Notes
- No third-party dental icon sets or logos. Draw simple paths yourself.
- Keep the component self-contained: WP-07 drives `highlight` as lines reveal.

## Contract change requests
_None yet._
