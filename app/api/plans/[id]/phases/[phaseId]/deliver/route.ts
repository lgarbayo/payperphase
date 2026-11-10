/** OWNED BY WP-09. POST /api/plans/:id/phases/:phaseId/deliver — clinic marks a phase delivered. SCAFFOLD STUB. */
import type { PlanResponse } from "@/contracts";
import { markDelivered } from "@/engine";
import { apiError, json, nowIso } from "@/lib/http";
import { publish } from "@/server/events";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; phaseId: string }> }) {
  const { id, phaseId } = await params;
  const plan = await store.getPlan(id);
  if (!plan) return apiError("NOT_FOUND", "Plan not found", 404);
  if (!plan.phases.some((p) => p.id === phaseId)) return apiError("UNKNOWN_PHASE", "Phase not found", 404);
  const { today } = await store.getClock();
  const next = await store.updatePlan(plan.id, (p) => ({ ...markDelivered(p, phaseId, today), updatedAt: nowIso() }));
  publish({ type: "PHASE_DELIVERED", planId: next.id, phaseId });
  const body: PlanResponse = { plan: next };
  return json(body);
}
