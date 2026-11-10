/**
 * OWNED BY WP-07. Human labels for the closed procedure vocabulary, used by the plan editor's
 * "Añadir línea" form. Same ES/EN shape as the note library.
 */
import type { LocalizedText, ProcedureCode } from "@/contracts";

export const PROCEDURE_LABEL: Record<ProcedureCode, LocalizedText> = {
  EXAM: { es: "Exploración", en: "Examination" },
  CBCT: { es: "TAC dental 3D", en: "3D dental scan (CBCT)" },
  PANORAMIC_XRAY: { es: "Ortopantomografía", en: "Panoramic X-ray" },
  HYGIENE: { es: "Limpieza", en: "Hygiene" },
  EXTRACTION: { es: "Extracción", en: "Extraction" },
  SURGICAL_EXTRACTION: { es: "Extracción quirúrgica", en: "Surgical extraction" },
  BONE_GRAFT: { es: "Injerto óseo", en: "Bone graft" },
  SINUS_LIFT: { es: "Elevación de seno", en: "Sinus lift" },
  IMPLANT: { es: "Implante", en: "Implant" },
  ABUTMENT: { es: "Pilar sobre implante", en: "Abutment" },
  DIGITAL_IMPRESSION: { es: "Impresión digital", en: "Digital impression" },
  IMPLANT_CROWN: { es: "Corona sobre implante", en: "Implant crown" },
  CROWN: { es: "Corona", en: "Crown" },
  TEMPORARY_CROWN: { es: "Corona provisional", en: "Temporary crown" },
  ROOT_CANAL: { es: "Endodoncia", en: "Root canal" },
  FILLING: { es: "Obturación", en: "Filling" },
  SCALING_ROOT_PLANING: { es: "Raspado y alisado", en: "Scaling and root planing" },
  PERIO_SURGERY: { es: "Cirugía periodontal", en: "Periodontal surgery" },
  PERIO_MAINTENANCE: { es: "Mantenimiento periodontal", en: "Periodontal maintenance" },
  ORTHO_RECORDS: { es: "Registros de ortodoncia", en: "Orthodontic records" },
  ALIGNER_BATCH: { es: "Tanda de alineadores", en: "Aligner batch" },
  ORTHO_BRACES: { es: "Brackets", en: "Braces" },
  RETAINER: { es: "Retenedor", en: "Retainer" },
  OCCLUSAL_ADJUSTMENT: { es: "Ajuste oclusal", en: "Occlusal adjustment" },
  NIGHT_GUARD: { es: "Férula de descarga", en: "Night guard" },
  REVIEW_XRAY: { es: "Revisión y radiografía", en: "Review and X-ray" },
  WHITENING: { es: "Blanqueamiento", en: "Whitening" },
  OTHER: { es: "Otro", en: "Other" },
};

/**
 * Dentist-typed euro price → integer cents ("450", "450,50", "1.950,00", "1950.5").
 * Returns null for anything that is not a plain non-negative amount with ≤ 2 decimals.
 */
export function parseEuroInput(raw: string): number | null {
  const s = raw.replace(/[\s €]/g, "").replace(/EUR$/i, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let frac = "";
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = Math.max(lastComma, lastDot);
    const thousands = dec === lastComma ? "." : ",";
    intPart = s.slice(0, dec).split(thousands).join("");
    frac = s.slice(dec + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1] ?? "";
    // "1.950" / "12,000" → thousands separators; "450,5" / "19.95" → decimals.
    if (parts.length > 2 || tail.length === 3) intPart = parts.join("");
    else {
      intPart = parts[0] ?? "";
      frac = tail;
    }
  } else intPart = s;
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(frac)) return null;
  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}
