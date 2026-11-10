/**
 * OWNED BY WP-09. Called once per server process from /instrumentation.ts (Node runtime only).
 * Target: load or seed DATA_DIR/db.json, apply payment statuses for the simulated clock.
 */
import { store } from "./store";

export async function boot(): Promise<void> {
  await store.getClock();
}
