import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WordingDraftSetSchema } from "@/contracts";
import { goldenPlan } from "@/contracts/fixtures/implantCase";
import type { ClaudeClient } from "@/ai/extract/claude";
import {
  deterministicPhaseTemplate,
  draftPhaseWording,
  fillSlots,
  phaseSlotValues,
  TemplateError,
  validateTemplate,
} from "@/ai/wording";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { NOTE_LIBRARY } from "@data/seed/notes";

const codes = (t: string, opts?: Parameters<typeof validateTemplate>[1]) =>
  validateTemplate(t, opts).issues.map((i) => i.code);

describe("validateTemplate", () => {
  it('accepts "Pagarás {{amount}} el día {{date}}"', () => {
    const v = validateTemplate("Pagarás {{amount}} el día {{date}}");
    expect(v).toEqual({ ok: true, issues: [], slots: ["amount", "date"] });
  });

  it("accepts every contract slot and ordinary prose in both languages", () => {
    expect(validateTemplate("Fase {{phaseN}} en las piezas {{teeth}}, {{minWeeks}} semanas después. Te atiende {{dentist}}.").ok).toBe(true);
    expect(validateTemplate("You may feel some pressure; we march on after {{minWeeks}} weeks.").ok).toBe(true);
  });

  it.each([
    ["Pagarás 450 el día {{date}}", "DIGIT"],
    ["Fase 2: {{amount}}", "DIGIT"],
    ["Paga en 3 plazos", "DIGIT"],
    ["Pagarás {{amount}} €", "CURRENCY"],
    ["Pay {{amount}} EUR", "CURRENCY"],
    ["Son {{amount}} euros", "CURRENCY"],
    ["Un descuento del {{amount}}%", "PERCENT"],
    ["La cita es en noviembre", "MONTH"],
    ["Vuelves en Enero", "MONTH"],
    ["See you in December", "MONTH"],
    ["Next visit: May", "MONTH"],
    ["Pagarás {{price}} el día {{date}}", "UNKNOWN_SLOT"],
    ["Pagarás {{ amount }}", "MALFORMED_SLOT"],
    ["Pagarás {amount}", "MALFORMED_SLOT"],
    ["", "EMPTY"],
  ])("rejects %j (%s)", (template, code) => {
    const v = validateTemplate(template);
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain(code);
  });

  it("digits, currency and months inside slots are fine; outside they are not", () => {
    expect(codes("{{amount}} {{date}}")).toEqual([]);
    expect(codes("{{amount}} 12")).toEqual(["DIGIT"]);
  });

  it("rejects slots this context has no value for, and missing required slots", () => {
    expect(codes("Empieza {{minWeeks}} semanas después", { allowed: ["amount", "date"] })).toEqual(["SLOT_NOT_AVAILABLE"]);
    expect(codes("Fase {{phaseN}}", { required: ["amount", "date"] })).toEqual(["MISSING_SLOT", "MISSING_SLOT"]);
  });
});

