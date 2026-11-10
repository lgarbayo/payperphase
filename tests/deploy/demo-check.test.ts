/**
 * WP-13: scripts/demo-check.ts exit codes and report, driven in-process with a fetch that routes
 * to the real route handlers (temp DATA_DIR) and fakes the HTML pages. No server, no network.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/env";
import { formatReport, main, normalizeBaseUrl, runDemoCheck, type FetchLike } from "../../scripts/demo-check";

const BASE = "https://demo.test";
const saved = { ...process.env };
let dir: string;
let handlers: {
  health: () => Promise<Response>;
  reset: () => Promise<Response>;
  plan: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ppp-demo-check-"));
  process.env.DATA_DIR = dir;
  process.env.FORCE_MOCKS = "1";
  resetEnvCache();
  vi.resetModules();
  handlers = {
    health: (await import("../../app/api/health/route")).GET,
    reset: (await import("../../app/api/demo/reset/route")).POST,
    plan: (await import("../../app/api/plans/[id]/route")).GET,
  };
});

afterAll(() => {
  process.env = { ...saved };
  resetEnvCache();
  rmSync(dir, { recursive: true, force: true });
});

const html = () => new Response("<!doctype html><html><body>ok</body></html>", { status: 200, headers: { "content-type": "text/html" } });

function makeFetch(overrides: Record<string, () => Response | Promise<Response>> = {}): FetchLike {
  return async (input, init) => {
    const path = new URL(input).pathname;
    const key = `${init?.method ?? "GET"} ${path}`;
    if (overrides[key]) return overrides[key]();
    if (key === "GET /api/health") return handlers.health();
    if (key === "POST /api/demo/reset") return handlers.reset();
    if (key === "GET /api/plans/demo") return handlers.plan(new Request(input), { params: Promise.resolve({ id: "demo" }) });
    return html();
  };
}

describe("demo-check", () => {
  it("exits 0 and reports every row passing when the demo path is healthy", async () => {
    const lines: string[] = [];
    const code = await main([BASE], { fetch: makeFetch(), log: (l) => lines.push(l) });
    expect(lines.join("\n")).toMatch(/health/);
    expect(code).toBe(0);
  });

  it("covers health, reset, plan and the four pages", async () => {
    const report = await runDemoCheck(BASE, { fetch: makeFetch() });
    expect(report.ok).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.results.map((r) => r.path)).toEqual([
      "/api/health", "/api/demo/reset", "/api/plans/demo", "/p/demo", "/clinic", "/gantt-lab", "/",
    ]);
    expect(formatReport(report).length).toBeGreaterThan(report.results.length);
  });

  it("exits non-zero when a page returns 500", async () => {
    const fetch = makeFetch({ "GET /gantt-lab": () => new Response("boom", { status: 500 }) });
    const code = await main([BASE], { fetch, log: () => undefined });
    expect(code).toBe(1);
  });

  it("exits non-zero when health says ok:false or the network fails", async () => {
    const down = makeFetch({ "GET /api/health": () => new Response("{}", { status: 503 }) });
    expect(await main([BASE], { fetch: down, log: () => undefined })).toBe(1);
    const broken: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const report = await runDemoCheck(BASE, { fetch: broken });
    expect(report.ok).toBe(false);
    expect(report.passed).toBe(0);
  });

  it("--skip-reset skips the reset row without failing", async () => {
    const report = await runDemoCheck(BASE, { fetch: makeFetch(), skipReset: true });
    expect(report.skipped).toBe(1);
    expect(report.ok).toBe(true);
  });

  it("exits 2 on a missing or invalid base URL", async () => {
    expect(await main([], { log: () => undefined })).toBe(2);
    expect(await main(["ftp://x"], { log: () => undefined })).toBe(2);
    expect(normalizeBaseUrl("https://a.onrender.com/")).toBe("https://a.onrender.com");
  });
});
