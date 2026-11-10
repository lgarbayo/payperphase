/** OWNED BY WP-09. POST /api/demo/beat {beat} — Director Mode beat states (hotkeys 1–6). SCAFFOLD STUB: resets. */
import { DemoBeatRequestSchema, HERO_PLAN_ALIAS, type DemoResponse } from "@/contracts";
import { json, parseJson } from "@/lib/http";
import { publish } from "@/server/events";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseJson(req, DemoBeatRequestSchema);
  if (!parsed.ok) return parsed.response;
  await store.applyBeat(parsed.data.beat);
  publish({ type: "DEMO_RESET" });
  const body: DemoResponse = { ok: true, heroPlanId: await store.resolvePlanId(HERO_PLAN_ALIAS) };
  return json(body);
}
