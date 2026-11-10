/**
 * OWNED BY WP-11. Grounded patient chat (claude-haiku-5-5): approved notes as cited document blocks,
 * simulate_delay tool backed by the engine, numeric grounding check, fixed referral when out of scope.
 * SCAFFOLD STUB: always returns the referral.
 */
import type { ChatRequest, ChatResponse } from "@/contracts";

export async function answerPatientQuestion(req: ChatRequest): Promise<ChatResponse> {
  return {
    text:
      req.locale === "es"
        ? "Esa pregunta debe responderla tu dentista. Puedes enviar un mensaje a tu clínica."
        : "Your dentist should answer that question. You can send a message to your clinic.",
    citations: [],
    refused: true,
    groundingFallback: false,
    source: "cached",
  };
}
