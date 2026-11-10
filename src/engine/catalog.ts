/**
 * Procedure catalog: the clinical rules the engine attaches to every ProcedureCode.
 * Stage per case kind, visit duration, per-unit (per-tooth) divisibility and default note ids,
 * plus the stage order, the healing-lag rules between stages and the deterministic ES/EN titles.
 */
import type { CaseKind, LocalizedText, NoteId, PhaseKind, ProcedureCode } from "@/contracts";

export interface CatalogEntry {
  code: ProcedureCode;
  /** Clinical stage (phase kind) this procedure belongs to, per case kind. */
  stage: Record<CaseKind, PhaseKind>;
  /** Chair days for the visit (endDate = startDate + durationDays, exclusive). */
  durationDays: number;
  /** A multi-unit line (qty > 1, e.g. one implant per tooth) can be split across visits per unit. */
  divisible: boolean;
  /** Notes relevant whenever this procedure is in a phase (aftercare, retention …). */
  noteIds: readonly NoteId[];
}

type StageSpec = PhaseKind | { implant: PhaseKind; aligner: PhaseKind; perio: PhaseKind };

function entry(
  code: ProcedureCode,
  stage: StageSpec,
  divisible: boolean,
  noteIds: readonly NoteId[] = [],
  durationDays = 1,
): CatalogEntry {
  const s = typeof stage === "string" ? { implant: stage, aligner: stage, perio: stage } : stage;
  return { code, stage: s, durationDays, divisible, noteIds };
}

/** Same stage in implant and perio cases, a different one in aligner cases. */
const ip = (implantAndPerio: PhaseKind, aligner: PhaseKind) => ({
  implant: implantAndPerio,
  perio: implantAndPerio,
  aligner,
});
/** Perio-specific stage, implant stage otherwise. */
const perio = (implant: PhaseKind, perioStage: PhaseKind, aligner: PhaseKind) => ({
  implant,
  perio: perioStage,
  aligner,
});

export const CATALOG: Readonly<Record<ProcedureCode, CatalogEntry>> = {
  EXAM: entry("EXAM", perio("PREP", "PERIO_THERAPY", "ORTHO_START"), false),
  CBCT: entry("CBCT", perio("PREP", "PERIO_THERAPY", "ORTHO_START"), false),
  PANORAMIC_XRAY: entry("PANORAMIC_XRAY", perio("PREP", "PERIO_THERAPY", "ORTHO_START"), false),
  HYGIENE: entry("HYGIENE", perio("PREP", "PERIO_THERAPY", "ORTHO_START"), false),
  EXTRACTION: entry("EXTRACTION", ip("PREP", "ORTHO_START"), true, ["AFTERCARE_EXTRACTION"]),
  SURGICAL_EXTRACTION: entry("SURGICAL_EXTRACTION", ip("PREP", "ORTHO_START"), true, ["AFTERCARE_EXTRACTION"]),
  FILLING: entry("FILLING", ip("PREP", "ORTHO_START"), true),
  ROOT_CANAL: entry("ROOT_CANAL", ip("PREP", "ORTHO_START"), true),
  OTHER: entry("OTHER", ip("PREP", "ORTHO_START"), false),

  IMPLANT: entry("IMPLANT", ip("IMPLANT_SURGERY", "ORTHO_FINISH"), true, ["AFTERCARE_IMPLANT"]),
  BONE_GRAFT: entry("BONE_GRAFT", ip("IMPLANT_SURGERY", "ORTHO_START"), true),
  SINUS_LIFT: entry("SINUS_LIFT", ip("IMPLANT_SURGERY", "ORTHO_START"), true),

  ABUTMENT: entry("ABUTMENT", ip("IMPRESSIONS", "ORTHO_FINISH"), true),
  DIGITAL_IMPRESSION: entry("DIGITAL_IMPRESSION", ip("IMPRESSIONS", "ORTHO_FINISH"), false),
  TEMPORARY_CROWN: entry("TEMPORARY_CROWN", ip("IMPRESSIONS", "ORTHO_FINISH"), true),

  IMPLANT_CROWN: entry("IMPLANT_CROWN", ip("PROSTHETIC", "ORTHO_FINISH"), true),
  CROWN: entry("CROWN", ip("PROSTHETIC", "ORTHO_FINISH"), true),
  OCCLUSAL_ADJUSTMENT: entry("OCCLUSAL_ADJUSTMENT", ip("PROSTHETIC", "ORTHO_FINISH"), false),
  NIGHT_GUARD: entry("NIGHT_GUARD", ip("PROSTHETIC", "ORTHO_FINISH"), false),
  REVIEW_XRAY: entry("REVIEW_XRAY", ip("PROSTHETIC", "ORTHO_FINISH"), false),
  WHITENING: entry("WHITENING", ip("PROSTHETIC", "ORTHO_FINISH"), false),

  SCALING_ROOT_PLANING: entry("SCALING_ROOT_PLANING", perio("PREP", "PERIO_THERAPY", "ORTHO_START"), true),
  PERIO_SURGERY: entry("PERIO_SURGERY", perio("PREP", "PERIO_THERAPY", "ORTHO_START"), true),
  PERIO_MAINTENANCE: entry("PERIO_MAINTENANCE", perio("PROSTHETIC", "PERIO_REEVALUATION", "ORTHO_FINISH"), false),

  ORTHO_RECORDS: entry("ORTHO_RECORDS", ip("PREP", "ORTHO_START"), false),
  ALIGNER_BATCH: entry("ALIGNER_BATCH", ip("PREP", "ALIGNER_BATCH"), true),
  ORTHO_BRACES: entry("ORTHO_BRACES", ip("PREP", "ORTHO_START"), false),
  RETAINER: entry("RETAINER", ip("PROSTHETIC", "ORTHO_FINISH"), false, ["RETENTION_AFTER_ORTHO"]),
};

