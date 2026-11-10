/** OWNED BY WP-04. Server-side: what the browser needs to render the PayPal button (GET /api/paypal/config). */
import { modes, publicEnv, serverEnv } from "@/env";
import type { PayPalClientConfig } from "./sdk-url";

export function paypalClientConfig(): PayPalClientConfig {
  const mode = modes().paypal;
  const pub = publicEnv();
  // The REST client id is public by design (it is in every checkout page's script URL).
  const clientId = mode === "live" ? pub.paypalClientId || serverEnv().PAYPAL_CLIENT_ID || null : null;
  return {
    mode: clientId ? "live" : "mock",
    clientId,
    buyerCountry: pub.paypalBuyerCountry || null,
    currency: "EUR",
    // Orders are created with intent CAPTURE; see docs/spikes/paylater-es.md for AUTHORIZE.
    intent: "capture",
  };
}
