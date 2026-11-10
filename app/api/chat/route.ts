/** OWNED BY WP-11. POST /api/chat. SCAFFOLD STUB. */
import { ChatRequestSchema } from "@/contracts";
import { answerPatientQuestion } from "@/ai/chat";
import { json, parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseJson(req, ChatRequestSchema);
  if (!parsed.ok) return parsed.response;
  return json(await answerPatientQuestion(parsed.data));
}
