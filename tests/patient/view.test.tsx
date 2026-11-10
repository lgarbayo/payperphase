// @vitest-environment jsdom
/**
 * WP-06 patient page view. The Gantt, pay, chat and impact modules are mocked (their owners test
 * them); the SSE hook is mocked so tests can push DomainEvents; fetch is stubbed per test.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainEvent, DomainEventInput, PhaseShift, Plan, PlanViewResponse, WhatIfResponse } from "@/contracts";
import type { PlanGanttProps } from "@/components/gantt/types";
import type { PlanChatProps } from "@/components/chat/PlanChat";
import { GOLDEN_DELAY_MOVE, GOLDEN_ILLEGAL_MOVE, goldenPlan } from "@/contracts/fixtures/implantCase";
import { PatientPlanView } from "@/components/patient/PatientPlanView";
import { LocaleProvider } from "@/i18n";
import { addDays } from "@/lib/dates";
import { LocaleToggle } from "@/lib/ui/LocaleToggle";
import { ToastProvider } from "@/lib/ui/Toast";
import { goldenView, jsonResponse, paidPhase1View, viewOf } from "./fixtures";

const h = vi.hoisted(() => ({
  gantt: null as null | PlanGanttProps,
  chat: null as null | PlanChatProps,
  sse: { planId: undefined as string | null | undefined, handler: null as null | ((e: DomainEvent) => void) },
}));

vi.mock("@/components/gantt/PlanGantt", () => ({
  PlanGantt: (props: PlanGanttProps) => {
    h.gantt = props;
    return <div data-testid="plan-gantt" data-gantt-mode={props.mode} />;
  },
}));
vi.mock("@/components/pay/PayPhaseButton", () => ({
  PayPhaseButton: (props: { phaseId: string; status: string; onPaid?: (r: { phaseId: string; captureId?: string }) => void }) => (
    <button
      type="button"
      data-testid="pay-phase"
      data-phase={props.phaseId}
      disabled={!(props.status === "due" || props.status === "overdue")}
      onClick={() => props.onPaid?.({ phaseId: props.phaseId, captureId: "MOCK-CAPTURE-1" })}
    >
      PayPal
    </button>
  ),
}));
vi.mock("@/components/pay/PayLaterMessage", () => ({
  PayLaterMessage: ({ amountCents }: { amountCents: number }) => <div data-testid="paylater-message" data-amount={amountCents} />,
}));
vi.mock("@/components/chat/PlanChat", () => ({
  PlanChat: (props: PlanChatProps) => {
    h.chat = props;
    return <div data-testid="plan-chat" />;
  },
}));
vi.mock("@/components/impact/ExposureMeter", () => ({
  ExposureMeter: () => <div data-testid="exposure-meter" />,
}));
vi.mock("@/components/impact/ClinicClosureButton", () => ({
  ClinicClosureButton: () => (
    <button type="button" data-testid="closure-button">
      closure
    </button>
  ),
}));
vi.mock("@/lib/sse/useDomainEvents", () => ({
  useDomainEvents: (planId: string | null | undefined, handler: (e: DomainEvent) => void) => {
    h.sse.planId = planId;
    h.sse.handler = handler;
  },
}));

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

let seq = 0;
function event(input: DomainEventInput): DomainEvent {
  seq += 1;
  return { ...input, id: `evt-${seq}`, at: "2026-11-16T10:00:00.000Z", simToday: "2026-11-16" } as DomainEvent;
}
async function emit(input: DomainEventInput) {
  await act(async () => {
    h.sse.handler?.(event(input));
  });
}

function renderView(initial: PlanViewResponse = goldenView(), planRef = "demo") {
  return render(
    <LocaleProvider>
      <ToastProvider>
        <LocaleToggle />
        <PatientPlanView initial={initial} planRef={planRef} />
      </ToastProvider>
    </LocaleProvider>,
  );
}

const card = (id: string) => screen.getByTestId(`phase-card-${id}`);

type FetchArgs = [input: string, init?: RequestInit];
let fetchMock: ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;

beforeAll(() => {
  // Small jsdom gaps that motion/impact components may rely on once their WPs merge.
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as Record<string, unknown>).IntersectionObserver ??= NoopObserver;
  (globalThis as Record<string, unknown>).ResizeObserver ??= NoopObserver;
});

beforeEach(() => {
  h.gantt = null;
  h.chat = null;
  h.sse.handler = null;
  fetchMock = vi.fn(async () => jsonResponse(goldenView()));
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("golden view (B2: phase 1 due today)", () => {
  it("renders 4 phase cards and only ph1 has an enabled pay button", () => {
    renderView();
    expect(screen.getAllByTestId(/^phase-card-ph\d+$/)).toHaveLength(4);

    const buttons = screen.getAllByTestId("pay-phase");
    expect(buttons).toHaveLength(1);
    const ph1Button = within(card("ph1")).getByTestId("pay-phase") as HTMLButtonElement;
    expect(ph1Button.disabled).toBe(false);
    expect(within(card("ph1")).getByTestId("paylater-message").dataset.amount).toBe("36000");

    for (const id of ["ph2", "ph3", "ph4"]) {
      expect(within(card(id)).queryByTestId("pay-phase")).toBeNull();
      expect(within(card(id)).queryByTestId("paylater-message")).toBeNull();
    }
    expect(norm(within(card("ph2")).getByTestId("pay-on-visit").textContent)).toBe("Se paga el día de la visita · 12 ene 2027");
  });

  it("shows title, visit date, amount, fit badge and status on each card", () => {
    renderView();
    const c = card("ph2");
    expect(c.textContent).toContain("Fase 2");
    expect(c.textContent).toContain("Colocación de implantes");
    expect(norm(within(c).getByTestId("phase-date").textContent)).toBe("12 ene 2027");
    expect(norm(within(c).getByTestId("phase-amount").textContent)).toBe("1.500,00 €");
    expect(norm(within(c).getByTestId("fit-badge").textContent)).toBe("Dentro del rango de Paga en 3 (20 €–2.000 €)");
    expect(within(c).getByText("Programado")).toBeTruthy();
    expect(within(card("ph1")).getByText("A pagar hoy")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/elegible|eligible/i);
  });

  it("shows the approved summary under the title when present", () => {
    const plan = goldenPlan();
    plan.phases[1]!.summary = { es: "Colocamos dos implantes de titanio.", en: "We place two titanium implants." };
    renderView(viewOf(plan));
    expect(within(card("ph2")).getByTestId("phase-summary").textContent).toBe("Colocamos dos implantes de titanio.");
    expect(within(card("ph1")).queryByTestId("phase-summary")).toBeNull();
  });

  it("the ledger shows 0 €", () => {
    renderView();
    expect(norm(screen.getByTestId("ledger-total").textContent)).toBe("Pagado 0,00 € · recibido 0,00 €");
    expect(norm(screen.getByTestId("ledger-total-paid").textContent)).toBe("0,00 €");
    expect(norm(screen.getByTestId("ledger-total-received").textContent)).toBe("0,00 €");
    expect(norm(screen.getByTestId("ledger-line-ph1").textContent)).toBe("Pagado 0,00 € · recibido 0,00 €");
    expect(norm(screen.getByTestId("ledger").textContent)).toContain("de 4.070,00 €");
  });

  it("header: clinic, patient alias (ficticio), simulated clock and mock badges", () => {
    renderView();
    expect(screen.getByTestId("clinic-name").textContent).toBe("Clínica Dental Ribera");
    expect(screen.getByTestId("patient-alias").textContent).toBe("María G. (ficticio)");
    expect(norm(screen.getByTestId("sim-clock").textContent)).toBe("Simulado · 16 nov 2026");
    const modes = Array.from(document.querySelectorAll("[data-mode='mock']")).map((e) => norm(e.textContent));
    expect(modes).toEqual(expect.arrayContaining(["PayPal · Simulación", "Asistente · Simulación"]));
  });

  it("hides mode badges for live integrations", () => {
    const view = goldenView();
    view.modes = { paypal: "live", paypalWebhooks: "live", anthropic: "live", agent: "llm" };
    renderView(view);
    expect(document.querySelectorAll("[data-mode='mock'], [data-mode='cached']")).toHaveLength(0);
  });

  it("has the director deep-link anchors #gantt and #closure", () => {
    renderView();
    const gantt = document.getElementById("gantt");
    const closure = document.getElementById("closure");
    expect(gantt).not.toBeNull();
    expect(closure).not.toBeNull();
    expect(within(gantt!).getByTestId("plan-gantt")).toBeTruthy();
    expect(within(closure!).getByTestId("closure-button")).toBeTruthy();
    expect(within(closure!).getByTestId("exposure-meter")).toBeTruthy();
  });

  it("passes the plan, simulated today, patient mode and approved notes to the Gantt", () => {
    renderView();
    expect(h.gantt?.plan.id).toBe("pln_ribera01");
    expect(h.gantt?.today).toBe("2026-11-16");
    expect(h.gantt?.mode).toBe("patient");
    expect(h.gantt?.notes.HEALING_EXTRACTION_MIN_8W?.id).toBe("HEALING_EXTRACTION_MIN_8W");
    expect(h.gantt?.ghostShifts).toBeUndefined();
    expect(h.sse.planId).toBe("pln_ribera01");
  });
});

describe("live updates over SSE", () => {
  it("after PAYMENT_CAPTURED + refetch, ph1 shows paid, ripples and the ledger reads 360,00 € / 360,00 €", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(paidPhase1View()));
    renderView();
    expect(card("ph1").dataset.ripple).toBe("0");

    await emit({
      type: "PAYMENT_CAPTURED",
      planId: "pln_ribera01",
      phaseId: "ph1",
      orderId: "MOCK-ORDER-1",
      captureId: "MOCK-CAPTURE-1",
      amountCents: 36_000,
      via: "capture",
    });

    await waitFor(() => expect(card("ph1").dataset.status).toBe("paid"));
    expect(fetchMock).toHaveBeenCalledWith("/api/plans/demo?view=patient", expect.objectContaining({ cache: "no-store" }));
    expect(card("ph1").dataset.ripple).toBe("1");
    expect(norm(within(card("ph1")).getByTestId("phase-paid").textContent)).toContain("Pagado ✓ · recibido");
    expect(screen.queryAllByTestId("pay-phase")).toHaveLength(0);
    expect(norm(screen.getByTestId("ledger-total").textContent)).toBe("Pagado 360,00 € · recibido 360,00 €");
    expect(norm(screen.getByTestId("ledger-line-ph1").textContent)).toBe("Pagado 360,00 € · recibido 360,00 €");
    expect(norm(screen.getByTestId("ledger-line-ph2").textContent)).toBe("Pagado 0,00 € · recibido 0,00 €");
    expect(norm(document.body.textContent)).toContain("Pago recibido · Fase 1 · 360,00 €");
  });

  it("onPaid from the button refetches and ripples once even when PAYMENT_CAPTURED follows", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(paidPhase1View()));
    renderView();
    await act(async () => {
      fireEvent.click(within(card("ph1")).getByTestId("pay-phase"));
    });
    await waitFor(() => expect(card("ph1").dataset.status).toBe("paid"));
    expect(card("ph1").dataset.ripple).toBe("1");

    await emit({
      type: "PAYMENT_CAPTURED",
      planId: "pln_ribera01",
      phaseId: "ph1",
      orderId: "MOCK-ORDER-1",
      captureId: "MOCK-CAPTURE-1",
      amountCents: 36_000,
      via: "capture",
    });
    expect(card("ph1").dataset.ripple).toBe("1");
    expect(document.body.textContent?.match(/Pago recibido · Fase 1/g)).toHaveLength(1);
  });

  const refetching: DomainEventInput[] = [
    { type: "PAYMENT_CAPTURED", planId: "pln_ribera01", phaseId: "ph1", orderId: "o", captureId: "c", amountCents: 36_000, via: "webhook" },
    { type: "PHASE_STATUS_CHANGED", planId: "pln_ribera01", phaseId: "ph2", from: "scheduled", to: "upcoming" },
    { type: "PLAN_RESCHEDULED", planId: "pln_ribera01", version: 2, shifts: [] },
    {
      type: "PLAN_EDITED",
      planId: "pln_ribera01",
      diff: { planId: "pln_ribera01", fromVersion: 1, toVersion: 2, totalBeforeCents: 1, totalAfterCents: 1, totalDeltaCents: 0, phases: [] },
    },
    { type: "PHASE_DELIVERED", planId: "pln_ribera01", phaseId: "ph1" },
    { type: "CLOCK_ADVANCED", from: "2026-11-16", to: "2027-01-04" },
    { type: "DEMO_RESET" },
  ];
  for (const input of refetching) {
    it(`${input.type} triggers a refetch`, async () => {
      renderView();
      await emit(input);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/plans/demo?view=patient");
    });
  }

  it("ignores events that do not change the patient view", async () => {
    renderView();
    await emit({
      type: "INVOICE_UPDATED",
      planId: "pln_ribera01",
      phaseId: "ph1",
      invoiceId: "INV-1",
      invoiceNumber: "PPP-ribe-F1-v1",
      status: "SENT",
    });
    await emit({ type: "PLAN_CREATED", planId: "pln_other001" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coalesces a burst of events into at most two requests", async () => {
    let release: () => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(jsonResponse(paidPhase1View()));
        }),
    );
    renderView();
    await emit({ type: "PHASE_STATUS_CHANGED", planId: "pln_ribera01", phaseId: "ph1", from: "due", to: "processing" });
    await emit({ type: "PHASE_DELIVERED", planId: "pln_ribera01", phaseId: "ph1" });
    await emit({ type: "PHASE_STATUS_CHANGED", planId: "pln_ribera01", phaseId: "ph1", from: "processing", to: "paid" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => release());
    await waitFor(() => expect(card("ph1").dataset.status).toBe("paid"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a retry banner when the refetch fails", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: { code: "NOT_FOUND", message: "Plan not found" } }, 404));
    renderView();
    await emit({ type: "CLOCK_ADVANCED", from: "2026-11-16", to: "2027-01-04" });
    await waitFor(() => expect(screen.getByText(/No hemos podido actualizar tu plan/)).toBeTruthy());
    fetchMock.mockImplementation(async () => jsonResponse(goldenView()));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    await waitFor(() => expect(screen.queryByText(/No hemos podido actualizar tu plan/)).toBeNull());
  });
});

const ghost: PhaseShift[] = [
  { phaseId: "ph2", fromStart: "2027-01-12", toStart: "2027-04-13", deltaDays: 91, fromDue: "2027-01-12", toDue: "2027-04-13" },
  { phaseId: "ph3", fromStart: "2027-04-07", toStart: "2027-07-07", deltaDays: 91, fromDue: "2027-04-07", toDue: "2027-07-07" },
];

describe("chat ghost preview", () => {
  it("CHAT_PREVIEW sets ghostShifts on the Gantt", async () => {
    renderView();
    await emit({ type: "CHAT_PREVIEW", planId: "pln_ribera01", shifts: ghost });
    expect(h.gantt?.ghostShifts).toEqual(ghost);
    expect(screen.getByTestId("ghost-banner").textContent).toContain("No se ha guardado ningún cambio");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("<PlanChat onGhostPreview/> sets and null clears ghostShifts", async () => {
    renderView();
    expect(h.chat?.planId).toBe("pln_ribera01");
    await act(async () => h.chat?.onGhostPreview?.(ghost));
    expect(h.gantt?.ghostShifts).toEqual(ghost);
    await act(async () => h.chat?.onGhostPreview?.(null));
    expect(h.gantt?.ghostShifts).toBeUndefined();
    expect(screen.queryByTestId("ghost-banner")).toBeNull();
  });

  it("the banner button clears the preview", async () => {
    renderView();
    await act(async () => h.chat?.onGhostPreview?.(ghost));
    fireEvent.click(screen.getByRole("button", { name: "Quitar vista previa" }));
    expect(h.gantt?.ghostShifts).toBeUndefined();
  });
});

function delayedPlan(): Plan {
  const plan = goldenPlan();
  for (const p of plan.phases.slice(1)) {
    p.startDate = addDays(p.startDate, 42);
    p.endDate = addDays(p.endDate, 42);
    p.payment.dueDate = p.startDate;
  }
  plan.version = 2;
  return plan;
}
const delayShifts: PhaseShift[] = [
  { phaseId: "ph2", fromStart: "2027-01-12", toStart: "2027-02-23", deltaDays: 42, fromDue: "2027-01-12", toDue: "2027-02-23" },
  { phaseId: "ph3", fromStart: "2027-04-07", toStart: "2027-05-19", deltaDays: 42, fromDue: "2027-04-07", toDue: "2027-05-19" },
  { phaseId: "ph4", fromStart: "2027-04-22", toStart: "2027-06-03", deltaDays: 42, fromDue: "2027-04-22", toDue: "2027-06-03" },
];

function routeFetch(whatIf: { body: WhatIfResponse; status: number }) {
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith("/whatif") ? jsonResponse(whatIf.body, whatIf.status) : jsonResponse(goldenView()),
  );
}

describe("what-if drag", () => {
  it("onMoveCommitted POSTs the what-if, keeps the baseline and toasts the shifts", async () => {
    const result = { plan: { ...delayedPlan(), baseline: undefined }, request: { ...GOLDEN_DELAY_MOVE }, shifts: delayShifts, warnings: [] };
    routeFetch({ body: { ok: true, result }, status: 200 });
    renderView();
    const baseline = h.gantt?.plan.baseline;

    await act(async () => h.gantt?.onMoveCommitted?.({ ...GOLDEN_DELAY_MOVE }));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/plans/pln_ribera01/whatif");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ phaseId: "ph2", newStartDate: "2027-02-23", persist: true });

    await waitFor(() => expect(h.gantt?.plan.phases[1]?.startDate).toBe("2027-02-23"));
    expect(h.gantt?.plan.phases[3]?.startDate).toBe("2027-06-03");
    expect(h.gantt?.plan.baseline).toEqual(baseline);
    expect(norm(within(card("ph2")).getByTestId("phase-date").textContent)).toBe("23 feb 2027");
    expect(norm(document.body.textContent)).toContain("Fase 2 pasa al 23 feb 2027 · Fases 3 y 4 se mueven 6 semanas más tarde");
  });

  it("a deadline warning shows the dentist's approved note", async () => {
    const result = {
      plan: delayedPlan(),
      request: { ...GOLDEN_DELAY_MOVE },
      shifts: delayShifts,
      warnings: [{ phaseId: "ph2", deadlineDate: "2027-05-16", exceededByDays: 12, noteId: "HEALING_EXTRACTION_MAX_6M" as const }],
    };
    routeFetch({ body: { ok: true, result }, status: 200 });
    renderView();
    await act(async () => h.gantt?.onMoveCommitted?.({ ...GOLDEN_DELAY_MOVE }));
    const alert = await screen.findByRole("alert");
    expect(alert.dataset.noteId).toBe("HEALING_EXTRACTION_MAX_6M");
    expect(norm(alert.textContent)).toContain("La fase 2 quedaría 12 días después del plazo del 16 may 2027.");
    expect(norm(alert.textContent)).toContain("Aprobado por Dra. Lucía Ruiz");
  });

  it("a 409 shows the snap-back note card and restores the server plan", async () => {
    routeFetch({
      body: {
        ok: false,
        validation: { ok: false, reason: "MIN_LAG", noteId: "HEALING_EXTRACTION_MIN_8W", earliestStartDate: "2027-01-12" },
      },
      status: 409,
    });
    renderView();
    await act(async () => h.gantt?.onMoveCommitted?.({ ...GOLDEN_ILLEGAL_MOVE }));
    const alert = await screen.findByRole("alert");
    expect(alert.dataset.noteId).toBe("HEALING_EXTRACTION_MIN_8W");
    const text = norm(alert.textContent);
    expect(text).toContain("Este cambio no es posible");
    expect(text).toContain("el hueso necesita al menos 8 semanas para cicatrizar");
    expect(text).toContain("Aprobado por Dra. Lucía Ruiz");
    expect(text).toContain("La fecha más temprana posible es el 12 ene 2027.");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === "/api/plans/demo?view=patient")).toBe(true));
  });

  it("onMoveRejected shows the approved note card with 'Aprobado por' and the phase", async () => {
    renderView();
    await act(async () =>
      h.gantt?.onMoveRejected?.({ phaseId: "ph3", noteId: "OSSEOINTEGRATION_MIN_12W", earliestStartDate: "2027-04-07" }),
    );
    const alert = screen.getByRole("alert");
    expect(alert.dataset.testid).toBe("note-card");
    const text = norm(alert.textContent);
    expect(text).toContain("El implante necesita unas 12 semanas para unirse al hueso");
    expect(text).toContain("Aprobado por Dra. Lucía Ruiz");
    expect(text).toContain("Fase 3 · Pilares e impresiones");
    fireEvent.click(within(alert).getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a rejection without an approved note shows a plain explanation", async () => {
    routeFetch({ body: { ok: false, validation: { ok: false, reason: "PHASE_PAID" } }, status: 409 });
    renderView();
    await act(async () => h.gantt?.onMoveCommitted?.({ phaseId: "ph1", newStartDate: "2026-11-23" }));
    const alert = await screen.findByRole("alert");
    expect(alert.dataset.testid).toBe("move-alert");
    expect(alert.textContent).toContain("Esta fase ya está pagada y no se puede mover.");
  });

  it("a network failure toasts an error and refetches", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/whatif")) throw new Error("offline");
      return jsonResponse(goldenView());
    });
    renderView();
    await act(async () => h.gantt?.onMoveCommitted?.({ ...GOLDEN_DELAY_MOVE }));
    await waitFor(() => expect(document.body.textContent).toContain("No se ha podido guardar el cambio"));
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/plans/demo?view=patient")).toBe(true);
  });
});

describe("approved notes", () => {
  it("renders only plan.approvedNotes, once each, with the 'Aprobado por' chip", () => {
    const plan = goldenPlan();
    plan.approvedNotes = plan.approvedNotes.filter((a) => a.noteId !== "AFTERCARE_IMPLANT");
    const view = viewOf(plan);
    // Even if the server sent an unapproved note, the page must not show it.
    view.notes = goldenView().notes;
    renderView(view);

    const section = screen.getByTestId("approved-notes");
    const cards = within(section).getAllByTestId("note-card");
    const ids = cards.map((c) => c.dataset.noteId);
    expect(ids).not.toContain("AFTERCARE_IMPLANT");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(plan.approvedNotes.length);
    for (const c of cards) expect(norm(within(c).getByTestId("approved-chip").textContent)).toBe("Aprobado por Dra. Lucía Ruiz");
    expect(within(screen.getByTestId("notes-ph2")).getAllByTestId("note-card").map((c) => c.dataset.noteId)).toEqual([
      "HEALING_EXTRACTION_MIN_8W",
      "HEALING_EXTRACTION_MAX_6M",
    ]);
    expect(within(screen.getByTestId("notes-general")).getAllByTestId("note-card").map((c) => c.dataset.noteId)).toEqual([
      "PAY_PER_PHASE_PROMISE",
      "PAY_IN_3_RANGE",
      "REFERRAL_ASK_CLINIC",
    ]);
  });

  it("shows an empty state when nothing is approved", () => {
    const plan = goldenPlan();
    plan.approvedNotes = [];
    renderView(viewOf(plan));
    expect(screen.getByTestId("approved-notes").textContent).toContain("todavía no ha aprobado notas");
  });
});

describe("statuses and chrome", () => {
  it("upcoming and overdue phases", () => {
    const plan = goldenPlan();
    plan.phases[1]!.payment.status = "upcoming";
    plan.phases[0]!.payment.status = "overdue";
    renderView(viewOf(plan, "2026-12-29"));
    expect(within(card("ph2")).queryByTestId("pay-phase")).toBeNull();
    expect(norm(within(card("ph2")).getByTestId("pay-on-visit").textContent)).toBe("Se paga el día de la visita · 12 ene 2027");
    expect((within(card("ph1")).getByTestId("pay-phase") as HTMLButtonElement).disabled).toBe(false);
    expect(card("ph1").textContent).toContain("Pendiente desde el 16 nov 2026");
  });

  it("a draft plan shows a notice and a read-only Gantt", () => {
    const plan = goldenPlan();
    plan.status = "draft";
    renderView(viewOf(plan));
    expect(screen.getByText(/todavía está preparando este plan/)).toBeTruthy();
    expect(h.gantt?.mode).toBe("readonly");
  });

  it("the chat opens as a panel and Escape closes it", () => {
    renderView();
    const panel = screen.getByTestId("chat-panel");
    expect(panel.dataset.open).toBe("false");
    fireEvent.click(screen.getByTestId("chat-toggle"));
    expect(panel.dataset.open).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(panel.dataset.open).toBe("false");
    act(() => h.gantt?.onAskDelay?.("ph2"));
    expect(panel.dataset.open).toBe("true");
  });

  it("the Gantt 'pay this phase' menu highlights the phase card", () => {
    renderView();
    act(() => h.gantt?.onPayPhase?.("ph1"));
    expect(document.activeElement).toBe(card("ph1"));
  });
});

describe("ES/EN toggle", () => {
  it("switches labels", async () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tu plan de tratamiento");

    fireEvent.click(screen.getByTestId("locale-en"));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your treatment plan");
    expect(card("ph1").textContent).toContain("Phase 1");
    expect(card("ph1").textContent).toContain("Diagnosis, cleaning and extraction");
    expect(norm(within(card("ph1")).getByTestId("fit-badge").textContent)).toBe("Within Pay in 3 range (€20–€2,000)");
    expect(norm(within(card("ph2")).getByTestId("pay-on-visit").textContent)).toBe("Paid on the day of the visit · 12 Jan 2027");
    expect(norm(screen.getByTestId("ledger-total").textContent)).toBe("Paid €0.00 · received €0.00");
    expect(screen.getByTestId("patient-alias").textContent).toBe("María G. (fictional)");
    expect(norm(screen.getByTestId("sim-clock").textContent)).toBe("Simulated · 16 Nov 2026");
    expect(document.body.textContent ?? "").not.toMatch(/elegible|eligible/i);

    fireEvent.click(screen.getByTestId("locale-es"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tu plan de tratamiento");
  });
});
