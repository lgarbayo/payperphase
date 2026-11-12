/**
 * Director Mode beats (POST /api/demo/beat) and the public reset (POST /api/demo/reset).
 * Every beat is checked for the resulting hero state, so each video take is reproducible.
 */
import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  DemoBeatSchema,
  DemoResponseSchema,
  HERO_PLAN_ALIAS,
  PlanIdSchema,
  SIM_DEFAULT_START,
  planShortCode,
  type DemoBeat,
  type DomainEvent,
} from "@/contracts";
import { GOLDEN_PLAN_ID, GOLDEN_QUOTE_ID } from "@/contracts/fixtures/implantCase";
import { computeExposure } from "@/engine";
import { store } from "@/server/store";
import { seedCases } from "@data/seed";
import { POST as beatRoute } from "../../app/api/demo/beat/route";
import { POST as resetRoute } from "../../app/api/demo/reset/route";
import { POST as clockRoute } from "../../app/api/clock/route";
import { BASE, captureEvents, post, useTmpDataDir } from "./helpers";

useTmpDataDir();

const seedHero = () => seedCases().find((c) => c.hero)!.plan;

async function beat(b: DemoBeat): Promise<{ heroPlanId: string | null; events: DomainEvent[] }> {
  const bus = captureEvents();
  const res = await beatRoute(post(`${BASE}/demo/beat`, { beat: b }));
  bus.stop();
  expect(res.status).toBe(200);
  const body = DemoResponseSchema.parse(await res.json());
  return { heroPlanId: body.heroPlanId, events: bus.events };
}

/** Dirty the store the way a take does: steps, approvals, a delay, the clock moved on. */
async function dirty(): Promise<void> {
  const hero = (await store.getPlan(HERO_PLAN_ALIAS))!;
  await store.appendAgentStep({
    id: "st_1",
    runId: "run_1",
    planId: hero.id,
    seq: 0,
    at: "2026-11-16T09:00:00.000Z",
    trigger: "MANUAL",
    kind: "run_started",
    mode: "playbook",
    mock: true,
  });
  await store.recordWebhookEvent({ eventId: "WH-1", eventType: "X", receivedAt: "2026-11-16T09:00:00.000Z", verified: true, applied: true });
  await store.updatePlan(hero.id, (p) => ({
    ...p,
    phases: p.phases.map((ph) => (ph.id === "ph2" ? { ...ph, startDate: "2027-02-23", endDate: "2027-02-24", payment: { ...ph.payment, dueDate: "2027-02-23" } } : ph)),
  }));
  await clockRoute(post(`${BASE}/clock`, { advanceDays: 49 }));
}

