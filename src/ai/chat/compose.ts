/**
 * OWNED BY WP-11. Code-built answers: the cached (mock) what-if answer, the referral and the safe
 * fallback that replaces a model answer when the grounding check fails. Text is templated from
 * `simulate_delay` facts only, so every number and date in it is grounded by construction.
 */
import type { ChatCitation, ChatResponse, Locale, NoteId, Plan } from "@/contracts";
import { NOTE_LIBRARY } from "@data/seed/notes";
import { isApprovedNote, t, type DelayResult } from "./delay";

export function referralText(locale: Locale): string {
  return NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text[locale];
}

export function referralResponse(locale: Locale, source: ChatResponse["source"], groundingFallback = false): ChatResponse {
  return { text: referralText(locale), citations: [], refused: true, groundingFallback, source };
}

/** Citation chips for notes this plan's clinic approved; unapproved notes are never cited. */
export function citationsFor(plan: Plan, noteIds: readonly NoteId[], locale: Locale): ChatCitation[] {
  const seen = new Set<NoteId>();
  const out: ChatCitation[] = [];
  for (const id of noteIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const ref = plan.approvedNotes.find((a) => a.noteId === id);
    if (!ref) continue;
    const phase = plan.phases.find((p) => p.noteIds.includes(id));
    out.push({
      noteId: id,
      approvedBy: ref.approvedBy,
      ...(phase ? { phaseId: phase.id } : {}),
      citedText: NOTE_LIBRARY[id].text[locale],
    });
  }
  return out;
}

/** Notes relevant to a delay: the warnings' notes first, then the moved phase's deadline and healing notes. */
export function delayNoteIds(plan: Plan, result: DelayResult): NoteId[] {
  const ids: NoteId[] = [];
  if (result.ok) for (const w of result.whatIf.warnings) ids.push(w.noteId);
  const dep = result.phase?.dependsOn[0];
  if (dep?.deadlineNoteId) ids.push(dep.deadlineNoteId);
  if (dep?.riskNoteId) ids.push(dep.riskNoteId);
  return [...new Set(ids)].filter((id) => isApprovedNote(plan, id)).slice(0, 3);
}

function spanText(locale: Locale, amount: number, unit: "weeks" | "months"): string {
  if (unit === "weeks") return amount === 1 ? t(locale, "spanWeek") : t(locale, "spanWeeks", { n: amount });
  return amount === 1 ? t(locale, "spanMonth") : t(locale, "spanMonths", { n: amount });
}

/** 2–3 short sentences describing a simulate_delay result. */
export function delayAnswerText(result: DelayResult, locale: Locale): string {
  const { input } = result;
  const phase = result.phase;
  const title = phase?.title[locale] ?? "";
  if (!result.ok) {
    const parts: string[] =
      result.reason === "PHASE_PAID" || result.reason === "PHASE_DELIVERED"
        ? [t(locale, "delayBlockedPaid", { n: input.phaseN, title })]
        : [t(locale, "delayBlockedGeneric")];
    if (result.facts.note) parts.push(result.facts.note);
    if (result.facts.earliestStart) parts.push(t(locale, "delayBlockedEarliest", { date: result.facts.earliestStart }));
    return parts.join(" ");
  }

  const shifts = result.facts.shifts ?? [];
  const moved = shifts.find((s) => s.phaseN === input.phaseN);
  const followers = shifts.filter((s) => s.phaseN !== input.phaseN);
  const parts: string[] = [];
  parts.push(
    moved && moved.deltaDays !== 0
      ? t(locale, "delayMoved", {
          span: spanText(locale, input.amount, input.unit),
          n: input.phaseN,
          title,
          from: moved.from,
          to: moved.to,
        })
      : t(locale, "delayNoMove", { n: input.phaseN, title, to: moved?.to ?? "" }),
  );
  if (followers.length > 0) {
    const list = followers
      .map((f) => `${t(locale, "phaseWord", { n: f.phaseN })} (${f.to})`)
      .join(t(locale, "listSep"));
    parts.push(t(locale, "delayFollowers", { list }));
  }
  const warning = result.facts.warnings?.[0];
  parts.push(
    warning
      ? t(locale, "delayWarn", { n: warning.phaseN, deadline: warning.deadline, days: warning.exceededByDays })
      : t(locale, "delayOk"),
  );
  return parts.join(" ");
}

export function delayResponse(
  plan: Plan,
  result: DelayResult,
  locale: Locale,
  source: ChatResponse["source"],
  groundingFallback = false,
): ChatResponse {
  return {
    text: delayAnswerText(result, locale),
    citations: citationsFor(plan, delayNoteIds(plan, result), locale),
    ...(result.ok ? { whatIf: result.whatIf } : {}),
    refused: false,
    groundingFallback,
    source,
  };
}
