/**
 * WP-09 · Plan API route handlers called directly with Request objects. The engine is mocked
 * (passthrough by default) wherever an assertion depends on engine behaviour, so these tests hold
 * against both the scaffold stub and WP-01's real engine.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine")>();
  return {
    ...actual,
    buildPlan: vi.fn(actual.buildPlan),
    validateMove: vi.fn(actual.validateMove),
    reschedule: vi.fn(actual.reschedule),
    applyPaymentStatuses: vi.fn(actual.applyPaymentStatuses),
    captureBaseline: vi.fn(actual.captureBaseline),
    applyEdit: vi.fn(actual.applyEdit),
    diffPlans: vi.fn(actual.diffPlans),
    markDelivered: vi.fn(actual.markDelivered),
  };
});
vi.mock("@/ai/wording", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/wording")>();
  return { ...actual, explainDiff: vi.fn(actual.explainDiff) };
});

import {
  ApiErrorSchema,
  DomainEventSchema,
  EditPlanResponseSchema,
  HERO_PLAN_ALIAS,
  ListPlansResponseSchema,
  PlanIdSchema,
  PlanResponseSchema,
  PlanViewResponseSchema,
  SIM_DEFAULT_START,
  WhatIfResponseSchema,
  type Plan,
  type WhatIfResult,
} from "@/contracts";
import {
  GOLDEN_BONE_GRAFT_DIFF,
  GOLDEN_BONE_GRAFT_EDIT,
  GOLDEN_DELAY_MOVE,
  GOLDEN_DENTIST,
  GOLDEN_ILLEGAL_MOVE,
  GOLDEN_PLAN_ID,
  GOLDEN_QUOTE_ID,
  goldenPlan,
} from "@/contracts/fixtures/implantCase";
import { explainDiff } from "@/ai/wording";
import {
  applyEdit,
  applyPaymentStatuses,
  buildPlan,
  captureBaseline,
  diffPlans,
  markDelivered,
  reschedule,
  validateMove,
} from "@/engine";
import { addDays } from "@/lib/dates";
import { store } from "@/server/store";
import { NOTE_LIBRARY } from "@data/seed/notes";
import { GET as listPlans, POST as createPlan } from "../../app/api/plans/route";
import { GET as getPlanRoute } from "../../app/api/plans/[id]/route";
import { POST as approveRoute } from "../../app/api/plans/[id]/approve/route";
import { POST as whatifRoute } from "../../app/api/plans/[id]/whatif/route";
import { POST as editRoute } from "../../app/api/plans/[id]/edit/route";
import { POST as deliverRoute } from "../../app/api/plans/[id]/phases/[phaseId]/deliver/route";
import { BASE, captureEvents, ctx, get, post, useTmpDataDir } from "./helpers";

useTmpDataDir();

beforeEach(async () => {
  vi.clearAllMocks();
  await store.init();
});

async function errorCode(res: Response): Promise<string> {
  return ApiErrorSchema.parse(await res.json()).error.code;
}

/** The golden plan as an unapproved draft, as buildPlan would leave it. */
function draft(id: string, patch: Partial<Plan> = {}): Plan {
  const p = goldenPlan();
  return {
    ...p,
    id,
    status: "draft",
    baseline: undefined,
    approvedNotes: [],
    approvedBy: undefined,
    approvedAt: undefined,
    phases: p.phases.map((ph) => ({ ...ph, summary: undefined, payment: { ...ph.payment, status: "scheduled" } })),
    ...patch,
  };
}

/** What a real reschedule of GOLDEN_DELAY_MOVE returns: ph2 +42 d, ph3/ph4 follow, version bumped. */
function delayedResult(plan: Plan): WhatIfResult {
  const moved = structuredClone(plan);
  moved.version += 1;
  moved.baseline = undefined; // the route must keep the stored baseline whatever the engine returns
  const shifts: WhatIfResult["shifts"] = [];
  for (const ph of moved.phases) {
    if (ph.n < 2) continue;
    const to = addDays(ph.startDate, 42);
    shifts.push({ phaseId: ph.id, fromStart: ph.startDate, toStart: to, deltaDays: 42, fromDue: ph.payment.dueDate, toDue: to });
    ph.startDate = to;
    ph.endDate = addDays(to, ph.durationDays);
    ph.payment.dueDate = to;
  }
  return { plan: moved, request: { ...GOLDEN_DELAY_MOVE }, shifts, warnings: [] };
}

