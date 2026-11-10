# PayPal sandbox setup

Sandbox only. Without these values the app runs in mock mode; with them, live sandbox mode switches on by env vars alone.

## 1. Accounts (developer.paypal.com > Testing Tools > Sandbox accounts)

- **Business (merchant)**: country **Spain (ES)**, currency **EUR**. In the account's profile open *Receiving preferences* and set it to automatically accept EUR payments (otherwise captures stay pending).
- **Personal (buyer)**: country **Spain (ES)**, the synthetic patient. Note its email and password.
- Keep the logins valid until **15 Dec** (judging window): open the sandbox account pages now and then, do not delete or reset the accounts, and change no passwords without updating the notes.

## 2. REST app

Apps & Credentials > Sandbox > **Create App** (merchant = the business account above). Copy **Client ID** and **Secret**.

## 3. Webhook

In the same app > Webhooks > **Add Webhook**: URL `https://<render-url>/api/paypal/webhook`, events `PAYMENT.CAPTURE.COMPLETED` and `INVOICING.INVOICE.PAID`. Copy the **Webhook ID**. (Register after the Render URL exists; see `docs/deploy.md`.)

## 4. Where each value goes

| Value | Env var |
| --- | --- |
| Client ID | `PAYPAL_CLIENT_ID` and `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (same value; the public one needs a redeploy) |
| Secret | `PAYPAL_CLIENT_SECRET` |
| Webhook ID | `PAYPAL_WEBHOOK_ID` |
| Buyer email | `DEMO_PATIENT_EMAIL` |
| Business email | `DEMO_MERCHANT_EMAIL` |
| Environment | `PAYPAL_ENV=sandbox` (already set) |
| Render URL | `PUBLIC_BASE_URL` |

Locally put them in `.env` (git-ignored). On Render set them in the service Environment tab, then check `GET /api/health`: `modes.paypal` should read `live`.

## 5. Bryntum licence

The build uses the Bryntum trial, which shows a trial notice/watermark. Ask Bryntum (support / sales form, mention the hackathon) for a hackathon licence key to remove it; apply it where the Gantt is configured, and keep the trial alias until then.
