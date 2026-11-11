/**
 * OWNED BY WP-09. POST /api/demo/reset: the public "Reset demo" button (judges, Director R key).
 * Beat state B2 with a freshly re-id'd hero; the store publishes DEMO_RESET then PLAN_APPROVED.
 */
import type { DemoResponse } from "@/contracts";
import { json } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleRoute(async () => {
    await store.resetDemo();
    const body: DemoResponse = { ok: true, heroPlanId: await store.resolvePlanId("demo") };
    return json(body);
  });
}
