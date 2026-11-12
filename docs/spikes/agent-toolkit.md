# Spike: PayPal Agent Toolkit invoice tools driven by Claude (WP-10)

**Question.** Can Claude Sonnet 5.5 drive `@paypal/agent-toolkit@1.11.0` (`/bedrock` export) through the PayPal sandbox so that the clinic agent issues, sends, cancels, reissues and reminds one invoice per phase, and which invoice dating policy does the sandbox allow?

**Status: live run passed on 2026-11-11 (sandbox only, Claude Sonnet 5.5, ~€0 of PayPal money moved).** Through the adapter, one Claude tool loop ran `create_invoice` → `send_invoice` → `generate_invoice_qr_code` for the four hero phases, then, on the bone-graft edit, `cancel_sent_invoice` → `create_invoice` (v2, €1,950.00) → held for approval → Approve → `send_invoice` (exact stored payload) → `generate_invoice_qr_code`, then `send_invoice_reminder`. The toolkit is the default path; no Invoicing v2 REST fallback was needed.

## How the adapter talks to the toolkit

| Toolkit (`/bedrock`) | Anthropic |
|---|---|
| `getTools()` → `{toolSpec:{name, description, inputSchema:{json}}}` | `{name, description, input_schema}` (only the 7 allowlisted names pass) |
| `handleToolCall({toolUseId, name, input})` → `{toolUseId, content:[{text}]}` | `tool_result` content (JSON text) |

- `configuration.context.sandbox` defaults to **false** (live API). We always pass `context: { sandbox: true }`.
- The toolkit fetches **one** token and never refreshes it, and a 401 comes back as a tool-result string, not an exception. `createLiveInvoiceTools` builds the toolkit per agent run and rebuilds it once, retrying the call, when the result looks like an auth failure.
- `text` is double-encoded (`JSON.stringify(JSON.stringify(x))`); `parseToolkitText` decodes up to twice and never throws. The QR output is a `multipart` body whose part is base64 PNG text, not JSON; `extractQrDataUrl` turns it into a `data:image/png` URL.
- `create_invoice` returns only a HATEOAS link (`href …/v2/invoicing/invoices/INV2-…`); the invoice id is parsed from it. `send_invoice` returns the payer-view link (`https://www.sandbox.paypal.com/invoice/p/#INV2-…`).

## Real input schema of `create_invoice` (toolkit 1.11.0)

Top level, `additionalProperties: false`, **required: `currency_code`, `primary_recipients`, `items`**. Properties: `currency_code`, `invoice_number`, `invoice_date` (`yyyy-MM-dd`), `reference`, `note`, `invoicer_business_name`, `invoicer_given_name`, `invoicer_surname`, `invoicer_email_address`, `invoicer_tax_id`, `invoicer_address_line_1/2`, `invoicer_city`, `invoicer_state`, `invoicer_postal_code`, `invoicer_country_code`, `primary_recipients`, `items`, `allow_tip`, `theme_color`, `shipping_cost`, `enable_pay_by_bank`, `pay_by_bank_exclusive_above_threshold`, `allow_partial_payment`, `minimum_partial_payment_amount`.

