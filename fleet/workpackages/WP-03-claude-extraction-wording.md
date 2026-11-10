---
id: WP-03
title: Claude quote extraction (PDF → RawExtraction → validated ExtractionResult, cached fallback) and ES/EN wording slot templates
deps: []
owns:
  - src/ai/extract/**
  - src/ai/wording/**
  - app/api/extract/**
  - app/api/wording/**
  - tests/ai-extract/**
  - docs/spikes/claude-pdf.md
status: merged
hours: 2.5
criteria: [Technological Implementation, Quality of the Idea, Presentation]
---

## Goal
A clinic drops a Spanish presupuesto PDF. `POST /api/extract` sends it to Claude Sonnet 5.5 as a PDF document block and gets back a typed `RawExtraction` through structured outputs, with money **as printed text**, a closed `ProcedureCode`, FDI teeth and a confidence per line. Deterministic code then parses the Spanish money, re-sums the lines, checks the sum against the printed total and validates the FDI numbers, producing the `ExtractionResult` behind the check bar. Separately, `src/ai/wording` drafts patient-facing ES/EN **slot templates**, which only engine values fill.

## Consumes
- Contracts: `RawExtractionSchema`, `ExtractionResult`, `QuoteLine`, `LineIssue`, `PROCEDURE_CATEGORY`, `isValidFdi`, `WordingDraftSet`, `DiffExplanation`, `WORDING_SLOTS`, `ExtractResponse`, `WordingRequestSchema`.
- `src/env.ts` (`serverEnv().ANTHROPIC_MODEL_EXTRACT`, `ANTHROPIC_MODEL_WORDING`, `modes().anthropic`), `src/lib/money.ts`, `src/lib/dates.ts`, `src/lib/http.ts`.
- `store.saveExtraction` / `store.getPlan` (WP-09; the stub works) and `NOTE_LIBRARY`, `SAMPLE_PDFS`, `cachedExtractionBySha(sha)` and `cachedExtractionBySampleId(id)` from `@data/seed` (WP-02; the stub works: the hero sample id resolves now, and its `sha256` stays empty until WP-02 generates the PDF).
- Golden fixtures: `GOLDEN_RAW_EXTRACTION`, `GOLDEN_EXTRACTION`.

## Provides
- `extractQuote(input): Promise<ExtractionResult>` and `parseSpanishMoney(text)`. Keep the signatures from the stub.
- `normalizeExtraction(raw, meta): ExtractionResult`: pure, exported.
- `POST /api/extract`: multipart `file` (PDF, ≤10 MB) **or** JSON `{ sampleId }`. Stores the extraction and returns `ExtractResponse`.
- `draftPhaseWording(plan, notes)`, `explainDiff(diff, plan)`, `validateTemplate(t)`, `fillSlots(t, values)`.
- `POST /api/wording` `{ planId }` → `WordingResponse` (a stub route already exists; replace its body).
- `docs/spikes/claude-pdf.md`: the hour-1 spike result (latency, accuracy on the hero PDF, any schema features the API rejected).

## Acceptance criteria
- [ ] Load the `claude-api` skill before writing any SDK code. Use `client.messages.parse` with `zodOutputFormat(RawExtractionSchema)` from `@anthropic-ai/sdk/helpers/zod`, a base64 PDF `document` block placed before the instruction text, the model from env, and no forced `tool_choice`. Check `stop_reason === "refusal"` before reading content. Enable server-side fallbacks only in the form the skill documents for `claude-sonnet-5-5`.
- [ ] `tests/ai-extract/normalize.test.ts`: `normalizeExtraction(GOLDEN_RAW_EXTRACTION)` equals `GOLDEN_EXTRACTION` on lines, totals and checks (ignore `source`, `extractedAt`, `pdfSha256`, `model`), including `L12` flagged `LOW_CONFIDENCE` (<0.8).
- [ ] `tests/ai-extract/money.test.ts`: the `parseSpanishMoney` table covers "1.250,00 €", "1250,00", "40 €", "4.070,00 €", "1,5" → 150, "€ 90,00", and rejects "abc", "1.25.0", "12,345".
- [ ] `tests/ai-extract/checks.test.ts`: tooth 19 is dropped and flagged `INVALID_TOOTH`. A changed printed total sets `sumMatches:false`. qty × unit ≠ total gives `QTY_PRICE_MISMATCH`. "12/11/2026" parses to `2026-11-12`.
- [ ] Without a key, or on a 45 s timeout or a refusal, `extractQuote` returns the golden extraction for a known PDF (`cachedExtractionBySha`) or `sampleId` (`cachedExtractionBySampleId`) with `source:"cached"`. Don't keep a sha table of your own: WP-02 owns it. An unknown PDF without a key gets a 422 `NO_LIVE_EXTRACTION` with a "try a sample" message. Covered by `tests/ai-extract/fallback.test.ts` with an injected fake client: no network in tests.
- [ ] `tests/ai-extract/wording.test.ts`: `validateTemplate` rejects any digit, `€`, `EUR`, `%` or ES/EN month name outside `{{slots}}`, and any unknown slot. It accepts "Pagarás {{amount}} el día {{date}}". `fillSlots` fills only from engine values: amount via `formatCents`, date via `formatIsoDate`, teeth, minWeeks = minLag/7, phaseN, dentist. A Claude draft that fails validation is replaced by the deterministic template and marked `source:"cached"`.
- [ ] `explainDiff(GOLDEN_BONE_GRAFT_DIFF, plan)` renders an ES/EN sentence such as "Fase 2: +450,00 €, sigue dentro del rango de Paga en 3 · fases 3–4 se mueven 4 semanas". Every number in it comes from the diff. Use the fixture, not `diffPlans`, so the test doesn't wait for WP-01.
- [ ] Live run once with a real key against the hero PDF (from WP-02, or any synthetic PDF if it hasn't merged yet), recorded in `docs/spikes/claude-pdf.md`.

## Notes
- Extraction prompt rules: copy money and dates exactly as printed; map each line to the closest `ProcedureCode` (OTHER if unsure); list FDI numbers only where printed; never compute or convert. Use temperature defaults, since sampling params are removed on new models.
- The streamed reveal in the clinic console is a UI stagger over the returned lines (WP-07). No NDJSON is needed.
- Wording slots: `{{amount}} {{date}} {{teeth}} {{minWeeks}} {{phaseN}} {{dentist}}`. Patients only see wording after clinic approval (WP-07 → WP-09 approve route stores `phase.summary`).
- The model-ID env var defaults are `claude-sonnet-5-5`; never hardcode a model.

## Contract change requests
_None yet._
