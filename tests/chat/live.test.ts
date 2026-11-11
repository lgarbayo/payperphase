/** Live path with a scripted fake Claude client: documents + citations, the simulate_delay loop, grounding, refusal, degradation. */
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { ChatRequest } from "@/contracts";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { answerPatientQuestion, chatSystemPrompt } from "@/ai/chat";
import type { ClaudeClient } from "@/ai/extract/claude";
import { NOTE_LIBRARY } from "@data/seed/notes";

const TODAY = "2026-11-16";
const PLAN = GOLDEN_PLAN;
const req = (text: string, locale: "es" | "en" = "es"): ChatRequest => ({ planId: PLAN.id, locale, messages: [{ role: "user", text }] });

type Reply = Record<string, unknown>;
const message = (content: unknown[], stop_reason = "end_turn", extra: Reply = {}): Reply => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content, stop_reason, stop_details: null,
  usage: { input_tokens: 1, output_tokens: 1 }, ...extra,
});
const toolUse = (input: unknown, id = "toolu_1") => message([{ type: "tool_use", id, name: "simulate_delay", input }], "tool_use");
const cites = (docIndex: number, cited: string) => [{ type: "char_location", cited_text: cited, document_index: docIndex, document_title: "t", start_char_index: 0, end_char_index: cited.length }];

function fake(...replies: (Reply | Error)[]) {
  const create = vi.fn(async (..._args: unknown[]) => {
    const next = replies.shift();
    if (!next) throw new Error("no more scripted replies");
    if (next instanceof Error) throw next;
    return next;
  });
  return { client: { messages: { create } } as unknown as ClaudeClient, create };
}
const run = (client: ClaudeClient, r: ChatRequest) => answerPatientQuestion(r, { plan: PLAN, today: TODAY, publishPreview: false, client });
const docIndexOf = (id: string) => PLAN.approvedNotes.filter((a) => NOTE_LIBRARY[a.noteId].kind !== "REFERRAL").findIndex((a) => a.noteId === id);

