/**
 * OWNED BY WP-02. Synthetic perio → implant quote. Its bilateral sinus lift is one indivisible €2,200 item,
 * above Pay in 3's €2,000 max, so the engine flags that phase INSTALLMENTS (INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX).
 */
import { extractionOf, rawOf, type QuoteSpec } from "./quoteSpec";

export const PERIO_DENTIST = "Dr. Ignacio Vidal";

export const PERIO_QUOTE: QuoteSpec = {
  quoteId: "q_ribera_perio_001",
  clinicName: "Clínica Dental Ribera",
  dentistName: PERIO_DENTIST,
  patientName: "Carmen Ortega (paciente ficticia)",
  quoteRef: "PRES-2026-0163",
  quoteDateText: "12/11/2026",
  quoteDate: "2026-11-12",
  extractedAt: "2026-11-16T08:00:00.000Z",
  lines: [
    { description: "Primera visita, exploración y sondaje periodontal", code: "EXAM", teeth: [], qty: 1, unitPriceCents: 4_000, confidence: 0.98 },
    { description: "Ortopantomografía (radiografía panorámica)", code: "PANORAMIC_XRAY", teeth: [], qty: 1, unitPriceCents: 3_500, confidence: 0.97 },
    { description: "Raspado y alisado radicular por cuadrante", code: "SCALING_ROOT_PLANING", teeth: [], qty: 4, unitPriceCents: 9_500, confidence: 0.95 },
    { description: "Revaluación periodontal y sondaje de control", code: "PERIO_MAINTENANCE", teeth: [], qty: 1, unitPriceCents: 6_000, confidence: 0.93 },
    { description: "Elevación de seno maxilar bilateral con injerto óseo", code: "SINUS_LIFT", teeth: [16, 26], qty: 1, unitPriceCents: 220_000, confidence: 0.92 },
    { description: "Implante dental de titanio piezas 16 y 26", code: "IMPLANT", teeth: [16, 26], qty: 2, unitPriceCents: 75_000, confidence: 0.96 },
    { description: "Pilar personalizado sobre implante piezas 16 y 26", code: "ABUTMENT", teeth: [16, 26], qty: 2, unitPriceCents: 22_000, confidence: 0.94 },
    { description: "Impresión digital con escáner intraoral", code: "DIGITAL_IMPRESSION", teeth: [], qty: 1, unitPriceCents: 8_000, confidence: 0.9 },
    { description: "Corona de zirconio sobre implante piezas 16 y 26", code: "IMPLANT_CROWN", teeth: [16, 26], qty: 2, unitPriceCents: 72_000, confidence: 0.95 },
  ],
};

export const PERIO_RAW_EXTRACTION = rawOf(PERIO_QUOTE);
export const perioExtraction = (pdfSha256: string) => extractionOf(PERIO_QUOTE, pdfSha256);
