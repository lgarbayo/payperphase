/**
 * Quote extraction: PDF → Claude (structured output RawExtraction) → deterministic
 * parsing/validation → ExtractionResult. The LLM never produces cents or dates.
 *
 * Live when ANTHROPIC_API_KEY is set. Without a key, on a 45 s timeout, a refusal or any API failure, a
 * known sample (by PDF sha256 or sample id, both defined by the seed data) falls back to its golden
 * extraction labelled source:"cached". An unknown PDF without a live result is a typed ExtractError.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { RawExtractionSchema, type ExtractionResult } from "@/contracts";
import { serverEnv } from "@/env";
import { nowIso } from "@/lib/http";
import { cachedExtractionBySampleId, cachedExtractionBySha, SAMPLE_PDFS } from "@data/seed";
import { callStructured, defaultClaudeClient, type ClaudeClient, type StructuredFailure } from "./claude";
import { normalizeExtraction } from "./normalize";
import { EXTRACTION_INSTRUCTION, EXTRACTION_SYSTEM } from "./prompt";

export { parseQuantity, parseSpanishDate, parseSpanishMoney } from "./parse";
export { LOW_CONFIDENCE_THRESHOLD, normalizeExtraction, type NormalizeMeta } from "./normalize";

export type ExtractInput = { pdf: Uint8Array; filename?: string } | { sampleId: string };

export interface ExtractOptions {
  /** undefined → live client from env (null in mock mode); null → force "no key"; object → that client. */
  client?: ClaudeClient | null;
  /** Default 45 s. */
  timeoutMs?: number;
  /** Wall clock for extractedAt (tests). */
  now?: () => string;
  /** Where sample PDFs live (default <cwd>/public). */
  publicDir?: string;
}

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const EXTRACT_TIMEOUT_MS = 45_000;

export type ExtractErrorCode =
  | "NO_LIVE_EXTRACTION"
  | "UNKNOWN_SAMPLE"
  | "EMPTY_FILE"
  | "NOT_A_PDF"
  | "FILE_TOO_LARGE"
  | "EXTRACTION_REFUSED"
  | "EXTRACTION_TIMEOUT"
  | "EXTRACTION_FAILED"
  | "NO_LINES_FOUND";

/** A failure the route turns into `{ error: { code, message } }` with `status`. */
export class ExtractError extends Error {
  constructor(
    readonly code: ExtractErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

const TRY_A_SAMPLE = "Try one of the sample quotes instead.";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** "%PDF-" within the first 1 KiB, as the PDF spec allows. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

export function assertPdf(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new ExtractError("EMPTY_FILE", 400, "The uploaded file is empty.");
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new ExtractError("FILE_TOO_LARGE", 413, "The PDF is larger than 10 MB.");
  }
  if (!looksLikePdf(bytes)) throw new ExtractError("NOT_A_PDF", 415, "The uploaded file is not a PDF.");
}

function asCached(golden: ExtractionResult, extractedAt: string, pdfSha256?: string): ExtractionResult {
  return { ...golden, source: "cached", model: null, extractedAt, ...(pdfSha256 ? { pdfSha256 } : {}) };
}

function failureError(reason: StructuredFailure, detail: string | null): ExtractError {
  switch (reason) {
    case "refusal":
      return new ExtractError("EXTRACTION_REFUSED", 422, `Claude declined to read this PDF. ${TRY_A_SAMPLE}`);
    case "timeout":
      return new ExtractError("EXTRACTION_TIMEOUT", 504, `Extraction took longer than 45 seconds. ${TRY_A_SAMPLE}`);
    default:
      return new ExtractError(
        "EXTRACTION_FAILED",
        502,
        `Extraction failed (${reason}${detail ? `: ${detail.slice(0, 120)}` : ""}). ${TRY_A_SAMPLE}`,
      );
  }
}

/** One live extraction with no fallback (also used by the spike script to measure latency/accuracy). */
export async function liveExtract(
  client: ClaudeClient,
  pdf: Uint8Array,
  meta: { quoteId: string; pdfSha256: string; extractedAt: string; filename?: string },
  timeoutMs: number,
) {
  const model = serverEnv().ANTHROPIC_MODEL_EXTRACT;
  const result = await callStructured(client, {
    model,
    system: EXTRACTION_SYSTEM,
    content: [
      // PDF document block first, instruction text after it.
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") },
        ...(meta.filename ? { title: meta.filename } : {}),
      },
      { type: "text", text: EXTRACTION_INSTRUCTION },
    ],
    schema: RawExtractionSchema,
    effort: "low",
    timeoutMs,
  });
  if (!result.ok) {
    console.warn(`[extract] live extraction unavailable: ${result.reason}${result.detail ? ` (${result.detail})` : ""}`);
    return result;
  }
  try {
    const extraction = normalizeExtraction(result.data, {
      quoteId: meta.quoteId,
      pdfSha256: meta.pdfSha256,
      source: "live",
      model: result.model,
      extractedAt: meta.extractedAt,
    });
    return { ok: true as const, extraction, latencyMs: result.latencyMs };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : String(error);
    console.warn(`[extract] live extraction failed contract validation: ${detail}`);
    return { ok: false as const, reason: "unparseable" as const, detail, latencyMs: result.latencyMs };
  }
}

