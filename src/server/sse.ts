/**
 * OWNED BY WP-09. Server-Sent Events stream of DomainEvents for GET /api/events.
 *
 *   ?planId=<id|demo>  only that plan's events; events without a planId (DEMO_RESET,
 *                      CLOCK_ADVANCED) always pass. "demo" follows the CURRENT hero, so a
 *                      /p/demo tab keeps working across resets that re-id the hero plan.
 *   Last-Event-ID      (sent by EventSource on reconnect) replays what was missed, from the
 *                      bus history, so a dropped connection never loses a "paid" event.
 * Frames: `id: <event id>\ndata: <DomainEvent JSON>\n\n`; `: ping` heartbeat every 15 s;
 * the subscription and timer are released when the client aborts or the stream is cancelled.
 */
import { HERO_PLAN_ALIAS, eventPlanId, type DomainEvent } from "@/contracts";
import { eventsSince, subscribe } from "./events";
import { store } from "./store";

export const SSE_HEARTBEAT_MS = 15_000;
/** Client reconnect delay hint (ms). */
export const SSE_RETRY_MS = 3_000;

export const SSE_HEADERS: HeadersInit = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export function sseFrame(e: DomainEvent): string {
  return `id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`;
}

export async function eventStreamResponse(req: Request): Promise<Response> {
  await store.init(); // the alias filter needs the hero id
  const url = new URL(req.url);
  const planFilter = url.searchParams.get("planId");
  const lastEventId = req.headers.get("last-event-id");

  const matches = (e: DomainEvent): boolean => {
    if (!planFilter) return true;
    const pid = eventPlanId(e);
    if (!pid) return true;
    return pid === (planFilter === HERO_PLAN_ALIAS ? store.peekHeroPlanId() : planFilter);
  };

  const encoder = new TextEncoder();
  let release = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let ping: ReturnType<typeof setInterval> | undefined;
      let unsubscribe: (() => void) | undefined;

      function stop(): void {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        unsubscribe?.();
        req.signal.removeEventListener("abort", onAbort);
      }
      function onAbort(): void {
        stop();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
      function send(chunk: string): void {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop(); // the consumer went away
        }
      }

      release = stop;
      send(`retry: ${SSE_RETRY_MS}\n: connected\n\n`);
      if (lastEventId) for (const e of eventsSince(lastEventId) ?? []) if (matches(e)) send(sseFrame(e));
      unsubscribe = subscribe((e) => {
        if (matches(e)) send(sseFrame(e));
      });
      ping = setInterval(() => send(": ping\n\n"), SSE_HEARTBEAT_MS);
      if (req.signal.aborted) onAbort();
      else req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
