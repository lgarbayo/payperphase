/**
 * WP-04 test doubles. The store and the event bus are replaced with in-memory fakes so these tests
 * do not depend on WP-09's storage implementation; the PayPal REST API is replaced by a fetch router.
 *
 * Usage in a test file:
 *   vi.mock("@/server/store", async () => ({ store: (await import("./fakes")).fakeStore }));
 *   vi.mock("@/server/events", async () => (await import("./fakes")).fakeEventsModule());
 */
import { vi } from "vitest";
import type { DomainEvent, DomainEventInput, Plan, PlanSummary, SimClock, WebhookEventRecord } from "@/contracts";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { resetEnvCache } from "@/env";
import { invalidateAccessToken } from "@/lib/paypal/token";

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------
interface State {
  plans: Map<string, Plan>;
  heroId: string | null;
  clock: SimClock;
  webhookEvents: Map<string, WebhookEventRecord>;
}
const state: State = {
  plans: new Map(),
  heroId: null,
  clock: { today: "2026-11-16", startedAt: "2026-11-16", label: "simulated" },
  webhookEvents: new Map(),
};

const resolve = (id: string) => (id === "demo" ? state.heroId : state.plans.has(id) ? id : null);

export const fakeStore = {
  resolvePlanId: vi.fn(async (id: string) => resolve(id)),
  getPlan: vi.fn(async (id: string) => {
    const real = resolve(id);
    return real ? structuredClone(state.plans.get(real)!) : null;
  }),
  listPlans: vi.fn(async (): Promise<PlanSummary[]> =>
    [...state.plans.values()].map((p) => ({
      id: p.id,
      patientAlias: p.patient.alias,
      caseKind: p.caseKind,
      status: p.status,
      totalCents: p.totalCents,
      paidCents: 0,
      nextDue: null,
      updatedAt: p.updatedAt,
    })),
  ),
  savePlan: vi.fn(async (plan: Plan) => {
    state.plans.set(plan.id, structuredClone(plan));
    return plan;
  }),
  updatePlan: vi.fn(async (id: string, fn: (p: Plan) => Plan) => {
    const real = resolve(id);
    if (!real) throw new Error(`Plan not found: ${id}`);
    const next = fn(structuredClone(state.plans.get(real)!));
    state.plans.set(next.id, structuredClone(next));
    return next;
  }),
  getClock: vi.fn(async () => ({ ...state.clock })),
  setClock: vi.fn(async (today: string) => {
    state.clock = { ...state.clock, today };
    return { ...state.clock };
  }),
  recordWebhookEvent: vi.fn(async (r: WebhookEventRecord) => {
    if (state.webhookEvents.has(r.eventId)) return false;
    state.webhookEvents.set(r.eventId, r);
    return true;
  }),
};

/** Reset the fake store to the golden plan (optionally edited) and clear every spy. */
export function resetStore(edit?: (p: Plan) => Plan, today = "2026-11-16"): Plan {
  const plan = edit ? edit(structuredClone(GOLDEN_PLAN)) : structuredClone(GOLDEN_PLAN);
  state.plans = new Map([[plan.id, plan]]);
  state.heroId = plan.id;
  state.clock = { today, startedAt: "2026-11-16", label: "simulated" };
  state.webhookEvents = new Map();
  for (const fn of Object.values(fakeStore)) fn.mockClear();
  published.length = 0;
  publishSpy.mockClear();
  return plan;
}

export function storedPlan(id = "pln_ribera01"): Plan {
  return structuredClone(state.plans.get(id)!);
}

export function storedWebhookEvents(): WebhookEventRecord[] {
  return [...state.webhookEvents.values()];
}

/** Edit one phase's payment milestone in a plan (helper for resetStore). */
export function withPayment(phaseId: string, patch: Partial<Plan["phases"][number]["payment"]>) {
  return (p: Plan): Plan => ({
    ...p,
    phases: p.phases.map((ph) => (ph.id === phaseId ? { ...ph, payment: { ...ph.payment, ...patch } } : ph)),
  });
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------
export const published: DomainEvent[] = [];
export const publishSpy = vi.fn((input: DomainEventInput): DomainEvent => {
  const e = { ...input, id: `evt-${published.length + 1}`, at: new Date().toISOString(), simToday: "2026-11-16" } as DomainEvent;
  published.push(e);
  return e;
});
export function fakeEventsModule() {
  return { publish: publishSpy, subscribe: () => () => {}, setEventSimToday: () => {} };
}
export function eventsOfType<T extends DomainEvent["type"]>(type: T): Extract<DomainEvent, { type: T }>[] {
  return published.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);
}

