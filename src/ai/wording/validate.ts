/**
 * OWNED BY WP-03. Slot-template validator. A template may carry numbers, money and dates ONLY inside
 * {{slots}}; everything outside a slot is checked here before any fill.
 */
import { WORDING_SLOTS, type LocalizedText, type WordingSlot } from "@/contracts";

export type TemplateIssueCode =
  | "EMPTY"
  | "TOO_LONG"
  | "MALFORMED_SLOT"
  | "UNKNOWN_SLOT"
  | "SLOT_NOT_AVAILABLE"
  | "MISSING_SLOT"
  | "DIGIT"
  | "CURRENCY"
  | "PERCENT"
  | "MONTH";

export interface TemplateIssue {
  code: TemplateIssueCode;
  /** The offending text (or slot name). */
  text: string;
}

export interface TemplateValidation {
  ok: boolean;
  issues: TemplateIssue[];
  /** Known slots used, in order of first appearance. */
  slots: WordingSlot[];
}

export interface ValidateOptions {
  /** Slots that have an engine value in this context (default: all WORDING_SLOTS). */
  allowed?: readonly WordingSlot[];
  /** Slots the template must use. */
  required?: readonly WordingSlot[];
  /** Default 600 characters. */
  maxLength?: number;
}

export const SLOT_RE = /\{\{([A-Za-z]+)\}\}/g;

const isWordingSlot = (s: string): s is WordingSlot => (WORDING_SLOTS as readonly string[]).includes(s);

const MONTHS_ANY_CASE = [
  // ES
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre",
  "octubre", "noviembre", "diciembre", "ene", "abr", "dic",
  // EN
  "january", "february", "april", "june", "july", "august", "september", "october", "november", "december",
  "jan", "feb", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
];
/** "May" and "March" are also everyday English words ("you may feel…"): only the capitalised month counts. */
const MONTHS_CAPITALISED = ["May", "March"];

const word = (alternatives: string[], flags: string) =>
  new RegExp(`(?<!\\p{L})(?:${alternatives.join("|")})(?!\\p{L})`, `g${flags}`);

const CHECKS: { code: TemplateIssueCode; re: RegExp }[] = [
  { code: "DIGIT", re: /\p{Nd}+/gu },
  { code: "CURRENCY", re: /[€$£¥]/gu },
  { code: "CURRENCY", re: word(["eur", "euros?", "c[ée]ntimos?", "cents?"], "iu") },
  { code: "PERCENT", re: /[%‰]/gu },
  { code: "PERCENT", re: word(["por ciento", "percent"], "iu") },
  { code: "MONTH", re: word(MONTHS_ANY_CASE, "iu") },
  { code: "MONTH", re: word(MONTHS_CAPITALISED, "u") },
];

export function validateTemplate(template: string, opts: ValidateOptions = {}): TemplateValidation {
  const issues: TemplateIssue[] = [];
  const slots: WordingSlot[] = [];
  const allowed = opts.allowed ?? WORDING_SLOTS;
  const maxLength = opts.maxLength ?? 600;

  if (typeof template !== "string" || template.trim() === "") {
    return { ok: false, issues: [{ code: "EMPTY", text: "" }], slots };
  }
  if (template.length > maxLength) issues.push({ code: "TOO_LONG", text: String(template.length) });

  for (const m of template.matchAll(SLOT_RE)) {
    const name = m[1]!;
    if (!isWordingSlot(name)) issues.push({ code: "UNKNOWN_SLOT", text: name });
    else {
      if (!allowed.includes(name)) issues.push({ code: "SLOT_NOT_AVAILABLE", text: name });
      if (!slots.includes(name)) slots.push(name);
    }
  }
  for (const r of opts.required ?? []) {
    if (!slots.includes(r)) issues.push({ code: "MISSING_SLOT", text: r });
  }

  // Everything outside well-formed slots must be plain words.
  const outside = template.replace(SLOT_RE, " ");
  for (const m of outside.matchAll(/[{}]+/g)) issues.push({ code: "MALFORMED_SLOT", text: m[0] });
  for (const { code, re } of CHECKS) {
    for (const m of outside.matchAll(re)) issues.push({ code, text: m[0] });
  }
  return { ok: issues.length === 0, issues, slots };
}

export function validateLocalizedTemplate(
  t: LocalizedText,
  opts: ValidateOptions = {},
): { ok: boolean; es: TemplateValidation; en: TemplateValidation } {
  const es = validateTemplate(t.es, opts);
  const en = validateTemplate(t.en, opts);
  return { ok: es.ok && en.ok, es, en };
}
