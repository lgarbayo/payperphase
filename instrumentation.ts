/**
 * Scaffold-owned. Runs once per server process. Boots the store (seed-on-boot, WP-09) and starts
 * the event-driven clinic agent (WP-10). Node runtime only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { boot } = await import("@/server/boot");
  await boot();
  const { startAgent } = await import("@/agent");
  startAgent();
}
