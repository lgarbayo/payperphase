/**
 * OWNED BY WP-03. Fill slot templates with ENGINE values only. Formatting happens here (money via
 * formatCents, dates via formatIsoDate), so no caller ever pastes a number into patient text.
 */
import { isValidFdi, type Locale, type LocalizedText, type WordingSlot } from "@/contracts";
import { formatIsoDate, isIsoDate, type IsoDate } from "@/lib/dates";
import { formatCents, isCents, type Cents } from "@/lib/money";
import { SLOT_RE, validateTemplate } from "./validate";

/** Raw engine values. Every field is optional; a template may only use slots whose value is present. */
export interface SlotValues {
  amountCents?: Cents;
  date?: IsoDate;
  teeth?: readonly number[];
  /** Minimum lag from the previous phase in days; rendered as {{minWeeks}} = ⌈minLagDays / 7⌉. */
  minLagDays?: number;
  phaseN?: number;
  dentist?: string;
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

/** "36 y 46", "36, 37 y 46" / "36 and 46". */
export function formatTeeth(teeth: readonly number[], locale: Locale): string {
  const list = teeth.map(String);
  if (list.length <= 1) return list.join("");
  const and = locale === "es" ? " y " : " and ";
  return `${list.slice(0, -1).join(", ")}${and}${list[list.length - 1]}`;
}

export function minWeeks(minLagDays: number): number {
  return Math.ceil(minLagDays / 7);
}

/** Slot → display string for every slot with a valid engine value. Invalid values throw. */
export function slotStrings(values: SlotValues, locale: Locale): Partial<Record<WordingSlot, string>> {
  const out: Partial<Record<WordingSlot, string>> = {};
  if (values.amountCents !== undefined) {
    if (!isCents(values.amountCents)) throw new TemplateError(`amountCents is not cents: ${values.amountCents}`);
    out.amount = formatCents(values.amountCents, locale);
  }
  if (values.date !== undefined) {
    if (!isIsoDate(values.date)) throw new TemplateError(`date is not an IsoDate: ${values.date}`);
    out.date = formatIsoDate(values.date, locale, { month: "long" });
  }
  if (values.teeth !== undefined && values.teeth.length > 0) {
    if (!values.teeth.every(isValidFdi)) throw new TemplateError(`teeth contains an invalid FDI number`);
    out.teeth = formatTeeth(values.teeth, locale);
  }
  if (values.minLagDays !== undefined && values.minLagDays > 0) {
    if (!Number.isInteger(values.minLagDays)) throw new TemplateError(`minLagDays must be an integer`);
    out.minWeeks = String(minWeeks(values.minLagDays));
  }
  if (values.phaseN !== undefined) {
    if (!Number.isInteger(values.phaseN) || values.phaseN < 1) throw new TemplateError(`phaseN must be a positive integer`);
    out.phaseN = String(values.phaseN);
  }
  if (values.dentist !== undefined && values.dentist.trim() !== "") out.dentist = values.dentist.trim();
  return out;
}

/** Slots that have a value in `values` (what a template for this context may use). */
export function availableSlots(values: SlotValues): WordingSlot[] {
  return Object.keys(slotStrings(values, "es")) as WordingSlot[];
}

/** Replace {{name}} with map[name]; unknown names throw. Low-level: no validation of the text. */
export function renderSlots(template: string, map: Readonly<Record<string, string | undefined>>): string {
  return template.replace(SLOT_RE, (_, name: string) => {
    const v = map[name];
    if (v === undefined) throw new TemplateError(`No value for slot {{${name}}}`);
    return v;
  });
}

/**
 * Validate `template` against the slots available in `values`, then fill it. Throws TemplateError when the
 * template has text that must not be there (digits, currency, %, month names, unknown or empty slots).
 */
export function fillSlots(template: string, values: SlotValues, locale: Locale): string {
  const strings = slotStrings(values, locale);
  const check = validateTemplate(template, { allowed: Object.keys(strings) as WordingSlot[] });
  if (!check.ok) {
    throw new TemplateError(`Invalid template: ${check.issues.map((i) => `${i.code}(${i.text})`).join(", ")}`);
  }
  return renderSlots(template, strings);
}

export function fillLocalized(template: LocalizedText, values: SlotValues): LocalizedText {
  return { es: fillSlots(template.es, values, "es"), en: fillSlots(template.en, values, "en") };
}
