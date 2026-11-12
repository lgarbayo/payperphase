/**
 * Wires the agent to its integrations from env (modes()): live toolkit or mock tools,
 * Claude tool loop or deterministic playbook. Tests replace any part with __setAgentDeps.
 */
import type { InvoiceToolsClient } from "@/contracts";
import { modes, serverEnv } from "@/env";
import { createAnthropicLlm, type LlmClient } from "./loop";
import { createMockInvoiceTools } from "./mockTools";
import type { AgentRunMode } from "./runtime";
import { createLiveInvoiceTools, loadToolkitToolSchemas, type AnthropicToolDef } from "./toolkit";

export interface AgentDeps {
  mode: AgentRunMode;
  llm: LlmClient | null;
  model: string;
  /** Built per run (the live toolkit gets a fresh token each run, and is rebuilt on a 401). */
  createTools(planId: string): Promise<InvoiceToolsClient>;
}

let override: Partial<AgentDeps> | null = null;
let cachedLlm: { key: string; client: LlmClient } | null = null;

/** Test seam: replace parts of the wiring (null restores env-driven defaults). */
export function __setAgentDeps(deps: Partial<AgentDeps> | null): void {
  override = deps;
}

async function schemasOrEmpty(): Promise<AnthropicToolDef[]> {
  try {
    return await loadToolkitToolSchemas();
  } catch (err) {
    console.warn("[agent] could not load toolkit schemas:", err instanceof Error ? err.message : err);
    return [];
  }
}

export function defaultDeps(): AgentDeps {
  const env = serverEnv();
  const m = modes(env);
  let llm: LlmClient | null = null;
  if (m.agent === "llm" && m.anthropic === "live" && env.ANTHROPIC_API_KEY) {
    if (!cachedLlm || cachedLlm.key !== env.ANTHROPIC_API_KEY) {
      cachedLlm = { key: env.ANTHROPIC_API_KEY, client: createAnthropicLlm(env.ANTHROPIC_API_KEY) };
    }
    llm = cachedLlm.client;
  }
  const mode: AgentRunMode = llm ? "llm" : "playbook";
  return {
    mode,
    llm,
    model: env.ANTHROPIC_MODEL_AGENT,
    async createTools(planId: string) {
      if (m.paypal === "live" && env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET) {
        return createLiveInvoiceTools({ clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET });
      }
      const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
      return createMockInvoiceTools({
        tools: mode === "llm" ? await schemasOrEmpty() : [],
        // Mock invoices have no PayPal payer page: link (and QR-encode) the patient's own plan page.
        payerUrl: (_id, number) => `${base}/p/${planId}?invoice=${encodeURIComponent(number)}`,
      });
    },
  };
}

export function resolveDeps(): AgentDeps {
  const base = defaultDeps();
  if (!override) return base;
  const merged = { ...base, ...override };
  if (override.llm !== undefined && override.mode === undefined) merged.mode = override.llm ? "llm" : "playbook";
  return merged;
}
