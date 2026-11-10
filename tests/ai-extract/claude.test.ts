import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callStructured, supportsDefaultFallback, type ClaudeClient } from "@/ai/extract/claude";
import { looksLikePdf, sha256Hex } from "@/ai/extract";
import { renderSyntheticHeroPdf } from "@/ai/extract/spike/heroPdf";

const Schema = z.object({ answer: z.string() });
type Opts = { headers?: Record<string, string>; signal?: AbortSignal };
const fake = (impl: (params: Record<string, unknown>, opts?: Opts) => Promise<unknown>) => {
  const parse = vi.fn(impl);
  return { client: { messages: { parse } } as unknown as ClaudeClient, parse };
};
const ok = { model: "claude-sonnet-5-5", stop_reason: "end_turn", stop_details: null, content: [], parsed_output: { answer: "hi" } };
const call = (model = "claude-sonnet-5-5") => ({
  model,
  system: "s",
  content: [{ type: "text" as const, text: "q" }],
  schema: Schema,
  timeoutMs: 1_000,
});
const badRequest = (msg: string) =>
  new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: msg } }, undefined, new Headers());

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("callStructured", () => {
  it("documented fallback form only on models the skill lists for it", async () => {
    expect(supportsDefaultFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsDefaultFallback("claude-haiku-5-5")).toBe(false);
    const { client, parse } = fake(async () => ok);
    await callStructured(client, call("claude-haiku-5-5"));
    const [params, opts] = parse.mock.calls[0]!;
    expect(params).not.toHaveProperty("fallbacks");
    expect(opts?.headers).toBeUndefined();
  });

  it("returns typed data and the serving model", async () => {
    const { client } = fake(async () => ({ ...ok, model: "claude-sonnet-5" }));
    const res = await callStructured(client, call());
    expect(res).toMatchObject({ ok: true, data: { answer: "hi" }, model: "claude-sonnet-5" });
  });

  it("a 400 about the fallback field is retried once without it", async () => {
    const { client, parse } = fake(async (params) => {
      if ("fallbacks" in params) throw badRequest("fallbacks: Extra inputs are not permitted");
      return ok;
    });
    const res = await callStructured(client, call());
    expect(res.ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1]![0]).not.toHaveProperty("fallbacks");
    expect(parse.mock.calls[1]![1]?.headers).toBeUndefined();
  });

  it("a 400 about the beta header (no 'fallback' in the wording) is also retried once without fallback", async () => {
    const { client, parse } = fake(async (_params, opts) => {
      if (opts?.headers?.["anthropic-beta"]) throw badRequest("anthropic-beta: your organization does not have access to this beta");
      return ok;
    });
    const res = await callStructured(client, call());
    expect(res.ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[0]![0]).toHaveProperty("fallbacks", "default");
    expect(parse.mock.calls[0]![1]?.headers).toEqual({ "anthropic-beta": "server-side-fallback-2026-07-01" });
    expect(parse.mock.calls[1]![0]).not.toHaveProperty("fallbacks");
    expect(parse.mock.calls[1]![1]?.headers).toBeUndefined();
  });

  it("a 400 unrelated to fallback is retried exactly once, then surfaces as api_error", async () => {
    const { client, parse } = fake(async () => {
      throw badRequest("messages.0.content: document too large");
    });
    const res = await callStructured(client, call());
    expect(res).toMatchObject({ ok: false, reason: "api_error" });
    expect(res.ok === false && res.detail).toMatch(/^400: .*document too large/);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("without fallback in the request, a 400 is not retried", async () => {
    const { client, parse } = fake(async () => {
      throw badRequest("messages.0.content: document too large");
    });
    expect(await callStructured(client, call("claude-haiku-5-5"))).toMatchObject({ ok: false, reason: "api_error" });
    expect(parse).toHaveBeenCalledOnce();
  });

  it("non-400 API errors are not retried by the self-heal", async () => {
    const { client, parse } = fake(async () => {
      throw new Anthropic.InternalServerError(500, { type: "error", error: { type: "api_error", message: "boom" } }, undefined, new Headers());
    });
    expect(await callStructured(client, call())).toMatchObject({ ok: false, reason: "api_error" });
    expect(parse).toHaveBeenCalledOnce();
  });

  it("a structured-output parse failure surfaces as unparseable", async () => {
    const { client } = fake(async () => {
      throw new Anthropic.AnthropicError("Failed to parse structured output: SyntaxError");
    });
    expect(await callStructured(client, call())).toMatchObject({ ok: false, reason: "unparseable" });
  });

  it("refusal is reported with its category, before parsed content is read", async () => {
    const { client } = fake(async () => ({
      ...ok,
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: null },
      parsed_output: { answer: "should not be read" },
    }));
    expect(await callStructured(client, call())).toMatchObject({ ok: false, reason: "refusal", detail: "cyber" });
  });
});

describe("spike stand-in PDF", () => {
  it("is a real, reproducible PDF", async () => {
    const a = await renderSyntheticHeroPdf();
    const b = await renderSyntheticHeroPdf();
    expect(looksLikePdf(a)).toBe(true);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });
});
