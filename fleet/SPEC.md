# PayPerPhase: spec

> Spanish dental patients pay for a multi-visit treatment one clinical phase at a time, with PayPal, on the day each phase is delivered. Each phase is sized to fit the Pay in 3 range. A Bryntum Gantt shows the payments as milestones that move when the treatment moves, so the patient never prepays for care they have not received.

Binding inputs: `fleet/IDEA.md` (product brief, hard facts, build priority), `fleet/PRIOR_ART.md` (rivals), `fleet/hackathon.json` (rules, rubric). Deadline: Thu 12 Nov 2026, 21:00 CET. **We submit by Thu 18:00 CET.**

## Target prizes
Only one category prize and one sponsor prize can stack. Nothing is built for AG Grid, Channel3, APIMatic, Agentic Commerce or Render. Render only hosts the app.

| Prize | Why we can win it | Evidence judges will see |
|---|---|---|
| **Most Impactful** (category, $5k), primary | Real, sourced Spanish harm. When iDental (2018) and Dentix (2020) collapsed, patients kept paying linked loans for implants they never received. PayPerPhase removes the mechanism: you pay each phase on the day you receive it. | The 0:00 hook cites the official dsca.gob.es FAQ. The exposure meter "paid for treatment not yet received" stays at €0. The "What if the clinic closes today?" counters show linked loan €3,710 against PayPerPhase €0, computed by the engine and labelled illustrative with the source on screen. |
| **Best Use of Bryntum** (sponsor, 3 × $1k) | The Gantt is the product, not decoration. It has clinical dependencies with lags, hatched healing windows, payment milestones coloured by PayPal status, a baseline ghost, a simulated-today line, a 6-month deadline highlight, drag with snap-back validation, and custom columns and taskMenu. | Beats 2–3: a payment diamond turns green live, the patient drags the implants and the crowns follow, an illegal drag snaps back with the dentist's note, and the deadline turns red. |
| Best Use of PayPal + AI (secondary; cannot stack with Most Impactful) | Orders v2 per phase with unedited Pay Later messaging. A Claude agent drives Invoicing v2 through the PayPal Agent Toolkit behind a deterministic amount guard. | Beat 4: the toolkit calls stream in a feed, the guard rejects a stale amount on camera, and the invoice and QR code appear in the sandbox. |

## Demo script (2:50 target, 3:00 hard cap)
English voice-over, Spanish UI with an EN toggle shown once. The sandbox stays visible throughout. No logos or third-party trademarks, and no unlicensed music. Each beat is recorded separately from a Director Mode deep link (`/demo?director=1`, hotkeys **R** reset, **1–6** beat states, **C** clock +7 weeks, **G** guard test; every clock state is labelled "Simulated") and then cut together.

