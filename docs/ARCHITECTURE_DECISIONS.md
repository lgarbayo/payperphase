# Architecture decisions

This is the honest record of how PayPerPhase was built during the [Build What's Next with PayPal and AI](https://paypalaihackathon.devpost.com/) hackathon (10–12 November 2026). It covers what we chose, what we tried first, what went wrong and what we would change. It is written for anyone who wants to understand *why* the code looks the way it does before changing it.

Each decision uses a light ADR format:
- **Context:** the problem we faced.
- **Decision:** what we chose.
- **Consequences:** what that gave us and what it cost.

Maintainers add new entries at the end. An entry is never deleted: when a decision changes, mark it "Superseded by ADR-N" and write the new one.

## Index
| # | Decision | Status |
|---|---|---|
| 1 | [Claude reads, code decides money and dates, the dentist approves every word](#adr-1-claude-reads-code-decides-money-and-dates-the-dentist-approves-every-word) | Accepted |
| 2 | [Integer cents and date-only values, produced only by the engine](#adr-2-integer-cents-and-date-only-values-produced-only-by-the-engine) | Accepted |
| 3 | [One one-time PayPal order per phase, captured at the visit](#adr-3-one-one-time-paypal-order-per-phase-captured-at-the-visit) | Accepted |
| 4 | [The server sets the amount and refuses early orders](#adr-4-the-server-sets-the-amount-and-refuses-early-orders) | Accepted |
| 5 | [JS SDK v5 with Pay Later messaging pinned to Pay in 3](#adr-5-js-sdk-v5-with-pay-later-messaging-pinned-to-pay-in-3) | Accepted |
| 6 | [Webhooks verified by PayPal, one transition for every rail](#adr-6-webhooks-verified-by-paypal-one-transition-for-every-rail) | Accepted |
| 7 | [A Claude agent over the PayPal Agent Toolkit, behind a guard and a human approval](#adr-7-a-claude-agent-over-the-paypal-agent-toolkit-behind-a-guard-and-a-human-approval) | Accepted |
| 8 | [Invoices issued at approval, dated to the visit in the note](#adr-8-invoices-issued-at-approval-dated-to-the-visit-in-the-note) | Accepted, to revisit |
| 9 | [Bryntum draws and validates; the engine owns every date](#adr-9-bryntum-draws-and-validates-the-engine-owns-every-date) | Accepted |
| 10 | [Patient wording as approved slot templates; a grounded chat](#adr-10-patient-wording-as-approved-slot-templates-a-grounded-chat) | Accepted |
| 11 | [One JSON file on a persistent disk, an event bus and SSE](#adr-11-one-json-file-on-a-persistent-disk-an-event-bus-and-sse) | Accepted for the demo |
| 12 | [A labelled simulated clock and a labelled mock mode for everything](#adr-12-a-labelled-simulated-clock-and-a-labelled-mock-mode-for-everything) | Accepted |
| 13 | [Render Starter with a disk, not the free plan](#adr-13-render-starter-with-a-disk-not-the-free-plan) | Accepted |
| 14 | [Built with parallel AI coding agents, merged through pull requests](#adr-14-built-with-parallel-ai-coding-agents-merged-through-pull-requests) | Accepted |

---

## ADR-1: Claude reads, code decides money and dates, the dentist approves every word
**Context.** The product is about trust with money and health. An LLM is good at reading a messy Spanish quote and at writing plain language. It is not something we can let decide an amount, a date or clinical advice.

**Decision.** Split every AI feature into three roles:
- **Claude reads and drafts:** quote extraction, note wording, the agent's choice of tool, chat answers.
- **Deterministic, tested code decides:** amounts, dates, the Pay in 3 fit, what a drag may do, what a closure would cost.
- **A dentist approves** every text a patient will read.

**Consequences.**
- Every number a patient sees can be traced to a tested function.
- The trust story is one sentence long, which helped the pitch as much as the code.
- The cost is plumbing: slot templates, validators, a guard and an approval flow, where a single model call would have been "simpler".

## ADR-2: Integer cents and date-only values, produced only by the engine
**Context.**
- Float euros drift: 0.1 + 0.2 ≠ 0.3.
- JavaScript `Date` carries a time zone, so a visit "on 12 January" can become 11 January in another zone.
- Both bugs are invisible until they cost someone money.

**Decision.**
- Money is an integer number of euro cents.
- A date is an ISO `YYYY-MM-DD` string.
- Only the phase engine (`src/engine`) produces either. The engine has no I/O and is covered by property tests (fast-check) for its invariants. For example: the phases always sum to the quote, and a delay never breaks a healing minimum.

**Consequences.** Spanish price parsing and display formatting live at the edges. The Gantt receives dates converted to local midnight and converts them back on every drag.

## ADR-3: One one-time PayPal order per phase, captured at the visit
**Context.** The whole point is that a patient pays each phase on the day it is delivered. We looked at a few options:
- **A subscription:** Pay Later excludes recurring payments.
- **A vaulted payment method charged later:** it is still a promise to pay in advance.
- **AUTHORIZE now and capture at the visit:** it adds a 3-day honour period, a 29-day validity limit, a second capture leg and a void path.

**Decision.** One Orders v2 order with `intent: CAPTURE` per phase, created and captured at the visit. The patient pays at the end of the appointment, once the care has been delivered, so an authorisation buys nothing. Each phase is sized to fit Pay in 3 (€20–€2,000), so the patient can still spread a large phase over three interest-free payments. PayPal pays the clinic in full and takes on the instalments.

**Consequences.**
- The AUTHORIZE/void flow is deliberately not built.
- The engine reports the Pay in 3 fit but never claims eligibility, because PayPal decides.

## ADR-4: The server sets the amount and refuses early orders
**Context.** If the browser sent the amount, a tampered request could pay the wrong price. If the server accepted any phase, "never in advance" would only be a UI promise.

**Decision.** `POST /api/paypal/orders` takes a plan and a phase, never an amount. The server reads the amount from the store and creates the order only if the phase's status is `due` or `overdue`. Each attempt carries a `PayPal-Request-Id`, so retries are idempotent.

**Consequences.**
- A sandbox check confirmed it: the server ignored an amount sent in the request (order `8UF12137GP897594C`) and refused a phase that was not yet due with `NOT_DUE_YET`.
- Future phases show a locked "not yet" button instead of a PayPal button.

## ADR-5: JS SDK v5 with Pay Later messaging pinned to Pay in 3
**Context.** The hackathon also lists PayPal's newer JS SDK v6, but the Pay Later message for a Spanish buyer in EUR was the riskiest unknown, so we spiked it first ([`docs/spikes/paylater-es.md`](spikes/paylater-es.md)).

**What we tried.**
1. With PayPal's public test client id, the message did not render: it belongs to a US merchant.
2. With our own ES business sandbox app it rendered, but PayPal switched products by amount. €360 showed Pay in 3, while €520 and above showed "up to 24 instalments".

**Decision.**
- Stay on v5, where we verified everything, with `enable-funding=paylater`, `buyer-country=ES` (sandbox only), `currency=EUR` and `locale=es_ES`.
- Pin the message to the Pay in 3 offer (`PAY_LATER_SHORT_TERM`) for every amount from €20 to €2,000.
- Never edit PayPal's message, and never write our own eligibility claim.

**Consequences.**
- The button stack shows PayPal, "Paga a plazos" and card, and the Pay in 3 checkout was completed in the app on the hosted URL.
- Moving to v6 is future work.

## ADR-6: Webhooks verified by PayPal, one transition for every rail
**Context.** A payment can be confirmed in four ways:
- the capture response in the browser;
- a capture webhook;
- an invoice-paid webhook;
- a reconcile after a redirect.

They arrive in any order, sometimes twice. Applying them independently would double-count a payment.

**Decision.**
- Every path goes through one `transition()` per phase: a small state machine over the phase's payment status (scheduled, upcoming, due, overdue, processing, paid) that ignores events that change nothing.
- Webhooks are verified only through PayPal's `verify-webhook-signature` call; offline verification was not proven, so we did not rely on it.
- Webhooks are de-duplicated on the event id.
- A payment marks the care as delivered only if the visit day has come.

**Consequences.**
- In the hosted rehearsal, the capture response applied the payment first. Both webhooks then arrived signature-verified and were recorded as "already applied", which is the de-duplication working.
- The "PayPal trail" panel exists so this invisible work can be seen.

## ADR-7: A Claude agent over the PayPal Agent Toolkit, behind a guard and a human approval
**Context.** Clinics spend time issuing, chasing and reconciling invoices. An agent can do that, but an agent with access to invoicing is a risk if it can choose the amount or the recipient.

**Decision.**
- Claude Sonnet 5.5 runs a tool loop over the official PayPal Agent Toolkit (`@paypal/agent-toolkit` 1.11.0), in sandbox mode.
- The loop is limited to seven invoice tools plus two read-only local tools (`get_plan`, `get_plan_diff`).
- Every call passes a deterministic guard that checks amount, currency, invoice number and recipient against the engine and the store. When a call is wrong, the guard returns a visible error to the model.
- After a plan edit, `send_invoice` waits for one human Approve click, bound to a sha256 of the exact stored payload.
- If the model is unavailable, a labelled deterministic playbook calls the same tools in a fixed order.

**What we learned from the live spike** ([`docs/spikes/agent-toolkit.md`](spikes/agent-toolkit.md)):
- The toolkit fetches one token and never refreshes it, and returns a 401 as a string. We rebuild the toolkit once and retry.
- Tool output is JSON encoded twice.
- A duplicate invoice number comes back as plain text rather than a code. We match it and bump the version.
- `record_payment_for_invoice` with method PAYPAL fails for a checkout capture, because PayPal does not link the two. The agent records it as an external payment instead, which closes the invoice.

**Consequences.**
- It is a real Toolkit integration, with no REST fallback.
- The model overloading (HTTP 529) does not break the demo: the feed shows the reason and the playbook takes over.

## ADR-8: Invoices issued at approval, dated to the visit in the note
**Context.**
- We wanted each phase's invoice to arrive on its visit day.
- The toolkit's `create_invoice` has no due date.
- A future `invoice_date` makes the invoice `SCHEDULED`, and the sandbox then refuses both `cancel_sent_invoice` ("Cannot cancel a scheduled invoice") and `send_invoice_reminder`. The edit flow (cancel → reissue) and reminders would break.

**Decision.** `INVOICE_DATING_POLICY = "note_only"`:
- issue and send every phase invoice when the plan is approved;
- put the visit date on the line item;
- write "pay at your visit" in the note.

The `visit_date` branch is still in `src/agent/policy.ts`, so switching is one constant.

**Consequences, stated plainly.**
- The checkout rail enforces "never in advance". The invoice rail cannot: PayPal's invoice page would accept an early payment.
- If one arrived, the app would record it but would not mark the care as delivered, so the exposure meter would show it instead of hiding it.
- The fix is to send each invoice on its visit day, from the simulated clock's due event. That is the next change to make. It was left out of the hackathon build because it changes the agent beat of the demo.

## ADR-9: Bryntum draws and validates; the engine owns every date
**Context.** A Gantt chart is the natural picture of a treatment plan. But Bryntum has its own scheduling engine, and two engines computing dates will eventually disagree.

**Decision.**
- Every task is `manuallyScheduled`, and dependencies carry only the engine's lag.
- Every editing feature that could move a date on its own is off: task edit, cell edit, resize, drag-create and others.
- A drag is allowed but checked: `TaskDrag.validatorFn` calls the engine's `validateMove` on each step. The tooltip quotes the dentist's note, and an invalid drop snaps back.
- While dragging, the chart shades "Healing · not before …" and the "Safe window", built from the engine's healing data.
- `tests/gantt/parity.test.ts` loads a real Bryntum `ProjectModel` in CI and checks it agrees with the engine day for day.

**Consequences.**
- Bryntum does what it is best at: rendering, baselines, dependencies, indicators, time ranges, summaries and animated updates.
- We use the public trial package, which shows a trial notice. A production deployment would need a Bryntum licence.

## ADR-10: Patient wording as approved slot templates; a grounded chat
**Context.** Patients need explanations in plain Spanish or English. A generated sentence can quietly contain a wrong date or amount.

**Decision.**
- **Notes.** Claude drafts notes as slot templates (`{{amount}}`, `{{date}}`, `{{teeth}}`, `{{minWeeks}}`). A validator rejects any digit, currency sign or month name outside a slot, code fills the slots from the engine, and a dentist approves every note.
- **Chat.** The chat (Claude Haiku 5.5) answers only from approved notes passed as cited documents. A `simulate_delay` tool runs the engine for what-if questions. A numeric grounding check replaces any answer that contains a number not found in its sources. Medical questions get a fixed referral to the clinic, and the chat is rate-limited.

**Consequences.**
- Patients only ever read approved or grounded text.
- The chat can say less than a free-form model would, which is the point.

## ADR-11: One JSON file on a persistent disk, an event bus and SSE
**Context.** We had two days, one service and a demo that several people would click at once. A database would have added setup, migrations and another thing to host.

**Decision.**
- **Store.** One JSON file (`DATA_DIR/db.json`). Writes are atomic (temp file + rename) and go through a promise queue so they never interleave. Every read is validated with zod. The store reseeds itself if the file is missing or corrupt.
- **Live updates.** A domain event bus streams changes to every open page over Server-Sent Events, which works with Next.js route handlers without extra infrastructure.

**Consequences.**
- Simple and robust for one instance.
- It does not scale to several instances, and it is not where real health data should live. A real product would move to a database with per-clinic isolation.

## ADR-12: A labelled simulated clock and a labelled mock mode for everything
**Context.** Treatment spans months, but a demo lasts three minutes. Judges may also run the code without any keys.

**Decision.**
- **Clock.** A simulated clock starts on `SIM_START_DATE` (16 Nov 2026) and can jump forward. It is always labelled "Simulated" on screen.
- **Mock mode.** Every integration (PayPal, webhooks, Anthropic, the agent) has a mock or cached mode that switches on when its key is missing. It always shows a visible badge, and `/api/health` reports which mode each one is in.

**Consequences.**
- Anyone can run the whole demo offline.
- A screen recorded in mock mode is easy to spot, so we recorded and screenshotted the live mode.

## ADR-13: Render Starter with a disk, not the free plan
**Context.** Judging runs from 1 to 15 December. On Render's free plan, a service sleeps after 15 minutes, takes 30–60 seconds to wake, loses its files on restart and can miss PayPal webhooks while asleep.

**Decision.** Render's Starter plan in Frankfurt, close to Spanish users, with a 1 GB disk for the JSON store:
- a health check on `/api/health`;
- auto-deploy from `main`, with a build filter that skips docs and test-only changes;
- every environment variable declared in the Blueprint, with a test enforcing it.

A free-plan Blueprint (`render.free.yaml`) is kept in sync for anyone without credits.

**Consequences.**
- About $7 a month while judging.
- `NEXT_PUBLIC_*` values are inlined at build time, so changing the PayPal client id needs a redeploy.

**A boot lesson.** Our first `instrumentation.ts` returned early on the Edge runtime. That still made Next.js bundle the Node-only modules, and `next dev` failed with `UnhandledSchemeError: node:crypto`. Wrapping the imports in `if (process.env.NEXT_RUNTIME === "nodejs")` fixed it.

## ADR-14: Built with parallel AI coding agents, merged through pull requests
**Context.** One maintainer, two days, and a scope that covers an engine, payments, an agent, a Gantt, a chat and a deploy.

**Decision.**
- Split the work into about 15 work packages with a shared contract layer (`src/contracts`, zod schemas written first).
- Build them in parallel with Claude Code, each in its own git worktree and branch.
- Merge each into `main` through a GitHub pull request, with a person deciding every merge. CI runs on every push.
- Near the end, a simulated judging panel reviewed the build against the hackathon's criteria, and four polish packages followed from it.

**Consequences.**
- It was fast, and the contract layer kept the packages compatible.
- **The cost was distance:** it is harder to feel ownership of code you did not type.
- **The docs fell behind the code.** For a while the README said the chat was "not built" after it had merged.
- **Live verification came late.** The in-app Pay in 3 payment and the webhooks were proven on the hosted URL only on the second day.

**Next time:** verify the riskiest live path on day one, keep the docs in the same pull request as the feature, and keep the maintainer closer to each change.
