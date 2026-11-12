/** WP-10 manual Claude loop with a scripted fake client: guard feedback, refusal fallback, iteration cap. */
import { beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { GOLDEN_BONE_GRAFT_DIFF } from "@/contracts/fixtures/implantCase";
import { executeRun } from "@/agent";
import { AGENT_SYSTEM_PROMPT, FALLBACK_BETA, MAX_LOOP_ITERATIONS, type LlmClient } from "@/agent/loop";
import { buildCreateInvoiceInput } from "@/agent/policy";
import { store } from "@/server/store";
import { applyEditedGolden, atPhase2VisitDay, invoiceOf, PH2_VISIT_DAY, PLAN_ID, resetWorld, steps, trace, useLlmDeps } from "./helpers";

type Params = Parameters<LlmClient["create"]>[0];
type Message = Awaited<ReturnType<LlmClient["create"]>>;

let n = 0;
function reply(stop_reason: string, content: unknown[], extra: Record<string, unknown> = {}): Message {
  return { id: `msg_${++n}`, type: "message", role: "assistant", model: "test-model", content, stop_reason, stop_sequence: null, usage: {}, ...extra } as unknown as Message;
}
const toolUse = (name: string, input: unknown, id = `tu_${++n}`) => ({ type: "tool_use", id, name, input });
const text = (t: string) => ({ type: "text", text: t });

/** Scripted client: each call returns the next script entry (a Message or a function of the request). */
function scripted(script: Array<Message | ((p: Params) => Message)>) {
  const requests: Params[] = [];
  const client: LlmClient = {
    async create(params) {
      requests.push(structuredClone(params));
      const next = script.shift();
      if (!next) throw new Error("script exhausted");
      return typeof next === "function" ? next(params) : next;
    },
  };
  return { client, requests };
}

const lastUserResults = (p: Params) => {
  const last = p.messages.at(-1)!;
  return (Array.isArray(last.content) ? last.content : []) as Array<{ type: string; tool_use_id: string; is_error?: boolean; content: string }>;
};

beforeEach(async () => {
  await resetWorld();
});

describe("the model proposes €1,500, the guard says no, the model corrects itself", () => {
  it("guard_rejected + is_error tool_result, then €1,950 passes", async () => {
    await atPhase2VisitDay(); // ph2 due today
    await applyEditedGolden(); // engine: ph2 = 195 000 (no invoice yet → plain create)
    const plan = (await store.getPlan(PLAN_ID))!;
    const ph2 = plan.phases[1]!;
    const wrong = buildCreateInvoiceInput(plan, ph2, 1, PH2_VISIT_DAY, { amountCents: 150_000 });
    const right = buildCreateInvoiceInput(plan, ph2, 1, PH2_VISIT_DAY);

    const { client, requests } = scripted([
      reply("tool_use", [toolUse("create_invoice", wrong)]),
      (p) => {
        const [res] = lastUserResults(p);
        expect(res).toMatchObject({ type: "tool_result", is_error: true });
        expect(JSON.parse(res!.content)).toMatchObject({ error: "GUARD_REJECTED", code: "AMOUNT_MISMATCH" });
        expect(res!.content).toMatch(/1[.,]500[.,]00.*1[.,]950[.,]00/s);
        return reply("tool_use", [toolUse("create_invoice", right)]);
      },
      (p) => {
        const [res] = lastUserResults(p);
        expect(res!.is_error).toBeUndefined();
        expect(JSON.parse(res!.content)).toMatchObject({ invoice_number: "PPP-RIBE-F2-v1", status: "DRAFT" });
        return reply("end_turn", [text("Invoice created.")]);
      },
    ]);
    useLlmDeps(client);

    await executeRun(PLAN_ID, "MANUAL", { type: "MANUAL" }, {});
    // First model round: the guard rejected the wrong amount before PayPal was touched; the loop then
    // continued to the corrected call. (The playbook completes the remaining phases afterwards.)
    const all = await steps();
    const rejected = all.find((s) => s.kind === "guard_rejected")!;
    expect(rejected).toMatchObject({ tool: "create_invoice", ok: false, mode: "llm", phaseId: "ph2" });
    expect(rejected.output).toMatchObject({ code: "AMOUNT_MISMATCH" });
    const iRejected = all.indexOf(rejected);
    const createdAfter = all.slice(iRejected).find((s) => s.kind === "tool_result" && s.tool === "create_invoice" && s.ok);
    expect(createdAfter?.mode).toBe("llm");
    expect(invoiceOf((await store.getPlan(PLAN_ID))!, "ph2")).toMatchObject({ amountCents: 195_000, invoiceNumber: "PPP-RIBE-F2-v1" });
    // No PayPal call ever carried the wrong amount.
    expect(all.filter((s) => s.kind === "tool_call" && s.tool === "create_invoice").every((s) => (s.input as { items: Array<{ unit_amount: { value: string } }> }).items[0]!.unit_amount.value !== "1500.00" || s.phaseId !== "ph2")).toBe(true);
    expect(requests.length).toBeGreaterThanOrEqual(3);
  });
});

describe("request shape (claude-api skill)", () => {
  it("manual loop, model from deps, tool_choice auto, local + allowlisted tools, fallbacks left to the client wrapper", async () => {
    const { client, requests } = scripted([reply("end_turn", [text("Nothing to do.")])]);
    useLlmDeps(client);
    await executeRun(PLAN_ID, "MANUAL", { type: "MANUAL" });
    const p = requests[0]!;
    expect(p.model).toBe("test-model");
    expect(p.tool_choice).toEqual({ type: "auto" });
    expect(p.system).toBe(AGENT_SYSTEM_PROMPT);
    expect((p.tools as Array<{ name: string }>).map((t) => t.name)).toEqual(
      expect.arrayContaining(["get_plan", "get_plan_diff", "create_invoice", "send_invoice", "cancel_sent_invoice"]),
    );
    expect(p).not.toHaveProperty("betas");
    expect(p).not.toHaveProperty("temperature");
    expect(p).not.toHaveProperty("thinking");
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    // The system prompt tells the model not to choose amounts.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Money comes only from get_plan/);
  });

  it("get_plan returns the engine's amounts verbatim as tool_result", async () => {
    await applyEditedGolden();
    const { client } = scripted([
      reply("tool_use", [toolUse("get_plan", {})]),
      (p) => {
        const view = JSON.parse(lastUserResults(p)[0]!.content);
        expect(view.phases[1]).toMatchObject({ amountCents: 195_000, amountValue: "1950.00", nextInvoiceNumber: "PPP-RIBE-F2-v1" });
        return reply("end_turn", [text("ok")]);
      },
    ]);
    useLlmDeps(client);
    await executeRun(PLAN_ID, "MANUAL", { type: "MANUAL" });
  });
});

describe("refusal → playbook fallback", () => {
  it('stop_reason:"refusal" is handled before content is read, and the playbook finishes the job', async () => {
    const { client, requests } = scripted([
      reply("refusal", [toolUse("create_invoice", { truncated: true })], { stop_details: { type: "refusal", category: "general_harms", explanation: "x" } }),
    ]);
    useLlmDeps(client);
    await executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
    expect(requests).toHaveLength(1); // no retry loop on a refusal
    const all = await steps();
    expect(all.some((s) => s.kind === "explanation" && /refusal/i.test(s.text?.en ?? ""))).toBe(true);
    // The refused turn's tool_use never ran; the playbook's did (the due phase only).
    const calls = all.filter((s) => s.kind === "tool_call" && s.tool === "create_invoice");
    expect(calls.map((s) => s.phaseId)).toEqual(["ph1"]);
    expect(calls.every((s) => s.mode === "playbook")).toBe(true);
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(plan.phases[0]!.payment.invoice).toMatchObject({ status: "SENT", hasQr: true });
    expect(plan.phases.slice(1).every((p) => !p.payment.invoice)).toBe(true);
  });

  it("an API error also falls back to the playbook", async () => {
    const client: LlmClient = { create: async () => { throw new Error("529 overloaded"); } };
    useLlmDeps(client);
    await executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
    const plan = (await store.getPlan(PLAN_ID))!;
    expect(plan.phases[0]!.payment.invoice?.status).toBe("SENT");
    expect(plan.phases.slice(1).every((p) => !p.payment.invoice)).toBe(true);
    expect((await steps()).some((s) => s.kind === "explanation" && /overloaded/.test(s.text?.en ?? ""))).toBe(true);
  });
});

describe("loop cap", () => {
  it(`aborts after more than ${MAX_LOOP_ITERATIONS} iterations and falls back to the playbook`, async () => {
    let calls = 0;
    const client: LlmClient = {
      create: async () => {
        calls++;
        return reply("tool_use", [toolUse("get_plan", {})]);
      },
    };
    useLlmDeps(client);
    await executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
    expect(calls).toBe(MAX_LOOP_ITERATIONS);
    const all = await steps();
    expect(all.some((s) => s.kind === "error" && !s.ok && /12|iteration/i.test(s.text?.en ?? ""))).toBe(true);
    // Still not broken: the playbook issued the due phase's invoice.
    expect((await store.getPlan(PLAN_ID))!.phases[0]!.payment.invoice?.status).toBe("SENT");
  });
});

describe("invoice on the visit day (LLM path)", () => {
  it("the prompt and the PLAN_APPROVED task forbid invoicing a phase that is not due", async () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/only on or after its visit day/);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/PHASE_NOT_DUE/);
    const { taskFor } = await import("@/agent/loop");
    expect(taskFor(PLAN_ID, { type: "PLAN_APPROVED" })).toMatch(/invoiceableNow = false/);
    expect(taskFor(PLAN_ID, { type: "PLAN_EDITED" })).toMatch(/invoiced on its visit day at the new amount/);
    expect(taskFor(PLAN_ID, { type: "PHASE_STATUS_CHANGED", phaseId: "ph2", to: "due" })).toMatch(/create_invoice, send_invoice, then generate_invoice_qr_code/);
    expect(taskFor(PLAN_ID, { type: "PHASE_STATUS_CHANGED", phaseId: "ph2", to: "overdue" })).toMatch(/send_invoice_reminder/);
  });

  it("a model that invoices a future phase gets PHASE_NOT_DUE as an is_error tool_result; nothing reaches PayPal", async () => {
    const plan = (await store.getPlan(PLAN_ID))!;
    const early = buildCreateInvoiceInput(plan, plan.phases[2]!, 1, "2026-11-16");
    const { client } = scripted([
      reply("tool_use", [toolUse("get_plan", {})]),
      (p) => {
        const view = JSON.parse(lastUserResults(p)[0]!.content);
        expect(view.phases.map((ph: { invoiceableNow: boolean }) => ph.invoiceableNow)).toEqual([true, false, false, false]);
        return reply("tool_use", [toolUse("create_invoice", early)]);
      },
      (p) => {
        const [res] = lastUserResults(p);
        expect(res).toMatchObject({ is_error: true });
        expect(JSON.parse(res!.content)).toMatchObject({ error: "GUARD_REJECTED", code: "PHASE_NOT_DUE" });
        return reply("end_turn", [text("Phase 3 is invoiced on its visit day.")]);
      },
    ]);
    useLlmDeps(client);
    await executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
    const all = await steps();
    expect(all.find((s) => s.kind === "guard_rejected")).toMatchObject({ tool: "create_invoice", phaseId: "ph3", mode: "llm" });
    // The playbook completes the due phase; future phases only get their visit-day note.
    const created = all.filter((s) => s.kind === "tool_call" && s.tool === "create_invoice");
    expect(created.map((s) => s.phaseId)).toEqual(["ph1"]);
    const notes = all.filter((s) => s.kind === "explanation" && s.phaseId).map((s) => s.phaseId);
    expect(notes).toEqual(["ph2", "ph3", "ph4"]);
    expect((await store.getPlan(PLAN_ID))!.phases.slice(1).every((p) => !p.payment.invoice)).toBe(true);
  });
});