async function readSamplePdf(publicDir: string, samplePath: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path.join(publicDir, samplePath.replace(/^\/+/, ""))));
  } catch {
    return null; // Not generated yet (scripts/pdfs), or the deploy doesn't ship it.
  }
}

export async function extractQuote(input: ExtractInput, opts: ExtractOptions = {}): Promise<ExtractionResult> {
  const client = opts.client === undefined ? defaultClaudeClient() : opts.client;
  const timeoutMs = opts.timeoutMs ?? EXTRACT_TIMEOUT_MS;
  const extractedAt = (opts.now ?? nowIso)();

  if ("sampleId" in input) {
    const golden = cachedExtractionBySampleId(input.sampleId);
    if (!golden) throw new ExtractError("UNKNOWN_SAMPLE", 404, `Unknown sample "${input.sampleId}".`);
    const sample = SAMPLE_PDFS.find((s) => s.id === input.sampleId);
    const bytes = client && sample ? await readSamplePdf(opts.publicDir ?? path.join(process.cwd(), "public"), sample.path) : null;
    if (client && bytes && looksLikePdf(bytes)) {
      const pdfSha256 = sha256Hex(bytes);
      const live = await liveExtract(
        client,
        bytes,
        { quoteId: golden.quoteId, pdfSha256, extractedAt, filename: path.basename(sample!.path) },
        timeoutMs,
      );
      if (live.ok && live.extraction.lines.length > 0) return live.extraction;
      return asCached(golden, extractedAt, pdfSha256);
    }
    return asCached(golden, extractedAt);
  }

  assertPdf(input.pdf);
  const pdfSha256 = sha256Hex(input.pdf);
  const known = cachedExtractionBySha(pdfSha256);

  if (!client) {
    if (known) return asCached(known, extractedAt, pdfSha256);
    throw new ExtractError(
      "NO_LIVE_EXTRACTION",
      422,
      `Live extraction is off (no Anthropic key) and this PDF is not one of the samples. ${TRY_A_SAMPLE}`,
    );
  }

  const live = await liveExtract(
    client,
    input.pdf,
    { quoteId: known?.quoteId ?? `q_${pdfSha256.slice(0, 16)}`, pdfSha256, extractedAt, filename: input.filename },
    timeoutMs,
  );
  if (live.ok && live.extraction.lines.length > 0) return live.extraction;
  if (known) return asCached(known, extractedAt, pdfSha256);
  if (live.ok) throw new ExtractError("NO_LINES_FOUND", 422, `No treatment lines found in this PDF. ${TRY_A_SAMPLE}`);
  throw failureError(live.reason, live.detail);
}