describe("live chat (claude-haiku-5-5)", () => {
  it("request shape: approved notes as cited documents, the engine tool, no forced tool_choice or sampling", async () => {
    const { client, create } = fake(message([{ type: "text", text: NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.es }]));
    await run(client, req("¿Puedo tomar ibuprofeno?"));
    const [params, opts] = create.mock.calls[0]! as [Record<string, any>, Record<string, any>];
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params).not.toHaveProperty("tool_choice");
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("thinking");
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.tools.map((t: { name: string }) => t.name)).toEqual(["simulate_delay"]);
    expect(params.tools[0].input_schema.required).toEqual(["phaseN", "amount", "unit"]);
    expect(opts.maxRetries).toBe(0);
    const content = params.messages.at(-1).content as Record<string, any>[];
    const docs = content.filter((b) => b.type === "document");
    expect(docs).toHaveLength(PLAN.approvedNotes.length - 1); // every approved note except the referral
    expect(docs.every((d) => d.citations.enabled === true && d.source.media_type === "text/plain")).toBe(true);
    const maxNote = docs[docIndexOf("HEALING_EXTRACTION_MAX_6M")];
    expect(maxNote.title).toBe("No esperar demasiado · Fase 2: Colocación de implantes · Aprobado por Dra. Lucía Ruiz");
    expect(maxNote.source.data).toBe(NOTE_LIBRARY.HEALING_EXTRACTION_MAX_6M.text.es);
    expect(content.at(-1)).toEqual({ type: "text", text: "¿Puedo tomar ibuprofeno?" });
    expect(params.system).toContain(NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.es);
    expect(params.system).toContain("Fase 2: Colocación de implantes");
  });

  it("what-if: the model calls simulate_delay, the engine answers, the final text and citations come back live", async () => {
    const { client, create } = fake(
      toolUse({ phaseN: 2, amount: 3, unit: "months" }),
      message([
        { type: "text", text: "Si esperas 3 meses, la Fase 2 pasa al 12 abr 2027 y las Fases 3 y 4 la siguen. " },
        { type: "text", text: "Sigue dentro del límite de 6 meses.", citations: cites(docIndexOf("HEALING_EXTRACTION_MAX_6M"), "retrasa más de 6 meses") },
      ]),
    );
    const r = await run(client, req("Si espero 3 meses para el implante, ¿qué cambia?"));
    expect(r.source).toBe("live");
    expect(r.refused).toBe(false);
    expect(r.groundingFallback).toBe(false);
    expect(r.whatIf?.shifts.map((s) => s.phaseId)).toEqual(["ph2", "ph3", "ph4"]);
    expect(r.citations[0]).toMatchObject({ noteId: "HEALING_EXTRACTION_MAX_6M", approvedBy: "Dra. Lucía Ruiz", phaseId: "ph2", citedText: "retrasa más de 6 meses" });
    // The tool result handed to the model carries code-formatted dates and the user's own amount.
    const second = create.mock.calls[1]![0] as { messages: any[] };
    const toolResult = second.messages.at(-1).content[0];
    expect(toolResult.type).toBe("tool_result");
    expect(JSON.parse(toolResult.content)).toMatchObject({ ok: true, request: { phaseN: 2, amount: 3, unit: "months" }, shifts: [{ phaseN: 2, from: "12 ene 2027", to: "12 abr 2027" }, expect.anything(), expect.anything()] });
    // The assistant tool_use turn is echoed back unchanged.
    expect(second.messages.at(-2).role).toBe("assistant");
  });

  it("an invalid move returns the note text to the model and no whatIf", async () => {
    const paid = structuredClone(PLAN);
    paid.phases[1]!.payment.status = "paid";
    const { client, create } = fake(
      toolUse({ phaseN: 2, amount: 2, unit: "weeks" }),
      message([{ type: "text", text: "La Fase 2 ya está pagada, no se puede mover.", citations: cites(docIndexOf("PAY_PER_PHASE_PROMISE"), "Pagas cada fase") }]),
    );
    const r = await answerPatientQuestion(req("Quiero esperar 2 semanas con el implante"), { plan: paid, today: TODAY, publishPreview: false, client });
    expect(r.whatIf).toBeUndefined();
    const result = (create.mock.calls[1]![0] as { messages: any[] }).messages.at(-1).content[0];
    expect(result.is_error).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({ ok: false, reason: "PHASE_PAID" });
  });

  it("grounding: a number the engine never produced swaps the whole answer for the code-built summary", async () => {
    const { client } = fake(
      toolUse({ phaseN: 2, amount: 3, unit: "months" }),
      message([{ type: "text", text: "Esperar 3 meses te costará 450 € más y el implante será el 3 jun 2027." }]),
    );
    const r = await run(client, req("Si espero 3 meses para el implante, ¿qué cambia?"));
    expect(r.groundingFallback).toBe(true);
    expect(r.text).not.toContain("450");
    expect(r.text).toContain("12 abr 2027");
    expect(r.whatIf?.shifts).toHaveLength(3);
    expect(r.citations.length).toBeGreaterThan(0);
  });

  it("grounding without a tool: an invented figure becomes the referral, flagged as a fallback", async () => {
    const { client } = fake(message([{ type: "text", text: "Tardará unos 45 días.", citations: cites(docIndexOf("AFTERCARE_IMPLANT"), "algo de inflamación unos días") }]));
    const r = await run(client, req("¿Cuánto tarda en curar?"));
    expect(r).toMatchObject({ refused: true, groundingFallback: true, source: "live", citations: [] });
    expect(r.text).toBe(NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.es);
  });

  it("an uncited, tool-less answer is not grounded in anything: fixed referral; the model's own referral is refused:true", async () => {
    const own = fake(message([{ type: "text", text: NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.es }]));
    expect(await run(own.client, req("¿Puedo tomar ibuprofeno?"))).toMatchObject({ refused: true, groundingFallback: false, source: "live", citations: [] });
    const chatty = fake(message([{ type: "text", text: "Claro, el ibuprofeno suele ir bien." }]));
    const r = await run(chatty.client, req("¿Puedo tomar ibuprofeno?"));
    expect(r.refused).toBe(true);
    expect(r.text).toBe(NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.es);
  });

  it("stop_reason refusal → the fixed referral", async () => {
    const { client } = fake(message([], "refusal", { stop_details: { type: "refusal", category: "general_harms", explanation: null } }));
    expect(await run(client, req("hola"))).toMatchObject({ refused: true, source: "live", citations: [], groundingFallback: false });
  });

  it("API trouble (error, timeout, max_tokens, runaway tool loop) degrades to the cached deterministic answer", async () => {
    const q = req("Si espero 3 meses para el implante, ¿qué cambia?");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = fake(new Anthropic.APIConnectionError({ message: "offline" }));
    const a = await run(down.client, q);
    expect(a).toMatchObject({ source: "cached", refused: false });
    expect(a.whatIf?.shifts).toHaveLength(3);
    expect((await run(fake(message([{ type: "text", text: "x" }], "max_tokens")).client, q)).source).toBe("cached");
    const loop = fake(...Array.from({ length: 6 }, () => toolUse({ phaseN: 2, amount: 1, unit: "weeks" })));
    expect((await run(loop.client, q)).source).toBe("cached");
  });

  it("English: titles and system prompt are localized", async () => {
    const { client, create } = fake(message([{ type: "text", text: NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.en }]));
    await run(client, req("Can I take ibuprofen?", "en"));
    const params = create.mock.calls[0]![0] as Record<string, any>;
    expect(params.system).toContain("Answer in English");
    expect(params.messages.at(-1).content[docIndexOf("HEALING_EXTRACTION_MAX_6M")].title).toBe("Don't wait too long · Phase 2: Implant placement · Approved by Dra. Lucía Ruiz");
    expect(chatSystemPrompt(PLAN, "en")).toContain("Phase 4: Final crowns");
  });

  it("multi-turn: leading assistant turns are dropped and the transcript ends on the user turn", async () => {
    const { client, create } = fake(message([{ type: "text", text: NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.es }]));
    await run(client, { planId: PLAN.id, locale: "es", messages: [{ role: "assistant", text: "Hola" }, { role: "user", text: "uno" }, { role: "assistant", text: "dos" }, { role: "user", text: "tres" }] });
    const msgs = (create.mock.calls[0]![0] as { messages: { role: string }[] }).messages;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });
});
