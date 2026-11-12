/**
 * POST /api/plans/:id/whatif: the server engine is the source of truth.
 * 409 {ok:false, validation} on an illegal move (the Gantt snaps back and shows the note);
 * persist:false returns a preview without saving.
 */
import { WhatIfRequestSchema } from "@/contracts";
import { json, parseJson } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { whatIf } from "@/server/plans";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const parsed = await parseJson(req, WhatIfRequestSchema);
    if (!parsed.ok) return parsed.response;
    const { status, body } = await whatIf(id, parsed.data);
    return json(body, status);
  });
}
