import { describe, expect, it, vi } from "vitest";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { answerPatientQuestion, routeQuestion } from "@/ai/chat";
import type { ClaudeClient } from "@/ai/extract/claude";
import { computeExposure } from "@/engine";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { NOTE_LIBRARY } from "@data/seed/notes";

const TODAY = "2026-11-16";
const PLAN = GOLDEN_PLAN;
const phase2 = PLAN.phases.find((p) => p.n === 2)!;
const exposure = computeExposure(PLAN, TODAY);

const ask = (text: string, locale: "es" | "en" = "es", client: ClaudeClient | null = null) =>
  answerPatientQuestion(
    { planId: PLAN.id, locale, messages: [{ role: "user", text }] },
    { plan: PLAN, today: TODAY, publishPreview: false, client },
  );

describe("chat: amount and date questions are answered from the engine's plan data", () => {
  it("ES: «¿Cuánto cuesta la fase 2?» gives the phase amount, its visit/pay date and the totals", async () => {
    const r = await ask("¿Cuánto cuesta la fase 2?");
    expect(r.refused).toBe(false);
    expect(r.text).not.toBe(NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.es);
    expect(r.text).toContain(`Fase 2 (${phase2.title.es}) cuesta ${formatCents(phase2.amountCents, "es")}`);
    expect(r.text).toContain(formatIsoDate(phase2.payment.dueDate, "es"));
    expect(r.text).toContain(`Total del plan: ${formatCents(exposure.totalCents, "es")}`);
    expect(r.text).toContain(`Pagado hasta hoy: ${formatCents(exposure.paidCents, "es")}`);
    expect(r.text).toContain(`Pendiente: ${formatCents(exposure.remainingCents, "es")}`);
    expect(r.citations.map((c) => c.noteId)).toContain("PAY_PER_PHASE_PROMISE");
    expect(r.citations.every((c) => PLAN.approvedNotes.some((a) => a.noteId === c.noteId))).toBe(true);
  });

  it("EN: «How much is phase 2?» and «How much is phase 2 and when?» answer with engine figures", async () => {
    for (const q of ["How much is phase 2?", "How much is phase 2 and when?"]) {
      const r = await ask(q, "en");
      expect(r.refused).toBe(false);
      expect(r.text).toContain(`Phase 2 (${phase2.title.en}) costs ${formatCents(phase2.amountCents, "en")}`);
      expect(r.text).toContain(formatIsoDate(phase2.payment.dueDate, "en"));
      expect(r.text).toContain(`Plan total: ${formatCents(exposure.totalCents, "en")}`);
      expect(r.text).toContain(`Remaining: ${formatCents(exposure.remainingCents, "en")}`);
      expect(r.citations.map((c) => c.noteId)).toContain("PAY_PER_PHASE_PROMISE");
    }
  });

  it("EN/ES: totals questions without a phase name the next pending phase and the totals", async () => {
    const en = await ask("How much have I paid and how much is left?", "en");
    expect(en.text).toContain(`Paid so far: ${formatCents(exposure.paidCents, "en")}`);
    const es = await ask("¿Cuánto me queda por pagar?");
    expect(es.text).toContain(`Pendiente: ${formatCents(exposure.remainingCents, "es")}`);
  });

  it("amounts never come from the model: with a live client the model is not called", async () => {
    const create = vi.fn(async () => {
      throw new Error("model must not be called for cost questions");
    });
    const client = { messages: { create } } as unknown as ClaudeClient;
    const r = await ask("¿Cuánto cuesta la fase 2?", "es", client);
    expect(create).not.toHaveBeenCalled();
    expect(r.text).toContain(formatCents(phase2.amountCents, "es"));
  });

  it("medical questions keep the referral, in ES and EN, even with cost words", async () => {
    expect((await ask("¿Cuánto ibuprofeno tomo después de la fase 2?")).refused).toBe(true);
    expect((await ask("How much painkiller after phase 2?", "en")).refused).toBe(true);
    expect(routeQuestion("¿Cuánto cuesta un viaje a Marte?", PLAN).kind).toBe("referral");
  });

  it("delay questions still go to simulate_delay", () => {
    expect(routeQuestion("What if I wait three months for the implant?", PLAN).kind).toBe("delay");
    expect(routeQuestion("¿Cuánto cuesta la fase 2?", PLAN)).toEqual({ kind: "cost", phaseN: 2 });
  });
});
