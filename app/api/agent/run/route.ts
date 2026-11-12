/**
 * POST /api/agent/run {planId, trigger?} — queue a reconcile run (default MANUAL) and
 * return its runId immediately; the steps stream to the feed. Idempotent: it never duplicates invoices.
 */
import { AgentRunRequestSchema, AgentTriggerSchema } from "@/contracts";
import { startRun } from "@/agent";
import { apiError, json, parseJson } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

const BodySchema = AgentRunRequestSchema.extend({ trigger: AgentTriggerSchema.optional() });

export async function POST(req: Request) {
  const parsed = await parseJson(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const planId = await store.resolvePlanId(parsed.data.planId);
  if (!planId) return apiError("UNKNOWN_PLAN", "No plan with that id", 404);
  const { runId, done } = startRun(planId, parsed.data.trigger ?? "MANUAL");
  void done.catch((err) => console.error("[agent] manual run failed:", err instanceof Error ? err.message : err));
  return json({ runId, planId }, 202);
}
