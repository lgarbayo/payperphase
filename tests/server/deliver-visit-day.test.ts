/**
 * Finding server-store-4: care cannot be delivered before its visit day. The clinic's "mark
 * delivered" on a future phase must be refused, so an early invoice-rail payment keeps showing in
 * the exposure meter (ADR-6, ADR-8, SECURITY.md). Real engine, no mocks.
 */
import { describe, expect, it } from "vitest";
import { ApiErrorSchema, PlanResponseSchema } from "@/contracts";
import { computeExposure } from "@/engine";
import { applyPaymentEvent } from "@/lib/paypal/apply";
import { store } from "@/server/store";
import { POST as beatRoute } from "../../app/api/demo/beat/route";
import { POST as clockRoute } from "../../app/api/clock/route";
import { POST as deliverRoute } from "../../app/api/plans/[id]/phases/[phaseId]/deliver/route";
import { BASE, captureEvents, ctx, post, useTmpDataDir } from "./helpers";

useTmpDataDir();

const deliverUrl = (phaseId: string) => `${BASE}/plans/demo/phases/${phaseId}/deliver`;

describe("POST /api/plans/:id/phases/:phaseId/deliver before the visit day", () => {
  it("refuses a phase whose visit is still ahead, so an early invoice payment stays visible", async () => {
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B2_PLAN_SENT" }));
    const id = (await store.resolvePlanId("demo"))!;
    const paid = await applyPaymentEvent({
      planId: id,
      phaseId: "ph3",
      event: { type: "INVOICE_PAID", invoiceId: "INV2-EARLY-0003", amountCents: 52_000, paidAt: "2026-11-16T10:00:00Z" },
      via: "webhook",
    });
    expect(paid).toMatchObject({ changed: true, from: "scheduled", to: "paid" });
    const { today } = await store.getClock();
    expect(computeExposure((await store.getPlan(id))!, today).prepaidUndeliveredCents).toBe(52_000);

    const bus = captureEvents();
    const res = await deliverRoute(post(deliverUrl("ph3")), ctx({ id: "demo", phaseId: "ph3" }));
    bus.stop();
    expect(res.status).toBe(409);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("VISIT_NOT_REACHED");
    expect(bus.events).toEqual([]);

    const stored = (await store.getPlan(id))!;
    expect(stored.phases[2]!.delivery).toEqual({ status: "pending" });
    expect(computeExposure(stored, today).prepaidUndeliveredCents).toBe(52_000);
  });

  it("still delivers a phase on its visit day (and after it), idempotently", async () => {
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B2_PLAN_SENT" }));
    const ok = await deliverRoute(post(deliverUrl("ph1")), ctx({ id: "demo", phaseId: "ph1" }));
    expect(ok.status).toBe(200);
    expect(PlanResponseSchema.parse(await ok.json()).plan.phases[0]!.delivery).toEqual({ status: "delivered", deliveredOn: "2026-11-16" });
    expect((await deliverRoute(post(deliverUrl("ph1")), ctx({ id: "demo", phaseId: "ph1" }))).status).toBe(200);

    // after ph2's visit day the clinic can close it out
    await clockRoute(post(`${BASE}/clock`, { setTo: "2027-01-13" }));
    const later = await deliverRoute(post(deliverUrl("ph2")), ctx({ id: "demo", phaseId: "ph2" }));
    expect(later.status).toBe(200);
  });
});
