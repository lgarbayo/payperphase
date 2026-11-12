/**
 * Typed route errors → `{ error: { code, message } }` (src/lib/http.ts).
 * Route handlers wrap their body in `handleRoute` so a thrown RouteError, a not-found store
 * update or an engine refusal becomes a clean 4xx instead of an unhandled 500.
 */
import { apiError } from "@/lib/http";

export class RouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

/** Thrown by the store when an update targets a plan id (or alias) that does not exist. */
export class PlanNotFoundError extends RouteError {
  constructor(id: string) {
    super(404, "NOT_FOUND", `Plan not found: ${id}`);
    this.name = "PlanNotFoundError";
  }
}

/** Thrown by the store when a write would persist data that fails the contract schemas. */
export class InvalidRecordError extends RouteError {
  constructor(kind: string, detail: string) {
    super(422, "INVALID_RECORD", `Refusing to store an invalid ${kind}: ${detail}`);
    this.name = "InvalidRecordError";
  }
}

/** Engine refusals that mean "conflicts with the plan's current state" rather than "bad input". */
const ENGINE_CONFLICTS = new Set(["PHASE_PAID", "PHASE_DELIVERED", "INVALID_MOVE", "SPLIT_LINE"]);

/** Duck-typed so it works with the scaffold engine stub (no EngineError) and the real engine. */
function engineErrorCode(err: unknown): string | null {
  if (!(err instanceof Error) || err.name !== "EngineError") return null;
  const code: unknown = (err as Error & { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof RouteError) return apiError(err.code, err.message, err.status);
  const engineCode = engineErrorCode(err);
  if (engineCode) return apiError(engineCode, (err as Error).message, ENGINE_CONFLICTS.has(engineCode) ? 409 : 422);
  console.error("[api] unhandled error:", err);
  return apiError("INTERNAL", err instanceof Error ? err.message : "Unexpected error", 500);
}

export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return errorResponse(err);
  }
}
