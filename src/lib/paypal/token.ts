/**
 * OAuth2 client-credentials token for the PayPal REST API (sandbox only).
 *
 * - Cached per server process (survives Next dev HMR via globalThis).
 * - Refreshed once 80% of `expires_in` has elapsed (sandbox tokens live 3–8 h), never on every call.
 * - Concurrent callers share one in-flight request.
 * - Never logs the client secret or the token.
 */
import { PAYPAL_API_BASE, serverEnv } from "@/env";

/** Refresh when this fraction of the token lifetime has elapsed. */
export const TOKEN_REFRESH_FRACTION = 0.8;

interface CachedToken {
  token: string;
  /** Epoch ms after which we fetch a new token (80% of expires_in). */
  refreshAt: number;
}

const g = globalThis as unknown as {
  __pppPayPalToken?: CachedToken;
  __pppPayPalTokenInflight?: Promise<string>;
};

export class PayPalAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PayPalAuthError";
  }
}

/** Bearer token for PayPal REST calls. Always go through this; never cache tokens elsewhere. */
export async function getAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const cached = g.__pppPayPalToken;
  if (!opts.forceRefresh && cached && Date.now() < cached.refreshAt) return cached.token;
  if (g.__pppPayPalTokenInflight) return g.__pppPayPalTokenInflight;

  const inflight = requestToken().finally(() => {
    g.__pppPayPalTokenInflight = undefined;
  });
  g.__pppPayPalTokenInflight = inflight;
  return inflight;
}

/** Drop the cached token (after a 401, or in tests). */
export function invalidateAccessToken(): void {
  g.__pppPayPalToken = undefined;
  g.__pppPayPalTokenInflight = undefined;
}

async function requestToken(): Promise<string> {
  const env = serverEnv();
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new PayPalAuthError("PayPal credentials are not configured (mock mode)");
  }
  const basic = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const startedAt = Date.now();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    // The body may echo request details; only surface the status.
    throw new PayPalAuthError(`PayPal OAuth token request failed (HTTP ${res.status})`, res.status);
  }
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number" || body.expires_in <= 0) {
    throw new PayPalAuthError("PayPal OAuth response is missing access_token/expires_in");
  }
  g.__pppPayPalToken = {
    token: body.access_token,
    refreshAt: startedAt + Math.floor(body.expires_in * 1000 * TOKEN_REFRESH_FRACTION),
  };
  return body.access_token;
}
