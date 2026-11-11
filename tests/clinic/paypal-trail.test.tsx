// @vitest-environment jsdom
/**
 * P4 PayPal trail (jsdom, mocked fetch): timeline rendering, dedupe label, mock-mode label,
 * collapsed-by-default toggle in PaymentsOverview (no fetch until opened), polling only while open.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanSummary } from "@/contracts";
import { PaymentsOverview } from "@/components/clinic/PaymentsOverview";
import { PayPalTrail, type PayPalTrailResponse } from "@/components/clinic/PayPalTrail";
import { LocaleProvider, useT } from "@/i18n";
import { mockFetch, norm } from "./helpers";

const TRAIL: PayPalTrailResponse = {
  planId: "pln_abcd1234",
  modes: { paypal: "live", paypalWebhooks: "live" },
  phases: [
    {
      phaseId: "ph1",
      n: 1,
      payment: { instrument: "order", orderId: "5O190127TN364715T", orderAttempt: 2, captureId: "3C679366HH908993F", paidAt: "2026-11-16T09:00:05.000Z", status: "paid" },
      invoice: { invoiceNumber: "PPP-ABCD-F1-v2", status: "MARKED_AS_PAID", payerViewUrl: "https://www.sandbox.paypal.com/invoice/p/#X" },
      webhooks: [
        { eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, applied: true, receivedAt: "2026-11-16T09:00:06.000Z", resourceId: "3C679366HH908993F" },
        { eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, applied: false, receivedAt: "2026-11-16T09:00:09.000Z", resourceId: "3C679366HH908993F" },
      ],
      agentSteps: [{ tool: "record_payment_for_invoice", ok: true, at: "2026-11-16T09:00:08.000Z" }],
    },
    {
      phaseId: "ph2",
      n: 2,
      payment: { instrument: null, orderId: null, orderAttempt: 0, captureId: null, paidAt: null, status: "scheduled" },
      invoice: null,
      webhooks: [],
      agentSteps: [],
    },
  ],
};

function Harness({ children }: { children: (t: ReturnType<typeof useT<"clinic">>) => React.ReactNode }) {
  return <>{children(useT("clinic"))}</>;
}

function renderTrail(locale: "es" | "en", body: PayPalTrailResponse, pollMs = 60_000) {
  const f = mockFetch({ "GET /api/plans/pln_abcd1234/paypal-trail": () => body });
  render(
    <LocaleProvider initial={locale}>
      <Harness>{(t) => <PayPalTrail planId="pln_abcd1234" locale={locale} t={t} pollMs={pollMs} />}</Harness>
    </LocaleProvider>,
  );
  return f;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PayPalTrail", () => {
  it("renders order → capture → verified webhook → invoice → agent step in Spanish", async () => {
    renderTrail("es", TRAIL);
    const ph1 = await screen.findByTestId("paypal-trail-phase-ph1");
    expect(norm(within(ph1).getByTestId("trail-order-ph1").textContent)).toBe("Pedido 5O190127TN364715T · intento 2");
    expect(norm(within(ph1).getByTestId("trail-capture-ph1").textContent)).toMatch(/^Captura 3C679366HH908993F COMPLETED/);
    const hooks = within(ph1).getAllByTestId("trail-webhook-ph1");
    expect(norm(hooks[0]!.textContent)).toMatch(/^Webhook PAYMENT\.CAPTURE\.COMPLETED ✓ firma verificada · aplicado/);
    expect(norm(hooks[1]!.textContent)).toMatch(/· ya aplicado \(dedupe\)/);
    expect(norm(within(ph1).getByTestId("trail-invoice-ph1").textContent)).toMatch(/^Factura PPP-ABCD-F1-v2 · /);
    expect(norm(within(ph1).getByTestId("trail-agent-ph1").textContent)).toMatch(/record_payment_for_invoice ✓/);
    expect(screen.getByTestId("paypal-trail-mode").textContent).toMatch(/directo/);
  });

  it("renders in English, with the dedupe label", async () => {
    renderTrail("en", TRAIL);
    const ph1 = await screen.findByTestId("paypal-trail-phase-ph1");
    expect(norm(within(ph1).getByTestId("trail-order-ph1").textContent)).toBe("Order 5O190127TN364715T · attempt 2");
    expect(norm(within(ph1).getAllByTestId("trail-webhook-ph1")[1]!.textContent)).toMatch(/signature verified · already applied \(deduplicated\)/);
  });

  it("shows 'Webhooks: simulación' (not an empty list) in mock mode, and an empty phase says so", async () => {
    renderTrail("es", {
      ...TRAIL,
      modes: { paypal: "mock", paypalWebhooks: "mock" },
      phases: [
        { ...TRAIL.phases[0]!, payment: { ...TRAIL.phases[0]!.payment, orderId: "MOCK-ABCD-ph1-O1-AAAA1111", captureId: "MOCK-CAP-BBBB2222" }, webhooks: [] },
        TRAIL.phases[1]!,
      ],
    });
    const ph1 = await screen.findByTestId("paypal-trail-phase-ph1");
    expect(within(ph1).getByTestId("trail-webhook-none-ph1").textContent).toBe("Webhooks: simulación");
    expect(within(ph1).getByText("MOCK-CAP-BBBB2222")).toBeTruthy();
    expect(screen.getByTestId("paypal-trail-mode").textContent).toMatch(/simulación/);
    expect(within(screen.getByTestId("paypal-trail-phase-ph2")).getByText("Sin actividad de PayPal todavía.")).toBeTruthy();
  });

  it("polls every pollMs while mounted and stops on unmount; shows an error with retry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = mockFetch({ "GET /api/plans/pln_abcd1234/paypal-trail": () => TRAIL });
    const { unmount } = render(
      <LocaleProvider initial="es">
        <Harness>{(t) => <PayPalTrail planId="pln_abcd1234" locale="es" t={t} pollMs={3000} />}</Harness>
      </LocaleProvider>,
    );
    await waitFor(() => expect(f.calls).toHaveLength(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(f.calls.length).toBe(2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(f.calls.length).toBe(2);
  });

  it("shows an error state with a retry button when the API fails", async () => {
    mockFetch({ "GET /api/plans/pln_abcd1234/paypal-trail": () => ({ __status: 500, body: { error: { code: "INTERNAL", message: "x" } } }) });
    render(
      <LocaleProvider initial="en">
        <Harness>{(t) => <PayPalTrail planId="pln_abcd1234" locale="en" t={t} pollMs={60_000} />}</Harness>
      </LocaleProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be loaded/);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("PaymentsOverview PayPal trail toggle", () => {
  const SUMMARY: PlanSummary = {
    id: "pln_abcd1234",
    patientAlias: "Paciente A",
    caseKind: "implant",
    status: "approved",
    totalCents: 100_000,
    paidCents: 25_000,
    nextDue: { phaseId: "ph2", dueDate: "2026-12-01", status: "scheduled" },
    updatedAt: "2026-11-16T09:00:00.000Z",
  };
  const OTHER: PlanSummary = { ...SUMMARY, id: "pln_zzzz9999", patientAlias: "Paciente B" };

  function Overview() {
    const t = useT("clinic");
    return <PaymentsOverview locale="es" t={t} currentPlanId="pln_abcd1234" onManage={() => {}} />;
  }

  it("is collapsed by default (no trail request), opens on click, closes again; only the current plan has it", async () => {
    const f = mockFetch({
      "GET /api/plans": () => ({ plans: [SUMMARY, OTHER] }),
      "GET /api/plans/pln_abcd1234/paypal-trail": () => TRAIL,
    });
    render(
      <LocaleProvider initial="es">
        <Overview />
      </LocaleProvider>,
    );
    const toggle = await screen.findByTestId("paypal-trail-toggle-pln_abcd1234");
    expect(toggle.textContent).toMatch(/Rastro PayPal/);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("paypal-trail")).toBeNull();
    expect(screen.queryByTestId("paypal-trail-toggle-pln_zzzz9999")).toBeNull();
    expect(f.calls.some((c) => c.key.endsWith("/paypal-trail"))).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByTestId("paypal-trail-phase-ph1")).toBeTruthy();
    expect(f.calls.some((c) => c.key.endsWith("/paypal-trail"))).toBe(true);

    fireEvent.click(toggle);
    expect(screen.queryByTestId("paypal-trail")).toBeNull();
  });
});
