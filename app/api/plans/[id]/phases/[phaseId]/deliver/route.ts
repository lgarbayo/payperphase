/** POST /api/plans/:id/phases/:phaseId/deliver: the clinic marks a phase delivered. */
import type { PlanResponse } from "@/contracts";
import { json } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { deliverPhase } from "@/server/plans";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; phaseId: string }> }) {
  return handleRoute(async () => {
    const { id, phaseId } = await params;
    const body: PlanResponse = { plan: await deliverPhase(id, phaseId) };
    return json(body);
  });
}
