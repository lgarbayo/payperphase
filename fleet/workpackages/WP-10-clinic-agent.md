---
id: WP-10
title: Build the clinic billing agent (PayPal Agent Toolkit /bedrock → Anthropic tool adapter, deterministic policy guard, event triggers, human approval, playbook fallback, AgentFeed UI)
deps: [WP-09]
owns:
  - src/agent/**
  - app/api/agent/**
  - src/components/agent/**
  - src/i18n/agent.ts
  - tests/agent/**
  - docs/spikes/agent-toolkit.md
status: todo
hours: 3
criteria: [Technological Implementation, Quality of the Idea, Best Use of PayPal + AI (secondary)]
---

## Goal
This is the agent that cannot invent money. Domain events drive a Claude Sonnet 5.5 tool loop over the **PayPal Agent Toolkit** invoice tools. It issues one invoice per phase, sends it with a QR code, records checkout payments on it, reissues it when the dentist edits the plan (after one human Approve click on the exact stored payload), and sends reminders when the simulated clock brings a phase close. A deterministic guard wraps every tool call: the amount must equal the engine's cents, the currency must be EUR, the invoice number must follow the scheme, the recipient must be the case's sandbox email, and the tool must be on the allowlist. A violation returns an `is_error` tool_result, so the model corrects itself on camera. Every step streams to `<AgentFeed/>` and is persisted as an audit trail. A deterministic playbook calls the same toolkit tools whenever the LLM is unavailable.

## Consumes
- Contracts: `InvoiceToolName`, `TOOLKIT_INVOICE_ACTIONS`, `HUMAN_APPROVAL_TOOLS`, `formatInvoiceNumber`, `INVOICE_NUMBER_RE`, `AgentStep`, `PendingApproval`, `InvoiceToolsClient`, `AgentStepsResponse`, `AgentApproveRequestSchema`, `PhaseInvoice`, `DomainEvent`.
- `store` + `publish`/`subscribe` (WP-09), `centsToPayPalValue`, `serverEnv()`/`modes()` (`ANTHROPIC_MODEL_AGENT`, `AGENT_MODE`, `DEMO_PATIENT_EMAIL`, `DEMO_MERCHANT_EMAIL`), `explainDiff` (WP-03), `useDomainEvents`, `src/lib/ui`, `useT("agent")`.
- `@paypal/agent-toolkit@1.11.0`, **`/bedrock` export only**: `new PayPalAgentToolkit({clientId, clientSecret, configuration:{actions:{invoices: TOOLKIT_INVOICE_ACTIONS}, context:{sandbox:true}}})`, `getTools()` → `{toolSpec:{name, description, inputSchema:{json}}}[]`, `handleToolCall({toolUseId, name, input})` → `{toolUseId, content:[{text}]}`. These were verified in the installed package.

## Provides
- `src/agent/index.ts`: keep the stub's exports `startAgent()` (idempotent; called from `/instrumentation.ts`), `runAgent(planId, trigger)`, `decideApproval(...)`.
- Modules:
  - `toolkit.ts`: live `InvoiceToolsClient`, built per run and rebuilt on a 401 or expiry.
  - `mockTools.ts`: deterministic fake ids `INV2-MOCK-…`.
  - `guard.ts`: pure policy gate.
  - `loop.ts`: manual Claude tool loop.
  - `playbook.ts`: deterministic sequences.
  - `approvals.ts`: canonical-JSON sha256.
- Routes: `GET /api/agent/steps?planId=` (stub exists), `POST /api/agent/approve`, `POST /api/agent/run`, and `POST /api/agent/guard-test {planId}`, which pushes one `create_invoice` with the pre-edit amount through the guard and is labelled "guard test" for Director key **G**.
- `<AgentFeed planId locale/>`: a live list of steps, tool chips with ✓/✗, expandable redacted JSON, red guard rejections with the reason ("1.500,00 € ≠ motor 1.950,00 €"), an approval card with a payload summary and Approve/Reject, LLM/Playbook and Mock badges, invoice payer links and QR images.
- `docs/spikes/agent-toolkit.md`: the hour-1 spike.

## Acceptance criteria
- [ ] **Spike (≤45 min):** one Claude tool call round-trips `create_invoice` → `cancel_sent_invoice` (or `get_invoice`) in the sandbox through the adapter. Record:
  - the real input schema of `create_invoice`;
  - whether a future `invoice_date` makes `send_invoice` return a SCHEDULED invoice;
  - whether `send_invoice_reminder` and `cancel_sent_invoice` work on it.
  Pick the dating policy from the result. Preferred: invoice_date = visit date, so the bill is delivered on the visit day. Fallback: due_date = visit date with the note "Pagar el día de la visita".
- [ ] **Triggers (llm and playbook modes behave the same):**
  - `PLAN_APPROVED` (the dentist's plan approval covers this initial issue): per unpaid phase, `create_invoice` (number `PPP-{plan4}-F{n}-v1`, one item = phase amount, EUR, recipient = plan patient email) → `send_invoice`. The due phase also gets `generate_invoice_qr_code`. Phases already paid at approval are skipped. The run is idempotent and never duplicates an invoice for the same plan, phase and version.
  - `PAYMENT_CAPTURED` → `record_payment_for_invoice` for that phase's open invoice: method PAYPAL, amount = captured cents, date = sim today. The one-live-instrument rule holds.
  - `PLAN_EDITED` → an `explanation` step (diff explanation) → `cancel_sent_invoice` (old) → `create_invoice` (v+1, new engine amount) → **`approval_required`** with the stored payload → after Approve: `send_invoice` with **exactly** the stored payload (the sha256 is re-checked) → `generate_invoice_qr_code`.
  - `PHASE_STATUS_CHANGED` to `upcoming` → `send_invoice_reminder`.
  - Every PayPal result updates `phase.payment.invoice` via `store.updatePlan` and publishes `INVOICE_UPDATED`.
- [ ] `tests/agent/guard.test.ts` (pure):
  - each violation is rejected with a specific reason: wrong amount (±1 cent), non-EUR, a malformed or foreign invoice number, the wrong recipient, a tool not on the allowlist, an `invoice_id` not belonging to this plan, `send_invoice` without an executed approval after an edit;
  - valid payloads pass;
  - `DUPLICATE_INVOICE_ID` from PayPal bumps `v{k}`.
- [ ] `tests/agent/adapter.test.ts`: toolkit `toolSpec`s map to Anthropic tools `{name, description, input_schema}`, and only allowlisted names come through. `handleToolCall` text output is parsed as JSON safely.
- [ ] `tests/agent/playbook.test.ts` (mock tools): `PLAN_EDITED` on the golden plan + `GOLDEN_BONE_GRAFT_EDIT` emits steps in the exact order cancel → create → approval_required. Approve → send → qr. A changed payload hash is refused.
- [ ] `tests/agent/loop.test.ts`: a fake Anthropic client first calls `create_invoice` with €1,500 → `guard_rejected` + an `is_error` tool_result → then calls it with €1,950 → ok. Also covered: `stop_reason:"refusal"` → playbook fallback, and a loop with more than 12 iterations aborts.
- [ ] Steps persist via `store.appendAgentStep` and stream as `AGENT_STEP`. `GET /api/agent/steps` returns the audit trail and pending approvals. The feed renders them live (jsdom test with mocked SSE).
- [ ] Load the `claude-api` skill before writing the loop. Use a manual loop (so each call can be gated and paused), the model from env, `tool_choice` auto, and handle `refusal`. Use no unverified beta headers, and enable server-side fallbacks only as documented in the skill.

## Notes
- Never let the model choose amounts. The system prompt says the engine's amounts are given by `get_plan`, and the guard enforces it anyway.
- The toolkit fetches its own token from the client credentials. Build it per run and rebuild it on a 401 (sandbox tokens last 3–8 h).
- If the toolkit fails in the spike, implement the same tool names over the Invoicing v2 REST API behind `InvoiceToolsClient`. The README must then say so honestly (WP-15). Keep the toolkit as the default path.
- Redact secrets and full tokens from step `input`/`output`.

## Contract change requests
_None yet._
