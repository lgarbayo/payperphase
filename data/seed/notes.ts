/**
 * OWNED BY WP-02. Clinician note library (ES/EN). Patients see a note only after the clinic
 * approves it for their plan. Texts must contain NO dosages, NO diagnoses, NO prices, NO dates.
 * SCAFFOLD STUB: initial texts, WP-02 reviews and completes them.
 */
import type { ClinicalNote, NoteId } from "@/contracts";

const n = (
  id: NoteId,
  kind: ClinicalNote["kind"],
  title: ClinicalNote["title"],
  text: ClinicalNote["text"],
): ClinicalNote => ({ id, kind, title, text, version: 1 });

export const NOTE_LIBRARY: Record<NoteId, ClinicalNote> = {
  HEALING_EXTRACTION_MIN_8W: n(
    "HEALING_EXTRACTION_MIN_8W",
    "HEALING",
    { es: "Cicatrización del hueso", en: "Bone healing" },
    {
      es: "Tras una extracción, el hueso necesita al menos 8 semanas para cicatrizar antes de colocar un implante.",
      en: "After an extraction, the bone needs at least 8 weeks to heal before an implant can be placed.",
    },
  ),
  HEALING_EXTRACTION_MAX_6M: n(
    "HEALING_EXTRACTION_MAX_6M",
    "RISK_DELAY",
    { es: "No esperar demasiado", en: "Don't wait too long" },
    {
      es: "Si el implante se retrasa más de 6 meses tras la extracción, el hueso puede reducirse y podría hacer falta un injerto. Tu clínica lo revisará contigo.",
      en: "If the implant is delayed more than 6 months after the extraction, the bone can shrink and a graft may be needed. Your clinic will review it with you.",
    },
  ),
  OSSEOINTEGRATION_MIN_12W: n(
    "OSSEOINTEGRATION_MIN_12W",
    "HEALING",
    { es: "Integración del implante", en: "Implant integration" },
    {
      es: "El implante necesita unas 12 semanas para unirse al hueso antes de colocar el pilar y la corona.",
      en: "The implant needs about 12 weeks to fuse with the bone before the abutment and crown are placed.",
    },
  ),
  OSSEOINTEGRATION_MAX_6M: n(
    "OSSEOINTEGRATION_MAX_6M",
    "RISK_DELAY",
    { es: "Completar la restauración", en: "Completing the restoration" },
    {
      es: "Si pasan más de 6 meses sin completar la restauración, los dientes vecinos pueden moverse. Tu clínica revisará el plan.",
      en: "If more than 6 months pass without completing the restoration, neighbouring teeth can shift. Your clinic will review the plan.",
    },
  ),
  BONE_GRAFT_HEALING_16W: n(
    "BONE_GRAFT_HEALING_16W",
    "HEALING",
    { es: "Cicatrización del injerto", en: "Graft healing" },
    {
      es: "Con un injerto óseo, la integración suele necesitar más tiempo, alrededor de 16 semanas.",
      en: "With a bone graft, integration usually needs more time, around 16 weeks.",
    },
  ),
  LAB_FABRICATION_MIN_2W: n(
    "LAB_FABRICATION_MIN_2W",
    "PROCEDURE",
    { es: "Fabricación en laboratorio", en: "Lab fabrication" },
    {
      es: "El laboratorio necesita al menos 2 semanas para fabricar las coronas a partir de tus impresiones.",
      en: "The lab needs at least 2 weeks to make the crowns from your impressions.",
    },
  ),
  SPLIT_VISITS_MIN_1W: n(
    "SPLIT_VISITS_MIN_1W",
    "PROCEDURE",
    { es: "Fase en dos visitas", en: "Phase in two visits" },
    {
      es: "Esta parte del tratamiento se hace en dos visitas separadas al menos una semana, y cada visita se paga el día que se realiza.",
      en: "This part of the treatment is done in two visits at least one week apart, and each visit is paid on the day it happens.",
    },
  ),
  IMPRESSION_MAX_8W: n(
    "IMPRESSION_MAX_8W",
    "RISK_DELAY",
    { es: "Validez de las impresiones", en: "Impressions stay valid" },
    {
      es: "Si pasan más de 8 semanas desde las impresiones, puede que haya que repetirlas para que las coronas ajusten bien.",
      en: "If more than 8 weeks pass after the impressions, they may need to be retaken so the crowns fit well.",
    },
  ),
  PERIO_BEFORE_IMPLANT: n(
    "PERIO_BEFORE_IMPLANT",
    "PROCEDURE",
    { es: "Encías sanas primero", en: "Healthy gums first" },
    {
      es: "Las encías deben estar sanas antes de colocar implantes; por eso el tratamiento periodontal va primero.",
      en: "Gums must be healthy before implants are placed, which is why gum treatment comes first.",
    },
  ),
  PERIO_REEVAL_MIN_6W: n(
    "PERIO_REEVAL_MIN_6W",
    "HEALING",
    { es: "Revaluación de encías", en: "Gum re-evaluation" },
    {
      es: "Tras el raspado, las encías se revisan pasadas al menos 6 semanas para ver cómo han respondido.",
      en: "After deep cleaning, gums are re-checked after at least 6 weeks to see how they responded.",
    },
  ),
  ALIGNER_BATCH_MIN_6W: n(
    "ALIGNER_BATCH_MIN_6W",
    "PROCEDURE",
    { es: "Cada tanda de alineadores", en: "Each aligner batch" },
    {
      es: "Cada tanda de alineadores se usa durante al menos 6 semanas antes de pasar a la siguiente.",
      en: "Each batch of aligners is worn for at least 6 weeks before moving to the next one.",
    },
  ),
  ALIGNER_BATCH_MAX_12W: n(
    "ALIGNER_BATCH_MAX_12W",
    "RISK_DELAY",
    { es: "No alargar las tandas", en: "Don't stretch batches" },
    {
      es: "Si una tanda se alarga más de 12 semanas, el tratamiento puede perder eficacia. Tu clínica lo revisará.",
      en: "If a batch runs longer than 12 weeks, treatment can lose effectiveness. Your clinic will review it.",
    },
  ),
  RETENTION_AFTER_ORTHO: n(
    "RETENTION_AFTER_ORTHO",
    "AFTERCARE",
    { es: "Retención", en: "Retention" },
    {
      es: "Al terminar la ortodoncia, el retenedor mantiene los dientes en su nueva posición.",
      en: "After orthodontics, the retainer keeps teeth in their new position.",
    },
  ),
  AFTERCARE_EXTRACTION: n(
    "AFTERCARE_EXTRACTION",
    "AFTERCARE",
    { es: "Después de la extracción", en: "After the extraction" },
    {
      es: "Las primeras 24 horas conviene comer blando, no fumar y no enjuagarse con fuerza. Ante cualquier duda, llama a tu clínica.",
      en: "For the first 24 hours, eat soft food, don't smoke and don't rinse hard. If in doubt, call your clinic.",
    },
  ),
  AFTERCARE_IMPLANT: n(
    "AFTERCARE_IMPLANT",
    "AFTERCARE",
    { es: "Después del implante", en: "After the implant" },
    {
      es: "Tras la cirugía es normal notar algo de inflamación unos días. Sigue las indicaciones que te dé tu clínica en la visita.",
      en: "Some swelling for a few days after surgery is normal. Follow the instructions your clinic gives you at the visit.",
    },
  ),
  PAY_PER_PHASE_PROMISE: n(
    "PAY_PER_PHASE_PROMISE",
    "PAYMENT",
    { es: "Pagas fase a fase", en: "You pay phase by phase" },
    {
      es: "Pagas cada fase el día de su visita, cuando la recibes. Nunca pagas por adelantado tratamiento que aún no has recibido.",
      en: "You pay each phase on the day of its visit, when you receive it. You never prepay for treatment you have not received yet.",
    },
  ),
  PAY_IN_3_RANGE: n(
    "PAY_IN_3_RANGE",
    "PAYMENT",
    { es: "Dentro del rango de Paga en 3", en: "Within Pay in 3 range" },
    {
      es: "El importe de esta fase está dentro del rango de PayPal Paga en 3 plazos. PayPal decide la disponibilidad al pagar.",
      en: "This phase's amount is within PayPal's Pay in 3 range. PayPal decides availability at checkout.",
    },
  ),
  INSTALLMENTS_ONLY_REASON: n(
    "INSTALLMENTS_ONLY_REASON",
    "PAYMENT",
    { es: "Fase indivisible", en: "Indivisible phase" },
    {
      es: "Esta fase no se puede dividir por motivos clínicos y supera el rango de Paga en 3; se paga con PayPal o a plazos si PayPal lo ofrece.",
      en: "This phase cannot be split for clinical reasons and is above the Pay in 3 range; pay with PayPal, or in installments if PayPal offers them.",
    },
  ),
  REFERRAL_ASK_CLINIC: n(
    "REFERRAL_ASK_CLINIC",
    "REFERRAL",
    { es: "Pregunta a tu clínica", en: "Ask your clinic" },
    {
      es: "Esa pregunta debe responderla tu dentista. Puedes enviar un mensaje a tu clínica.",
      en: "Your dentist should answer that question. You can send a message to your clinic.",
    },
  ),
};

export function getNote(id: NoteId): ClinicalNote {
  return NOTE_LIBRARY[id];
}
