/**
 * OWNED BY WP-04. Server-only PayPal checkout: OAuth token cache, Orders v2 create/capture per phase,
 * webhook verification, redirect-return reconcile. Amounts ALWAYS come from the store, never the client.
 *
 * Server-only: this module reaches the store and the PayPal REST API. Client components import
 * "@/lib/paypal/sdk-url" (browser-safe) instead.
 */
export { getAccessToken, invalidateAccessToken, PayPalAuthError, TOKEN_REFRESH_FRACTION } from "./token";
export { PayPalApiError, paypalRequest } from "./client";
export {
  buildCreateOrderBody,
  capturePhaseOrder,
  captureRequestId,
  createPhaseOrder,
  createRequestId,
  getOrder,
  orderInvoiceId,
  PaymentNotAllowedError,
  reconcileOrder,
  reconcileReturn,
} from "./orders";
export { handleWebhookEvent, verifyWebhookSignature, WEBHOOK_HEADERS } from "./webhook";
export type { WebhookHandleResult, WebhookHandleStatus } from "./webhook";
export { transition, settlementRank, isUnpaid } from "./transition";
export type { PaymentEvent, PaymentEventType, TransitionResult, IgnoredReason } from "./transition";
export { applyPaymentEvent } from "./apply";
export type { ApplyResult, PaymentVia } from "./apply";
export { paypalClientConfig } from "./config";
export type { PayPalClientConfig } from "./sdk-url";
