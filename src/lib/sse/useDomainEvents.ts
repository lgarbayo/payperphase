"use client";
/**
 * Scaffold-owned. Subscribe to server domain events over SSE (GET /api/events?planId=…).
 *   useDomainEvents(planId, (e) => { if (e.type === "PAYMENT_CAPTURED") reload(); });
 * Reconnects automatically (EventSource default). The handler ref is kept fresh.
 */
import { useEffect, useRef } from "react";
import { DomainEventSchema, type DomainEvent } from "@/contracts/events";

export function useDomainEvents(planId: string | null | undefined, onEvent: (e: DomainEvent) => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const url = planId ? `/api/events?planId=${encodeURIComponent(planId)}` : "/api/events";
    const es = new EventSource(url);
    es.onmessage = (msg) => {
      try {
        const parsed = DomainEventSchema.safeParse(JSON.parse(msg.data as string));
        if (parsed.success) handler.current(parsed.data);
      } catch {
        /* ignore malformed frames (e.g. keep-alive comments) */
      }
    };
    return () => es.close();
  }, [planId]);
}
