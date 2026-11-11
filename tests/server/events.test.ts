/**
 * WP-09 · Event bus + GET /api/events (SSE): planId filtering (events without a planId always pass,
 * the "demo" alias follows the hero), 15 s heartbeat, cleanup on abort/cancel, Last-Event-ID replay.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainEventSchema, HERO_PLAN_ALIAS, type DomainEvent } from "@/contracts";
import { GOLDEN_PLAN_ID } from "@/contracts/fixtures/implantCase";
import { clearEventHistory, eventsSince, listenerCount, publish, subscribe } from "@/server/events";
import { SSE_HEARTBEAT_MS } from "@/server/sse";
import { store } from "@/server/store";
import { GET } from "../../app/api/events/route";
import { BASE, useTmpDataDir } from "./helpers";

useTmpDataDir();

const OTHER = "pln_other001";

/** Incremental SSE reader over a Response body. */
function sseReader(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  return {
    /** Next complete frame (text up to the blank line). */
    async next(): Promise<string> {
      for (;;) {
        const i = buf.indexOf("\n\n");
        if (i !== -1) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          return frame;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended");
        buf += decoder.decode(value, { stream: true });
      }
    },
    /** Next frame that carries data, parsed as a DomainEvent. */
    async nextEvent(): Promise<DomainEvent> {
      for (;;) {
        const frame = await this.next();
        const data = frame.split("\n").find((l) => l.startsWith("data: "));
        if (data) return DomainEventSchema.parse(JSON.parse(data.slice(6)));
      }
    },
    read: () => reader.read(),
    cancel: () => reader.cancel(),
  };
}

function open(query: string, init?: RequestInit) {
  return GET(new Request(`${BASE}/events${query}`, init));
}

afterEach(() => {
  vi.useRealTimers();
  clearEventHistory();
});

