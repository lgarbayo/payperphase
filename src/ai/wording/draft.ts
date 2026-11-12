/**
 * Claude drafts ES/EN SLOT TEMPLATES per phase; the validator checks every draft against
 * the slots that phase has engine values for; drafts that fail are replaced by the deterministic template.
 * Drafts stay `status: "draft"` until the clinic approves them (clinic console → approve route).
 */
import { z } from "zod";
import {
  WORDING_SLOTS,
  WordingDraftSetSchema,
  type ClinicalNote,
  type LocalizedText,
  type NoteId,
  type Plan,
  type WordingDraftSet,
} from "@/contracts";
import { serverEnv } from "@/env";
import { callStructured, defaultClaudeClient, type ClaudeClient } from "../extract/claude";
import { availableSlots, fillLocalized } from "./fill";
import { deterministicPhaseTemplate, phaseSlotValues, REQUIRED_PHASE_SLOTS } from "./templates";
import { validateLocalizedTemplate } from "./validate";

export const WORDING_TIMEOUT_MS = 30_000;

export const WordingLlmOutputSchema = z.object({
  phases: z.array(z.object({ phaseId: z.string(), es: z.string(), en: z.string() })),
});

export const WORDING_SYSTEM = `You write short patient-facing summaries of each phase of a dental treatment, in Spanish (Spain, informal "tú") and in English. The patient pays for each phase with PayPal on the day that phase is delivered, never before.

You write TEMPLATES, not final text. Wherever a number, an amount, a date, tooth numbers, a number of weeks, the phase number or the dentist's name belongs, write a slot instead:
- {{amount}}: what this phase costs
- {{date}}: the day this phase is delivered and paid
- {{teeth}}: the tooth numbers treated in this phase
- {{minWeeks}}: the minimum number of weeks after the previous phase
- {{phaseN}}: the phase number
- {{dentist}}: the dentist's name
Use only the slots listed as available for each phase, and always use {{amount}} and {{date}}. Outside slots, never write digits, currency signs or currency words (€, EUR, euros), percentages, or month names: an automatic check rejects the template if you do, and a fixed fallback text is used instead.

Style: two or three short sentences per language, warm and plain, no jargon. Describe what happens in the phase and when it is paid. Use only the clinician-approved notes given for context; do not add medical advice, risks or promises of your own.`;

type Phase = Plan["phases"][number];

function phaseBrief(plan: Plan, phase: Phase, notes: Record<NoteId, ClinicalNote>) {
  return {
    phaseId: phase.id,
    kind: phase.kind,
    title: phase.title,
    availableSlots: availableSlots(phaseSlotValues(plan, phase)),
    approvedNotes: phase.noteIds.flatMap((id) => (notes[id] ? [{ title: notes[id].title, text: notes[id].text }] : [])),
  };
}

export interface DraftOptions {
  /** undefined → live client from env (null in mock mode); null → deterministic only; object → that client. */
  client?: ClaudeClient | null;
  timeoutMs?: number;
}

export async function draftPhaseWording(
  plan: Plan,
  notes: Record<NoteId, ClinicalNote>,
  opts: DraftOptions = {},
): Promise<WordingDraftSet> {
  const client = opts.client === undefined ? defaultClaudeClient() : opts.client;

  let llm: Map<string, LocalizedText> | null = null;
  if (client) {
    const result = await callStructured(client, {
      model: serverEnv().ANTHROPIC_MODEL_WORDING,
      system: WORDING_SYSTEM,
      content: [
        {
          type: "text",
          text: `Allowed slots overall: ${WORDING_SLOTS.map((s) => `{{${s}}}`).join(" ")}.\nPhases:\n${JSON.stringify(
            plan.phases.map((p) => phaseBrief(plan, p, notes)),
            null,
            2,
          )}\n\nWrite one ES and one EN template per phase, keyed by phaseId.`,
        },
      ],
      schema: WordingLlmOutputSchema,
      maxTokens: 4_000,
      effort: "low",
      timeoutMs: opts.timeoutMs ?? WORDING_TIMEOUT_MS,
    });
    if (result.ok) llm = new Map(result.data.phases.map((d) => [d.phaseId, { es: d.es.trim(), en: d.en.trim() }]));
    else console.warn(`[wording] live drafts unavailable: ${result.reason}`);
  }

  let allLive = llm !== null;
  const phases = plan.phases.map((phase) => {
    const values = phaseSlotValues(plan, phase);
    const draft = llm?.get(phase.id);
    const valid =
      draft !== undefined &&
      validateLocalizedTemplate(draft, { allowed: availableSlots(values), required: REQUIRED_PHASE_SLOTS }).ok;
    if (!valid) allLive = false;
    const template = valid ? draft : deterministicPhaseTemplate(phase, values);
    return {
      phaseId: phase.id,
      template,
      rendered: fillLocalized(template, values),
      noteIds: [...phase.noteIds],
      status: "draft" as const,
    };
  });

  return WordingDraftSetSchema.parse({
    planId: plan.id,
    planVersion: plan.version,
    // "live" only when every phase uses a validated Claude draft; any replacement labels the set cached.
    source: allLive ? "live" : "cached",
    phases,
  });
}
