# Devpost copy: PayPerPhase

Paste each block into the matching Devpost field. English.

## Title
PayPerPhase

## Tagline
Pay for dental treatment phase by phase. Never in advance.

(Devpost allows 60 characters for the tagline; this one is 58.)

## Built with (tags)
`claude`, `anthropic`, `paypal`, `paypal-orders-v2`, `paypal-pay-later`, `paypal-agent-toolkit`, `paypal-invoicing`, `paypal-webhooks`, `bryntum-gantt`, `render`, `nextjs`, `react`, `typescript`, `tailwindcss`, `zod`, `vitest`, `playwright`

## Prize categories to opt into
The rules allow at most one Grand Prize or category prize, plus at most one sponsor prize. Entering several only adds chances, so tick every one that applies if the form allows it.
- **Most Impactful** (category): a real, sourced Spanish harm (101,481 patients in one chain closure), removed by design.
- **Best Use of PayPal + AI** (category): Claude drives the PayPal Agent Toolkit behind a guard; an in-app Pay in 3 checkout with signature-verified webhooks.
- **Best Demo Delivery** (category): if the final video holds up.
- **Best Use of Bryntum** (sponsor): the Gantt is the product. Drag validation is wired to the engine, and a parity test runs a real Bryntum ProjectModel in CI.
- **Best Use of Render** (sponsor): Blueprint, persistent disk for the store, health checks that report live or mock per integration, PayPal webhooks delivered to the Render URL.

## Links
- Hosted demo: https://payperphase.onrender.com/?lang=en
- Video: https://youtu.be/M7eus5cVwbo (2:35, English captions)
- Repository: https://github.com/lgarbayo/payperphase (public, MIT licence)
- Sandbox test access: paste the sandbox buyer email and password into Devpost's test credentials field (valid until 15 Dec 2026). They are not in the public repo; the README section "Sandbox buyer login" points judges there.

## Image gallery (in this order)
Export at 3:2 from `docs/submission/screens/`. The first image becomes the project thumbnail. The app screens are 1440×900 captures of the dark theme, taken in labelled mock mode (`FORCE_MOCKS=1`), so they show "Mock"/"Cached" badges; `paypal-pay-in-3.png` is the real PayPal sandbox window.
1. `closure.png`: "What if the clinic closes today? €3,710 to claim back on a linked loan, €0 with PayPerPhase."
2. `patient-plan.png`: "The patient's plan on a Bryntum Gantt: phase 1 paid with PayPal, the rest paid on their visit day."
3. `gantt-drag-zones.png`: "Biology vetoes the schedule: drag too early and the dentist's note explains why."
4. `paypal-pay-in-3.png`: "Pay in 3 inside the PayPal sandbox: 3 interest-free payments of €120."
5. `clinic-agent.png`: "On the implant's visit day, Claude drives the PayPal Agent Toolkit to invoice that phase; every call passes a guard."
6. `patient-chat.png`: "The chat answers what-ifs with engine dates, and money questions with the engine's own figures."
7. `clinic-quote.png`: "Claude reads the quote onto an odontogram; code checks the sum."
8. `paypal-trail.png`: "PayPal trail: order and capture per phase; later phases invoiced on their visit day."
9. `landing.png`: "Pay for dental treatment phase by phase. Never in advance."

## Inspiration
In 2020 one of Spain's biggest dental chains, Dentix, closed. According to the Spanish Ministry of Consumer Affairs, 101,481 patients had paid for treatment they had not received, and 65% of them had a linked loan. Two years earlier the iDental chain had collapsed the same way. The consumer authority's advice is blunt: "we recommend not paying the full treatment in advance". Yet multi-visit treatment is still sold as one quote, paid up front or financed in full on day one. We wanted to remove that mechanism instead of explaining it.

## What it does
Linked loans finance treatment you have not received yet. PayPerPhase lets PayPal finance only treatment you already have.

- **The clinic uploads a *presupuesto* PDF.** Claude reads the line items (treatment, tooth, price) while an FDI odontogram lights up. Code then checks the sum against the printed total and validates the tooth numbers.
- **A tested phase engine builds the plan.** It groups the lines into clinical phases with healing intervals (extraction, 8 weeks, implant, 12 weeks, crowns) and sizes each phase to fit PayPal Pay in 3 (€20–€2,000).
- **The dentist approves** the plan and every patient note, then sends a link and a QR code.
- **The patient sees a Bryntum Gantt** with the phases, hatched healing windows and payment milestones coloured by PayPal status. Dragging a phase later moves the following phases and their payment dates. A move that breaks a healing minimum snaps back, quoting the dentist.
- **Each phase is paid with a one-time PayPal order** on the day of its visit, with the official Pay Later message. A phase cannot be paid before its visit day: the server refuses the order. The milestone turns green live.
- **A billing agent (Claude with the PayPal Agent Toolkit)** issues and sends one invoice per phase, with a QR code, on that phase's visit day, and reminds it if it goes overdue. A deterministic guard checks every amount and refuses an invoice for a phase that is not due yet. When the dentist edits the plan on a visit day, the agent cancels and reissues that day's invoice after one human approval. When a checkout captures, it closes that phase's invoice.
- **A grounded patient chat (Claude Haiku)** answers "what if I wait three months?" with engine-computed dates and citations of the dentist's notes, and refers medical questions to the clinic. Money questions ("How much is phase 2?", "When do I pay phase 3?") are answered by code from the engine's figures, never by the model.
- **"What if the clinic closes today?"** compares a linked loan (€3,710 left to claim back for undelivered phases) with PayPerPhase (€0).

