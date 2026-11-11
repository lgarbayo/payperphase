/**
 * OWNED BY WP-08. Pure logic behind the odontogram: quote lines → per-tooth marks, and the
 * per-tooth summary (what the glyph draws and what the accessible name says). No React here.
 */
import type { FdiTooth, Phase, ProcedureCategory, ProcedureCode, QuoteLine } from "@/contracts";

export interface ToothMark {
  tooth: FdiTooth;
  category: ProcedureCategory;
  /** Phase number the treatment belongs to, if planned. */
  phaseN?: number;
  state: "planned" | "done" | "missing" | "extract";
  /** The procedure behind the mark. Optional so callers can hand-build simple marks. */
  code?: ProcedureCode;
}

/** What a mark means clinically; drives the glyph decoration, the legend and the tooth's name. */
export type MarkKind =
  | "extraction"
  | "graft"
  | "implant"
  | "abutment"
  | "crown"
  | "impression"
  | "filling"
  | "adjustment"
  | "endodontic"
  | "periodontal"
  | "orthodontic"
  | "preventive"
  | "diagnostic"
  | "other";

const KIND_BY_CODE: Record<ProcedureCode, MarkKind> = {
  EXAM: "diagnostic",
  CBCT: "diagnostic",
  PANORAMIC_XRAY: "diagnostic",
  HYGIENE: "preventive",
  EXTRACTION: "extraction",
  SURGICAL_EXTRACTION: "extraction",
  BONE_GRAFT: "graft",
  SINUS_LIFT: "graft",
  IMPLANT: "implant",
  ABUTMENT: "abutment",
  DIGITAL_IMPRESSION: "impression",
  IMPLANT_CROWN: "crown",
  CROWN: "crown",
  TEMPORARY_CROWN: "crown",
  ROOT_CANAL: "endodontic",
  FILLING: "filling",
  SCALING_ROOT_PLANING: "periodontal",
  PERIO_SURGERY: "periodontal",
  PERIO_MAINTENANCE: "periodontal",
  ORTHO_RECORDS: "orthodontic",
  ALIGNER_BATCH: "orthodontic",
  ORTHO_BRACES: "orthodontic",
  RETAINER: "orthodontic",
  OCCLUSAL_ADJUSTMENT: "adjustment",
  NIGHT_GUARD: "preventive",
  REVIEW_XRAY: "diagnostic",
  WHITENING: "other",
  OTHER: "other",
};

const KIND_BY_CATEGORY: Record<ProcedureCategory, MarkKind> = {
  DIAGNOSTIC: "diagnostic",
  PREVENTIVE: "preventive",
  SURGICAL: "graft",
  IMPLANT: "implant",
  PROSTHETIC: "crown",
  RESTORATIVE: "filling",
  ENDODONTIC: "endodontic",
  PERIODONTAL: "periodontal",
  ORTHODONTIC: "orthodontic",
  OTHER: "other",
};

/** Display order of kinds on a tooth and in the legend: the order a patient meets them. */
export const KIND_ORDER: readonly MarkKind[] = [
  "diagnostic",
  "preventive",
  "extraction",
  "graft",
  "implant",
  "abutment",
  "impression",
  "crown",
  "endodontic",
  "filling",
  "adjustment",
  "periodontal",
  "orthodontic",
  "other",
];

export function kindOfMark(m: Pick<ToothMark, "code" | "category" | "state">): MarkKind {
  if (m.code) return KIND_BY_CODE[m.code];
  if (m.state === "extract") return "extraction";
  return KIND_BY_CATEGORY[m.category];
}

/** Colour variable per category (scaffold tokens in app/globals.css). */
export const CATEGORY_VAR: Record<ProcedureCategory, string> = {
  DIAGNOSTIC: "var(--ppp-cat-diagnostic)",
  PREVENTIVE: "var(--ppp-cat-preventive)",
  SURGICAL: "var(--ppp-cat-surgical)",
  IMPLANT: "var(--ppp-cat-implant)",
  PROSTHETIC: "var(--ppp-cat-prosthetic)",
  RESTORATIVE: "var(--ppp-cat-restorative)",
  ENDODONTIC: "var(--ppp-cat-endodontic)",
  PERIODONTAL: "var(--ppp-cat-periodontal)",
  ORTHODONTIC: "var(--ppp-cat-orthodontic)",
  OTHER: "var(--ppp-cat-other)",
};

