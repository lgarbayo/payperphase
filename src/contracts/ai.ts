import { z } from "zod";
import { WhatIfResultSchema } from "./engine";
import { NoteIdSchema } from "./notes";
import { LocaleSchema, LocalizedTextSchema, PhaseIdSchema, PlanIdSchema } from "./primitives";

/**
 * ---------- Wording ----------
 * Claude drafts SLOT TEMPLATES, never final text with numbers. Allowed slots:
 *   {{amount}} {{date}} {{teeth}} {{minWeeks}} {{phaseN}} {{dentist}}
 * A validator rejects any digit, currency sign or month name outside a slot.
 * Slots are filled only from engine values (fillSlots in src/ai/wording).
 */
export const WORDING_SLOTS = ["amount", "date", "teeth", "minWeeks", "phaseN", "dentist"] as const;
export type WordingSlot = (typeof WORDING_SLOTS)[number];

export const PhaseWordingDraftSchema = z.object({
  phaseId: PhaseIdSchema,
  /** Template with {{slots}}, per locale. */
  template: LocalizedTextSchema,
  /** Template filled with engine values (what the clinic reviews and approves). */
  rendered: LocalizedTextSchema,
  noteIds: z.array(NoteIdSchema),
  status: z.enum(["draft", "approved"]),
});
export type PhaseWordingDraft = z.infer<typeof PhaseWordingDraftSchema>;

export const WordingDraftSetSchema = z.object({
  planId: PlanIdSchema,
  planVersion: z.number().int().positive(),
  phases: z.array(PhaseWordingDraftSchema),
  source: z.enum(["live", "cached"]),
});
export type WordingDraftSet = z.infer<typeof WordingDraftSetSchema>;

/** Plain-language PlanDiff explanation for the clinic agent feed / patient notice. */
export const DiffExplanationSchema = z.object({
  template: LocalizedTextSchema,
  rendered: LocalizedTextSchema,
  source: z.enum(["live", "cached"]),
});
export type DiffExplanation = z.infer<typeof DiffExplanationSchema>;

/** ---------- Patient chat ---------- */
export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(2000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  planId: PlanIdSchema,
  locale: LocaleSchema,
  messages: z.array(ChatMessageSchema).min(1).max(20),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatCitationSchema = z.object({
  noteId: NoteIdSchema,
  approvedBy: z.string(),
  phaseId: PhaseIdSchema.optional(),
  citedText: z.string(),
});
export type ChatCitation = z.infer<typeof ChatCitationSchema>;

export const ChatResponseSchema = z.object({
  text: z.string(),
  citations: z.array(ChatCitationSchema),
  /** Engine output used for any date/amount in `text` (simulate_delay tool). */
  whatIf: WhatIfResultSchema.optional(),
  /** Out of scope (e.g. medication) → fixed referral text + "message my clinic". */
  refused: z.boolean(),
  /** True when the numeric grounding check replaced the model answer with a safe fallback. */
  groundingFallback: z.boolean(),
  source: z.enum(["live", "cached"]),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
