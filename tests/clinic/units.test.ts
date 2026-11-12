/**
 * pure helpers: euro input parsing for the add-line form, note grouping for approval,
 * the plain-language diff headline (ES/EN) and case-kind inference for uploaded quotes.
 */
import { describe, expect, it } from "vitest";
import { inferCaseKind } from "@/components/clinic/api";
import { diffHeadline, signedCents } from "@/components/clinic/DiffPanel";
import { groupPlanNotes } from "@/components/clinic/NoteApproval";
import { parseEuroInput, PROCEDURE_LABEL } from "@/components/clinic/procedureLabels";
import type { ClinicT } from "@/components/clinic/shared";
import { spanText } from "@/components/clinic/shared";
import { ProcedureCodeSchema, type EditPlanResponse } from "@/contracts";
import { GOLDEN_BONE_GRAFT_DIFF, GOLDEN_LINES, GOLDEN_PLAN, goldenPlan } from "@/contracts/fixtures/implantCase";
import { translate, type KeyOf, type Vars } from "@/i18n/core";
import { NOTE_LIBRARY } from "@data/seed/notes";

const tFor = (locale: "es" | "en") =>
  ((key: KeyOf<"clinic">, vars?: Vars) => translate("clinic", locale, key, vars)) as ClinicT;
const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("parseEuroInput", () => {
  it.each([
    ["450", 45_000],
    ["450,00", 45_000],
    ["450.5", 45_050],
    ["95,50 €", 9_550],
    ["1.950,00", 195_000],
    ["1,950.00", 195_000],
    ["1.950", 195_000],
    ["12.345.678,9", 1_234_567_890],
    ["0", 0],
  ])("%s → %i cents", (raw, cents) => expect(parseEuroInput(raw)).toBe(cents));

  it.each(["", "abc", "-5", "4,5055", "1.2.3,456", "€", "12e3"])("rejects %j", (raw) =>
    expect(parseEuroInput(raw)).toBeNull(),
  );
});

describe("groupPlanNotes", () => {
  it("lists each golden note once: clinical notes per phase, payment/referral notes as general", () => {
    const g = groupPlanNotes(goldenPlan(), NOTE_LIBRARY);
    expect(new Set(g.allIds).size).toBe(g.allIds.length);
    expect([...g.allIds].sort()).toEqual(GOLDEN_PLAN.approvedNotes.map((n) => n.noteId).sort());
    expect(g.byPhase.ph1!.map((n) => n.id)).toEqual(["AFTERCARE_EXTRACTION"]);
    expect(g.byPhase.ph2!.map((n) => n.id)).toEqual([
      "HEALING_EXTRACTION_MIN_8W",
      "HEALING_EXTRACTION_MAX_6M",
      "AFTERCARE_IMPLANT",
    ]);
    expect(g.general.map((n) => n.id)).toEqual(["PAY_PER_PHASE_PROMISE", "PAY_IN_3_RANGE", "REFERRAL_ASK_CLINIC"]);
  });

  it("includes dependency risk notes even when the phase does not list them", () => {
    const plan = goldenPlan();
    plan.phases[2]!.noteIds = [];
    plan.phases[2]!.dependsOn[0]!.riskNoteId = "BONE_GRAFT_HEALING_16W";
    const g = groupPlanNotes(plan, NOTE_LIBRARY);
    expect(g.byPhase.ph3!.map((n) => n.id)).toEqual(["BONE_GRAFT_HEALING_16W", "OSSEOINTEGRATION_MAX_6M"]);
  });
});

describe("diff headline", () => {
  const result: EditPlanResponse = { plan: goldenPlan(), diff: GOLDEN_BONE_GRAFT_DIFF };

  it("reads like the demo script in Spanish", () => {
    expect(norm(diffHeadline(result, "es", tFor("es")))).toBe(
      "Fase 2: 1.500,00 € → 1.950,00 € · sigue dentro del rango de Paga en 3 · fases 3–4 se mueven 4 semanas",
    );
  });

  it("and in English", () => {
    expect(norm(diffHeadline(result, "en", tFor("en")))).toBe(
      "Phase 2: €1,500.00 → €1,950.00 · still within Pay in 3 range · phases 3–4 move 4 weeks later",
    );
  });

  it("describes a fit change and an earlier single-phase move", () => {
    const diff = structuredClone(GOLDEN_BONE_GRAFT_DIFF);
    diff.phases[0]!.amountAfterCents = 260_000;
    diff.phases[0]!.deltaCents = 110_000;
    diff.phases[0]!.fitAfter = "INSTALLMENTS";
    diff.phases = [diff.phases[0]!, { ...diff.phases[1]!, startAfter: "2027-03-31" }];
    expect(norm(diffHeadline({ plan: goldenPlan(), diff }, "es", tFor("es")))).toBe(
      "Fase 2: 1.500,00 € → 2.600,00 € · fuera del rango de Paga en 3 · Pago a plazos · fase 3 se adelanta 1 semana",
    );
  });

  it("formats signed deltas", () => {
    expect(norm(signedCents(45_000, "es"))).toBe("+450,00 €");
    expect(norm(signedCents(-45_000, "es"))).toBe("−450,00 €");
    expect(norm(signedCents(0, "en"))).toBe("€0.00");
  });

  it("spans read in weeks when whole, days otherwise", () => {
    const t = tFor("es");
    expect(spanText(56, t)).toBe("8 semanas");
    expect(spanText(7, t)).toBe("1 semana");
    expect(spanText(10, t)).toBe("10 días");
    expect(spanText(-1, t)).toBe("1 día");
  });
});

describe("inferCaseKind and procedure labels", () => {
  it("infers the case kind from the extracted codes", () => {
    expect(inferCaseKind(GOLDEN_LINES.map((l) => l.code))).toBe("implant");
    expect(inferCaseKind(["ORTHO_RECORDS", "ALIGNER_BATCH"])).toBe("aligner");
    expect(inferCaseKind(["SCALING_ROOT_PLANING"])).toBe("perio");
    expect(inferCaseKind(["EXAM"])).toBe("implant");
  });

  it("labels every procedure code in ES and EN", () => {
    for (const code of ProcedureCodeSchema.options) {
      expect(PROCEDURE_LABEL[code].es.trim()).not.toBe("");
      expect(PROCEDURE_LABEL[code].en.trim()).not.toBe("");
    }
  });
});
