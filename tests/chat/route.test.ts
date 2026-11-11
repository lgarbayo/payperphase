/** POST /api/chat: validation, naive per-plan rate limit, 404, and the cached end-to-end answers over the real store. */
import { beforeEach, describe, expect, it } from "vitest";
import { ChatResponseSchema } from "@/contracts";
import { resetChatRateLimit, takeChatToken, CHAT_RATE_LIMIT } from "@/ai/chat";
import { __resetStoreForTests, store } from "@/server/store";
import { POST } from "../../app/api/chat/route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
let planId = "";
const q = (text: string, extra: object = {}) => ({ planId, locale: "es", messages: [{ role: "user", text }], ...extra });

beforeEach(async () => {
  __resetStoreForTests();
  await store.init();
  planId = (await store.resolvePlanId("demo"))!;
  resetChatRateLimit();
});

describe("POST /api/chat", () => {
  it("answers the demo what-if from the seeded hero plan, cached, with a ChatResponse-shaped body", async () => {
    const res = await post(q("Si espero 3 meses para el implante, ¿qué cambia?"));
    expect(res.status).toBe(200);
    const body = ChatResponseSchema.parse(await res.json());
    expect(body.source).toBe("cached");
    expect(body.refused).toBe(false);
    expect(body.whatIf?.shifts.length).toBeGreaterThanOrEqual(3);
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.citations[0]!.approvedBy).toBeTruthy();
  });

  it("refuses medication questions with refused:true", async () => {
    const body = await (await post(q("¿Puedo tomar ibuprofeno?"))).json();
    expect(body).toMatchObject({ refused: true, citations: [], groundingFallback: false });
  });

  it("validates the body with ChatRequestSchema", async () => {
    expect((await post({ planId, locale: "es", messages: [] })).status).toBe(422);
    expect((await post({ planId: "nope", locale: "es", messages: [{ role: "user", text: "hola" }] })).status).toBe(422);
    expect((await post({ planId, locale: "fr", messages: [{ role: "user", text: "hola" }] })).status).toBe(422);
    expect((await post(q("x".repeat(2001)))).status).toBe(422);
    expect((await post({ planId, locale: "es", messages: [{ role: "assistant", text: "hola" }] })).status).toBe(422);
    const bad = await POST(new Request("http://x/api/chat", { method: "POST", body: "not json" }));
    expect(bad.status).toBe(400);
  });

  it("404 for a plan that does not exist", async () => {
    const res = await post({ planId: "pln_zzzzzzzz", locale: "es", messages: [{ role: "user", text: "hola" }] });
    expect(res.status).toBe(404);
  });

  it("rate-limits to 10 requests per minute per plan; other plans are unaffected", async () => {
    for (let i = 0; i < CHAT_RATE_LIMIT.max; i++) expect((await post(q("hola"))).status).toBe(200);
    const blocked = await post(q("hola"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
    expect((await post({ ...q("hola"), planId: "pln_other000" })).status).toBe(404); // not blocked: reaches the lookup
  });
});

describe("takeChatToken", () => {
  it("the window slides: tokens come back after a minute", () => {
    resetChatRateLimit();
    for (let i = 0; i < CHAT_RATE_LIMIT.max; i++) expect(takeChatToken("k", 1_000).allowed).toBe(true);
    expect(takeChatToken("k", 30_000).allowed).toBe(false);
    expect(takeChatToken("k", 61_001).allowed).toBe(true);
  });
});
