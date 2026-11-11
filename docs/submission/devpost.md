# Devpost copy: PayPerPhase

Paste each block into the matching Devpost field. English. `TODO(human)` marks what only a person can fill in.

## Title
PayPerPhase

## Tagline
Pay for dental treatment phase by phase. Never in advance.

(Devpost allows 60 characters for the tagline; this one is 56.)

## Built with (tags)
`claude`, `anthropic`, `paypal`, `paypal-orders-v2`, `paypal-pay-later`, `paypal-agent-toolkit`, `paypal-invoicing`, `paypal-webhooks`, `bryntum-gantt`, `nextjs`, `react`, `typescript`, `tailwindcss`, `zod`, `vitest`, `render`

## Prize categories to opt into
- **Most Impactful** (category): a real, sourced Spanish harm, removed by design. Exposure stays at €0.
- **Best Use of Bryntum** (sponsor): the Gantt is the product, not decoration.
- Secondary if the form allows only one category: Best Use of PayPal + AI. (Only one category prize and one sponsor prize can stack.)

## Links
- Hosted demo: `TODO(human)` (Render URL)
- Video: `TODO(human)` (public YouTube link, under 3:00)
- Repository: `TODO(human)` (public GitHub URL; the licence is MIT)
- Sandbox test access: in the README under "Sandbox buyer login", valid until 15 Dec 2026

## Inspiration
In 2020 one of Spain's biggest dental chains closed overnight, two years after another. Thousands of patients kept repaying consumer loans for implants they never received. The Spanish consumer authority still publishes guidance for them. The harm comes from one design choice: the whole treatment is paid for, or financed, before it is delivered. We wanted to remove that mechanism instead of explaining it.

## What it does
PayPerPhase turns a Spanish dental quote into a plan the patient pays for one clinical phase at a time, on the day each phase is delivered.

- The clinic uploads a *presupuesto* PDF. Claude reads the line items: treatment, tooth (FDI number) and price. Code then checks the sum against the printed total and validates the tooth numbers.
- A tested phase engine groups the lines into clinical phases with healing intervals (extraction, 8 weeks, implant, 12 weeks, crowns) and sizes each phase to fit PayPal Pay in 3 (€20–€2,000).
- The dentist reviews and approves the plan and every patient note, then sends a link and a QR code.
- The patient sees a Bryntum Gantt with the phases, hatched healing windows and payment milestones coloured by PayPal status. Dragging a phase later moves the dependent phases and payment dates; a move that breaks a healing minimum snaps back with the dentist's note.
- Each phase is paid with a one-time PayPal order, with the official Pay Later message, and the milestone turns green live.
- A billing agent (Claude with the PayPal Agent Toolkit) issues, sends and reminds one invoice per phase, behind a deterministic amount guard. When the dentist edits the plan, the agent reissues the invoice after one human approval.
- A "What if the clinic closes today?" button compares a linked loan (you still owe the undelivered phases) with PayPerPhase (€0).

## How we built it
Next.js 15 and React 19 in TypeScript, deployed on Render. The core rule is that **Claude reads, code decides money and dates, and the dentist approves every word**.

- **Deterministic engine.** Money is integer cents and dates are date-only values, both produced only by the phase engine, which has property tests. Bryntum draws the dates and never computes them.
- **Claude Sonnet 5.5** extracts the quote (structured output), drafts ES/EN wording as slot templates (a validator rejects any number or date outside a slot), and runs the billing agent as a tool loop.
- **PayPal.** Orders v2 per phase (the server reads the amount from its store and refuses an order for a phase that is not yet due), the JS SDK with Pay Later messaging, webhooks with signature verification, and Invoicing v2 through the Agent Toolkit.
- **Bryntum Gantt** with dependencies and lags, healing windows, payment milestones, a baseline ghost, a simulated "today" line, a deadline marker, and drag validation wired to the engine.
- Every integration has a labelled mock mode, so the whole demo path runs without keys. 780+ automated tests.

## Challenges we ran into
- Pay in 3 only covers €20–€2,000, so each phase had to be sized for it without bending the clinical order of treatment. The engine reports the fit honestly and never claims eligibility; PayPal decides.
- The Agent Toolkit's invoice tool has no due date, and a future-dated invoice cannot be cancelled or reminded. We issue the invoice today, date the line item to the visit and write "pay at your visit" in the note.
- Pay Later needed a real Spanish merchant account to render its message. The public test client id returned a US merchant, so we verified it with our own ES sandbox app.
- Keeping an LLM out of the money. The guard re-checks every amount, currency, invoice number and recipient on every agent call and returns a visible error to the model when it is wrong.

## Accomplishments that we're proud of
- A sandbox checkout verified end to end, including Pay in 3, and a live Claude agent run through the real Agent Toolkit.
- Live extraction of the hero quote: 12 of 12 lines exact, sum equal to the printed total, about 8 seconds.
- An exposure meter, "paid for treatment not yet received", that is provably €0 because the server refuses to take payment early.
- A demo you can reset with one button and record beat by beat with Director Mode.

## What we learned
Put the LLM where it reads and the code where it counts. Once Claude never touches a number, the product's trust story becomes simple to state and to test. We also learned how much of a PayPal integration is edge cases: redirects instead of popups, duplicate invoice numbers, tokens that expire.

## What's next
- The FDI odontogram graphic and the grounded patient chat, which answer only from approved notes and take every date from the engine. (In progress; not claimed in the current build.)
- An aligner case with batch milestones, and per-clinic onboarding.
- PayPal pre-approval for medical services and a GDPR data-processing set-up before any real patient.

## What changed after the start date
The project is new: the first commit is dated 10 Nov 2026, after the hackathon's 1 Oct 2026 cut-off for existing projects, and all of the code in the repository was written for this submission.

## Compliance line (put it at the end of the description)
Sandbox only. Synthetic patients. Medical services require PayPal pre-approval in production.