describe("model-driven edit flow", () => {
  it("cancel → create v2 → send is held for approval (tool_result PENDING_HUMAN_APPROVAL), never executed by the model", async () => {
    // Issue v1 invoices through the playbook first.
    const { usePlaybookDeps } = await import("./helpers");
    usePlaybookDeps();
    await atPhase2VisitDay();
    await executeRun(PLAN_ID, "PLAN_APPROVED", { type: "PLAN_APPROVED" });
    await applyEditedGolden();
    const plan = (await store.getPlan(PLAN_ID))!;
    const oldId = invoiceOf(plan, "ph2").invoiceId;
    const v2 = buildCreateInvoiceInput(plan, plan.phases[1]!, 2, PH2_VISIT_DAY);
    let newId = "";

    const { client } = scripted([
      reply("tool_use", [toolUse("cancel_sent_invoice", { invoice_id: oldId, send_to_recipient: true })]),
      reply("tool_use", [toolUse("create_invoice", v2)]),
      (p) => {
        newId = JSON.parse(lastUserResults(p)[0]!.content).invoice_id;
        return reply("tool_use", [toolUse("send_invoice", { invoice_id: newId, send_to_recipient: true })]);
      },
      (p) => {
        expect(JSON.parse(lastUserResults(p)[0]!.content)).toMatchObject({ status: "PENDING_HUMAN_APPROVAL" });
        return reply("end_turn", [text("Held for approval.")]);
      },
    ]);
    useLlmDeps(client);
    await executeRun(PLAN_ID, "PLAN_EDITED", { type: "PLAN_EDITED", diff: GOLDEN_BONE_GRAFT_DIFF });
    expect(await trace((s) => s.mode === "llm")).toEqual(
      expect.arrayContaining(["call:cancel_sent_invoice", "call:create_invoice", "approval_required:send_invoice"]),
    );
    const sends = (await steps()).filter((s) => s.kind === "tool_call" && s.tool === "send_invoice" && s.mode === "llm");
    expect(sends).toHaveLength(0);
    expect(invoiceOf((await store.getPlan(PLAN_ID))!, "ph2").status).toBe("DRAFT");
    const [approval] = (await store.listPendingApprovals(PLAN_ID)).filter((a) => a.status === "pending");
    expect(approval).toBeDefined();
  });
});
