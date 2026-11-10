// @vitest-environment jsdom
/**
 * WP-07 clinic console (jsdom, mocked fetch and child components).
 * Covers: golden extraction → 12 lines + ✓ check bar "1 a revisar"; invalid tooth flagged; approve gated
 * on note ticks; approve payload; link/QR/invoices; bone-graft preset posts GOLDEN_BONE_GRAFT_EDIT; diff
 * "+450,00 €"; Director anchors; payments overview + SSE live refresh; EN toggle; dropzone validation.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainEvent } from "@/contracts";
import { GOLDEN_BONE_GRAFT_EDIT, GOLDEN_PLAN, GOLDEN_QUOTE_ID, goldenPlan } from "@/contracts/fixtures/implantCase";
import { ClinicConsole, type ClinicConsoleProps } from "@/components/clinic/ClinicConsole";
import { LocaleProvider } from "@/i18n";
import { ToastProvider } from "@/lib/ui/Toast";
import { SAMPLE_PDFS } from "@data/seed";
import { NOTE_LIBRARY } from "@data/seed/notes";
import {
  boneGraftResponse,
  cachedGolden,
  clinicView,
  draftPlan,
  mockFetch,
  norm,
  SUMMARIES,
} from "./helpers";

const sse = vi.hoisted(() => ({ handler: null as null | ((e: DomainEvent) => void), planIds: [] as unknown[] }));

vi.mock("@/lib/sse/useDomainEvents", () => ({
  useDomainEvents: (planId: unknown, handler: (e: DomainEvent) => void) => {
    sse.planIds.push(planId);
    sse.handler = handler;
  },
}));
vi.mock("@/components/gantt/PlanGantt", () => ({
  PlanGantt: (p: { mode: string; plan: { id: string; version: number } }) => (
    <div data-testid="plan-gantt" data-mode={p.mode} data-plan-id={p.plan.id} data-version={p.plan.version} />
  ),
}));
vi.mock("@/components/agent/AgentFeed", () => ({
  AgentFeed: (p: { planId: string }) => <div data-testid="agent-feed-stub" data-plan-id={p.planId} />,
}));
vi.mock("@/components/brand/TrustStrip", () => ({
  TrustStrip: () => <p data-testid="trust-strip">trust strip</p>,
}));
vi.mock("@/components/odontogram/Odontogram", () => ({
  Odontogram: (p: { marks: { tooth: number }[]; highlight?: number[] }) => (
    <div
      data-testid="odontogram"
      data-marks={p.marks.map((m) => m.tooth).join(",")}
      data-highlight={(p.highlight ?? []).join(",")}
    />
  ),
  marksFromLines: (lines: { teeth: number[]; category: string }[]) =>
    lines.flatMap((l) => l.teeth.map((tooth) => ({ tooth, category: l.category, state: "planned" }))),
}));
vi.mock("@/components/motion", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Stagger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Ripple: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CountUp: ({ value, format }: { value: number; format: (v: number) => string }) => <>{format(value)}</>,
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${btoa(text)}`) },
}));

function renderConsole(props: Partial<ClinicConsoleProps> = {}, locale: "es" | "en" = "es") {
  return render(
    <LocaleProvider initial={locale}>
      <ToastProvider>
        <ClinicConsole
          plan={null}
          today="2026-11-16"
          notes={Object.values(NOTE_LIBRARY)}
          samples={SAMPLE_PDFS}
          revealStepMs={0}
          {...props}
        />
      </ToastProvider>
    </LocaleProvider>,
  );
}

const baseRoutes = () => ({
  "GET /api/plans": () => ({ plans: SUMMARIES }),
  "POST /api/extract": () => ({ extraction: cachedGolden() }),
  "POST /api/plans": () => ({ __status: 201, body: { plan: draftPlan() } }),
  "POST /api/wording": () => ({
    drafts: {
      planId: GOLDEN_PLAN.id,
      planVersion: 1,
      source: "cached",
      phases: GOLDEN_PLAN.phases.map((p) => ({
        phaseId: p.id,
        template: { es: `Fase {{phaseN}}: ${p.title.es}`, en: `Phase {{phaseN}}: ${p.title.en}` },
        rendered: { es: `Fase ${p.n}: ${p.title.es}`, en: `Phase ${p.n}: ${p.title.en}` },
        noteIds: p.noteIds,
        status: "draft",
      })),
    },
  }),
  "POST /api/plans/pln_ribera01/approve": () => ({ plan: goldenPlan() }),
});

async function extractSample() {
  fireEvent.click(screen.getByTestId("sample-implant-ribera"));
  await waitFor(() => expect(screen.getAllByTestId("quote-line")).toHaveLength(12));
}

async function createDraftPlan() {
  await extractSample();
  fireEvent.click(screen.getByTestId("create-plan"));
  await screen.findByTestId("plan-gantt");
}

beforeEach(() => {
  sse.handler = null;
  sse.planIds = [];
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("clinic console · extraction", () => {
  it("renders the golden extraction: 12 lines and a ✓ check bar with '1 a revisar'", async () => {
    const api = mockFetch(baseRoutes());
    renderConsole();
    await extractSample();

    expect(api.find("POST /api/extract")[0]!.body).toEqual({ sampleId: "implant-ribera" });
    const bar = screen.getByTestId("check-bar");
    expect(bar.getAttribute("data-sum-matches")).toBe("true");
    const text = norm(bar.textContent);
    expect(text).toContain("Σ líneas 4.070,00 € = total impreso 4.070,00 €");
    expect(text).toContain("✓");
    expect(text).toContain("0 piezas inválidas");
    expect(text).toContain("1 a revisar");

    // Cached extraction is labelled.
    expect(norm(screen.getByTestId("extraction-reveal").textContent)).toContain("Extracción · En caché");
    // Teeth 36, 37, 46 are marked on the odontogram.
    expect(screen.getByTestId("odontogram").getAttribute("data-marks")!.split(",")).toEqual(
      expect.arrayContaining(["36", "37", "46"]),
    );
    // The low-confidence line is the flagged one, with its confidence dot and issue flag.
    const l12 = screen.getAllByTestId("quote-line").find((el) => el.getAttribute("data-line-id") === "L12")!;
    expect(l12.getAttribute("data-flagged")).toBe("true");
    expect(within(l12).getByTestId("confidence-dot").getAttribute("data-confidence")).toBe("74");
    expect(norm(l12.textContent)).toContain("Baja confianza");
    // Description, FDI chips, qty, unit price and total are shown.
    const l6 = screen.getAllByTestId("quote-line").find((el) => el.getAttribute("data-line-id") === "L6")!;
    expect(norm(l6.textContent)).toContain("Implante dental de titanio piezas 36 y 46");
    expect(l6.querySelectorAll("[data-tooth-chip]")).toHaveLength(2);
    expect(norm(l6.textContent)).toContain("× 2");
    expect(norm(l6.textContent)).toContain("750,00 €");
    expect(norm(l6.textContent)).toContain("1.500,00 €");
  });

  it("clicking 'a revisar' scrolls to the flagged lines", async () => {
    mockFetch(baseRoutes());
    renderConsole();
    await extractSample();
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    fireEvent.click(screen.getByTestId("check-review"));
    expect(scroll).toHaveBeenCalled();
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe("quote-line-L12");
  });

  it("shows an invalid tooth as flagged", async () => {
    const bad = cachedGolden();
    bad.lines = bad.lines.map((l) => (l.id === "L5" ? { ...l, teeth: [], issues: ["INVALID_TOOTH"] } : l));
    bad.checks = { ...bad.checks, invalidTeeth: [{ lineId: "L5", tooth: 39 }], toReviewLineIds: ["L5", "L12"] };
    mockFetch({ ...baseRoutes(), "POST /api/extract": () => ({ extraction: bad }) });
    renderConsole();
    await extractSample();

    const l5 = screen.getAllByTestId("quote-line").find((el) => el.getAttribute("data-line-id") === "L5")!;
    expect(l5.getAttribute("data-flagged")).toBe("true");
    expect(l5.querySelector('[data-invalid-tooth="39"]')).not.toBeNull();
    expect(l5.querySelector('[data-issue="INVALID_TOOTH"]')).not.toBeNull();
    const text = norm(screen.getByTestId("check-bar").textContent);
    expect(text).toContain("1 pieza inválida");
    expect(text).toContain("2 a revisar");
  });

  it("shows ✗ with both totals when Σ lines ≠ printed total", async () => {
    const off = cachedGolden();
    off.checks = { ...off.checks, sumOfLinesCents: 400_000, sumMatches: false };
    mockFetch({ ...baseRoutes(), "POST /api/extract": () => ({ extraction: off }) });
    renderConsole();
    await extractSample();
    const bar = screen.getByTestId("check-bar");
    expect(bar.getAttribute("data-sum-matches")).toBe("false");
    expect(norm(bar.textContent)).toContain("Σ líneas 4.000,00 € ≠ total impreso 4.070,00 €");
    expect(norm(screen.getByTestId("check-sum").textContent)).toContain("✗");
  });

  it("uploads a dropped PDF as multipart and shows a calm loading state", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = mockFetch({
      ...baseRoutes(),
      "POST /api/extract": async () => {
        await gate;
        return { extraction: cachedGolden() };
      },
    });
    renderConsole();
    const file = new File([new Uint8Array([37, 80, 68, 70])], "presupuesto.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByTestId("quote-dropzone"), { dataTransfer: { files: [file] } });

    const loading = await screen.findByTestId("extract-loading");
    expect(norm(loading.textContent)).toContain("Leyendo el presupuesto…");
    expect(norm(loading.textContent)).toContain("presupuesto.pdf");
    const body = api.find("POST /api/extract")[0]!.rawBody as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("presupuesto.pdf");

    await act(async () => release());
    await waitFor(() => expect(screen.getAllByTestId("quote-line")).toHaveLength(12));
  });

  it("rejects non-PDF files and PDFs over 10 MB without calling the API", async () => {
    const api = mockFetch(baseRoutes());
    renderConsole();
    const input = screen.getByTestId("quote-file-input") as HTMLInputElement;

    const txt = new File(["hola"], "notas.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [txt] } });
    expect(norm(screen.getByTestId("dropzone-error").textContent)).toContain("Solo se admiten archivos PDF.");

    const big = new File([new Uint8Array(8)], "grande.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(norm(screen.getByTestId("dropzone-error").textContent)).toContain("El PDF supera los 10 MB.");

    expect(api.find("POST /api/extract")).toHaveLength(0);
  });

  it("shows the extraction error and keeps the dropzone usable", async () => {
    mockFetch({
      ...baseRoutes(),
      "POST /api/extract": () => ({ __status: 502, body: { error: { code: "UPSTREAM", message: "timeout" } } }),
    });
    renderConsole();
    fireEvent.click(screen.getByTestId("sample-implant-ribera"));
    const err = await screen.findByTestId("dropzone-error");
    expect(norm(err.textContent)).toContain("No se pudo leer el presupuesto.");
    expect(screen.getByTestId("quote-dropzone")).toBeTruthy();
  });
});

describe("clinic console · plan, notes and approval", () => {
  it("'Crear plan' posts the quote id and assembles the clinic Gantt, trust strip and phase cards", async () => {
    const api = mockFetch(baseRoutes());
    renderConsole();
    await createDraftPlan();

    expect(api.find("POST /api/plans")[0]!.body).toEqual({ quoteId: GOLDEN_QUOTE_ID, caseKind: "implant" });
    expect(screen.getByTestId("plan-gantt").getAttribute("data-mode")).toBe("clinic");
    expect(screen.getByTestId("trust-strip")).toBeTruthy();
    const amounts = ["ph1", "ph2", "ph3", "ph4"].map((id) => norm(screen.getByTestId(`phase-amount-${id}`).textContent));
    expect(amounts).toEqual(["360,00 €", "1.500,00 €", "520,00 €", "1.690,00 €"]);
    const ph2 = screen.getByTestId("phase-review-ph2");
    expect(norm(ph2.textContent)).toContain("Dentro del rango de Paga en 3");
    expect(norm(ph2.textContent)).toContain("Visita 12 ene 2027");
    expect(norm(ph2.textContent)).toContain("Tras la fase 1 · mínimo 8 semanas");
    // Wording drafts load (optional).
    await screen.findByTestId("use-draft-ph1");
    expect(api.find("POST /api/wording")[0]!.body).toEqual({ planId: GOLDEN_PLAN.id });
    // Invoices are listed before the approval click.
    const rows = within(screen.getByTestId("invoices-preview")).getAllByRole("row");
    expect(rows).toHaveLength(5);
  });

  it("keeps 'Aprobar y enviar' disabled until every note is ticked", async () => {
    mockFetch(baseRoutes());
    renderConsole();
    await createDraftPlan();
    const approve = screen.getByTestId("approve-send") as HTMLButtonElement;
    expect(approve.disabled).toBe(true);

    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-note-id]"));
    expect(boxes.length).toBe(11);
    for (const box of boxes.slice(0, -1)) fireEvent.click(box);
    expect(approve.disabled).toBe(true);
    fireEvent.click(boxes[boxes.length - 1]!);
    expect(approve.disabled).toBe(false);

    // Unticking one locks it again; the master "Aprobar notas" ticks all.
    fireEvent.click(boxes[0]!);
    expect(approve.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("approve-all-notes"));
    expect(approve.disabled).toBe(false);
  });

  it("approve posts approvedBy, the ticked note ids and the chosen wording; then shows link, QR and invoices", async () => {
    const api = mockFetch(baseRoutes());
    renderConsole();
    await createDraftPlan();
    await screen.findByTestId("use-draft-ph1");
    fireEvent.click(screen.getByTestId("approve-all-notes"));
    fireEvent.click(screen.getByTestId("use-draft-ph1"));
    fireEvent.click(screen.getByTestId("approve-send"));

    await screen.findByTestId("patient-link-card");
    const body = api.find("POST /api/plans/pln_ribera01/approve")[0]!.body as {
      approvedBy: string;
      noteIds: string[];
      summaries: { phaseId: string; text: { es: string } }[];
    };
    expect(body.approvedBy).toBe("Dra. Lucía Ruiz");
    expect([...body.noteIds].sort()).toEqual(GOLDEN_PLAN.approvedNotes.map((n) => n.noteId).sort());
    expect(body.summaries).toEqual([{ phaseId: "ph1", text: { es: "Fase 1: Diagnóstico, limpieza y extracción", en: "Phase 1: Diagnosis, cleaning and extraction" } }]);

    expect(screen.getByTestId("patient-link").textContent).toMatch(/\/p\/pln_ribera01$/);
    await waitFor(() => expect(screen.getByTestId("patient-qr").getAttribute("src")).toMatch(/^data:image\/png;base64,/));
    fireEvent.click(screen.getByTestId("copy-link"));
    await waitFor(() => expect(norm(screen.getByTestId("copy-link").textContent)).toBe("Copiado"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/\/p\/pln_ribera01$/));

    const invoices = screen.getByTestId("invoices-preview");
    expect(norm(invoices.textContent)).toContain("Facturas que se emitirán");
    const r1 = norm(screen.getByTestId("invoice-row-ph1").textContent);
    expect(r1).toContain("PPP-RIBE-F1-v1");
    expect(r1).toContain("360,00 €");
    expect(r1).toContain("16 nov 2026");
    expect(norm(screen.getByTestId("invoice-row-ph4").textContent)).toContain("PPP-RIBE-F4-v1");
  });

  it("works from an empty store (beat B1) and keeps the Director anchors", () => {
    mockFetch(baseRoutes());
    renderConsole({ plan: null });
    expect(screen.getByTestId("plan-empty")).toBeTruthy();
    expect(document.getElementById("plan-editor")).not.toBeNull();
    expect(document.getElementById("agent-feed")).not.toBeNull();
    expect(screen.queryByTestId("plan-gantt")).toBeNull();
  });
});

describe("clinic console · editor, diff and agent", () => {
  it("has the Director deep-link anchors: #plan-editor and the #agent-feed wrapper", () => {
    mockFetch(baseRoutes());
    renderConsole({ plan: goldenPlan() });
    const editor = document.getElementById("plan-editor")!;
    const feed = document.getElementById("agent-feed")!;
    expect(editor).not.toBeNull();
    expect(within(editor).getByTestId("plan-editor-body")).toBeTruthy();
    expect(within(feed).getByTestId("agent-feed-stub").getAttribute("data-plan-id")).toBe("pln_ribera01");
  });

  it("the bone-graft preset posts exactly GOLDEN_BONE_GRAFT_EDIT and the diff panel shows +450,00 €", async () => {
    const api = mockFetch({ ...baseRoutes(), "POST /api/plans/pln_ribera01/edit": () => boneGraftResponse() });
    renderConsole({ plan: goldenPlan() });
    expect(norm(screen.getByTestId("preset-bone-graft").textContent)).toContain("Injerto óseo (+450 €)");
    fireEvent.click(screen.getByTestId("preset-bone-graft"));

    const panel = await screen.findByTestId("diff-panel");
    const body = api.find("POST /api/plans/pln_ribera01/edit")[0]!.body as { edit: unknown; editedBy: string };
    expect(body.edit).toEqual(GOLDEN_BONE_GRAFT_EDIT);
    expect(body.editedBy).toBe("Dra. Lucía Ruiz");

    const text = norm(panel.textContent);
    expect(text).toContain("+450,00 €");
    expect(norm(screen.getByTestId("diff-headline").textContent)).toBe(
      "Fase 2: 1.500,00 € → 1.950,00 € · sigue dentro del rango de Paga en 3 · fases 3–4 se mueven 4 semanas",
    );
    expect(norm(screen.getByTestId("diff-explanation").textContent)).toContain("Se añade un injerto óseo a la fase 2.");
    expect(norm(screen.getByTestId("diff-total").textContent)).toContain("Total 4.070,00 € → 4.520,00 €");
    expect(norm(screen.getByTestId("diff-row-ph3").textContent)).toContain("7 abr 2027");
    expect(norm(screen.getByTestId("diff-row-ph3").textContent)).toContain("5 may 2027");
    // The editor reflects the engine's new amount and the preset is spent.
    expect(norm(screen.getByTestId("editor-amount-ph2").textContent)).toBe("1.950,00 €");
    expect(screen.getByTestId("preset-bone-graft-done")).toBeTruthy();
    // The agent feed stays next to the editor.
    expect(within(document.getElementById("agent-feed")!).getByTestId("agent-feed-stub")).toBeTruthy();
  });

  it("removes a line, adds a custom line and marks a phase delivered through the API", async () => {
    const delivered = goldenPlan();
    delivered.phases[1]!.delivery = { status: "delivered", deliveredOn: "2026-11-16" };
    const api = mockFetch({
      ...baseRoutes(),
      "POST /api/plans/pln_ribera01/edit": () => ({ ...boneGraftResponse(), plan: goldenPlan() }),
      "POST /api/plans/pln_ribera01/phases/ph2/deliver": () => ({ plan: delivered }),
    });
    renderConsole({ plan: goldenPlan() });

    fireEvent.click(screen.getByTestId("remove-L7"));
    await waitFor(() => expect(api.find("POST /api/plans/pln_ribera01/edit")).toHaveLength(1));
    expect((api.calls.at(-1)!.body as { edit: unknown }).edit).toEqual({ kind: "REMOVE_LINE", lineId: "L7" });
    await screen.findByTestId("diff-panel");

    fireEvent.click(screen.getByTestId("add-line-ph3"));
    const form = screen.getByTestId("add-line-form-ph3");
    fireEvent.click(within(form).getByTestId("add-line-submit-ph3"));
    expect(within(form).getByRole("alert")).toBeTruthy(); // empty form is rejected locally
    fireEvent.change(within(form).getByLabelText("Descripción"), { target: { value: "Corona provisional" } });
    fireEvent.change(within(form).getByLabelText("Procedimiento"), { target: { value: "TEMPORARY_CROWN" } });
    fireEvent.change(within(form).getByLabelText("Piezas (FDI)"), { target: { value: "36, 46" } });
    fireEvent.change(within(form).getByLabelText("Cantidad"), { target: { value: "2" } });
    fireEvent.change(within(form).getByLabelText("Precio unitario (€)"), { target: { value: "95,50" } });
    fireEvent.click(within(form).getByTestId("add-line-submit-ph3"));
    await waitFor(() => expect(api.find("POST /api/plans/pln_ribera01/edit")).toHaveLength(2));
    expect((api.calls.at(-1)!.body as { edit: unknown }).edit).toEqual({
      kind: "ADD_LINE",
      phaseId: "ph3",
      line: { description: "Corona provisional", code: "TEMPORARY_CROWN", teeth: [36, 46], qty: 2, unitPriceCents: 9_550 },
    });

    await waitFor(() => expect((screen.getByTestId("deliver-ph2") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("deliver-ph2"));
    await screen.findByTestId("delivered-ph2");
    expect(api.find("POST /api/plans/pln_ribera01/phases/ph2/deliver")).toHaveLength(1);
    expect(norm(screen.getByTestId("delivered-ph2").textContent)).toContain("Entregada · 16 nov 2026");
  });

  it("refreshes the plan on SSE events for the plan on screen", async () => {
    const edited = boneGraftResponse().plan;
    const api = mockFetch({ ...baseRoutes(), "GET /api/plans/pln_ribera01": () => clinicView(edited) });
    renderConsole({ plan: goldenPlan() });
    expect(sse.planIds[0]).toBeNull(); // one subscription for every event
    expect(norm(screen.getByTestId("editor-amount-ph2").textContent)).toBe("1.500,00 €");

    act(() =>
      sse.handler!({
        id: "e1",
        at: "2026-11-16T09:00:00.000Z",
        simToday: "2026-11-16",
        type: "INVOICE_UPDATED",
        planId: "pln_ribera01",
        phaseId: "ph2",
        invoiceId: "INV2-MOCK-1",
        invoiceNumber: "PPP-RIBE-F2-v2",
        status: "SENT",
      }),
    );
    await waitFor(() => expect(norm(screen.getByTestId("editor-amount-ph2").textContent)).toBe("1.950,00 €"));
    expect(api.find("GET /api/plans/pln_ribera01")[0]!.url).toContain("view=clinic");
  });
});

describe("clinic console · payments overview", () => {
  it("lists plans with collected totals and next due date, and live-refreshes on SSE", async () => {
    const api = mockFetch(baseRoutes());
    renderConsole({ plan: goldenPlan() });
    await screen.findByTestId("payments-row-pln_ribera01");
    expect(norm(screen.getByTestId("payments-paid-pln_ribera01").textContent)).toBe("360,00 € de 4.070,00 €");
    expect(norm(screen.getByTestId("payments-next-pln_ribera01").textContent)).toContain("12 ene 2027");
    expect(norm(screen.getByTestId("payments-next-pln_aligner1").textContent)).toContain("Todo cobrado");
    expect(api.find("GET /api/plans")).toHaveLength(1);

    act(() =>
      sse.handler!({
        id: "e2",
        at: "2026-11-16T09:00:00.000Z",
        simToday: "2026-11-16",
        type: "PAYMENT_CAPTURED",
        planId: "pln_aligner1",
        phaseId: "ph1",
        orderId: "O-1",
        captureId: "C-1",
        amountCents: 50_000,
        via: "capture",
      }),
    );
    await waitFor(() => expect(api.find("GET /api/plans")).toHaveLength(2));
  });

  it("'Gestionar' loads another plan into the console", async () => {
    const other = { ...goldenPlan(), id: "pln_aligner1", patient: { ...GOLDEN_PLAN.patient, alias: "Javier P." } };
    const api = mockFetch({ ...baseRoutes(), "GET /api/plans/pln_aligner1": () => clinicView(other) });
    renderConsole({ plan: goldenPlan() });
    fireEvent.click(await screen.findByTestId("manage-pln_aligner1"));
    await waitFor(() =>
      expect(within(document.getElementById("agent-feed")!).getByTestId("agent-feed-stub").getAttribute("data-plan-id")).toBe(
        "pln_aligner1",
      ),
    );
    expect(api.find("GET /api/plans/pln_aligner1")).toHaveLength(1);
  });
});

describe("clinic console · EN toggle", () => {
  it("renders the same flow in English", async () => {
    mockFetch(baseRoutes());
    renderConsole({}, "en");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Clinic console");
    await createDraftPlan();
    const text = norm(screen.getByTestId("check-bar").textContent);
    expect(text).toContain("Σ lines €4,070.00 = printed total €4,070.00");
    expect(text).toContain("1 to review");
    expect(norm(screen.getByTestId("approve-send").textContent)).toBe("Approve & send to patient");
    expect(norm(screen.getByTestId("invoices-preview").textContent)).toContain("Invoices that will be issued");
  });
});
