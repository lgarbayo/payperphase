/**
 * OWNED BY WP-09. POST /api/plans/:id/approve — the dentist's "Approve & send to patient" click
 * (also the human approval for the initial per-phase invoice issue, see WP-10). SCAFFOLD STUB:
 * approves, captures the baseline and publishes PLAN_APPROVED; WP-09 adds hero promotion and tests.
 */
import { ApprovePlanRequestSchema, type PlanResponse } from "@/contracts";
import { applyPaymentStatuses, captureBaseline } from "@/engine";
import { apiError, json, nowIso, parseJson } from "@/lib/http";
import { publish } from "@/server/events";
import { store } from "@/server/store";
import { NOTE_LIBRARY } from "@data/seed/notes";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJson(req, ApprovePlanRequestSchema);
  if (!parsed.ok) return parsed.response;
  const plan = await store.getPlan(id);
  if (!plan) return apiError("NOT_FOUND", "Plan not found", 404);
  const { approvedBy, noteIds, summaries } = parsed.data;
  const now = nowIso();
  const { today } = await store.getClock();
  const approved = captureBaseline(
    {
      ...plan,
      status: "approved",
      approvedBy,
      approvedAt: now,
      approvedNotes: noteIds.map((noteId) => ({
        noteId,
        noteVersion: NOTE_LIBRARY[noteId].version,
        approvedBy,
        approvedAt: now,
      })),
      phases: plan.phases.map((p) => {
        const s = summaries.find((x) => x.phaseId === p.id);
        return s ? { ...p, summary: s.text } : p;
      }),
      updatedAt: now,
    },
    now,
  );
  const next = applyPaymentStatuses(approved, today).plan;
  await store.savePlan(next);
  publish({ type: "PLAN_APPROVED", planId: next.id, version: next.version });
  const body: PlanResponse = { plan: next };
  return json(body);
}
