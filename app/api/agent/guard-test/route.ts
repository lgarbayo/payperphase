/**
 * OWNED BY WP-10. POST /api/agent/guard-test {planId} — Director key G: pushes one create_invoice with the
 * stale pre-edit amount through the guard, labelled "guard test", so the rejection shows in the feed.
 * SCAFFOLD STUB: validates the body and does nothing.
 */
import { AgentRunRequestSchema } from "@/contracts";
import { json, parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseJson(req, AgentRunRequestSchema);
  if (!parsed.ok) return parsed.response;
  return json({ ok: true, planId: parsed.data.planId, stub: true });
}
