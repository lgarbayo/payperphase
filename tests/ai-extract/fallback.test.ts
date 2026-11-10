import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionResultSchema } from "@/contracts";
import { GOLDEN_EXTRACTION, GOLDEN_RAW_EXTRACTION } from "@/contracts/fixtures/implantCase";
import { ExtractError, extractQuote } from "@/ai/extract";
import type { ClaudeClient } from "@/ai/extract/claude";
import { resetEnvCache } from "@/env";

// A tiny stand-in for the hero PDF. WP-02 owns the real sha table; here we mock its lookup.
const { KNOWN_PDF, KNOWN_SHA } = vi.hoisted(() => {
  const bytes = new TextEncoder().encode("%PDF-1.7\n% hero presupuesto stand-in\n%%EOF\n");
  const { createHash: h } = require("node:crypto") as typeof import("node:crypto");
  return { KNOWN_PDF: bytes, KNOWN_SHA: h("sha256").update(bytes).digest("hex") };
});

vi.mock("@data/seed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@data/seed")>();
  return {
    ...actual,
    cachedExtractionBySha: (sha: string) => (sha === KNOWN_SHA ? actual.cachedExtractionBySampleId("implant-ribera") : null),
  };
});

const UNKNOWN_PDF = new TextEncoder().encode("%PDF-1.4\n% some other clinic\n%%EOF\n");
const NOW = () => "2026-11-16T10:00:00.000Z";

