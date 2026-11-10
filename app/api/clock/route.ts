/** OWNED BY WP-09. GET/POST simulated clock. SCAFFOLD STUB. */
import { ClockRequestSchema, type ClockResponse } from "@/contracts";
import { addDays } from "@/lib/dates";
import { json, parseJson } from "@/lib/http";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const body: ClockResponse = { clock: await store.getClock() };
  return json(body);
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, ClockRequestSchema);
  if (!parsed.ok) return parsed.response;
  const cur = await store.getClock();
  const to = "advanceDays" in parsed.data ? addDays(cur.today, parsed.data.advanceDays) : parsed.data.setTo;
  const body: ClockResponse = { clock: await store.setClock(to) };
  return json(body);
}
