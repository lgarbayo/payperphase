/**
 * Drag controller: the bridge between Bryntum's TaskDrag feature and the clinical scheduling engine.
 * Pure TypeScript (no @bryntum import) so the whole drag contract is unit-tested in node.
 *
 * - `validate` backs `TaskDrag.validatorFn` and the TaskDrag tooltip, so it runs on every drag frame.
 *   It calls `engine.validateMove` synchronously and memoises the verdict per (phase, day) for the
 *   current plan: a long drag never clones the plan or re-validates the same day twice.
 * - `drop` runs once from `afterTaskDrop` when Bryntum accepted the drop: it re-checks, previews
 *   `engine.reschedule` (successors move instantly) and hands the move to the parent (`onMoveCommitted`).
 * - `snapBack` runs once from `afterTaskDrop` when Bryntum rejected the drop: it reports the
 *   clinician note to the parent (`onMoveRejected`) so it can show the snap-back card.
 */
import type { ClinicalNote, Locale, MoveRequest, MoveValidation, NoteId, Phase, Plan, WhatIfResult } from "@/contracts";
import { reschedule, snapToClinicDay, validateMove } from "@/engine";
import type { IsoDate } from "@/lib/dates";
import { phaseLock, shortDate, tg } from "./toBryntum";

export type RejectionInfo = { phaseId: string; noteId?: NoteId; earliestStartDate?: string };

export type DragVerdict =
  | { valid: true }
  | {
      valid: false;
      /** Text Bryntum shows in the drag tooltip: the approved clinician note when there is one. */
      message: string;
      reason: Extract<MoveValidation, { ok: false }>["reason"];
      noteId?: NoteId;
      earliestStartDate?: IsoDate;
    };

export type DropOutcome =
  | { kind: "committed"; move: MoveRequest; preview: WhatIfResult }
  | { kind: "rejected"; verdict: Extract<DragVerdict, { valid: false }> }
  | { kind: "noop" };

export interface DragControllerOptions {
  /** The plan currently drawn (after a committed drop this is the preview until the parent re-renders). */
  getPlan: () => Plan;
  getToday: () => IsoDate;
  getLocale: () => Locale;
  getNotes: () => Partial<Record<NoteId, ClinicalNote>>;
  onMoveRejected?: (info: RejectionInfo) => void;
  onMoveCommitted?: (move: MoveRequest) => void;
  /** Called with the engine preview before `onMoveCommitted`, so the chart can move successors instantly. */
  onPreview?: (result: WhatIfResult) => void;
}

export interface DragController {
  /** Patient drag rule (future, unpaid, undelivered). Mode is checked by the caller. */
  canDrag: (phaseId: string) => boolean;
  validate: (phaseId: string, newStartDate: IsoDate) => DragVerdict;
  drop: (phaseId: string, newStartDate: IsoDate) => DropOutcome;
  snapBack: (phaseId: string, attemptedStartDate: IsoDate) => DropOutcome;
}

/** Bryntum-facing message for a rejected move: the approved note text (+ earliest legal date). */
export function rejectionMessage(
  v: Extract<MoveValidation, { ok: false }>,
  notes: Partial<Record<NoteId, ClinicalNote>>,
  locale: Locale,
): string {
  const note = v.noteId ? notes[v.noteId] : undefined;
  let text: string;
  switch (v.reason) {
    case "MIN_LAG":
      text = note?.text[locale] ?? tg(locale, "rejectMinLag");
      break;
    case "IN_THE_PAST":
      text = tg(locale, "rejectPast");
      break;
    case "PHASE_PAID":
      text = tg(locale, "rejectPaid");
      break;
    case "PHASE_DELIVERED":
      text = tg(locale, "rejectDelivered");
      break;
    default:
      text = note?.text[locale] ?? tg(locale, "rejectUnknown");
  }
  if (v.earliestStartDate) text += ` ${tg(locale, "rejectEarliest", { date: shortDate(v.earliestStartDate, locale) })}`;
  return text;
}

export function createDragController(opts: DragControllerOptions): DragController {
  // Phase index + verdict cache, invalidated only when the plan / today / locale / notes identity changes.
  let keyPlan: Plan | null = null;
  let keyToday = "";
  let keyLocale: Locale | null = null;
  let keyNotes: Partial<Record<NoteId, ClinicalNote>> | null = null;
  let phases = new Map<string, Phase>();
  const verdicts = new Map<string, DragVerdict>();

  function sync() {
    const plan = opts.getPlan();
    const today = opts.getToday();
    const locale = opts.getLocale();
    const notes = opts.getNotes();
    if (plan !== keyPlan || today !== keyToday || locale !== keyLocale || notes !== keyNotes) {
      keyPlan = plan;
      keyToday = today;
      keyLocale = locale;
      keyNotes = notes;
      phases = new Map(plan.phases.map((p) => [p.id, p]));
      verdicts.clear();
    }
    return { plan, today, locale, notes };
  }

  function canDrag(phaseId: string): boolean {
    const { today } = sync();
    const phase = phases.get(phaseId);
    return Boolean(phase && phaseLock(phase, today) === null);
  }

  function validate(phaseId: string, newStartDate: IsoDate): DragVerdict {
    const { plan, today, locale, notes } = sync();
    const key = `${phaseId}@${newStartDate}`;
    const cached = verdicts.get(key);
    if (cached) return cached;
    const v = validateMove(plan, { phaseId, newStartDate }, today);
    const verdict: DragVerdict = v.ok
      ? { valid: true }
      : {
          valid: false,
          message: rejectionMessage(v, notes, locale),
          reason: v.reason,
          noteId: v.noteId,
          earliestStartDate: v.earliestStartDate,
        };
    verdicts.set(key, verdict);
    return verdict;
  }

  function reject(phaseId: string, verdict: Extract<DragVerdict, { valid: false }>): DropOutcome {
    opts.onMoveRejected?.({
      phaseId,
      ...(verdict.noteId ? { noteId: verdict.noteId } : {}),
      ...(verdict.earliestStartDate ? { earliestStartDate: verdict.earliestStartDate } : {}),
    });
    return { kind: "rejected", verdict };
  }

  function drop(phaseId: string, newStartDate: IsoDate): DropOutcome {
    const verdict = validate(phaseId, newStartDate);
    if (!verdict.valid) return reject(phaseId, verdict);
    const { plan, today } = sync();
    const phase = phases.get(phaseId);
    // The engine lands weekend drops on the next clinic day; dropping onto the same day is a no-op.
    const landing = snapToClinicDay(newStartDate);
    if (!phase || phase.startDate === landing) return { kind: "noop" };
    const move: MoveRequest = { phaseId, newStartDate: landing };
    let preview: WhatIfResult;
    try {
      preview = reschedule(plan, move, today);
    } catch {
      // Engine throws INVALID_MOVE for anything validateMove rejects: treat as a snap-back, never crash the drag.
      return reject(phaseId, {
        valid: false,
        message: tg(opts.getLocale(), "rejectUnknown"),
        reason: "MIN_LAG",
      });
    }
    opts.onPreview?.(preview);
    opts.onMoveCommitted?.(move);
    return { kind: "committed", move, preview };
  }

  function snapBack(phaseId: string, attemptedStartDate: IsoDate): DropOutcome {
    const verdict = validate(phaseId, attemptedStartDate);
    // Bryntum can reject a drop for its own reasons (e.g. dropped outside the timeline): no card then.
    return verdict.valid ? { kind: "noop" } : reject(phaseId, verdict);
  }

  return { canDrag, validate, drop, snapBack };
}
