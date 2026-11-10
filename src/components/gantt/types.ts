/** OWNED BY WP-05. Public props of <PlanGantt/> — consumers (WP-06, WP-07, WP-14) rely on these. */
import type { ClinicalNote, Locale, MoveRequest, NoteId, PhaseShift, Plan } from "@/contracts";

export interface PlanGanttProps {
  plan: Plan;
  /** Simulated today (timeRange line). */
  today: string;
  locale: Locale;
  /** patient: drag future unpaid phases; clinic: read-only review; readonly: no interaction. */
  mode: "patient" | "clinic" | "readonly";
  /** Approved notes by id, for the snap-back card and tooltips. */
  notes: Partial<Record<NoteId, ClinicalNote>>;
  /** Chat preview shifts drawn as a ghost (not persisted). */
  ghostShifts?: PhaseShift[];
  /** Called after a drop passed engine.validateMove; parent POSTs /api/plans/:id/whatif. */
  onMoveCommitted?: (move: MoveRequest) => void;
  /** Called when a drop is rejected (snap-back), with the clinician note to show. */
  onMoveRejected?: (info: { phaseId: string; noteId?: NoteId; earliestStartDate?: string }) => void;
  /** taskMenu "Pay this phase". */
  onPayPhase?: (phaseId: string) => void;
  /** taskMenu "What if I delay?". */
  onAskDelay?: (phaseId: string) => void;
  /** Height in px (Bryntum needs a sized parent). Default 420. */
  height?: number;
}
