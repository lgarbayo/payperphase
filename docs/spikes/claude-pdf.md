# Spike: Claude PDF extraction (WP-03)

**Question.** Can Claude Sonnet 5.5 read the hero presupuesto (a base64 PDF document block) into `RawExtraction` through structured outputs, fast and accurately enough for beat B1, with code doing every money, date and tooth check?

**Status: live run passed on 2026-11-11 00:30 CET** (acceptance criterion 8 met). Claude Sonnet 5.5 read the stand-in hero PDF exactly: 12 of 12 lines, Σ = printed total, 0 invalid teeth, 8.5 s. The API accepted the request as sent (no 400, no self-heal retry). Note for the video: every line came back with confidence ≥ 0.97, so the live check bar shows "0 to review" while the cached golden extraction shows "1 to review" (L12 = 0.74). The script must say which one is on screen.

Before the live run, what could not be proven without a key was whether the API *accepts* the request (the `fallbacks` field and beta header for this account, and the compiled schema), and the latency and accuracy at `effort: "low"`. What is proven offline: what is sent, how every failure is handled, and that the self-heal covers any 400 the fallback opt-in could cause (see [What was verified offline](#what-was-verified-offline)). If the live call fails anyway, the demo is not broken: the known hero PDF and `sampleId` return the golden extraction labelled `source: "cached"`. An *unknown* uploaded PDF, though, gets a 502 `EXTRACTION_FAILED` instead of a live read.

## Live-run checklist (for whoever has the key)

1. Put a sandbox key in `.env` (`ANTHROPIC_API_KEY=sk-ant-...`). Never commit it.
2. `npx tsx src/ai/extract/spike/run.ts --runs 3` (it uses WP-02's hero PDF if `public/samples/presupuesto-implantes-ribera.pdf` exists, otherwise the stand-in).
3. Fill one row per run in [Results](#results-live) with the model served, latency, exact lines out of 12, Σ check, lines to review and any log line starting with `[claude]` or `[extract]`.
4. If run 1 logs `[claude] request with server-side fallback rejected (400: …)` and then succeeds, the account doesn't accept the fallback opt-in. Record the 400 text here. Nothing needs to change in code: every call already self-heals within the same 45 s budget, at the cost of one fast 400.
5. If a run fails with `api_error (400: …)` after that retry, the 400 is not about fallbacks (schema or PDF). Record the message and fix the request before the demo.

## How to run

```bash
# .env: ANTHROPIC_API_KEY=sk-ant-... (ANTHROPIC_MODEL_EXTRACT defaults to claude-sonnet-5-5)
npx tsx src/ai/extract/spike/run.ts --runs 3                      # hero PDF from WP-02 if present, else the stand-in
npx tsx src/ai/extract/spike/run.ts path/to/other.pdf             # any PDF
npx tsx src/ai/extract/spike/run.ts --dry --write-pdf hero.pdf    # just render the stand-in, no call
```

The script calls the same `liveExtract()` the route uses, with no cached fallback, and scores each line against `GOLDEN_EXTRACTION` (code, teeth, qty, unit, total, description). It prints latency, the model that served the answer, the Σ check, the lines to review and every mismatch.

**Which PDF.** `public/samples/presupuesto-implantes-ribera.pdf` (WP-02) is used when it exists. It was added to the repository just after the live run below, which therefore used the stand-in. Without it, the script renders a stand-in from `GOLDEN_RAW_EXTRACTION` with pdf-lib (`src/ai/extract/spike/heroPdf.ts`): A4, a 12-line table, `4.070,00 €` total, Helvetica. It has fixed dates, so its sha256 is reproducible (`0ba96fb2…bd2dd`, 3,555 bytes).

## Results (live)

| Run | PDF | Model served | Latency | Lines exact (of 12) | Σ = printed | To review | Notes |
|---|---|---|---|---|---|---|---|
| 1 | stand-in (sha256 0ba96fb2…bd2dd) | claude-sonnet-5-5 | 8,475 ms | 12 | yes (407000 = 407000) | none (L12 = 0.97) | run by the integrator with `npx tsx src/ai/extract/spike/run.ts --runs 1`; quoteDate 2026-11-12; the hero PDF (WP-02) now exists; no live run on it is recorded here |

Acceptance for the demo: at least 11 of 12 lines exact, `sumMatches: true`, `L12` (confidence < 0.8) the only line to review, and p50 latency under 20 s. If latency is too high, keep `effort: "low"` and record the video on the labelled cached extraction, as SPEC cut item 9 allows.

## Request shape (as sent)

```ts
client.messages.parse(
  {
    model: serverEnv().ANTHROPIC_MODEL_EXTRACT,          // claude-sonnet-5-5, from env
    max_tokens: 16000,
    system: EXTRACTION_SYSTEM,                            // src/ai/extract/prompt.ts
    messages: [{ role: "user", content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data } , title },
      { type: "text", text: EXTRACTION_INSTRUCTION },     // after the PDF block
    ]}],
    output_config: { format: zodOutputFormat(RawExtractionSchema), effort: "low" },
    fallbacks: "default",
  },
  { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" }, signal, timeout: 45_000 },
);
```

- No `tool_choice` and no sampling parameters (`temperature`/`top_p` are rejected on current models). Adaptive thinking stays at its default.
- `effort: "low"`: extraction is copying plus a closed-list mapping, and the clinic waits on it. This is the first thing to raise to `medium` if the live run shows wrong codes.
- `stop_reason === "refusal"` is checked before `parsed_output` is read. `max_tokens` is treated as a failure.
- The 45 s budget covers everything: one `AbortController` plus a race timer, with SDK `maxRetries: 1` inside that budget.

## What was verified offline

1. **Schema the API receives.** `zodOutputFormat(RawExtractionSchema)` produces `type: object`, `additionalProperties: false` and a full `required` list at both levels. `code` is a 28-value `enum`. Zod 4's `.int()` adds ±2^53−1 bounds, which structured outputs do not support. The SDK (1.7.0) moves them into `description` (`"{minimum: …, maximum: …}"`) rather than sending `minimum`/`maximum`, so nothing should be rejected. `RawExtractionSchema` has no regex, min or max of its own, as the contract intends. Confirm on the first live call that no 400 mentions the schema.
2. **`messages.parse` behaviour.** The non-beta `parse` parses every text block. If a block is not valid JSON for the schema, it throws `AnthropicError("Failed to parse structured output…")`. `callStructured` maps that to `unparseable`, and the extraction then falls back to cached for a known PDF. An empty `content` on refusal parses to `parsed_output: null` without throwing, and the refusal branch runs first.
3. **Server-side fallback.** `fallbacks` exists only in the SDK's beta types. We send the form the claude-api skill documents for `claude-sonnet-5-5` (`server-side-fallback-2026-07-01` + `fallbacks: "default"`) on the documented `messages.parse` call. The wire request is the same as `client.beta.messages.*` with `betas`, except that the beta helper also adds a `structured-outputs-2025-12-15` header we don't need. On Sonnet 5.5 the default chain retries only `cyber` and `frontier_llm` declines (on `claude-sonnet-5`). Any other decline falls through to our cached golden extraction. **Self-heal:** if the account or platform rejects the opt-in, `callStructured` retries once without the `fallbacks` field and without the beta header, inside the same 45 s budget. That 400 might be about the field, or about a beta the org isn't enabled for (the skill documents the latter as a 400), and its wording isn't stable, so the retry fires on *any* 400 to a fallback-enabled request. It does not depend on the message saying "fallback". A 400 with another cause fails again on the retry and surfaces as `api_error`: two requests at most, no loop. Requests without fallbacks (models outside the documented list) and non-400 errors are never retried by this path (`tests/ai-extract/claude.test.ts`, `tests/ai-extract/wire.test.ts`).
4. **Deterministic layer.** `normalizeExtraction(GOLDEN_RAW_EXTRACTION)` reproduces `GOLDEN_EXTRACTION` exactly on lines, totals and checks, so a perfect read gives the check bar "Σ lines = printed total ✓ · 0 invalid teeth · 1 to review".
5. **The request on the wire (real SDK, no network).** `tests/ai-extract/wire.test.ts` runs the real `@anthropic-ai/sdk` 1.7.0 client end to end through `liveExtract()` on the stand-in PDF. An injected `fetch` records the HTTP request and answers it as the API would. It confirms:
   - a `POST /v1/messages` on the non-beta endpoint (no `?beta=true`), with the header `anthropic-beta: server-side-fallback-2026-07-01` and `"fallbacks": "default"` in the body. The non-beta `parse` passes the field through untouched.
   - `output_config` holds `{ effort: "low", format: { type: "json_schema", … } }`. Every object in the schema is closed (`additionalProperties: false`) and lists all its keys as `required`. No node carries `minimum`, `maximum`, `multipleOf`, `minLength`, `maxLength` or `pattern`. `code` is the full closed `ProcedureCode` enum.
   - the content is `[document, text]`, in that order. The base64 has no whitespace and decodes to the exact PDF bytes. There is no `tool_choice`, `tools`, `thinking` or sampling parameter.
   - the SDK's own `messages.parse` turns the API's JSON text block into `parsed_output`, and that normalizes to the golden lines and checks.
   - a real 400 response about the beta header (worded without "fallback") is retried once without the header and the field, with the same `output_config`. A 400 that the retry can't fix stops after two requests with `api_error`.

   This settles *what we send*. Whether the API *accepts* it for this account can only be shown by the live run.

## What to record after the live run

- Latency p50 over 3 runs, and whether `effort: "low"` costs accuracy (re-run once at `medium`).
- Any line whose `code` or `teeth` differ from golden, and the confidence the model gave it.
- Whether `L12` comes back under 0.8 on its own. The golden value 0.74 is a fixture choice. If the model reports high confidence, the check bar shows "0 to review" live and "1 to review" cached. Both are honest, but the video script should say which one it shows.
- Any 400, with its text. If the self-heal retry triggers, the logs show `[claude] request with server-side fallback rejected (400 …); retrying once without fallbacks or beta header`. If the run still fails, the logs show `[extract] live extraction unavailable: api_error (400: …)`.
