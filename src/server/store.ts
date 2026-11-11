/**
 * OWNED BY WP-09. Plan store: one JSON file at DATA_DIR/db.json.
 *
 * - Loaded (or seeded into beat state B2) on first use; `boot()` triggers it at server start.
 *   Every record is validated with its contract schema. A corrupt or invalid file is moved aside
 *   (db.json.corrupt-<ms>) and the store reseeds, so the demo always comes up.
 * - Every write goes through one promise queue (read-modify-write is serialized, nothing is lost
 *   under concurrent `updatePlan` calls) and is atomic: write a temp file, then rename over db.json.
 *   A failed write leaves both the file and the in-memory state untouched.
 * - Writes are validated before they reach disk, so a bad caller cannot poison db.json.
 * - State lives on globalThis so it survives Next dev HMR and is shared between the
 *   instrumentation bundle (boot, agent) and the route-handler bundles.
 * - Events are published AFTER persisting (the agent and SSE always read fresh state).
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import {
  AgentStepSchema,
  ExtractionResultSchema,
  HERO_PLAN_ALIAS,
  PendingApprovalSchema,
  PlanSchema,
  WebhookEventRecordSchema,
  planShortCode,
  type DemoBeat,
  type PaymentStatus,
  type Plan,
  type PlanStore,
  type PlanSummary,
  type SimClock,
  type WebhookEventRecord,
} from "@/contracts";
import { applyPaymentStatuses } from "@/engine";
import { serverEnv } from "@/env";
import { addDays, isIsoDate } from "@/lib/dates";
import { nowIso } from "@/lib/http";
import { InvalidRecordError, PlanNotFoundError, RouteError } from "./errors";
import { publish, setEventSimToday } from "./events";
import { newPlanId, randomAlnum } from "./ids";
import { DbSchema, beatHasHero, seedDb, type Db } from "./seed";

export const DB_FILE_NAME = "db.json";
/** serverEnv()'s DATA_DIR default. */
const DEFAULT_DATA_DIR = "./.data";
/** Oldest agent steps are dropped beyond this many (keeps db.json small through judging). */
export const MAX_AGENT_STEPS = 5_000;

export interface PlanStatusChange {
  planId: string;
  phaseId: string;
  from: PaymentStatus;
  to: PaymentStatus;
}

/**
 * The contract's PlanStore plus a few server-only helpers (filed as a Contract change request to
 * add them to the interface). Consumers typed against PlanStore keep working unchanged.
 */
export interface ServerStore extends PlanStore {
  /**
   * Load or seed db.json. Idempotent; every other method calls it implicitly.
   * `seeded` is true when this process created the DB from the seed (no file, or a corrupt one).
   */
  init(): Promise<{ seeded: boolean }>;
  /** Promote a plan to the hero (alias "demo"); null clears the alias. */
  setHeroPlanId(id: string | null): Promise<void>;
  /** Synchronous hero id (null before the first load). Used by the SSE alias filter. */
  peekHeroPlanId(): string | null;
  /** Atomically move the simulated clock forward by `days` (same effects as setClock). */
  advanceClock(days: number): Promise<SimClock>;
  /** Re-derive every plan's payment statuses at the current simulated day (boot). No events. */
  refreshPaymentStatuses(): Promise<PlanStatusChange[]>;
  /** Absolute path of db.json, or null for an in-memory store. */
  dbPath(): string | null;
  /** The plan's PayPal webhook audit records (alias "demo" allowed), oldest first by receivedAt. */
  listWebhookEvents(planId: string): Promise<WebhookEventRecord[]>;
}

export interface StoreOptions {
  /** Directory holding db.json; null keeps everything in memory (nothing is read or written). */
  dataDir: string | null;
  /** First simulated day (SIM_START_DATE); boot, reset and every beat put the clock here. */
  simStart: string;
}

interface StoreState {
  file: string | null;
  simStart: string;
  db: Db | null;
  loading: Promise<Db> | null;
  /** True once this process had to seed the DB (missing or invalid file). */
  seeded: boolean;
  queue: Promise<unknown>;
}

function newState(opts: StoreOptions): StoreState {
  return {
    file: opts.dataDir === null ? null : path.resolve(opts.dataDir, DB_FILE_NAME),
    simStart: opts.simStart,
    db: null,
    loading: null,
    seeded: false,
    queue: Promise.resolve(),
  };
}

const g = globalThis as unknown as { __pppStoreState?: StoreState };

