/** OWNED BY WP-09. POST /api/demo/reset — public "Reset demo" button for judges. */
import type { DemoResponse } from "@/contracts";
import { json } from "@/lib/http";
import { publish } from "@/server/events";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST() {
  await store.resetDemo();
  publish({ type: "DEMO_RESET" });
  const body: DemoResponse = { ok: true, heroPlanId: await store.resolvePlanId("demo") };
  return json(body);
}
