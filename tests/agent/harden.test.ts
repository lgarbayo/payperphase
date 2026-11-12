/** Hardening regressions for the billing agent (fix/harden-2026-11-12, findings billing-agent-*). */
import { beforeEach, describe, expect, it } from "vitest";
import { GOLDEN_BONE_GRAFT_DIFF } from "@/contracts/fixtures/implantCase";
import { __setAgentDeps, decideApproval, executeRun } from "@/agent";
import { createMockInvoiceTools, getMockInvoice } from "@/agent/mockTools";
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

describe("billing-agent-5: a send at a post-edit amount waits for Approve whatever run issues it", () => {
  it("an edit landing during the PLAN_APPROVED run holds the edited phase's first send", async () => {
    let edited = false;
    __setAgentDeps({
      mode: "playbook",
      llm: null,
      model: "test-model",
      createTools: async () => {
        const inner = createMockInvoiceTools();
        return {
          ...inner,
          async call(name, input) {
            const res = await inner.call(name, input);
            // The dentist saves the bone-graft edit while the run is still issuing invoices.
            if (name === "send_invoice" && !edited) {
              edited = true;
              await applyEditedGolden();
            }
            return res;
          },
        };
      },
    });
    await issue();
    usePlaybookDeps();

    const plan = (await store.getPlan(PLAN_ID))!;
    expect(plan.baseline?.phases.find((b) => b.phaseId === "ph2")?.amountCents).toBe(150_000);
    expect(invoiceOf(plan, "ph2")).toMatchObject({ invoiceNumber: "PPP-RIBE-F2-v1", amountCents: 195_000, status: "DRAFT" });
    expect(getMockInvoice(invoiceOf(plan, "ph2").invoiceId)?.status).toBe("DRAFT");
    const pending = (await store.listPendingApprovals(PLAN_ID)).filter((a) => a.status === "pending");
    expect(pending).toEqual([expect.objectContaining({ phaseId: "ph2", tool: "send_invoice" })]);
    // Phases the edit did not change are sent as approved at plan approval.
    expect(invoiceOf(plan, "ph3").status).toBe("SENT");

    // The queued PLAN_EDITED run finds nothing to reissue and the hold stays.
    await edit();
    expect((await store.listPendingApprovals(PLAN_ID)).filter((a) => a.status === "pending")).toHaveLength(1);
    const done = await decideApproval(pending[0]!.id, "Dra. Lucía Ruiz", "approve");
    expect(done?.status).toBe("executed");
    expect(invoiceOf((await store.getPlan(PLAN_ID))!, "ph2").status).toBe("SENT");
  });
});
