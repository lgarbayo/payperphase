/**
 * WP-13: render.yaml is the Render Blueprint. No YAML dependency: line and block matching only.
 * (The full file was also validated against Render's published JSON schema; see docs/deploy.md.)
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const renderYaml = readFileSync(path.join(root, "render.yaml"), "utf8");
const envExample = readFileSync(path.join(root, ".env.example"), "utf8");

/** Keys declared in .env.example (`KEY=` lines, comments ignored). */
function envExampleKeys(): string[] {
  return envExample
    .split("\n")
    .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l.trim())?.[1])
    .filter((k): k is string => Boolean(k));
}

interface EnvVarEntry {
  key: string;
  value?: string;
  sync?: string;
  other: string[];
}

/** Parses the `envVars:` list of the (single) service into entries, by indentation. */
function envVarEntries(): EnvVarEntry[] {
  const lines = renderYaml.split("\n");
  const start = lines.findIndex((l) => /^\s+envVars:\s*$/.test(l));
  expect(start, "render.yaml has an envVars: block").toBeGreaterThan(-1);
  const blockIndent = /^(\s*)/.exec(lines[start] ?? "")?.[1]?.length ?? 0;
  const entries: EnvVarEntry[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = /^(\s*)/.exec(line)?.[1]?.length ?? 0;
    if (indent <= blockIndent) break; // next service-level key
    const item = /^\s*-\s+key:\s*(\S+)\s*$/.exec(line);
    if (item?.[1]) {
      entries.push({ key: item[1], other: [] });
      continue;
    }
    const prop = /^\s*([A-Za-z]+):\s*(.*?)\s*$/.exec(line);
    const current = entries.at(-1);
    if (!prop || !current) throw new Error(`Unexpected envVars line: ${line}`);
    const [, name, raw = ""] = prop;
    const value = raw.replace(/^"(.*)"$/, "$1");
    if (name === "value") current.value = value;
    else if (name === "sync") current.sync = value;
    else current.other.push(`${name}: ${value}`);
  }
  return entries;
}

/** Values that must never be committed: Render asks for them at Blueprint creation. */
const SECRET_KEYS = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
  "DEMO_PATIENT_EMAIL",
  "DEMO_MERCHANT_EMAIL",
  "ANTHROPIC_API_KEY",
  "BRYNTUM_NPM_TOKEN",
];

