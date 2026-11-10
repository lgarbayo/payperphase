/** OWNED BY WP-09. POST /api/plans/:id/whatif — server engine is the source of truth. SCAFFOLD STUB. */
import { WhatIfRequestSchema, type WhatIfResponse } from "@/contracts";
import { reschedule, validateMove } from "@/engine";
import { apiError, json, parseJson } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJson(req, WhatIfRequestSchema);
  if (!parsed.ok) return parsed.response;
  const plan = await store.getPlan(id);
  if (!plan) return apiError("NOT_FOUND", "Plan not found", 404);
  const { today } = await store.getClock();
  const move = { phaseId: parsed.data.phaseId, newStartDate: parsed.data.newStartDate };
  const validation = validateMove(plan, move, today);
  if (!validation.ok) {
    const body: WhatIfResponse = { ok: false, validation };
    return json(body, 409);
  }
  const result = reschedule(plan, move, today);
  if (parsed.data.persist) await store.savePlan(result.plan);
  const body: WhatIfResponse = { ok: true, result };
  return json(body);
}
