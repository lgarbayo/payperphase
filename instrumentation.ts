/**
 * Runs once per server process. Boots the store (seed-on-boot) and starts
 * the event-driven clinic agent. Node runtime only.
 *
 * Keep the imports inside the `if`: Next also compiles this file for the edge runtime, and only this
 * shape lets it drop the Node-only modules (node:crypto, node:fs) from that bundle. An early return
 * still bundles them, which breaks `next dev` with "UnhandledSchemeError: node:crypto".
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { boot } = await import("@/server/boot");
    await boot();
    const { startAgent } = await import("@/agent");
    startAgent();
    // On a freshly seeded DB the hero is "approved and sent" but has no invoices yet: tell the agent,
    // exactly as after a reset (no-op when the DB already existed).
    const { announceBootState } = await import("@/server/boot");
    await announceBootState();
  }
}
