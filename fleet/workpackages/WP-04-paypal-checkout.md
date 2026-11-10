---
id: WP-04
title: Ship PayPal per-phase checkout (hour-1 Pay Later ES spike, token cache, Orders v2 create/capture, webhooks, return reconcile, PayPhaseButton + unedited Pay Later message)
deps: []
owns:
  - src/lib/paypal/**
  - app/api/paypal/**
  - src/components/pay/**
  - app/(dev)/spike-paylater/**
  - src/i18n/pay.ts
  - tests/paypal/**
  - docs/spikes/paylater-es.md
status: todo
hours: 3
criteria: [Technological Implementation, Potential Impact, Presentation]
---

## Goal
The patient pays **exactly one clinical phase** with a one-time PayPal Orders v2 checkout, only when that phase is due, with the official Pay Later message shown unedited underneath. The server takes the amount from the stored plan and never from the client. A capture marks the milestone paid and delivered (payment is taken at the visit) and publishes `PAYMENT_CAPTURED`, which turns the Gantt diamond green over SSE. Webhooks and the full-page redirect return reconcile idempotently.

## Consumes
- Contracts: `CreatePhaseOrderRequest/Response`, `CapturePhaseOrderRequest/Response`, `CaptureOutcome`, `WebhookEventRecord`, `phaseCustomId`/`parsePhaseCustomId`, `formatInvoiceNumber`, `PaymentMilestone`, `PaymentStatus`.
- `src/env.ts` (`serverEnv()`, `modes().paypal`, `publicEnv()`, `PAYPAL_API_BASE`) and `src/lib/money.ts` (`centsToPayPalValue`).
- Engine (WP-01; the stub works): `canCreateOrder`, `markDelivered`. Store and events (WP-09; the stub works): `store.getPlan`, `store.updatePlan`, `store.getClock`, `store.recordWebhookEvent`, `publish`.
- UI: `src/lib/ui` and `useT("pay")`.

## Provides
- `src/lib/paypal/index.ts`: keep the stub's exports `createPhaseOrder`, `capturePhaseOrder`, `reconcileReturn`, `PaymentNotAllowedError`. Add `getAccessToken()`, `verifyWebhookSignature()`, `handleWebhookEvent()`, and a pure `transition(milestone, event)` in `transition.ts`.
- Routes: `POST /api/paypal/orders`, `POST /api/paypal/orders/[orderId]/capture`, `POST /api/paypal/webhook`.
- `<PayPhaseButton planId phaseId amountCents status locale onPaid onError/>` and `<PayLaterMessage amountCents locale/>`. Keep the prop names; WP-06 relies on them.
- `/spike-paylater` page and `docs/spikes/paylater-es.md`, which records whether Pay Later ES renders under CAPTURE and AUTHORIZE and sets the `PHASE_PAYMENT_INTENT` recommendation.

## Acceptance criteria
- [ ] **Spike first (≤45 min):** `/spike-paylater` loads `https://www.paypal.com/sdk/js?client-id=…&currency=EUR&components=buttons,messages&enable-funding=paylater&buyer-country=ES&locale=es_ES&intent=capture` (and `intent=authorize`), renders the messages for €360, €1,500 and €1,950, and renders a button. The result is in `docs/spikes/paylater-es.md` with screenshots described in words. If Pay Later does not render, keep the official messages component plus standard checkout, and **our** copy only ever says "within Pay in 3 range (€20–€2,000)".
- [ ] `tests/paypal/token.test.ts`: the OAuth client-credentials token is cached and refreshed at 80% of `expires_in` (fake timers, mocked `fetch`).
- [ ] `tests/paypal/orders.test.ts`:
  - `createPhaseOrder` refuses non-due phases (`NOT_DUE_YET` → HTTP 409) and ignores any amount in the request body.
  - It sends `intent:"CAPTURE"` with `purchase_units[0].amount = {currency_code:"EUR", value:"360.00"}`, `custom_id = "pln_…:ph1"`, `invoice_id = "PPP-{plan4}-F{n}-O{attempt}"` (orders use `O{attempt}`, so they never collide with Invoicing numbers), and `PayPal-Request-Id = "{planId}-{phaseId}-create-{attempt}"`.
  - `return_url` is `${PUBLIC_BASE_URL}/p/{planId}/return` and `cancel_url` is `/p/{planId}`, with shipping `NO_SHIPPING`.
  - `DUPLICATE_INVOICE_ID` bumps the attempt and retries once.
- [ ] `tests/paypal/capture.test.ts`:
  - **COMPLETED** → `store.updatePlan` sets the milestone `paid` (captureId, paidCents, paidAt, `instrument:"order"`), calls `engine.markDelivered(today)`, and publishes `PAYMENT_CAPTURED {via:"capture"}`.
  - **PENDING** → `processing`.
  - **INSTRUMENT_DECLINED** → outcome `DECLINED` (the button calls `actions.restart()`).
  - **ORDER_ALREADY_CAPTURED** → `GET` the order and reconcile.
  - The capture uses `PayPal-Request-Id = "{orderId}-capture"`.
- [ ] `tests/paypal/transition.test.ts`: `transition()` is pure and monotonic. `paid` never goes back, out-of-order events are ignored, and a property test runs over random event sequences.
- [ ] `tests/paypal/webhook.test.ts`:
  - The signature is verified via `POST /v1/notifications/verify-webhook-signature` with `PAYPAL_WEBHOOK_ID`; invalid → 401.
  - The same event id delivered twice is applied once (`store.recordWebhookEvent`).
  - `PAYMENT.CAPTURE.COMPLETED` routes by `custom_id`, and `INVOICING.INVOICE.PAID` routes by the phase's stored `invoice.invoiceId`.
  - An unknown or out-of-order event triggers a `GET` reconcile.
- [ ] `reconcileReturn({planId, orderId})` is idempotent: APPROVED → capture, COMPLETED → ensure paid. Test included. (WP-06's `/p/[planId]/return` page calls it.)
- [ ] **Mock mode** (no credentials): the button renders as a clearly labelled "Pagar (simulación)" with a `<ModeBadge mode="mock">`. It runs the same create → capture server path, so SSE turns the milestone green in mock mode too.
- [ ] `PayPhaseButton` loads the SDK once (locale es_ES/en_GB from `useLocale`) and is disabled unless the status is `due` or `overdue`, with the reason "Se paga el día de la visita". `PayLaterMessage` renders the official message with `data-pp-amount` set to the phase amount, **unedited**, and only for amounts in the Pay Later range.
- [ ] Live: one sandbox payment of ph1 (€360) completes end to end against the dev server. Note the date and time in the spike doc.

## Notes
- Hard facts: Pay Later is not available with recurring or reference transactions, so use one order per phase. `buyer-country` only works in the sandbox. The JS SDK popup can fall back to a full-page redirect, which is why the return reconcile exists.
- Sandbox token lifetime is 3–8 h. Always go through `getAccessToken()`.
- **Should (spike-gated, cut #7):** if Pay Later renders under AUTHORIZE, support `PHASE_PAYMENT_INTENT=AUTHORIZE`: authorize at check-in ("reserved, not charged"), capture on the clinic's "Phase delivered", and void on the clinic-closure demo. Otherwise CAPTURE only.
- Never log secrets or full tokens.

## Contract change requests
_None yet._
