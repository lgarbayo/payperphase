/**
 * Finding server-store-3: a persisted what-if that changes a milestone's status must publish
 * PHASE_STATUS_CHANGED (the agent sends the reminder on "upcoming"). engine.reschedule already
 * re-derives the moved phases' statuses, so the server must compare against the stored plan.
 * Real engine, no mocks.
 */
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "@/contracts";
import { store } from "@/server/store";
import { POST as beatRoute } from "../../app/api/demo/beat/route";
import { POST as whatifRoute } from "../../app/api/plans/[id]/whatif/route";
import { BASE, captureEvents, ctx, post, useTmpDataDir } from "./helpers";

useTmpDataDir();

describe("persisted what-if status transitions", () => {
  it("moving ph1 from its visit day into the upcoming window publishes due → upcoming", async () => {
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B2_PLAN_SENT" }));
    const id = (await store.resolvePlanId("demo"))!;
    expect((await store.getPlan(id))!.phases[0]!.payment.status).toBe("due");

    const bus = captureEvents();
    const res = await whatifRoute(post(`${BASE}/plans/demo/whatif`, { phaseId: "ph1", newStartDate: "2026-11-23" }), ctx({ id: "demo" }));
    bus.stop();
    expect(res.status).toBe(200);

    const stored = (await store.getPlan(id))!;
    expect(stored.phases[0]!.startDate).toBe("2026-11-23");
    expect(stored.phases[0]!.payment.status).toBe("upcoming");
    expect(bus.types()[0]).toBe("PLAN_RESCHEDULED");
    const status = bus.events.filter((e): e is Extract<DomainEvent, { type: "PHASE_STATUS_CHANGED" }> => e.type === "PHASE_STATUS_CHANGED");
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ type: "PHASE_STATUS_CHANGED", planId: id, phaseId: "ph1", from: "due", to: "upcoming" });
  });

  it("a move that changes no status publishes only PLAN_RESCHEDULED", async () => {
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B2_PLAN_SENT" }));
    const bus = captureEvents();
    const res = await whatifRoute(post(`${BASE}/plans/demo/whatif`, { phaseId: "ph2", newStartDate: "2027-02-23" }), ctx({ id: "demo" }));
    bus.stop();
    expect(res.status).toBe(200);
    expect(bus.types()).toEqual(["PLAN_RESCHEDULED"]);
  });
});
