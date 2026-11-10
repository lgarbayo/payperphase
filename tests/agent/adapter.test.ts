/** WP-10 toolkit adapter: toolSpec → Anthropic tools (allowlist only), safe JSON parsing, sandbox flag, 401 rebuild. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceToolNameSchema, TOOLKIT_INVOICE_ACTIONS } from "@/contracts";
import {
  createLiveInvoiceTools,
  defaultToolkitFactory,
  isAuthError,
  isToolErrorOutput,
  loadToolkitToolSchemas,
  parseToolkitResult,
  parseToolkitText,
  toAnthropicTools,
  type BedrockToolSpec,
  type ToolkitLike,
} from "@/agent/toolkit";

const ctor = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@paypal/agent-toolkit/bedrock", async (importActual) => {
  const actual = await importActual<typeof import("@paypal/agent-toolkit/bedrock")>();
  class Recording extends actual.PayPalAgentToolkit {
    constructor(args: ConstructorParameters<typeof actual.PayPalAgentToolkit>[0]) {
      ctor.calls.push(args);
      super(args);
    }
  }
  return { ...actual, PayPalAgentToolkit: Recording };
});

const spec = (name: string, json: unknown = { type: "object", properties: {} }): BedrockToolSpec => ({
  toolSpec: { name, description: `  ${name} description  `, inputSchema: { json } },
});

describe("toAnthropicTools", () => {
  it("maps toolSpec → {name, description, input_schema} and keeps only allowlisted names", () => {
    const out = toAnthropicTools([
      spec("create_invoice", { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { a: { type: "string" } }, required: ["a"] }),
      spec("create_order"),
      spec("capture_order"),
      spec("send_invoice"),
      spec("list_invoices"),
      { toolSpec: undefined } as unknown as BedrockToolSpec,
    ]);
    expect(out.map((t) => t.name)).toEqual(["create_invoice", "send_invoice"]);
    expect(out[0]).toEqual({
      name: "create_invoice",
      description: "create_invoice description",
      input_schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
    });
    expect(Object.keys(out[0]!).sort()).toEqual(["description", "input_schema", "name"]);
  });

  it("falls back to an empty object schema when the toolkit gave none", () => {
    const [t] = toAnthropicTools([{ toolSpec: { name: "get_invoice", description: "d", inputSchema: undefined as never } }]);
    expect(t!.input_schema).toEqual({ type: "object", properties: {} });
  });

  it("the real toolkit's specs map to exactly the 7 allowlisted invoice tools", async () => {
    const tools = await loadToolkitToolSchemas();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["cancel_sent_invoice", "create_invoice", "generate_invoice_qr_code", "get_invoice", "record_payment_for_invoice", "send_invoice", "send_invoice_reminder"],
    );
    for (const t of tools) {
      expect(InvoiceToolNameSchema.safeParse(t.name).success).toBe(true);
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema).not.toHaveProperty("$schema");
      expect(t.description.length).toBeGreaterThan(5);
    }
    const create = tools.find((t) => t.name === "create_invoice")!;
    expect((create.input_schema as { required: string[] }).required).toEqual(["currency_code", "primary_recipients", "items"]);
  });
});

describe("handleToolCall text parsing", () => {
  it("decodes the toolkit's double-encoded JSON", () => {
    const inner = { id: "INV2-1", status: "SENT" };
    expect(parseToolkitText(JSON.stringify(JSON.stringify(inner)))).toEqual(inner);
    expect(parseToolkitText(JSON.stringify(inner))).toEqual(inner);
  });
  it("never throws on non-JSON text and returns it as a string", () => {
    expect(parseToolkitText("--boundary\r\nContent-Type: text/plain\r\n\r\niVBORw0KGgo=")).toMatch(/^--boundary/);
    expect(parseToolkitText("{not json")).toBe("{not json");
    expect(parseToolkitText("")).toBe("");
    expect(parseToolkitText(undefined)).toBeNull();
    expect(parseToolkitText(42)).toBe(42);
  });
  it("joins content parts and flags error objects", () => {
    expect(parseToolkitResult({ toolUseId: "t", content: [{ text: JSON.stringify(JSON.stringify({ id: "X" })) }] })).toEqual({ ok: true, output: { id: "X" } });
    const bad = parseToolkitResult({ toolUseId: "t", content: [{ text: JSON.stringify(JSON.stringify({ ok: false, status: 422, message: "Invoice number is duplicate." })) }] });
    expect(bad.ok).toBe(false);
    expect(parseToolkitResult(null)).toEqual({ ok: true, output: "" });
    expect(isToolErrorOutput({ error: { message: "x" } })).toBe(true);
    expect(isToolErrorOutput({ status: "SENT" })).toBe(false);
    expect(isToolErrorOutput("plain")).toBe(false);
  });
  it("recognises an auth failure returned as a tool-result string", () => {
    expect(isAuthError({ ok: false, status: 401, message: "Unauthorized" })).toBe(true);
    expect(isAuthError({ message: "Failed to fetch access token" })).toBe(true);
    expect(isAuthError({ name: "AUTHENTICATION_FAILURE" })).toBe(true);
    expect(isAuthError({ status: 422, message: "Invoice number is duplicate." })).toBe(false);
  });
});

describe("toolkit construction", () => {
  beforeEach(() => {
    ctor.calls.length = 0;
  });
  it("always passes context.sandbox:true and only the invoice actions", async () => {
    await defaultToolkitFactory("cid", "secret");
    expect(ctor.calls).toHaveLength(1);
    expect(ctor.calls[0]).toMatchObject({
      clientId: "cid",
      configuration: { actions: { invoices: TOOLKIT_INVOICE_ACTIONS }, context: { sandbox: true } },
    });
    expect(Object.keys((ctor.calls[0] as { configuration: { actions: object } }).configuration.actions)).toEqual(["invoices"]);
  });
});

describe("createLiveInvoiceTools", () => {
  const ok = (v: unknown) => ({ toolUseId: "t", content: [{ text: JSON.stringify(JSON.stringify(v)) }] });
  function fakeToolkit(responses: unknown[]): ToolkitLike & { calls: Array<{ name: string; input: unknown }> } {
    const calls: Array<{ name: string; input: unknown }> = [];
    return {
      calls,
      getTools: () => [spec("send_invoice"), spec("create_order")],
      handleToolCall: async ({ name, input }) => {
        calls.push({ name, input });
        return ok(responses.shift());
      },
    };
  }

  it("lists only allowlisted tools, calls through, and refuses other names", async () => {
    const tk = fakeToolkit([{ href: "https://x" }]);
    const client = await createLiveInvoiceTools({ clientId: "a", clientSecret: "b", factory: () => tk });
    expect(client.mode).toBe("live");
    expect(client.listTools().map((t) => t.name)).toEqual(["send_invoice"]);
    expect(await client.call("send_invoice", { invoice_id: "I1" })).toEqual({ ok: true, output: { href: "https://x" } });
    const refused = await client.call("create_order" as never, {});
    expect(refused.ok).toBe(false);
    expect(tk.calls).toHaveLength(1);
  });

  it("rebuilds the toolkit (fresh token) once on a 401 tool-result string and retries", async () => {
    const first = fakeToolkit([{ ok: false, status: 401, message: "Unauthorized" }]);
    const second = fakeToolkit([{ href: "https://sent" }]);
    const factory = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const client = await createLiveInvoiceTools({ clientId: "a", clientSecret: "b", factory });
    const res = await client.call("send_invoice", { invoice_id: "I1" });
    expect(res).toEqual({ ok: true, output: { href: "https://sent" } });
    expect(factory).toHaveBeenCalledTimes(2);
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
  });

  it("does not loop on a persistent 401", async () => {
    const mk = () => fakeToolkit([{ ok: false, status: 401, message: "Unauthorized" }]);
    const factory = vi.fn().mockImplementation(async () => mk());
    const client = await createLiveInvoiceTools({ clientId: "a", clientSecret: "b", factory });
    const res = await client.call("send_invoice", { invoice_id: "I1" });
    expect(res.ok).toBe(false);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("turns a thrown toolkit error into an error result", async () => {
    const tk: ToolkitLike = { getTools: () => [spec("send_invoice")], handleToolCall: async () => { throw new Error("socket hang up"); } };
    const client = await createLiveInvoiceTools({ clientId: "a", clientSecret: "b", factory: () => tk });
    expect(await client.call("send_invoice", { invoice_id: "I1" })).toEqual({ ok: false, output: { error: { message: "socket hang up" } } });
  });
});
