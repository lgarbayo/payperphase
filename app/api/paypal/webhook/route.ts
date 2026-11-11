/**
 * OWNED BY WP-04. POST /api/paypal/webhook (PayPal → us).
 * 1. Verify the signature via /v1/notifications/verify-webhook-signature with PAYPAL_WEBHOOK_ID (401 if not).
 * 2. Dedupe on the PayPal event id, route, apply through transition(), or GET-reconcile.
 * Always 200 once verified and handled, so PayPal stops retrying.
 */
import { z } from "zod";
import { apiError, json } from "@/lib/http";
import { handleWebhookEvent, verifyWebhookSignature } from "@/lib/paypal";

export const dynamic = "force-dynamic";

const WebhookEventSchema = z
  .object({
    id: z.string().min(1),
    event_type: z.string().min(1),
    create_time: z.string().optional(),
    resource_type: z.string().optional(),
    resource: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyWebhookSignature({ headers: req.headers, rawBody }))) {
    return apiError("INVALID_SIGNATURE", "Webhook signature could not be verified", 401);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return apiError("BAD_JSON", "Body must be JSON", 400);
  }
  const parsed = WebhookEventSchema.safeParse(raw);
  if (!parsed.success) return apiError("VALIDATION", "Not a PayPal webhook event", 422);
  return json(await handleWebhookEvent(parsed.data, { verified: true }));
}
