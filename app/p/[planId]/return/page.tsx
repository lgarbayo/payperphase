/**
 * OWNED BY WP-06. PayPal full-page redirect fallback: /p/[planId]/return?token=ORDER_ID.
 * Calls WP-04's reconcileReturn (idempotent) and redirects back to the plan.
 */
import { redirect } from "next/navigation";
import { reconcileReturn } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export default async function ReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { planId } = await params;
  const { token } = await searchParams;
  if (token) await reconcileReturn({ planId, orderId: token });
  redirect(`/p/${planId}`);
}
