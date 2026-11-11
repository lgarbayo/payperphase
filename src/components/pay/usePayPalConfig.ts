"use client";
import { useCallback, useEffect, useState } from "react";
import type { PayPalClientConfig } from "@/lib/paypal/sdk-url";
import { fetchPayPalConfig } from "./sdk";

/** Server-decided PayPal mode + public client id, fetched once per page and shared. */
export function usePayPalConfig(): { config?: PayPalClientConfig; error?: string; retry: () => void } {
  const [state, setState] = useState<{ config?: PayPalClientConfig; error?: string }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchPayPalConfig()
      .then((config) => alive && setState({ config }))
      .catch((e: unknown) => alive && setState({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({});
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