// ------------------------------------------------------------------ what-if
describe("POST /api/plans/:id/whatif", () => {
  const url = `${BASE}/plans/demo/whatif`;

  it("returns 409 with the engine's validation on an invalid move, and saves nothing", async () => {
    vi.mocked(validateMove).mockReturnValueOnce({
      ok: false,
      reason: "MIN_LAG",
      noteId: "HEALING_EXTRACTION_MIN_8W",
      earliestStartDate: "2027-01-12",
    });
    const before = await store.getPlan(HERO_PLAN_ALIAS);
    const bus = captureEvents();
    const res = await whatifRoute(post(url, GOLDEN_ILLEGAL_MOVE), ctx({ id: HERO_PLAN_ALIAS }));
    bus.stop();
    expect(res.status).toBe(409);
    expect(WhatIfResponseSchema.parse(await res.json())).toEqual({
      ok: false,
      validation: { ok: false, reason: "MIN_LAG", noteId: "HEALING_EXTRACTION_MIN_8W", earliestStartDate: "2027-01-12" },
    });
    expect(validateMove).toHaveBeenCalledWith(expect.objectContaining({ id: GOLDEN_PLAN_ID }), GOLDEN_ILLEGAL_MOVE, SIM_DEFAULT_START);
    expect(reschedule).not.toHaveBeenCalled();
    expect(await store.getPlan(HERO_PLAN_ALIAS)).toEqual(before);
    expect(bus.events).toEqual([]);
  });

  it("persists a valid move (persist defaults to true), keeps the baseline, publishes PLAN_RESCHEDULED", async () => {
    const before = (await store.getPlan(HERO_PLAN_ALIAS))!;
    vi.mocked(validateMove).mockReturnValueOnce({ ok: true });
    vi.mocked(reschedule).mockImplementationOnce((plan) => delayedResult(plan));
    const bus = captureEvents();
    const res = await whatifRoute(post(url, GOLDEN_DELAY_MOVE), ctx({ id: HERO_PLAN_ALIAS }));
    bus.stop();

    expect(res.status).toBe(200);
    const body = WhatIfResponseSchema.parse(await res.json());
    if (!body.ok) throw new Error("expected ok");
    const stored = (await store.getPlan(HERO_PLAN_ALIAS))!;
    expect(body.result.plan).toEqual(stored);
    expect(stored.phases.map((p) => p.startDate)).toEqual(["2026-11-16", "2027-02-23", "2027-05-19", "2027-06-03"]);
    expect(stored.version).toBe(before.version + 1);
    expect(stored.baseline).toEqual(before.baseline); // baseline untouched
    expect(body.result.shifts).toHaveLength(3);

    expect(bus.types()).toEqual(["PLAN_RESCHEDULED"]);
    expect(DomainEventSchema.parse(bus.events[0])).toMatchObject({
      type: "PLAN_RESCHEDULED",
      planId: GOLDEN_PLAN_ID,
      version: before.version + 1,
      shifts: body.result.shifts,
    });
  });

  it("re-derives payment statuses for the new dates and publishes the transitions", async () => {
    vi.mocked(validateMove).mockReturnValueOnce({ ok: true });
    vi.mocked(applyPaymentStatuses).mockImplementationOnce((plan) => ({
      plan: { ...plan, phases: plan.phases.map((p) => (p.id === "ph2" ? { ...p, payment: { ...p.payment, status: "upcoming" } } : p)) },
      changes: [{ phaseId: "ph2", from: "scheduled", to: "upcoming" }],
    }));
    const bus = captureEvents();
    const res = await whatifRoute(post(url, { phaseId: "ph2", newStartDate: "2026-11-24" }), ctx({ id: GOLDEN_PLAN_ID }));
    bus.stop();
    expect(res.status).toBe(200);
    expect(bus.types()).toEqual(["PLAN_RESCHEDULED", "PHASE_STATUS_CHANGED"]);
    expect((await store.getPlan(GOLDEN_PLAN_ID))!.phases[1]!.payment.status).toBe("upcoming");
  });

  it("persist:false returns a preview without saving or publishing", async () => {
    const before = await store.getPlan(HERO_PLAN_ALIAS);
    vi.mocked(validateMove).mockReturnValueOnce({ ok: true });
    vi.mocked(reschedule).mockImplementationOnce((plan) => delayedResult(plan));
    const bus = captureEvents();
    const res = await whatifRoute(post(url, { ...GOLDEN_DELAY_MOVE, persist: false }), ctx({ id: HERO_PLAN_ALIAS }));
    bus.stop();
    expect(res.status).toBe(200);
    const body = WhatIfResponseSchema.parse(await res.json());
    expect(body.ok && body.result.plan.phases[1]!.startDate).toBe("2027-02-23");
    expect(await store.getPlan(HERO_PLAN_ALIAS)).toEqual(before);
    expect(bus.events).toEqual([]);
  });

  it("validates the body and the plan id", async () => {
    const bad = await whatifRoute(post(url, { phaseId: "phase-2", newStartDate: "soon" }), ctx({ id: HERO_PLAN_ALIAS }));
    expect(bad.status).toBe(422);
    expect(await errorCode(bad)).toBe("VALIDATION");
    const missing = await whatifRoute(post(url, GOLDEN_DELAY_MOVE), ctx({ id: "pln_missing1" }));
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("NOT_FOUND");
  });
});

