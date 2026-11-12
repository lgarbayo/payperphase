/**
 * Seed cases used by the store's seed-on-boot and demo reset.
 * Every plan is built by the real engine from the synthetic quote (buildPlan → approve → baseline → statuses),
 * so the seed can never disagree with what the engine would produce for the same PDF.
 */
import type { CaseKind, ExtractionResult, NoteId, Plan } from "@/contracts";
import { SIM_DEFAULT_START } from "@/contracts";
import {
  GOLDEN_DENTIST,
  GOLDEN_EXTRACTION,
  GOLDEN_PATIENT_EMAIL,
  GOLDEN_PLAN_ID,
} from "@/contracts/fixtures/implantCase";
import { applyPaymentStatuses, buildPlan, captureBaseline } from "@/engine";
import { ALIGNER_DENTIST, alignerExtraction } from "./alignerCase";
import { PERIO_DENTIST, perioExtraction } from "./perioCase";
import { SAMPLE_PDFS } from "./samples";

export interface SeedCase {
  key: string;
  caseKind: CaseKind;
  /** The hero case is the one Director Mode and the alias "demo" use. */
  hero: boolean;
  extraction: ExtractionResult;
  /** Approved plan as seeded (dates relative to SIM_DEFAULT_START). */
  plan: Plan;
  /** Path under /public of the synthetic PDF, served for download/drag in the clinic console. */
  samplePdf: string | null;
}

/** The seed clock: the wall-clock timestamp every seeded plan is created and approved at. */
export const SEED_NOW = `${SIM_DEFAULT_START}T08:00:00.000Z`;

const sampleSha = (id: string): string => SAMPLE_PDFS.find((s) => s.id === id)?.sha256 ?? "";
const samplePath = (id: string): string | null => SAMPLE_PDFS.find((s) => s.id === id)?.path ?? null;

/** Approved plan from an extraction: the clinic approves every note the plan references, plus the referral note. */
function approvedPlan(args: {
  planId: string;
  extraction: ExtractionResult;
  caseKind: CaseKind;
  dentistName: string;
  alias: string;
  email: string;
}): Plan {
  const draft = buildPlan({
    planId: args.planId,
    extraction: args.extraction,
    caseKind: args.caseKind,
    startDate: SIM_DEFAULT_START,
    today: SIM_DEFAULT_START,
    clinic: { name: args.extraction.clinicName, city: "Valencia", dentistName: args.dentistName },
    patient: { alias: args.alias, email: args.email, locale: "es" },
    now: SEED_NOW,
  });
  const noteIds: NoteId[] = [...new Set([...draft.phases.flatMap((p) => p.noteIds), "REFERRAL_ASK_CLINIC" as const])];
  const approved: Plan = {
    ...draft,
    status: "approved",
    approvedNotes: noteIds.map((noteId) => ({
      noteId,
      noteVersion: 1,
      approvedBy: args.dentistName,
      approvedAt: SEED_NOW,
    })),
    approvedBy: args.dentistName,
    approvedAt: SEED_NOW,
  };
  return applyPaymentStatuses(captureBaseline(approved, SEED_NOW), SIM_DEFAULT_START).plan;
}

export function seedCases(): SeedCase[] {
  const heroExtraction: ExtractionResult = {
    ...structuredClone(GOLDEN_EXTRACTION),
    pdfSha256: sampleSha("implant-ribera") || GOLDEN_EXTRACTION.pdfSha256,
  };
  const aligner = alignerExtraction(sampleSha("aligner-ribera"));
  const perio = perioExtraction(sampleSha("perio-ribera"));
  return [
    {
      key: "implant-ribera",
      caseKind: "implant",
      hero: true,
      extraction: heroExtraction,
      plan: approvedPlan({
        planId: GOLDEN_PLAN_ID,
        extraction: heroExtraction,
        caseKind: "implant",
        dentistName: GOLDEN_DENTIST,
        alias: "María G.",
        email: GOLDEN_PATIENT_EMAIL,
      }),
      samplePdf: samplePath("implant-ribera"),
    },
    {
      key: "aligner-ribera",
      caseKind: "aligner",
      hero: false,
      extraction: aligner,
      plan: approvedPlan({
        planId: "pln_ribera02",
        extraction: aligner,
        caseKind: "aligner",
        dentistName: ALIGNER_DENTIST,
        alias: "Javier M.",
        email: "paciente.ortodoncia@example.com",
      }),
      samplePdf: samplePath("aligner-ribera"),
    },
    {
      key: "perio-ribera",
      caseKind: "perio",
      hero: false,
      extraction: perio,
      plan: approvedPlan({
        planId: "pln_ribera03",
        extraction: perio,
        caseKind: "perio",
        dentistName: PERIO_DENTIST,
        alias: "Carmen O.",
        email: "paciente.periodoncia@example.com",
      }),
      samplePdf: samplePath("perio-ribera"),
    },
  ];
}

/** Golden extraction for a sample id (the `{sampleId}` extraction path and the cached fallback), or null. */
export function cachedExtractionBySampleId(sampleId: string): ExtractionResult | null {
  const c = seedCases().find((x) => x.key === sampleId);
  return c ? structuredClone(c.extraction) : null;
}

/** Golden extraction for a known sample PDF by its sha256 (cached extraction fallback), or null. */
export function cachedExtractionBySha(sha256: string): ExtractionResult | null {
  const sample = SAMPLE_PDFS.find((s) => s.sha256 !== "" && s.sha256 === sha256);
  return sample ? cachedExtractionBySampleId(sample.id) : null;
}

