/**
 * OWNED BY WP-16. Playwright config for `npm run e2e` (the browser smoke of the demo path).
 *
 * The suite never touches live services: the web server is a production build started with
 * FORCE_MOCKS=1 (PayPal and Anthropic are mocked), a fresh temporary DATA_DIR and a free port.
 *
 *   npm run e2e                      build, start, run, stop
 *   E2E_SKIP_BUILD=1 npm run e2e     reuse the existing .next build (faster when only tests changed)
 *   E2E_PORT=3200 npm run e2e        preferred port (default 3100; a free one is picked if it is taken)
 *   E2E_CHROMIUM_PATH=/path/chrome   use another Chromium binary
 *
 * Config files are evaluated again in every worker process, so the port and the data dir are
 * chosen once, written to process.env and inherited by the workers.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/** Asks a child Node process for a free TCP port (tries `preferred` first, then any port). */
function freePort(preferred: number): number {
  const probe = `
    const net = require("node:net");
    const want = Number(process.argv[1]);
    const take = (port, done) => {
      const s = net.createServer();
      s.once("error", () => done(null));
      s.listen(port, "127.0.0.1", () => { const p = s.address().port; s.close(() => done(p)); });
    };
    take(want, (p) => p ? console.log(p) : take(0, (q) => console.log(q)));
  `;
  const out = execFileSync(process.execPath, ["-e", probe, String(preferred)], { encoding: "utf8" });
  const port = Number(out.trim());
  if (!Number.isInteger(port) || port <= 0) throw new Error(`could not find a free port (got "${out.trim()}")`);
  return port;
}

if (!process.env.E2E_BASE_URL) {
  const preferred = Number(process.env.E2E_PORT) || 3100;
  const port = freePort(preferred);
  process.env.E2E_PORT = String(port);
  process.env.E2E_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.E2E_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ppp-e2e-"));
}

const baseURL = process.env.E2E_BASE_URL as string;
const port = process.env.E2E_PORT as string;
const startCommand = process.env.E2E_SKIP_BUILD === "1" ? "npm start" : "npm run build && npm start";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results",
  // One ordered story on shared server state (the hero plan): never parallel, never retried silently.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 150_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: startCommand,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      FORCE_MOCKS: "1",
      DATA_DIR: process.env.E2E_DATA_DIR as string,
      PORT: port,
      PUBLIC_BASE_URL: baseURL,
      // A leaked key must never reach a live endpoint from this suite.
      ANTHROPIC_API_KEY: "",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
      PAYPAL_WEBHOOK_ID: "",
    },
  },
});