1. **0:00–0:12 HOOK.** Dark title cards. VO: "In 2020 one of Spain's biggest dental chains closed overnight. Thousands of patients kept paying loans for implants they never received." The dsca.gob.es FAQ is on screen as text only.
2. **0:12–0:18 TITLE.** "PayPerPhase: pay for dental treatment phase by phase, as you receive it. Never in advance." Then the positioning line against the rivals: *pre-treatment Spanish quote · clinical healing windows · pay per phase · €0 exposure*.
3. **0:18–0:48 CLINIC: QUOTE → PLAN (wow 5).** Beat B1. Drag the synthetic Clínica Dental Ribera presupuesto (12 lines, €4,070) onto `/clinic`. The lines stream in and teeth 36, 37 and 46 light up on the odontogram. The check bar reads "Σ lines = printed total ✓ · 0 invalid teeth · 1 to review". The Gantt assembles with healing windows and "within Pay in 3 range" badges, and the trust strip sits underneath. Lower third: "Claude Sonnet 5.5 extracts. A tested rules engine groups phases, healing times and amounts in cents." The dentist ticks "approve notes" and clicks "Approve & send to patient", and the link and QR appear.
4. **0:48–1:15 PATIENT: PAY PHASE 1 (wow 2).** Beat B2. `/p/demo` opens on a laptop and the ES→EN toggle is shown once. The official Pay Later message sits under the €360 phase-1 button. Click PayPal, approve in the sandbox popup and return. The phase-1 diamond turns green with a ripple over SSE, the ledger shows "Paid €360 · received €360", and the exposure meter holds at €0.
5. **1:15–1:45 PATIENT: DELAY WHAT-IF (wow 3).** Beat B4. Drag phase 2 (implants) six weeks to the right. Phases 3 and 4 and their payment diamonds follow, the baseline ghost shows the original plan, and the due dates change. Then drag it left past the healing minimum: it snaps back and the dentist's note card appears ("bone needs at least 8 weeks to heal"). Drag far right past six months and the deadline turns red. VO: "Bryntum draws it, our tested engine computes every date."
6. **1:45–2:02 PATIENT: ASK THE PLAN (first to cut).** "If I wait 3 months for the implant, what changes?" The answer shows engine-computed dates, a ghost preview on the Gantt, and a chip "Approved by Dra. Ruiz · Phase 2". Then "Can I take ibuprofen?" gets a polite refusal and a "Message my clinic" button.
7. **2:02–2:30 CLINIC AGENT (wow 6).** Beat B5. The dentist adds a bone graft (+€450) to phase 2, and a plain-language diff appears: "+€450, phase 2 still within Pay in 3 range". The agent feed streams the calls: `cancel_sent_invoice` → `create_invoice`, then the guard rejects a stale €1,500 amount (G key, labelled "guard test"). After **Approve**, `send_invoice` → `generate_invoice_qr_code` run. Cut to the sandbox invoice and its QR code. Press **C**: phase 2 turns amber and the feed shows `send_invoice_reminder ✓`.
8. **2:30–2:46 THE BUTTON (wow 4).** Beat B6. Press "What if the clinic closes today?". The counters animate: "Linked loan: you still owe €3,710 for treatment you never got" against "PayPerPhase: €0". The source is cited and the screen is labelled illustrative.
9. **2:46–2:52 CLOSE.** "Sandbox only · synthetic patients · medical services require PayPal pre-approval in production." Then the tagline and the hosted URL.

## Wow moments (protection order)
1. **The Bryntum clinical Gantt:** dependencies with lags, hatched healing tasks, payment milestones coloured by PayPal status, a baseline ghost, a simulated-today timeRange and a deadline highlight.
2. **Per-phase checkout:** an Orders v2 checkout per phase with the official Pay Later message unedited. The milestone turns green live over SSE.
3. **The drag what-if:** successors and due dates follow, the baseline stays visible, an illegal drag snaps back with the clinician-approved reason, and the 6-month deadline turns red.
4. **"What if the clinic closes today?":** the linked loan's amount still owed against PayPerPhase €0. The engine computes it from undelivered phases, it is labelled illustrative, and it cites dsca.gob.es.
5. **The quote builds itself:** PDF → streamed lines → odontogram → check bar → the Gantt assembles.
6. **The clinic agent:** create → approve → send → QR, the guard visibly rejecting a wrong amount, and a reminder from the simulated clock.

## Users and problem
- **Who:** Spanish private dental clinics (dentist and front desk) and their patients with multi-visit plans (implants, aligners, perio) costing €2,000–€10,000.
- **Pain today:** One long presupuesto full of codes and FDI tooth numbers. Patients either pay up front or sign a linked consumer loan for the whole plan. When a chain collapses, they keep repaying loans for care never delivered (iDental 2018, Dentix 2020; official guidance at dsca.gob.es).
- **Why now:** PayPal Pay in 3 in Spain (€20–€2,000) makes small, per-phase 0% payments possible, and LLMs can read Spanish quotes reliably. The trust problem therefore becomes a scheduling problem, which a Gantt plus a deterministic engine solves.