// ------------------------------------------------------------------ approve
describe("POST /api/plans/:id/approve", () => {
  const body = {
    approvedBy: GOLDEN_DENTIST,
    noteIds: ["HEALING_EXTRACTION_MIN_8W", "PAY_IN_3_RANGE", "PAY_IN_3_RANGE"],
    summaries: [{ phaseId: "ph1", text: { es: "Primera visita: limpieza y extracción.", en: "First visit: cleaning and extraction." } }],
  };

  it("approves a draft: notes, approver, summaries, baseline, statuses, hero promotion, PLAN_APPROVED", async () => {
    await store.savePlan(draft("pln_draft001"));
    vi.mocked(applyPaymentStatuses).mockImplementationOnce((plan, today) => {
      expect(today).toBe(SIM_DEFAULT_START);
      return {
        plan: { ...plan, phases: plan.phases.map((p) => (p.id === "ph1" ? { ...p, payment: { ...p.payment, status: "due" } } : p)) },
        changes: [{ phaseId: "ph1", from: "scheduled", to: "due" }],
      };
    });
    const bus = captureEvents();
    const res = await approveRoute(post(`${BASE}/plans/pln_draft001/approve`, body), ctx({ id: "pln_draft001" }));
    bus.stop();

    expect(res.status).toBe(200);
    const { plan } = PlanResponseSchema.parse(await res.json());
    expect(plan.status).toBe("approved");
    expect(plan.approvedBy).toBe(GOLDEN_DENTIST);
    expect(plan.approvedAt).toBeDefined();
    expect(plan.approvedNotes).toEqual([
      { noteId: "HEALING_EXTRACTION_MIN_8W", noteVersion: NOTE_LIBRARY.HEALING_EXTRACTION_MIN_8W.version, approvedBy: GOLDEN_DENTIST, approvedAt: plan.approvedAt },
      { noteId: "PAY_IN_3_RANGE", noteVersion: NOTE_LIBRARY.PAY_IN_3_RANGE.version, approvedBy: GOLDEN_DENTIST, approvedAt: plan.approvedAt },
    ]);
    expect(plan.phases[0]!.summary).toEqual(body.summaries[0]!.text);
    expect(plan.phases[1]!.summary).toBeUndefined();
    expect(captureBaseline).toHaveBeenCalledTimes(1);
    expect(plan.baseline?.phases.map((b) => b.startDate)).toEqual(plan.phases.map((p) => p.startDate));
    expect(plan.phases[0]!.payment.status).toBe("due");

    expect(await store.getPlan("pln_draft001")).toEqual(plan); // persisted
    expect(await store.resolvePlanId(HERO_PLAN_ALIAS)).toBe("pln_draft001"); // implant → hero
    expect(bus.types()).toEqual(["PLAN_APPROVED"]);
    expect(bus.events[0]).toMatchObject({ type: "PLAN_APPROVED", planId: "pln_draft001", version: plan.version });
  });

  it("only drafts can be approved (409), and only implant plans become the hero", async () => {
    const again = await approveRoute(post(`${BASE}/plans/demo/approve`, body), ctx({ id: HERO_PLAN_ALIAS }));
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("PLAN_NOT_DRAFT");

    await store.savePlan(draft("pln_align001", { caseKind: "aligner" }));
    const res = await approveRoute(post(`${BASE}/plans/pln_align001/approve`, body), ctx({ id: "pln_align001" }));
    expect(res.status).toBe(200);
    expect(await store.resolvePlanId(HERO_PLAN_ALIAS)).toBe(GOLDEN_PLAN_ID);
  });

  it("rejects unknown plans, unknown phases and invalid bodies without saving", async () => {
    await store.savePlan(draft("pln_draft002"));
    const missing = await approveRoute(post(`${BASE}/plans/x/approve`, body), ctx({ id: "pln_missing1" }));
    expect(missing.status).toBe(404);
    const badPhase = await approveRoute(
      post(`${BASE}/plans/pln_draft002/approve`, { ...body, summaries: [{ phaseId: "ph9", text: { es: "x", en: "x" } }] }),
      ctx({ id: "pln_draft002" }),
    );
    expect(badPhase.status).toBe(422);
    expect(await errorCode(badPhase)).toBe("UNKNOWN_PHASE");
    const badBody = await approveRoute(post(`${BASE}/plans/pln_draft002/approve`, { approvedBy: "", noteIds: ["NOPE"] }), ctx({ id: "pln_draft002" }));
    expect(badBody.status).toBe(422);
    expect(await errorCode(badBody)).toBe("VALIDATION");
    expect((await store.getPlan("pln_draft002"))?.status).toBe("draft");
  });
});

