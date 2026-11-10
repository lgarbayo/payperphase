/**
 * Scaffold-owned. Typed, lazily-parsed environment.
 *
 * Rules:
 * - Never read process.env directly elsewhere; call serverEnv() / publicEnv() / modes().
 * - Parsing is lazy so `next build` never fails on missing secrets.
 * - A missing secret switches that integration to "mock"; the UI must show <ModeBadge/>.
 */
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalSecret = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3000")),
  DATA_DIR: z.preprocess(emptyToUndefined, z.string().default("./.data")),
  SIM_START_DATE: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-11-16"),
  ),
  FORCE_MOCKS: z.preprocess(emptyToUndefined, z.enum(["0", "1"]).default("0")),

  PAYPAL_ENV: z.preprocess(emptyToUndefined, z.literal("sandbox").default("sandbox")),
  PAYPAL_CLIENT_ID: optionalSecret,
  PAYPAL_CLIENT_SECRET: optionalSecret,
  PAYPAL_WEBHOOK_ID: optionalSecret,
  PHASE_PAYMENT_INTENT: z.preprocess(emptyToUndefined, z.enum(["CAPTURE", "AUTHORIZE"]).default("CAPTURE")),
  DEMO_PATIENT_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  DEMO_MERCHANT_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),

  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL_EXTRACT: z.preprocess(emptyToUndefined, z.string().default("claude-sonnet-5-5")),
  ANTHROPIC_MODEL_WORDING: z.preprocess(emptyToUndefined, z.string().default("claude-sonnet-5-5")),
  ANTHROPIC_MODEL_AGENT: z.preprocess(emptyToUndefined, z.string().default("claude-sonnet-5-5")),
  ANTHROPIC_MODEL_CHAT: z.preprocess(emptyToUndefined, z.string().default("claude-haiku-5-5")),
  AGENT_MODE: z.preprocess(emptyToUndefined, z.enum(["auto", "llm", "playbook"]).default("auto")),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

/** Server-side env. Throws only on malformed values, never on missing secrets. */
export function serverEnv(): ServerEnv {
  if (!cached) cached = ServerEnvSchema.parse(process.env);
  return cached;
}

/** Test helper: forget the cached env after mutating process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}

export type IntegrationMode = "live" | "mock";

export interface Modes {
  paypal: IntegrationMode;
  /** Webhook verification needs PAYPAL_WEBHOOK_ID on top of the client credentials. */
  paypalWebhooks: IntegrationMode;
  anthropic: IntegrationMode;
  agent: "llm" | "playbook";
}

/** Which integrations are live. Safe to call anywhere on the server. */
export function modes(env: ServerEnv = serverEnv()): Modes {
  const forced = env.FORCE_MOCKS === "1";
  const paypal: IntegrationMode = !forced && env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET ? "live" : "mock";
  const anthropic: IntegrationMode = !forced && env.ANTHROPIC_API_KEY ? "live" : "mock";
  const agent =
    env.AGENT_MODE === "playbook" ? "playbook" : env.AGENT_MODE === "llm" ? "llm" : anthropic === "live" ? "llm" : "playbook";
  return {
    paypal,
    paypalWebhooks: paypal === "live" && env.PAYPAL_WEBHOOK_ID ? "live" : "mock",
    anthropic,
    agent,
  };
}

/** Values safe for the browser (inlined by Next at build time). */
export function publicEnv() {
  return {
    paypalClientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "",
    paypalBuyerCountry: process.env.NEXT_PUBLIC_PAYPAL_BUYER_COUNTRY ?? "ES",
  };
}

export const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