## Scope
### Must (demo path, never cut)
- Deterministic phase engine (cents, dates, dependencies, Pay-in-3 fit, what-if, exposure, closure stress test) with property tests.
- Bryntum Gantt with dependencies, healing windows, payment milestones by status, baseline, today line, deadline, and drag what-if with snap-back.
- Per-phase PayPal Orders v2 checkout plus the unedited Pay Later message. Capture updates the milestone live over SSE. Server invariant: no order unless the milestone is DUE.
- Exposure meter plus the clinic-closure button.
- Clinic agent doing at least `create_invoice`, `send_invoice` and `record_payment_for_invoice` through the Agent Toolkit. The deterministic playbook fallback is allowed.
- Hero implant case seeded on boot, a public "Reset demo", and Director Mode.
- Compliance copy in the app shell, the README and the video. A labelled simulated clock. Mock and Cached badges.

### Should (if time)
- Live Claude PDF extraction with the streamed reveal and odontogram. The golden cached fallback is labelled.
- ES/EN wording slot templates, clinician approval of notes.
- Bone-graft edit → plain-language diff → invoice reissue with one human approval → guard rejection on camera.
- Agent reminder driven by the simulated clock.
- Webhook path (`PAYMENT.CAPTURE.COMPLETED`, `INVOICING.INVOICE.PAID`) with signature verification and dedupe.
- Aligner case with batch milestones.
- Patient chat grounded on approved notes with the `simulate_delay` engine tool.
- Spike-gated: `PHASE_PAYMENT_INTENT=AUTHORIZE` (reserve at check-in, capture on "Phase delivered", void on clinic closure).

### Cut list (drop in this order if late)
1. Chat ghost preview on the Gantt.
2. Patient chat (fallback: approved-note cards plus a "Message my clinic" link).
3. Third case (perio, over €2,000, honest flag) and the aligner case.
4. Bone-graft edit diff plus invoice reissue.
5. Agent reminder through the clock.
6. Odontogram animation (fallback: line list with tooth chips).
7. AUTHORIZE/void flow.
8. Webhook path (keep capture plus `/p/[planId]/return` reconcile).
9. Live LLM extraction in the video (use the labelled cached extraction).

**NEVER cut:** the Gantt with dependencies plus the drag what-if, per-phase PayPal checkout, the exposure meter plus the clinic-closure button, and create, send and record payment through the toolkit.