// ------------------------------------------------------------------ edit
describe("POST /api/plans/:id/edit", () => {
  const url = `${BASE}/plans/demo/edit`;
  /** The golden plan after the bone-graft edit, as WP-01 produces it. */
  function grafted(plan: Plan): Plan {
    const line = GOLDEN_BONE_GRAFT_DIFF.phases[0]!.addedLines[0]!;
    return {
      ...plan,
      version: plan.version + 1,
      lines: [...plan.lines, line],
      totalCents: plan.totalCents + 45_000,
      phases: plan.phases.map((p) => {
        const d = GOLDEN_BONE_GRAFT_DIFF.phases.find((x) => x.phaseId === p.id);
        if (!d) return p;
        const startDate = d.startAfter;
        return {
          ...p,
          lineIds: p.id === "ph2" ? [...p.lineIds, line.id] : p.lineIds,
          amountCents: d.amountAfterCents,
          startDate,
          endDate: addDays(startDate, p.durationDays),
          payment: { ...p.payment, dueDate: startDate },
        };
      }),
    };
  }
  const explanation = {
    template: { es: "Fase {{phaseN}}: +{{amount}}", en: "Phase {{phaseN}}: +{{amount}}" },
    rendered: { es: "Fase 2: +450,00 €", en: "Phase 2: +€450.00" },
    source: "cached" as const,
  };

  it("runs applyEdit + diffPlans + explainDiff, saves, publishes PLAN_EDITED {diff}", async () => {
    vi.mocked(applyEdit).mockImplementationOnce((plan) => grafted(plan));
    vi.mocked(diffPlans).mockReturnValueOnce(GOLDEN_BONE_GRAFT_DIFF);
    vi.mocked(explainDiff).mockResolvedValueOnce(explanation);
    const bus = captureEvents();
    const res = await editRoute(post(url, { edit: GOLDEN_BONE_GRAFT_EDIT, editedBy: GOLDEN_DENTIST }), ctx({ id: HERO_PLAN_ALIAS }));
    bus.stop();

    expect(res.status).toBe(200);
    const body = EditPlanResponseSchema.parse(await res.json());
    expect(body.diff).toEqual(GOLDEN_BONE_GRAFT_DIFF);
    expect(body.explanation).toEqual(explanation);
    expect(applyEdit).toHaveBeenCalledWith(expect.objectContaining({ id: GOLDEN_PLAN_ID }), GOLDEN_BONE_GRAFT_EDIT, expect.any(String));
    expect(diffPlans).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }), expect.objectContaining({ version: 2 }));

    const stored = (await store.getPlan(HERO_PLAN_ALIAS))!;
    expect(body.plan).toEqual(stored);
    expect(stored.phases[1]!.amountCents).toBe(195_000);
    expect(stored.version).toBe(2);
    expect(explainDiff).toHaveBeenCalledWith(GOLDEN_BONE_GRAFT_DIFF, stored);

    expect(bus.types()).toEqual(["PLAN_EDITED"]);
    expect(DomainEventSchema.parse(bus.events[0])).toMatchObject({ type: "PLAN_EDITED", planId: GOLDEN_PLAN_ID, diff: GOLDEN_BONE_GRAFT_DIFF });
  });

  it("still succeeds (without an explanation) when explainDiff fails", async () => {
    vi.mocked(explainDiff).mockRejectedValueOnce(new Error("LLM timeout"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await editRoute(post(url, { edit: GOLDEN_BONE_GRAFT_EDIT, editedBy: GOLDEN_DENTIST }), ctx({ id: HERO_PLAN_ALIAS }));
    warn.mockRestore();
    expect(res.status).toBe(200);
    const body = EditPlanResponseSchema.parse(await res.json());
    expect(body.explanation).toBeUndefined();
  });

  it("maps engine refusals to 409 and leaves the plan alone", async () => {
    const before = await store.getPlan(HERO_PLAN_ALIAS);
    vi.mocked(applyEdit).mockImplementationOnce(() => {
      throw Object.assign(new Error("Phase ph1 is paid and cannot be edited"), { name: "EngineError", code: "PHASE_PAID" });
    });
    const bus = captureEvents();
    const res = await editRoute(
      post(url, { edit: { kind: "SET_UNIT_PRICE", lineId: "L1", unitPriceCents: 1 }, editedBy: GOLDEN_DENTIST }),
      ctx({ id: HERO_PLAN_ALIAS }),
    );
    bus.stop();
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("PHASE_PAID");
    expect(await store.getPlan(HERO_PLAN_ALIAS)).toEqual(before);
    expect(bus.events).toEqual([]);
  });

  it("validates the edit body", async () => {
    const res = await editRoute(post(url, { edit: { kind: "ADD_LINE" }, editedBy: GOLDEN_DENTIST }), ctx({ id: HERO_PLAN_ALIAS }));
    expect(res.status).toBe(422);
  });
});

