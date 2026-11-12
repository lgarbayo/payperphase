/**
 * POST /api/chat: validates with ChatRequestSchema, rate-limits per plan (10/min, in memory),
 * then answers through answerPatientQuestion (grounded, cited, referral when out of scope).
 */
import { ChatRequestSchema } from "@/contracts";
import { answerPatientQuestion, ChatPlanNotFoundError, takeChatToken } from "@/ai/chat";
import { apiError, json, parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseJson(req, ChatRequestSchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.messages[parsed.data.messages.length - 1]?.role !== "user") {
    return apiError("VALIDATION", "The last message must come from the user", 422);
  }

  const decision = takeChatToken(parsed.data.planId);
  if (!decision.allowed) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "Too many chat requests for this plan; try again in a minute" } },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } },
    );
  }

  try {
    return json(await answerPatientQuestion(parsed.data));
  } catch (err) {
    if (err instanceof ChatPlanNotFoundError) return apiError("NOT_FOUND", err.message, 404);
    console.error("[chat] unexpected failure:", err);
    return apiError("CHAT_FAILED", "The assistant could not answer right now", 500);
  }
}
