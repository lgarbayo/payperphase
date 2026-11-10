/** OWNED BY WP-04. POST /api/paypal/orders {planId, phaseId} — amount read server-side. SCAFFOLD STUB. */
import { CreatePhaseOrderRequestSchema } from "@/contracts";
import { apiError, json, parseJson } from "@/lib/http";
import { createPhaseOrder, PaymentNotAllowedError } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseJson(req, CreatePhaseOrderRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return json(await createPhaseOrder(parsed.data), 201);
  } catch (e) {
    if (e instanceof PaymentNotAllowedError) return apiError(e.reason, e.message, 409);
    throw e;
  }
}
