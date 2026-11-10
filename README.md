# PayPerPhase

Dental treatment you pay for phase by phase, as you receive it. Never in advance.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/). Work in progress: this README is a skeleton and is finished before submission.

> **Sandbox only.** Every payment runs in the PayPal sandbox and every patient is synthetic. In production, PayPal requires pre-approval for medical services.

## The problem
In Spain most dental care is private. Multi-visit plans (implants, aligners, gum treatment) cost €2,000–€10,000 and arrive as one long quote. Patients either pay up front or sign a consumer loan linked to the clinic for the whole amount. When the iDental (2018) and Dentix (2020) chains collapsed, thousands of patients kept repaying loans for treatment they never received ([official guidance](https://www.dsca.gob.es/ca/consumo/preguntas-frecuentes/tenia-tratamiento-dental-financiado-entidad-que-propuso-clinica-pero)).

## What PayPerPhase does
1. The clinic uploads a Spanish quote (*presupuesto*) PDF. **Claude** reads the line items: treatment, tooth (FDI) and price. It never computes money or dates.
2. A tested, deterministic **phase engine** groups the lines into clinical phases with healing intervals (extraction → 8 weeks → implant → 12 weeks → crown). It sizes each phase to fit PayPal **Pay in 3** (€20–€2,000).
3. The dentist reviews and approves the plan and the plain-language notes, then sends the patient a link or QR code.
4. The patient sees a **Bryntum Gantt**: phases, healing windows and payment milestones coloured by PayPal status.
5. The patient pays each phase **on the day it is delivered**, with a one-time PayPal order and the official Pay Later message. The milestone turns green live.
6. Dragging a phase later moves the dependent phases and their due dates. A move that breaks a healing minimum snaps back and shows the dentist's note.
7. A **billing agent** (Claude + PayPal Agent Toolkit) creates, sends and reminds per-phase invoices, behind a deterministic amount guard.
8. "What if the clinic closes today?" compares a linked loan (you still owe €3,710) with PayPerPhase (€0).

## MVP (never cut)
- Phase engine with property tests (cents, dates, dependencies, Pay in 3 fit, what-if, exposure).
- Bryntum Gantt with dependencies, healing windows, payment milestones and drag what-if.
- Per-phase PayPal Orders v2 checkout with unedited Pay Later messaging. The server only creates an order for a phase that is due.
- Exposure meter and the clinic-closure button.
- Billing agent: create, send and record payment of invoices through the Agent Toolkit.
- Seeded demo case, public "Reset demo", labelled simulated clock.

Beyond the MVP, the full product adds:
- live PDF extraction with an odontogram;
- a grounded patient chat;
- a plan-edit diff with invoice reissue;
- webhooks.

Details: [`fleet/SPEC.md`](fleet/SPEC.md).

## Stack
| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript |
| AI | Anthropic Claude: Sonnet 5.5 (extraction, wording, agent), Haiku 5.5 (chat), via `@anthropic-ai/sdk` |
| Payments | PayPal JS SDK v5 (Pay Later ES), Orders v2, Invoicing v2, `@paypal/agent-toolkit` |
| Timeline | Bryntum Gantt (React wrapper) |
| Tests | Vitest, fast-check, Playwright |
| Hosting | Render |

## Quick start
```bash
npm ci
cp .env.example .env   # every secret is optional: a missing one runs that integration in labelled mock mode
npm run dev            # http://localhost:3000
npm run check          # typecheck + tests
```

## Hackathon milestones
- [x] PayPal developer dashboard: ES business sandbox app, Pay Later ES verified
- [x] Idea chosen and MVP defined (`fleet/IDEA.md`, `fleet/SPEC.md`)
- [x] Repo, MIT licence, stack; basic Claude call (live PDF extraction, 12 of 12 lines)
- [ ] Sandbox test payment end to end
- [ ] AI core connected to PayPal (billing agent through the Agent Toolkit)
- [ ] Frontend, UX and MVP features finished
- [ ] End-to-end flow on the hosted URL

## License
[MIT](LICENSE)
