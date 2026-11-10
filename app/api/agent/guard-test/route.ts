/**
 * OWNED BY WP-10. POST /api/agent/guard-test {planId} — Director key G: pushes one create_invoice with the
 * stale pre-edit amount through the guard, labelled "guard test", so the rejection shows in the feed.
 * The call is only ever checked, never sent to PayPal.
 */
import { AgentRunRequestSchema } from "@/contracts";
import { runGuardTest } from "@/agent";
import { apiError, json, parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseJson(req, AgentRunRequestSchema);
  if (!parsed.ok) return parsed.response;
  const result = await runGuardTest(parsed.data.planId);
  if (!result) return apiError("UNKNOWN_PLAN", "No plan with that id", 404);
  return json(result);
}
