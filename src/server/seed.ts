/**
 * OWNED BY WP-09. The persisted DB shape and the Director Mode beat states it can be seeded into.
 *
 * Beats (src/contracts/server.ts DemoBeat), all from the seed cases (data/seed), clock = SIM_START_DATE
 * unless noted:
 *   B1  no hero plan (clinic console empty); every seed extraction stays available for the upload.
 *   B2  hero plan approved and sent; phase 1 due today (the only phase invoiced). (boot + resetDemo state)
 *   B3, B4, B6  as B2, plus phase 1 paid + delivered with mock capture ids; original dates kept.
 *   B5  as B3, but the clock is on phase 2's visit day: phase 2 is due, so the PLAN_APPROVED run issues
 *       and sends its invoice (+QR). On the implant day the dentist finds thin bone and adds a graft:
 *       the edit cancels and reissues that invoice.
 */
import { z } from "zod";
import {
  AgentStepSchema,
  ExtractionResultSchema,
  PendingApprovalSchema,
  PlanSchema,
  SimClockSchema,
  WebhookEventRecordSchema,
  planShortCode,
  type AgentStep,
  type DemoBeat,
  type ExtractionResult,
  type IsoDate,
  type PendingApproval,
  type Plan,
  type SimClock,
  type WebhookEventRecord,
} from "@/contracts";
import { applyPaymentStatuses, markDelivered } from "@/engine";
import { seedCases } from "@data/seed";

export const DB_SCHEMA_VERSION = 1 as const;

export interface Db {
  schemaVersion: typeof DB_SCHEMA_VERSION;
  plans: Record<string, Plan>;
  extractions: Record<string, ExtractionResult>;
  clock: SimClock;
  /** Plan behind the alias "demo" (HERO_PLAN_ALIAS); null in beat B1. */
  heroPlanId: string | null;
  webhookEvents: Record<string, WebhookEventRecord>;
  agentSteps: AgentStep[];
  approvals: Record<string, PendingApproval>;
}

/** Every record is validated with its contract schema on load; any failure reseeds the whole DB. */
export const DbSchema = z.object({
  schemaVersion: z.literal(DB_SCHEMA_VERSION),
  plans: z.record(z.string(), PlanSchema),
  extractions: z.record(z.string(), ExtractionResultSchema),
  clock: SimClockSchema,
  heroPlanId: z.string().nullable(),
  webhookEvents: z.record(z.string(), WebhookEventRecordSchema),
  agentSteps: z.array(AgentStepSchema),
  approvals: z.record(z.string(), PendingApprovalSchema),
});

const PAID_BEATS: ReadonlySet<DemoBeat> = new Set(["B3_PHASE1_PAID", "B4_WHATIF_READY", "B5_AGENT_READY", "B6_CLOSURE_READY"]);

/** True for the beats that leave an approved hero plan (and therefore publish PLAN_APPROVED). */
export function beatHasHero(beat: DemoBeat): boolean {
  return beat !== "B1_CLINIC_EMPTY";
}

/** Phase 1 paid at the visit through a (mock) checkout and delivered the same day. */
function payAndDeliverFirstPhase(plan: Plan, today: IsoDate, now: string): Plan {
  const first = [...plan.phases].sort((a, b) => a.n - b.n)[0];
  if (!first) return plan;
  const code = planShortCode(plan.id);
  const paid: Plan = {
    ...plan,
    phases: plan.phases.map((p) =>
      p.id === first.id
        ? {
            ...p,
            payment: {
              ...p.payment,
              status: "paid" as const,
              instrument: "order" as const,
              orderId: `MOCK-ORDER-${code}-${p.id.toUpperCase()}`,
              orderAttempt: Math.max(1, p.payment.orderAttempt),
              captureId: `MOCK-CAPTURE-${code}-${p.id.toUpperCase()}`,
              paidCents: p.amountCents,
              paidAt: now,
            },
          }
        : p,
    ),
  };
  return markDelivered(paid, first.id, today);
}

export interface SeedOptions {
  beat: DemoBeat;
  /** Simulated start day (serverEnv().SIM_START_DATE). */
  simStart: IsoDate;
  /** Id for the hero plan; defaults to the seed case's own id (boot). */
  heroPlanId?: string;
  /** Wall-clock timestamp for audit fields. */
  now: string;
}

/** B5: the simulated day is the hero's phase 2 visit day (phase 2 due, invoiced on the visit day). */
function beatToday(beat: DemoBeat, simStart: IsoDate): IsoDate {
  if (beat !== "B5_AGENT_READY") return simStart;
  const hero = seedCases().find((c) => c.hero)?.plan;
  const second = hero ? [...hero.phases].sort((a, b) => a.n - b.n)[1] : undefined;
  return second && second.payment.dueDate > simStart ? second.payment.dueDate : simStart;
}

export function seedDb({ beat, simStart, heroPlanId, now }: SeedOptions): Db {
  const today = beatToday(beat, simStart);
  const db: Db = {
    schemaVersion: DB_SCHEMA_VERSION,
    plans: {},
    extractions: {},
    clock: { today, startedAt: simStart, label: "simulated" },
    heroPlanId: null,
    webhookEvents: {},
    agentSteps: [],
    approvals: {},
  };
  for (const c of seedCases()) {
    db.extractions[c.extraction.quoteId] = structuredClone(c.extraction);
    if (c.hero && !beatHasHero(beat)) continue;
    let plan: Plan = structuredClone(c.plan);
    if (c.hero) {
      plan = { ...plan, id: heroPlanId ?? plan.id };
      if (PAID_BEATS.has(beat)) plan = payAndDeliverFirstPhase(plan, simStart, now);
      db.heroPlanId = plan.id;
    }
    plan = applyPaymentStatuses(plan, today).plan;
    db.plans[plan.id] = { ...plan, updatedAt: now };
  }
  return db;
}
