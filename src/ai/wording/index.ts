/**
 * OWNED BY WP-03. Patient-facing wording as SLOT TEMPLATES ({{amount}} {{date}} …) drafted by Claude
 * and filled only with engine values. Drafts stay drafts until the clinic approves them.
 * SCAFFOLD STUB: deterministic templates, no LLM.
 */
import type { ClinicalNote, DiffExplanation, NoteId, Plan, PlanDiff, WordingDraftSet } from "@/contracts";

export async function draftPhaseWording(plan: Plan, notes: Record<NoteId, ClinicalNote>): Promise<WordingDraftSet> {
  void notes;
  return {
    planId: plan.id,
    planVersion: plan.version,
    source: "cached",
    phases: plan.phases.map((p) => ({
      phaseId: p.id,
      template: { es: "Fase {{phaseN}}: " + p.title.es, en: "Phase {{phaseN}}: " + p.title.en },
      rendered: { es: `Fase ${p.n}: ${p.title.es}`, en: `Phase ${p.n}: ${p.title.en}` },
      noteIds: p.noteIds,
      status: "draft",
    })),
  };
}

export async function explainDiff(diff: PlanDiff, plan: Plan): Promise<DiffExplanation> {
  void plan;
  return {
    template: { es: "Cambio en el plan: {{amount}}", en: "Plan change: {{amount}}" },
    rendered: { es: `Cambio en el plan (${diff.totalDeltaCents} céntimos)`, en: `Plan change (${diff.totalDeltaCents} cents)` },
    source: "cached",
  };
}
