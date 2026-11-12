/**
 * OWNED BY WP-03. Patient-facing wording as SLOT TEMPLATES ({{amount}} {{date}} …) drafted by Claude
 * and filled only with engine values. Drafts stay drafts until the clinic approves them.
 */
export { draftPhaseWording, WORDING_SYSTEM, WordingLlmOutputSchema, type DraftOptions } from "./draft";
export { explainDiff, explainDiffSync } from "./diff";
export {
  availableSlots,
  fillLocalized,
  fillSlots,
  formatTeeth,
  minWeeks,
  renderSlots,
  slotStrings,
  TemplateError,
  type SlotValues,
} from "./fill";
export { deterministicPhaseTemplate, phaseSlotValues, REQUIRED_PHASE_SLOTS } from "./templates";
export { phaseSummaryText } from "./summary";
export {
  validateLocalizedTemplate,
  validateTemplate,
  type TemplateIssue,
  type TemplateIssueCode,
  type TemplateValidation,
  type ValidateOptions,
} from "./validate";
