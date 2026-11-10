/**
 * Scaffold-owned helpers for App Router route handlers.
 *   export async function POST(req: Request) {
 *     const body = await parseJson(req, CreatePlanRequestSchema); if (!body.ok) return body.response;
 *     return json({ plan });
 *   }
 */
import type { z } from "zod";

export function json<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function apiError(code: string, message: string, status = 400): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function parseJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: apiError("BAD_JSON", "Body must be JSON", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: apiError("VALIDATION", parsed.error.issues.map((i) => i.message).join("; "), 422) };
  }
  return { ok: true, data: parsed.data };
}

/** Wall-clock ISO timestamp (audit fields only — never for scheduling, use the simulated clock). */
export function nowIso(): string {
  return new Date().toISOString();
}
