"use client";
/**
 * OWNED BY WP-11. Patient chat panel: POST /api/chat, citation chips "Approved by …",
 * "Message my clinic" fallback. SCAFFOLD STUB.
 */
import type { Locale } from "@/contracts";

export function PlanChat({ planId, locale }: { planId: string; locale: Locale }) {
  void planId;
  return <div data-testid="plan-chat">{locale === "es" ? "Pregunta sobre tu plan" : "Ask about your plan"}</div>;
}
