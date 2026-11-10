/** OWNED BY WP-04. GET /api/paypal/config → PayPalClientConfig (mode, public client id, buyer country). */
import { json } from "@/lib/http";
import { paypalClientConfig } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(paypalClientConfig(), 200, { "Cache-Control": "no-store" });
}
