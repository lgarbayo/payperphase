import { z } from "zod";

/**
 * Closed procedure vocabulary. The LLM maps every printed quote line to one of these
 * (OTHER when unsure). The engine catalog (src/engine/catalog.ts) attaches phasing rules.
 */
export const ProcedureCodeSchema = z.enum([
  "EXAM",
  "CBCT",
  "PANORAMIC_XRAY",
  "HYGIENE",
  "EXTRACTION",
  "SURGICAL_EXTRACTION",
  "BONE_GRAFT",
  "SINUS_LIFT",
  "IMPLANT",
  "ABUTMENT",
  "DIGITAL_IMPRESSION",
  "IMPLANT_CROWN",
  "CROWN",
  "TEMPORARY_CROWN",
  "ROOT_CANAL",
  "FILLING",
  "SCALING_ROOT_PLANING",
  "PERIO_SURGERY",
  "PERIO_MAINTENANCE",
  "ORTHO_RECORDS",
  "ALIGNER_BATCH",
  "ORTHO_BRACES",
  "RETAINER",
  "OCCLUSAL_ADJUSTMENT",
  "NIGHT_GUARD",
  "REVIEW_XRAY",
  "WHITENING",
  "OTHER",
]);
export type ProcedureCode = z.infer<typeof ProcedureCodeSchema>;

export const ProcedureCategorySchema = z.enum([
  "DIAGNOSTIC",
  "PREVENTIVE",
  "SURGICAL",
  "IMPLANT",
  "PROSTHETIC",
  "RESTORATIVE",
  "ENDODONTIC",
  "PERIODONTAL",
  "ORTHODONTIC",
  "OTHER",
]);
export type ProcedureCategory = z.infer<typeof ProcedureCategorySchema>;

/** Static taxonomy (not phasing rules). Used by UI colours and the odontogram. */
export const PROCEDURE_CATEGORY: Record<ProcedureCode, ProcedureCategory> = {
  EXAM: "DIAGNOSTIC",
  CBCT: "DIAGNOSTIC",
  PANORAMIC_XRAY: "DIAGNOSTIC",
  HYGIENE: "PREVENTIVE",
  EXTRACTION: "SURGICAL",
  SURGICAL_EXTRACTION: "SURGICAL",
  BONE_GRAFT: "SURGICAL",
  SINUS_LIFT: "SURGICAL",
  IMPLANT: "IMPLANT",
  ABUTMENT: "IMPLANT",
  DIGITAL_IMPRESSION: "PROSTHETIC",
  IMPLANT_CROWN: "PROSTHETIC",
  CROWN: "PROSTHETIC",
  TEMPORARY_CROWN: "PROSTHETIC",
  ROOT_CANAL: "ENDODONTIC",
  FILLING: "RESTORATIVE",
  SCALING_ROOT_PLANING: "PERIODONTAL",
  PERIO_SURGERY: "PERIODONTAL",
  PERIO_MAINTENANCE: "PERIODONTAL",
  ORTHO_RECORDS: "ORTHODONTIC",
  ALIGNER_BATCH: "ORTHODONTIC",
  ORTHO_BRACES: "ORTHODONTIC",
  RETAINER: "ORTHODONTIC",
  OCCLUSAL_ADJUSTMENT: "RESTORATIVE",
  NIGHT_GUARD: "PREVENTIVE",
  REVIEW_XRAY: "DIAGNOSTIC",
  WHITENING: "OTHER",
  OTHER: "OTHER",
};

/** Clinical phase kinds the engine can produce. */
export const PhaseKindSchema = z.enum([
  "PREP",
  "IMPLANT_SURGERY",
  "IMPRESSIONS",
  "PROSTHETIC",
  "PERIO_THERAPY",
  "PERIO_REEVALUATION",
  "ORTHO_START",
  "ALIGNER_BATCH",
  "ORTHO_FINISH",
  "MAINTENANCE",
]);
export type PhaseKind = z.infer<typeof PhaseKindSchema>;
