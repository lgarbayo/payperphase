/**
 * Wire-level check of the live extraction request, with no key and no network: the real SDK client
 * (@anthropic-ai/sdk) runs end to end and an injected `fetch` captures exactly what would be sent to
 * the Messages API, then answers like the API would. This pins down the parts of the request the live
 * spike could not yet confirm (fallbacks + beta header on the non-beta `messages.parse`, the schema
 * zodOutputFormat sends, the content order), and that the self-heal works with the SDK's real 400 class.
 */
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROCEDURE_CATEGORY } from "@/contracts";
import { GOLDEN_EXTRACTION, GOLDEN_RAW_EXTRACTION } from "@/contracts/fixtures/implantCase";
import { EXTRACT_TIMEOUT_MS, liveExtract, sha256Hex } from "@/ai/extract";
import { SERVER_SIDE_FALLBACK_BETA } from "@/ai/extract/claude";
import { renderSyntheticHeroPdf } from "@/ai/extract/spike/heroPdf";
import { serverEnv } from "@/env";

type Captured = { url: string; method: string; headers: Headers; body: Record<string, unknown> };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });

const messageReply = (model: string) =>
  json(200, {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: JSON.stringify(GOLDEN_RAW_EXTRACTION) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  });

/** A real SDK client whose transport records each request and answers with `respond`. */
function sdkClient(respond: (req: Captured) => Response) {
  const requests: Captured[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const req: Captured = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
    requests.push(req);
    return respond(req);
  };
  return { client: new Anthropic({ apiKey: "sk-ant-test", maxRetries: 0, fetch }), requests };
}

const UNSUPPORTED_SCHEMA_KEYWORDS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern"];

/** Every node of a JSON schema, depth first. */
function* schemaNodes(node: unknown): Generator<Record<string, unknown>> {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* schemaNodes(n);
    return;
  }
  const obj = node as Record<string, unknown>;
  yield obj;
  for (const v of Object.values(obj)) yield* schemaNodes(v);
}

let pdf: Uint8Array;
const meta = () => ({
  quoteId: GOLDEN_EXTRACTION.quoteId,
  pdfSha256: sha256Hex(pdf),
  extractedAt: "2026-11-16T09:00:00.000Z",
  filename: "presupuesto.pdf",
});

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  pdf ??= await renderSyntheticHeroPdf();
});
afterEach(() => vi.restoreAllMocks());

describe("live extraction request on the wire (real SDK, injected fetch)", () => {
  it("sends the documented shape: non-beta /v1/messages, fallbacks + beta header, PDF before text, no forced tools or sampling", async () => {
    const { client, requests } = sdkClient((req) => messageReply(String(req.body.model)));
    const res = await liveExtract(client, pdf, meta(), EXTRACT_TIMEOUT_MS);
    expect(res.ok).toBe(true);
    expect(requests).toHaveLength(1);
    const [req] = requests;

    expect(req!.method).toBe("POST");
    expect(new URL(req!.url).pathname).toBe("/v1/messages");
    expect(new URL(req!.url).search).toBe(""); // not the beta endpoint (?beta=true)
    expect(req!.headers.get("anthropic-beta")).toBe(SERVER_SIDE_FALLBACK_BETA);
    expect(req!.headers.get("anthropic-beta")).toBe("server-side-fallback-2026-07-01");

    const body = req!.body;
    expect(body.model).toBe(serverEnv().ANTHROPIC_MODEL_EXTRACT);
    expect(body.fallbacks).toBe("default");
    expect(body.max_tokens).toBe(16_000);
    for (const banned of ["tool_choice", "tools", "temperature", "top_p", "top_k", "thinking", "stream"]) {
      expect(body, banned).not.toHaveProperty(banned);
    }

    const [msg] = body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    expect(msg!.role).toBe("user");
    expect(msg!.content.map((b) => b.type)).toEqual(["document", "text"]);
    const doc = msg!.content[0] as { source: { type: string; media_type: string; data: string }; title: string };
    expect(doc.source.type).toBe("base64");
    expect(doc.source.media_type).toBe("application/pdf");
    expect(doc.source.data).not.toMatch(/\s/);
    expect(Buffer.from(doc.source.data, "base64").equals(Buffer.from(pdf))).toBe(true);
    expect(doc.title).toBe("presupuesto.pdf");
  });

  it("sends a structured-output schema the API accepts (closed objects, full required, no unsupported keywords)", async () => {
    const { client, requests } = sdkClient((req) => messageReply(String(req.body.model)));
    await liveExtract(client, pdf, meta(), EXTRACT_TIMEOUT_MS);
    const output = requests[0]!.body.output_config as { effort: string; format: { type: string; schema: Record<string, unknown> } };

    expect(output.effort).toBe("low");
    expect(output.format.type).toBe("json_schema");
    const nodes = [...schemaNodes(output.format.schema)];
    const objects = nodes.filter((n) => n.type === "object" && n.properties);
    expect(objects.length).toBeGreaterThanOrEqual(2); // RawExtraction + its line items
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
    }
    for (const n of nodes) {
      for (const k of UNSUPPORTED_SCHEMA_KEYWORDS) expect(n, `schema keyword ${k}`).not.toHaveProperty(k);
    }
    const codeEnum = nodes.find((n) => Array.isArray(n.enum) && (n.enum as string[]).includes("OTHER"));
    expect([...(codeEnum!.enum as string[])].sort()).toEqual(Object.keys(PROCEDURE_CATEGORY).sort());
  });

  it("parses the API's JSON text block with the real SDK into the golden extraction", async () => {
    const { client } = sdkClient(() => messageReply("claude-sonnet-5-5"));
    const res = await liveExtract(client, pdf, meta(), EXTRACT_TIMEOUT_MS);
    if (!res.ok) throw new Error(`expected ok, got ${res.reason}: ${res.detail}`);
    expect(res.extraction.source).toBe("live");
    expect(res.extraction.model).toBe("claude-sonnet-5-5");
    expect(res.extraction.lines).toEqual(GOLDEN_EXTRACTION.lines);
    expect(res.extraction.checks).toEqual(GOLDEN_EXTRACTION.checks);
  });

  it("a real SDK 400 about the beta header triggers one retry without fallbacks or the header", async () => {
    const { client, requests } = sdkClient((req) =>
      req.headers.get("anthropic-beta")
        ? json(400, {
            type: "error",
            error: { type: "invalid_request_error", message: "anthropic-beta: this organization is not enabled for the requested beta" },
          })
        : messageReply(String(req.body.model)),
    );
    const res = await liveExtract(client, pdf, meta(), EXTRACT_TIMEOUT_MS);
    expect(res.ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.headers.get("anthropic-beta")).toBeNull();
    expect(requests[1]!.body).not.toHaveProperty("fallbacks");
    expect(requests[1]!.body.output_config).toEqual(requests[0]!.body.output_config);
  });

  it("a 400 that the retry can't fix stops after two requests and reports api_error", async () => {
    const { client, requests } = sdkClient(() =>
      json(400, { type: "error", error: { type: "invalid_request_error", message: "output_config.format.schema: invalid" } }),
    );
    const res = await liveExtract(client, pdf, meta(), EXTRACT_TIMEOUT_MS);
    expect(res).toMatchObject({ ok: false, reason: "api_error" });
    expect(requests).toHaveLength(2);
  });
});
