/** Server-Sent Events stream of DomainEvents (?planId= filters; see src/server/sse.ts). */
import { eventStreamResponse } from "@/server/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return eventStreamResponse(req);
}
