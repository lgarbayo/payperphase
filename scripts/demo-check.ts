/**
 * OWNED BY WP-13. Checks the demo path of a running PayPerPhase over HTTP (Render or local).
 *
 *   npx tsx scripts/demo-check.ts <baseUrl> [--skip-reset] [--timeout <ms>]
 *                                 [--browser [--chromium-path <path>] [--screenshot <file.png>]]
 *
 * Rows, in order:
 *   1. GET  /api/health      200, a HealthResponse with ok:true (mock modes are fine)
 *   2. POST /api/demo/reset  200, ok:true and a hero plan id   (--skip-reset: not called)
 *   3. GET  /api/plans/demo  200, a PlanViewResponse whose plan is the hero plan
 *   4. GET  /p/demo · /clinic · /gantt-lab · /   200 and HTML
 *   5. --browser only: headless Chromium opens /gantt-lab and waits for Bryntum task bars
 *      (Gate A evidence; needs `npx playwright install chromium` or --chromium-path).
 *
 * It prints a pass/fail table. Exit 0 when every row passes, 1 on any failure, 2 on bad usage.
 * `main` and `runDemoCheck` are exported so tests drive them with a mocked fetch (no process).
 * Note: row 2 really resets the demo state, exactly like the public "Reset demo" button.
 */
import { parseArgs } from "node:util";
import { DemoResponseSchema, HealthResponseSchema, PlanViewResponseSchema } from "@/contracts";
import { formatCents } from "@/lib/money";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BrowserCheckOptions {
  /** Chromium binary to use instead of Playwright's managed download. */
  chromiumPath?: string;
  /** Save a full-page PNG of /gantt-lab here. */
  screenshot?: string;
}

export interface DemoCheckOptions {
  /** Defaults to the global fetch. */
  fetch?: FetchLike;
  /** Per-request timeout in ms (default 20 000). */
  timeoutMs?: number;
  /** Do not POST /api/demo/reset (the row is reported as SKIP). */
  skipReset?: boolean;
  /** Add the headless-browser Bryntum row. */
  browser?: false | BrowserCheckOptions;
  /** Clock for row timings (tests). */
  now?: () => number;
}

export type CheckOutcome = "pass" | "fail" | "skip";

export interface CheckResult {
  name: string;
  method: "GET" | "POST" | "BROWSER";
  path: string;
  /** HTTP status, or null when no response arrived (network error, timeout, skipped). */
  status: number | null;
  ms: number;
  outcome: CheckOutcome;
  detail: string;
}

export interface DemoCheckReport {
  baseUrl: string;
  results: CheckResult[];
  passed: number;
  failed: number;
  skipped: number;
  /** True when no row failed. */
  ok: boolean;
}

export const DEFAULT_TIMEOUT_MS = 20_000;
export const PAGE_PATHS = ["/p/demo", "/clinic", "/gantt-lab", "/"] as const;
/** Bryntum renders each task bar (and milestone) as a `.b-gantt-task` element. */
export const BRYNTUM_TASK_SELECTOR = ".b-gantt-task";

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

export const USAGE = `Usage: npx tsx scripts/demo-check.ts <baseUrl> [options]

  <baseUrl>                 e.g. https://payperphase.onrender.com or http://127.0.0.1:41234
  --skip-reset              do not POST /api/demo/reset (use while someone is mid-demo)
  --timeout <ms>            per-request timeout (default ${DEFAULT_TIMEOUT_MS})
  --browser                 also open /gantt-lab in headless Chromium and require Bryntum task bars
  --chromium-path <path>    Chromium binary for --browser (default: Playwright's own download)
  --screenshot <file.png>   with --browser, save a screenshot of /gantt-lab
  -h, --help                show this help

Exit codes: 0 all rows pass · 1 any row fails · 2 bad usage.`;

/** Validates and normalises a base URL (http/https, no trailing slash). Null when unusable. */
export function normalizeBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

interface HttpOutcome {
  status: number | null;
  ms: number;
  res?: Response;
  text?: string;
  error?: string;
}

class Runner {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(
    readonly baseUrl: string,
    opts: DemoCheckOptions,
  ) {
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = opts.now ?? (() => performance.now());
  }

