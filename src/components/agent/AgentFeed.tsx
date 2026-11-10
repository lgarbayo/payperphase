"use client";
/**
 * OWNED BY WP-10. Live clinic-agent activity feed (AGENT_STEP / APPROVAL_REQUESTED over SSE),
 * with the human "Approve" button for send_invoice. SCAFFOLD STUB.
 */
import type { Locale } from "@/contracts";

export function AgentFeed({ planId, locale }: { planId: string; locale: Locale }) {
  void planId;
  return <div data-testid="agent-feed">{locale === "es" ? "Agente de facturación" : "Billing agent"}</div>;
}
