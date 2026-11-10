/** OWNED BY WP-10. POST /api/agent/approve {approvalId, decidedBy, decision} — human Approve for send_invoice. SCAFFOLD STUB. */
import { AgentApproveRequestSchema } from "@/contracts";
import { decideApproval } from "@/agent";
import { apiError, json, parseJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseJson(req, AgentApproveRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { approvalId, decidedBy, decision } = parsed.data;
  const approval = await decideApproval(approvalId, decidedBy, decision);
  if (!approval) return apiError("UNKNOWN_APPROVAL", "No pending approval with that id", 404);
  return json({ approval });
}