describe("fillSlots", () => {
  const values = {
    amountCents: 150_000,
    date: "2027-01-12",
    teeth: [36, 46],
    minLagDays: 56,
    phaseN: 2,
    dentist: "Dra. Lucía Ruiz",
  };

  it("fills only from engine values, formatted by formatCents / formatIsoDate", () => {
    const t = "Fase {{phaseN}} ({{teeth}}): {{amount}} el {{date}}, {{minWeeks}} semanas tras la anterior. {{dentist}}.";
    expect(fillSlots(t, values, "es")).toBe(
      `Fase 2 (36 y 46): ${formatCents(150_000, "es")} el ${formatIsoDate("2027-01-12", "es", { month: "long" })}, 8 semanas tras la anterior. Dra. Lucía Ruiz.`,
    );
    const en = "Phase {{phaseN}} (teeth {{teeth}}): {{amount}} on {{date}}, {{minWeeks}} weeks later. {{dentist}}.";
    expect(fillSlots(en, values, "en")).toBe(
      "Phase 2 (teeth 36 and 46): €1,500.00 on 12 January 2027, 8 weeks later. Dra. Lucía Ruiz.",
    );
  });

  it("minWeeks = minLag / 7 (84 → 12, 14 → 2, 112 → 16)", () => {
    for (const [days, weeks] of [[84, 12], [14, 2], [112, 16]] as const) {
      expect(fillSlots("{{minWeeks}}", { minLagDays: days }, "es")).toBe(String(weeks));
    }
  });

  it("formats three teeth as a list", () => {
    expect(fillSlots("{{teeth}}", { teeth: [36, 37, 46] }, "es")).toBe("36, 37 y 46");
    expect(fillSlots("{{teeth}}", { teeth: [36, 37, 46] }, "en")).toBe("36, 37 and 46");
  });

  it("refuses to fill an invalid template or a slot without an engine value", () => {
    expect(() => fillSlots("Pagas 450 {{amount}}", values, "es")).toThrow(TemplateError);
    expect(() => fillSlots("{{minWeeks}}", { amountCents: 100 }, "es")).toThrow(TemplateError);
    expect(() => fillSlots("{{teeth}}", { teeth: [19] }, "es")).toThrow(TemplateError);
    expect(() => fillSlots("{{amount}}", { amountCents: 1.5 }, "es")).toThrow(TemplateError);
  });
});

describe("deterministic phase templates", () => {
  const plan = goldenPlan();
  it("validate for every golden phase and render engine values", () => {
    for (const phase of plan.phases) {
      const values = phaseSlotValues(plan, phase);
      const t = deterministicPhaseTemplate(phase, values);
      expect(validateTemplate(t.es).ok).toBe(true);
      expect(validateTemplate(t.en).ok).toBe(true);
    }
    const ph2 = plan.phases[1]!;
    const t = deterministicPhaseTemplate(ph2, phaseSlotValues(plan, ph2));
    expect(fillSlots(t.es, phaseSlotValues(plan, ph2), "es")).toBe(
      `Fase 2: colocación de los implantes en las piezas 36 y 46. Pagas ${formatCents(150_000, "es")} el 12 de enero de 2027, el día que recibes esta fase y nunca antes. Empieza como pronto 8 semanas después de la fase anterior. Te atiende Dra. Lucía Ruiz.`,
    );
  });

  it("phase 1 has no previous phase, so no {{minWeeks}}", () => {
    const ph1 = plan.phases[0]!;
    expect(deterministicPhaseTemplate(ph1, phaseSlotValues(plan, ph1)).es).not.toContain("{{minWeeks}}");
  });
});

type ParseImpl = (params: Record<string, unknown>) => Promise<unknown>;
const fakeClient = (impl: ParseImpl) => {
  const parse = vi.fn(impl);
  return { client: { messages: { parse } } as unknown as ClaudeClient, parse };
};
const reply = (phases: { phaseId: string; es: string; en: string }[]) => ({
  id: "msg_w",
  model: "claude-sonnet-5-5",
  stop_reason: "end_turn",
  stop_details: null,
  content: [{ type: "text", text: JSON.stringify({ phases }) }],
  parsed_output: { phases },
});
const good = (id: string) => ({
  phaseId: id,
  es: "En la fase {{phaseN}} pagas {{amount}} el {{date}}, solo cuando la recibes.",
  en: "In phase {{phaseN}} you pay {{amount}} on {{date}}, only when you receive it.",
});