describe("POST /api/demo/beat", () => {
  it("B1_CLINIC_EMPTY: no hero plan, the seeded quote extraction is available, no PLAN_APPROVED", async () => {
    await dirty();
    const { heroPlanId, events } = await beat("B1_CLINIC_EMPTY");
    expect(heroPlanId).toBeNull();
    expect(await store.resolvePlanId(HERO_PLAN_ALIAS)).toBeNull();
    expect(await store.getPlan(HERO_PLAN_ALIAS)).toBeNull();
    expect(await store.getPlan(GOLDEN_PLAN_ID)).toBeNull();
    expect((await store.listPlans()).some((p) => p.caseKind === "implant")).toBe(false);
    expect((await store.getExtraction(GOLDEN_QUOTE_ID))?.lines).toHaveLength(12);
    expect((await store.getClock()).today).toBe(SIM_DEFAULT_START);
    expect(await store.recordWebhookEvent({ eventId: "WH-1", eventType: "X", receivedAt: "2026-11-16T09:00:00.000Z", verified: true, applied: true })).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["DEMO_RESET"]);
  });

  it("B2_PLAN_SENT: hero approved, phase 1 due, nothing paid, clock at SIM_START_DATE, PLAN_APPROVED after persisting", async () => {
    await dirty();
    const before = (await store.getPlan(HERO_PLAN_ALIAS))!.id;
    const { heroPlanId, events } = await beat("B2_PLAN_SENT");
    expect(PlanIdSchema.safeParse(heroPlanId).success).toBe(true);
    expect(heroPlanId).not.toBe(before);
    const hero = (await store.getPlan(HERO_PLAN_ALIAS))!;
    expect(hero.id).toBe(heroPlanId);
    expect(hero.status).toBe("approved");
    expect(hero.phases.map((p) => p.payment.status)).toEqual(["due", "scheduled", "scheduled", "scheduled"]);
    expect(hero.phases.every((p) => p.delivery.status === "pending")).toBe(true);
    expect(hero.phases.map((p) => p.startDate)).toEqual(seedHero().phases.map((p) => p.startDate));
    expect((await store.getClock()).today).toBe(SIM_DEFAULT_START);
    expect(await store.listAgentSteps(HERO_PLAN_ALIAS)).toEqual([]);
    expect(events.map((e) => e.type)).toEqual(["DEMO_RESET", "PLAN_APPROVED"]);
    expect(events[1]).toMatchObject({ planId: heroPlanId, version: hero.version, simToday: SIM_DEFAULT_START });
  });

  for (const b of ["B3_PHASE1_PAID", "B4_WHATIF_READY", "B5_AGENT_READY", "B6_CLOSURE_READY"] as const) {
    const today = b === "B5_AGENT_READY" ? seedHero().phases[1]!.payment.dueDate : SIM_DEFAULT_START;
    it(`${b}: as B2 plus phase 1 paid + delivered with mock capture ids; original dates; clock ${b === "B5_AGENT_READY" ? "on phase 2's visit day" : "at start"}`, async () => {
      await dirty();
      const { heroPlanId, events } = await beat(b);
      const hero = (await store.getPlan(HERO_PLAN_ALIAS))!;
      expect(hero.id).toBe(heroPlanId);
      expect(hero.status).toBe("approved");
      const [ph1, ...rest] = hero.phases;
      expect(ph1!.payment).toMatchObject({
        status: "paid",
        instrument: "order",
        paidCents: ph1!.amountCents,
      });
      expect(ph1!.payment.captureId).toMatch(/^MOCK-CAPTURE-/);
      expect(ph1!.payment.orderId).toMatch(/^MOCK-ORDER-/);
      expect(ph1!.payment.paidAt).toBeDefined();
      expect(ph1!.delivery).toEqual({ status: "delivered", deliveredOn: SIM_DEFAULT_START });
      expect(rest.every((p) => p.payment.status !== "paid" && p.delivery.status === "pending")).toBe(true);
      // original approved dates, baseline = approved plan
      expect(hero.phases.map((p) => p.startDate)).toEqual(seedHero().phases.map((p) => p.startDate));
      expect(hero.baseline?.phases.map((p) => p.startDate)).toEqual(seedHero().phases.map((p) => p.startDate));
      expect((await store.getClock()).today).toBe(today);
      expect((await store.getClock()).startedAt).toBe(SIM_DEFAULT_START);
      // B5: phase 2 is due (implant day), so the agent invoices it; phases 3–4 are not due yet.
      expect(rest.map((p) => p.payment.status)).toEqual(
        b === "B5_AGENT_READY" ? ["due", "scheduled", "scheduled"] : ["scheduled", "scheduled", "scheduled"],
      );
      // ledger €360 / €360 and €0 exposure
      const exposure = computeExposure(hero, today);
      expect(exposure.paidCents).toBe(36_000);
      expect(exposure.prepaidUndeliveredCents).toBe(0);
      expect(events.map((e) => e.type)).toEqual(["DEMO_RESET", "PLAN_APPROVED"]);
      expect(events[1]).toMatchObject({ planId: heroPlanId, simToday: today });
    });
  }

  it("each beat re-ids the hero (fresh plan4 → unique invoice numbers per take)", async () => {
    const seen = new Set<string>();
    for (const b of DemoBeatSchema.options.filter((x) => x !== "B1_CLINIC_EMPTY")) {
      const { heroPlanId } = await beat(b);
      seen.add(planShortCode(heroPlanId!));
    }
    expect(seen.size).toBe(5);
  });

  it("rejects an unknown beat with {error:{code,message}}", async () => {
    const res = await beatRoute(post(`${BASE}/demo/beat`, { beat: "B9" }));
    expect(res.status).toBe(422);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("VALIDATION");
  });
});

describe("POST /api/demo/reset", () => {
  it("returns state B2 with a new hero id, and publishes DEMO_RESET", async () => {
    await dirty();
    const bus = captureEvents();
    const res = await resetRoute();
    bus.stop();
    expect(res.status).toBe(200);
    const { heroPlanId } = DemoResponseSchema.parse(await res.json());
    expect(heroPlanId).not.toBe(GOLDEN_PLAN_ID);
    expect(await store.resolvePlanId(HERO_PLAN_ALIAS)).toBe(heroPlanId);
    const hero = (await store.getPlan(HERO_PLAN_ALIAS))!;
    expect(hero.phases[0]!.payment.status).toBe("due");
    expect((await store.getClock()).today).toBe(SIM_DEFAULT_START);
    expect(await store.listAgentSteps(GOLDEN_PLAN_ID)).toEqual([]);
    expect(bus.types()[0]).toBe("DEMO_RESET");
    expect(bus.types()).toContain("PLAN_APPROVED");
  });
});
