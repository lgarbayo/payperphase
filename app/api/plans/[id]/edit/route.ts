/**
 * OWNED BY WP-09. POST /api/plans/:id/edit — dentist plan edit → engine.applyEdit + diffPlans +
 * explainDiff, then PLAN_EDITED (the agent reissues the invoice). SCAFFOLD STUB.
 */
import { EditPlanRequestSchema, type EditPlanResponse } from "@/contracts";
import { explainDiff } from "@/ai/wording";
import { applyEdit, diffPlans } from "@/engine";
import { apiError, json, nowIso, parseJson } from "@/lib/http";
import { publish } from "@/server/events";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJson(req, EditPlanRequestSchema);
  if (!parsed.ok) return parsed.response;
  const before = await store.getPlan(id);
  if (!before) return apiError("NOT_FOUND", "Plan not found", 404);
  const after = applyEdit(before, parsed.data.edit, nowIso());
  const diff = diffPlans(before, after);
  const explanation = await explainDiff(diff, after);
  await store.savePlan(after);
  publish({ type: "PLAN_EDITED", planId: after.id, diff });
  const body: EditPlanResponse = { plan: after, diff, explanation };
  return json(body);
}
