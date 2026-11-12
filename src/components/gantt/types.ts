/** Public props of <PlanGantt/> — the patient page, the clinic console and the landing rely on these. */
import type { ClinicalNote, DeadlineWarning, Locale, MoveRequest, NoteId, PhaseShift, Plan } from "@/contracts";

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
  /** Non-empty plans ignore it (the chart sizes itself to every row); it only caps the empty-state placeholder at min(height, 200). Default 420. */
  height?: number;
  /**
   * Optional engine warnings (e.g. `WhatIfResult.warnings` from the last persisted what-if). The chart
   * also derives deadline breaches from `deadlineFor`, so this is only needed to pass the engine's own.
   */
  warnings?: DeadlineWarning[];
  /** Hide the legend strip under the chart (default false). */
  hideLegend?: boolean;
}