function globalState(): StoreState {
  if (!g.__pppStoreState) {
    const env = serverEnv();
    // Under Vitest (NODE_ENV=test) with the default DATA_DIR the store is in-memory, like the scaffold
    // stub was: tests that touch the real store stay hermetic (nothing shared between parallel workers
    // or carried over from the last run in ./.data). Set DATA_DIR explicitly to test the file store.
    const dataDir = env.NODE_ENV === "test" && env.DATA_DIR === DEFAULT_DATA_DIR ? null : env.DATA_DIR;
    g.__pppStoreState = newState({ dataDir, simStart: env.SIM_START_DATE });
  }
  return g.__pppStoreState;
}

// ---------------------------------------------------------------- persistence

async function writeDb(s: StoreState, db: Db): Promise<void> {
  if (s.file === null) return;
  const file = s.file;
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomAlnum(6)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  try {
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function readDbFile(s: StoreState): Promise<{ db: Db } | { missing: true } | { invalid: string }> {
  if (s.file === null) return { missing: true };
  let text: string;
  try {
    text = await readFile(s.file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { missing: true };
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { invalid: `not JSON (${(err as Error).message})` };
  }
  const parsed = DbSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { invalid: `${first?.path.join(".") ?? "?"}: ${first?.message ?? "invalid"}` };
  }
  const db = parsed.data as Db;
  if (db.heroPlanId && !db.plans[db.heroPlanId]) db.heroPlanId = null;
  return { db };
}

function load(s: StoreState): Promise<Db> {
  if (s.db) return Promise.resolve(s.db);
  s.loading ??= (async () => {
    const res = await readDbFile(s);
    let db: Db;
    if ("db" in res) {
      db = res.db;
    } else {
      if ("invalid" in res && s.file !== null) {
        const aside = `${s.file}.corrupt-${Date.now()}`;
        console.warn(`[store] ${s.file} is invalid (${res.invalid}); moved to ${aside} and reseeding.`);
        await rename(s.file, aside).catch(() => undefined);
      }
      db = seedDb({ beat: "B2_PLAN_SENT", simStart: s.simStart, now: nowIso() });
      await writeDb(s, db);
      s.seeded = true;
    }
    s.db = db;
    setEventSimToday(db.clock.today);
    return db;
  })().finally(() => {
    s.loading = null;
  });
  return s.loading;
}

/** Run `task` after every earlier queued task, whether they succeeded or not. */
function enqueue<T>(s: StoreState, task: () => Promise<T>): Promise<T> {
  const run = s.queue.then(task);
  s.queue = run.catch(() => undefined);
  return run;
}

interface MutateCtx {
  /** The mutation turned out to be a no-op: skip the disk write. */
  skipWrite(): void;
}

/** Serialized, atomic read-modify-write. `fn` edits a private copy; it is committed only once on disk. */
function mutate<T>(s: StoreState, fn: (db: Db, ctx: MutateCtx) => T): Promise<T> {
  return enqueue(s, async () => {
    const cur = await load(s);
    const next = structuredClone(cur);
    let write = true;
    const result = fn(next, { skipWrite: () => (write = false) });
    if (write) {
      await writeDb(s, next);
      s.db = next;
    }
    return structuredClone(result);
  });
}

/** Serialized wholesale replacement (reset / beats). */
function replace(s: StoreState, build: (cur: Db) => Db): Promise<Db> {
  return enqueue(s, async () => {
    const cur = await load(s);
    const next = build(cur);
    await writeDb(s, next);
    s.db = next;
    return structuredClone(next);
  });
}

async function read<T>(s: StoreState, fn: (db: Db) => T): Promise<T> {
  const db = await load(s);
  return structuredClone(fn(db));
}

// ---------------------------------------------------------------- helpers

function resolveIn(db: Db, idOrAlias: string): string | null {
  if (idOrAlias === HERO_PLAN_ALIAS) return db.heroPlanId && db.plans[db.heroPlanId] ? db.heroPlanId : null;
  return Object.hasOwn(db.plans, idOrAlias) ? idOrAlias : null;
}

function validate<S extends z.ZodType>(kind: string, schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new InvalidRecordError(kind, `${first?.path.map(String).join(".") || "(root)"}: ${first?.message ?? "invalid"}`);
  }
  return parsed.data;
}

function validPlan(plan: Plan): Plan {
  return validate("plan", PlanSchema, plan);
}

function summarize(p: Plan): PlanSummary {
  const ordered = [...p.phases].sort((a, b) => a.n - b.n);
  const next = ordered.find((ph) => ph.payment.status !== "paid");
  return {
    id: p.id,
    patientAlias: p.patient.alias,
    caseKind: p.caseKind,
    status: p.status,
    totalCents: p.totalCents,
    paidCents: ordered
      .filter((ph) => ph.payment.status === "paid")
      .reduce((a, ph) => a + (ph.payment.paidCents ?? ph.amountCents), 0),
    nextDue: next ? { phaseId: next.id, dueDate: next.payment.dueDate, status: next.payment.status } : null,
    updatedAt: p.updatedAt,
  };
}

/** Re-derive statuses for every plan at `today` (inside a mutation). */
function deriveStatuses(db: Db, today: string, now: string): PlanStatusChange[] {
  const all: PlanStatusChange[] = [];
  for (const id of Object.keys(db.plans)) {
    const { plan, changes } = applyPaymentStatuses(db.plans[id]!, today);
    if (changes.length === 0) continue;
    db.plans[id] = validPlan({ ...plan, updatedAt: now });
    for (const c of changes) all.push({ planId: id, phaseId: c.phaseId, from: c.from, to: c.to });
  }
  return all;
}

/** A fresh hero id whose plan4 differs from every stored plan's (unique PayPal invoice numbers). */
function freshHeroId(db: Db): string {
  const used = new Set(Object.keys(db.plans).map(planShortCode));
  return newPlanId((id) => used.has(planShortCode(id)) || Object.hasOwn(db.plans, id));
}

/**
 * Move the simulated clock (computed inside the write queue, so two quick "+7 weeks" presses
 * both count), re-derive every plan's payment statuses, persist, then publish one
 * PHASE_STATUS_CHANGED per change followed by CLOCK_ADVANCED.
 */
async function moveClock(s: StoreState, compute: (today: string) => string): Promise<SimClock> {
  const now = nowIso();
  const { from, clock, changes } = await mutate(s, (db) => {
    const prev = db.clock.today;
    const today = compute(prev);
    db.clock = { ...db.clock, today };
    return { from: prev, clock: db.clock as SimClock, changes: deriveStatuses(db, today, now) };
  });
  setEventSimToday(clock.today);
  for (const c of changes) {
    publish({ type: "PHASE_STATUS_CHANGED", planId: c.planId, phaseId: c.phaseId, from: c.from, to: c.to });
  }
  if (from !== clock.today) publish({ type: "CLOCK_ADVANCED", from, to: clock.today });
  return clock;
}

function publishBeatEvents(db: Db): void {
  setEventSimToday(db.clock.today);
  publish({ type: "DEMO_RESET" });
  const hero = db.heroPlanId ? db.plans[db.heroPlanId] : undefined;
  // The agent reacts to PLAN_APPROVED by (idempotently) issuing the hero's phase invoices.
  if (hero && hero.status === "approved") publish({ type: "PLAN_APPROVED", planId: hero.id, version: hero.version });
}

// ---------------------------------------------------------------- store

function makeStore(st: () => StoreState): ServerStore {
  const self: ServerStore = {
    async init() {
      await load(st());
      return { seeded: st().seeded };
    },

    dbPath() {
      return st().file;
    },

    peekHeroPlanId() {
      return st().db?.heroPlanId ?? null;
    },

    async resolvePlanId(idOrAlias) {
      return read(st(), (db) => resolveIn(db, idOrAlias));
    },

    async getPlan(id) {
      return read(st(), (db) => {
        const real = resolveIn(db, id);
        return real ? db.plans[real]! : null;
      });
    },

    async listPlans() {
      return read(st(), (db) =>
        Object.values(db.plans)
          .map(summarize)
          .sort((a, b) => {
            if (a.id === db.heroPlanId) return -1;
            if (b.id === db.heroPlanId) return 1;
            return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
          }),
      );
    },

    async savePlan(plan) {
      const valid = validPlan({ ...plan, updatedAt: nowIso() });
      return mutate(st(), (db) => {
        db.plans[valid.id] = valid;
        return valid;
      });
    },

    async updatePlan(id, fn) {
      return mutate(st(), (db) => {
        const real = resolveIn(db, id);
        if (!real) throw new PlanNotFoundError(id);
        const next = fn(structuredClone(db.plans[real]!));
        if (next.id !== real) throw new RouteError(500, "PLAN_ID_CHANGED", `updatePlan must not change the plan id (${real} → ${next.id})`);
        const valid = validPlan({ ...next, updatedAt: nowIso() });
        db.plans[real] = valid;
        return valid;
      });
    },

    async saveExtraction(extraction) {
      const valid = validate("extraction", ExtractionResultSchema, extraction);
      await mutate(st(), (db) => {
        db.extractions[valid.quoteId] = valid;
      });
    },

    async getExtraction(quoteId) {
      return read(st(), (db) => (Object.hasOwn(db.extractions, quoteId) ? db.extractions[quoteId]! : null));
    },

    async getClock() {
      return read(st(), (db) => db.clock);
    },

    async setClock(today) {
      if (!isIsoDate(today)) throw new RouteError(422, "VALIDATION", `Expected YYYY-MM-DD, got ${today}`);
      return moveClock(st(), () => today);
    },

    async advanceClock(days) {
      if (!Number.isInteger(days)) throw new RouteError(422, "VALIDATION", `advanceDays must be an integer, got ${days}`);
      return moveClock(st(), (cur) => addDays(cur, days));
    },

    async refreshPaymentStatuses() {
      const now = nowIso();
      return mutate(st(), (db, ctx) => {
        const changes = deriveStatuses(db, db.clock.today, now);
        if (changes.length === 0) ctx.skipWrite();
        return changes;
      });
    },

    async recordWebhookEvent(record) {
      const valid = validate("webhook event", WebhookEventRecordSchema, record);
      return mutate(st(), (db, ctx) => {
        if (Object.hasOwn(db.webhookEvents, valid.eventId)) {
          ctx.skipWrite();
          return false;
        }
        db.webhookEvents[valid.eventId] = valid;
        return true;
      });
    },

    async appendAgentStep(step) {
      const valid = validate("agent step", AgentStepSchema, step);
      await mutate(st(), (db) => {
        db.agentSteps.push(valid);
        if (db.agentSteps.length > MAX_AGENT_STEPS) db.agentSteps.splice(0, db.agentSteps.length - MAX_AGENT_STEPS);
      });
    },

    async listAgentSteps(planId) {
      return read(st(), (db) => {
        const real = resolveIn(db, planId) ?? planId;
        return db.agentSteps.filter((s) => s.planId === real);
      });
    },

    async listWebhookEvents(planId) {
      return read(st(), (db) => {
        const real = resolveIn(db, planId) ?? planId;
        return Object.values(db.webhookEvents)
          .filter((e) => e.planId === real)
          .sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : 0));
      });
    },

    async savePendingApproval(approval) {
      const valid = validate("pending approval", PendingApprovalSchema, approval);
      await mutate(st(), (db) => {
        db.approvals[valid.id] = valid;
      });
    },

    async getPendingApproval(id) {
      return read(st(), (db) => (Object.hasOwn(db.approvals, id) ? db.approvals[id]! : null));
    },

    async listPendingApprovals(planId) {
      return read(st(), (db) => {
        const real = resolveIn(db, planId) ?? planId;
        return Object.values(db.approvals)
          .filter((a) => a.planId === real)
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      });
    },

    async setHeroPlanId(id) {
      await mutate(st(), (db, ctx) => {
        if (id !== null && !Object.hasOwn(db.plans, id)) throw new PlanNotFoundError(id);
        if (db.heroPlanId === id) ctx.skipWrite();
        db.heroPlanId = id;
      });
    },

    /**
     * Public "Reset demo": beat B2 with the hero re-id'd (fresh pln_ id → fresh plan4 → unique PayPal
     * invoice numbers). Clears agent steps, approvals and webhook records, user plans and uploads.
     * Publishes DEMO_RESET, then PLAN_APPROVED so the agent issues the fresh hero's invoices (B2 = "sent").
     */
    async resetDemo() {
      await self.applyBeat("B2_PLAN_SENT");
    },

    /** Director Mode beat states (see ./seed.ts). Every beat with a hero re-ids it, like reset. */
    async applyBeat(beat: DemoBeat) {
      const s = st();
      const db = await replace(s, (cur) =>
        seedDb({
          beat,
          simStart: s.simStart,
          heroPlanId: beatHasHero(beat) ? freshHeroId(cur) : undefined,
          now: nowIso(),
        }),
      );
      publishBeatEvents(db);
    },
  };
  return self;
}

/** The process-wide store (state on globalThis; DATA_DIR and SIM_START_DATE read on first use). */
export const store: ServerStore = makeStore(globalState);

/** An isolated store over its own data dir (tests, scripts). Shares the global event bus. */
export function createStore(opts: StoreOptions): ServerStore {
  const s = newState(opts);
  return makeStore(() => s);
}

/** Test helper: forget the process-wide store state so the next call re-reads env and disk. */
export function __resetStoreForTests(): void {
  delete g.__pppStoreState;
}
