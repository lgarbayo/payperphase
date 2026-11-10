/**
 * OWNED BY WP-02. `npm run pdfs`: renders the synthetic presupuestos into public/samples/ and rewrites
 * data/seed/sample-hashes.json with their sha256 (the cache key for WP-03's extraction fallback).
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { QUOTE_DOCUMENTS, renderQuotePdf } from "./render";

async function main() {
  const root = process.cwd();
  const outDir = path.join(root, "public/samples");
  await mkdir(outDir, { recursive: true });
  const hashes: Record<string, string> = {};
  for (const doc of QUOTE_DOCUMENTS) {
    const bytes = await renderQuotePdf(doc);
    await writeFile(path.join(outDir, doc.fileName), bytes);
    hashes[doc.id] = createHash("sha256").update(bytes).digest("hex");
    console.log(`public/samples/${doc.fileName}  ${bytes.byteLength} bytes  sha256 ${hashes[doc.id]}`);
  }
  await writeFile(path.join(root, "data/seed/sample-hashes.json"), `${JSON.stringify(hashes, null, 2)}\n`);
  console.log("data/seed/sample-hashes.json updated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
