---
id: WP-12
title: Build the impact visuals (exposure meter "paid for treatment not yet received" and the "What if the clinic closes today?" linked-loan vs PayPerPhase stress test with cited source)
deps: []
owns:
  - src/components/impact/**
  - src/i18n/impact.ts
  - tests/impact/**
status: merged
hours: 1.5
criteria: [Potential Impact, Presentation, Design]
---

## Goal
This WP builds the moment a judge will retell. A meter shows "Pagado por tratamiento aún no recibido: 0 €", and it stays at zero all through the demo. A button "¿Y si la clínica cierra hoy?" opens two counters side by side. One reads "Préstamo vinculado: aún debes 3.710 € por tratamiento que nunca recibiste". The other reads "PayPerPhase: 0 €". The screen explains this in two lines, is labelled *ilustrativo*, and cites the official dsca.gob.es guidance as text, with no logos.

## Consumes
- `ExposureReport`, `ClosureStressTest`, `DSCA_SOURCE_URL`, and `LINKED_LOAN_ILLUSTRATIVE` from contracts. At runtime the values come from engine `computeExposure` / `closureStressTest` through the plan view. **No deps:** the components render props only, and the scaffold engine stub already returns the golden numbers (€3,710 vs €0 after ph1 is delivered). WP-01's exposure test pins the same values for the real engine.
- `CountUp` / `Reveal` from `src/components/motion` (WP-08; the stubs work), `formatCents`, `src/lib/ui`, `useT("impact")`. Load the `dataviz` skill before designing the meter.

## Provides
- `<ExposureMeter report locale/>` and `<ClinicClosureButton stress locale/>` (keep the props). An `<ImpactStrip/>` that composes both is optional; nobody else imports it.

## Acceptance criteria
- [ ] **ExposureMeter:**
  - a big number for `prepaidUndeliveredCents` (green at 0, red above 0);
  - a secondary line "Pagado {paid} · recibido {delivered} · pendiente {remaining}";
  - a slim bar that visually separates paid-and-received from future phases;
  - an accessible text alternative.
- [ ] **ClinicClosureButton:**
  - the click opens an inline panel or modal with two `CountUp` counters (linked loan `owedForUndeliveredCents` vs PayPerPhase `owedForUndeliveredCents`);
  - a list of undelivered phases (ids → the titles passed in, or "Fase n");
  - the "Ilustrativo: préstamo de {months} meses al 0 % que financia todo el presupuesto" note;
  - and "Fuente: dsca.gob.es — preguntas frecuentes sobre tratamientos dentales financiados" linked to `DSCA_SOURCE_URL`.
  It is keyboard accessible, Esc closes it, and `data-testid="closure-panel"` is set.
- [ ] `tests/impact/values.test.tsx` (jsdom): with props from `computeExposure` / `closureStressTest` (`@/engine`) on `GOLDEN_PLAN` with ph1 paid and delivered, the panel shows "3.710,00 €" and "0,00 €" in ES and "€3,710.00" / "€0.00" in EN, contains "Ilustrativo"/"Illustrative" and the DSCA link, and the meter shows 0,00 € and is green. A synthetic report with prepaid > 0 renders the red state.
- [ ] The counters animate in about 1 s (instant under reduced motion), and the layout is readable at 1440×900 for the video.

## Notes
- Every number comes from props, which come from the engine. Never compute money here.
- This WP is impact-critical but small. Spend the remaining time on visual polish, the typography of the two counters, and the copy.

## Contract change requests
_None yet._