describe("draftPhaseWording", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  const plan = goldenPlan();

  it("without a key: deterministic templates, labelled cached, valid contract", async () => {
    const set = await draftPhaseWording(plan, NOTE_LIBRARY, { client: null });
    expect(WordingDraftSetSchema.safeParse(set).success).toBe(true);
    expect(set.source).toBe("cached");
    expect(set.phases.map((p) => p.phaseId)).toEqual(["ph1", "ph2", "ph3", "ph4"]);
    expect(set.phases.every((p) => p.status === "draft")).toBe(true);
    expect(set.phases[0]!.noteIds).toEqual(plan.phases[0]!.noteIds);
    expect(set.phases[0]!.rendered.en).toContain("€360.00");
  });

  it("valid Claude drafts are used and the set is live", async () => {
    const { client, parse } = fakeClient(async () => reply(plan.phases.map((p) => good(p.id))));
    const set = await draftPhaseWording(plan, NOTE_LIBRARY, { client });
    expect(set.source).toBe("live");
    expect(set.phases[1]!.template.es).toBe(good("ph2").es);
    expect(set.phases[1]!.rendered.es).toBe(`En la fase 2 pagas ${formatCents(150_000, "es")} el 12 de enero de 2027, solo cuando la recibes.`);
    const params = parse.mock.calls[0]![0] as { model: string; tool_choice?: unknown };
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.tool_choice).toBeUndefined();
  });

  it("a Claude draft that fails validation is replaced by the deterministic template, set marked cached", async () => {
    const drafts = plan.phases.map((p) => good(p.id));
    drafts[1] = { phaseId: "ph2", es: "Pagas 1.500 € el 12 de enero.", en: "You pay €1,500 on 12 January." };
    drafts[3] = { phaseId: "ph4", es: "Fase {{phaseN}}: {{amount}} el {{date}}, {{minWeeks}} semanas.", en: "Phase {{phaseN}}: {{amount}} on {{date}} with {{price}}." };
    const { client } = fakeClient(async () => reply(drafts));
    const set = await draftPhaseWording(plan, NOTE_LIBRARY, { client });
    expect(set.source).toBe("cached");
    const ph2 = plan.phases[1]!;
    expect(set.phases[1]!.template).toEqual(deterministicPhaseTemplate(ph2, phaseSlotValues(plan, ph2)));
    expect(set.phases[3]!.template.en).not.toContain("{{price}}");
    expect(set.phases[0]!.template.es).toBe(good("ph1").es); // valid drafts are kept
  });

  it("a draft that uses a slot the phase has no value for is replaced (ph1 has no {{minWeeks}})", async () => {
    const drafts = plan.phases.map((p) => good(p.id));
    drafts[0] = { phaseId: "ph1", es: "Pagas {{amount}} el {{date}} tras {{minWeeks}} semanas.", en: "Pay {{amount}} on {{date}} after {{minWeeks}} weeks." };
    const { client } = fakeClient(async () => reply(drafts));
    const set = await draftPhaseWording(plan, NOTE_LIBRARY, { client });
    expect(set.source).toBe("cached");
    expect(set.phases[0]!.template.es).not.toContain("{{minWeeks}}");
  });

  it("a refusal falls back to deterministic templates, labelled cached", async () => {
    const { client } = fakeClient(async () => ({
      id: "msg_r",
      model: "claude-sonnet-5-5",
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: null, explanation: null },
      content: [],
      parsed_output: null,
    }));
    const set = await draftPhaseWording(plan, NOTE_LIBRARY, { client });
    expect(set.source).toBe("cached");
    expect(set.phases).toHaveLength(4);
  });

  it("rendered text only carries numbers that come from the engine", async () => {
    const set = await draftPhaseWording(plan, NOTE_LIBRARY, { client: null });
    for (const [i, p] of set.phases.entries()) {
      const phase = plan.phases[i]!;
      const values = phaseSlotValues(plan, phase);
      const allowed = new Set([
        String(phase.n),
        ...formatCents(phase.amountCents, "es").match(/[\d.,]+/g)!,
        ...formatCents(phase.amountCents, "en").match(/[\d.,]+/g)!,
        ...formatIsoDate(phase.payment.dueDate, "en", { month: "long" }).match(/\d+/g)!,
        ...phase.teeth.map(String),
        ...(values.minLagDays ? [String(values.minLagDays / 7)] : []),
      ]);
      for (const n of `${p.rendered.es} ${p.rendered.en}`.match(/\d[\d.,]*\d|\d/g) ?? []) {
        expect(allowed, `${phase.id}: ${n}`).toContain(n);
      }
    }
  });
});
