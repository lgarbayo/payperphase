/**
 * test helpers: a tiny route-based fetch mock and golden-derived fixtures.
 * (vi.mock calls live in each test file because they are hoisted per file.)
 */
import { vi } from "vitest";
import type { EditPlanResponse, ExtractionResult, Plan, PlanSummary, PlanViewResponse } from "@/contracts";
import { GOLDEN_BONE_GRAFT_DIFF, goldenExtraction, goldenPlan } from "@/contracts/fixtures/implantCase";
import { NOTE_LIBRARY } from "@data/seed/notes";

export const norm = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

export interface Call {
  key: string;
  url: string;
  method: string;
  body: unknown;
  rawBody: unknown;
}
export type Handler = (call: Call) => unknown | { __status: number; body: unknown } | Promise<unknown>;

/** Route-based fetch mock keyed by "METHOD /path" (query string ignored). */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const key = `${method} ${url.split("?")[0]}`;
    const rawBody = init.body;
    const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    const call = { key, url, method, body, rawBody };
    calls.push(call);
    const handler = routes[key];
    let status = 200;
    let payload: unknown;
    if (!handler) {
      status = 404;
      payload = { error: { code: "NOT_FOUND", message: key } };
    } else {
      const out = await handler(call);
      if (out && typeof out === "object" && "__status" in out) {
        const o = out as unknown as { __status: number; body: unknown };
        status = o.__status;
        payload = o.body;
      } else payload = out;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => structuredClone(payload),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls, find: (key: string) => calls.filter((c) => c.key === key) };
}

export function cachedGolden(): ExtractionResult {
  return { ...goldenExtraction(), source: "cached" };
}

/** Draft plan as POST /api/plans returns it (scaffold buildPlan shape). */
export function draftPlan(): Plan {
  const p = goldenPlan();
  return {
    ...p,
    status: "draft",
    baseline: undefined,
    approvedNotes: [],
    approvedBy: undefined,
    approvedAt: undefined,
    phases: p.phases.map((ph) => ({ ...ph, payment: { ...ph.payment, status: "scheduled" } })),
  };
}

/** The golden plan after the bone-graft edit (what the engine will return; built by hand here). */
export function boneGraftPlan(): Plan {
  const p = goldenPlan();
  const added = GOLDEN_BONE_GRAFT_DIFF.phases[0]!.addedLines[0]!;
  const startAfter = new Map(GOLDEN_BONE_GRAFT_DIFF.phases.map((d) => [d.phaseId, d.startAfter]));
  return {
    ...p,
    version: 2,
    lines: [...p.lines, added],
    totalCents: GOLDEN_BONE_GRAFT_DIFF.totalAfterCents,
    phases: p.phases.map((ph) => {
      const start = startAfter.get(ph.id) ?? ph.startDate;
      const base = { ...ph, startDate: start, payment: { ...ph.payment, dueDate: start } };
      return ph.id === "ph2" ? { ...base, amountCents: 195_000, lineIds: [...ph.lineIds, added.id] } : base;
    }),
  };
}

export function boneGraftResponse(): EditPlanResponse {
  return {
    plan: boneGraftPlan(),
    diff: structuredClone(GOLDEN_BONE_GRAFT_DIFF),
    explanation: {
      template: {
        es: "Se añade un injerto óseo a la fase {{phaseN}}.",
        en: "A bone graft is added to phase {{phaseN}}.",
      },
      rendered: {
        es: "Se añade un injerto óseo a la fase 2. Las fases siguientes esperan más para que el hueso cicatrice.",
        en: "A bone graft is added to phase 2. Later phases wait longer so the bone can heal.",
      },
      source: "cached",
    },
  };
}

export function clinicView(plan: Plan): PlanViewResponse {
  return {
    plan,
    clock: { today: "2026-11-16", startedAt: "2026-11-16", label: "simulated" },
    exposure: {
      asOf: "2026-11-16",
      totalCents: plan.totalCents,
      paidCents: 0,
      deliveredCents: 0,
      prepaidUndeliveredCents: 0,
      remainingCents: plan.totalCents,
      byPhase: [],
    },
    stress: {
      asOf: "2026-11-16",
      illustrative: true,
      sourceUrl: "https://www.dsca.gob.es/",
      linkedLoan: {
        financedCents: 0,
        months: 24,
        monthlyCents: 0,
        monthsElapsed: 0,
        repaidCents: 0,
        outstandingCents: 0,
        owedForUndeliveredCents: 0,
      },
      payPerPhase: { paidCents: 0, deliveredCents: 0, owedForUndeliveredCents: 0 },
      undeliveredPhaseIds: [],
    },
    notes: Object.values(NOTE_LIBRARY),
    modes: { paypal: "mock", paypalWebhooks: "mock", anthropic: "mock", agent: "playbook" },
  };
}

export const SUMMARIES: PlanSummary[] = [
  {
    id: "pln_ribera01",
    patientAlias: "María G.",
    caseKind: "implant",
    status: "approved",
    totalCents: 407_000,
    paidCents: 36_000,
    nextDue: { phaseId: "ph2", dueDate: "2027-01-12", status: "scheduled" },
    updatedAt: "2026-11-16T08:00:00.000Z",
  },
  {
    id: "pln_aligner1",
    patientAlias: "Javier P.",
    caseKind: "aligner",
    status: "approved",
    totalCents: 320_000,
    paidCents: 320_000,
    nextDue: null,
    updatedAt: "2026-11-16T08:00:00.000Z",
  },
];
