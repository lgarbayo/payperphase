/**
 * OWNED BY WP-09. GET /api/plans/:id?view=patient|clinic (id may be the alias "demo").
 * Live views refetching after an SSE event send `x-if-missing: 204`: a plan removed meanwhile (a
 * Director beat that empties the demo) then answers 204 instead of a 404 the browser would log.
 */
import { apiError, json } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { buildPlanView } from "@/server/views";

export const dynamic = "force-dynamic";

const IF_MISSING_HEADER = "x-if-missing";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const view = new URL(req.url).searchParams.get("view") === "clinic" ? "clinic" : "patient";
    const body = await buildPlanView(id, view);
    if (!body) {
      if (req.headers.get(IF_MISSING_HEADER) === "204") return new Response(null, { status: 204 });
      return apiError("NOT_FOUND", "Plan not found", 404);
    }
    return json(body);
  });
}
