/**
 * OWNED BY WP-02. Synthetic "Ortodoncia invisible" quote: records, 4 aligner batches, retainer (€3,600).
 * Every batch is its own milestone (the engine puts records + batch 1 in the first visit), 42–84 days apart.
 */
import { extractionOf, rawOf, type QuoteSpec } from "./quoteSpec";

export const ALIGNER_DENTIST = "Dr. Álvaro Ferrer";

export const ALIGNER_QUOTE: QuoteSpec = {
  quoteId: "q_ribera_aligner_001",
  clinicName: "Clínica Dental Ribera",
  dentistName: ALIGNER_DENTIST,
  patientName: "Javier Moreno (paciente ficticio)",
  quoteRef: "PRES-2026-0151",
  quoteDateText: "12/11/2026",
  quoteDate: "2026-11-12",
  extractedAt: "2026-11-16T08:00:00.000Z",
  lines: [
    { description: "Estudio de ortodoncia: fotografías, escáner 3D y planificación digital", code: "ORTHO_RECORDS", teeth: [], qty: 1, unitPriceCents: 38_000, confidence: 0.97 },
    { description: "Alineadores transparentes, tanda 1", code: "ALIGNER_BATCH", teeth: [], qty: 1, unitPriceCents: 75_000, confidence: 0.96 },
    { description: "Alineadores transparentes, tanda 2", code: "ALIGNER_BATCH", teeth: [], qty: 1, unitPriceCents: 75_000, confidence: 0.96 },
    { description: "Alineadores transparentes, tanda 3", code: "ALIGNER_BATCH", teeth: [], qty: 1, unitPriceCents: 75_000, confidence: 0.96 },
    { description: "Alineadores transparentes, tanda 4", code: "ALIGNER_BATCH", teeth: [], qty: 1, unitPriceCents: 75_000, confidence: 0.96 },
    { description: "Retenedor fijo o removible y revisión final", code: "RETAINER", teeth: [], qty: 1, unitPriceCents: 22_000, confidence: 0.94 },
  ],
};

export const ALIGNER_RAW_EXTRACTION = rawOf(ALIGNER_QUOTE);
export const alignerExtraction = (pdfSha256: string) => extractionOf(ALIGNER_QUOTE, pdfSha256);