  async http(method: "GET" | "POST", path: string, accept: string): Promise<HttpOutcome> {
    const started = this.now();
    const elapsed = () => Math.round(this.now() - started);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { accept, "user-agent": "payperphase-demo-check" },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const text = await res.text();
      return { status: res.status, ms: elapsed(), res, text };
    } catch (err) {
      return { status: null, ms: elapsed(), error: describeError(err, this.timeoutMs) };
    }
  }
}

function describeError(err: unknown, timeoutMs: number): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return `timed out after ${timeoutMs} ms`;
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
    return causeMsg && !err.message.includes(causeMsg) ? `${err.message} (${causeMsg})` : err.message;
  }
  return String(err);
}

function oneLine(s: string, max = 140): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** "HTTP 503 · ENV_INVALID: …" for an API error body, "HTTP 404" otherwise. */
function httpFailure(out: HttpOutcome): string {
  if (out.status === null) return out.error ?? "no response";
  let msg = `HTTP ${out.status}`;
  try {
    const body = JSON.parse(out.text ?? "") as { error?: { code?: string; message?: string } };
    if (body?.error?.code) msg += ` · ${body.error.code}: ${body.error.message ?? ""}`;
  } catch {
    /* not JSON; the status says enough */
  }
  return oneLine(msg);
}

function parseJsonBody(out: HttpOutcome): { ok: true; value: unknown } | { ok: false; detail: string } {
  try {
    return { ok: true, value: JSON.parse(out.text ?? "") };
  } catch {
    const type = out.res?.headers.get("content-type") ?? "unknown content-type";
    return { ok: false, detail: `body is not JSON (${type})` };
  }
}

function firstIssue(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  if (!issue) return "invalid";
  const where = issue.path.length ? issue.path.map(String).join(".") : "(root)";
  return oneLine(`${where}: ${issue.message}`, 100);
}

function row(
  name: string,
  method: CheckResult["method"],
  path: string,
  out: Pick<HttpOutcome, "status" | "ms">,
  outcome: CheckOutcome,
  detail: string,
): CheckResult {
  return { name, method, path, status: out.status, ms: out.ms, outcome, detail };
}

async function checkHealth(r: Runner): Promise<CheckResult> {
  const path = "/api/health";
  const out = await r.http("GET", path, "application/json");
  const fail = (detail: string) => row("health", "GET", path, out, "fail", detail);
  if (out.status !== 200) return fail(httpFailure(out));
  const body = parseJsonBody(out);
  if (!body.ok) return fail(body.detail);
  const parsed = HealthResponseSchema.safeParse(body.value);
  if (!parsed.success) return fail(`not a HealthResponse · ${firstIssue(parsed.error)}`);
  const h = parsed.data;
  const m = h.modes;
  const summary = `v=${h.version} · paypal=${m.paypal} webhooks=${m.paypalWebhooks} anthropic=${m.anthropic} agent=${m.agent} · simToday=${h.simToday ?? "null"}`;
  if (!h.ok) return fail(`ok:false · ${summary}`);
  return row("health", "GET", path, out, "pass", `ok · ${summary}`);
}

async function checkReset(r: Runner): Promise<{ result: CheckResult; heroPlanId: string | null }> {
  const path = "/api/demo/reset";
  const out = await r.http("POST", path, "application/json");
  const fail = (detail: string) => ({ result: row("demo reset", "POST", path, out, "fail", detail), heroPlanId: null });
  if (out.status !== 200) return fail(httpFailure(out));
  const body = parseJsonBody(out);
  if (!body.ok) return fail(body.detail);
  const parsed = DemoResponseSchema.safeParse(body.value);
  if (!parsed.success) return fail(`not a DemoResponse · ${firstIssue(parsed.error)}`);
  if (!parsed.data.heroPlanId) return fail("reset returned no hero plan (heroPlanId: null)");
  const heroPlanId = parsed.data.heroPlanId;
  return { result: row("demo reset", "POST", path, out, "pass", `hero plan ${heroPlanId}`), heroPlanId };
}

