---
id: WP-11
title: Build the grounded patient chat (Claude Haiku 5.5 over cited approved notes, simulate_delay engine tool, numeric grounding check, refusal/referral path, Gantt ghost preview)
deps: [WP-01]
owns:
  - src/ai/chat/**
  - app/api/chat/**
  - src/components/chat/**
  - src/i18n/chat.ts
  - tests/chat/**
status: todo
hours: 2
criteria: [Technological Implementation, Quality of the Idea]
---

## Goal
The patient asks "If I wait 3 months for the implant, what changes?" and gets an answer whose every date comes from the engine, with a chip "Aprobado por Dra. Ruiz · Fase 2" and a ghost preview on the Gantt. A question like "Can I take ibuprofen?" gets a polite, fixed referral and a "Message my clinic" button. **This is first on the cut list.** Without it, the fallback is approved-note cards plus a "message my clinic" link (WP-06 already shows the note cards).

## Consumes
- Contracts: `ChatRequest`, `ChatResponse`, `ChatCitation`, `WhatIfResult`. `store.getPlan`, `publish` (`CHAT_PREVIEW`) (WP-09; the stubs work, so they are not a dep). `NOTE_LIBRARY`. Engine `reschedule` / `validateMove` (WP-01, a real dep: the cascade and deadline-warning assertions need the real engine).
- `serverEnv().ANTHROPIC_MODEL_CHAT` (claude-haiku-5-5), `modes().anthropic`, `src/lib/dates.ts`, `src/lib/money.ts`, `useT("chat")`, `src/lib/ui`.

## Provides
- `answerPatientQuestion(req): Promise<ChatResponse>` (keep the signature), `groundingCheck(answer, sources)`, `POST /api/chat`, and `<PlanChat planId locale onGhostPreview?/>` (keep `PlanChatProps` from the stub; WP-06 passes `onGhostPreview` to draw the ghost).

## Acceptance criteria
- [ ] Load the `claude-api` skill first.
  - Approved notes for this plan go in as `document` blocks (custom or plain-text content) with `citations: {enabled: true}`, titled with the note title, phase and approver.
  - The system prompt allows answers only from those documents and tool results, never medical advice, and the fixed referral (`REFERRAL_ASK_CLINIC`) when the question isn't covered.
  - Handle `stop_reason:"refusal"` with the referral.
- [ ] The tool `simulate_delay {phaseN:int, amount:int, unit:"weeks"|"months"}` is computed by **code**: newStart = phase start + the amount, then `validateMove` / `reschedule`. It returns the shifts with dates formatted by code. The tool result publishes `CHAT_PREVIEW {shifts}`, and `ChatResponse.whatIf` carries it. Invalid moves return the note text.
- [ ] `tests/chat/grounding.test.ts`: any number, date, month name or amount in the answer that does not appear in the tool results or cited note texts swaps the whole answer for a safe, code-built summary, with `groundingFallback:true`.
- [ ] **Mock mode** (no key; labelled cached): a deterministic router. Delay questions (es/en: "esperar", "retrasar", "wait", "delay", plus a number and a unit) go to `simulate_delay` and a templated answer with citations of the relevant `HEALING_*`/`OSSEOINTEGRATION_*` notes. Everything else gets the referral. `tests/chat/mock.test.ts` covers both demo questions in ES and EN. Waiting 3 months for ph2 moves ph2, ph3 and ph4, and the answer cites `HEALING_EXTRACTION_MAX_6M` when its deadline warning appears. "¿Puedo tomar ibuprofeno?" returns `refused:true`.
- [ ] `<PlanChat/>`:
  - two suggested-question chips (the demo questions, localized), a message list, and citation chips "Aprobado por {approvedBy} · Fase {n}";
  - a "Enviar mensaje a mi clínica" button (a demo toast "Mensaje enviado a la clínica (demo)");
  - a "Ver en el calendario" toggle for the ghost preview that calls `onGhostPreview(shifts)` (and `null` to clear), and a `ModeBadge` when the source is cached.
  `tests/chat/panel.test.tsx` (jsdom, mocked `fetch`).
- [ ] `POST /api/chat` validates with `ChatRequestSchema` and rate-limits naively (≤10 requests per minute per plan, in memory).

## Notes
- Citations are incompatible with structured outputs, so don't combine them. Answers are plain text plus citations.
- Keep answers to 2–3 short sentences in the patient's locale.

## Contract change requests
_None yet._
