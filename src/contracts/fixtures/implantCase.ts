/**
 * GOLDEN HERO CASE — scaffold-owned. Every WP develops and tests against this exact data.
 *
 * Synthetic "Clínica Dental Ribera" implant presupuesto: 12 lines, €4,070.00, 4 phases,
 * every phase within the Pay in 3 range (€20–€2,000). Phase 2 (€1,500) still fits after the
 * demo's +€450 bone graft (€1,950).
 *
 * Schedule (engine ASAP from startDate 2026-11-16, all 1-day visits, endDate exclusive):
 *   ph1 PREP             2026-11-16  €360    (pay today; "Paid €360 · received €360")
 *     └ ≥56 d (8 wk) extraction healing, ≤180 d
 *   ph2 IMPLANT_SURGERY  2027-01-12  €1,500
 *     └ ≥84 d (12 wk) osseointegration, ≤180 d
 *   ph3 IMPRESSIONS      2027-04-07  €520
 *     └ ≥14 d lab fabrication, ≤60 d
 *   ph4 PROSTHETIC       2027-04-22  €1,690
 * Clinic-closure stress test after ph1: linked loan owes €3,710 for undelivered care; PayPerPhase €0.
 *
 * If the engine output differs from GOLDEN_PLAN, file a Contract change request rather than
 * editing this file; tests/contracts asserts its internal consistency.
 */
import type { ExtractionResult, Plan, PlanDiff, PlanEdit, RawExtraction } from "@/contracts";

export const GOLDEN_PLAN_ID = "pln_ribera01";
export const GOLDEN_QUOTE_ID = "q_ribera_implant_001";
export const GOLDEN_START_DATE = "2026-11-16";
export const GOLDEN_DENTIST = "Dra. Lucía Ruiz";
export const GOLDEN_PATIENT_EMAIL = "paciente.demo@example.com";
const T0 = "2026-11-16T08:00:00.000Z";

/** What Claude returns for the hero PDF (printed text, no arithmetic). */
export const GOLDEN_RAW_EXTRACTION: RawExtraction = {
  clinicName: "Clínica Dental Ribera",
  patientName: "María García (paciente ficticia)",
  dentistName: GOLDEN_DENTIST,
  quoteRef: "PRES-2026-0142",
  quoteDateText: "12/11/2026",
  printedTotalText: "4.070,00 €",
  lines: [
    { lineNo: 1, description: "Primera visita, exploración y plan de tratamiento", code: "EXAM", teeth: [], quantityText: "1", unitPriceText: "40,00 €", lineTotalText: "40,00 €", confidence: 0.98 },
    { lineNo: 2, description: "TAC dental 3D (CBCT)", code: "CBCT", teeth: [], quantityText: "1", unitPriceText: "90,00 €", lineTotalText: "90,00 €", confidence: 0.97 },
    { lineNo: 3, description: "Tartrectomía (limpieza bucal completa)", code: "HYGIENE", teeth: [], quantityText: "1", unitPriceText: "60,00 €", lineTotalText: "60,00 €", confidence: 0.96 },
    { lineNo: 4, description: "Extracción simple pieza 36", code: "EXTRACTION", teeth: [36], quantityText: "1", unitPriceText: "110,00 €", lineTotalText: "110,00 €", confidence: 0.97 },
    { lineNo: 5, description: "Obturación de composite pieza 37", code: "FILLING", teeth: [37], quantityText: "1", unitPriceText: "60,00 €", lineTotalText: "60,00 €", confidence: 0.95 },
    { lineNo: 6, description: "Implante dental de titanio piezas 36 y 46", code: "IMPLANT", teeth: [36, 46], quantityText: "2", unitPriceText: "750,00 €", lineTotalText: "1.500,00 €", confidence: 0.97 },
    { lineNo: 7, description: "Pilar personalizado sobre implante piezas 36 y 46", code: "ABUTMENT", teeth: [36, 46], quantityText: "2", unitPriceText: "220,00 €", lineTotalText: "440,00 €", confidence: 0.93 },
    { lineNo: 8, description: "Impresión digital con escáner intraoral", code: "DIGITAL_IMPRESSION", teeth: [], quantityText: "1", unitPriceText: "80,00 €", lineTotalText: "80,00 €", confidence: 0.9 },
    { lineNo: 9, description: "Corona de zirconio sobre implante piezas 36 y 46", code: "IMPLANT_CROWN", teeth: [36, 46], quantityText: "2", unitPriceText: "720,00 €", lineTotalText: "1.440,00 €", confidence: 0.96 },
    { lineNo: 10, description: "Ajuste oclusal", code: "OCCLUSAL_ADJUSTMENT", teeth: [], quantityText: "1", unitPriceText: "40,00 €", lineTotalText: "40,00 €", confidence: 0.92 },
    { lineNo: 11, description: "Férula de descarga nocturna", code: "NIGHT_GUARD", teeth: [], quantityText: "1", unitPriceText: "180,00 €", lineTotalText: "180,00 €", confidence: 0.94 },
    { lineNo: 12, description: "Revisión final y radiografía de control", code: "REVIEW_XRAY", teeth: [], quantityText: "1", unitPriceText: "30,00 €", lineTotalText: "30,00 €", confidence: 0.74 },
  ],
};

