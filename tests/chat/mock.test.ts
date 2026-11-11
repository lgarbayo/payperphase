import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent } from "@/contracts";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { answerPatientQuestion, routeQuestion } from "@/ai/chat";
import { subscribe } from "@/server/events";
import { NOTE_LIBRARY } from "@data/seed/notes";

const TODAY = "2026-11-16";
const PLAN = GOLDEN_PLAN;
const ask = (text: string, locale: "es" | "en" = "es", extra: object = {}) =>
  answerPatientQuestion(
    { planId: PLAN.id, locale, messages: [{ role: "user", text }] },
    { plan: PLAN, today: TODAY, publishPreview: false, ...extra },
  );

describe("mock router (cached answers)", () => {
  it("ES demo question: ph2 moves 3 months, ph3 and ph4 follow, dates come from the engine", async () => {
    const r = await ask("Si espero 3 meses para el implante, ¿qué cambia?");
    expect(r.source).toBe("cached");
    expect(r.refused).toBe(false);
    expect(r.groundingFallback).toBe(false);
    expect(r.whatIf?.request).toEqual({ phaseId: "ph2", newStartDate: "2027-04-12" });
    expect(r.whatIf?.shifts.map((s) => [s.phaseId, s.toStart])).toEqual([
      ["ph2", "2027-04-12"],
      ["ph3", "2027-07-06"],
      ["ph4", "2027-07-21"],
    ]);
    expect(r.text).toContain("12 ene 2027");
    expect(r.text).toContain("12 abr 2027");
    expect(r.text).toContain("Fase 3");
    expect(r.text).toContain("21 jul 2027");
    expect(r.whatIf?.warnings).toEqual([]);
    // Approved-note chips for the healing notes, attributed to the dentist and the phase.
    expect(r.citations.map((c) => c.noteId)).toEqual(["HEALING_EXTRACTION_MAX_6M", "HEALING_EXTRACTION_MIN_8W"]);
    expect(r.citations[0]).toMatchObject({ approvedBy: "Dra. Lucía Ruiz", phaseId: "ph2" });
    expect(r.citations[0]!.citedText).toBe(NOTE_LIBRARY.HEALING_EXTRACTION_MAX_6M.text.es);
  });

  it("EN demo question: same what-if, English text", async () => {
    const r = await ask("If I wait 3 months for the implant, what changes?", "en");
    expect(r.refused).toBe(false);
    expect(r.whatIf?.shifts.map((s) => s.phaseId)).toEqual(["ph2", "ph3", "ph4"]);
    expect(r.text).toMatch(/^If you wait 3 months on Phase 2 \(Implant placement\)/);
    expect(r.text).toContain("12 Apr 2027");
    expect(r.text).not.toMatch(/Fase/);
    expect(r.citations[0]!.citedText).toBe(NOTE_LIBRARY.HEALING_EXTRACTION_MAX_6M.text.en);
  });

  it("cites HEALING_EXTRACTION_MAX_6M first, and says so, when the deadline warning appears", async () => {
    const r = await ask("¿Y si lo retraso 6 meses?" + " El implante.");
    expect(r.whatIf?.warnings.map((w) => w.noteId)).toEqual(["HEALING_EXTRACTION_MAX_6M"]);
    expect(r.citations[0]!.noteId).toBe("HEALING_EXTRACTION_MAX_6M");
    expect(r.text).toContain("Ojo");
    expect(r.text).toContain("16 may 2027");
  });

  it("units: weeks, number words, 'a month', years, and an explicit phase", async () => {
    expect((await ask("Quiero esperar seis semanas con el implante")).whatIf?.request.newStartDate).toBe("2027-02-23");
    expect((await ask("What if I postpone phase 3 by two weeks?", "en")).whatIf?.request.phaseId).toBe("ph3");
    expect((await ask("Can I delay the crowns a month?", "en")).whatIf?.request.phaseId).toBe("ph4");
    expect(PLAN.phases[1]!.startDate).toBe("2027-01-12");
  });

  it("'¿Puedo tomar ibuprofeno?' and its English twin are refused with the fixed referral and no citations", async () => {
    const es = await ask("¿Puedo tomar ibuprofeno?");
    expect(es).toMatchObject({ refused: true, groundingFallback: false, source: "cached", citations: [] });
    expect(es.text).toBe(NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.es);
    expect(es.whatIf).toBeUndefined();
    const en = await ask("Can I take ibuprofen?", "en");
    expect(en.refused).toBe(true);
    expect(en.text).toBe(NOTE_LIBRARY.REFERRAL_ASK_CLINIC.text.en);
  });

  it("medication wins even when a delay word and number are present; unknown topics get the referral", async () => {
    expect((await ask("¿Puedo tomar ibuprofeno si espero 3 meses?")).refused).toBe(true);
    expect((await ask("¿Cuál es el color de la sala de espera?")).refused).toBe(true);
    expect((await ask("¿Cuánto cuesta un viaje a Marte?")).refused).toBe(true);
  });

  it("a delay question without an amount asks how long instead of guessing", async () => {
    const r = await ask("¿Qué pasa si espero con el implante?");
    expect(r.refused).toBe(false);
    expect(r.whatIf).toBeUndefined();
    expect(r.text).toContain("3 meses");
  });

  it("a phase that is already paid cannot be delayed: no whatIf, no preview", async () => {
    const paid = structuredClone(PLAN);
    paid.phases[1]!.payment.status = "paid";
    const r = await ask("Si espero 3 meses para el implante, ¿qué cambia?", "es", { plan: paid });
    expect(r.whatIf).toBeUndefined();
    expect(r.text).toContain("ya está pagada");
  });

  it("only notes the clinic approved for this plan are cited", async () => {
    const trimmed = structuredClone(PLAN);
    trimmed.approvedNotes = trimmed.approvedNotes.filter((a) => a.noteId !== "HEALING_EXTRACTION_MAX_6M");
    const r = await ask("Si espero 3 meses para el implante, ¿qué cambia?", "es", { plan: trimmed });
    expect(r.citations.map((c) => c.noteId)).toEqual(["HEALING_EXTRACTION_MIN_8W"]);
  });

  it("routing is deterministic", () => {
    expect(routeQuestion("wait 3 months for the implant", PLAN)).toEqual({
      kind: "delay",
      input: { phaseN: 2, amount: 3, unit: "months" },
    });
    expect(routeQuestion("wait 3 months", PLAN)).toMatchObject({ kind: "delay", input: { phaseN: 1 } });
  });
});

describe("CHAT_PREVIEW", () => {
  let events: DomainEvent[] = [];
  beforeEach(() => {
    events = [];
  });

  it("a what-if publishes CHAT_PREVIEW with the shifts; a referral publishes nothing", async () => {
    const off = subscribe((e) => void events.push(e));
    try {
      const r = await ask("Si espero 3 meses para el implante, ¿qué cambia?", "es", { publishPreview: true });
      await ask("¿Puedo tomar ibuprofeno?", "es", { publishPreview: true });
      const previews = events.filter((e) => e.type === "CHAT_PREVIEW");
      expect(previews).toHaveLength(1);
      expect(previews[0]).toMatchObject({ planId: PLAN.id, shifts: r.whatIf!.shifts });
    } finally {
      off();
    }
  });
});