// ------------------------------------------------------------------ deliver
describe("POST /api/plans/:id/phases/:phaseId/deliver", () => {
  const url = `${BASE}/plans/demo/phases/ph1/deliver`;

  it("calls markDelivered on the simulated day, persists, publishes PHASE_DELIVERED once", async () => {
    const bus = captureEvents();
    const res = await deliverRoute(post(url), ctx({ id: HERO_PLAN_ALIAS, phaseId: "ph1" }));
    expect(res.status).toBe(200);
    const { plan } = PlanResponseSchema.parse(await res.json());
    expect(markDelivered).toHaveBeenCalledWith(expect.objectContaining({ id: GOLDEN_PLAN_ID }), "ph1", SIM_DEFAULT_START);
    expect(plan.phases[0]!.delivery).toEqual({ status: "delivered", deliveredOn: SIM_DEFAULT_START });
    expect((await store.getPlan(GOLDEN_PLAN_ID))!.phases[0]!.delivery.status).toBe("delivered");

    await deliverRoute(post(url), ctx({ id: HERO_PLAN_ALIAS, phaseId: "ph1" })); // idempotent
    bus.stop();
    expect(bus.types()).toEqual(["PHASE_DELIVERED"]);
    expect(bus.events[0]).toMatchObject({ planId: GOLDEN_PLAN_ID, phaseId: "ph1" });
  });

  it("404s on unknown plans or phases; drafts cannot be delivered", async () => {
    const phase = await deliverRoute(post(url), ctx({ id: HERO_PLAN_ALIAS, phaseId: "ph9" }));
    expect(phase.status).toBe(404);
    expect(await errorCode(phase)).toBe("UNKNOWN_PHASE");
    const plan = await deliverRoute(post(url), ctx({ id: "pln_missing1", phaseId: "ph1" }));
    expect(plan.status).toBe(404);
    await store.savePlan(draft("pln_draft003"));
    const d = await deliverRoute(post(url), ctx({ id: "pln_draft003", phaseId: "ph1" }));
    expect(d.status).toBe(409);
  });
});

