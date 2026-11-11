/**
 * OWNED BY WP-11. Grounded patient chat. Live path: claude-haiku-5-5 over the plan's approved notes as cited
 * document blocks, with the `simulate_delay` engine tool. Mock path (no key): a deterministic router.
 * Either way every date comes from the engine, a numeric grounding check runs on model text, and anything
 * out of scope gets the fixed referral. Never throws for model or network trouble: it degrades to cached.
 */
import type { ChatRequest, ChatResponse, IsoDate, Plan } from "@/contracts";
import { defaultClaudeClient, type ClaudeClient } from "../extract/claude";
import { delayResponse, referralResponse } from "./compose";
import { simulateDelay, t } from "./delay";
import { answerLive } from "./live";
import { routeQuestion } from "./router";

export { groundingCheck, type GroundingResult, type GroundingSources } from "./ground";
export { simulateDelay, SimulateDelayInputSchema, addMonths, type DelayResult, type SimulateDelayInput } from "./delay";
export { routeQuestion, parseAmount } from "./router";
export { answerLive, chatSystemPrompt, CHAT_TIMEOUT_MS } from "./live";
export { takeChatToken, resetChatRateLimit, CHAT_RATE_LIMIT } from "./rateLimit";

export class ChatPlanNotFoundError extends Error {
  constructor(planId: string) {
    super(`Plan not found: ${planId}`);
    this.name = "ChatPlanNotFoundError";
  }
}

export interface ChatDeps {
  /** Tests inject the plan and simulated day; production reads them from the store. */
  plan?: Plan;
  today?: IsoDate;
  /** undefined → live client from env (null without a key, so the deterministic router answers);
   *  null → deterministic router only; object → that client (tests). */
  client?: ClaudeClient | null;
  /** Publish CHAT_PREVIEW for a what-if (default true). */
  publishPreview?: boolean;
}

async function loadContext(req: ChatRequest, deps: ChatDeps): Promise<{ plan: Plan; today: IsoDate }> {
  if (deps.plan && deps.today) return { plan: deps.plan, today: deps.today };
  const { store } = await import("@/server/store");
  const id = await store.resolvePlanId(req.planId);
  const plan = id ? await store.getPlan(id) : null;
  if (!plan) throw new ChatPlanNotFoundError(req.planId);
  return { plan, today: deps.today ?? (await store.getClock()).today };
}

async function publishPreview(response: ChatResponse, planId: string): Promise<void> {
  if (!response.whatIf) return;
  const { publish } = await import("@/server/events");
  publish({ type: "CHAT_PREVIEW", planId, shifts: response.whatIf.shifts });
}

/** Mock mode: what-if questions go to simulate_delay, everything else to the fixed referral. */
export function answerMock(req: ChatRequest, plan: Plan, today: IsoDate): ChatResponse {
  const question = [...req.messages].reverse().find((m) => m.role === "user")?.text ?? "";
  const route = routeQuestion(question, plan);
  if (route.kind === "referral") return referralResponse(req.locale, "cached");
  if (route.kind === "needs_amount") {
    return { text: t(req.locale, "delayAskAmount"), citations: [], refused: false, groundingFallback: false, source: "cached" };
  }
  return delayResponse(plan, simulateDelay(plan, today, route.input, req.locale), req.locale, "cached");
}

export async function answerPatientQuestion(req: ChatRequest, deps: ChatDeps = {}): Promise<ChatResponse> {
  const { plan, today } = await loadContext(req, deps);
  const client = deps.client === undefined ? defaultClaudeClient() : deps.client;
  // Live when a key is set; any API trouble degrades to the deterministic router (labelled cached).
  const response = (client && (await answerLive(client, req, plan, today))) || answerMock(req, plan, today);
  if (deps.publishPreview !== false) await publishPreview(response, plan.id);
  return response;
}

