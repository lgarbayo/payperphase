---
id: WP-07
title: Build the clinic console /clinic (PDF dropzone, staggered extraction reveal with odontogram + check bar, phase review and note approval, approve & send link/QR, plan editor with plain-language diff, agent feed, payments overview)
deps: []
owns:
  - app/clinic/**
  - src/components/clinic/**
  - src/i18n/clinic.ts
  - tests/clinic/**
status: merged
hours: 3
criteria: [Design, Technological Implementation, Presentation]
---

## Goal
This is the clinic's side of the demo (beats 1 and 5). A dentist drops a presupuesto or picks a sample. The extracted lines reveal one by one while the matching teeth light up on the odontogram, and a check bar confirms "Σ líneas = total impreso ✓ · 0 piezas inválidas · 1 a revisar". "Crear plan" assembles the phased Gantt with fit badges and the trust strip. The dentist reviews the phases, ticks the approved notes (and optionally the wording drafts), and clicks "Aprobar y enviar al paciente", which shows the patient link and QR plus the list of invoices the agent will issue. Later the dentist adds a bone graft, sees a plain-language diff, and watches the agent feed reissue the invoice and wait for an Approve click.

## Consumes
- API: `POST /api/extract` (WP-03), `POST /api/wording` (WP-03), `POST /api/plans`, `GET /api/plans`, `GET /api/plans/:id?view=clinic`, `POST /api/plans/:id/approve`, `POST /api/plans/:id/edit`, `POST /api/plans/:id/phases/:phaseId/deliver` (all WP-09).
- `<Odontogram/>` + `marksFromLines` (WP-08), `<PlanGantt mode="clinic"/>` (WP-05), `<AgentFeed/>` (WP-10), `<TrustStrip/>` (WP-14), and `Stagger`/`Reveal` (WP-08).
- **No deps: build against the scaffold stubs.** Every route above already has a typed stub that works on the in-memory store: extract returns the cached golden extraction, create, approve, edit and deliver persist and publish, and wording returns deterministic drafts. Every component has a stub too. Your tests mock `fetch` and the child components. `marksFromLines` is stubbed too: it returns one planned mark per tooth until WP-08 merges. WP-16 checks the integrated console.
- `SAMPLE_PDFS` (`@data/seed`), `GOLDEN_BONE_GRAFT_EDIT`, `formatInvoiceNumber`, `qrcode` (installed), `useDomainEvents`, `src/lib/ui`, `useT("clinic")`.

## Provides
- `app/clinic/page.tsx` and `src/components/clinic/**`: `ClinicConsole`, `QuoteDropzone`, `ExtractionReveal`, `CheckBar`, `PhaseReview`, `NoteApproval`, `SendToPatient`, `PlanEditor`, `DiffPanel`, `PaymentsOverview`.

## Acceptance criteria
- [ ] **Dropzone:** drag and drop or a file picker (PDF only, ≤10 MB), plus "Probar con un ejemplo" buttons from `SAMPLE_PDFS` (`{sampleId}`). It shows a calm loading state during extraction and a `ModeBadge mode="cached"` when `extraction.source !== "live"`.
- [ ] **Reveal:** lines appear with a ~120 ms stagger, showing description, FDI tooth chips, qty, unit price, total, a confidence dot and issue flags. Each revealed line pulses its teeth on the odontogram (`highlight`) and adds marks.
- [ ] **Check bar:** shows `checks.sumMatches` ✓/✗ with both totals, the invalid-teeth count and the to-review count. Clicking "a revisar" scrolls to the flagged lines.
- [ ] "Crear plan" → `POST /api/plans {quoteId}` → the Gantt assembles (clinic mode) and phase review cards appear (amount, fit badge, visit date, lines, approved-note checklist). The `TrustStrip` sits under the Gantt.
- [ ] **Approval:**
  - "Aprobar notas" ticks are required before "Aprobar y enviar al paciente" is enabled (wording drafts are optional, cut-able).
  - Approve → `POST /api/plans/:id/approve {approvedBy: plan.clinic.dentistName, noteIds, summaries}` → the patient link `/p/{id}` (copy button), a QR code (`qrcode` data URL) and **"Facturas que se emitirán"**: one row per phase with `formatInvoiceNumber`, amount and visit date. This plan approval is the human approval for the initial invoice issue (see WP-10).
- [ ] **Plan editor:** "Añadir línea" to a phase, with a one-click preset "Injerto óseo (+450 €)" = `GOLDEN_BONE_GRAFT_EDIT`, remove line, and "Fase entregada" (deliver). The edit → `POST /api/plans/:id/edit` → a `DiffPanel` with `explanation.rendered` plus per-phase before/after amounts, fit bands and dates. Example: "Fase 2: 1.500,00 € → 1.950,00 € · sigue dentro del rango de Paga en 3 · fases 3–4 se mueven 4 semanas".
- [ ] `<AgentFeed planId/>` is visible next to the editor, and `PaymentsOverview` lists plans (`GET /api/plans`) with paid totals and the next due date. Both live-refresh on SSE.
- [ ] Director deep-link anchors (WP-14 scrolls to them): the plan editor has `id="plan-editor"` and the agent feed wrapper has `id="agent-feed"`. Asserted in `tests/clinic/console.test.tsx`.
- [ ] `tests/clinic/console.test.tsx` (jsdom, mocked `fetch` and child components):
  - the golden extraction renders 12 lines and a ✓ check bar with "1 a revisar";
  - an invalid tooth shows as flagged;
  - approve is disabled until the notes are ticked;
  - the approve payload includes the ticked note ids;
  - the bone-graft preset posts exactly `GOLDEN_BONE_GRAFT_EDIT`;
  - the diff panel shows "+450,00 €" (mock the edit response with `GOLDEN_BONE_GRAFT_DIFF`).

## Notes
- Never compute amounts or dates in the UI. All of them come from API responses.
- The console must also work from Director beat B1 (no hero plan): the plan created and approved here becomes the hero, `demo`.
- Spanish UI with EN toggle. Copy is professional and calm (dentists are the audience here).

## Contract change requests
_None yet._
