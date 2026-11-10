/** OWNED BY WP-03. POST /api/wording {planId} — ES/EN slot-template drafts for clinic review. SCAFFOLD STUB. */
import { WordingRequestSchema, type WordingResponse } from "@/contracts";
import { draftPhaseWording } from "@/ai/wording";
import { apiError, json, parseJson } from "@/lib/http";
import { store } from "@/server/store";
import { NOTE_LIBRARY } from "@data/seed/notes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJson(req, WordingRequestSchema);
  if (!parsed.ok) return parsed.response;
  const plan = await store.getPlan(parsed.data.planId);
  if (!plan) return apiError("NOT_FOUND", "Plan not found", 404);
  const body: WordingResponse = { drafts: await draftPhaseWording(plan, NOTE_LIBRARY) };
  return json(body);
}
