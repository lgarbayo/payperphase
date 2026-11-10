"use client";
/**
 * OWNED BY WP-04. Browser-side PayPal JS SDK v5 loader + the config fetch. Each SDK URL (client id,
 * locale, intent) is loaded exactly once per page, under its own data-namespace, and shared by every
 * PayPhaseButton and PayLaterMessage on the page.
 */
import { sdkNamespace, type PayPalClientConfig } from "@/lib/paypal/sdk-url";

// ---- Minimal typings for the slices of the JS SDK we use ------------------------------------
export interface PayPalButtonsActions {
  restart: () => Promise<void> | void;
}
export interface PayPalButtonsOptions {
  style?: Record<string, unknown>;
  fundingSource?: string;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }, actions: PayPalButtonsActions) => Promise<void>;
  onCancel?: (data: { orderID?: string }) => void;
  onError?: (err: unknown) => void;
}
export interface PayPalButtonsInstance {
  render: (container: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
  isEligible?: () => boolean;
}
export interface PayPalMessagesOptions {
  amount: number;
  currency?: string;
  placement?: string;
  style?: Record<string, unknown>;
  onRender?: () => void;
}
export interface PayPalNamespace {
  Buttons: (o: PayPalButtonsOptions) => PayPalButtonsInstance;
  Messages?: (o: PayPalMessagesOptions) => { render: (container: HTMLElement) => Promise<void> };
  FUNDING?: Record<string, string>;
  version?: string;
}

// ---- SDK loader ------------------------------------------------------------------------------
const loads = new Map<string, Promise<PayPalNamespace>>();

export function loadPayPalSdk(url: string): Promise<PayPalNamespace> {
  const hit = loads.get(url);
  if (hit) return hit;
  const ns = sdkNamespace(url);
  const promise = new Promise<PayPalNamespace>((resolve, reject) => {
    const w = window as unknown as Record<string, PayPalNamespace | undefined>;
    const ready = w[ns];
    if (ready) return resolve(ready);
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.setAttribute("data-namespace", ns);
    script.onload = () => {
      const sdk = w[ns];
      if (sdk) resolve(sdk);
      else reject(new Error("PayPal SDK loaded without its namespace"));
    };
    script.onerror = () => {
      loads.delete(url);
      script.remove();
      reject(new Error("PayPal SDK failed to load"));
    };
    document.head.appendChild(script);
  });
  loads.set(url, promise);
  return promise;
}

/** Test helper. */
export function resetPayPalSdkCache(): void {
  loads.clear();
  configPromise = null;
}

// ---- Config (mode + public client id) --------------------------------------------------------
let configPromise: Promise<PayPalClientConfig> | null = null;

export function fetchPayPalConfig(): Promise<PayPalClientConfig> {
  configPromise ??= fetch("/api/paypal/config", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as PayPalClientConfig;
    })
    .catch((e: unknown) => {
      configPromise = null;
      throw e;
    });
  return configPromise;
}

// ---- JSON POST that keeps the API error code -------------------------------------------------
export type PostResult<T> = { ok: true; body: T } | { ok: false; status: number; code: string };

export async function postJson<T>(url: string, json: unknown): Promise<PostResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) });
  } catch {
    return { ok: false, status: 0, code: "NETWORK" };
  }
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
  if (!res.ok) return { ok: false, status: res.status, code: body.error?.code ?? `HTTP_${res.status}` };
  return { ok: true, body: body as T };
}
