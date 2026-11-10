import { describe, expect, it } from "vitest";
import type { PhaseShift } from "@/contracts";
import { goldenPlan } from "@/contracts/fixtures/implantCase";
import { describeShifts, formatFit, formatPatientAlias, formatSpan } from "@/components/patient/format";
import { groupApprovedNotes } from "@/components/patient/ApprovedNotes";
import { NOTE_LIBRARY } from "@data/seed/notes";

const norm = (s: string) => s.replace(/\s+/g, " ");
const shift = (phaseId: string, deltaDays: number, toStart: string): PhaseShift => ({
  phaseId,
  fromStart: "2027-01-12",
  toStart,
  deltaDays,
  fromDue: "2027-01-12",
  toDue: toStart,
});
const phases = goldenPlan().phases;

describe("describeShifts (what-if toast, built only from result.shifts)", () => {
  const golden = [shift("ph2", 42, "2027-02-23"), shift("ph3", 42, "2027-05-19"), shift("ph4", 42, "2027-06-03")];

  it("golden delay: moved phase date + followers in weeks", () => {
    expect(describeShifts(golden, "ph2", phases, "es")).toBe("Fase 2 pasa al 23 feb 2027 · Fases 3 y 4 se mueven 6 semanas más tarde");
    expect(describeShifts(golden, "ph2", phases, "en")).toBe("Phase 2 moves to 23 Feb 2027 · Phases 3 and 4 move 6 weeks later");
  });

  it("a single follower, days, and earlier moves", () => {
    expect(describeShifts([shift("ph3", 10, "2027-04-17"), shift("ph4", 10, "2027-05-02")], "ph3", phases, "es")).toBe(
      "Fase 3 pasa al 17 abr 2027 · Fase 4 se mueve 10 días más tarde",
    );
    expect(describeShifts([shift("ph4", -7, "2027-04-15")], "ph3", phases, "es")).toBe("Fase 4 se adelanta 1 semana");
    expect(describeShifts([shift("ph3", -1, "2027-04-06"), shift("ph4", -1, "2027-04-21")], "x", phases, "en")).toBe(
      "Phases 3 and 4 move 1 day earlier",
    );
  });

  it("groups followers by delta and ignores zero shifts", () => {
    const s = [shift("ph2", 14, "2027-01-26"), shift("ph3", 0, "2027-04-07"), shift("ph4", 21, "2027-05-13")];
    expect(describeShifts(s, "ph1", phases, "es")).toBe("Fase 2 se mueve 2 semanas más tarde · Fase 4 se mueve 3 semanas más tarde");
    expect(describeShifts([], "ph2", phases, "es")).toBe("Sin cambios en tu calendario");
    expect(describeShifts([shift("ph2", 0, "2027-01-12")], "ph2", phases, "en")).toBe("No changes to your timeline");
  });

  it("formats spans", () => {
    expect(formatSpan(42, "es")).toBe("6 semanas");
    expect(formatSpan(-7, "en")).toBe("1 week");
    expect(formatSpan(1, "es")).toBe("1 día");
    expect(formatSpan(10, "en")).toBe("10 days");
  });
});

describe("formatFit never claims eligibility", () => {
  it("formats each fit reason", () => {
    expect(norm(formatFit({ band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" }, "es"))).toBe(
      "Dentro del rango de Paga en 3 (20 €–2.000 €)",
    );
    expect(formatFit({ band: "PAY_IN_3", reason: "WITHIN_PAY_IN_3_RANGE" }, "en")).toBe("Within Pay in 3 range (€20–€2,000)");
    const all = (["INDIVISIBLE_ITEM_OVER_PAY_IN_3_MAX", "BELOW_PAY_IN_3_MIN", "OVER_INSTALLMENTS_MAX"] as const).flatMap((reason) =>
      (["es", "en"] as const).map((l) => formatFit({ band: "INSTALLMENTS", reason }, l)),
    );
    for (const text of all) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/elegible|eligible/i);
    }
  });
});

describe("formatPatientAlias", () => {
  it("adds the fictional marker once", () => {
    expect(formatPatientAlias("María G.", "es")).toBe("María G. (ficticio)");
    expect(formatPatientAlias("María G.", "en")).toBe("María G. (fictional)");
    expect(formatPatientAlias("María García (paciente ficticia)", "es")).toBe("María García (paciente ficticia)");
  });
});

describe("groupApprovedNotes", () => {
  it("only approved notes, each once, payment/referral notes in the general group", () => {
    const plan = goldenPlan();
    const g = groupApprovedNotes(plan, Object.values(NOTE_LIBRARY));
    const all = [...g.byPhase.flatMap((x) => x.notes), ...g.general].map((n) => n.id);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(plan.approvedNotes.map((a) => a.noteId)));
    expect(g.byPhase.map((x) => x.phase.id)).toEqual(["ph1", "ph2", "ph3", "ph4"]);
    expect(g.general.map((n) => n.kind)).toEqual(["PAYMENT", "PAYMENT", "REFERRAL"]);
    expect(g.approvals.get("HEALING_EXTRACTION_MIN_8W")?.approvedBy).toBe("Dra. Lucía Ruiz");
  });

  it("drops notes that are not approved even if the server sent them", () => {
    const plan = goldenPlan();
    plan.approvedNotes = plan.approvedNotes.filter((a) => a.noteId.startsWith("PAY"));
    const g = groupApprovedNotes(plan, Object.values(NOTE_LIBRARY));
    expect(g.byPhase).toHaveLength(0);
    expect(g.general.map((n) => n.id)).toEqual(["PAY_PER_PHASE_PROMISE", "PAY_IN_3_RANGE"]);
  });
});
