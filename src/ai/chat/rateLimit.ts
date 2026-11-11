/**
 * OWNED BY WP-11. Naive in-memory rate limit for POST /api/chat: at most 10 requests per minute per plan.
 * State lives on globalThis so it survives Next dev HMR. Good enough for a single-instance demo.
 */
export const CHAT_RATE_LIMIT = { max: 10, windowMs: 60_000 } as const;

const g = globalThis as unknown as { __pppChatHits?: Map<string, number[]> };
const hits = () => (g.__pppChatHits ??= new Map<string, number[]>());

export interface RateDecision {
  allowed: boolean;
  /** Seconds until the oldest hit leaves the window (for Retry-After). */
  retryAfterSec: number;
}

export function takeChatToken(key: string, now: number = Date.now()): RateDecision {
  const map = hits();
  const recent = (map.get(key) ?? []).filter((t) => now - t < CHAT_RATE_LIMIT.windowMs);
  if (recent.length >= CHAT_RATE_LIMIT.max) {
    map.set(key, recent);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + CHAT_RATE_LIMIT.windowMs - now) / 1000)) };
  }
  recent.push(now);
  map.set(key, recent);
  return { allowed: true, retryAfterSec: 0 };
}

/** Test helper. */
export function resetChatRateLimit(): void {
  hits().clear();
}
