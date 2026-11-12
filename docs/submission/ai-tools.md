# AI tools statement

Every model, tool and service used, and what it did. Sandbox and synthetic data only.

## In the product

| Tool | Where | What it does | What it never does |
|---|---|---|---|
| **Claude Sonnet 5.5** (`claude-sonnet-5-5`, Anthropic API) | Quote extraction, `src/ai/extract` | Reads the base64 PDF of a Spanish dental quote into structured lines (treatment code, FDI teeth, quantity, price as printed text, confidence per line). | Compute money or dates. Code parses the Spanish prices, re-sums the lines, compares to the printed total and validates the tooth numbers. |
| **Claude Sonnet 5.5** | Wording, `src/ai/wording` | Drafts patient-facing notes in Spanish and English as slot templates (`{{amount}}`, `{{date}}`, `{{teeth}}`, `{{minWeeks}}`). | Write a number, currency sign or date. A validator rejects any digit or month name outside a slot, slots are filled only from engine values, and the dentist approves every text. |
| **Claude Sonnet 5.5** | Clinic billing agent, `src/agent` | Runs a tool loop that decides which invoice tool to call (create, send, QR code, cancel, remind, record payment) from domain events such as plan approved, plan edited, phase due. | Choose an amount, currency, invoice number or recipient unchecked, or invoice a phase before its visit day. A deterministic guard validates every call and returns an error to the model when it is wrong (`PHASE_NOT_DUE` for a phase that is not due yet); sending after a plan edit needs one human Approve click on the exact stored payload. |
| **Claude Haiku 5.5** (`claude-haiku-5-5`) | Patient chat, `src/ai/chat` | Answers the patient's questions about their own plan, using the dentist's approved notes as cited document blocks. For a what-if ("what if I wait three months?") it calls the `simulate_delay` tool, which runs the phase engine. A live check on the hosted demo (12 Nov 2026) answered a delay question with engine dates and two citations, and referred a medication question to the clinic. | Invent a date, amount or clinical advice. Every date comes from the engine tool; a numeric grounding check replaces any answer with a number not found in its sources; medical questions get a fixed referral to the clinic; 10 questions a minute per plan. |
| **PayPal Agent Toolkit** (`@paypal/agent-toolkit` 1.11.0, `/bedrock` export) | `src/agent/toolkit.ts` | The agent's tool layer over PayPal Invoicing v2, in sandbox mode. **The agent runs on the Agent Toolkit, not on a REST fallback.** A live run on 2026-11-11, before invoices moved to the visit day, completed create → send → QR code for four phases, then cancel → reissue → approve → send → reminder after a plan edit ([`docs/spikes/agent-toolkit.md`](../spikes/agent-toolkit.md)). | Access production. The sandbox flag is always set. |
| **Deterministic playbook** | `src/agent/playbook.ts` | Calls the same tools in a fixed order, under the same rules (each phase invoiced on its visit day), when no Anthropic key is set or `AGENT_MODE=playbook`. | The UI labels it "Playbook". |

Mock and cached paths (no key, a timeout, or `FORCE_MOCKS=1`) are always labelled in the UI with a badge. Without a key, the chat answers through a deterministic router over the same engine tool. When the live paths run, the UI says so: "Claude" on each agent run, "PayPal sandbox · Agent Toolkit" on the feed, and "Claude · live" on the patient page. The labelled cached extraction used when the live call is unavailable is the same golden result the tests use.

## Where the LLM is not used
- **Money:** integer cents from the phase engine only. The browser never sends an amount, and the server reads it from the store.
- **Dates:** produced by the engine only. Bryntum draws them and never computes them.
- **Pay in 3 fit, healing minimums, exposure and the "clinic closes today" figures:** deterministic and property-tested.
- **What a patient reads:** only dentist-approved text, and chat answers whose numbers are found in the approved notes or the engine's output.

## Used to build the project
- **Claude Code** (Anthropic) wrote most of the code, tests and docs, in parallel work packages. Each package had its own branch and reached `main` through a GitHub pull request, and a person decided every merge. Models: Claude Opus 5.5, Claude Sonnet 5.5 and other Claude models.
- People chose the idea, the design rules, what shipped and the demo.

## Third-party tools (not AI)
Bryntum Gantt (trial package), Next.js, Render hosting, and the PayPal sandbox. No third-party logos or music appear in the repository or the video.
