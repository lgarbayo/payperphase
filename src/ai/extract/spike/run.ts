/**
 * OWNED BY WP-03. Hour-1 spike: one live Claude extraction of the hero presupuesto, scored against the
 * golden extraction. Results go in docs/spikes/claude-pdf.md.
 *
 *   npx tsx src/ai/extract/spike/run.ts [path/to.pdf] [--runs 3] [--write-pdf out.pdf] [--dry]
 *
 * PDF: the given path, else public/samples/presupuesto-implantes-ribera.pdf (WP-02), else a synthetic
 * stand-in rendered from GOLDEN_RAW_EXTRACTION. Needs ANTHROPIC_API_KEY (.env or environment) unless --dry.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GOLDEN_EXTRACTION } from "@/contracts/fixtures/implantCase";
import { modes, resetEnvCache, serverEnv } from "@/env";
import { EXTRACT_TIMEOUT_MS, liveExtract, sha256Hex } from "../index";
import { renderSyntheticHeroPdf } from "./heroPdf";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadPdf(): Promise<{ bytes: Uint8Array; label: string }> {
  const explicit = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !["--runs", "--write-pdf"].includes(all[i - 1] ?? ""));
  const candidates = [explicit, path.join(process.cwd(), "public/samples/presupuesto-implantes-ribera.pdf")].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      return { bytes: new Uint8Array(await readFile(p)), label: path.relative(process.cwd(), p) };
    } catch {
      /* try the next one */
    }
  }
  return { bytes: await renderSyntheticHeroPdf(), label: "synthetic stand-in (src/ai/extract/spike/heroPdf.ts)" };
}

type Line = (typeof GOLDEN_EXTRACTION.lines)[number];
function scoreLine(got: Line | undefined, want: Line): string[] {
  if (!got) return ["missing"];
  const diffs: string[] = [];
  for (const k of ["code", "qty", "unitPriceCents", "totalCents"] as const) {
    if (got[k] !== want[k]) diffs.push(`${k} ${String(got[k])}≠${String(want[k])}`);
  }
  if (JSON.stringify(got.teeth) !== JSON.stringify(want.teeth)) diffs.push(`teeth [${got.teeth}]≠[${want.teeth}]`);
  if (got.description !== want.description) diffs.push(`description "${got.description}"`);
  return diffs;
}

async function main() {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    /* no .env */
  }
  resetEnvCache();
  const { bytes, label } = await loadPdf();
  const out = arg("--write-pdf");
  if (out) await writeFile(out, bytes);
  console.log(`PDF: ${label} · ${bytes.byteLength} bytes · sha256 ${sha256Hex(bytes)}`);
  if (process.argv.includes("--dry")) return;
  if (modes().anthropic !== "live") {
    console.error("ANTHROPIC_API_KEY is not set (or FORCE_MOCKS=1): nothing to measure. Use --dry to only render the PDF.");
    process.exit(2);
  }

  const env = serverEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const runs = Number(arg("--runs") ?? 1);
  for (let r = 1; r <= runs; r++) {
    const res = await liveExtract(
      client,
      bytes,
      { quoteId: GOLDEN_EXTRACTION.quoteId, pdfSha256: sha256Hex(bytes), extractedAt: new Date().toISOString(), filename: "presupuesto.pdf" },
      EXTRACT_TIMEOUT_MS,
    );
    console.log(`\n## Run ${r} · model ${env.ANTHROPIC_MODEL_EXTRACT} · ${res.latencyMs} ms`);
    if (!res.ok) {
      console.log(`FAILED: ${res.reason}${res.detail ? ` (${res.detail})` : ""}`);
      continue;
    }
    const e = res.extraction;
    const perLine = GOLDEN_EXTRACTION.lines.map((w) => ({ id: w.id, diffs: scoreLine(e.lines.find((g) => g.id === w.id), w) }));
    const exact = perLine.filter((l) => l.diffs.length === 0).length;
    console.log(`served by: ${e.model} · lines ${e.lines.length}/${GOLDEN_EXTRACTION.lines.length} · exact ${exact}/${GOLDEN_EXTRACTION.lines.length}`);
    console.log(
      `checks: Σ ${e.checks.sumOfLinesCents} vs printed ${e.checks.printedTotalCents} → sumMatches ${e.checks.sumMatches} · invalid teeth ${e.checks.invalidTeeth.length} · to review [${e.checks.toReviewLineIds}] · quoteDate ${e.quoteDate}`,
    );
    console.log(`confidence: ${e.lines.map((l) => `${l.id}=${l.confidence}`).join(" ")}`);
    for (const l of perLine.filter((x) => x.diffs.length > 0)) console.log(`  ${l.id}: ${l.diffs.join("; ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
