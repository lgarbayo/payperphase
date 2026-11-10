/**
 * OWNED BY WP-03. POST /api/extract
 *   multipart/form-data { file: PDF ≤ 10 MB }  or  JSON { sampleId }
 * → stores the ExtractionResult and returns ExtractResponse. Errors: { error: { code, message } }.
 */
import { ExtractJsonRequestSchema, type ExtractResponse } from "@/contracts";
import { ExtractError, extractQuote, MAX_PDF_BYTES, type ExtractInput } from "@/ai/extract";
import { apiError, json, parseJson } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Live extraction can take up to the 45 s extraction timeout.
export const maxDuration = 60;

async function readInput(req: Request): Promise<{ ok: true; input: ExtractInput } | { ok: false; response: Response }> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { ok: false, response: apiError("BAD_FORM", "Could not read the multipart body.", 400) };
    }
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return { ok: false, response: apiError("VALIDATION", 'Attach the PDF as the "file" field.', 422) };
    }
    if (file.size > MAX_PDF_BYTES) {
      return { ok: false, response: apiError("FILE_TOO_LARGE", "The PDF is larger than 10 MB.", 413) };
    }
    const pdf = new Uint8Array(await file.arrayBuffer());
    return { ok: true, input: { pdf, filename: file.name || undefined } };
  }
  if (type.includes("application/json")) {
    const parsed = await parseJson(req, ExtractJsonRequestSchema);
    if (!parsed.ok) return parsed;
    return { ok: true, input: { sampleId: parsed.data.sampleId } };
  }
  return {
    ok: false,
    response: apiError("UNSUPPORTED_MEDIA_TYPE", "Send multipart/form-data with a PDF, or JSON { sampleId }.", 415),
  };
}

export async function POST(req: Request) {
  const read = await readInput(req);
  if (!read.ok) return read.response;
  try {
    const extraction = await extractQuote(read.input);
    await store.saveExtraction(extraction);
    const body: ExtractResponse = { extraction };
    return json(body);
  } catch (error) {
    if (error instanceof ExtractError) return apiError(error.code, error.message, error.status);
    console.error("[api/extract] unexpected failure", error);
    return apiError("INTERNAL", "Extraction failed unexpectedly.", 500);
  }
}
