/** GET /api/plans/:id/paypal-trail (id may be the alias "demo"): ids and statuses only. */
import { apiError, json } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { store } from "@/server/store";
import { buildTrail } from "./trail";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const planId = await store.resolvePlanId(id);
    const plan = planId ? await store.getPlan(planId) : null;
    if (!planId || !plan) return apiError("NOT_FOUND", "Plan not found", 404);
    const [webhooks, steps] = await Promise.all([store.listWebhookEvents(planId), store.listAgentSteps(planId)]);
    return json(buildTrail(plan, webhooks, steps));
  });
}