// ------------------------------------------------------------------ create + read
describe("POST /api/plans (create) and GET /api/plans[/:id]", () => {
  it("builds a draft from a stored extraction and publishes PLAN_CREATED", async () => {
    const bus = captureEvents();
    const res = await createPlan(post(`${BASE}/plans`, { quoteId: GOLDEN_QUOTE_ID }));
    bus.stop();
    expect(res.status).toBe(201);
    const { plan } = PlanResponseSchema.parse(await res.json());
    expect(PlanIdSchema.safeParse(plan.id).success).toBe(true);
    expect(plan.id).not.toBe(GOLDEN_PLAN_ID);
    expect(plan.status).toBe("draft");
    expect(plan.quoteId).toBe(GOLDEN_QUOTE_ID);

    const input = vi.mocked(buildPlan).mock.calls[0]![0];
    expect(input.extraction.quoteId).toBe(GOLDEN_QUOTE_ID);
    expect(input.caseKind).toBe("implant");
    expect(input.startDate).toBe(SIM_DEFAULT_START);
    expect(input.today).toBe(SIM_DEFAULT_START);
    expect(input.clinic.name).toBe("Clínica Dental Ribera");
    expect(input.patient.alias).toBe("María G.");

    expect(await store.getPlan(plan.id)).toEqual(plan);
    expect(bus.events).toMatchObject([{ type: "PLAN_CREATED", planId: plan.id }]);
    expect(await store.resolvePlanId(HERO_PLAN_ALIAS)).toBe(GOLDEN_PLAN_ID); // drafts never become the hero
  });

  it("honours startDate, 404s on an unknown quote, 422 on a bad body", async () => {
    const ok = await createPlan(post(`${BASE}/plans`, { quoteId: GOLDEN_QUOTE_ID, caseKind: "implant", startDate: "2026-11-23" }));
    expect(ok.status).toBe(201);
    expect(vi.mocked(buildPlan).mock.calls[0]![0].startDate).toBe("2026-11-23");
    const missing = await createPlan(post(`${BASE}/plans`, { quoteId: "q_nope" }));
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("UNKNOWN_QUOTE");
    const bad = await createPlan(post(`${BASE}/plans`, { caseKind: "braces" }));
    expect(bad.status).toBe(422);
  });

  it("GET /api/plans lists summaries, hero first", async () => {
    await store.savePlan(draft("pln_draft004"));
    const res = await listPlans();
    const { plans } = ListPlansResponseSchema.parse(await res.json());
    expect(plans.map((p) => p.id)).toEqual([GOLDEN_PLAN_ID, "pln_draft004"]);
    expect(plans[0]).toMatchObject({ totalCents: 407_000, paidCents: 0, nextDue: { phaseId: "ph1", status: "due" } });
  });

  it("GET /api/plans/demo?view=patient|clinic builds the PlanViewResponse", async () => {
    const res = await getPlanRoute(get(`${BASE}/plans/demo?view=patient`), ctx({ id: HERO_PLAN_ALIAS }));
    expect(res.status).toBe(200);
    const patient = PlanViewResponseSchema.parse(await res.json());
    expect(patient.plan.id).toBe(GOLDEN_PLAN_ID);
    expect(patient.clock.label).toBe("simulated");
    expect(patient.exposure.prepaidUndeliveredCents).toBe(0);
    const approved = new Set(patient.plan.approvedNotes.map((n) => n.noteId));
    expect(patient.notes.length).toBeGreaterThan(0);
    expect(patient.notes.every((n) => approved.has(n.id))).toBe(true);
    expect(patient.modes.paypal).toBe("mock");

    const clinic = PlanViewResponseSchema.parse(
      await (await getPlanRoute(get(`${BASE}/plans/demo?view=clinic`), ctx({ id: HERO_PLAN_ALIAS }))).json(),
    );
    expect(clinic.notes).toHaveLength(Object.keys(NOTE_LIBRARY).length);

    const missing = await getPlanRoute(get(`${BASE}/plans/pln_missing1`), ctx({ id: "pln_missing1" }));
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("NOT_FOUND");
  });
});