async function checkPlan(r: Runner, heroPlanId: string | null): Promise<CheckResult> {
  const path = "/api/plans/demo";
  const out = await r.http("GET", path, "application/json");
  const fail = (detail: string) => row("hero plan", "GET", path, out, "fail", detail);
  if (out.status !== 200) return fail(httpFailure(out));
  const body = parseJsonBody(out);
  if (!body.ok) return fail(body.detail);
  const parsed = PlanViewResponseSchema.safeParse(body.value);
  if (!parsed.success) return fail(`not a PlanViewResponse · ${firstIssue(parsed.error)}`);
  const { plan, clock, exposure } = parsed.data;
  if (heroPlanId && plan.id !== heroPlanId) {
    return fail(`alias "demo" resolves to ${plan.id}, but reset reported hero plan ${heroPlanId}`);
  }
  const total = formatCents(plan.totalCents, "en");
  const prepaid = formatCents(exposure.prepaidUndeliveredCents, "en");
  return row(
    "hero plan",
    "GET",
    path,
    out,
    "pass",
    `${plan.id} · ${plan.phases.length} phases · ${total} · exposure ${prepaid} · clock ${clock.today}`,
  );
}

async function checkPage(r: Runner, path: string): Promise<CheckResult> {
  const name = `page ${path}`;
  const out = await r.http("GET", path, "text/html");
  const fail = (detail: string) => row(name, "GET", path, out, "fail", detail);
  if (out.status !== 200) return fail(httpFailure(out));
  const type = out.res?.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return fail(`expected HTML, got ${type || "no content-type"}`);
  const size = new TextEncoder().encode(out.text ?? "").length;
  if (size === 0) return fail("empty HTML body");
  let detail = `html · ${(size / 1024).toFixed(1)} KB`;
  const finalUrl = out.res?.url;
  if (finalUrl && out.res?.redirected) {
    const finalPath = finalUrl.startsWith(r.baseUrl) ? finalUrl.slice(r.baseUrl.length) || "/" : finalUrl;
    detail += ` · redirected to ${finalPath}`;
  }
  return row(name, "GET", path, out, "pass", detail);
}