// ---------------------------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------------------------
const ENV_KEYS = [
  "FORCE_MOCKS",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "PUBLIC_BASE_URL",
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
  "NEXT_PUBLIC_PAYPAL_BUYER_COUNTRY",
] as const;
const savedEnv: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

export function useLiveEnv(): void {
  process.env.FORCE_MOCKS = "0";
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
  process.env.PAYPAL_WEBHOOK_ID = "WH-TEST-123";
  process.env.PUBLIC_BASE_URL = "https://ppp.example.com";
  resetEnvCache();
  invalidateAccessToken();
}

export function useMockEnv(): void {
  process.env.FORCE_MOCKS = "1";
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  delete process.env.PAYPAL_WEBHOOK_ID;
  resetEnvCache();
  invalidateAccessToken();
}

export function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetEnvCache();
  invalidateAccessToken();
}

// ---------------------------------------------------------------------------------------------
// PayPal REST fetch router
// ---------------------------------------------------------------------------------------------
export interface PayPalCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string | undefined;
}
export type Reply = { status: number; body?: unknown };
export type Route = { method: string; path: string | RegExp; reply: (call: PayPalCall) => Reply };

export const TOKEN = "A21AA-test-access-token";

export function paypalError(status: number, issue: string, name = "UNPROCESSABLE_ENTITY"): Reply {
  return {
    status,
    body: { name, message: "The requested action could not be performed.", debug_id: "dbg123", details: [{ issue }] },
  };
}

/**
 * Stub global fetch with a PayPal router. The OAuth token route is always present.
 * Returns the recorded calls (token calls included).
 */
export function mockPayPal(routes: Route[]): { calls: PayPalCall[]; apiCalls: () => PayPalCall[] } {
  const calls: PayPalCall[] = [];
  const all: Route[] = [
    {
      method: "POST",
      path: "/v1/oauth2/token",
      reply: () => ({ status: 200, body: { access_token: TOKEN, token_type: "Bearer", expires_in: 32_400 } }),
    },
    ...routes,
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? "GET").toUpperCase();
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      const rawBody = typeof init?.body === "string" ? init.body : undefined;
      let body: unknown = rawBody;
      try {
        body = rawBody ? JSON.parse(rawBody) : undefined;
      } catch {
        /* form body */
      }
      const call: PayPalCall = { method, path: url.pathname, headers, body, rawBody };
      calls.push(call);
      const route = all.find(
        (r) => r.method === method && (typeof r.path === "string" ? r.path === url.pathname : r.path.test(url.pathname)),
      );
      if (!route) return new Response(JSON.stringify({ name: "NOT_FOUND" }), { status: 404 });
      const r = route.reply(call);
      return new Response(r.body === undefined ? "" : JSON.stringify(r.body), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return { calls, apiCalls: () => calls.filter((c) => c.path !== "/v1/oauth2/token") };
}

// ---------------------------------------------------------------------------------------------
// PayPal payload builders
// ---------------------------------------------------------------------------------------------
export function completedOrder(
  orderId: string,
  opts: { captureId?: string; captureStatus?: string; customId?: string; value?: string; status?: string } = {},
) {
  const customId = opts.customId ?? "pln_ribera01:ph1";
  return {
    id: orderId,
    status: opts.status ?? "COMPLETED",
    purchase_units: [
      {
        reference_id: "ph1",
        custom_id: customId,
        amount: { currency_code: "EUR", value: opts.value ?? "360.00" },
        payments: {
          captures: [
            {
              id: opts.captureId ?? "CAP-1",
              status: opts.captureStatus ?? "COMPLETED",
              amount: { currency_code: "EUR", value: opts.value ?? "360.00" },
              custom_id: customId,
              create_time: "2026-11-16T10:00:00Z",
            },
          ],
        },
      },
    ],
  };
}

export function approvedOrder(orderId: string, customId = "pln_ribera01:ph1") {
  return {
    id: orderId,
    status: "APPROVED",
    purchase_units: [{ reference_id: "ph1", custom_id: customId, amount: { currency_code: "EUR", value: "360.00" } }],
  };
}
