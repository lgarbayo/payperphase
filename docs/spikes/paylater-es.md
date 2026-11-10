# Spike: PayPal Pay Later for a Spanish buyer (EUR) under CAPTURE and AUTHORIZE

Owner: WP-04 · Page: `/spike-paylater` · Run: **Tue 2026-11-10, 16:49 CET** (sandbox)

## Question
Does PayPal's official Pay Later offer render for a Spanish buyer paying in EUR, in the sandbox, when the JS SDK is loaded with `intent=capture` and with `intent=authorize`? We check our phase amounts (€360, €1,500, €1,950). The answer sets `PHASE_PAYMENT_INTENT` and the copy we are allowed to use.

## Setup
- SDK URLs, exactly as `buildSdkUrl()` in `src/lib/paypal/sdk-url.ts` produces them. The same function is used by `PayPhaseButton` and `PayLaterMessage`:
  - `https://www.paypal.com/sdk/js?client-id=…&currency=EUR&components=buttons,messages&enable-funding=paylater&buyer-country=ES&locale=es_ES&intent=capture`
  - `https://www.paypal.com/sdk/js?client-id=…&currency=EUR&components=buttons,messages&enable-funding=paylater&buyer-country=ES&locale=es_ES&intent=authorize`
- The two SDKs load side by side, each under its own `data-namespace`.
- Messages: `paypal.Messages({ amount, placement: "payment", style: { layout: "text", logo: { type: "inline" } } })`, unedited, with `data-pp-amount` set to the phase amount.
- Buttons: the standard vertical stack, plus `paypal.Buttons({ fundingSource: paypal.FUNDING.PAYLATER }).isEligible()`.
- **Client id: `sb`**, PayPal's public sandbox placeholder. No `.env` with sandbox credentials exists in this environment yet (WP-13 creates the ES business app), so the spike page falls back to `sb` and says so on screen.
- SDK version reported: **5.0.585**. Browser: headless Chrome for Testing 151, viewport 1440×1100, `es-ES`. The page ran on `next dev` with `FORCE_MOCKS=1`.

## Result

| intent | SDK loads | Pay Later button (`isEligible`) | Rendered button stack | Message €360 | Message €1,500 | Message €1,950 |
|---|---|---|---|---|---|---|
| capture | ✅ yes | ✅ yes | "Pagar con PayPal" · **"Paga a plazos"** · "Tarjeta de débito o crédito" | ⚠️ not verifiable with `sb` | ⚠️ same | ⚠️ same |
| authorize | ✅ yes | ✅ yes | "Pagar con PayPal" · **"Paga a plazos"** · "Tarjeta de débito o crédito" | ⚠️ not verifiable with `sb` | ⚠️ same | ⚠️ same |

**Pay Later (the "Paga a plazos" funding button) renders for buyer-country=ES in EUR under both CAPTURE and AUTHORIZE.**

**The Pay Later message could not be verified.** For each amount the SDK did request PayPal's message service (`sandbox.paypal.com/credit-presentment/smart/message?currency=EUR&amount=360…`, and the same for 1500 and 1950). It then logged `paypal_messages_render_warning: Invalid option value (currency). Expected USD but received "EUR"`. The `sb` placeholder resolves to a US merchant account, so PayPal returns no EUR offer. The message renderer then threw `Cannot set properties of undefined (setting 'PAGE_TYPE')` inside its own tracking code: the response has no `meta.trackingDetails` because there is no offer. This is PayPal's code, not ours (checked in the SDK source). It is not caused by our `data-namespace`. An ES sandbox merchant client id is needed to see the real message.

