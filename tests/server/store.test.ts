/**
 * WP-09 · JSON plan store: persistence, atomic + serialized writes, reseed on corruption,
 * hero alias, webhook dedupe, agent audit trail, boot (beat B2) and the public demo reset.
 */
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, default: actual, rename: vi.fn(actual.rename), writeFile: vi.fn(actual.writeFile) };
});

import { rename } from "node:fs/promises";
import {
  HERO_PLAN_ALIAS,
  PlanIdSchema,
  SIM_DEFAULT_START,
  planShortCode,
  type AgentStep,
  type PendingApproval,
  type Plan,
  type WebhookEventRecord,
} from "@/contracts";
import { GOLDEN_PLAN_ID, GOLDEN_QUOTE_ID, goldenPlan } from "@/contracts/fixtures/implantCase";
import { resetEnvCache } from "@/env";
import { boot } from "@/server/boot";
import { InvalidRecordError, PlanNotFoundError } from "@/server/errors";
import { getEventSimToday } from "@/server/events";
import { DbSchema } from "@/server/seed";
import { __resetStoreForTests, createStore, store as globalStore, type ServerStore } from "@/server/store";
import { captureEvents, makeTmpDir } from "./helpers";

const T = "2026-11-16T09:00:00.000Z";

let dir: string;
let s: ServerStore;
const open = () => createStore({ dataDir: dir, simStart: SIM_DEFAULT_START });
const dbFile = () => path.join(dir, "db.json");

