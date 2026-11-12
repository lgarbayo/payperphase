/** GET /api/agent/steps?planId= — audit trail + pending approvals. */
import type { AgentStepsResponse } from "@/contracts";
import { apiError, json } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const planId = new URL(req.url).searchParams.get("planId");
  if (!planId) return apiError("MISSING_PLAN", "planId is required", 400);
  const real = (await store.resolvePlanId(planId)) ?? planId;
  const body: AgentStepsResponse = {
    steps: await store.listAgentSteps(real),
    approvals: await store.listPendingApprovals(real),
  };
  return json(body);
}
