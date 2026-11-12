/**
 * Assembles PlanViewResponse for GET /api/plans/:id and the /p/[planId] page.
 * Patient view: only the notes the clinic approved for this plan. Clinic view: the whole library.
 */
import type { ClinicalNote, PlanViewResponse } from "@/contracts";
import { NOTE_LIBRARY } from "@data/seed/notes";
import { modes } from "@/env";
import { closureStressTest, computeExposure } from "@/engine";
import { store } from "./store";

export async function buildPlanView(idOrAlias: string, view: "patient" | "clinic"): Promise<PlanViewResponse | null> {
  const plan = await store.getPlan(idOrAlias);
  if (!plan) return null;
  const clock = await store.getClock();
  const library = Object.values(NOTE_LIBRARY) as ClinicalNote[];
  const approved = new Set(plan.approvedNotes.map((n) => n.noteId));
  // The patient never sees notes the clinic has not approved, so a note an edit just added
  // (BONE_GRAFT_HEALING_16W) stays out of the payload until the clinic releases it.
  const visible = view === "clinic" ? plan : { ...plan, phases: plan.phases.map((p) => ({ ...p, noteIds: p.noteIds.filter((n) => approved.has(n)) })) };
  return {
    plan: visible,
    clock,
    exposure: computeExposure(plan, clock.today),
    stress: closureStressTest(plan, clock.today),
    notes: view === "clinic" ? library : library.filter((n) => approved.has(n.id)),
    modes: modes(),
  };
}