type L = ExtractionResult["lines"][number];
const line = (
  n: number,
  description: string,
  code: L["code"],
  category: L["category"],
  teeth: number[],
  qty: number,
  unitPriceCents: number,
  confidence: number,
  issues: L["issues"] = [],
): L => ({
  id: `L${n}`,
  lineNo: n,
  description,
  code,
  category,
  teeth,
  qty,
  unitPriceCents,
  totalCents: qty * unitPriceCents,
  confidence,
  issues,
  source: "extracted",
});

export const GOLDEN_LINES: L[] = [
  line(1, "Primera visita, exploración y plan de tratamiento", "EXAM", "DIAGNOSTIC", [], 1, 4_000, 0.98),
  line(2, "TAC dental 3D (CBCT)", "CBCT", "DIAGNOSTIC", [], 1, 9_000, 0.97),
  line(3, "Tartrectomía (limpieza bucal completa)", "HYGIENE", "PREVENTIVE", [], 1, 6_000, 0.96),
  line(4, "Extracción simple pieza 36", "EXTRACTION", "SURGICAL", [36], 1, 11_000, 0.97),
  line(5, "Obturación de composite pieza 37", "FILLING", "RESTORATIVE", [37], 1, 6_000, 0.95),
  line(6, "Implante dental de titanio piezas 36 y 46", "IMPLANT", "IMPLANT", [36, 46], 2, 75_000, 0.97),
  line(7, "Pilar personalizado sobre implante piezas 36 y 46", "ABUTMENT", "IMPLANT", [36, 46], 2, 22_000, 0.93),
  line(8, "Impresión digital con escáner intraoral", "DIGITAL_IMPRESSION", "PROSTHETIC", [], 1, 8_000, 0.9),
  line(9, "Corona de zirconio sobre implante piezas 36 y 46", "IMPLANT_CROWN", "PROSTHETIC", [36, 46], 2, 72_000, 0.96),
  line(10, "Ajuste oclusal", "OCCLUSAL_ADJUSTMENT", "RESTORATIVE", [], 1, 4_000, 0.92),
  line(11, "Férula de descarga nocturna", "NIGHT_GUARD", "PREVENTIVE", [], 1, 18_000, 0.94),
  // Low confidence on purpose: the check bar shows "1 to review".
  line(12, "Revisión final y radiografía de control", "REVIEW_XRAY", "DIAGNOSTIC", [], 1, 3_000, 0.74, ["LOW_CONFIDENCE"]),
];

export const GOLDEN_TOTAL_CENTS = 407_000;

export const GOLDEN_EXTRACTION: ExtractionResult = {
  quoteId: GOLDEN_QUOTE_ID,
  pdfSha256: "golden-implant-case",
  clinicName: GOLDEN_RAW_EXTRACTION.clinicName,
  dentistName: GOLDEN_DENTIST,
  patientName: GOLDEN_RAW_EXTRACTION.patientName,
  quoteRef: GOLDEN_RAW_EXTRACTION.quoteRef,
  quoteDate: "2026-11-12",
  lines: GOLDEN_LINES,
  totalCents: GOLDEN_TOTAL_CENTS,
  checks: {
    sumOfLinesCents: GOLDEN_TOTAL_CENTS,
    printedTotalCents: GOLDEN_TOTAL_CENTS,
    sumMatches: true,
    invalidTeeth: [],
    lowConfidenceLineIds: ["L12"],
    toReviewLineIds: ["L12"],
  },
  source: "fixture",
  model: null,
  extractedAt: T0,
};

const approved = (noteId: Plan["approvedNotes"][number]["noteId"]) => ({
  noteId,
  noteVersion: 1,
  approvedBy: GOLDEN_DENTIST,
  approvedAt: T0,
});

