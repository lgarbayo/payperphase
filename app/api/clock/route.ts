/**
 * OWNED BY WP-09. GET/POST the labelled simulated clock. POST {advanceDays} | {setTo} re-derives
 * every plan's payment statuses, persists, then publishes PHASE_STATUS_CHANGED per change and
 * CLOCK_ADVANCED (the agent sends reminders for phases that turn "upcoming").
 */
import { ClockRequestSchema, type ClockResponse } from "@/contracts";
import { json, parseJson } from "@/lib/http";
import { handleRoute } from "@/server/errors";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const body: ClockResponse = { clock: await store.getClock() };
    return json(body);
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const parsed = await parseJson(req, ClockRequestSchema);
    if (!parsed.ok) return parsed.response;
    const clock =
      "advanceDays" in parsed.data
        ? await store.advanceClock(parsed.data.advanceDays)
        : await store.setClock(parsed.data.setTo);
    const body: ClockResponse = { clock };
    return json(body);
  });
}
