/**
 * PayPal full-page redirect fallback: /p/[planId]/return?token=ORDER_ID.
 * Calls reconcileReturn (idempotent) with the real plan id (the URL may carry the alias
 * "demo") and redirects back to /p/[planId]. A failed reconcile still lands on the plan page,
 * which shows the server's truth and keeps listening for the capture/webhook over SSE.
 */
import { redirect } from "next/navigation";
import { reconcileReturn } from "@/lib/paypal";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function ReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { planId } = await params;
  const { token } = await searchParams;
  const orderId = Array.isArray(token) ? token[0] : token;
  if (orderId) {
    try {
      const realId = (await store.resolvePlanId(planId)) ?? planId;
      await reconcileReturn({ planId: realId, orderId });
    } catch (err) {
      console.error("[p/return] reconcileReturn failed", err);
    }
  }
  redirect(`/p/${encodeURIComponent(planId)}`);
}