## Architecture
```mermaid
flowchart LR
  subgraph Browser
    CL[/clinic console/] -->|PDF| EX
    PT[/p/planId patient/] --> G[PlanGantt · Bryntum]
    G -->|validatorFn| ENGc[engine (isomorphic)]
    PT --> PB[PayPhaseButton · JS SDK v5 + Pay Later msg]
    PT --> CH[PlanChat]
    CL --> AF[AgentFeed]
    SSEc[useDomainEvents] --> PT & CL
  end
  subgraph "Next.js on Render (Node 22)"
    EX[/api/extract/] --> CLAUDE1[(Claude Sonnet 5.5<br/>PDF → RawExtraction)]
    EX --> VAL[parse € · Σ check · FDI]
    VAL --> ST[(JSON store DATA_DIR/db.json)]
    PL[/api/plans/*/] --> ENG[engine] --> ST
    PB -->|planId, phaseId| ORD[/api/paypal/orders/] -->|amount from store,<br/>canCreateOrder| PP[(PayPal Orders v2)]
    WH[/api/paypal/webhook/] -->|verify + dedupe + transition| ST
    ST --> BUS((event bus)) --> SSE[/api/events SSE/] --> SSEc
    BUS --> AG[clinic agent<br/>Claude tool loop or playbook]
    AG --> GUARD{amount/EUR/number/<br/>recipient/allowlist guard} --> TK[(PayPal Agent Toolkit<br/>Invoicing v2)]
    CH --> CHAT[/api/chat/] --> CLAUDE2[(Claude Haiku 5.5<br/>cited approved notes)] --> ENG
    CLK[/api/clock simulated/] --> ENG
  end
```
- **Stack:** TypeScript throughout. Next.js 15.5 App Router on React 19.2 (verified: Bryntum renders through `next/dynamic` with `ssr:false`, and `next build` passes). Bryntum Gantt 7.3.8 comes from the public npm trial alias `@bryntum/gantt: npm:@bryntum/gantt-trial@7.3.8` plus `@bryntum/gantt-react@7.3.8`, so no registry secret is needed. Styling is Tailwind v4 over the CSS-variable theme, with framer-motion 12 for motion. Contracts use zod 4. LLM calls go through `@anthropic-ai/sdk` 1.7.0. Invoicing uses `@paypal/agent-toolkit` 1.11.0 (`/bedrock` export). Orders, OAuth and Webhooks are called over `fetch`. Also pdf-lib, qrcode, Vitest 3, and Playwright 1.56 for the smoke test. Every dependency is pinned exactly.
- **Deploy:** one Render web service (Node 22, Starter, always-on through 15 Dec) with a persistent disk for `DATA_DIR`. Build runs `npm ci && npm run build`. It seeds on boot and has a health check at `/api/health`.
- **Platform APIs used (and why):**
  - **JS SDK v5** `components=buttons,messages`, `currency=EUR`, `enable-funding=paylater`, `buyer-country=ES` (sandbox only), locale `es_ES`/`en_GB`: one button per phase and the official Pay Later message with `data-pp-amount` set to the phase amount, shown unedited.
  - **Orders v2** with intent CAPTURE (AUTHORIZE only if the spike passes): one one-time order per phase, because Pay Later excludes recurring payments. The server reads the amount from the store, `custom_id={planId}:{phaseId}`, `invoice_id=PPP-…`, and a `PayPal-Request-Id` per create and capture attempt.
  - **Webhooks** (`PAYMENT.CAPTURE.COMPLETED`, `INVOICING.INVOICE.PAID`, verified with `verify-webhook-signature`): independent confirmation, deduplicated on the PayPal event id, routed through one pure `transition()`. `/p/[planId]/return` reconciles the full-page redirect fallback.
  - **OAuth2 client credentials:** token cached and refreshed at 80% of `expires_in`.
  - **Invoicing v2 via the Agent Toolkit** (create, send, sendReminder, cancel, get, generateQRC, recordPayment): per-phase invoices `PPP-{plan4}-F{n}-v{k}` (≤25 chars), QR codes, reminders, and recording the checkout capture on the phase invoice.
- **AI components (what real work each does):**
  - **Extraction (claude-sonnet-5-5, `messages.parse` + zod):** reads the base64 PDF into `RawExtraction`, with money as printed text, a closed `ProcedureCode`, FDI teeth and a confidence per line. Code then parses the Spanish money, re-sums the lines, checks the sum against the printed total and validates the FDI numbers. A golden fixture keyed by PDF sha256 is used when there is no key or the call times out, labelled "Cached".
  - **Wording (claude-sonnet-5-5):** drafts ES/EN slot templates (`{{amount}} {{date}} {{teeth}} {{minWeeks}}`). A validator rejects any digit, currency sign or month name outside a slot, and slots are filled only from engine values. The clinician approves every text.
  - **Clinic billing agent (claude-sonnet-5-5 tool loop):** event-driven over the toolkit invoice tools plus local `get_plan` and `get_plan_diff`. A policy gate returns an `is_error` tool_result on any violation. `send_invoice` after an edit needs one human Approve click on the stored payload. A deterministic playbook calls the same tools when the LLM is unavailable.
  - **Patient chat (claude-haiku-5-5):** approved notes go in as document blocks with citations. Every date comes from the `simulate_delay` engine tool, a numeric grounding check runs after each answer, and out-of-scope questions get the fixed referral.
  - **Rules for every Claude call:** model IDs come from env, the builder loads the `claude-api` skill first, there is no forced `tool_choice`, the `refusal` stop_reason is handled, and no unverified beta headers are hardcoded.
