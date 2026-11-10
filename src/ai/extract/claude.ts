/**
 * OWNED BY WP-03. One structured-output Claude call, shared by extraction and wording.
 *
 * Rules (SPEC "Rules for every Claude call"):
 * - `client.messages.parse` + `zodOutputFormat(schema)`; no forced tool_choice; no sampling params.
 * - The model id always comes from env (callers pass serverEnv().ANTHROPIC_MODEL_*).
 * - `stop_reason === "refusal"` is checked before the parsed content is read.
 * - Server-side fallback only in the form the claude-api skill documents for claude-sonnet-5-5:
 *   beta `server-side-fallback-2026-07-01` + `fallbacks: "default"` (the server picks the fallback model
 *   by refusal category, so no fallback model id is hardcoded here).
 * - Never throws: every failure becomes a typed `{ ok: false, reason }` so callers can fall back.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { modes, serverEnv } from "@/env";

/** What we need from the SDK client. Tests inject a fake with the same `messages.parse`. */
export type ClaudeClient = Pick<Anthropic, "messages">;

/** Models for which the skill documents `fallbacks: "default"` (server-defined fallback chain). */
const DEFAULT_FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-fable-5-2",
]);
export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function supportsDefaultFallback(model: string): boolean {
  return DEFAULT_FALLBACK_MODELS.has(model);
}

/** Live client when ANTHROPIC_API_KEY is set and mocks aren't forced; otherwise null (mock mode). */
export function defaultClaudeClient(): ClaudeClient | null {
  if (modes().anthropic !== "live") return null;
  return new Anthropic({ apiKey: serverEnv().ANTHROPIC_API_KEY, maxRetries: 1 });
}

export type StructuredFailure = "refusal" | "timeout" | "max_tokens" | "unparseable" | "api_error";

export type StructuredResult<T> =
  | { ok: true; data: T; model: string; latencyMs: number }
  | { ok: false; reason: StructuredFailure; detail: string | null; latencyMs: number };

export interface StructuredCall<S extends z.ZodType> {
  model: string;
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: S;
  maxTokens?: number;
  /** Effort for this route; extraction and wording are latency-sensitive, so callers pick low/medium. */
  effort?: "low" | "medium" | "high";
  timeoutMs: number;
}

class TimeoutSignal extends Error {}

export async function callStructured<S extends z.ZodType>(
  client: ClaudeClient,
  call: StructuredCall<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutSignal(`No response within ${call.timeoutMs} ms`));
    }, call.timeoutMs);
  });

  const base = {
    model: call.model,
    max_tokens: call.maxTokens ?? 16_000,
    system: call.system,
    messages: [{ role: "user" as const, content: call.content }],
    output_config: {
      format: zodOutputFormat(call.schema),
      ...(call.effort ? { effort: call.effort } : {}),
    },
  };
  const request = (withFallback: boolean) =>
    Promise.race([
      client.messages.parse(withFallback ? { ...base, fallbacks: "default" as const } : base, {
        signal: controller.signal,
        timeout: Math.max(1, call.timeoutMs - elapsed()),
        ...(withFallback ? { headers: { "anthropic-beta": SERVER_SIDE_FALLBACK_BETA } } : {}),
      }),
      timeout,
    ]);

  try {
    const withFallback = supportsDefaultFallback(call.model);
    let message: Awaited<ReturnType<typeof request>>;
    try {
      message = await request(withFallback);
    } catch (error) {
      // Self-heal if this account/platform rejects the fallback field: same request, once, without it.
      if (!(withFallback && error instanceof Anthropic.BadRequestError && /fallback/i.test(error.message))) throw error;
      console.warn("[claude] server-side fallback rejected (400); retrying once without it");
      message = await request(false);
    }
    // Refusal first: a declined response may carry partial or no content.
    if (message.stop_reason === "refusal") {
      const category = message.stop_details?.category ?? null;
      return { ok: false, reason: "refusal", detail: category, latencyMs: elapsed() };
    }
    if (message.stop_reason === "max_tokens") {
      return { ok: false, reason: "max_tokens", detail: null, latencyMs: elapsed() };
    }
    const checked = call.schema.safeParse(message.parsed_output);
    if (!checked.success) {
      return { ok: false, reason: "unparseable", detail: checked.error.message.slice(0, 300), latencyMs: elapsed() };
    }
    return { ok: true, data: checked.data, model: message.model, latencyMs: elapsed() };
  } catch (error) {
    if (
      error instanceof TimeoutSignal ||
      error instanceof Anthropic.APIConnectionTimeoutError ||
      error instanceof Anthropic.APIUserAbortError ||
      controller.signal.aborted
    ) {
      return { ok: false, reason: "timeout", detail: null, latencyMs: elapsed() };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, reason: "api_error", detail: `${error.status ?? "network"}: ${error.message}`.slice(0, 300), latencyMs: elapsed() };
    }
    if (error instanceof Anthropic.AnthropicError) {
      // messages.parse throws AnthropicError when the text block isn't valid JSON for the schema.
      return { ok: false, reason: "unparseable", detail: error.message.slice(0, 300), latencyMs: elapsed() };
    }
    return { ok: false, reason: "api_error", detail: String(error).slice(0, 300), latencyMs: elapsed() };
  } finally {
    clearTimeout(timer);
  }
}