export function catalogEntry(code: ProcedureCode): CatalogEntry {
  return CATALOG[code];
}

export function stageFor(code: ProcedureCode, caseKind: CaseKind): PhaseKind {
  return CATALOG[code].stage[caseKind];
}

/** Clinical order of stages per case kind. Empty stages are skipped. */
export const STAGE_ORDER: Readonly<Record<CaseKind, readonly PhaseKind[]>> = {
  implant: ["PREP", "IMPLANT_SURGERY", "IMPRESSIONS", "PROSTHETIC"],
  perio: ["PERIO_THERAPY", "PERIO_REEVALUATION", "PREP", "IMPLANT_SURGERY", "IMPRESSIONS", "PROSTHETIC"],
  aligner: ["ORTHO_START", "ALIGNER_BATCH", "ORTHO_FINISH"],
};

// ---------------------------------------------------------------------------------------------
// Healing lags between consecutive visits
// ---------------------------------------------------------------------------------------------

export interface LagRule {
  minLagDays: number;
  maxLagDays?: number;
  riskNoteId: NoteId;
  deadlineNoteId?: NoteId;
}

export const SPLIT_VISIT_LAG: LagRule = { minLagDays: 7, riskNoteId: "SPLIT_VISITS_MIN_1W" };

const EXTRACTION_CODES: ReadonlySet<ProcedureCode> = new Set(["EXTRACTION", "SURGICAL_EXTRACTION"]);
const GRAFT_CODES: ReadonlySet<ProcedureCode> = new Set(["BONE_GRAFT", "SINUS_LIFT"]);

/**
 * Lag from the last visit of a stage to the next visit.
 * `predStageCodes` are the procedure codes of the WHOLE predecessor stage (every split part), so a
 * split stage keeps the healing time of its most demanding procedure (conservative, never shorter).
 */
export function lagRule(predKind: PhaseKind, predStageCodes: ReadonlySet<ProcedureCode>, succKind: PhaseKind): LagRule {
  // Two visits of the same stage (a split "(1/2)" → "(2/2)"). Aligner batches are distinct stages.
  if (predKind === succKind && predKind !== "ALIGNER_BATCH") return SPLIT_VISIT_LAG;
  const has = (set: ReadonlySet<ProcedureCode>) => [...predStageCodes].some((c) => set.has(c));
  switch (predKind) {
    case "PREP":
      return has(EXTRACTION_CODES)
        ? {
            minLagDays: 56,
            maxLagDays: 180,
            riskNoteId: "HEALING_EXTRACTION_MIN_8W",
            deadlineNoteId: "HEALING_EXTRACTION_MAX_6M",
          }
        : SPLIT_VISIT_LAG;
    case "IMPLANT_SURGERY":
      return has(GRAFT_CODES)
        ? {
            minLagDays: 112,
            maxLagDays: 180,
            riskNoteId: "BONE_GRAFT_HEALING_16W",
            deadlineNoteId: "OSSEOINTEGRATION_MAX_6M",
          }
        : {
            minLagDays: 84,
            maxLagDays: 180,
            riskNoteId: "OSSEOINTEGRATION_MIN_12W",
            deadlineNoteId: "OSSEOINTEGRATION_MAX_6M",
          };
    case "IMPRESSIONS":
      return { minLagDays: 14, maxLagDays: 60, riskNoteId: "LAB_FABRICATION_MIN_2W", deadlineNoteId: "IMPRESSION_MAX_8W" };
    case "PERIO_THERAPY":
      return succKind === "PERIO_REEVALUATION"
        ? { minLagDays: 42, riskNoteId: "PERIO_REEVAL_MIN_6W" }
        : { minLagDays: 42, riskNoteId: "PERIO_BEFORE_IMPLANT" };
    case "PERIO_REEVALUATION":
      return { minLagDays: 7, riskNoteId: "PERIO_BEFORE_IMPLANT" };
    case "ORTHO_START":
    case "ALIGNER_BATCH":
      return { minLagDays: 42, maxLagDays: 84, riskNoteId: "ALIGNER_BATCH_MIN_6W", deadlineNoteId: "ALIGNER_BATCH_MAX_12W" };
    case "PROSTHETIC":
    case "ORTHO_FINISH":
    case "MAINTENANCE":
      return SPLIT_VISIT_LAG;
  }
}

