/**
 * The `simulate_delay` engine tool. Every date in a chat answer comes from here:
 * newStart = phase start + amount (code), then engine validateMove / reschedule. The model (or the mock
 * router) never does date arithmetic; it only receives the formatted result.
 */
import { z } from "zod";
import type {
  ClinicalNote,
  IsoDate,
  Locale,
  MoveRejectReason,
  NoteId,
  Phase,
  Plan,
  WhatIfResult,
} from "@/contracts";
import { reschedule, validateMove } from "@/engine";
import { translate, type Vars } from "@/i18n/core";
import { addDays, daysBetween, formatIsoDate, toIsoDate, toUtcMs } from "@/lib/dates";
import { NOTE_LIBRARY } from "@data/seed/notes";

export const SimulateDelayInputSchema = z.object({
  phaseN: z.number().int().min(1).max(20),
  amount: z.number().int().min(1).max(156),
  unit: z.enum(["weeks", "months"]),
});
export type SimulateDelayInput = z.infer<typeof SimulateDelayInputSchema>;

/** Largest delay the tool accepts (3 years); anything beyond is not a plan question. */
export const MAX_DELAY_MONTHS = 36;

/** Calendar-month arithmetic in UTC, clamping to the last day of a shorter month (31 Jan + 1 month = 28 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = new Date(toUtcMs(date));
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(target.getTime());
}

/** phase start + amount; weekend landings are snapped to Monday by the engine, not here. */
export function delayedStartDate(phase: Pick<Phase, "startDate">, input: SimulateDelayInput): IsoDate {
  return input.unit === "weeks" ? addDays(phase.startDate, input.amount * 7) : addMonths(phase.startDate, input.amount);
}

export type DelayRejectReason = MoveRejectReason | "INVALID_INPUT";

/** What the tool hands back to the model (as JSON) or to the mock composer. Dates are pre-formatted. */
export interface DelayFacts {
  ok: boolean;
  request: SimulateDelayInput;
  /** Every phase that moves, in plan order, dates formatted for the patient's locale. */
  shifts?: { phaseN: number; title: string; from: string; to: string; deltaDays: number }[];
  warnings?: { phaseN: number; deadline: string; exceededByDays: number; noteId: NoteId }[];
  /** Rejected moves: why, the approved note text when the engine gave one, the earliest legal date. */
  reason?: DelayRejectReason;
  noteId?: NoteId;
  note?: string;
  earliestStart?: string;
}

export type DelayResult =
  | { ok: true; input: SimulateDelayInput; phase: Phase; whatIf: WhatIfResult; facts: DelayFacts }
  | {
      ok: false;
      input: SimulateDelayInput;
      phase?: Phase;
      reason: DelayRejectReason;
      noteId?: NoteId;
      earliestStartDate?: IsoDate;
      facts: DelayFacts;
    };

export function noteText(id: NoteId | undefined, locale: Locale): string | undefined {
  if (!id) return undefined;
  const note: ClinicalNote | undefined = NOTE_LIBRARY[id];
  return note?.text[locale];
}

/** Only notes the clinic approved for this plan may be shown or cited. */
export function isApprovedNote(plan: Plan, id: NoteId): boolean {
  return plan.approvedNotes.some((a) => a.noteId === id);
}

export function simulateDelay(plan: Plan, today: IsoDate, rawInput: unknown, locale: Locale): DelayResult {
  const parsed = SimulateDelayInputSchema.safeParse(rawInput);
  const fallbackInput: SimulateDelayInput = { phaseN: 0, amount: 0, unit: "weeks" };
  if (!parsed.success) {
    return {
      ok: false,
      input: fallbackInput,
      reason: "INVALID_INPUT",
      facts: { ok: false, request: fallbackInput, reason: "INVALID_INPUT" },
    };
  }
  const input = parsed.data;
  const phase = plan.phases.find((p) => p.n === input.phaseN);
  if (!phase) {
    return { ok: false, input, reason: "UNKNOWN_PHASE", facts: { ok: false, request: input, reason: "UNKNOWN_PHASE" } };
  }
  if (daysBetween(phase.startDate, delayedStartDate(phase, input)) > MAX_DELAY_MONTHS * 31) {
    return { ok: false, input, phase, reason: "INVALID_INPUT", facts: { ok: false, request: input, reason: "INVALID_INPUT" } };
  }

  const move = { phaseId: phase.id, newStartDate: delayedStartDate(phase, input) };
  const validation = validateMove(plan, move, today);
  if (!validation.ok) {
    const note = isApprovedNote(plan, validation.noteId as NoteId) ? noteText(validation.noteId, locale) : undefined;
    const facts: DelayFacts = {
      ok: false,
      request: input,
      reason: validation.reason,
      ...(validation.noteId ? { noteId: validation.noteId } : {}),
      ...(note ? { note } : {}),
      ...(validation.earliestStartDate ? { earliestStart: formatIsoDate(validation.earliestStartDate, locale) } : {}),
    };
    return {
      ok: false,
      input,
      phase,
      reason: validation.reason,
      ...(validation.noteId ? { noteId: validation.noteId } : {}),
      ...(validation.earliestStartDate ? { earliestStartDate: validation.earliestStartDate } : {}),
      facts,
    };
  }

  const whatIf = reschedule(plan, move, today);
  const nOf = (id: string) => whatIf.plan.phases.find((p) => p.id === id)?.n ?? 0;
  const titleOf = (id: string) => whatIf.plan.phases.find((p) => p.id === id)?.title[locale] ?? "";
  const facts: DelayFacts = {
    ok: true,
    request: input,
    shifts: whatIf.shifts.map((s) => ({
      phaseN: nOf(s.phaseId),
      title: titleOf(s.phaseId),
      from: formatIsoDate(s.fromStart, locale),
      to: formatIsoDate(s.toStart, locale),
      deltaDays: s.deltaDays,
    })),
    warnings: whatIf.warnings.map((w) => ({
      phaseN: nOf(w.phaseId),
      deadline: formatIsoDate(w.deadlineDate, locale),
      exceededByDays: w.exceededByDays,
      noteId: w.noteId,
    })),
  };
  return { ok: true, input, phase, whatIf, facts };
}

/** Tool result string for the model; also the ground truth the numeric grounding check reads. */
export function factsToToolResult(result: DelayResult): string {
  return JSON.stringify(result.facts);
}

export const t = (locale: Locale, key: Parameters<typeof translate<"chat">>[2], vars?: Vars) =>
  translate("chat", locale, key, vars);
