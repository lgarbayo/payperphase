/** WP-10 API routes over the in-memory store + mock PayPal: steps, approve, guard-test, run. */
import { beforeEach, describe, expect, it } from "vitest";
import { GOLDEN_BONE_GRAFT_DIFF } from "@/contracts/fixtures/implantCase";
import { agentIdle, executeRun } from "@/agent";
import { GET as getSteps } from "../../app/api/agent/steps/route";
import { POST as postApprove } from "../../app/api/agent/approve/route";
import { POST as postGuardTest } from "../../app/api/agent/guard-test/route";
import { POST as postRun } from "../../app/api/agent/run/route";
import { store } from "@/server/store";
import { applyEditedGolden, invoiceOf, PLAN_ID, resetWorld, steps, usePlaybookDeps } from "./helpers";

const post = (body: unknown) => new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(async () => {
  await resetWorld();
  usePlaybookDeps();
});

describe("GET /api/agent/steps", () => {
  it("requires planId and returns [] for a quiet plan", async () => {
    expect((await getSteps(new Request("http://x/api/agent/steps"))).status).toBe(400);
    const res = await getSteps(new Request(`http://x/api/agent/steps?planId=${PLAN_ID}`));
    expect(await res.json()).toEqual({ steps: [], approvals: [] });
  });

  it("returns the audit trail and pending approvals (and resolves the demo alias)", async () => {
    await executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
    await applyEditedGolden();
    await executeRun(PLAN_ID, "PLAN_EDITED", { type: "PLAN_EDITED", diff: GOLDEN_BONE_GRAFT_DIFF });
    for (const id of [PLAN_ID, "demo"]) {
      const body = await (await getSteps(new Request(`http://x/api/agent/steps?planId=${id}`))).json();
      expect(body.steps.length).toBe((await steps()).length);
      expect(body.approvals).toHaveLength(1);
      expect(body.approvals[0]).toMatchObject({ status: "pending", tool: "send_invoice" });
    }
  });
});

describe("POST /api/agent/approve", () => {
  it("approves the stored payload; unknown ids are 404; bad bodies are 422", async () => {
    await executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
    await applyEditedGolden();
    await executeRun(PLAN_ID, "PLAN_EDITED", { type: "PLAN_EDITED", diff: GOLDEN_BONE_GRAFT_DIFF });
    const [a] = await store.listPendingApprovals(PLAN_ID);

    expect((await postApprove(post({ approvalId: "apr_nope", decidedBy: "x", decision: "approve" }))).status).toBe(404);
    expect((await postApprove(post({ approvalId: a!.id }))).status).toBe(422);

    const res = await postApprove(post({ approvalId: a!.id, decidedBy: "Dra. Ruiz", decision: "approve" }));
    expect(res.status).toBe(200);
    expect((await res.json()).approval).toMatchObject({ status: "executed", decidedBy: "Dra. Ruiz" });
    expect(invoiceOf((await store.getPlan(PLAN_ID))!, "ph2").status).toBe("SENT");
  });
});

describe("POST /api/agent/guard-test (Director key G)", () => {
  it("pushes a create_invoice with the pre-edit amount through the guard: rejected, labelled, never sent", async () => {
    await executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
    await applyEditedGolden();
    await executeRun(PLAN_ID, "PLAN_EDITED", { type: "PLAN_EDITED", diff: GOLDEN_BONE_GRAFT_DIFF });
    // the edit run cancelled F2-v1 and drafted v2; discard the draft so a fresh create is the natural next step
    const before = (await steps()).length;
    const res = await postGuardTest(post({ planId: PLAN_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ rejected: true });
    expect(typeof body.code).toBe("string");
    const added = (await steps()).slice(before);
    expect(added.map((s) => s.kind)).toEqual(["run_started", "guard_rejected", "run_finished"]);
    expect(added[0]!.output).toMatchObject({ label: "guard test", guardTest: true });
    expect(added[1]!.output).toMatchObject({ guardTest: true });
    expect(added.some((s) => s.kind === "tool_call")).toBe(false);
    expect((await postGuardTest(post({ planId: "pln_nopeabcd" }))).status).toBe(404);
  });

  it("rejects the old €1,500 against the engine's €1,950 with the amount reason", async () => {
    await applyEditedGolden();
    const body = await (await postGuardTest(post({ planId: PLAN_ID }))).json();
    expect(body.code).toBe("AMOUNT_MISMATCH");
    expect(body.reason.es.replace(/[  ]/g, " ")).toBe("1.500,00 € ≠ motor 1.950,00 €");
  });
});

describe("POST /api/agent/run", () => {
  it("queues a reconcile run, returns its id, and the steps land in the trail", async () => {
    const res = await postRun(post({ planId: PLAN_ID }));
    expect(res.status).toBe(202);
    const { runId } = await res.json();
    expect(runId).toMatch(/^run_/);
    await agentIdle();
    expect((await steps()).every((s) => s.runId === runId)).toBe(true);
    expect((await store.getPlan(PLAN_ID))!.phases.every((p) => p.payment.invoice?.status === "SENT")).toBe(true);
    expect((await postRun(post({ planId: "pln_nopeabcd" }))).status).toBe(404);
    expect((await postRun(post({}))).status).toBe(422);
  });
});
