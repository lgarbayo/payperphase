/**
 * OWNED BY WP-09. Called once per server process from /instrumentation.ts (Node runtime only).
 * Loads DATA_DIR/db.json, or seeds beat state B2 when there is none (hero approved, clock at
 * SIM_START_DATE, phase 1 due), then re-derives payment statuses for the simulated clock.
 * Idempotent: calling it again is harmless.
 */
import { setEventSimToday } from "./events";
import { store } from "./store";

export async function boot(): Promise<void> {
  await store.init();
  await store.refreshPaymentStatuses();
  setEventSimToday((await store.getClock()).today);
}