**For clinics.** With Pay in 3, PayPal pays the clinic the full phase amount at checkout and carries the instalments. The clinic pays its usual PayPal fee per phase, and the patient pays no interest. The clinic gives up the lump sum on day one. In return it gets a plan patients can read, invoicing and reconciliation done by an agent, and a "we never charge in advance" promise it can show.

## How we built it
Next.js 15 and React 19 in TypeScript, hosted on Render, with a dark product theme (near-black surfaces, one teal accent). The core rule is that **Claude reads, code decides money and dates, and the dentist approves every word**.

- **Deterministic engine.** Money is integer cents and dates are date-only values, both produced only by the phase engine, which has property tests. Bryntum draws the dates and never computes them.
- **Claude Sonnet 5.5** extracts the quote (structured output), drafts ES/EN wording as slot templates (a validator rejects any number or date outside a slot), and runs the billing agent as a tool loop. **Claude Haiku 5.5** runs the patient chat, with an engine tool and a numeric grounding check; amount and pay-date questions are routed to a code-built answer from the engine.
- **PayPal.** Orders v2 per phase: the server reads the amount from its store, refuses an order for a phase that is not yet due, and serializes order creation per phase so a double click reuses the open order. The JS SDK with Pay Later messaging pinned to the Pay in 3 offer. Webhooks verified through `verify-webhook-signature` and de-duplicated. Invoicing v2 through the Agent Toolkit, with each phase invoiced on its visit day. A "PayPal trail" panel shows order, capture, webhooks and invoice calls for each phase.
- **Bryntum Gantt** on Bryntum's `svalbard-dark` theme, tuned to the app's palette with contrast-checked healing stripes. `TaskDrag.validatorFn` is wired to the engine, with healing and safe-window zones while dragging. Also baselines for the approved plan and the chat's preview, deadline indicators, time ranges, a summary row, a filtered task menu, and animated transitions. A parity test loads a real Bryntum ProjectModel in CI and checks it agrees with the engine day for day.
- **Render.** A Blueprint with a persistent disk for the JSON store and a health check that reports live or mock per integration.
- **Testing.** Every integration has a labelled mock mode, so the whole demo runs without keys. There are 1,004 Vitest tests, plus Playwright suites for the demo path and the Gantt drag.

## Challenges we ran into
- **Pay in 3 range.** Pay in 3 only covers €20–€2,000, so each phase had to be sized for it without bending the clinical order of treatment. The engine reports the fit honestly and never claims eligibility; PayPal decides.
- **Invoice dates.** The Agent Toolkit's invoice tool has no due date, and a future-dated invoice becomes `SCHEDULED`, which the sandbox will not cancel or remind (422). So the agent waits: it creates and sends each phase's invoice on the visit day itself, dated that day, with the visit date on the line item. The guard refuses an invoice for a phase that is not due, so the no-prepayment rule holds on the invoice rail as well as at checkout.
- **Captures and invoices are separate.** PayPal does not link a checkout capture to an invoice, so recording it as a PayPal payment fails. The agent recovers by recording it as an external payment, which closes the invoice. The trail shows both attempts.
- **Pay Later merchant country.** Pay Later needed a real Spanish merchant account to render its message. The public test client id returned a US merchant, so we verified it with our own ES sandbox app.
- **Keeping an LLM out of the money.** The guard re-checks every amount, currency, invoice number and recipient on every agent call, and returns a visible error to the model when one is wrong.

## Accomplishments that we're proud of
- **An in-app Pay in 3 checkout on the hosted URL**, verified end to end: order `9S058375J3368024G`, capture `1VT88810KH3701720`, both webhooks signature-verified, and the phase invoice closed by the agent.
- **A live Claude agent run through the real Agent Toolkit** (11 Nov, before invoices moved to the visit day): four invoices in about 20 seconds, then a cancel, a reissue and a hash-locked human approval after a plan edit.
- **Live extraction of the hero quote:** 12 of 12 lines exact, with the sum equal to the printed total.
- **An exposure meter, "paid for treatment not yet received", that stays at €0 on both PayPal rails**, because no payment link exists before the visit: the server refuses an early order, and a phase has no invoice until its visit day.
- **A demo you can reset with one button** and record beat by beat with Director Mode.

## What we learned
Put the LLM where it reads and the code where it counts. Once Claude never touches a number, the product's trust story becomes simple to state and to test. We also learned how much of a PayPal integration is edge cases: redirects instead of popups, duplicate invoice numbers, declined instruments, and captures that do not know about invoices.

## What's next
- An aligner case with batch milestones, and onboarding for each clinic.
- PayPal pre-approval for medical services, and a GDPR data-processing set-up, before any real patient.
- A pilot with one clinic.

## What changed after the start date
The project is new. The first commit is dated 10 Nov 2026, after the hackathon's 1 Oct 2026 cut-off for existing projects, and all of the code in the repository was written for this submission.

## Compliance line (put it at the end of the description)
Sandbox only. Synthetic patients. Medical services require PayPal pre-approval in production.
