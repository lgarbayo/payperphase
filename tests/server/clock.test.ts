/**
 * WP-09 · Simulated clock: POST /api/clock re-derives every plan's payment statuses through
 * engine.applyPaymentStatuses (mocked, so this does not depend on WP-01), persists, publishes one
 * PHASE_STATUS_CHANGED per change then CLOCK_ADVANCED, and moves the events' simToday.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine")>();
  return { ...actual, applyPaymentStatuses: vi.fn(actual.applyPaymentStatuses) };
});

import { ApiErrorSchema, ClockResponseSchema, SIM_DEFAULT_START, type Plan } from "@/contracts";
import { GOLDEN_PLAN_ID, goldenPlan } from "@/contracts/fixtures/implantCase";
import { applyPaymentStatuses } from "@/engine";
import { getEventSimToday } from "@/server/events";
import { createStore, store } from "@/server/store";
import { GET, POST } from "../../app/api/clock/route";
import { BASE, captureEvents, post, useTmpDataDir } from "./helpers";

const tmp = useTmpDataDir();
const URL_ = `${BASE}/clock`;

/** On 2027-01-04 every plan's ph2 turns upcoming (8 days before its 2027-01-12 visit). */
function mockUpcomingOn(day: string) {
  vi.mocked(applyPaymentStatuses).mockImplementation((plan: Plan, today: string) => {
    if (today !== day) return { plan, changes: [] };
    const ph2 = plan.phases.find((p) => p.id === "ph2")!;
    if (ph2.payment.status === "upcoming") return { plan, changes: [] };
    return {
      plan: {
        ...plan,
        phases: plan.phases.map((p) => (p.id === "ph2" ? { ...p, payment: { ...p.payment, status: "upcoming" as const } } : p)),
      },
      changes: [{ phaseId: "ph2", from: ph2.payment.status, to: "upcoming" as const }],
    };
  });
}

describe("GET/POST /api/clock", () => {
  it("GET returns the labelled simulated clock", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(ClockResponseSchema.parse(await res.json()).clock).toEqual({
      today: SIM_DEFAULT_START,
      startedAt: SIM_DEFAULT_START,
      label: "simulated",
    });
  });

  it("{advanceDays:49} → 2027-01-04: applies statuses to every plan, persists, publishes changes then CLOCK_ADVANCED", async () => {
    await store.savePlan({ ...goldenPlan(), id: "pln_second01", status: "draft" });
    mockUpcomingOn("2027-01-04");
    vi.mocked(applyPaymentStatuses).mockClear();
    const bus = captureEvents();

    const res = await POST(post(URL_, { advanceDays: 49 }));
    bus.stop();

    expect(res.status).toBe(200);
    const { clock } = ClockResponseSchema.parse(await res.json());
    expect(clock).toEqual({ today: "2027-01-04", startedAt: SIM_DEFAULT_START, label: "simulated" });

    // engine called once per plan with the new simulated day
    const calls = vi.mocked(applyPaymentStatuses).mock.calls;
    expect(calls.map(([p, d]) => [p.id, d]).sort()).toEqual([
      [GOLDEN_PLAN_ID, "2027-01-04"],
      ["pln_ribera02", "2027-01-04"],
      ["pln_ribera03", "2027-01-04"],
      ["pln_second01", "2027-01-04"],
    ]);

    // one PHASE_STATUS_CHANGED per returned change, then CLOCK_ADVANCED last
    expect(bus.types()).toEqual([...Array<string>(4).fill("PHASE_STATUS_CHANGED"), "CLOCK_ADVANCED"]);
    const changed = bus.events.filter((e) => e.type === "PHASE_STATUS_CHANGED");
    expect(changed.map((e) => ("planId" in e ? e.planId : "")).sort()).toEqual([GOLDEN_PLAN_ID, "pln_ribera02", "pln_ribera03", "pln_second01"]);
    expect(changed[0]).toMatchObject({ phaseId: "ph2", from: "scheduled", to: "upcoming" });
    expect(bus.events.at(-1)).toMatchObject({ type: "CLOCK_ADVANCED", from: SIM_DEFAULT_START, to: "2027-01-04" });
    // setEventSimToday was updated before publishing
    expect(bus.events.every((e) => e.simToday === "2027-01-04")).toBe(true);
    expect(getEventSimToday()).toBe("2027-01-04");

    // persisted: a fresh store over the same dir sees the new day and statuses
    vi.mocked(applyPaymentStatuses).mockImplementation((plan: Plan) => ({ plan, changes: [] }));
    const reopened = createStore({ dataDir: tmp.dir(), simStart: SIM_DEFAULT_START });
    expect((await reopened.getClock()).today).toBe("2027-01-04");
    const hero = await reopened.getPlan(GOLDEN_PLAN_ID);
    expect(hero?.phases.find((p) => p.id === "ph2")?.payment.status).toBe("upcoming");
  });

  it("{setTo} jumps to a date; no change → no PHASE_STATUS_CHANGED", async () => {
    vi.mocked(applyPaymentStatuses).mockImplementation((plan: Plan) => ({ plan, changes: [] }));
    const bus = captureEvents();
    const res = await POST(post(URL_, { setTo: "2026-12-01" }));
    bus.stop();
    expect(ClockResponseSchema.parse(await res.json()).clock.today).toBe("2026-12-01");
    expect(bus.types()).toEqual(["CLOCK_ADVANCED"]);
  });

  it("two quick advances both count (computed inside the write queue)", async () => {
    vi.mocked(applyPaymentStatuses).mockImplementation((plan: Plan) => ({ plan, changes: [] }));
    await Promise.all([POST(post(URL_, { advanceDays: 7 })), POST(post(URL_, { advanceDays: 7 }))]);
    expect((await store.getClock()).today).toBe("2026-11-30");
  });

  it("validates the body with ClockRequestSchema and answers {error:{code,message}}", async () => {
    for (const body of [{ advanceDays: 0 }, { advanceDays: 1.5 }, { setTo: "2027-02-30" }, {}]) {
      const res = await POST(post(URL_, body));
      expect(res.status).toBe(422);
      expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("VALIDATION");
    }
    const bad = await POST(post(URL_, "{not json"));
    expect(bad.status).toBe(400);
    expect(ApiErrorSchema.parse(await bad.json()).error.code).toBe("BAD_JSON");
    expect((await store.getClock()).today).toBe(SIM_DEFAULT_START);
  });
});