// ---------------------------------------------------------------------------------------------
// Deterministic ES/EN titles
// ---------------------------------------------------------------------------------------------

export interface TitleInput {
  kind: PhaseKind;
  /** Σ qty per code over the whole stage (all split parts), for singular/plural wording. */
  qtyByCode: ReadonlyMap<ProcedureCode, number>;
  /** 1-based aligner batch number (ALIGNER_BATCH phases only). */
  batchNo?: number;
}

const capitalize = (s: string) => (s ? s[0]!.toLocaleUpperCase("es") + s.slice(1) : s);

/** "a", "a y b", "a, b y c" — "e" instead of "y" before an /i/ sound ("pilares e impresiones"). */
function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  const last = parts[parts.length - 1]!;
  const conj = /^(i|hi(?![aeou]))/i.test(last) ? "e" : "y";
  return `${parts.slice(0, -1).join(", ")} ${conj} ${last}`;
}
function joinEn(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}

export function stageTitle({ kind, qtyByCode, batchNo }: TitleInput): LocalizedText {
  const qty = (...codes: ProcedureCode[]) => codes.reduce((a, c) => a + (qtyByCode.get(c) ?? 0), 0);
  const es: string[] = [];
  const en: string[] = [];
  const add = (e: string, n: string) => {
    es.push(e);
    en.push(n);
  };
  const compose = (fallback: LocalizedText): LocalizedText =>
    es.length === 0 ? fallback : { es: capitalize(joinEs(es)), en: capitalize(joinEn(en)) };

  switch (kind) {
    case "PREP": {
      if (qty("EXAM", "CBCT", "PANORAMIC_XRAY") > 0) add("diagnóstico", "diagnosis");
      if (qty("HYGIENE") > 0) add("limpieza", "cleaning");
      const ext = qty("EXTRACTION", "SURGICAL_EXTRACTION");
      if (ext === 1) add("extracción", "extraction");
      if (ext > 1) add("extracciones", "extractions");
      const endo = qty("ROOT_CANAL");
      if (endo === 1) add("endodoncia", "root canal");
      if (endo > 1) add("endodoncias", "root canals");
      return compose({ es: "Preparación", en: "Preparation" });
    }
    case "IMPLANT_SURGERY": {
      const implants = qty("IMPLANT");
      if (implants === 1) add("colocación del implante", "implant placement");
      if (implants > 1) add("colocación de implantes", "implant placement");
      if (qty("BONE_GRAFT") > 0) add("injerto óseo", "bone graft");
      if (qty("SINUS_LIFT") > 0) add("elevación de seno", "sinus lift");
      return compose({ es: "Cirugía", en: "Surgery" });
    }
    case "IMPRESSIONS": {
      const abut = qty("ABUTMENT");
      if (abut === 1) add("pilar", "abutment");
      if (abut > 1) add("pilares", "abutments");
      if (qty("DIGITAL_IMPRESSION") > 0) add("impresiones", "impressions");
      const temp = qty("TEMPORARY_CROWN");
      if (temp === 1) add("corona provisional", "temporary crown");
      if (temp > 1) add("coronas provisionales", "temporary crowns");
      return compose({ es: "Impresiones", en: "Impressions" });
    }
    case "PROSTHETIC": {
      const crowns = qty("IMPLANT_CROWN", "CROWN");
      if (crowns === 1) return { es: "Corona definitiva", en: "Final crown" };
      if (crowns > 1) return { es: "Coronas definitivas", en: "Final crowns" };
      return { es: "Prótesis y revisión", en: "Prosthetics and review" };
    }
    case "PERIO_THERAPY":
      return { es: "Tratamiento periodontal", en: "Periodontal treatment" };
    case "PERIO_REEVALUATION":
      return { es: "Reevaluación periodontal", en: "Periodontal re-evaluation" };
    case "ORTHO_START":
      return { es: "Inicio de ortodoncia", en: "Orthodontics start" };
    case "ALIGNER_BATCH":
      return batchNo
        ? { es: `Alineadores, tanda ${batchNo}`, en: `Aligners, batch ${batchNo}` }
        : { es: "Alineadores", en: "Aligners" };
    case "ORTHO_FINISH":
      return { es: "Fin de ortodoncia y retención", en: "Orthodontics finish and retention" };
    case "MAINTENANCE":
      return { es: "Mantenimiento", en: "Maintenance" };
  }
}

/** Appends " (i/n)" to a split stage's title. */
export function partTitle(title: LocalizedText, part: number, parts: number): LocalizedText {
  if (parts <= 1) return title;
  return { es: `${title.es} (${part}/${parts})`, en: `${title.en} (${part}/${parts})` };
}
