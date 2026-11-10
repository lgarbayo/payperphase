/**
 * OWNED BY WP-09. Called once per server process from /instrumentation.ts (Node runtime only).
 * Loads DATA_DIR/db.json, or seeds beat state B2 when there is none (hero approved, clock at
 * SIM_START_DATE, phase 1 due), then re-derives payment statuses for the simulated clock.
 * Idempotent: calling it again is harmless.
 */
import { HERO_PLAN_ALIAS } from "@/contracts";
import { publish, setEventSimToday } from "./events";
import { store } from "./store";

const g = globalThis as unknown as { __pppBootSeeded?: boolean };

export async function boot(): Promise<void> {
  const { seeded } = await store.init();
  if (seeded) g.__pppBootSeeded = true;
  await store.refreshPaymentStatuses();
  setEventSimToday((await store.getClock()).today);
}

/**
 * Call once the agent is subscribed (instrumentation.ts, after startAgent()). When boot seeded a
 * fresh DB, the hero is "approved and sent" (B2) but nobody has issued its invoices yet: publish
 * PLAN_APPROVED once so the agent does, exactly as after a reset. No-op otherwise.
 */
export async function announceBootState(): Promise<void> {
  if (!g.__pppBootSeeded) return;
  g.__pppBootSeeded = false;
  const hero = await store.getPlan(HERO_PLAN_ALIAS);
  if (hero?.status === "approved") publish({ type: "PLAN_APPROVED", planId: hero.id, version: hero.version });
}
