/**
 * Findings server-store-2 / server-store-8: an approved phase summary is text rendered from slot
 * templates with the engine values of approval time. After an edit or a persisted what-if moves a
 * phase's amount, date or healing minimum, the patient must never read the old figures next to the
 * engine's new ones on the same card.
 */
import { describe, expect, it } from "vitest";
import { PlanResponseSchema, PlanViewResponseSchema, type Plan } from "@/contracts";
import {
  GOLDEN_BONE_GRAFT_EDIT,
  GOLDEN_DELAY_MOVE,
  GOLDEN_DENTIST,
  GOLDEN_QUOTE_ID,
} from "@/contracts/fixtures/implantCase";
import { draftPhaseWording, fillLocalized, phaseSlotValues } from "@/ai/wording";
import { NOTE_LIBRARY } from "@data/seed/notes";
import { POST as beatRoute } from "../../app/api/demo/beat/route";
import { POST as createRoute } from "../../app/api/plans/route";
import { GET as planRoute } from "../../app/api/plans/[id]/route";
import { POST as approveRoute } from "../../app/api/plans/[id]/approve/route";
import { POST as whatifRoute } from "../../app/api/plans/[id]/whatif/route";
import { POST as editRoute } from "../../app/api/plans/[id]/edit/route";
import { BASE, ctx, get, post, useTmpDataDir } from "./helpers";

useTmpDataDir();

/** B1 → create from the hero quote → approve with every wording draft's rendered text ("use this text"). */
async function approvedWithSummaries(): Promise<{ id: string; templates: Map<string, Plan["phases"][number]["title"]> }> {
  await beatRoute(post(`${BASE}/demo/beat`, { beat: "B1_CLINIC_EMPTY" }));
  const created = PlanResponseSchema.parse(await (await createRoute(post(`${BASE}/plans`, { quoteId: GOLDEN_QUOTE_ID }))).json()).plan;
  const drafts = await draftPhaseWording(created, NOTE_LIBRARY, { client: null });
  const res = await approveRoute(
    post(`${BASE}/plans/${created.id}/approve`, {
      approvedBy: GOLDEN_DENTIST,
      noteIds: [],
      summaries: drafts.phases.map((d) => ({ phaseId: d.phaseId, text: d.rendered })),
    }),
    ctx({ id: created.id }),
  );
  expect(res.status).toBe(200);
  return { id: created.id, templates: new Map(drafts.phases.map((d) => [d.phaseId, d.template])) };
}

async function patientPlan(id: string): Promise<Plan> {
  const res = await planRoute(get(`${BASE}/plans/${id}?view=patient`), ctx({ id }));
  return PlanViewResponseSchema.parse(await res.json()).plan;
}

/** A summary on the card is acceptable only if it matches the engine's current values for that phase. */
function expectNoStaleSummary(plan: Plan, templates: Map<string, Plan["phases"][number]["title"]>): void {
  for (const p of plan.phases) {
    if (!p.summary) continue;
    expect(p.summary, p.id).toEqual(fillLocalized(templates.get(p.id)!, phaseSlotValues(plan, p)));
  }
}

describe("approved phase summaries never show stale engine values", () => {
  it("bone-graft edit: ph2 no longer reads EUR 1,500 / 12 January next to EUR 1,950", async () => {
    const { id, templates } = await approvedWithSummaries();
    const before = await patientPlan(id);
    expect(before.phases.every((p) => p.summary)).toBe(true);
    expect(before.phases[1]!.summary!.en).toContain("€1,500.00");

    const res = await editRoute(post(`${BASE}/plans/${id}/edit`, { edit: GOLDEN_BONE_GRAFT_EDIT, editedBy: GOLDEN_DENTIST }), ctx({ id }));
    expect(res.status).toBe(200);
    const after = await patientPlan(id);
    expect(after.phases[1]!.amountCents).toBe(195_000);
    expect(after.phases[1]!.summary?.en ?? "").not.toContain("€1,500.00");
    expectNoStaleSummary(after, templates);
    // ph1 is unchanged by the edit, so its approved text stays.
    expect(after.phases[0]!.summary).toEqual(before.phases[0]!.summary);
  });

  it("persisted what-if delay: ph3 no longer reads 7 April 2027 after moving to 19 May 2027", async () => {
    const { id, templates } = await approvedWithSummaries();
    const res = await whatifRoute(post(`${BASE}/plans/${id}/whatif`, GOLDEN_DELAY_MOVE), ctx({ id }));
    expect(res.status).toBe(200);
    const after = await patientPlan(id);
    expect(after.phases[2]!.startDate).toBe("2027-05-19");
    expect(after.phases[2]!.summary?.en ?? "").not.toContain("7 April 2027");
    expectNoStaleSummary(after, templates);
    expect(after.phases[0]!.summary).toBeDefined();
  });
});
