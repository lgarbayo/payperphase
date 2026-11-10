/**
 * OWNED BY WP-02. Seed cases used by the store's seed-on-boot and demo reset (WP-09).
 * SCAFFOLD STUB: only the golden implant case; WP-02 adds the aligner case (and optional perio case)
 * and the sample PDFs under public/samples/.
 */
import type { CaseKind, ExtractionResult } from "@/contracts";
import { GOLDEN_EXTRACTION, GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import type { Plan } from "@/contracts";

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

export function seedCases(): SeedCase[] {
  return [
    {
      key: "implant-ribera",
      caseKind: "implant",
      hero: true,
      extraction: structuredClone(GOLDEN_EXTRACTION),
      plan: structuredClone(GOLDEN_PLAN),
      samplePdf: null,
    },
  ];
}

/** Samples offered in the clinic dropzone ("Try a sample"). sha256 → golden extraction mapping lives in WP-03. */
export interface SamplePdf {
  id: string;
  caseKind: CaseKind;
  label: { es: string; en: string };
  path: string;
}
export const SAMPLE_PDFS: SamplePdf[] = [];
