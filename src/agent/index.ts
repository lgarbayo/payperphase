/**
 * OWNED BY WP-10. Clinic billing agent: event-driven Claude tool loop over the PayPal Agent Toolkit
 * invoice tools (wrapped by a deterministic amount/currency/number/recipient/allowlist guard), with a
 * deterministic playbook fallback calling the same tools. Every step → store + AGENT_STEP event.
 * SCAFFOLD STUB: no-ops.
 */
import type { AgentTrigger, PendingApproval } from "@/contracts";

let started = false;

/** Subscribe to domain events (idempotent). Called from /instrumentation.ts. */
export function startAgent(): void {
  if (started) return;
  started = true;
}

export async function runAgent(planId: string, trigger: AgentTrigger): Promise<{ runId: string }> {
  void planId;
  void trigger;
  return { runId: "stub" };
}

export async function decideApproval(
  approvalId: string,
  decidedBy: string,
  decision: "approve" | "reject",
): Promise<PendingApproval | null> {
  void approvalId;
  void decidedBy;
  void decision;
  return null;
}
