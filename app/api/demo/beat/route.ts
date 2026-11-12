/**
 * POST /api/demo/beat {beat}: Director Mode beat states (hotkeys 1–6), see
 * src/server/seed.ts. The store publishes DEMO_RESET, then PLAN_APPROVED for B2–B6.
 */
import { DemoBeatRequestSchema, HERO_PLAN_ALIAS, type DemoResponse } from "@/contracts";
import { json, parseJson } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const parsed = await parseJson(req, DemoBeatRequestSchema);
    if (!parsed.ok) return parsed.response;
    await store.applyBeat(parsed.data.beat);
    const body: DemoResponse = { ok: true, heroPlanId: await store.resolvePlanId(HERO_PLAN_ALIAS) };
    return json(body);
  });
}
