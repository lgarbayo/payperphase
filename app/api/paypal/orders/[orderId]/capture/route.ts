/** OWNED BY WP-04. POST /api/paypal/orders/:orderId/capture {planId, phaseId}. SCAFFOLD STUB. */
import { CapturePhaseOrderRequestSchema } from "@/contracts";
import { apiError, json, parseJson } from "@/lib/http";
import { capturePhaseOrder } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const parsed = await parseJson(req, CapturePhaseOrderRequestSchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.orderId !== orderId) return apiError("ORDER_MISMATCH", "orderId mismatch", 400);
  return json(await capturePhaseOrder(parsed.data));
}
