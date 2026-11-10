/**
 * OWNED BY WP-04. POST /api/paypal/orders/:orderId/capture {planId, phaseId, orderId}.
 * COMPLETED → paid + delivered (PAYMENT_CAPTURED over SSE) · PENDING → processing ·
 * DECLINED → the button calls actions.restart() · ALREADY_CAPTURED → reconciled from PayPal.
 */
import { CapturePhaseOrderRequestSchema } from "@/contracts";
import { apiError, json, parseJson } from "@/lib/http";
import { capturePhaseOrder, PaymentNotAllowedError, PayPalApiError } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const parsed = await parseJson(req, CapturePhaseOrderRequestSchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.orderId !== orderId) return apiError("ORDER_MISMATCH", "orderId mismatch", 400);
  try {
    return json(await capturePhaseOrder(parsed.data));
  } catch (e) {
    if (e instanceof PaymentNotAllowedError) return apiError(e.reason, e.message, 409);
    if (e instanceof PayPalApiError) return apiError(e.issue ?? e.errorName ?? "PAYPAL_ERROR", e.message, 502);
    throw e;
  }
}
