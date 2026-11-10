/** OWNED BY WP-03. POST /api/extract — multipart {file} or JSON {sampleId}. SCAFFOLD STUB. */
import type { ExtractResponse } from "@/contracts";
import { extractQuote } from "@/ai/extract";
import { json } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  void req;
  const extraction = await extractQuote({ sampleId: "implant-ribera" });
  await store.saveExtraction(extraction);
  const body: ExtractResponse = { extraction };
  return json(body);
}
