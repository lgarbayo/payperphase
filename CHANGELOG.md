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
- Open-source project files: this changelog, a contributing guide, a security policy, a code of conduct and an architecture decision record. The repository goes public for judging, and these files tell visitors how to run, change and report problems in the project, and why it is built the way it is.

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
- **A Render Blueprint** with a persistent disk and a health check, plus CI running typecheck, tests and build on every push.

### Known limitations
- Invoices for future phases are sent when the plan is approved, dated to their visit. PayPal's invoice page cannot block an early payment, so only the checkout rail enforces "never in advance". See [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md).
- Sandbox only, synthetic patients, no authentication. Medical services require PayPal pre-approval in production.

[Unreleased]: https://github.com/lgarbayo/payperphase/compare/809f234...HEAD
[0.1.0]: https://github.com/lgarbayo/payperphase/commits/809f234
