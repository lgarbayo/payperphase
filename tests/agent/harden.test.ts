/** Hardening regressions for the billing agent (fix/harden-2026-11-12, findings billing-agent-*). */
import { beforeEach, describe, expect, it } from "vitest";
import { GOLDEN_BONE_GRAFT_DIFF } from "@/contracts/fixtures/implantCase";
import { decideApproval, executeRun } from "@/agent";
import { getMockInvoice } from "@/agent/mockTools";
import { applyPaymentEvent } from "@/lib/paypal/apply";
import { store } from "@/server/store";
import { applyEditedGolden, invoiceOf, PLAN_ID, resetWorld, steps, usePlaybookDeps } from "./helpers";

const issue = () => executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
const edit = () => executeRun(PLAN_ID, "PLAN_EDITED", { type: "PLAN_EDITED", diff: GOLDEN_BONE_GRAFT_DIFF });

beforeEach(async () => {
  await resetWorld();
  usePlaybookDeps();
});

describe("billing-agent-1: a held send_invoice never goes out once the phase is paid", () => {
  it("Approve after a checkout capture on that phase fails and leaves the reissued invoice unsent", async () => {
    await issue();
    await applyEditedGolden();
    await edit();
    const [approval] = await store.listPendingApprovals(PLAN_ID);
    expect(approval).toMatchObject({ status: "pending", phaseId: "ph2" });

    const ph2 = (await store.getPlan(PLAN_ID))!.phases.find((p) => p.id === "ph2")!;
    await store.setClock(ph2.payment.dueDate);
    const applied = await applyPaymentEvent({
      planId: PLAN_ID,
      phaseId: "ph2",
      event: { type: "CAPTURE_COMPLETED", orderId: "ORD1", captureId: "CAP1", amountCents: 195_000, paidAt: "2027-01-12T10:00:00.000Z" },
      via: "capture",
    });
    expect(applied.to).toBe("paid");
    // The reissued v2 is a DRAFT, so there is no open invoice to record the capture on.
    expect((await executeRun(PLAN_ID, "PAYMENT_CAPTURED", { type: "PAYMENT_CAPTURED", phaseId: "ph2", amountCents: 195_000, captureId: "CAP1" })).skipped).toBe(true);

    const mark = (await steps()).length;
    const done = await decideApproval(approval!.id, "Dra. Lucía Ruiz", "approve");
    expect(done?.status).toBe("failed");

    const after = (await steps()).slice(mark);
    expect(after.filter((s) => s.kind === "tool_call").map((s) => s.tool)).toEqual([]);
    expect(after.find((s) => s.kind === "guard_rejected")?.output).toMatchObject({ code: "PHASE_ALREADY_PAID" });
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(invoiceOf(plan, "ph2")).toMatchObject({ status: "DRAFT", hasQr: false });
    expect(getMockInvoice(invoiceOf(plan, "ph2").invoiceId)?.status).toBe("DRAFT");
  });
});
