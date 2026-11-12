/**
 * POST /api/paypal/orders {planId, phaseId} → CreatePhaseOrderResponse.
 * The amount is read server-side from the stored plan; any amount in the body is ignored (and
 * stripped by the schema). 404 PLAN_NOT_FOUND for an unknown plan; 409 when the phase is not payable
 * yet (no prepayment).
 */
import { CreatePhaseOrderRequestSchema } from "@/contracts";
import { apiError, json, parseJson } from "@/lib/http";
import { createPhaseOrder, PaymentNotAllowedError, PayPalApiError } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseJson(req, CreatePhaseOrderRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return json(await createPhaseOrder({ planId: parsed.data.planId, phaseId: parsed.data.phaseId }), 201);
  } catch (e) {
    if (e instanceof PaymentNotAllowedError) {
      if (e.reason === "PLAN_NOT_FOUND") return apiError(e.reason, "No plan with that id", 404);
      return apiError(e.reason, e.message, 409);
    }
    if (e instanceof PayPalApiError) return apiError(e.issue ?? e.errorName ?? "PAYPAL_ERROR", e.message, 502);
    throw e;
  }
}
