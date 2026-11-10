/**
 * WP-09 · The demo path through the real API and the REAL engine (WP-01): B1 → create from the
 * seeded quote → approve (becomes the hero) → delay what-if → illegal move → bone-graft edit →
 * clock +7 weeks. Skipped while src/engine is still the scaffold stub (it runs after WP-01 merges).
 */
import { describe, expect, it } from "vitest";
import * as engine from "@/engine";
import {
  EditPlanResponseSchema,
  HERO_PLAN_ALIAS,
  PlanResponseSchema,
  WhatIfResponseSchema,
  type DomainEvent,
} from "@/contracts";
import {
  GOLDEN_BONE_GRAFT_DIFF,
  GOLDEN_BONE_GRAFT_EDIT,
  GOLDEN_DELAY_MOVE,
  GOLDEN_DENTIST,
  GOLDEN_ILLEGAL_MOVE,
  GOLDEN_PLAN,
  GOLDEN_QUOTE_ID,
} from "@/contracts/fixtures/implantCase";
import { store } from "@/server/store";
import { POST as beatRoute } from "../../app/api/demo/beat/route";
import { POST as createRoute } from "../../app/api/plans/route";
import { POST as approveRoute } from "../../app/api/plans/[id]/approve/route";
import { POST as whatifRoute } from "../../app/api/plans/[id]/whatif/route";
import { POST as editRoute } from "../../app/api/plans/[id]/edit/route";
import { POST as clockRoute } from "../../app/api/clock/route";
import { BASE, captureEvents, ctx, post, useTmpDataDir } from "./helpers";

/** WP-01's engine exports paymentStatusAt; the scaffold stub does not. */
const realEngine = typeof (engine as Record<string, unknown>).paymentStatusAt === "function";

useTmpDataDir();

describe.runIf(realEngine)("demo path with the real engine", () => {
  it("B1 → create → approve → what-if → snap-back → bone graft → clock reminder transition", async () => {
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B1_CLINIC_EMPTY" }));
    expect(await store.resolvePlanId(HERO_PLAN_ALIAS)).toBeNull();

    // clinic: quote → draft → approve & send
    const created = PlanResponseSchema.parse(await (await createRoute(post(`${BASE}/plans`, { quoteId: GOLDEN_QUOTE_ID }))).json());
    const id = created.plan.id;
    expect(created.plan.phases.map((p) => [p.startDate, p.amountCents])).toEqual(
      GOLDEN_PLAN.phases.map((p) => [p.startDate, p.amountCents]),
    );
    const approved = PlanResponseSchema.parse(
      await (
        await approveRoute(
          post(`${BASE}/plans/${id}/approve`, { approvedBy: GOLDEN_DENTIST, noteIds: GOLDEN_PLAN.approvedNotes.map((n) => n.noteId) }),
          ctx({ id }),
        )
      ).json(),
    ).plan;
    expect(approved.status).toBe("approved");
    expect(approved.phases.map((p) => p.payment.status)).toEqual(["due", "scheduled", "scheduled", "scheduled"]);
    expect(await store.resolvePlanId(HERO_PLAN_ALIAS)).toBe(id);

    // patient: delay what-if (ph3/ph4 follow by 42 days), baseline kept
    const delayed = WhatIfResponseSchema.parse(
      await (await whatifRoute(post(`${BASE}/plans/demo/whatif`, GOLDEN_DELAY_MOVE), ctx({ id: HERO_PLAN_ALIAS }))).json(),
    );
    if (!delayed.ok) throw new Error("delay should be legal");
    expect(delayed.result.plan.phases.map((p) => p.startDate)).toEqual(["2026-11-16", "2027-02-23", "2027-05-19", "2027-06-03"]);
    expect(delayed.result.plan.baseline).toEqual(approved.baseline);

    // illegal drag → 409 with the dentist's note
    const illegal = await whatifRoute(post(`${BASE}/plans/demo/whatif`, GOLDEN_ILLEGAL_MOVE), ctx({ id: HERO_PLAN_ALIAS }));
    expect(illegal.status).toBe(409);
    const rejected = WhatIfResponseSchema.parse(await illegal.json());
    expect(rejected.ok === false && rejected.validation).toMatchObject({ ok: false, reason: "MIN_LAG", noteId: "HEALING_EXTRACTION_MIN_8W" });

    // B5 restores the approved dates; the bone graft gives exactly the golden diff
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B5_AGENT_READY" }));
    const hero = (await store.resolvePlanId(HERO_PLAN_ALIAS))!;
    const edited = EditPlanResponseSchema.parse(
      await (
        await editRoute(post(`${BASE}/plans/demo/edit`, { edit: GOLDEN_BONE_GRAFT_EDIT, editedBy: GOLDEN_DENTIST }), ctx({ id: HERO_PLAN_ALIAS }))
      ).json(),
    );
    expect(edited.diff).toEqual({ ...GOLDEN_BONE_GRAFT_DIFF, planId: hero });

    // clock +7 weeks → ph2 (2027-01-12) turns upcoming → the agent's reminder trigger
    const bus = captureEvents();
    await clockRoute(post(`${BASE}/clock`, { advanceDays: 49 }));
    bus.stop();
    const changes = bus.events.filter((e): e is Extract<DomainEvent, { type: "PHASE_STATUS_CHANGED" }> => e.type === "PHASE_STATUS_CHANGED");
    expect(changes).toContainEqual(expect.objectContaining({ planId: hero, phaseId: "ph2", from: "scheduled", to: "upcoming" }));
    expect(bus.types().at(-1)).toBe("CLOCK_ADVANCED");
  });
});