### Screenshots, described
1. **Full spike page (1440 px).** At the top is the title "Pay Later ES spike" with an amber "Sandbox · dev only" badge, a one-line client-id note ("sb (PayPal public sandbox placeholder…) · buyer-country ES · locale es_ES"), and a summary table. In the table, both rows (capture, authorize) show green "yes" for SDK, Pay Later button and Buttons, and red "no" for the three message columns. Below are two cards side by side, "intent=capture" and "intent=authorize". Each has a green "SDK loaded · v5.0.585" badge and the SDK URL in monospace (client id elided). Each lists the rows 360,00 €, 1.500,00 € and 1.950,00 €, each marked "no-message" with an empty message line. Each shows "Pay Later button eligible: **yes**" followed by PayPal's own stack: a gold "Pagar con PayPal" button, a gold "Paga a plazos" button, a black "Tarjeta de débito o crédito" button, and "Desarrollado por PayPal" underneath. The two-language compliance line sits in the footer.
2. **Patient phase card, phase 1 (mock mode, `/p/demo`).** "1. Diagnóstico, limpieza y extracción", "16 nov 2026 · 360,00 €" and a blue "A pagar hoy" pill. A full-width teal button reads "🔒 Pagar (simulación) · 360,00 €". Under it are an amber "PayPal · Simulación" badge and "Pago único de esta fase. Nunca se cobra por adelantado.", then the line "Dentro del rango de Paga en 3 (20 €–2.000 €)" with an amber "Paga a plazos · Simulación" badge.
3. **Same card after the click.** The button is replaced by a pale-green row: "✓ Pagado · 360,00 €".
4. **Phase 2 card.** "2. Colocación de implantes", "12 ene 2027 · 1.500,00 €" and a grey "Programado" pill. A disabled (faded) button reads "📅 Pagar con PayPal · 1.500,00 €", with "Se paga el día de la visita" underneath.

## Decisions
- **`PHASE_PAYMENT_INTENT=CAPTURE` (recommended and the only flow built).** Pay Later works under AUTHORIZE too, so that door is open. But the patient pays at the end of the visit, when the care has just been delivered, so an authorization buys nothing. It would add the 3-day honour period and the 29-day validity limit, a second capture leg, and a void path. That is cut #7: the AUTHORIZE/void flow is **not** implemented. `paypalClientConfig()` always tells the browser `intent=capture`, and orders are always `intent: "CAPTURE"`.
- **Copy (fallback rule in force until the message is seen with an ES merchant).** Our own text only ever says "Dentro del rango de Paga en 3 (20 €–2.000 €)" / "Within Pay in 3 range (€20–€2,000)" and never claims eligibility. The official `<PayLaterMessage/>` stays mounted, unedited, with `data-pp-amount` = phase amount, for amounts from €20 to €5,000. If PayPal has no offer, it renders nothing. Standard checkout always works, and PayPal itself offers "Paga a plazos" inside the button stack.
- **Mock mode.** With no credentials, no SDK is loaded. The button is a labelled "Pagar (simulación)" with a `ModeBadge`, and the message slot shows only our neutral range line with a "Paga a plazos · Simulación" badge, never an imitation of PayPal's message.

## Mock-mode end-to-end (done, 2026-11-10 16:50 CET)
On the dev server (`FORCE_MOCKS=1`), `/p/demo` → click "Pagar (simulación)" on phase 1. It went through the real routes: `POST /api/paypal/orders` → `POST /api/paypal/orders/:id/capture` → `transition()` → store. The SSE stream (`/api/events?planId=pln_ribera01`) delivered `PAYMENT_CAPTURED {phaseId: ph1, amountCents: 36000, via: "capture"}`, then `PHASE_STATUS_CHANGED due→paid`, then `PHASE_DELIVERED`. `GET /api/plans/demo` showed ph1 `paid` (instrument `order`, `paidCents` 36000) and delivered on 2026-11-16 (simulated). Click to "Pagado" took 0.8 s, including the dev compile of the routes.

## Still open (needs sandbox credentials from WP-13)
- [ ] **Message check with an ES merchant.** Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (ES business sandbox app, EUR), then open `/spike-paylater`. Read the table: the three message columns should turn green for both intents. `window.__pppSpike` holds the same results as JSON. Note the message wording here, in words.
- [ ] **Live payment of ph1 (€360) end to end.** With the same env plus `PAYPAL_WEBHOOK_ID`: `npm run dev`, then `POST /api/demo/reset`, open `/p/demo`, click "Pagar con PayPal" (or "Paga a plazos") on phase 1, approve with the ES sandbox buyer, and watch the diamond turn green. Record date, time, order id and capture id here. Server path: `getAccessToken()` → `POST /v2/checkout/orders` (`PayPal-Request-Id {planId}-ph1-create-1`, `invoice_id PPP-{plan4}-F1-O1`) → `POST /v2/checkout/orders/{id}/capture` (`PayPal-Request-Id {id}-capture`).

| When (CET) | Order id | Capture id | Result |
|---|---|---|---|
| _pending credentials_ | | | |