/** Colour a kind is drawn in. Extractions are surgical, impressions prosthetic, and so on. */
export const KIND_CATEGORY: Record<MarkKind, ProcedureCategory> = {
  extraction: "SURGICAL",
  graft: "SURGICAL",
  implant: "IMPLANT",
  abutment: "IMPLANT",
  crown: "PROSTHETIC",
  impression: "PROSTHETIC",
  filling: "RESTORATIVE",
  adjustment: "RESTORATIVE",
  endodontic: "ENDODONTIC",
  periodontal: "PERIODONTAL",
  orthodontic: "ORTHODONTIC",
  preventive: "PREVENTIVE",
  diagnostic: "DIAGNOSTIC",
  other: "OTHER",
};

const EXTRACTION_CODES: ReadonlySet<ProcedureCode> = new Set(["EXTRACTION", "SURGICAL_EXTRACTION"]);

/**
 * Quote lines (+ optional plan phases) → per-tooth marks. WP-07 calls it as lines reveal.
 * One mark per tooth, procedure and phase. Lines without teeth produce nothing. With `phases`,
 * a delivered phase turns its marks to `done` (a delivered extraction leaves the tooth `missing`).
 */
export function marksFromLines(lines: QuoteLine[], phases?: Phase[]): ToothMark[] {
  const marks: ToothMark[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const phase = phases?.find((p) => p.lineIds.includes(line.id));
    const extraction = EXTRACTION_CODES.has(line.code);
    const delivered = phase?.delivery.status === "delivered";
    const state: ToothMark["state"] = extraction ? (delivered ? "missing" : "extract") : delivered ? "done" : "planned";
    for (const tooth of line.teeth) {
      const key = `${tooth}|${line.code}|${phase?.n ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      marks.push({ tooth, category: line.category, phaseN: phase?.n, state, code: line.code });
    }
  }
  return marks;
}

export interface ToothEntry {
  kind: MarkKind;
  /** Distinct phase numbers this kind appears in, ascending. */
  phases: number[];
  /** True when every mark of this kind is done. */
  done: boolean;
}

export interface ToothSummary {
  tooth: FdiTooth;
  entries: ToothEntry[];
  /** Phase numbers across all entries, ascending (the badge on the tooth). */
  phases: number[];
  has: Set<MarkKind>;
  /** The tooth is gone (extraction delivered, or marked missing) and nothing replaces it (yet). */
  missing: boolean;
  /** An extraction is planned and nothing replaces the tooth (yet): drawn as a cross. */
  extractionPending: boolean;
  /** Everything planned for this tooth is delivered. */
  allDone: boolean;
}

/** Group marks by tooth. Kinds are ordered by their first phase, then by KIND_ORDER. */
export function summarizeTeeth(marks: readonly ToothMark[]): Map<FdiTooth, ToothSummary> {
  const byTooth = new Map<FdiTooth, ToothMark[]>();
  for (const m of marks) byTooth.set(m.tooth, [...(byTooth.get(m.tooth) ?? []), m]);

  const out = new Map<FdiTooth, ToothSummary>();
  for (const [tooth, list] of byTooth) {
    const byKind = new Map<MarkKind, ToothMark[]>();
    for (const m of list) {
      const kind = kindOfMark(m);
      byKind.set(kind, [...(byKind.get(kind) ?? []), m]);
    }
    const entries: ToothEntry[] = [...byKind].map(([kind, ms]) => ({
      kind,
      phases: [...new Set(ms.flatMap((m) => (m.phaseN ? [m.phaseN] : [])))].sort((a, b) => a - b),
      done: ms.every((m) => m.state === "done" || m.state === "missing"),
    }));
    entries.sort((a, b) => {
      const pa = a.phases[0] ?? Number.POSITIVE_INFINITY;
      const pb = b.phases[0] ?? Number.POSITIVE_INFINITY;
      return pa - pb || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    });
    const has = new Set(entries.map((e) => e.kind));
    const replaced = has.has("implant") || has.has("abutment") || has.has("crown");
    out.set(tooth, {
      tooth,
      entries,
      phases: [...new Set(entries.flatMap((e) => e.phases))].sort((a, b) => a - b),
      has,
      missing: !replaced && list.some((m) => m.state === "missing"),
      extractionPending: !replaced && list.some((m) => m.state === "extract"),
      allDone: list.every((m) => m.state === "done" || m.state === "missing"),
    });
  }
  return out;
}

/** The phase badge text: "1", "1·2·4", or "1–5" when there are many. */
export function phaseBadgeText(phases: readonly number[]): string {
  if (phases.length === 0) return "";
  if (phases.length <= 3) return phases.join("·");
  return `${phases[0]}–${phases[phases.length - 1]}`;
}
