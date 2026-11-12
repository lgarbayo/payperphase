/**
 * GET /api/health: Render's health check (render.yaml healthCheckPath) and the
 * first row of scripts/demo-check.ts.
 *
 * 200 `{ ok: true, version, modes, simToday }` when the env parses and the store answers. Mock
 * modes are healthy: every secret is optional. 503 when the store cannot be read (for example an
 * unwritable or missing disk), so a broken deploy never goes live. Also 503 when an env value is
 * malformed (for example a DEMO_PATIENT_EMAIL that isn't an email); the error names only the keys,
 * never a value.
 */
import type { HealthResponse } from "@/contracts";
import { modes, type Modes } from "@/env";
import { apiError, json } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

/** Short commit SHA Render injects at build and runtime; "dev" anywhere else. */
function buildVersion(commit: string | undefined = process.env.RENDER_GIT_COMMIT): string {
  return commit?.trim() ? commit.trim().slice(0, 7) : "dev";
}

/** Names of the env keys that failed validation, without their values. */
function invalidEnvKeys(err: unknown): string {
  const issues = (err as { issues?: { path?: PropertyKey[] }[] } | null)?.issues;
  const keys = Array.isArray(issues) ? [...new Set(issues.map((i) => String(i.path?.[0] ?? "?")))] : [];
  return keys.length ? keys.join(", ") : "unknown";
}

export async function GET(): Promise<Response> {
  const version = buildVersion();

  let currentModes: Modes;
  try {
    currentModes = modes();
  } catch (err) {
    return apiError("ENV_INVALID", `Malformed environment variable(s): ${invalidEnvKeys(err)}`, 503);
  }

  try {
    const clock = await store.getClock();
    const body: HealthResponse = { ok: true, version, modes: currentModes, simToday: clock.today };
    return json(body, 200, NO_STORE);
  } catch (err) {
    console.error("[health] store unavailable:", err instanceof Error ? err.message : err);
    const body: HealthResponse = { ok: false, version, modes: currentModes, simToday: null };
    return json(body, 503, NO_STORE);
  }
}
