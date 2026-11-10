# Spike: Claude PDF extraction (WP-03)

**Question.** Can Claude Sonnet 5.5 read the hero presupuesto (a base64 PDF document block) into `RawExtraction` through structured outputs, fast and accurately enough for beat B1, with code doing every money, date and tooth check?

**Status: offline parts verified. The live run is still pending** because the builder environment had no `ANTHROPIC_API_KEY` (and no `ant` profile). No latency or accuracy figure below is invented: the table stays empty until someone runs the command in [How to run](#how-to-run) with a sandbox key.

## How to run

```bash
# .env: ANTHROPIC_API_KEY=sk-ant-... (ANTHROPIC_MODEL_EXTRACT defaults to claude-sonnet-5-5)
npx tsx src/ai/extract/spike/run.ts --runs 3                      # hero PDF from WP-02 if present, else the stand-in
npx tsx src/ai/extract/spike/run.ts path/to/other.pdf             # any PDF
npx tsx src/ai/extract/spike/run.ts --dry --write-pdf hero.pdf    # just render the stand-in, no call
```

The script calls the same `liveExtract()` the route uses, with no cached fallback, and scores each line against `GOLDEN_EXTRACTION` (code, teeth, qty, unit, total, description). It prints latency, the model that served the answer, the Σ check, the lines to review and every mismatch.

**Which PDF.** `public/samples/presupuesto-implantes-ribera.pdf` (WP-02) is used when it exists. Until then the script renders a stand-in from `GOLDEN_RAW_EXTRACTION` with pdf-lib (`src/ai/extract/spike/heroPdf.ts`): A4, a 12-line table, `4.070,00 €` total, Helvetica. It has fixed dates, so its sha256 is reproducible (`0ba96fb2…bd2dd`, 3,555 bytes).

## Results (live)

| Run | PDF | Model served | Latency | Lines exact (of 12) | Σ = printed | To review | Notes |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | pending: no key in the builder environment |

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
3. **Server-side fallback.** `fallbacks` exists only in the SDK's beta types. We send the form the claude-api skill documents for `claude-sonnet-5-5` (`server-side-fallback-2026-07-01` + `fallbacks: "default"`) on the documented `messages.parse` call. The wire request is the same as `client.beta.messages.*` with `betas`, except that the beta helper also adds a `structured-outputs-2025-12-15` header we don't need. On Sonnet 5.5 the default chain retries only `cyber` and `frontier_llm` declines (on `claude-sonnet-5`). Any other decline falls through to our cached golden extraction. If an account or platform rejects the field (400 mentioning "fallback"), `callStructured` retries once without it, inside the same 45 s budget (`tests/ai-extract/claude.test.ts`).
4. **Deterministic layer.** `normalizeExtraction(GOLDEN_RAW_EXTRACTION)` reproduces `GOLDEN_EXTRACTION` exactly on lines, totals and checks, so a perfect read gives the check bar "Σ lines = printed total ✓ · 0 invalid teeth · 1 to review".

## What to record after the live run

- Latency p50 over 3 runs, and whether `effort: "low"` costs accuracy (re-run once at `medium`).
- Any line whose `code` or `teeth` differ from golden, and the confidence the model gave it.
- Whether `L12` comes back under 0.8 on its own. The golden value 0.74 is a fixture choice. If the model reports high confidence, the check bar shows "0 to review" live and "1 to review" cached. Both are honest, but the video script should say which one it shows.
- Any 400 naming a schema feature or the `fallbacks` field. If the self-heal retry triggers, the logs show `[claude] server-side fallback rejected (400)`.
