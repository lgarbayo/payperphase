import { z } from "zod";
import { IsoDateTimeSchema, LocalizedTextSchema } from "./primitives";

/**
 * Clinician-approved note library ids. Texts live in data/seed/notes.ts.
 * Patients only ever see notes the clinic approved for their plan (Plan.approvedNotes).
 * The engine references notes by id (dependency min/max violations); chat cites them.
 */
export const NoteIdSchema = z.enum([
  "HEALING_EXTRACTION_MIN_8W",
  "HEALING_EXTRACTION_MAX_6M",
  "OSSEOINTEGRATION_MIN_12W",
  "OSSEOINTEGRATION_MAX_6M",
  "BONE_GRAFT_HEALING_16W",
  "LAB_FABRICATION_MIN_2W",
  "SPLIT_VISITS_MIN_1W",
  "IMPRESSION_MAX_8W",
  "PERIO_BEFORE_IMPLANT",
  "PERIO_REEVAL_MIN_6W",
  "ALIGNER_BATCH_MIN_6W",
  "ALIGNER_BATCH_MAX_12W",
  "RETENTION_AFTER_ORTHO",
  "AFTERCARE_EXTRACTION",
  "AFTERCARE_IMPLANT",
  "PAY_PER_PHASE_PROMISE",
  "PAY_IN_3_RANGE",
  "INSTALLMENTS_ONLY_REASON",
  "REFERRAL_ASK_CLINIC",
]);
export type NoteId = z.infer<typeof NoteIdSchema>;

export const NoteKindSchema = z.enum(["HEALING", "RISK_DELAY", "PROCEDURE", "AFTERCARE", "PAYMENT", "REFERRAL"]);
export type NoteKind = z.infer<typeof NoteKindSchema>;

export const ClinicalNoteSchema = z.object({
  id: NoteIdSchema,
  kind: NoteKindSchema,
  /** Plain-language, patient-facing. No dosages, no diagnoses. */
  text: LocalizedTextSchema,
  /** Short label for chips, e.g. "Bone healing". */
  title: LocalizedTextSchema,
  version: z.number().int().positive(),
});
export type ClinicalNote = z.infer<typeof ClinicalNoteSchema>;

export const ApprovedNoteRefSchema = z.object({
  noteId: NoteIdSchema,
  noteVersion: z.number().int().positive(),
  approvedBy: z.string().min(1),
  approvedAt: IsoDateTimeSchema,
});
export type ApprovedNoteRef = z.infer<typeof ApprovedNoteRefSchema>;
