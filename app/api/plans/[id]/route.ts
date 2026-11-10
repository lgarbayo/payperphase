/** OWNED BY WP-09. GET /api/plans/:id?view=patient|clinic. */
import { apiError, json } from "@/lib/http";
import { buildPlanView } from "@/server/views";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = new URL(req.url).searchParams.get("view") === "clinic" ? "clinic" : "patient";
  const body = await buildPlanView(id, view);
  if (!body) return apiError("NOT_FOUND", "Plan not found", 404);
  return json(body);
}
