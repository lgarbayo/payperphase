# PayPerPhase: binding product brief

> Dental treatment you pay for phase by phase, as you receive it. Never in advance.

Working name **PayPerPhase** (English for "PorFases"). Built for the PayPal AI Hackathon 2026 (`fleet/hackathon.json`). Prior art and the reasoning behind this pivot: `fleet/PRIOR_ART.md`.

## Problem
- In Spain most dental care is private and paid out of pocket. Multi-visit plans (implants, orthodontics, periodontics) cost €2,000–€10,000 and arrive as one long quote (*presupuesto*) full of codes and tooth numbers.
- Patients delay or reject treatment because they cannot read the plan or pay it at once. Clinics push linked consumer loans for the whole amount.
- When chains collapsed (iDental 2018, Dentix 2020), thousands of patients kept paying loans for treatment they never received (official guidance: https://www.dsca.gob.es/ca/consumo/preguntas-frecuentes/tenia-tratamiento-dental-financiado-entidad-que-propuso-clinica-pero).

## Promise
Each clinical phase is paid when that phase is delivered, with PayPal, sized so it can use PayPal Pay in 3 at 0%. No prepayment, no loan for the whole plan.

## Users
- **Clinic** (dentist or front desk): uploads the quote, reviews the phases the system proposes, approves clinician notes, follows payments.
- **Patient**: understands the plan in plain Spanish (and English for the demo), sees the timeline, pays the current phase, asks "what if I delay phase 2?".

## Core flow (the demo path)
1. Clinic uploads a synthetic Spanish *presupuesto* PDF (we generate 2–3 realistic ones: implant case, ortho case).
2. The LLM extracts line items: treatment, tooth (FDI numbering), quantity, price. It does not compute money or dates.
3. A deterministic **phase engine** groups items into clinical phases with dependencies and healing intervals (e.g. extraction → 8–12 weeks healing → implant → 12 weeks osseointegration → crown), and sizes each phase's amount to fit PayPal Pay in 3 (€20–€2,000) when clinically possible. Rules live in code and data, with tests.
4. The clinic reviews and approves the phases and the plain-language notes (the source for all patient answers).
5. The patient sees a **Bryntum Gantt**: phases as tasks with clinical dependencies, payment milestones coloured by PayPal status (due, paid, overdue).
6. The patient pays phase 1 with a one-time **PayPal Orders v2** checkout (JS SDK, Pay Later enabled, unedited Pay Later messaging, buyer-country=ES in sandbox). Webhook or capture result marks the milestone paid.
7. The patient drags phase 2 later on the Gantt: the engine recomputes the dependent appointments and payment due dates; a risk note from clinician-approved text explains the clinical consequence.
8. Patient chat answers only from the approved plan and notes (grounded; refuses clinical advice outside them).
9. Clinic agent (PayPal **Agent Toolkit**) creates a per-phase invoice, sends reminders before appointments, records payments, and shows a plain-language diff when the dentist edits the plan.

Build priority if time runs short: Gantt with dependencies → per-phase checkout → delay what-if → clinic agent invoices → chatbot.

## Target prizes
- **Most Impactful** (category, $5k): real Spanish problem, official source, pay-as-you-progress.
- **Best Use of Bryntum** (sponsor, 3 × $1k): clinical-dependency Gantt where payments are milestones and the patient runs what-ifs. Stacks with a category prize.
- Secondary: Best Use of PayPal + AI.

## Hard facts from research (respect them)
- Pay Later is not available with Subscriptions / recurring / reference transactions: use **one one-time Order per phase**.
- Pay Later ES: Pay in 3 at €20–€2,000; installments 6/12/24 months at roughly €120–€5,000. Spain-based merchant, EUR. Messaging must be shown unedited. https://developer.paypal.com/docs/checkout/pay-later/es/
- `buyer-country` only works in sandbox; `enable-funding=paylater`. **Hour-1 spike: confirm Pay Later renders for ES in sandbox.** Fallback: show the official messaging component and keep standard PayPal checkout, without claiming eligibility.
- Invoicing v2 supports partial payments (`allow_partial_payment`, `minimum_amount_due`); `INVOICING.INVOICE.PAID` fires on partial payments. Invoice numbers max 25 chars.
- Agent Toolkit invoice tools: create_invoice, send_invoice, send_invoice_reminder, generate_invoice_qr_code, record_payment_for_invoice, create_recurring_series. Sandbox access tokens expire (3–8 h): refresh them.
- The JS SDK popup can fall back to a full-page redirect: build a reconcile path for returning buyers.
- No sandbox clock: use a clearly labelled simulated clock for "time passes" in the demo.
- PayPal's AUP lists medical services as restricted (production needs pre-approval). Say it in the video before a judge does.
- GDPR: synthetic patients only, say so in the README.

## Rivals to beat (already submitted)
Plainbill and Plainpay (explain a US medical bill + installments), Pre-Price (single procedure price), Tranche (freelancer invoices as Bryntum Gantt milestones), pawhold (vet, Bryntum Scheduler, targets Most Impactful). Our edges: pre-treatment, multi-phase, clinical dependencies, Spain/EUR, pay-per-phase, deterministic engine.

## Technical preferences
- TypeScript end to end. Next.js (App Router) with the Bryntum Gantt React wrapper; one deployable on Render.
- AI: Anthropic Claude via `@anthropic-ai/sdk` (claude-sonnet-5-5 for PDF extraction and wording, claude-haiku-5-5 for chat). Builders implementing LLM calls should load the `claude-api` skill first.
- Persistence: SQLite or a JSON file store is fine for the demo; seed script for the two synthetic cases.
- Secrets in `.env` (git-ignored): `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `ANTHROPIC_API_KEY`. Bryntum comes from its trial npm registry. If a secret is missing, mock behind the contract and keep going.
- UI: polished, calm, healthcare-trustworthy; Spanish and English toggle; works on a laptop for the video.
