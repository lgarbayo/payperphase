/**
 * Deterministic ES/EN phase templates: the fallback whenever Claude is off, slow, refuses,
 * or drafts something the validator rejects. They use slots only, so they always validate.
 */
import type { LocalizedText, PhaseKind, Plan, WordingSlot } from "@/contracts";
import { availableSlots, minWeeks, type SlotValues } from "./fill";

type Phase = Plan["phases"][number];

const KIND_PHRASE: Record<PhaseKind, LocalizedText> = {
  PREP: { es: "diagnóstico y preparación de la boca", en: "diagnosis and getting your mouth ready" },
  IMPLANT_SURGERY: { es: "colocación de los implantes", en: "placing the implants" },
  IMPRESSIONS: { es: "pilares e impresiones para tus coronas", en: "abutments and impressions for your crowns" },
  PROSTHETIC: { es: "colocación de las coronas definitivas", en: "fitting your final crowns" },
  PERIO_THERAPY: { es: "tratamiento de las encías", en: "gum treatment" },
  PERIO_REEVALUATION: { es: "revisión de las encías", en: "gum re-check" },
  ORTHO_START: { es: "inicio de la ortodoncia", en: "starting your orthodontic treatment" },
  ALIGNER_BATCH: { es: "nueva tanda de alineadores", en: "a new set of aligners" },
  ORTHO_FINISH: { es: "final de la ortodoncia y retención", en: "finishing orthodontics and retention" },
  MAINTENANCE: { es: "revisión y mantenimiento", en: "check-up and maintenance" },
};

/** Engine values for one phase: amount and due date from the payment milestone, the largest min lag. */
export function phaseSlotValues(plan: Plan, phase: Phase): SlotValues {
  const minLag = phase.dependsOn.reduce((m, d) => Math.max(m, d.minLagDays), 0);
  return {
    amountCents: phase.amountCents,
    date: phase.payment.dueDate,
    teeth: phase.teeth,
    minLagDays: minLag > 0 ? minLag : undefined,
    phaseN: phase.n,
    dentist: plan.clinic.dentistName,
  };
}

/** Every phase summary must tell the patient what they pay and when. */
export const REQUIRED_PHASE_SLOTS: readonly WordingSlot[] = ["amount", "date"];

export function deterministicPhaseTemplate(phase: Phase, values: SlotValues): LocalizedText {
  const slots = availableSlots(values);
  const has = (s: WordingSlot) => slots.includes(s);
  const kind = KIND_PHRASE[phase.kind];
  const oneTooth = (values.teeth?.length ?? 0) === 1;
  const oneWeek = values.minLagDays !== undefined && minWeeks(values.minLagDays) === 1;

  const es: string[] = [];
  const en: string[] = [];
  const head = has("phaseN") ? { es: "Fase {{phaseN}}: ", en: "Phase {{phaseN}}: " } : { es: "", en: "" };
  const teeth = has("teeth")
    ? oneTooth
      ? { es: " en la pieza {{teeth}}", en: " on tooth {{teeth}}" }
      : { es: " en las piezas {{teeth}}", en: " on teeth {{teeth}}" }
    : { es: "", en: "" };
  es.push(`${head.es}${kind.es}${teeth.es}.`);
  en.push(`${head.en}${kind.en}${teeth.en}.`);

  es.push("Pagas {{amount}} el {{date}}, el día que recibes esta fase y nunca antes.");
  en.push("You pay {{amount}} on {{date}}, the day you receive this phase and never before.");

  if (has("minWeeks")) {
    es.push(`Empieza como pronto {{minWeeks}} ${oneWeek ? "semana" : "semanas"} después de la fase anterior.`);
    en.push(`It starts at least {{minWeeks}} ${oneWeek ? "week" : "weeks"} after the previous phase.`);
  }
  if (has("dentist")) {
    es.push("Te atiende {{dentist}}.");
    en.push("Your dentist: {{dentist}}.");
  }
  return { es: capitalise(es.join(" ")), en: capitalise(en.join(" ")) };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
