/**
 * OWNED BY WP-04. Server-only PayPal checkout: OAuth token cache, Orders v2 create/capture per phase,
 * webhook verification, redirect-return reconcile. Amounts ALWAYS come from the store, never the client.
 * SCAFFOLD STUB: mock mode only (no network).
 */
import type {
  CapturePhaseOrderRequest,
  CapturePhaseOrderResponse,
  CreatePhaseOrderRequest,
  CreatePhaseOrderResponse,
} from "@/contracts";
import { canCreateOrder } from "@/engine";
import { store } from "@/server/store";

export class PaymentNotAllowedError extends Error {
  constructor(public readonly reason: string) {
    super(`Order not allowed: ${reason}`);
  }
}

export async function createPhaseOrder(req: CreatePhaseOrderRequest): Promise<CreatePhaseOrderResponse> {
  const plan = await store.getPlan(req.planId);
  if (!plan) throw new PaymentNotAllowedError("UNKNOWN_PLAN");
  const clock = await store.getClock();
  const ok = canCreateOrder(plan, req.phaseId, clock.today);
  if (!ok.ok) throw new PaymentNotAllowedError(ok.reason);
  return { orderId: `MOCK-${req.planId}-${req.phaseId}-${Date.now()}`, amountCents: ok.amountCents, mode: "mock" };
}

export async function capturePhaseOrder(req: CapturePhaseOrderRequest): Promise<CapturePhaseOrderResponse> {
  void req;
  return { outcome: "COMPLETED", captureId: `MOCK-CAPTURE-${Date.now()}`, mode: "mock" };
}

/** For buyers who come back via full-page redirect (/p/[planId]/return?token=ORDER_ID). Idempotent. */
export async function reconcileReturn(args: { planId: string; orderId: string }): Promise<{
  phaseId: string | null;
  outcome: CapturePhaseOrderResponse["outcome"] | "UNKNOWN_ORDER";
}> {
  void args;
  return { phaseId: null, outcome: "UNKNOWN_ORDER" };
}
