/**
 * Typed calls from the clinic console to the plan/extraction API.
 * The console never computes money or dates: every amount and date comes back from these calls.
 */
import {
  apiFetch,
  type ApprovePlanRequest,
  type CaseKind,
  type EditPlanResponse,
  type ExtractResponse,
  type ListPlansResponse,
  type PlanEdit,
  type PlanResponse,
  type PlanViewResponse,
  type WordingResponse,
} from "@/contracts";

export const clinicApi = {
  extractSample(sampleId: string) {
    return apiFetch<ExtractResponse>("/api/extract", { method: "POST", json: { sampleId } });
  },
  extractFile(file: File) {
    const body = new FormData();
    body.append("file", file, file.name);
    return apiFetch<ExtractResponse>("/api/extract", { method: "POST", body });
  },
  createPlan(quoteId: string, caseKind: CaseKind) {
    return apiFetch<PlanResponse>("/api/plans", { method: "POST", json: { quoteId, caseKind } });
  },
  listPlans() {
    return apiFetch<ListPlansResponse>("/api/plans");
  },
  getClinicView(planId: string) {
    return apiFetch<PlanViewResponse>(`/api/plans/${encodeURIComponent(planId)}?view=clinic`);
  },
  wording(planId: string) {
    return apiFetch<WordingResponse>("/api/wording", { method: "POST", json: { planId } });
  },
  approve(planId: string, body: ApprovePlanRequest) {
    return apiFetch<PlanResponse>(`/api/plans/${encodeURIComponent(planId)}/approve`, { method: "POST", json: body });
  },
  edit(planId: string, edit: PlanEdit, editedBy: string) {
    return apiFetch<EditPlanResponse>(`/api/plans/${encodeURIComponent(planId)}/edit`, {
      method: "POST",
      json: { edit, editedBy },
    });
  },
  deliver(planId: string, phaseId: string) {
    return apiFetch<PlanResponse>(
      `/api/plans/${encodeURIComponent(planId)}/phases/${encodeURIComponent(phaseId)}/deliver`,
      { method: "POST" },
    );
  },
};

/** Best-effort case kind for an uploaded quote (samples carry their own). */
export function inferCaseKind(codes: readonly string[]): CaseKind {
  if (codes.some((c) => c === "ALIGNER_BATCH" || c === "ORTHO_RECORDS" || c === "RETAINER")) return "aligner";
  if (codes.includes("IMPLANT")) return "implant";
  if (codes.some((c) => c === "SCALING_ROOT_PLANING" || c === "PERIO_SURGERY" || c === "PERIO_MAINTENANCE"))
    return "perio";
  return "implant";
}
