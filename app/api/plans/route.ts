/** OWNED BY WP-09. GET list · POST create a draft plan from a stored extraction (engine.buildPlan). */
import { CreatePlanRequestSchema, type ListPlansResponse, type PlanResponse } from "@/contracts";
import { json, parseJson } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { createDraftPlan } from "@/server/plans";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const body: ListPlansResponse = { plans: await store.listPlans() };
    return json(body);
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const parsed = await parseJson(req, CreatePlanRequestSchema);
    if (!parsed.ok) return parsed.response;
    const body: PlanResponse = { plan: await createDraftPlan(parsed.data) };
    return json(body, 201);
  });
}