- `primary_recipients[].billing_info`: `business_name`, `name{given_name,surname}`, `address`, `email_address`, `phones`, `additional_info` (≤ 40), `language`.
- `items[]` (required `name`, `quantity` **as a string**, `unit_amount{currency_code,value}`): `description`, `tax`, `discount`, `item_date`, `unit_of_measure`.
- **There is no `due_date`, `payment_term` or `detail.payment_term` input.** Every invoice comes back with `payment_term: NO_DUE_DATE`.
- `create_invoice` accepts EUR (the toolkit's `create_order` accepts only USD; the invoice tools do not have that limit).
- `send_invoice {invoice_id, note?, send_to_recipient?, additional_recipients?}`, `cancel_sent_invoice {invoice_id, note?, send_to_recipient?, additional_recipients?}`, `send_invoice_reminder {invoice_id, subject?, note?, additional_recipients?}`, `generate_invoice_qr_code {invoice_id, width?, height?}`, `get_invoice {invoice_id}`, `record_payment_for_invoice {invoice_id, method, payment_id? (≤ 22), payment_date?, amount?, note?}`.

A malformed payload comes back as a tool-result error object (`{"ok":false,"status":400,"code":"PAYPAL_API_HTTP_ERROR","message":…}`), not an exception, with no field name in the message. (An empty recipient e-mail returned "too short or too long" for an otherwise valid body.)

## Dating policy (decision: `note_only`)

Measured with direct toolkit calls on 2026-11-11 (invoice dated 7 days ahead vs. dated today):

| Action | `invoice_date` in the future | invoice dated today (`invoice_date` omitted) |
|---|---|---|
| `create_invoice` → `send_invoice` → `get_invoice` | status **`SCHEDULED`** | status `SENT` |
| `generate_invoice_qr_code` | works | works |
| `send_invoice_reminder` | **422** "You cannot remind an invoice which is in SCHEDULED status. Only UNPAID, SENT and PARTIALLY_PAID …" | works |
| `cancel_sent_invoice` | **422** "Cannot cancel a scheduled invoice." (status stays `SCHEDULED`) | works |

A future `invoice_date` does make `send_invoice` return a SCHEDULED invoice, but then `send_invoice_reminder` and `cancel_sent_invoice` both fail, so the edit flow (cancel → reissue) and the reminder flow would break. **Policy: `INVOICE_DATING_POLICY = "note_only"`** in `src/agent/policy.ts`: `invoice_date` is omitted (the invoice is issued and sent today, status `SENT`), `items[0].item_date` = the visit date, and the invoice note says "Pagar el día de la visita (…)". (The toolkit exposes no `due_date`, so this is the toolkit-compatible form of the fallback.) `policy.ts` keeps the `visit_date` branch and `statusAfterSend` so switching is one constant if PayPal ever allows cancelling scheduled invoices.

## Other findings

- **Duplicate number.** Re-creating `PPP-RIBE-F1-v1` returns 422 with the text `Invoice number is duplicate.` (no `DUPLICATE_INVOICE_ID` code survives the toolkit's flattening). The matcher in `guard.ts` was extended to this text; the runtime then bumps `v{k}` and retries, so a demo reset against a sandbox that already holds `…-v1` ends on `…-v2` instead of failing. Note: the hero numbers `PPP-RIBE-F1-v1`, `F2-v1`, `F2-v2`, `F3-v1`, `F4-v1` were consumed by this spike (all cancelled), so the first live demo run will issue `v2`/`v3` numbers. That is expected and shown in the feed.
- **`record_payment_for_invoice` needs a transaction PayPal knows.** With `method: "PAYPAL"` and an invented `payment_id` the sandbox answers 404 "The specified resource does not exist", and with no `payment_id` 422. With `method: "OTHER"` it succeeds and the invoice becomes `MARKED_AS_PAID` (payment type `EXTERNAL`). A real checkout capture id should be accepted for `PAYPAL`; this could not be exercised without a buyer approving an order. The runtime therefore records `PAYPAL` first and, on a 404 only, retries once as `OTHER` with the capture id in the note (a visible, deterministic step; the amount was already guard-checked), so the invoice always closes and cannot be paid twice.
- **Cancelling.** `cancel_sent_invoice` works on a `SENT` invoice (`{"success":true,"invoice_id":…}`); it was used to clean the sandbox after the run.
- **Reminders** work on `SENT` invoices and return an empty string on success.
- **Idempotency.** The run re-reads the plan before every call and skips phases that already have a live invoice; a second `PLAN_APPROVED` does nothing.

## Results (live, Claude Sonnet 5.5 + sandbox, 2026-11-11)

> This table records the run as it happened on 2026-11-11. Since 2026-11-12 the agent invoices a phase only once it is due (see ADR-8 in [`docs/ARCHITECTURE_DECISIONS.md`](../ARCHITECTURE_DECISIONS.md)): `PLAN_APPROVED` creates invoices only for due phases, and a phase becoming `upcoming` no longer triggers a reminder, because it has no invoice yet.

| Trigger | Steps (tool order) | Result |
|---|---|---|
| `PLAN_APPROVED` (4 phases, none paid) | get_plan → create ×4 (€360 / €1,500 / €520 / €1,690) → send ×4 → qr (due phase only) | all `SENT`, amounts equal the engine's cents, no guard rejection needed |
| `PLAN_EDITED` (ph2 → €1,950, plan v2) | explanation → get_plan → cancel F2-v1 → create F2-v2 (€1,950.00) → `approval_required` | held, sha256 stored (`58f98779…`) |
| Approve | approval_granted → send_invoice (stored payload) → qr | invoice `SENT`, approval `executed` |
| `PHASE_STATUS_CHANGED` ph2 → upcoming | get_plan → send_invoice_reminder | reminder sent |

Every call went through the deterministic guard; the model followed `get_plan` on the first attempt, so the "model corrects itself" beat is exercised by `tests/agent/loop.test.ts` (scripted client) and by Director key **G**.

Reproduce: `npx tsx --tsconfig tsconfig.json --env-file=.env <script>` with a script that calls `executeRun` from `src/agent` (real keys in `.env`, `FORCE_MOCKS` unset). Keep calls few: each Claude run is 4–10 short requests.
