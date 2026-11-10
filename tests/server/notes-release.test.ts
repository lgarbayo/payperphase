/**
 * WP-09 · Integration follow-ups against the REAL engine: the bone-graft edit makes ph3 cite
 * BONE_GRAFT_HEALING_16W, which the patient must not see until the clinic approves it; engine
 * refusals on edit/what-if are 4xx, never 500.
 */
import { describe, expect, it } from "vitest";
import {
  HERO_PLAN_ALIAS,
  PlanResponseSchema,
  PlanViewResponseSchema,
  type PlanViewResponse,
} from "@/contracts";
import { GOLDEN_BONE_GRAFT_EDIT, GOLDEN_DENTIST, GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { POST as beatRoute } from "../../app/api/demo/beat/route";
import { GET as getPlanRoute } from "../../app/api/plans/[id]/route";
import { POST as approveRoute } from "../../app/api/plans/[id]/approve/route";
import { POST as editRoute } from "../../app/api/plans/[id]/edit/route";
import { POST as whatifRoute } from "../../app/api/plans/[id]/whatif/route";
import { BASE, captureEvents, ctx, get, post, useTmpDataDir } from "./helpers";

useTmpDataDir();
const NOTE = "BONE_GRAFT_HEALING_16W";
const demo = ctx({ id: HERO_PLAN_ALIAS });

async function view(kind: "patient" | "clinic"): Promise<PlanViewResponse> {
  return PlanViewResponseSchema.parse(await (await getPlanRoute(get(`${BASE}/plans/demo?view=${kind}`), demo)).json());
}

describe("bone-graft note stays hidden from the patient until the clinic approves it", () => {
  it("edit → patient view hides the note → clinic releases it → patient sees it", async () => {
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B5_AGENT_READY" }));
    const edit = await editRoute(post(`${BASE}/plans/demo/edit`, { edit: GOLDEN_BONE_GRAFT_EDIT, editedBy: GOLDEN_DENTIST }), demo);
    expect(edit.status).toBe(200);

    const clinic = await view("clinic");
    expect(clinic.plan.phases.some((p) => p.noteIds.includes(NOTE))).toBe(true);
    const before = await view("patient");
    expect(before.notes.map((n) => n.id)).not.toContain(NOTE);
    expect(before.plan.phases.flatMap((p) => p.noteIds)).not.toContain(NOTE);
    expect(before.plan.approvedNotes.map((n) => n.noteId)).not.toContain(NOTE);

    // the clinic releases just that note; no PLAN_APPROVED (the agent must not reissue invoices)
    const bus = captureEvents();
    const released = await approveRoute(post(`${BASE}/plans/demo/approve`, { approvedBy: GOLDEN_DENTIST, noteIds: [NOTE] }), demo);
    bus.stop();
    expect(released.status).toBe(200);
    const plan = PlanResponseSchema.parse(await released.json()).plan;
    expect(plan.approvedNotes.map((n) => n.noteId)).toEqual([...GOLDEN_PLAN.approvedNotes.map((n) => n.noteId), NOTE]);
    expect(plan.version).toBe(clinic.plan.version);
    expect(bus.types()).not.toContain("PLAN_APPROVED");

    const after = await view("patient");
    expect(after.notes.map((n) => n.id)).toContain(NOTE);
    expect(after.plan.phases.flatMap((p) => p.noteIds)).toContain(NOTE);

    // approving the same note again is a 409, not a silent no-op
    const again = await approveRoute(post(`${BASE}/plans/demo/approve`, { approvedBy: GOLDEN_DENTIST, noteIds: [NOTE] }), demo);
    expect(again.status).toBe(409);
  });

  it("an engine refusal on edit is a 4xx with {error:{code}}", async () => {
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B5_AGENT_READY" }));
    // ph1 is paid + delivered in B5: the engine refuses to edit it
    const res = await editRoute(
      post(`${BASE}/plans/demo/edit`, {
        edit: { kind: "SET_UNIT_PRICE", lineId: GOLDEN_PLAN.phases[0]!.lineIds[0], unitPriceCents: 100 },
        editedBy: GOLDEN_DENTIST,
      }),
      demo,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect((await res.json()).error.code).toBe("PHASE_PAID");
  });

  it("a persisted move on a paid phase is rejected 4xx, never 500", async () => {
    await beatRoute(post(`${BASE}/demo/beat`, { beat: "B4_WHATIF_READY" }));
    const res = await whatifRoute(post(`${BASE}/plans/demo/whatif`, { phaseId: "ph1", newStartDate: "2026-12-14" }), demo);
    expect(res.status).toBe(409);
  });
});
