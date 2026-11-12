// @vitest-environment jsdom
/** <AgentFeed/> (jsdom, mocked fetch + mocked SSE): audit trail, live steps, guard reds, approval card. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStep, AgentStepsResponse, DomainEvent, Locale, PendingApproval } from "@/contracts";
import { AgentFeed } from "@/components/agent/AgentFeed";

const sse = vi.hoisted(() => ({ handler: null as null | ((e: DomainEvent) => void), planId: undefined as unknown }));
vi.mock("@/lib/sse/useDomainEvents", () => ({
  useDomainEvents: (planId: unknown, handler: (e: DomainEvent) => void) => {
    sse.planId = planId;
    sse.handler = handler;
  },
}));

const PLAN = "pln_ribera01";
const nb = (s: string) => s.replace(/[  ]/g, " ");
let seq = 0;
function step(over: Partial<AgentStep> & Pick<AgentStep, "kind">): AgentStep {
  const n = seq++;
  return {
    id: `run_a.${n}`,
    runId: "run_a",
    planId: PLAN,
    seq: n,
    at: `2026-11-16T10:00:${String(n).padStart(2, "0")}.000Z`,
    trigger: "PLAN_EDITED",
    mode: "llm",
    mock: true,
    ...over,
  } as AgentStep;
}
const loc = (es: string, en: string) => ({ es, en });

const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function approval(over: Partial<PendingApproval> = {}): PendingApproval {
  return {
    id: "apr_1",
    runId: "run_a",
    planId: PLAN,
    phaseId: "ph2",
    tool: "send_invoice",
    payload: { invoice_id: "INV2-MOCK-AAAA-BBBB-CCCC", send_to_recipient: true },
    payloadSha256: "58f98779aa11bb22cc33dd44ee55ff66778899aabbccddeeff00112233445566",
    summary: loc("Enviar PPP-RIBE-F2-v2 · 1.950,00 € a paciente.demo@example.com", "Send PPP-RIBE-F2-v2 · €1,950.00 to paciente.demo@example.com"),
    status: "pending",
    createdAt: "2026-11-16T10:00:09.000Z",
    ...over,
  };
}

function trail(): AgentStepsResponse {
  seq = 0;
  const steps: AgentStep[] = [
    step({ kind: "run_started", text: loc("Plan editado · el agente empieza", "Plan edited · agent starts") }),
    step({ kind: "explanation", text: loc("Fase 2: +450,00 €, sigue dentro del rango de Pay in 3", "Phase 2: +€450.00, still within the Pay in 3 range") }),
    step({
      kind: "guard_rejected",
      tool: "create_invoice",
      phaseId: "ph2",
      ok: false,
      text: loc("1.500,00 € ≠ motor 1.950,00 €", "€1,500.00 ≠ engine €1,950.00"),
      input: { invoice_number: "PPP-RIBE-F2-v2" },
      output: { code: "AMOUNT_MISMATCH" },
    }),
    step({ kind: "tool_call", tool: "create_invoice", phaseId: "ph2", text: loc("Crear factura PPP-RIBE-F2-v2 · 1.950,00 €", "Create invoice PPP-RIBE-F2-v2 · €1,950.00"), input: { items: [{ quantity: "1" }] } }),
    step({
      kind: "tool_result",
      tool: "create_invoice",
      phaseId: "ph2",
      ok: true,
      text: loc("Factura PPP-RIBE-F2-v2 creada (borrador)", "Invoice PPP-RIBE-F2-v2 created (draft)"),
      output: { invoiceId: "INV2-MOCK-AAAA-BBBB-CCCC", invoiceNumber: "PPP-RIBE-F2-v2", status: "DRAFT" },
    }),
    step({ kind: "approval_required", tool: "send_invoice", phaseId: "ph2", approvalId: "apr_1", text: approval().summary }),
  ];
  return { steps, approvals: [approval()] };
}

type Route = (url: string, init?: RequestInit) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;
function mockFetch(route: Route) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body } = await route(url, init);
    return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

function renderFeed(locale: Locale = "es") {
  return render(<AgentFeed planId={PLAN} locale={locale} />);
}
const emit = (e: Partial<DomainEvent> & { type: DomainEvent["type"] }) =>
  act(() => {
    sse.handler?.({ id: "e", at: "2026-11-16T10:01:00.000Z", simToday: "2026-11-16", ...e } as DomainEvent);
  });

beforeEach(() => {
  sse.handler = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<AgentFeed/> audit trail", () => {
  it("shows a loading state, then the stored trail and the pending approval", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch(async () => {
      await gate;
      return { body: trail() };
    });
    renderFeed();
    expect(screen.getByTestId("agent-feed-loading")).toBeTruthy();
    release();
    await screen.findByTestId("agent-run");

    expect(sse.planId).toBe(PLAN);
    expect(screen.getByText("Agente de facturación")).toBeTruthy();
    // tool chip with ✓ (call joined to its result)
    const call = screen.getAllByTestId("agent-step").find((el) => el.getAttribute("data-kind") === "tool_call")!;
    expect(call.getAttribute("data-state")).toBe("ok");
    expect(nb(call.textContent ?? "")).toContain("✓ create_invoice");
    expect(call.textContent).toContain("Factura PPP-RIBE-F2-v2 creada (borrador)");
    // run badges
    expect(screen.getByTestId("mode-badge").getAttribute("data-mode")).toBe("llm");
    expect(screen.getByTestId("mode-badge").textContent).toBe("Claude");
    expect(screen.getAllByText(/PayPal · Simulación/).length).toBeGreaterThan(0);
    // explanation
    expect(nb(screen.getByText(/Fase 2: \+450,00/).textContent ?? "")).toContain("+450,00 €");
    // approval card
    const card = screen.getByTestId("approval-card");
    expect(nb(within(card).getByTestId("approval-summary").textContent ?? "")).toContain("1.950,00 €");
    expect(within(card).getByTestId("approval-hash").textContent).toBe("58f98779aa11bb22…");
    expect(within(card).getByRole("button", { name: "Aprobar y enviar" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Rechazar" })).toBeTruthy();
  });

  it("renders a guard rejection in red with the reason", async () => {
    mockFetch(() => ({ body: trail() }));
    renderFeed();
    const rej = await screen.findByTestId("guard-reason");
    expect(nb(rej.textContent ?? "")).toBe("1.500,00 € ≠ motor 1.950,00 €");
    const li = rej.closest("li")!;
    expect(li.getAttribute("data-kind")).toBe("guard_rejected");
    expect(li.className).toMatch(/status-overdue/);
    expect(within(li).getByTestId("guard-chip").textContent).toContain("✗");
    expect(within(li).getByText("create_invoice")).toBeTruthy();
  });

  it("labels the Director-key-G run 'prueba del guard'", async () => {
    seq = 0;
    const s = step({ kind: "guard_rejected", tool: "create_invoice", ok: false, text: loc("x ≠ y", "x ≠ y"), output: { code: "AMOUNT_MISMATCH", guardTest: true }, trigger: "MANUAL", mode: "playbook" });
    mockFetch(() => ({ body: { steps: [s], approvals: [] } }));
    renderFeed();
    expect(await screen.findByText("prueba del guard")).toBeTruthy();
    expect(screen.getByTestId("mode-badge").textContent).toBe("Playbook");
  });

  it("a live (non-mock) run shows 'Claude' and the green PayPal sandbox badge instead of the mock badge", async () => {
    const live = trail();
    live.steps = live.steps.map((x) => ({ ...x, mock: false }));
    mockFetch(() => ({ body: live }));
    renderFeed();
    await screen.findByTestId("agent-run");
    expect(screen.getByTestId("mode-badge").textContent).toBe("Claude");
    expect(screen.getByTestId("mode-badge").getAttribute("title")).toBe("Bucle de herramientas de Claude → PayPal Agent Toolkit");
    // the run header and the feed header both carry it; the mock badge is gone
    expect(screen.getAllByTestId("sandbox-badge").length).toBe(2);
    expect(nb(screen.getAllByTestId("sandbox-badge")[0]!.textContent ?? "")).toContain("PayPal sandbox · Agent Toolkit");
    expect(document.querySelector("[data-mode='mock']")).toBeNull();
    // the raw approval status is translated
    const chip = screen.getAllByTestId("approval-status")[0]!;
    expect(chip.getAttribute("data-status")).toBe("pending");
    expect(chip.textContent).toBe("pendiente");
  });

  it("a mock run keeps the mock badge and no sandbox badge", async () => {
    mockFetch(() => ({ body: trail() }));
    renderFeed();
    await screen.findByTestId("agent-run");
    expect(screen.queryByTestId("sandbox-badge")).toBeNull();
  });

  it("expands the redacted JSON of a call", async () => {
    mockFetch(() => ({ body: trail() }));
    renderFeed();
    await screen.findByTestId("agent-run");
    const jsons = screen.getAllByTestId("agent-json").map((p) => p.textContent);
    expect(jsons.some((j) => j?.includes("INV2-MOCK-AAAA-BBBB-CCCC"))).toBe(true);
  });

  it("shows invoice payer links and QR images, and never an unsafe URL", async () => {
    seq = 0;
    const steps = [
      step({ kind: "tool_call", tool: "send_invoice", phaseId: "ph1", text: loc("Enviar factura PPP-RIBE-F1-v1", "Send invoice PPP-RIBE-F1-v1") }),
      step({ kind: "tool_result", tool: "send_invoice", phaseId: "ph1", ok: true, text: loc("enviada", "sent"), output: { invoiceNumber: "PPP-RIBE-F1-v1", payerViewUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2-1" } }),
      step({ kind: "tool_call", tool: "generate_invoice_qr_code", phaseId: "ph1", text: loc("QR", "QR") }),
      step({ kind: "tool_result", tool: "generate_invoice_qr_code", phaseId: "ph1", ok: true, text: loc("QR listo", "QR ready"), output: { invoiceNumber: "PPP-RIBE-F1-v1", qrDataUrl: QR } }),
      step({ kind: "tool_call", tool: "get_invoice", phaseId: "ph2", text: loc("g", "g") }),
      step({ kind: "tool_result", tool: "get_invoice", phaseId: "ph2", ok: true, text: loc("ok", "ok"), output: { payerViewUrl: "javascript:alert(1)", qrDataUrl: "data:text/html;base64,AAAA" } }),
    ];
    mockFetch(() => ({ body: { steps, approvals: [] } }));
    renderFeed();
    const link = (await screen.findByTestId("payer-link")) as HTMLAnchorElement;
    expect(link.href).toBe("https://www.sandbox.paypal.com/invoice/p/#INV2-1");
    expect(link.rel).toContain("noopener");
    const qr = screen.getByTestId("invoice-qr") as HTMLImageElement;
    expect(qr.src).toBe(QR);
    expect(qr.alt).toBe("Código QR de la factura PPP-RIBE-F1-v1");
    expect(screen.getAllByTestId("payer-link")).toHaveLength(1);
    expect(screen.getAllByTestId("invoice-qr")).toHaveLength(1);
    // the QR data URL is not dumped into the JSON view
    expect(screen.getAllByTestId("agent-json").every((p) => !p.textContent?.includes("iVBORw0KGgo"))).toBe(true);
  });

  it("shows an empty state, and an error state that can retry", async () => {
    let ok = false;
    mockFetch(() => (ok ? { body: { steps: [], approvals: [] } } : { status: 500, body: {} }));
    renderFeed();
    expect(await screen.findByTestId("agent-feed-error")).toBeTruthy();
    ok = true;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByTestId("agent-feed-empty")).toBeTruthy();
    expect(screen.getByText("El agente aún no ha actuado en este plan.")).toBeTruthy();
  });

  it("renders in English", async () => {
    mockFetch(() => ({ body: trail() }));
    renderFeed("en");
    expect(await screen.findByText("Billing agent")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve & send" })).toBeTruthy();
    expect(screen.getByTestId("guard-reason").textContent).toBe("€1,500.00 ≠ engine €1,950.00");
  });
});

describe("<AgentFeed/> live (mocked SSE)", () => {
  it("appends AGENT_STEP events as they stream, dedupes repeats, and flips a pending call to ✓", async () => {
    mockFetch(() => ({ body: { steps: [], approvals: [] } }));
    renderFeed();
    await screen.findByTestId("agent-feed-empty");

    seq = 0;
    const started = step({ id: "run_b.0", runId: "run_b", kind: "run_started", trigger: "PLAN_APPROVED", mode: "playbook", text: loc("Plan aprobado · el agente empieza", "Plan approved") });
    const call = step({ id: "run_b.1", runId: "run_b", kind: "tool_call", tool: "send_invoice", phaseId: "ph1", trigger: "PLAN_APPROVED", mode: "playbook", text: loc("Enviar factura PPP-RIBE-F1-v1", "Send") });
    emit({ type: "AGENT_STEP", planId: PLAN, step: started } as never);
    emit({ type: "AGENT_STEP", planId: PLAN, step: call } as never);
    emit({ type: "AGENT_STEP", planId: PLAN, step: call } as never);

    await screen.findByTestId("agent-run");
    expect(screen.queryByTestId("agent-feed-empty")).toBeNull();
    expect(screen.getByTestId("run-running")).toBeTruthy();
    let row = screen.getByTestId("agent-run").querySelector('[data-kind="tool_call"]')!;
    expect(row.getAttribute("data-state")).toBe("pending");
    expect(screen.getAllByTestId("agent-step").filter((e) => e.getAttribute("data-kind") === "tool_call")).toHaveLength(1);

    emit({
      type: "AGENT_STEP",
      planId: PLAN,
      step: step({ id: "run_b.2", runId: "run_b", kind: "tool_result", tool: "send_invoice", phaseId: "ph1", ok: true, trigger: "PLAN_APPROVED", mode: "playbook", text: loc("enviada", "sent") }),
    } as never);
    emit({
      type: "AGENT_STEP",
      planId: PLAN,
      step: step({ id: "run_b.3", runId: "run_b", kind: "run_finished", ok: true, trigger: "PLAN_APPROVED", mode: "playbook", text: loc("Listo", "Done") }),
    } as never);
    row = screen.getByTestId("agent-run").querySelector('[data-kind="tool_call"]')!;
    await waitFor(() => expect(row.getAttribute("data-state")).toBe("ok"));
    expect(screen.queryByTestId("run-running")).toBeNull();
    expect(screen.getByTestId("mode-badge").textContent).toBe("Playbook");
  });

  it("shows a live guard rejection and a newly requested approval", async () => {
    mockFetch(() => ({ body: { steps: [], approvals: [] } }));
    renderFeed();
    await screen.findByTestId("agent-feed-empty");
    seq = 0;
    emit({
      type: "AGENT_STEP",
      planId: PLAN,
      step: step({ kind: "guard_rejected", tool: "create_invoice", ok: false, text: loc("1.500,00 € ≠ motor 1.950,00 €", "x"), output: { code: "AMOUNT_MISMATCH" } }),
    } as never);
    emit({ type: "APPROVAL_REQUESTED", planId: PLAN, approval: approval() } as never);
    expect((await screen.findByTestId("guard-reason")).textContent).toContain("motor");
    expect(screen.getByTestId("approval-card")).toBeTruthy();
  });

  it("ignores other plans' events and clears on DEMO_RESET", async () => {
    mockFetch(() => ({ body: trail() }));
    renderFeed();
    await screen.findByTestId("agent-run");
    emit({ type: "AGENT_STEP", planId: "pln_other", step: step({ id: "z.1", runId: "run_z", planId: "pln_other" as never, kind: "run_started", text: loc("otro", "other") }) } as never);
    expect(screen.getAllByTestId("agent-run")).toHaveLength(1);
    mockFetch(() => ({ body: { steps: [], approvals: [] } }));
    emit({ type: "DEMO_RESET" } as never);
    await waitFor(() => expect(screen.queryByTestId("agent-run")).toBeNull());
  });
});

describe("<AgentFeed/> approval card", () => {
  it("Approve posts the decision for that approval and removes the card", async () => {
    let decided = false;
    const { calls } = mockFetch((url) => {
      if (url.startsWith("/api/agent/approve")) {
        decided = true;
        return { body: { approval: approval({ status: "executed", decidedBy: "Clínica" }) } };
      }
      return { body: decided ? { steps: trail().steps, approvals: [approval({ status: "executed" })] } : trail() };
    });
    renderFeed();
    fireEvent.click(await screen.findByTestId("approve-button"));
    await waitFor(() => expect(screen.queryByTestId("approval-card")).toBeNull());
    const post = calls.find((c) => c.url === "/api/agent/approve")!;
    expect(post.init?.method).toBe("POST");
    expect(JSON.parse(String(post.init?.body))).toEqual({ approvalId: "apr_1", decidedBy: "Clínica", decision: "approve" });
  });

  it("Reject posts reject; a failed request shows an error and keeps the card", async () => {
    let fail = true;
    let rejected = false;
    const { calls } = mockFetch((url) => {
      if (url.startsWith("/api/agent/approve")) {
        if (fail) return { status: 500, body: {} };
        rejected = true;
        return { body: { approval: approval({ status: "rejected" }) } };
      }
      return { body: rejected ? { steps: trail().steps, approvals: [approval({ status: "rejected" })] } : trail() };
    });
    renderFeed();
    fireEvent.click(await screen.findByTestId("reject-button"));
    expect((await screen.findByRole("alert")).textContent).toBe("No se pudo registrar la decisión.");
    expect(screen.getByTestId("approval-card")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByTestId("reject-button"));
    await waitFor(() => expect(screen.queryByTestId("approval-card")).toBeNull());
    expect(JSON.parse(String(calls.filter((c) => c.url === "/api/agent/approve").at(-1)!.init?.body)).decision).toBe("reject");
  });
});
