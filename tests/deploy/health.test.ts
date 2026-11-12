/**
 * GET /api/health keeps the HealthResponse contract shape, reports the Render commit and
 * the integration modes, and turns 503 when the store or the env is broken.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthResponseSchema } from "@/contracts";
import { resetEnvCache } from "@/env";
import { GET } from "../../app/api/health/route";

const { getClock } = vi.hoisted(() => ({ getClock: vi.fn() }));
vi.mock("@/server/store", () => ({ store: { getClock: () => getClock() } }));

const saved = { ...process.env };

beforeEach(() => {
  getClock.mockReset();
  getClock.mockResolvedValue({ today: "2026-11-16", startedAt: "2026-11-16", label: "simulated" });
  resetEnvCache();
});

afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("returns ok:true with the contract shape, mock modes and the simulated day", async () => {
    delete process.env.RENDER_GIT_COMMIT;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = HealthResponseSchema.parse(await res.json());
    expect(body).toEqual({
      ok: true,
      version: "dev",
      modes: { paypal: "mock", paypalWebhooks: "mock", anthropic: "mock", agent: "playbook" },
      simToday: "2026-11-16",
    });
  });

  it("reports the short commit Render injects as RENDER_GIT_COMMIT", async () => {
    process.env.RENDER_GIT_COMMIT = "0123456789abcdef0123456789abcdef01234567";
    const body = HealthResponseSchema.parse(await (await GET()).json());
    expect(body.version).toBe("0123456");
  });

  it("reports live modes when keys are present (and FORCE_MOCKS is off)", async () => {
    process.env.FORCE_MOCKS = "0";
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    process.env.ANTHROPIC_API_KEY = "key";
    resetEnvCache();
    const body = HealthResponseSchema.parse(await (await GET()).json());
    expect(body.modes).toEqual({ paypal: "live", paypalWebhooks: "mock", anthropic: "live", agent: "llm" });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("is 503 with ok:false when the store cannot be read (broken disk)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getClock.mockRejectedValue(new Error("EACCES: permission denied, open '/var/data/db.json'"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = HealthResponseSchema.parse(await res.json());
    expect(body.ok).toBe(false);
    expect(body.simToday).toBeNull();
  });

  it("is 503 naming the malformed env key, never its value", async () => {
    process.env.DEMO_PATIENT_EMAIL = "not-an-email-but-private";
    resetEnvCache();
    const res = await GET();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ error: { code: "ENV_INVALID" } });
    expect(text).toContain("DEMO_PATIENT_EMAIL");
    expect(text).not.toContain("not-an-email-but-private");
  });
});
