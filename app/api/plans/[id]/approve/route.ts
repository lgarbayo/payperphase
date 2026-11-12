/**
 * POST /api/plans/:id/approve: the dentist's "Approve & send to patient" click
 * (also the human approval for the initial per-phase invoice issue, see src/agent). Draft only (409
 * otherwise); an implant plan becomes the hero ("demo"); publishes PLAN_APPROVED.
 */
import { ApprovePlanRequestSchema, type PlanResponse } from "@/contracts";
import { json, parseJson } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { approvePlan } from "@/server/plans";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const parsed = await parseJson(req, ApprovePlanRequestSchema);
    if (!parsed.ok) return parsed.response;
    const body: PlanResponse = { plan: await approvePlan(id, parsed.data) };
    return json(body);
  });
}