describe("event bus", () => {
  it("stamps id/at/simToday and isolates failing subscribers from the publisher", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const offA = subscribe(() => {
      throw new Error("sync boom");
    });
    const offB = subscribe(async () => {
      throw new Error("async boom");
    });
    const got: DomainEvent[] = [];
    const offC = subscribe((e) => {
      got.push(e);
    });
    const e = publish({ type: "DEMO_RESET" });
    await new Promise((r) => setTimeout(r, 0));
    offA();
    offB();
    offC();
    expect(DomainEventSchema.parse(e)).toEqual(e);
    expect(got).toEqual([e]);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("keeps a bounded history for replay", () => {
    const a = publish({ type: "DEMO_RESET" });
    const b = publish({ type: "PLAN_CREATED", planId: GOLDEN_PLAN_ID });
    expect(eventsSince(a.id)).toEqual([b]);
    expect(eventsSince("unknown")).toBeNull();
  });
});

describe("GET /api/events (SSE)", () => {
  it("streams data: <DomainEvent> frames filtered by planId; events without a planId always pass", async () => {
    await store.init();
    const res = await open(`?planId=${GOLDEN_PLAN_ID}`);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("cache-control")).toContain("no-cache");
    const sse = sseReader(res);
    expect(await sse.next()).toContain(": connected");

    const mine = publish({ type: "PLAN_APPROVED", planId: GOLDEN_PLAN_ID, version: 1 });
    publish({ type: "PLAN_APPROVED", planId: OTHER, version: 1 });
    const clock = publish({ type: "CLOCK_ADVANCED", from: "2026-11-16", to: "2027-01-04" });
    const delivered = publish({ type: "PHASE_DELIVERED", planId: GOLDEN_PLAN_ID, phaseId: "ph1" });

    const frame = await sse.next();
    expect(frame).toBe(`id: ${mine.id}\ndata: ${JSON.stringify(mine)}`);
    expect(await sse.nextEvent()).toEqual(clock);
    expect(await sse.nextEvent()).toEqual(delivered); // OTHER's event was skipped
    await sse.cancel();
  });

  it("without planId every event passes", async () => {
    const sse = sseReader(await open(""));
    await sse.next();
    const a = publish({ type: "PLAN_CREATED", planId: OTHER });
    const b = publish({ type: "DEMO_RESET" });
    expect(await sse.nextEvent()).toEqual(a);
    expect(await sse.nextEvent()).toEqual(b);
    await sse.cancel();
  });

  it(`?planId=${HERO_PLAN_ALIAS} follows the current hero, also after a reset re-ids it`, async () => {
    const sse = sseReader(await open(`?planId=${HERO_PLAN_ALIAS}`));
    await sse.next();
    publish({ type: "PLAN_CREATED", planId: OTHER });
    const hero1 = publish({ type: "PHASE_DELIVERED", planId: GOLDEN_PLAN_ID, phaseId: "ph1" });
    expect(await sse.nextEvent()).toEqual(hero1);

    await store.resetDemo(); // publishes DEMO_RESET then PLAN_APPROVED for the new hero id
    const newHero = (await store.resolvePlanId(HERO_PLAN_ALIAS))!;
    expect((await sse.nextEvent()).type).toBe("DEMO_RESET");
    expect(await sse.nextEvent()).toMatchObject({ type: "PLAN_APPROVED", planId: newHero });
    publish({ type: "PHASE_DELIVERED", planId: GOLDEN_PLAN_ID, phaseId: "ph1" }); // old hero: filtered now
    const after = publish({ type: "PHASE_DELIVERED", planId: newHero, phaseId: "ph1" });
    expect(await sse.nextEvent()).toEqual(after);
    await sse.cancel();
  });

  it("sends a heartbeat comment every 15 s", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const sse = sseReader(await open(`?planId=${GOLDEN_PLAN_ID}`));
    await sse.next();
    vi.advanceTimersByTime(SSE_HEARTBEAT_MS - 1);
    publish({ type: "DEMO_RESET" });
    expect(await sse.next()).toContain("DEMO_RESET"); // no ping before 15 s
    vi.advanceTimersByTime(1);
    expect(await sse.next()).toBe(": ping");
    vi.advanceTimersByTime(SSE_HEARTBEAT_MS);
    expect(await sse.next()).toBe(": ping");
    expect(SSE_HEARTBEAT_MS).toBe(15_000);
    await sse.cancel();
  });

  it("cleans up the subscription and the timer when the client aborts", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const base = listenerCount();
    const ac = new AbortController();
    const sse = sseReader(await open(`?planId=${GOLDEN_PLAN_ID}`, { signal: ac.signal }));
    await sse.next();
    expect(listenerCount()).toBe(base + 1);
    expect(vi.getTimerCount()).toBe(1);

    ac.abort();
    expect(listenerCount()).toBe(base);
    expect(vi.getTimerCount()).toBe(0);
    expect((await sse.read()).done).toBe(true);
    publish({ type: "DEMO_RESET" }); // no throw into the publisher after close
  });

  it("cleans up when the consumer cancels the stream", async () => {
    const base = listenerCount();
    const sse = sseReader(await open(""));
    await sse.next();
    expect(listenerCount()).toBe(base + 1);
    await sse.cancel();
    expect(listenerCount()).toBe(base);
  });

  it("replays missed events after Last-Event-ID (EventSource reconnect)", async () => {
    const seen = publish({ type: "PLAN_APPROVED", planId: GOLDEN_PLAN_ID, version: 1 });
    const missed1 = publish({ type: "PHASE_DELIVERED", planId: GOLDEN_PLAN_ID, phaseId: "ph1" });
    publish({ type: "PLAN_CREATED", planId: OTHER });
    const missed2 = publish({ type: "DEMO_RESET" });
    const sse = sseReader(await open(`?planId=${GOLDEN_PLAN_ID}`, { headers: { "last-event-id": seen.id } }));
    await sse.next();
    expect(await sse.nextEvent()).toEqual(missed1);
    expect(await sse.nextEvent()).toEqual(missed2);
    const live = publish({ type: "PLAN_CREATED", planId: GOLDEN_PLAN_ID });
    expect(await sse.nextEvent()).toEqual(live);
    await sse.cancel();
  });
});
