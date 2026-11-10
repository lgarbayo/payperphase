/** OWNED BY WP-09. Server-Sent Events stream of DomainEvents (?planId= filters). */
import { eventPlanId } from "@/contracts";
import { subscribe } from "@/server/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const planId = new URL(req.url).searchParams.get("planId");
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      const unsubscribe = subscribe((e) => {
        const pid = eventPlanId(e);
        if (planId && pid && pid !== planId) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      });
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
