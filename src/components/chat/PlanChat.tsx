"use client";
/**
 * OWNED BY WP-11. Patient chat panel: POST /api/chat, citation chips "Approved by …",
 * "Message my clinic" fallback. SCAFFOLD STUB.
 */
import type { Locale, PhaseShift } from "@/contracts";

export interface PlanChatProps {
  planId: string;
  locale: Locale;
  /** "Ver en el calendario" toggle: the parent (WP-06) draws these shifts as Gantt ghostShifts; null clears. */
  onGhostPreview?: (shifts: PhaseShift[] | null) => void;
}

export function PlanChat({ planId, locale }: PlanChatProps) {
  void planId;
  return <div data-testid="plan-chat">{locale === "es" ? "Pregunta sobre tu plan" : "Ask about your plan"}</div>;
}
