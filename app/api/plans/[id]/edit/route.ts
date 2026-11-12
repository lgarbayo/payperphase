/**
 * POST /api/plans/:id/edit: dentist plan edit → engine.applyEdit + diffPlans,
 * saved, PLAN_EDITED {diff} (the agent reissues the invoice), plus the explainDiff wording.
 */
import { EditPlanRequestSchema } from "@/contracts";
import { json, parseJson } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { editPlan } from "@/server/plans";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const parsed = await parseJson(req, EditPlanRequestSchema);
    if (!parsed.ok) return parsed.response;
    return json(await editPlan(id, parsed.data));
  });
}
