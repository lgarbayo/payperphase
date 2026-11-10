/** OWNED BY WP-09. GET list · POST create draft plan from a stored extraction. SCAFFOLD STUB. */
import { CreatePlanRequestSchema, type ListPlansResponse, type PlanResponse } from "@/contracts";
import { buildPlan } from "@/engine";
import { apiError, json, nowIso, parseJson } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const body: ListPlansResponse = { plans: await store.listPlans() };
  return json(body);
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, CreatePlanRequestSchema);
  if (!parsed.ok) return parsed.response;
  const extraction = await store.getExtraction(parsed.data.quoteId);
  if (!extraction) return apiError("UNKNOWN_QUOTE", "No extraction stored for that quoteId", 404);
  const clock = await store.getClock();
  const plan = buildPlan({
    planId: `pln_${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`,
    extraction,
    caseKind: parsed.data.caseKind,
    startDate: parsed.data.startDate ?? clock.today,
    today: clock.today,
    clinic: { name: extraction.clinicName, city: "Valencia", dentistName: extraction.dentistName },
    patient: { alias: "María G.", email: "paciente.demo@example.com", locale: "es" },
    now: nowIso(),
  });
  await store.savePlan(plan);
  const body: PlanResponse = { plan };
  return json(body, 201);
}
