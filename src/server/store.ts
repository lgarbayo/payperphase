/**
 * OWNED BY WP-09. Plan store. Target: JSON file at DATA_DIR/db.json, seeded on boot, atomic writes.
 * SCAFFOLD STUB: in-memory implementation of the PlanStore contract seeded with the golden plan.
 */
import { HERO_PLAN_ALIAS, SIM_DEFAULT_START } from "@/contracts/constants";
import type {
  AgentStep,
  DemoBeat,
  ExtractionResult,
  PendingApproval,
  Plan,
  PlanStore,
  PlanSummary,
  SimClock,
  WebhookEventRecord,
} from "@/contracts";
import { seedCases } from "@data/seed";
import { setEventSimToday } from "./events";

interface Db {
  plans: Record<string, Plan>;
  extractions: Record<string, ExtractionResult>;
  clock: SimClock;
  heroPlanId: string | null;
  webhookEvents: Record<string, WebhookEventRecord>;
  agentSteps: AgentStep[];
  approvals: Record<string, PendingApproval>;
}

function seed(): Db {
  const db: Db = {
    plans: {},
    extractions: {},
    clock: { today: SIM_DEFAULT_START, startedAt: SIM_DEFAULT_START, label: "simulated" },
    heroPlanId: null,
    webhookEvents: {},
    agentSteps: [],
    approvals: {},
  };
  for (const c of seedCases()) {
    db.plans[c.plan.id] = c.plan;
    db.extractions[c.extraction.quoteId] = c.extraction;
    if (c.hero) db.heroPlanId = c.plan.id;
  }
  setEventSimToday(db.clock.today);
  return db;
}

const g = globalThis as unknown as { __pppDb?: Db };
const db = (): Db => (g.__pppDb ??= seed());

function summarize(p: Plan): PlanSummary {
  const next = p.phases.find((ph) => ph.payment.status !== "paid");
  return {
    id: p.id,
    patientAlias: p.patient.alias,
    caseKind: p.caseKind,
    status: p.status,
    totalCents: p.totalCents,
    paidCents: p.phases.filter((ph) => ph.payment.status === "paid").reduce((a, ph) => a + ph.amountCents, 0),
    nextDue: next ? { phaseId: next.id, dueDate: next.payment.dueDate, status: next.payment.status } : null,
    updatedAt: p.updatedAt,
  };
}

export const store: PlanStore = {
  async resolvePlanId(idOrAlias) {
    if (idOrAlias === HERO_PLAN_ALIAS) return db().heroPlanId;
    return db().plans[idOrAlias] ? idOrAlias : null;
  },
  async getPlan(id) {
    const real = await store.resolvePlanId(id);
    return real ? structuredClone(db().plans[real] ?? null) : null;
  },
  async listPlans() {
    return Object.values(db().plans).map(summarize);
  },
  async savePlan(plan) {
    db().plans[plan.id] = structuredClone(plan);
    return plan;
  },
  async updatePlan(id, fn) {
    const real = await store.resolvePlanId(id);
    const cur = real ? db().plans[real] : undefined;
    if (!cur) throw new Error(`Plan not found: ${id}`);
    const next = fn(structuredClone(cur));
    db().plans[next.id] = structuredClone(next);
    return next;
  },
  async saveExtraction(e) {
    db().extractions[e.quoteId] = structuredClone(e);
  },
  async getExtraction(quoteId) {
    return structuredClone(db().extractions[quoteId] ?? null);
  },
  async getClock() {
    return { ...db().clock };
  },
  async setClock(today) {
    db().clock = { ...db().clock, today };
    setEventSimToday(today);
    return { ...db().clock };
  },
  async recordWebhookEvent(record) {
    if (db().webhookEvents[record.eventId]) return false;
    db().webhookEvents[record.eventId] = record;
    return true;
  },
  async appendAgentStep(step) {
    db().agentSteps.push(step);
  },
  async listAgentSteps(planId) {
    return db().agentSteps.filter((s) => s.planId === planId);
  },
  async savePendingApproval(a) {
    db().approvals[a.id] = a;
  },
  async getPendingApproval(id) {
    return db().approvals[id] ?? null;
  },
  async listPendingApprovals(planId) {
    return Object.values(db().approvals).filter((a) => a.planId === planId);
  },
  async resetDemo() {
    g.__pppDb = seed();
  },
  async applyBeat(beat: DemoBeat) {
    void beat;
    g.__pppDb = seed();
  },
};