describe("render.yaml (Render Blueprint)", () => {
  it("declares every .env.example key", () => {
    const keys = envExampleKeys();
    expect(keys.length).toBeGreaterThanOrEqual(20); // sanity: the parser found the file's keys
    const declared = new Set(envVarEntries().map((e) => e.key));
    const missing = keys.filter((k) => !declared.has(k));
    expect(missing, `keys missing from render.yaml: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares each env var once, as a plain value or sync:false", () => {
    const entries = envVarEntries();
    const keys = entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of entries) {
      expect(e.other, `${e.key} uses an unexpected property`).toEqual([]);
      expect(e.value !== undefined || e.sync === "false", `${e.key} has neither value nor sync:false`).toBe(true);
    }
  });

  it("never commits a secret: secrets are sync:false with no value", () => {
    const byKey = new Map(envVarEntries().map((e) => [e.key, e]));
    for (const key of SECRET_KEYS) {
      const e = byKey.get(key);
      expect(e, `${key} declared`).toBeDefined();
      expect(e?.sync, `${key} sync`).toBe("false");
      expect(e?.value, `${key} must not carry a value`).toBeUndefined();
    }
    // No credential-looking literal anywhere in the file (PayPal ids/secrets are 40+ char tokens).
    expect(renderYaml).not.toMatch(/sk-ant-|[A-Za-z0-9_-]{40,}/);
  });

  it("is a Starter web service on Node 22 in Frankfurt, always on", () => {
    expect(renderYaml).toMatch(/^services:\s*$/m);
    expect(renderYaml).toMatch(/^\s+- type: web\s*$/m);
    expect(renderYaml).toMatch(/^\s+name: payperphase\s*$/m);
    expect(renderYaml).toMatch(/^\s+runtime: node\s*$/m);
    expect(renderYaml).toMatch(/^\s+region: frankfurt\s*$/m);
    expect(renderYaml).toMatch(/^\s+plan: starter\s*$/m);
    expect(renderYaml).not.toMatch(/^\s+plan: free\s*$/m);
    const byKey = new Map(envVarEntries().map((e) => [e.key, e]));
    expect(byKey.get("NODE_VERSION")?.value).toBe("22");
    expect(byKey.get("NEXT_TELEMETRY_DISABLED")?.value).toBe("1");
  });

  it("builds with the build script, starts with npm start, health-checks /api/health and auto-deploys main", () => {
    expect(renderYaml).toMatch(/^\s+buildCommand: \.\/scripts\/render-build\.sh\s*$/m);
    expect(renderYaml).toMatch(/^\s+startCommand: npm start\s*$/m);
    expect(renderYaml).toMatch(/^\s+healthCheckPath: \/api\/health\s*$/m);
    expect(renderYaml).toMatch(/^\s+autoDeploy: true\s*$/m);
    expect(renderYaml).toMatch(/^\s+branch: main\s*$/m);
  });

  it("mounts a 1 GB persistent disk at /var/data and points DATA_DIR at it", () => {
    expect(renderYaml).toMatch(/^\s+disk:\s*\n\s+name: \S+\s*\n\s+mountPath: \/var\/data\s*\n\s+sizeGB: 1\s*$/m);
    const dataDir = envVarEntries().find((e) => e.key === "DATA_DIR");
    expect(dataDir?.value).toBe("/var/data");
  });

  it("keeps non-secret defaults in line with .env.example (except DATA_DIR, which is the disk)", () => {
    const example = new Map(
      envExample
        .split("\n")
        .map((l) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(l.trim()))
        .filter((m): m is RegExpExecArray => Boolean(m))
        .map((m) => [m[1] as string, m[2] ?? ""]),
    );
    for (const e of envVarEntries()) {
      if (e.value === undefined || e.key === "DATA_DIR" || !example.has(e.key)) continue;
      expect(e.value, `${e.key} differs from .env.example`).toBe(example.get(e.key));
    }
  });

  it("does not deploy app code changes through ignored paths", () => {
    const ignored = [...renderYaml.matchAll(/^\s+- "([^"]+)"\s*$/gm)].map((m) => m[1] ?? "");
    for (const glob of ignored) {
      expect(glob, "only docs/fleet/tests/markdown may skip a deploy").toMatch(/^(docs|fleet|tests)\/\*\*$|^\*\*\/\*\.md$/);
    }
  });

  it("ships an executable build script that needs no secret by default", () => {
    const script = path.join(root, "scripts/render-build.sh");
    const text = readFileSync(script, "utf8");
    expect(text.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(text).toMatch(/npm ci/);
    expect(text).toMatch(/npm run build/);
    const mode = statSync(script).mode;
    expect(mode & 0o111, "render-build.sh must be executable (git mode 100755)").not.toBe(0);
  });
});

describe("render.free.yaml (free-plan fallback)", () => {
  const free = readFileSync(path.join(root, "render.free.yaml"), "utf8");
  const strip = (s: string) =>
    s
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");

  it("is plan: free with no disk, and a DATA_DIR that is writable without one", () => {
    expect(free).toMatch(/^\s+plan:\s*free\s*$/m);
    expect(free).not.toMatch(/^\s+disk:/m);
    expect(free).toMatch(/key:\s*DATA_DIR\s*\n\s+value:\s*\/tmp\//);
  });

  it("is otherwise identical to render.yaml (same build, start, health check, env vars)", () => {
    const normalise = (s: string) =>
      strip(s)
        .replace(/plan:\s*\w+/, "plan: X")
        .replace(/\n\s+disk:\n(\s{6,}.*\n)+/, "\n")
        .replace(/value:\s*(\/var\/data|\/tmp\/payperphase-data)/, "value: DIR");
    expect(normalise(free)).toBe(normalise(renderYaml));
  });
});