/** Approved hero plan at SIM start (2026-11-16): ph1 due, nothing paid. */
export const GOLDEN_PLAN: Plan = {
  id: GOLDEN_PLAN_ID,
  version: 1,
  caseKind: "implant",
  status: "approved",
  currency: "EUR",
  clinic: { name: "Clínica Dental Ribera", city: "Valencia", dentistName: GOLDEN_DENTIST },
  patient: { alias: "María G.", email: GOLDEN_PATIENT_EMAIL, locale: "es" },
  quoteId: GOLDEN_QUOTE_ID,
  lines: GOLDEN_LINES,
  totalCents: GOLDEN_TOTAL_CENTS,
  phases: [
    {
      id: "ph1",
      n: 1,
      kind: "PREP",
      title: { es: "Diagnóstico, limpieza y extracción", en: "Diagnosis, cleaning and extraction" },
      lineIds: ["L1", "L2", "L3", "L4", "L5"],
      teeth: [36, 37],
      startDate: "2026-11-16",
      durationDays: 1,
      endDate: "2026-11-17",
      dependsOn: [],
      amountCents: 36_000,
      fit: { band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" },
      payment: { dueDate: "2026-11-16", status: "due", orderAttempt: 0 },
      delivery: { status: "pending" },
      noteIds: ["AFTERCARE_EXTRACTION", "PAY_PER_PHASE_PROMISE", "PAY_IN_3_RANGE"],
    },
    {
      id: "ph2",
      n: 2,
      kind: "IMPLANT_SURGERY",
      title: { es: "Colocación de implantes", en: "Implant placement" },
      lineIds: ["L6"],
      teeth: [36, 46],
      startDate: "2027-01-12",
      durationDays: 1,
      endDate: "2027-01-13",
      dependsOn: [
        {
          phaseId: "ph1",
          minLagDays: 56,
          maxLagDays: 180,
          riskNoteId: "HEALING_EXTRACTION_MIN_8W",
          deadlineNoteId: "HEALING_EXTRACTION_MAX_6M",
        },
      ],
      amountCents: 150_000,
      fit: { band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" },
      payment: { dueDate: "2027-01-12", status: "scheduled", orderAttempt: 0 },
      delivery: { status: "pending" },
      noteIds: ["HEALING_EXTRACTION_MIN_8W", "HEALING_EXTRACTION_MAX_6M", "AFTERCARE_IMPLANT", "PAY_IN_3_RANGE"],
    },
    {
      id: "ph3",
      n: 3,
      kind: "IMPRESSIONS",
      title: { es: "Pilares e impresiones", en: "Abutments and impressions" },
      lineIds: ["L7", "L8"],
      teeth: [36, 46],
      startDate: "2027-04-07",
      durationDays: 1,
      endDate: "2027-04-08",
      dependsOn: [
        {
          phaseId: "ph2",
          minLagDays: 84,
          maxLagDays: 180,
          riskNoteId: "OSSEOINTEGRATION_MIN_12W",
          deadlineNoteId: "OSSEOINTEGRATION_MAX_6M",
        },
      ],
      amountCents: 52_000,
      fit: { band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" },
      payment: { dueDate: "2027-04-07", status: "scheduled", orderAttempt: 0 },
      delivery: { status: "pending" },
      noteIds: ["OSSEOINTEGRATION_MIN_12W", "OSSEOINTEGRATION_MAX_6M", "PAY_IN_3_RANGE"],
    },
    {
      id: "ph4",
      n: 4,
      kind: "PROSTHETIC",
      title: { es: "Coronas definitivas", en: "Final crowns" },
      lineIds: ["L9", "L10", "L11", "L12"],
      teeth: [36, 46],
      startDate: "2027-04-22",
      durationDays: 1,
      endDate: "2027-04-23",
      dependsOn: [
        {
          phaseId: "ph3",
          minLagDays: 14,
          maxLagDays: 60,
          riskNoteId: "LAB_FABRICATION_MIN_2W",
          deadlineNoteId: "IMPRESSION_MAX_8W",
        },
      ],
      amountCents: 169_000,
      fit: { band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" },
      payment: { dueDate: "2027-04-22", status: "scheduled", orderAttempt: 0 },
      delivery: { status: "pending" },
      noteIds: ["LAB_FABRICATION_MIN_2W", "IMPRESSION_MAX_8W", "PAY_IN_3_RANGE"],
    },
  ],
  baseline: {
    capturedAt: T0,
    version: 1,
    phases: [
      { phaseId: "ph1", startDate: "2026-11-16", endDate: "2026-11-17", dueDate: "2026-11-16", amountCents: 36_000 },
      { phaseId: "ph2", startDate: "2027-01-12", endDate: "2027-01-13", dueDate: "2027-01-12", amountCents: 150_000 },
      { phaseId: "ph3", startDate: "2027-04-07", endDate: "2027-04-08", dueDate: "2027-04-07", amountCents: 52_000 },
      { phaseId: "ph4", startDate: "2027-04-22", endDate: "2027-04-23", dueDate: "2027-04-22", amountCents: 169_000 },
    ],
  },
  approvedNotes: [
    approved("AFTERCARE_EXTRACTION"),
    approved("PAY_PER_PHASE_PROMISE"),
    approved("PAY_IN_3_RANGE"),
    approved("HEALING_EXTRACTION_MIN_8W"),
    approved("HEALING_EXTRACTION_MAX_6M"),
    approved("AFTERCARE_IMPLANT"),
    approved("OSSEOINTEGRATION_MIN_12W"),
    approved("OSSEOINTEGRATION_MAX_6M"),
    approved("LAB_FABRICATION_MIN_2W"),
    approved("IMPRESSION_MAX_8W"),
    approved("REFERRAL_ASK_CLINIC"),
  ],
  approvedBy: GOLDEN_DENTIST,
  approvedAt: T0,
  createdAt: T0,
  updatedAt: T0,
};

/** The demo's dentist edit (beat 5): bone graft added to phase 2 → €1,950, still Pay in 3 range. */
export const GOLDEN_BONE_GRAFT_EDIT: PlanEdit = {
  kind: "ADD_LINE",
  phaseId: "ph2",
  line: {
    description: "Injerto óseo con membrana (regeneración ósea guiada) pieza 36",
    code: "BONE_GRAFT",
    teeth: [36],
    qty: 1,
    unitPriceCents: 45_000,
  },
};

/**
 * diffPlans(GOLDEN_PLAN, applyEdit(GOLDEN_PLAN, GOLDEN_BONE_GRAFT_EDIT, now)). The engine must produce exactly
 * this. explainDiff, the clinic diff panel and the agent (reissue at €1,950) use it so they never wait
 * for the engine. ph2→ph3 min lag becomes 112 days (BONE_GRAFT_HEALING_16W): ph3 and ph4 move +28 days.
 */
export const GOLDEN_BONE_GRAFT_DIFF: PlanDiff = {
  planId: GOLDEN_PLAN_ID,
  fromVersion: 1,
  toVersion: 2,
  totalBeforeCents: GOLDEN_TOTAL_CENTS,
  totalAfterCents: GOLDEN_TOTAL_CENTS + 45_000,
  totalDeltaCents: 45_000,
  phases: [
    {
      phaseId: "ph2",
      n: 2,
      amountBeforeCents: 150_000,
      amountAfterCents: 195_000,
      deltaCents: 45_000,
      fitBefore: "PAY_IN_3",
      fitAfter: "PAY_IN_3",
      addedLines: [
        {
          id: "E1",
          lineNo: 13,
          description: "Injerto óseo con membrana (regeneración ósea guiada) pieza 36",
          code: "BONE_GRAFT",
          category: "SURGICAL",
          teeth: [36],
          qty: 1,
          unitPriceCents: 45_000,
          totalCents: 45_000,
          confidence: 1,
          issues: [],
          source: "clinic_edit",
        },
      ],
      removedLines: [],
      startBefore: "2027-01-12",
      startAfter: "2027-01-12",
    },
    {
      phaseId: "ph3",
      n: 3,
      amountBeforeCents: 52_000,
      amountAfterCents: 52_000,
      deltaCents: 0,
      fitBefore: "PAY_IN_3",
      fitAfter: "PAY_IN_3",
      addedLines: [],
      removedLines: [],
      startBefore: "2027-04-07",
      startAfter: "2027-05-05",
    },
    {
      phaseId: "ph4",
      n: 4,
      amountBeforeCents: 169_000,
      amountAfterCents: 169_000,
      deltaCents: 0,
      fitBefore: "PAY_IN_3",
      fitAfter: "PAY_IN_3",
      addedLines: [],
      removedLines: [],
      startBefore: "2027-04-22",
      startAfter: "2027-05-20",
    },
  ],
};

/** The demo's delay what-if (beat 3): implants 6 weeks later; ph3/ph4 follow by 42 days. */
export const GOLDEN_DELAY_MOVE = { phaseId: "ph2", newStartDate: "2027-02-23" } as const;
/** An illegal drag (beat 3b): 2 weeks earlier breaks the 8-week healing minimum → snap back. */
export const GOLDEN_ILLEGAL_MOVE = { phaseId: "ph2", newStartDate: "2026-12-29" } as const;

/** Deep clone so tests can mutate freely. */
export function goldenPlan(): Plan {
  return structuredClone(GOLDEN_PLAN);
}
export function goldenExtraction(): ExtractionResult {
  return structuredClone(GOLDEN_EXTRACTION);
}
