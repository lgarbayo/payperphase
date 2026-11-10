import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, invalidateAccessToken, PayPalAuthError, TOKEN_REFRESH_FRACTION } from "@/lib/paypal/token";
import { paypalRequest } from "@/lib/paypal/client";
import { restoreEnv, useLiveEnv, useMockEnv } from "./fakes";

const EXPIRES_IN = 32_400; // 9 h, PayPal sandbox style

function stubTokenFetch() {
  let n = 0;
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    n += 1;
    return new Response(JSON.stringify({ access_token: `token-${n}`, token_type: "Bearer", expires_in: EXPIRES_IN }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PayPal OAuth token cache", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-16T08:00:00Z") });
    useLiveEnv();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it("requests a client-credentials token with Basic auth against the sandbox", async () => {
    const fetchMock = stubTokenFetch();
    await expect(getAccessToken()).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("grant_type=client_credentials");
    const auth = new Headers(init?.headers).get("authorization");
    expect(auth).toBe(`Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`);
  });

  it("caches the token and refreshes it at 80% of expires_in", async () => {
    const fetchMock = stubTokenFetch();
    expect(TOKEN_REFRESH_FRACTION).toBe(0.8);
    const refreshAtMs = EXPIRES_IN * 1000 * 0.8;

    await expect(getAccessToken()).resolves.toBe("token-1");
    await expect(getAccessToken()).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(refreshAtMs - 1_000); // 79.99%: still cached
    await expect(getAccessToken()).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000); // exactly 80%: refresh
    await expect(getAccessToken()).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The refreshed token gets its own 80% window.
    vi.advanceTimersByTime(refreshAtMs - 1);
    await expect(getAccessToken()).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    const fetchMock = stubTokenFetch();
    const tokens = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);
    expect(tokens).toEqual(["token-1", "token-1", "token-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops the cached token and retries once when the API answers 401", async () => {
    let tokenN = 0;
    let apiN = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/v1/oauth2/token")) {
          tokenN += 1;
          return Response.json({ access_token: `token-${tokenN}`, expires_in: EXPIRES_IN });
        }
        apiN += 1;
        const auth = new Headers(init?.headers).get("authorization");
        return auth === "Bearer token-1"
          ? new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 })
          : Response.json({ id: "ORDER-1", status: "CREATED" });
      }),
    );
    await expect(paypalRequest("GET", "/v2/checkout/orders/ORDER-1")).resolves.toMatchObject({ id: "ORDER-1" });
    expect(tokenN).toBe(2);
    expect(apiN).toBe(2);
  });

  it("fails without credentials (mock mode) and never sends the secret anywhere else", async () => {
    useMockEnv();
    const fetchMock = stubTokenFetch();
    await expect(getAccessToken()).rejects.toBeInstanceOf(PayPalAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces only the HTTP status when OAuth fails (no body, no secret)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 })));
    invalidateAccessToken();
    const err = await getAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalAuthError);
    expect((err as Error).message).toContain("HTTP 401");
    expect((err as Error).message).not.toContain("test-client-secret");
    warn.mockRestore();
  });
});
