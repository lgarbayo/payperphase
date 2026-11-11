/**
 * WP-13: scripts/render-build.sh, run for real against a fake `npm` on PATH in a temp repo copy.
 * Proves the default path needs no secret, the Bryntum registry fallback only kicks in when the
 * public install fails AND BRYNTUM_NPM_TOKEN is set, and the token never lands on disk.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const hasBash = process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;

const FAKE_NPM = `#!/usr/bin/env bash
# Records every call; "ci" fails when FAKE_NPM_CI_FAIL=1, "install" fails when FAKE_NPM_INSTALL_FAIL=1
# (only the first, lockfile-respecting attempt when FAKE_NPM_INSTALL_FAIL=first).
echo "$*" >> "$FAKE_NPM_LOG"
case "$1" in
  --version) echo "10.0.0-fake" ;;
  ci) [[ "\${FAKE_NPM_CI_FAIL:-0}" == "1" ]] && { echo "npm ERR! 404 @bryntum/gantt-trial" >&2; exit 1; } ;;
  install)
    if [[ "\${FAKE_NPM_INSTALL_FAIL:-0}" == "1" ]]; then exit 1; fi
    if [[ "\${FAKE_NPM_INSTALL_FAIL:-0}" == "first" && "$*" != *--no-package-lock* ]]; then exit 1; fi ;;
  run)
    echo "DATA_DIR=$DATA_DIR" >> "$FAKE_NPM_LOG"
    echo "NEXT_TELEMETRY_DISABLED=$NEXT_TELEMETRY_DISABLED" >> "$FAKE_NPM_LOG"
    [[ -d "$DATA_DIR" ]] && echo "DATA_DIR_EXISTS" >> "$FAKE_NPM_LOG" ;;
esac
exit 0
`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "ppp-render-build-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "scripts"));
  mkdirSync(path.join(dir, "bin"));
  copyFileSync(path.join(root, "scripts/render-build.sh"), path.join(dir, "scripts/render-build.sh"));
  chmodSync(path.join(dir, "scripts/render-build.sh"), 0o755);
  copyFileSync(path.join(root, ".npmrc"), path.join(dir, ".npmrc"));
  writeFileSync(path.join(dir, "bin/npm"), FAKE_NPM);
  chmodSync(path.join(dir, "bin/npm"), 0o755);
  return dir;
}

function run(dir: string, env: Record<string, string> = {}) {
  const log = path.join(dir, "npm.log");
  const res = spawnSync("bash", [path.join(dir, "scripts/render-build.sh")], {
    cwd: tmpdir(), // the script must cd to its own repo root
    encoding: "utf8",
    env: {
      PATH: `${path.join(dir, "bin")}:${process.env.PATH ?? ""}`,
      HOME: dir,
      FAKE_NPM_LOG: log,
      ...env,
    } as unknown as NodeJS.ProcessEnv,
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  return { status: res.status, out: `${res.stdout}${res.stderr}`, calls, npmrc: readFileSync(path.join(dir, ".npmrc"), "utf8") };
}

describe.skipIf(!hasBash)("scripts/render-build.sh", () => {
  it("default path: npm ci with dev deps, then next build, no secret needed, .npmrc untouched", () => {
    const dir = setup();
    const before = readFileSync(path.join(dir, ".npmrc"), "utf8");
    const r = run(dir);
    expect(r.status, r.out).toBe(0);
    expect(r.calls[0]).toBe("--version");
    expect(r.calls).toContain("ci --include=dev --no-audit --no-fund");
    expect(r.calls).toContain("run build");
    expect(r.calls.some((c) => c.startsWith("install"))).toBe(false);
    expect(r.npmrc).toBe(before);
    expect(r.out).toContain("installed from the public npm registry");
  });

  it("builds with a throwaway DATA_DIR (never the runtime disk) and telemetry off", () => {
    const dir = setup();
    const r = run(dir, { DATA_DIR: "/var/data" });
    expect(r.status, r.out).toBe(0);
    const dataDirLine = r.calls.find((c) => c.startsWith("DATA_DIR="));
    expect(dataDirLine).toBeDefined();
    expect(dataDirLine).not.toBe("DATA_DIR=/var/data");
    expect(r.calls).toContain("DATA_DIR_EXISTS");
    expect(r.calls).toContain("NEXT_TELEMETRY_DISABLED=1");
    // The temp dir is cleaned up afterwards.
    expect(existsSync((dataDirLine ?? "").slice("DATA_DIR=".length))).toBe(false);
  });

  it("fails without touching .npmrc when npm ci fails and no BRYNTUM_NPM_TOKEN is set", () => {
    const dir = setup();
    const before = readFileSync(path.join(dir, ".npmrc"), "utf8");
    const r = run(dir, { FAKE_NPM_CI_FAIL: "1" });
    expect(r.status).not.toBe(0);
    expect(r.calls).not.toContain("run build");
    expect(r.npmrc).toBe(before);
    expect(r.out).toContain("BRYNTUM_NPM_TOKEN is not set");
  });

  it("fallback: switches @bryntum to npm.bryntum.com without writing the token, then builds", () => {
    const dir = setup();
    const token = "bryntum-secret-token-value";
    const r = run(dir, { FAKE_NPM_CI_FAIL: "1", BRYNTUM_NPM_TOKEN: token });
    expect(r.status, r.out).toBe(0);
    expect(r.npmrc).toMatch(/^@bryntum:registry=https:\/\/npm\.bryntum\.com$/m);
    expect(r.npmrc).toContain("//npm.bryntum.com/:_authToken=${BRYNTUM_NPM_TOKEN}");
    expect(r.npmrc).not.toContain(token);
    expect(r.out).not.toContain(token);
    expect(r.calls).toContain("install --include=dev --no-audit --no-fund --no-save");
    expect(r.calls).toContain("run build");
  });

  it("fallback re-resolves without the lockfile when the lockfile install fails, and is idempotent", () => {
    const dir = setup();
    const env = { FAKE_NPM_CI_FAIL: "1", FAKE_NPM_INSTALL_FAIL: "first", BRYNTUM_NPM_TOKEN: "t" };
    const r1 = run(dir, env);
    expect(r1.status, r1.out).toBe(0);
    expect(r1.calls).toContain("install --include=dev --no-audit --no-fund --no-save --no-package-lock");
    const r2 = run(dir, env);
    expect(r2.status, r2.out).toBe(0);
    expect(r2.npmrc.match(/^@bryntum:registry=/gm)?.length).toBe(1);
  });

  it("fails when even the Bryntum registry install fails", () => {
    const dir = setup();
    const r = run(dir, { FAKE_NPM_CI_FAIL: "1", FAKE_NPM_INSTALL_FAIL: "1", BRYNTUM_NPM_TOKEN: "t" });
    expect(r.status).not.toBe(0);
    expect(r.calls).not.toContain("run build");
  });
});
