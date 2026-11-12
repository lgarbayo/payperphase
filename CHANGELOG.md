# Changelog

This file is the human-readable history of PayPerPhase: what changed, and **why**. It follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## How to update this file
- **Every change that someone using or running the app would notice gets an entry**, in the same pull request as the change. That covers features, fixes, behaviour changes, security fixes and significant documentation.
- Write the entry under **Unreleased**, in the right group: Added, Changed, Deprecated, Removed, Fixed or Security.
- Write it as a sentence for a person, not a list of files. Say what changed and why it matters, and link the pull request.
- **This applies to AI coding agents too.** If you use one (this project was largely written with Claude Code), make it update this file as part of the change, then read what it wrote.
- When a version is released, the maintainer renames "Unreleased" to the version number and date, and starts a new empty "Unreleased" section.

## [Unreleased]

### Added
- **The patient chat answers money questions from the engine** (#30). "How much is phase 2?", "When do I pay phase 3?" and "How much do I still owe?" used to be referred to the clinic. Code now builds the answer from the engine's plan data (phase amount, pay date, total, paid so far, remaining) and cites the approved pay-per-phase note; the model never produces these figures. Care questions that only mention a phase or a date still take the normal path.
- New dark-theme screenshots for the README and the Devpost gallery (landing, patient plan, Gantt drag zones, closure modal, clinic quote and plan, agent feed, patient chat, PayPal trail), taken at 1440×900 in labelled mock mode.
- Open-source project files: this changelog, a contributing guide, a security policy, a code of conduct and an architecture decision record. The repository goes public for judging, and these files tell visitors how to run, change and report problems in the project, and why it is built the way it is.

### Changed
- **A dark product theme** (#27) in the style of Linear: near-black surfaces, hairline borders, one teal accent, Inter as the UI font and a product-first landing hero. The Bryntum Gantt moves to Bryntum's `svalbard-dark` theme with no feature changes, and its healing stripes and scheduled phase numbers were made readable on the dark background (#28).
- README, Devpost copy, AI tools statement and architecture decisions describe the dark theme, the engine-built chat money answers and serialized order creation, and give the current test count (1,004 Vitest tests).
- **Each phase invoice is now created and sent on that phase's visit day, not when the plan is approved.** Before, the billing agent sent every phase's invoice at approval, and PayPal's invoice page would have let a patient pay a future phase early. Now a phase has no invoice until it is due, the guard refuses `create_invoice` and `send_invoice` for a phase that is not due (`PHASE_NOT_DUE`), reminders go only to overdue invoices, and the clinic console's invoice preview and the PayPal trail show a future phase as "Invoiced on its visit day" with its date. This makes "never pay in advance" hold on the invoice rail as it already did at checkout. Director key **5** now puts the simulated clock on phase 2's visit day, so the bone-graft edit cancels and reissues that day's invoice. See ADR-8 in [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md).

### Removed
- The `/spike-paylater` dev page (#30). It threw PayPal SDK errors in mock mode and nothing linked to it; its result stays in [docs/spikes/paylater-es.md](docs/spikes/paylater-es.md).

### Fixed
- **PayPal order creation is serialized per phase** (#30). Parallel requests for one phase (a double click, two tabs) each created a PayPal order, and only one could be captured. Now the open order is handed back while it is recent and for the same server amount. An order for an unknown plan now returns `404 PLAN_NOT_FOUND`.
- The PayPal buttons no longer throw when their container unmounts mid-render, and the patient page refetches a removed plan quietly instead of logging a 404 (#30).
- The Gantt drag tooltip now shows the clinic day a weekend drop actually lands on (the following Monday) and the shift to that day. Before, it showed the raw Saturday or Sunday while the drop committed Monday, so the tooltip and the result disagreed.
- Every PayPal confirmation path (the capture route, the webhook and the return page) now settles a phase only for the server-set amount in euros and only once its visit day has come. Before, an order made in the browser with the public client id and the phase's reference (for example for EUR 0.01, in another currency, or for a phase not yet due) could be captured and mark the phase paid and delivered; the capture route now checks the order before any money moves, and a webhook for such a capture is recorded but not applied.

## [0.1.0] - 2026-11-11

The version built for the [Build What's Next with PayPal and AI](https://paypalaihackathon.devpost.com/) hackathon, from 10 to 11 November 2026, and verified live on the hosted demo.

### Added
- **A deterministic phase engine.** It turns a Spanish dental quote into clinical phases with healing intervals, dates and integer-cent amounts, each phase sized for PayPal Pay in 3 (€20–€2,000). Money and dates had to be provably correct, so they come only from tested code, with property tests, never from a model.
- **Quote extraction with Claude Sonnet 5.5.** A clinic can start from the PDF it already sends patients. Code re-checks the sum against the printed total and validates every tooth number, because the model is only trusted to read, not to count.
- **An FDI odontogram** that lights up tooth by tooth while the quote is read, so the dentist can see what was extracted at a glance.
- **A patient plan built on a Bryntum Gantt**, with healing windows, payment milestones, a baseline of the approved plan, deadline flags and a "Paid this month" row. Dragging a phase previews a delay; a drag that breaks a healing minimum snaps back with the dentist's note. A treatment plan is a schedule, and patients understand a schedule better than a table.
- **One PayPal Orders v2 checkout per phase**, with the official Pay Later message. The server sets the amount and refuses an order before the phase's visit, so a patient never pays for care in advance.
- **Webhook handling** for `PAYMENT.CAPTURE.COMPLETED` and `INVOICING.INVOICE.PAID`, with signature verification and de-duplication, so payments are confirmed even if the browser never returns.
- **A billing agent: Claude driving the PayPal Agent Toolkit.** It creates, sends, cancels, reissues and reminds one invoice per phase, behind a deterministic guard and a human approval for sends after an edit. This takes the invoicing work off the clinic without letting a model decide an amount.
- **A grounded patient chat with Claude Haiku 5.5.** It answers questions about the plan from the dentist's approved notes, with citations and engine-computed dates, and refers medical questions to the clinic.
- **"What if the clinic closes today?"**, an illustrative comparison of a linked loan with pay-per-phase, sourced to the Spanish consumer authority. It shows the reason the product exists in one click.
- **A "PayPal trail" per phase** (order, capture, verified webhooks, the agent's invoice calls), so the clinic and reviewers can see the whole payment lifecycle.
- **Spanish and English**, a labelled simulated clock, a labelled mock mode for every integration, seeded synthetic cases, a public "Reset demo" button and a Director Mode for recording the demo video.
- **A Render Blueprint** with a persistent disk and a health check, plus CI running typecheck, tests and build on every push to `main` and on every pull request.

### Known limitations
- Invoices for future phases are sent when the plan is approved, dated to their visit. PayPal's invoice page cannot block an early payment, so only the checkout rail enforces "never in advance". See [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md).
- Sandbox only, synthetic patients, no authentication. Medical services require PayPal pre-approval in production.

[Unreleased]: https://github.com/lgarbayo/payperphase/compare/809f234...HEAD
[0.1.0]: https://github.com/lgarbayo/payperphase/commits/809f234
