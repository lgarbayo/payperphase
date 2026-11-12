/**
 * OWNED BY WP-03. The approved phase summary is stored as the SLOT TEMPLATE the dentist approved and
 * filled here, on every read, from the phase's CURRENT engine values. An edit or a reschedule changes
 * the amount, date or minimum weeks; the summary follows, so it never contradicts its own card.
 * A stored text that no longer validates (an old rendered text with digits, or a slot the phase has
 * lost after an edit) is not shown at all. Client-safe: no env, no SDK.
 */
import type { LocalizedText, Plan } from "@/contracts";
import { fillLocalized, TemplateError } from "./fill";
import { phaseSlotValues } from "./templates";

type Phase = Plan["phases"][number];

export function phaseSummaryText(plan: Plan, phase: Phase): LocalizedText | undefined {
  if (!phase.summary) return undefined;
  try {
    return fillLocalized(phase.summary, phaseSlotValues(plan, phase));
  } catch (err) {
    if (err instanceof TemplateError) return undefined;
    throw err;
  }
}
