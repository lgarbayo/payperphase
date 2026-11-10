import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** The engine is pure and isomorphic: no clock, no randomness, no I/O, no Node-only or React imports. */
const ENGINE_DIR = path.resolve(__dirname, "../../src/engine");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Strip comments so documentation may mention what the code must never do. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const FORBIDDEN: [RegExp, string][] = [
  [/\bDate\.now\s*\(/, "Date.now()"],
  [/\bnew\s+Date\s*\(\s*\)/, "new Date() without arguments"],
  [/\bnew\s+Date\b/, "new Date (use src/lib/dates helpers)"],
  [/\bMath\.random\s*\(/, "Math.random()"],
  [/\bperformance\.now\s*\(/, "performance.now()"],
  [/\bcrypto\./, "crypto"],
  [/\bfetch\s*\(/, "fetch()"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, "browser storage"],
  [/\bprocess\./, "process.*"],
  [/\brequire\s*\(/, "require()"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/\bconsole\./, "console.*"],
  [/\b(setTimeout|setInterval)\b/, "timers"],
];

const ALLOWED_IMPORTS = [/^@\/contracts$/, /^@\/lib\/dates$/, /^@\/lib\/money$/, /^\.\/[a-z]+$/];

describe("engine purity", () => {
  const files = sources(ENGINE_DIR);

  it("has the expected modules", () => {
    const names = files.map((f) => path.basename(f)).sort();
    for (const m of ["catalog", "phasing", "schedule", "fit", "whatif", "payments", "exposure", "edit", "diff", "index"]) {
      expect(names).toContain(`${m}.ts`);
    }
  });

  it.each(files.map((f) => [path.relative(ENGINE_DIR, f), f]))("%s uses no clock, randomness or I/O", (_name, file) => {
    const src = code(readFileSync(file, "utf8"));
    const hits = FORBIDDEN.filter(([re]) => re.test(src)).map(([, label]) => label);
    expect(hits).toEqual([]);
  });

  it.each(files.map((f) => [path.relative(ENGINE_DIR, f), f]))("%s imports only contracts, date/money helpers and siblings", (_name, file) => {
    const src = code(readFileSync(file, "utf8"));
    const specifiers = [...src.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]!);
    const bad = specifiers.filter((s) => !ALLOWED_IMPORTS.some((re) => re.test(s)));
    expect(bad).toEqual([]);
  });

  it("the comment stripper does not hide real code", () => {
    expect(code('const u = "https://x"; Date.now(); // ok')).toContain("Date.now()");
    expect(code("/* Date.now() */ const a = 1;")).not.toContain("Date.now");
  });
});
