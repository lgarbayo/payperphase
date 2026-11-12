/**
 * Minimal typed PayPal REST client over fetch (Orders v2, Webhooks, Invoicing GET).
 * Every call goes through getAccessToken(); a 401 drops the cached token and retries once.
 */
import { PAYPAL_API_BASE } from "@/env";
import { getAccessToken, invalidateAccessToken } from "./token";

export class PayPalApiError extends Error {
  constructor(
    public readonly status: number,
    /** PayPal error `name`, e.g. UNPROCESSABLE_ENTITY. */
    public readonly errorName: string | undefined,
    /** First `details[].issue`, e.g. INSTRUMENT_DECLINED, ORDER_ALREADY_CAPTURED, DUPLICATE_INVOICE_ID. */
    public readonly issue: string | undefined,
    public readonly debugId: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "PayPalApiError";
  }

  /** True when PayPal reported this issue (in `details[].issue` or as the error name). */
  is(issue: string): boolean {
    return this.issue === issue || this.errorName === issue;
  }
}

export interface PayPalRequestOptions {
  body?: unknown;
  /** PayPal-Request-Id idempotency key. */
  requestId?: string;
}

interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: Array<{ issue?: string; description?: string }>;
}

export async function paypalRequest<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: PayPalRequestOptions = {},
): Promise<T> {
  let res = await send(method, path, opts, await getAccessToken());
  if (res.status === 401) {
    invalidateAccessToken();
    res = await send(method, path, opts, await getAccessToken({ forceRefresh: true }));
  }
  const text = await res.text();
  const body: unknown = text ? safeJson(text) : {};
  if (!res.ok) {
    const err = (body ?? {}) as PayPalErrorBody;
    const issue = err.details?.find((d) => d.issue)?.issue;
    const e = new PayPalApiError(
      res.status,
      err.name,
      issue,
      err.debug_id,
      `PayPal ${method} ${path} failed: HTTP ${res.status}${issue ? ` ${issue}` : err.name ? ` ${err.name}` : ""}`,
    );
    console.warn(`[paypal] ${e.message}${e.debugId ? ` (debug_id ${e.debugId})` : ""}`);
    throw e;
  }
  return body as T;
}

function send(method: string, path: string, opts: PayPalRequestOptions, token: string): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    Prefer: "return=representation",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
  return fetch(`${PAYPAL_API_BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
    cache: "no-store",
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
