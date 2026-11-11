/**
 * OWNED BY WP-10. Live InvoiceToolsClient over the PayPal Agent Toolkit `/bedrock` export
 * (@paypal/agent-toolkit@1.11.0), adapted to Anthropic tool shapes:
 *   getTools()       → [{toolSpec:{name, description, inputSchema:{json}}}]  →  [{name, description, input_schema}]
 *   handleToolCall() → {toolUseId, content:[{text}]}                         →  {ok, output}
 * The toolkit fetches its own OAuth token from the client credentials and caches it forever, so the
 * client is built per agent run and rebuilt once on a 401 (sandbox tokens last 3–8 h).
 * Server-only: next.config keeps the package external (serverExternalPackages).
 */
import { InvoiceToolNameSchema, TOOLKIT_INVOICE_ACTIONS, type InvoiceToolName, type InvoiceToolsClient } from "@/contracts";

export interface BedrockToolSpec {
  toolSpec: { name: string; description: string; inputSchema: { json: unknown } };
}
export interface BedrockToolResult {
  toolUseId: string;
  content: Array<{ text: string }>;
}
/** The slice of PayPalAgentToolkit (bedrock) the adapter uses; injectable for tests. */
export interface ToolkitLike {
  getTools(): BedrockToolSpec[];
  handleToolCall(call: { toolUseId: string; name: string; input: unknown }): Promise<BedrockToolResult>;
}
export type AnthropicToolDef = ReturnType<InvoiceToolsClient["listTools"]>[number];

/** Map toolkit specs to Anthropic tools, keeping ONLY the contract allowlist. */
export function toAnthropicTools(specs: readonly BedrockToolSpec[]): AnthropicToolDef[] {
  const out: AnthropicToolDef[] = [];
  for (const s of specs) {
    const name = InvoiceToolNameSchema.safeParse(s?.toolSpec?.name);
    if (!name.success) continue;
    const json = s.toolSpec.inputSchema?.json;
    const schema: Record<string, unknown> =
      json && typeof json === "object" ? { ...(json as Record<string, unknown>) } : { type: "object", properties: {} };
    delete schema.$schema;
    if (schema.type !== "object") schema.type = "object";
    out.push({ name: name.data, description: String(s.toolSpec.description ?? "").trim(), input_schema: schema });
  }
  return out;
}

/**
 * The toolkit returns `text: JSON.stringify(JSON.stringify(output))` (double-encoded). Decode up to
 * twice, never throw; non-JSON text (e.g. a base64 QR image) is returned as the string itself.
 */
export function parseToolkitText(text: unknown): unknown {
  if (typeof text !== "string") return text ?? null;
  let value: unknown = text;
  for (let i = 0; i < 2 && typeof value === "string"; i++) {
    const s = value.trim();
    if (!s) return "";
    try {
      value = JSON.parse(s);
    } catch {
      return value;
    }
  }
  return value;
}

/** A toolkit tool output is an error when it is a PayPal/LLM error object. */
export function isToolErrorOutput(output: unknown): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) return false;
  const o = output as Record<string, unknown>;
  return o.ok === false || "error" in o || (typeof o.status === "number" && o.status >= 400 && "message" in o);
}

export function parseToolkitResult(result: BedrockToolResult | null | undefined): { ok: boolean; output: unknown } {
  const texts = Array.isArray(result?.content) ? result!.content.map((c) => c?.text ?? "") : [];
  const output = parseToolkitText(texts.join(""));
  return { ok: !isToolErrorOutput(output), output };
}

/** 401 / expired or rejected token → rebuild the toolkit (new token) and retry once. */
export function isAuthError(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  if (o.status === 401) return true;
  const msg = JSON.stringify(o);
  return /invalid_token|token[^"]{0,20}expired|"status":401|AUTHENTICATION_FAILURE|Failed to fetch access token/i.test(msg);
}

export interface LiveToolkitOptions {
  clientId: string;
  clientSecret: string;
  /** Test seam: build a toolkit (defaults to the real `/bedrock` PayPalAgentToolkit). */
  factory?: () => Promise<ToolkitLike> | ToolkitLike;
}

let toolUseSeq = 0;

export async function defaultToolkitFactory(clientId: string, clientSecret: string): Promise<ToolkitLike> {
  const mod = (await import("@paypal/agent-toolkit/bedrock")) as unknown as {
    PayPalAgentToolkit: new (args: {
      clientId: string;
      clientSecret: string;
      configuration: { actions: Record<string, Record<string, boolean>>; context?: Record<string, unknown> };
    }) => ToolkitLike;
  };
  return new mod.PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions: { invoices: { ...TOOLKIT_INVOICE_ACTIONS } }, context: { sandbox: true } },
  });
}

/** The real toolkit's allowlisted tool schemas, built offline (dummy credentials, no network). */
export async function loadToolkitToolSchemas(): Promise<AnthropicToolDef[]> {
  const g = globalThis as unknown as { __pppToolkitSchemas?: AnthropicToolDef[] };
  if (!g.__pppToolkitSchemas) {
    const tk = await defaultToolkitFactory("schema-only", "schema-only");
    g.__pppToolkitSchemas = toAnthropicTools(tk.getTools());
  }
  return g.__pppToolkitSchemas;
}

/** Live client for one agent run. */
export async function createLiveInvoiceTools(opts: LiveToolkitOptions): Promise<InvoiceToolsClient> {
  const build = async () => (opts.factory ? opts.factory() : defaultToolkitFactory(opts.clientId, opts.clientSecret));
  let toolkit = await build();
  const tools = toAnthropicTools(toolkit.getTools());

  async function invoke(name: InvoiceToolName, input: Record<string, unknown>) {
    const res = await toolkit.handleToolCall({ toolUseId: `ppp_${Date.now().toString(36)}_${++toolUseSeq}`, name, input });
    return parseToolkitResult(res);
  }

  return {
    mode: "live",
    listTools: () => tools,
    async call(name, input) {
      if (!InvoiceToolNameSchema.safeParse(name).success) {
        return { ok: false, output: { error: { message: `Tool not allowed: ${String(name)}` } } };
      }
      try {
        let res = await invoke(name, input);
        if (!res.ok && isAuthError(res.output)) {
          toolkit = await build();
          res = await invoke(name, input);
        }
        return res;
      } catch (err) {
        return { ok: false, output: { error: { message: err instanceof Error ? err.message : String(err) } } };
      }
    },
  };
}
