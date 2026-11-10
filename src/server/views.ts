/**
 * OWNED BY WP-09. Assembles PlanViewResponse for GET /api/plans/:id and the /p/[planId] page.
 */
import type { PlanViewResponse } from "@/contracts";
import { NOTE_LIBRARY } from "@data/seed/notes";
import { modes } from "@/env";
import { closureStressTest, computeExposure } from "@/engine";
import { store } from "./store";

export async function buildPlanView(idOrAlias: string, view: "patient" | "clinic"): Promise<PlanViewResponse | null> {
  const plan = await store.getPlan(idOrAlias);
  if (!plan) return null;
  const clock = await store.getClock();
  const approved = new Set(plan.approvedNotes.map((n) => n.noteId));
  const library = Object.values(NOTE_LIBRARY);
  return {
    plan,
    clock,
    exposure: computeExposure(plan, clock.today),
    stress: closureStressTest(plan, clock.today),
    notes: view === "clinic" ? library : library.filter((n) => approved.has(n.id)),
    modes: modes(),
  };
}