- **Sponsor tools:** Bryntum Gantt targets Best Use of Bryntum. PayPal is the required tech, and Most Impactful is the category prize. Render is the host and is not targeted.

## Contracts
Everything shared lives in code and is **scaffold-owned**. Builders import it and never edit it; they file a *Contract change request* in their WP instead, which the integrator applies.
- `src/contracts/*.ts`: zod schemas and types for primitives (IsoDate, Cents, FdiTooth, ids), procedures (`ProcedureCode`, categories, `PhaseKind`), notes (`NoteId`, `ClinicalNote`), extraction (`RawExtraction` from the LLM → `ExtractionResult`), plan (`Plan`, `Phase`, `PhaseDependency`, `PaymentMilestone`, `PaymentStatus`, `FitBand`, `Baseline`), engine I/O (`MoveRequest`, `MoveValidation`, `WhatIfResult`, `HealingWindow`, `OrderEligibility`, `ExposureReport`, `ClosureStressTest`, `PlanEdit`, `PlanDiff`), agent (`InvoiceToolName` allowlist, `formatInvoiceNumber`, `AgentStep`, `PendingApproval`, `InvoiceToolsClient`), paypal (order and capture request/response, `WebhookEventRecord`, `phaseCustomId`), ai (wording drafts, chat request/response), events (`DomainEvent` union), server (`PlanStore` interface, `SimClock`, `DemoBeat`), and api (every route's request/response plus `apiFetch`).
- `src/contracts/constants.ts`: Pay in 3 and installment ranges, upcoming and overdue windows, simulated start date `2026-11-16`, DSCA URL, compliance, trust and GDPR copy.
- `src/contracts/fixtures/implantCase.ts`: **golden hero case**. The raw extraction, the extraction result, and the approved plan (4 phases, €360 / €1,500 / €520 / €1,690 = €4,070) with exact dates, plus the bone-graft edit and the legal and illegal demo moves.
- `src/env.ts`: lazy zod env, `modes()` (PayPal, Anthropic, agent: live or mock), `publicEnv()`.
- `src/lib/dates.ts`: UTC date-only helpers. `endDate` is **exclusive**, and lag is measured from the predecessor's endDate. `src/lib/money.ts`: integer cents and the PayPal value conversion. `src/lib/http.ts`: route helpers. `src/lib/ui/**`: Button, Card, Badge, StatusPill, ModeBadge, SimClockBadge, ComplianceBadge, Toast, LocaleToggle, status palette. `src/lib/sse/useDomainEvents.ts`: client SSE hook.
- `src/i18n/index.tsx` (`LocaleProvider`, `useT(ns)`) and `src/i18n/core.ts` (server-safe `translate`). **Each feature WP owns its own `src/i18n/<feature>.ts`**, and `tests/i18n` enforces ES/EN key parity.
- **Stub convention:** every cross-WP export already exists as a typed stub inside its owner's path (`src/engine`, `src/server/*`, `src/lib/paypal`, `src/agent`, `src/ai/*`, `src/components/*`, `data/seed/*`, the API routes). Owners replace the bodies and keep the exported signatures. Changing a signature is a Contract change request.

### Domain rules every WP must respect
- **Money:** integer EUR cents, produced only by `src/engine`. The client never sends an amount to the server.
- **Dates:** date-only ISO strings, produced only by `src/engine`. Bryntum phase tasks are `manuallyScheduled`, so Bryntum never computes dates. The flow is validatorFn → `engine.validateMove`, drop → `engine.reschedule` preview → `POST /api/plans/:id/whatif` → the server persists → the Gantt reloads with the baseline kept.
- **Pay at the visit:** `dueDate === phase.startDate`. Statuses run scheduled → upcoming (≤14 days before the visit, amber, **not payable**) → due (visit day reached, payable) → overdue (more than 7 days after the visit), plus processing and paid. `engine.canCreateOrder` enforces the no-prepayment rule on the server. A capture on a due phase also marks it delivered, because payment is taken at the end of the visit.
- **One live instrument per milestone:** the phase invoice is the bill. Paying by checkout calls `record_payment_for_invoice` on it. Invoices are dated or due on the visit date and say "pay at your visit".
- **Agent approval policy:** the dentist's "Approve & send to patient" click is the human approval for the initial per-phase invoice issue. The console lists those invoices before the click. Any `send_invoice` after a plan edit needs one explicit Approve click in the AgentFeed on the exact stored payload, and the sha256 is re-checked at execution. The Director **G** key runs a labelled "guard test" (a stale amount pushed through the guard), so the rejection is visible on camera.
- **LLM output** never contains money or dates. Patients see only clinician-approved text.
- **Mocks are visible:** any mock or cached path renders `<ModeBadge/>`. The simulated clock always renders "Simulated" (`<SimClockBadge/>`).

## Data and sandbox
- **Synthetic data only:** the Clínica Dental Ribera hero implant case (golden fixture), plus an aligner case with batch milestones (WP-02). The perio case with an over-€2,000 honest flag is optional. PDFs are generated deterministically with pdf-lib into `public/samples/`. The store seeds on boot (state B2: hero plan approved, phase 1 due on 2026-11-16 simulated), and the alias `demo` always resolves to the hero plan. A public "Reset demo" button calls `POST /api/demo/reset`.
- **Sandbox accounts** (WP-13 `docs/sandbox-setup.md`): an ES business account in EUR with auto-accept receiving preferences, an ES personal buyer, a REST app with client ID and secret, and a webhook registered at `https://<render-url>/api/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED` and `INVOICING.INVOICE.PAID`. Buyer logins stay in the README until 15 Dec.
- **Env vars** (`.env.example`): `PUBLIC_BASE_URL`, `DATA_DIR`, `SIM_START_DATE`, `FORCE_MOCKS`, `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_BUYER_COUNTRY`, `PHASE_PAYMENT_INTENT`, `DEMO_PATIENT_EMAIL`, `DEMO_MERCHANT_EMAIL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_EXTRACT|WORDING|AGENT|CHAT`, `AGENT_MODE`, `BRYNTUM_NPM_TOKEN` (fallback only). Every secret is optional: when one is missing, that integration runs in mock mode and shows a badge.
- **Commands:** `npm run dev` · `npm test` (Vitest) · `npm run typecheck` · `npm run build` · `npm run e2e` (Playwright, WP-14) · `npm run check` (typecheck plus tests). CI runs typecheck, tests and build on every push.

## Work packages
| ID | Title | Deps | Owns | Hours |
|---|---|---|---|---|
| WP-01 | Deterministic phase engine | – | `src/engine/**`, `tests/engine/**` | 3 |
| WP-03 | Claude quote extraction + wording slot templates | – | `src/ai/extract/**`, `src/ai/wording/**`, `app/api/extract/**`, `app/api/wording/**`, `tests/ai-extract/**`, `docs/spikes/claude-pdf.md` | 2.5 |
| WP-04 | PayPal per-phase checkout + Pay Later ES spike | – | `src/lib/paypal/**`, `app/api/paypal/**`, `src/components/pay/**`, `app/(dev)/spike-paylater/**`, `src/i18n/pay.ts`, `tests/paypal/**`, `docs/spikes/paylater-es.md` | 3 |
| WP-05 | Bryntum clinical Gantt | – | `src/components/gantt/**`, `app/(dev)/gantt-lab/**`, `src/i18n/gantt.ts`, `tests/gantt/**` | 3 |
| WP-09 | Plan store, plan API, simulated clock, events/SSE, demo reset & beats | – | `src/server/**`, `app/api/plans/**`, `app/api/clock/**`, `app/api/events/**`, `app/api/demo/**`, `tests/server/**` | 2.5 |
| WP-13 | Render deploy + Gate A spikes + sandbox setup | – | `render.yaml`, `scripts/render-build.sh`, `scripts/demo-check.ts`, `app/api/health/**`, `docs/deploy.md`, `docs/sandbox-setup.md`, `docs/spikes/bryntum-render.md` | 1.5 |
| WP-08 | FDI odontogram + motion primitives | – | `src/components/odontogram/**`, `src/components/motion/**`, `src/i18n/odontogram.ts`, `tests/odontogram/**` | 2 |
| WP-02 | Synthetic presupuesto PDFs, seed cases, note library | WP-01 | `scripts/pdfs/**`, `public/samples/**`, `data/seed/**`, `tests/seed/**` | 2 |
| WP-06 | Patient plan page `/p/[planId]` | WP-04, WP-05, WP-09 | `app/p/**`, `src/components/patient/**`, `src/i18n/patient.ts`, `tests/patient/**` | 3 |
| WP-07 | Clinic console `/clinic` | WP-03, WP-09 | `app/clinic/**`, `src/components/clinic/**`, `src/i18n/clinic.ts`, `tests/clinic/**` | 3 |
| WP-10 | Clinic billing agent + guard + AgentFeed | WP-09 | `src/agent/**`, `app/api/agent/**`, `src/components/agent/**`, `src/i18n/agent.ts`, `tests/agent/**`, `docs/spikes/agent-toolkit.md` | 3 |
| WP-12 | Impact visuals: exposure meter + clinic-closure stress test | WP-01 | `src/components/impact/**`, `src/i18n/impact.ts`, `tests/impact/**` | 1.5 |
| WP-11 | Grounded patient chat | WP-01, WP-09 | `src/ai/chat/**`, `app/api/chat/**`, `src/components/chat/**`, `src/i18n/chat.ts`, `tests/chat/**` | 2 |
| WP-14 | Demo path polish, Director Mode, landing, trust strip, Playwright smoke | WP-06, WP-07, WP-10, WP-12 | `app/page.tsx`, `app/icon.svg`, `app/demo/**`, `src/components/director/**`, `src/components/brand/**`, `public/brand/**`, `src/i18n/landing.ts`, `tests/e2e/**`, `playwright.config.ts` | 2.5 |
| WP-15 | README, AI tools statement, Devpost copy, architecture diagram | WP-13 | `README.md`, `docs/submission/**`, `docs/architecture/**` | 1.5 |

Scaffold-owned (integrator only): `package.json`, `package-lock.json`, `.npmrc`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `instrumentation.ts`, `.env.example`, `.github/**`, `app/layout.tsx`, `app/globals.css`, `src/contracts/**`, `src/env.ts`, `src/lib/{dates,money,http}.ts`, `src/lib/ui/**`, `src/lib/sse/**`, `src/i18n/{index.tsx,core.ts,types.ts,common.ts}`, `tests/{setup.ts,contracts,lib,i18n}/**`, `fleet/**`.

**Waves (6 builders).** Wave A starts immediately: 01, 03, 04, 05, 09, 13, then 08 when a builder frees up. Wave B starts as its deps merge: 02, 06, 07, 10, 12, 11. Wave C: 14, 15. Total ≈ 36 builder-hours, about 9–10 h wall-clock, which leaves more than 30% buffer for integration, QA and video.

**Critical path:** WP-05 Gantt (3h) → WP-06 patient page (3h) → WP-14 demo polish (2.5h). WP-09 → WP-10 → WP-14 runs in parallel.

### Gates and schedule (CET, binding)
- **Tue 15:30–18:30:** scaffold (done) and the hour-1 spikes inside WP-04, WP-10, WP-03 and WP-13: (a) Pay Later ES under CAPTURE and AUTHORIZE, (b) Bryntum on the Render URL, (c) a toolkit `create_invoice` → `cancel_sent_invoice` round trip through a Claude tool call, (d) Claude PDF extraction. Each result goes in `docs/spikes/*.md`.
- **Gate A, Tue ~19:30:** the Render URL is live, `/gantt-lab` renders Bryntum, and the spike docs are committed.
- **Gate B, Wed ~08:00:** the full demo path runs in mock mode on Render.
- **Feature freeze, Wed 22:00.** Wed 22:00–Thu 08:00 is for fixes, QA, the Playwright smoke and `scripts/demo-check.ts` against Render only.
- **Gate C, Thu 00:00:** live sandbox works end to end.
- **Thu 08:00–14:00:** video takes in Director Mode. **Thu 14:00–18:00:** edit, README, AI tools statement, Devpost. **Submit by Thu 18:00** (deadline 21:00).

## Risks
| Risk | Mitigation |
|---|---|
| Pay Later ES does not render in the sandbox, or Pay in 3 is unavailable | WP-04 spends its first 45 minutes on the spike. If it fails, keep the official messages component and standard checkout, and change the copy to "within Pay in 3 range (€20–€2,000)". Never claim eligibility. The impact story rests on pay-per-phase and €0 exposure. |
| Bryntum trial alias breaks on Render, or the wrapper breaks with Next/React | Already verified locally: Next 15.5 + React 19.2 + gantt-trial 7.3.8 build and render. WP-13 deploys the scaffold first (Gate A). Fallback 1: npm.bryntum.com with `BRYNTUM_NPM_TOKEN`. Fallback 2: pin Next 14.2 / React 18.3. |
| The Bryntum trial watermark shows in the video | Acceptable for the sponsor prize (it proves real Bryntum). WP-13 asks Bryntum for a hackathon licence key; if one arrives, the integrator applies it. |
| Bryntum and the engine disagree on dates | Phase tasks are `manuallyScheduled`. The engine is the only source of dates and runs in both browser and server. A parity test (WP-05) and property tests (WP-01) cover it. |
| An LLM or sandbox call stalls during a video take | Director Mode beats and reset, the golden cached extraction, mock modes and the deterministic agent playbook. Record real calls first. Any cached state is labelled. |
| Agent Toolkit heavy deps or token expiry | Only the `/bedrock` export is used, kept out of client bundles (`serverExternalPackages`). The toolkit is rebuilt per run or on a 401. Fallback: the same tool names call Invoicing v2 over REST behind `InvoiceToolsClient`, and the README states this honestly. |
| PayPal invoices can be paid early, outside our checkout | Invoice dated or due on the visit date, memo "pay at your visit". The exposure meter would honestly show any early payment. Checkout enforces DUE on the server. |
| Duplicate invoice numbers across demo resets | Reset re-ids the hero plan (new `plan4`). `DUPLICATE_INVOICE_ID` bumps `v{k}`. |
| Judges flag the AUP (medical) or GDPR | Compliance line in the app shell, the README and the closing card. Synthetic patients only. |
| Clinical liability: the LLM invents advice, dates or prices | Engine-only money and dates, slot templates, approved notes only, citations, numeric grounding check, fixed referral, trust strip on screen. |
| Merge conflicts across 6 builders | Disjoint owned globs, typed stubs, per-feature i18n, and Contract change requests for shared files. |
| Video runs over 3:00 | Beat-timed script. The chat beat is cut first. Freeze on Wed 22:00. |
| Render sleeps or loses state during judging (1–15 Dec) | Starter always-on with a persistent disk, seed on boot, a public Reset demo button, `demo-check.ts`. |
