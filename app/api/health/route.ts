/** OWNED BY WP-13. Health check for Render and demo-check.ts. */
import type { HealthResponse } from "@/contracts";
import { modes } from "@/env";
import { json } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const clock = await store.getClock().catch(() => null);
  const body: HealthResponse = {
    ok: true,
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
    modes: modes(),
    simToday: clock?.today ?? null,
  };
  return json(body);
}