beforeEach(async () => {
  dir = await makeTmpDir();
  s = open();
  vi.mocked(rename).mockClear();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function otherPlan(id = "pln_other001", patch: Partial<Plan> = {}): Plan {
  return { ...goldenPlan(), id, ...patch };
}

function step(planId: string, seq: number, kind: AgentStep["kind"] = "tool_call"): AgentStep {
  return {
    id: `st_${planId}_${seq}`,
    runId: "run_1",
    planId,
    phaseId: "ph1",
    seq,
    at: T,
    trigger: "PLAN_APPROVED",
    kind,
    tool: kind === "tool_call" ? "create_invoice" : undefined,
    input: { amount: { currency_code: "EUR", value: "360.00" } },
    ok: true,
    mode: "playbook",
    mock: true,
  };
}

function approval(id: string, planId: string, createdAt = T): PendingApproval {
  return {
    id,
    runId: "run_1",
    planId,
    phaseId: "ph2",
    tool: "send_invoice",
    payload: { invoice_id: "INV2-XXXX" },
    payloadSha256: "a".repeat(64),
    summary: { es: "Enviar factura", en: "Send invoice" },
    status: "pending",
    createdAt,
  };
}

function webhook(eventId: string): WebhookEventRecord {
  return { eventId, eventType: "PAYMENT.CAPTURE.COMPLETED", receivedAt: T, verified: true, applied: true };
}

describe("persistence", () => {
  it("seeds beat B2 into a missing db.json and round-trips plans through disk", async () => {
    const hero = await s.getPlan(HERO_PLAN_ALIAS);
    expect(hero?.id).toBe(GOLDEN_PLAN_ID);
    const onDisk = DbSchema.parse(JSON.parse(await readFile(dbFile(), "utf8")));
    expect(onDisk.heroPlanId).toBe(GOLDEN_PLAN_ID);

    const saved = await s.savePlan(otherPlan("pln_other001", { patient: { alias: "Ana P.", email: "a@example.com", locale: "en" } }));
    expect(saved.updatedAt).not.toBe(goldenPlan().updatedAt); // updatedAt is stamped on every save

    const reopened = open();
    const back = await reopened.getPlan("pln_other001");
    expect(back).toEqual(saved);
    expect((await reopened.listPlans()).map((p) => p.id)).toEqual([GOLDEN_PLAN_ID, "pln_other001"]); // hero first
  });

  it("returns copies: mutating a returned plan never changes the store", async () => {
    const a = await s.getPlan(GOLDEN_PLAN_ID);
    a!.phases[0]!.amountCents = 1;
    expect((await s.getPlan(GOLDEN_PLAN_ID))!.phases[0]!.amountCents).toBe(36_000);
  });

  it("writes atomically: temp file in the same dir, then rename over db.json", async () => {
    await s.init();
    vi.mocked(rename).mockClear();
    await s.savePlan(otherPlan());
    expect(rename).toHaveBeenCalledTimes(1);
    const [from, to] = vi.mocked(rename).mock.calls[0]!;
    expect(String(to)).toBe(dbFile());
    expect(path.dirname(String(from))).toBe(dir);
    expect(String(from)).toMatch(/db\.json\.\d+\.[a-z0-9]{6}\.tmp$/);
    expect((await readdir(dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("a failed write leaves db.json and the in-memory state untouched", async () => {
    await s.init();
    const before = await readFile(dbFile(), "utf8");
    vi.mocked(rename).mockRejectedValueOnce(new Error("disk full"));
    await expect(s.savePlan(otherPlan())).rejects.toThrow("disk full");
    expect(await readFile(dbFile(), "utf8")).toBe(before);
    expect(await s.getPlan("pln_other001")).toBeNull();
    expect((await readdir(dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    // …and the queue keeps working afterwards
    await s.savePlan(otherPlan());
    expect(await open().getPlan("pln_other001")).not.toBeNull();
  });

  it("serializes concurrent updatePlan calls (a promise queue): no write is lost", async () => {
    const N = 40;
    const bump = (p: Plan): Plan => ({
      ...p,
      phases: p.phases.map((ph) =>
        ph.id === "ph2" ? { ...ph, payment: { ...ph.payment, orderAttempt: ph.payment.orderAttempt + 1 } } : ph,
      ),
    });
    await Promise.all(Array.from({ length: N }, (_, i) => s.updatePlan(i % 2 ? HERO_PLAN_ALIAS : GOLDEN_PLAN_ID, bump)));
    const attempt = (p: Plan | null) => p!.phases.find((ph) => ph.id === "ph2")!.payment.orderAttempt;
    expect(attempt(await s.getPlan(GOLDEN_PLAN_ID))).toBe(N);
    expect(attempt(await open().getPlan(GOLDEN_PLAN_ID))).toBe(N);
  });

  it("updatePlan throws for unknown plans, aborts cleanly when fn throws, refuses id changes", async () => {
    await expect(s.updatePlan("pln_missing1", (p) => p)).rejects.toBeInstanceOf(PlanNotFoundError);
    const before = await readFile(dbFile(), "utf8");
    await expect(
      s.updatePlan(GOLDEN_PLAN_ID, () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    expect(await readFile(dbFile(), "utf8")).toBe(before);
    await expect(s.updatePlan(GOLDEN_PLAN_ID, (p) => ({ ...p, id: "pln_hijack01" }))).rejects.toThrow(/plan id/);
    const ok = await s.updatePlan(GOLDEN_PLAN_ID, (p) => ({ ...p, status: "completed" }));
    expect(ok.status).toBe("completed");
  });

  it("refuses to persist records that fail the contract schemas", async () => {
    await s.init();
    const before = await readFile(dbFile(), "utf8");
    const bad = otherPlan();
    bad.phases[0]!.amountCents = -5;
    await expect(s.savePlan(bad)).rejects.toBeInstanceOf(InvalidRecordError);
    await expect(
      s.updatePlan(GOLDEN_PLAN_ID, (p) => ({ ...p, totalCents: 1.5 })),
    ).rejects.toBeInstanceOf(InvalidRecordError);
    expect(await readFile(dbFile(), "utf8")).toBe(before);
  });
});

describe("reseed on a corrupt or invalid db.json", () => {
  it("reseeds when db.json is not JSON, keeping the broken file aside", async () => {
    await writeFile(dbFile(), "{ this is not json", "utf8");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await s.getPlan(HERO_PLAN_ALIAS))?.id).toBe(GOLDEN_PLAN_ID);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    const files = await readdir(dir);
    expect(files.some((f) => f.startsWith("db.json.corrupt-"))).toBe(true);
    expect(await readFile(path.join(dir, files.find((f) => f.startsWith("db.json.corrupt-"))!), "utf8")).toBe(
      "{ this is not json",
    );
    expect(DbSchema.safeParse(JSON.parse(await readFile(dbFile(), "utf8"))).success).toBe(true);
  });

  it("reseeds when a stored plan fails PlanSchema", async () => {
    await s.savePlan(otherPlan());
    const raw = JSON.parse(await readFile(dbFile(), "utf8"));
    raw.plans[GOLDEN_PLAN_ID].phases[0].amountCents = -1; // invalid Cents
    await writeFile(dbFile(), JSON.stringify(raw), "utf8");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reopened = open();
    const hero = await reopened.getPlan(HERO_PLAN_ALIAS);
    warn.mockRestore();
    expect(hero?.phases[0]?.amountCents).toBe(36_000);
    expect(await reopened.getPlan("pln_other001")).toBeNull(); // whole DB reseeded
    expect((await readdir(dir)).some((f) => f.startsWith("db.json.corrupt-"))).toBe(true);
  });
});

describe("hero alias", () => {
  it(`"${HERO_PLAN_ALIAS}" resolves to the hero plan, and follows setHeroPlanId`, async () => {
    expect(await s.resolvePlanId(HERO_PLAN_ALIAS)).toBe(GOLDEN_PLAN_ID);
    expect(await s.resolvePlanId(GOLDEN_PLAN_ID)).toBe(GOLDEN_PLAN_ID);
    expect(await s.resolvePlanId("pln_unknown1")).toBeNull();
    expect(s.peekHeroPlanId()).toBe(GOLDEN_PLAN_ID);

    await s.savePlan(otherPlan());
    await s.setHeroPlanId("pln_other001");
    expect(await s.resolvePlanId(HERO_PLAN_ALIAS)).toBe("pln_other001");
    expect(await open().resolvePlanId(HERO_PLAN_ALIAS)).toBe("pln_other001");
    await expect(s.setHeroPlanId("pln_missing1")).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it("extractions round-trip", async () => {
    expect((await s.getExtraction(GOLDEN_QUOTE_ID))?.totalCents).toBe(407_000);
    const e = (await s.getExtraction(GOLDEN_QUOTE_ID))!;
    await s.saveExtraction({ ...e, quoteId: "q_upload_1" });
    expect((await open().getExtraction("q_upload_1"))?.quoteId).toBe("q_upload_1");
    expect(await s.getExtraction("nope")).toBeNull();
  });
});

describe("webhooks, agent steps and approvals", () => {
  it("recordWebhookEvent returns false on a duplicate event id (also across restarts)", async () => {
    expect(await s.recordWebhookEvent(webhook("WH-1"))).toBe(true);
    expect(await s.recordWebhookEvent(webhook("WH-1"))).toBe(false);
    expect(await s.recordWebhookEvent(webhook("WH-2"))).toBe(true);
    expect(await open().recordWebhookEvent(webhook("WH-2"))).toBe(false);
  });

  it("agent steps round-trip in order, filtered by plan (alias accepted)", async () => {
    await s.appendAgentStep(step(GOLDEN_PLAN_ID, 0, "run_started"));
    await s.appendAgentStep(step("pln_other001", 0));
    await s.appendAgentStep(step(GOLDEN_PLAN_ID, 1));
    const reopened = open();
    expect((await reopened.listAgentSteps(GOLDEN_PLAN_ID)).map((x) => x.seq)).toEqual([0, 1]);
    expect(await reopened.listAgentSteps(HERO_PLAN_ALIAS)).toEqual(await reopened.listAgentSteps(GOLDEN_PLAN_ID));
    expect((await reopened.listAgentSteps(GOLDEN_PLAN_ID))[1]).toEqual(step(GOLDEN_PLAN_ID, 1));
  });

  it("pending approvals round-trip and upsert by id", async () => {
    await s.savePendingApproval(approval("apr_2", GOLDEN_PLAN_ID, "2026-11-16T10:00:00.000Z"));
    await s.savePendingApproval(approval("apr_1", GOLDEN_PLAN_ID, "2026-11-16T09:00:00.000Z"));
    await s.savePendingApproval(approval("apr_x", "pln_other001"));
    await s.savePendingApproval({ ...approval("apr_1", GOLDEN_PLAN_ID, "2026-11-16T09:00:00.000Z"), status: "approved", decidedBy: "Dra. Ruiz", decidedAt: T });
    const reopened = open();
    expect((await reopened.getPendingApproval("apr_1"))?.status).toBe("approved");
    expect(await reopened.getPendingApproval("nope")).toBeNull();
    expect((await reopened.listPendingApprovals(GOLDEN_PLAN_ID)).map((a) => a.id)).toEqual(["apr_1", "apr_2"]);
  });
});

describe("boot", () => {
  afterEach(() => {
    __resetStoreForTests();
  });

  it("seeds state B2 when no db exists: hero approved, clock = SIM_START_DATE, ph1 due", async () => {
    process.env.DATA_DIR = dir;
    process.env.SIM_START_DATE = SIM_DEFAULT_START;
    resetEnvCache();
    __resetStoreForTests();
    await boot();
    expect(globalStore.dbPath()).toBe(dbFile());
    const hero = await globalStore.getPlan(HERO_PLAN_ALIAS);
    expect(hero?.status).toBe("approved");
    expect(hero?.baseline).toBeDefined();
    expect(hero?.phases.find((p) => p.id === "ph1")?.payment.status).toBe("due");
    expect(hero?.phases.filter((p) => p.payment.status === "paid")).toEqual([]);
    expect(await globalStore.getClock()).toEqual({ today: SIM_DEFAULT_START, startedAt: SIM_DEFAULT_START, label: "simulated" });
    expect(getEventSimToday()).toBe(SIM_DEFAULT_START);
    expect(DbSchema.safeParse(JSON.parse(await readFile(dbFile(), "utf8"))).success).toBe(true);

    // a reboot keeps what is on disk
    await globalStore.setClock("2027-01-04");
    __resetStoreForTests();
    await boot();
    expect((await globalStore.getClock()).today).toBe("2027-01-04");
    expect(getEventSimToday()).toBe("2027-01-04");
    delete process.env.SIM_START_DATE;
    resetEnvCache();
  });
});

describe("test isolation", () => {
  afterEach(() => {
    __resetStoreForTests();
  });

  it("with the default DATA_DIR under Vitest, the global store is in-memory (never touches ./.data)", async () => {
    delete process.env.DATA_DIR;
    resetEnvCache();
    __resetStoreForTests();
    expect(process.env.NODE_ENV).toBe("test");
    vi.mocked(rename).mockClear();
    expect(globalStore.dbPath()).toBeNull();
    await globalStore.init();
    expect((await globalStore.getPlan(HERO_PLAN_ALIAS))?.id).toBe(GOLDEN_PLAN_ID);
    await globalStore.updatePlan(HERO_PLAN_ALIAS, (p) => ({ ...p, status: "completed" }));
    expect((await globalStore.getPlan(HERO_PLAN_ALIAS))?.status).toBe("completed");
    await globalStore.resetDemo();
    expect((await globalStore.getPlan(HERO_PLAN_ALIAS))?.status).toBe("approved");
    expect(rename).not.toHaveBeenCalled();
    resetEnvCache();
  });

  it("createStore({dataDir:null}) is a working in-memory store", async () => {
    const mem = createStore({ dataDir: null, simStart: SIM_DEFAULT_START });
    expect(await mem.recordWebhookEvent(webhook("WH-1"))).toBe(true);
    expect(await mem.recordWebhookEvent(webhook("WH-1"))).toBe(false);
    expect((await mem.getClock()).today).toBe(SIM_DEFAULT_START);
  });
});

describe("resetDemo", () => {
  it("re-ids the hero (fresh pln_ + 8, new plan4), clears agent/approval/webhook records, publishes DEMO_RESET", async () => {
    await s.savePlan(otherPlan("pln_user0001", { status: "draft" }));
    await s.appendAgentStep(step(GOLDEN_PLAN_ID, 0));
    await s.savePendingApproval(approval("apr_1", GOLDEN_PLAN_ID));
    await s.recordWebhookEvent(webhook("WH-1"));
    await s.setClock("2027-01-04");
    await s.updatePlan(HERO_PLAN_ALIAS, (p) => ({ ...p, status: "cancelled" }));

    const bus = captureEvents();
    await s.resetDemo();
    bus.stop();

    const heroId = await s.resolvePlanId(HERO_PLAN_ALIAS);
    expect(PlanIdSchema.safeParse(heroId).success).toBe(true);
    expect(heroId).not.toBe(GOLDEN_PLAN_ID);
    expect(planShortCode(heroId!)).not.toBe(planShortCode(GOLDEN_PLAN_ID));
    expect(await s.getPlan(GOLDEN_PLAN_ID)).toBeNull();
    expect(await s.getPlan("pln_user0001")).toBeNull();

    const hero = (await s.getPlan(HERO_PLAN_ALIAS))!;
    expect(hero.status).toBe("approved");
    expect(hero.phases.find((p) => p.id === "ph1")?.payment.status).toBe("due");
    expect((await s.getClock()).today).toBe(SIM_DEFAULT_START);
    expect(await s.listAgentSteps(heroId!)).toEqual([]);
    expect(await s.listAgentSteps(GOLDEN_PLAN_ID)).toEqual([]);
    expect(await s.getPendingApproval("apr_1")).toBeNull();
    expect(await s.recordWebhookEvent(webhook("WH-1"))).toBe(true);
    expect(await s.getExtraction(GOLDEN_QUOTE_ID)).not.toBeNull();

    expect(bus.types()).toEqual(["DEMO_RESET", "PLAN_APPROVED"]);
    expect(bus.events[1]).toMatchObject({ type: "PLAN_APPROVED", planId: heroId, simToday: SIM_DEFAULT_START });

    // persisted, and every reset gives a new id
    expect(await open().resolvePlanId(HERO_PLAN_ALIAS)).toBe(heroId);
    await s.resetDemo();
    const again = await s.resolvePlanId(HERO_PLAN_ALIAS);
    expect(again).not.toBe(heroId);
    expect(planShortCode(again!)).not.toBe(planShortCode(heroId!));
  });
});