/** Headless Chromium: /gantt-lab must draw Bryntum task bars (client-only, so HTML alone can't tell). */
async function checkGanttInBrowser(
  baseUrl: string,
  timeoutMs: number,
  opts: BrowserCheckOptions,
  now: () => number,
): Promise<CheckResult> {
  const path = "/gantt-lab";
  const started = now();
  const done = (status: number | null, outcome: CheckOutcome, detail: string) =>
    row("bryntum bars", "BROWSER", path, { status, ms: Math.round(now() - started) }, outcome, detail);
  let browser: import("@playwright/test").Browser | undefined;
  try {
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch({ headless: true, executablePath: opts.chromiumPath });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const res = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const status = res?.status() ?? null;
    if (status !== 200) return done(status, "fail", `HTTP ${status ?? "?"} in the browser`);
    const bars = page.locator(BRYNTUM_TASK_SELECTOR);
    await bars.first().waitFor({ state: "visible", timeout: timeoutMs });
    const count = await bars.count();
    const watermark = await page
      .evaluate(() => /trial/i.test(document.body.innerText))
      .catch(() => false);
    if (opts.screenshot) await page.screenshot({ path: opts.screenshot, fullPage: true });
    return done(
      status,
      "pass",
      `${count} task bars (${BRYNTUM_TASK_SELECTOR})${watermark ? " · trial notice visible" : ""}${opts.screenshot ? ` · screenshot ${opts.screenshot}` : ""}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const hint = /Executable doesn't exist|browserType\.launch/i.test(msg)
      ? " · run `npx playwright install chromium` or pass --chromium-path"
      : "";
    return done(null, "fail", oneLine(`${msg.split("\n")[0] ?? msg}${hint}`, 200));
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/** Runs every row in order (each row runs even when an earlier one failed). */
export async function runDemoCheck(baseUrl: string, opts: DemoCheckOptions = {}): Promise<DemoCheckReport> {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) throw new Error(`Invalid base URL: ${baseUrl}`);
  const r = new Runner(normalized, opts);
  const results: CheckResult[] = [];

  results.push(await checkHealth(r));

  let heroPlanId: string | null = null;
  if (opts.skipReset) {
    results.push(row("demo reset", "POST", "/api/demo/reset", { status: null, ms: 0 }, "skip", "skipped (--skip-reset)"));
  } else {
    const reset = await checkReset(r);
    results.push(reset.result);
    heroPlanId = reset.heroPlanId;
  }

  results.push(await checkPlan(r, heroPlanId));
  for (const path of PAGE_PATHS) results.push(await checkPage(r, path));

  if (opts.browser) {
    results.push(
      await checkGanttInBrowser(normalized, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.browser, opts.now ?? (() => performance.now())),
    );
  }

  const passed = results.filter((x) => x.outcome === "pass").length;
  const failed = results.filter((x) => x.outcome === "fail").length;
  const skipped = results.filter((x) => x.outcome === "skip").length;
  return { baseUrl: normalized, results, passed, failed, skipped, ok: failed === 0 };
}

/** The pass/fail table, one string per line. */
export function formatReport(report: DemoCheckReport): string[] {
  const header = ["#", "Check", "Request", "Status", "Time", "Result", "Detail"];
  const rows = report.results.map((x, i) => [
    String(i + 1),
    x.name,
    `${x.method} ${x.path}`,
    x.status === null ? "-" : String(x.status),
    x.outcome === "skip" ? "-" : `${x.ms} ms`,
    x.outcome.toUpperCase(),
    x.detail,
  ]);
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((cells) => cells[c]?.length ?? 0)));
  const fmt = (cells: string[]) =>
    cells
      .map((cell, c) => (c === cells.length - 1 ? cell : cell.padEnd(widths[c] ?? 0)))
      .join("  ")
      .trimEnd();
  const total = report.results.length;
  const verdict = report.ok ? "PASS" : "FAIL";
  return [
    `PayPerPhase demo-check → ${report.baseUrl}`,
    "",
    fmt(header),
    fmt(widths.map((w) => "-".repeat(w))),
    ...rows.map(fmt),
    "",
    `${verdict}: ${report.passed}/${total} passed${report.failed ? `, ${report.failed} failed` : ""}${report.skipped ? `, ${report.skipped} skipped` : ""}`,
  ];
}

export interface MainDeps {
  fetch?: FetchLike;
  log?: (line: string) => void;
  now?: () => number;
}

/** CLI entry. Returns the exit code instead of exiting, so tests can call it in-process. */
export async function main(argv: string[], deps: MainDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  let values: {
    "skip-reset"?: boolean;
    timeout?: string;
    browser?: boolean;
    "chromium-path"?: string;
    screenshot?: string;
    help?: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        "skip-reset": { type: "boolean" },
        timeout: { type: "string" },
        browser: { type: "boolean" },
        "chromium-path": { type: "string" },
        screenshot: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (err) {
    log(`demo-check: ${err instanceof Error ? err.message : String(err)}`);
    log(USAGE);
    return EXIT_USAGE;
  }

  if (values.help) {
    log(USAGE);
    return EXIT_OK;
  }
  if (positionals.length !== 1) {
    log(positionals.length === 0 ? "demo-check: missing <baseUrl>" : "demo-check: expected exactly one <baseUrl>");
    log(USAGE);
    return EXIT_USAGE;
  }
  const baseUrl = normalizeBaseUrl(positionals[0]);
  if (!baseUrl) {
    log(`demo-check: not an http(s) URL: ${positionals[0]}`);
    log(USAGE);
    return EXIT_USAGE;
  }
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (values.timeout !== undefined) {
    timeoutMs = Number(values.timeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      log(`demo-check: --timeout must be a positive integer (ms), got ${values.timeout}`);
      return EXIT_USAGE;
    }
  }
  if ((values["chromium-path"] || values.screenshot) && !values.browser) {
    log("demo-check: --chromium-path and --screenshot need --browser");
    return EXIT_USAGE;
  }

  const report = await runDemoCheck(baseUrl, {
    fetch: deps.fetch,
    now: deps.now,
    timeoutMs,
    skipReset: values["skip-reset"] ?? false,
    browser: values.browser ? { chromiumPath: values["chromium-path"], screenshot: values.screenshot } : false,
  });
  for (const line of formatReport(report)) log(line);
  return report.ok ? EXIT_OK : EXIT_FAILED;
}

// Run only when executed directly (`npx tsx scripts/demo-check.ts …`), never on import.
if (/demo-check\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err);
      process.exitCode = EXIT_FAILED;
    },
  );
}
