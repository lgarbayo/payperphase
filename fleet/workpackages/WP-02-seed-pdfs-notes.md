---
id: WP-02
title: Generate synthetic Spanish presupuesto PDFs matching the golden fixtures, seed cases (implant hero + aligner batches, optional perio), and the reviewed ES/EN clinician note library
deps: [WP-01]
owns:
  - scripts/pdfs/**
  - public/samples/**
  - data/seed/**
  - tests/seed/**
status: todo
hours: 2
criteria: [Potential Impact, Presentation, Design]
---

## Goal
Realistic but clearly synthetic Spanish quotes exist as PDFs the clinic can drag in, and they match the golden extraction exactly. They are generated deterministically, so their sha256 keys WP-03's cached fallback. The store seeds from `seedCases()`: the hero implant plan plus an aligner case whose milestones are aligner batches, all built by the real engine. The clinician note library is reviewed: plain language, no dosages, no prices.

## Consumes
- Engine (`buildPlan`, `captureBaseline`, `applyPaymentStatuses`) from WP-01, which must be merged first.
- Contracts: `RawExtraction`, `ExtractionResult`, `Plan`, `NoteId`, `ClinicalNote`, `SIM_DEFAULT_START`. Golden fixtures in `src/contracts/fixtures/implantCase.ts`.
- `pdf-lib@1.17.1` (installed). The `npm run pdfs` script already runs `tsx scripts/pdfs/generate.ts`.

## Provides
- `scripts/pdfs/generate.ts` → `public/samples/presupuesto-implantes-ribera.pdf` (hero), `public/samples/presupuesto-ortodoncia-ribera.pdf` (aligner), and optionally `public/samples/presupuesto-perio-implantes.pdf`.
- `data/seed/samples.ts`: `SAMPLE_PDFS` with `{ id, caseKind, label, path, sha256 }`, re-exported from `data/seed/index.ts`, plus a `cachedExtractionBySha(sha)` helper for WP-03.
- `data/seed/alignerCase.ts` (raw + extraction fixture), the optional `data/seed/perioCase.ts`, and `seedCases()` returning approved plans built with `buildPlan`, keeping the `SeedCase` shape.
- `data/seed/notes.ts`: the reviewed `NOTE_LIBRARY`, with every `NoteId` in ES and EN.

## Acceptance criteria
- [ ] The hero PDF prints exactly the `GOLDEN_RAW_EXTRACTION` content:
  - header: Clínica Dental Ribera, a fictitious NIF and address in Valencia, "Presupuesto PRES-2026-0142", date 12/11/2026;
  - patient "María García (paciente ficticia)";
  - a table with Nº / Descripción / Pieza(s) FDI / Cant. / Precio unit. / Importe for the 12 lines;
  - "TOTAL 4.070,00 €" and "Exento de IVA (art. 20.Uno.3º LIVA)";
  - the signature line "Dra. Lucía Ruiz · Nº colegiado ficticio";
  - a footer "Documento ficticio generado para una demostración · datos sintéticos".
  It looks like a real clinic quote (A4, clean typography, a subtle accent colour), with no real logos.
- [ ] `tests/seed/pdfs.test.ts`: generating twice produces byte-identical files (fixed creation and modification dates, producer and ID), and the sha256 matches `SAMPLE_PDFS`.
- [ ] The aligner case is synthetic "Ortodoncia invisible": records, 4 aligner batches, retainer, about €3.6k. Every batch milestone is within Pay in 3, and batch dependencies are min 42 / max 84 days. `tests/seed/cases.test.ts` validates every seed plan with `PlanSchema` and checks Σ phases = Σ lines = total and min lags respected. The seeded hero plan must equal `GOLDEN_PLAN` except for re-id and timestamps.
- [ ] Optional perio case (cut #3): it contains one indivisible item over €2,000, flagged `INSTALLMENTS` with reason `INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX` and note `INSTALLMENTS_ONLY_REASON`. Skip it if time is short.
- [ ] `tests/seed/notes.test.ts`: every `NoteId` has non-empty ES and EN `title` and `text`, with no `€`, no "mg", and no price-like numbers. Each note is at most 240 characters per language.
- [ ] `npm run pdfs` regenerates everything, and the PDFs are committed under `public/samples/`.

## Notes
- Everything is synthetic. Say so on the PDF itself (footer) and in the sample labels. No real clinic names, addresses or registration numbers.
- WP-03 (extraction) uses `SAMPLE_PDFS[].sha256` for its cached fallback. WP-07 offers the samples as "Probar con un ejemplo".
- Keep note texts short; the Gantt snap-back card and the chat citations show them verbatim.

## Contract change requests
_None yet._