type ParseImpl = (params: Record<string, unknown>, options?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<unknown>;
function fakeClient(impl: ParseImpl) {
  const parse = vi.fn(impl);
  return { client: { messages: { parse } } as unknown as ClaudeClient, parse };
}
const okMessage = (parsed: unknown, model = "claude-sonnet-5-5") => ({
  id: "msg_test",
  model,
  stop_reason: "end_turn",
  stop_details: null,
  content: [{ type: "text", text: JSON.stringify(parsed) }],
  parsed_output: parsed,
});
const refusal = () => ({
  id: "msg_refused",
  model: "claude-sonnet-5-5",
  stop_reason: "refusal",
  stop_details: { type: "refusal", category: "general_harms", explanation: null },
  content: [],
  parsed_output: null,
});
/** Never answers; rejects only when the caller aborts (like the SDK does). */
const hang: ParseImpl = (_p, options) =>
  new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractQuote fallback", () => {
  it("sanity: the stand-in sha is what the mock keys on", () => {
    expect(createHash("sha256").update(KNOWN_PDF).digest("hex")).toBe(KNOWN_SHA);
  });

  it("no key + known PDF → golden extraction labelled cached", async () => {
    const res = await extractQuote({ pdf: KNOWN_PDF }, { client: null, now: NOW });
    expect(res.source).toBe("cached");
    expect(res.model).toBeNull();
    expect(res.pdfSha256).toBe(KNOWN_SHA);
    expect(res.extractedAt).toBe(NOW());
    expect(res.lines).toEqual(GOLDEN_EXTRACTION.lines);
    expect(res.checks).toEqual(GOLDEN_EXTRACTION.checks);
    expect(ExtractionResultSchema.safeParse(res).success).toBe(true);
  });

  it("no key + sampleId → golden extraction labelled cached", async () => {
    const res = await extractQuote({ sampleId: "implant-ribera" }, { client: null, now: NOW });
    expect(res.source).toBe("cached");
    expect(res.quoteId).toBe(GOLDEN_EXTRACTION.quoteId);
    expect(res.lines).toEqual(GOLDEN_EXTRACTION.lines);
  });

  it("mock mode from env (FORCE_MOCKS=1 in tests) behaves like no key", async () => {
    resetEnvCache();
    const res = await extractQuote({ sampleId: "implant-ribera" }, { now: NOW });
    expect(res.source).toBe("cached");
  });

  it("unknown sampleId → 404 UNKNOWN_SAMPLE", async () => {
    await expect(extractQuote({ sampleId: "nope" }, { client: null })).rejects.toMatchObject({
      code: "UNKNOWN_SAMPLE",
      status: 404,
    });
  });

  it("no key + unknown PDF → 422 NO_LIVE_EXTRACTION with a try-a-sample message", async () => {
    const err = await extractQuote({ pdf: UNKNOWN_PDF }, { client: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect(err).toMatchObject({ code: "NO_LIVE_EXTRACTION", status: 422 });
    expect((err as Error).message).toMatch(/try one of the sample/i);
  });

  it("rejects non-PDF bytes and oversize files before any call", async () => {
    const { client, parse } = fakeClient(async () => okMessage(GOLDEN_RAW_EXTRACTION));
    await expect(extractQuote({ pdf: new TextEncoder().encode("hello") }, { client })).rejects.toMatchObject({
      code: "NOT_A_PDF",
      status: 415,
    });
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-1.4"));
    await expect(extractQuote({ pdf: big }, { client })).rejects.toMatchObject({ code: "FILE_TOO_LARGE", status: 413 });
    await expect(extractQuote({ pdf: new Uint8Array() }, { client })).rejects.toMatchObject({ code: "EMPTY_FILE" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("refusal + known PDF → cached; stop_reason is checked before content", async () => {
    const { client, parse } = fakeClient(async () => refusal());
    const res = await extractQuote({ pdf: KNOWN_PDF }, { client, now: NOW });
    expect(parse).toHaveBeenCalledOnce();
    expect(res.source).toBe("cached");
    expect(res.lines).toEqual(GOLDEN_EXTRACTION.lines);
  });

  it("refusal + unknown PDF → 422 EXTRACTION_REFUSED", async () => {
    const { client } = fakeClient(async () => refusal());
    await expect(extractQuote({ pdf: UNKNOWN_PDF }, { client })).rejects.toMatchObject({
      code: "EXTRACTION_REFUSED",
      status: 422,
    });
  });

  it("timeout + known PDF → cached, and the in-flight request is aborted", async () => {
    let seenSignal: AbortSignal | undefined;
    const { client } = fakeClient((p, o) => {
      seenSignal = o?.signal;
      return hang(p, o);
    });
    const res = await extractQuote({ pdf: KNOWN_PDF }, { client, timeoutMs: 25, now: NOW });
    expect(res.source).toBe("cached");
    expect(seenSignal?.aborted).toBe(true);
  });

  it("timeout + unknown PDF → 504 EXTRACTION_TIMEOUT", async () => {
    const { client } = fakeClient(hang);
    await expect(extractQuote({ pdf: UNKNOWN_PDF }, { client, timeoutMs: 25 })).rejects.toMatchObject({
      code: "EXTRACTION_TIMEOUT",
      status: 504,
    });
  });

  it("the default timeout is 45 s", async () => {
    vi.useFakeTimers();
    try {
      const { client } = fakeClient(hang);
      const pending = extractQuote({ pdf: KNOWN_PDF }, { client, now: NOW });
      await vi.advanceTimersByTimeAsync(44_999);
      let settled = false;
      void pending.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).source).toBe("cached");
    } finally {
      vi.useRealTimers();
    }
  });

  it("API errors + known PDF → cached", async () => {
    const { client } = fakeClient(async () => {
      throw new Error("socket hang up");
    });
    expect((await extractQuote({ pdf: KNOWN_PDF }, { client, now: NOW })).source).toBe("cached");
  });

  it("live success → normalized extraction labelled live, from the env model", async () => {
    const { client, parse } = fakeClient(async () => okMessage(GOLDEN_RAW_EXTRACTION));
    const res = await extractQuote({ pdf: UNKNOWN_PDF, filename: "presupuesto.pdf" }, { client, now: NOW });
    expect(res.source).toBe("live");
    expect(res.model).toBe("claude-sonnet-5-5");
    expect(res.quoteId).toMatch(/^q_[0-9a-f]{16}$/);
    expect(res.lines).toEqual(GOLDEN_EXTRACTION.lines);
    expect(res.checks).toEqual(GOLDEN_EXTRACTION.checks);

    const [params, options] = parse.mock.calls[0]!;
    const p = params as {
      model: string;
      messages: { role: string; content: { type: string; source?: { type: string; media_type: string; data: string } }[] }[];
      output_config: { format: { type: string; schema: unknown } };
      tool_choice?: unknown;
      temperature?: unknown;
      fallbacks?: unknown;
    };
    expect(p.model).toBe("claude-sonnet-5-5");
    const content = p.messages[0]!.content;
    expect(content.map((b) => b.type)).toEqual(["document", "text"]); // PDF before the instruction
    expect(content[0]!.source).toMatchObject({ type: "base64", media_type: "application/pdf" });
    expect(Buffer.from(content[0]!.source!.data, "base64")).toEqual(Buffer.from(UNKNOWN_PDF));
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.tool_choice).toBeUndefined();
    expect(p.temperature).toBeUndefined();
    expect(p.fallbacks).toBe("default");
    expect(options?.headers?.["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
  });

  it("live success on a known PDF keeps the sample's quoteId", async () => {
    const { client } = fakeClient(async () => okMessage(GOLDEN_RAW_EXTRACTION));
    const res = await extractQuote({ pdf: KNOWN_PDF }, { client, now: NOW });
    expect(res.source).toBe("live");
    expect(res.quoteId).toBe(GOLDEN_EXTRACTION.quoteId);
  });

  it("a live answer that doesn't fit the schema → cached for a known PDF", async () => {
    const { client } = fakeClient(async () => okMessage({ clinicName: "x" }));
    expect((await extractQuote({ pdf: KNOWN_PDF }, { client, now: NOW })).source).toBe("cached");
  });

  it("max_tokens truncation → cached for a known PDF", async () => {
    const { client } = fakeClient(async () => ({ ...okMessage(null), stop_reason: "max_tokens" }));
    expect((await extractQuote({ pdf: KNOWN_PDF }, { client, now: NOW })).source).toBe("cached");
  });

  it("a live answer with no lines on an unknown PDF → 422 NO_LINES_FOUND", async () => {
    const { client } = fakeClient(async () => okMessage({ ...GOLDEN_RAW_EXTRACTION, lines: [] }));
    await expect(extractQuote({ pdf: UNKNOWN_PDF }, { client })).rejects.toMatchObject({ code: "NO_LINES_FOUND" });
  });

  it("sampleId with a live client but no PDF on disk yet → cached without calling Claude", async () => {
    const { client, parse } = fakeClient(async () => okMessage(GOLDEN_RAW_EXTRACTION));
    const res = await extractQuote({ sampleId: "implant-ribera" }, { client, publicDir: "/nonexistent", now: NOW });
    expect(res.source).toBe("cached");
    expect(parse).not.toHaveBeenCalled();
  });
});
