// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayLaterMessage } from "@/components/pay/PayLaterMessage";
import { PayPhaseButton } from "@/components/pay/PayPhaseButton";
import { resetPayPalSdkCache, type PayPalButtonsOptions, type PayPalMessagesOptions } from "@/components/pay/sdk";
import { buildSdkUrl, sdkNamespace, type PayPalClientConfig } from "@/lib/paypal/sdk-url";

const MOCK_CONFIG: PayPalClientConfig = { mode: "mock", clientId: null, buyerCountry: "ES", currency: "EUR", intent: "capture" };
const LIVE_CONFIG: PayPalClientConfig = { mode: "live", clientId: "sb-test", buyerCountry: "ES", currency: "EUR", intent: "capture" };

type Handler = (url: string, body: unknown) => { status: number; body: unknown };

function stubApi(config: PayPalClientConfig, handlers: Record<string, Handler> = {}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url: input, method, body });
    if (input === "/api/paypal/config") return Response.json(config);
    const key = Object.keys(handlers).find((k) => input.startsWith(k));
    if (!key) return Response.json({ error: { code: "NOT_FOUND", message: input } }, { status: 404 });
    const r = handlers[key]!(input, body);
    return Response.json(r.body, { status: r.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const ORDER_OK: Handler = () => ({ status: 201, body: { orderId: "MOCK-RIBE-ph1-O1-AAAA1111", amountCents: 36_000, mode: "mock" } });
const CAPTURE_OK: Handler = () => ({
  status: 200,
  body: { outcome: "COMPLETED", captureId: "MOCK-CAP-1", paidCents: 36_000, mode: "mock" },
});

beforeEach(() => {
  resetPayPalSdkCache();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.querySelectorAll("script[data-namespace]").forEach((s) => s.remove());
  const w = window as unknown as Record<string, unknown>;
  for (const k of Object.keys(w)) if (k.startsWith("paypal_ppp_")) delete w[k];
});

describe("<PayPhaseButton/> not payable", () => {
  it("is disabled with the reason 'Se paga el día de la visita' unless due/overdue", () => {
    const calls = stubApi(MOCK_CONFIG);
    for (const status of ["scheduled", "upcoming"] as const) {
      const { unmount } = render(
        <PayPhaseButton planId="pln_ribera01" phaseId="ph2" amountCents={150_000} status={status} locale="es" />,
      );
      const btn = screen.getByTestId("pay-phase") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toMatch(/^Pagar con PayPal · 1\.500,00\s€$/);
      const reason = screen.getByTestId("pay-phase-reason");
      expect(reason.textContent).toBe("Se paga el día de la visita");
      expect(btn.getAttribute("aria-describedby")).toBe(reason.id);
      unmount();
    }
    expect(calls).toHaveLength(0);
  });

  it("speaks English when asked", () => {
    stubApi(MOCK_CONFIG);
    render(<PayPhaseButton planId="pln_ribera01" phaseId="ph2" amountCents={150_000} status="scheduled" locale="en" />);
    expect(screen.getByTestId("pay-phase-reason").textContent).toBe("Paid on the day of your visit");
  });

  it("shows a paid confirmation for paid phases and a review note for processing ones", () => {
    stubApi(MOCK_CONFIG);
    const { rerender } = render(
      <PayPhaseButton planId="pln_ribera01" phaseId="ph1" amountCents={36_000} status="paid" locale="es" />,
    );
    expect(screen.getByTestId("pay-phase-paid").textContent).toMatch(/Pagado · 360,00\s€/);
    expect(screen.queryByTestId("pay-phase")).toBeNull();
    rerender(<PayPhaseButton planId="pln_ribera01" phaseId="ph1" amountCents={36_000} status="processing" locale="es" />);
    expect(screen.getByTestId("pay-phase-pending").textContent).toContain("PayPal está revisando el pago");
  });
});

describe("<PayPhaseButton/> mock mode", () => {
  it("renders a clearly labelled 'Pagar (simulación)' button with a mock ModeBadge", async () => {
    stubApi(MOCK_CONFIG);
    render(<PayPhaseButton planId="pln_ribera01" phaseId="ph1" amountCents={36_000} status="due" locale="es" />);
    const btn = await screen.findByRole("button", { name: /Pagar \(simulación\)/ });
    expect(btn.getAttribute("data-testid")).toBe("pay-phase");
    expect(btn.getAttribute("data-mode")).toBe("mock");
    expect(btn.textContent).toMatch(/360,00\s€/);
    const badge = document.querySelector('[data-mode="mock"][title]');
    expect(badge?.textContent).toBe("PayPal · Simulación");
  });

  it("runs the server create → capture path (no amount sent) and reports onPaid", async () => {
    const calls = stubApi(MOCK_CONFIG, { "/api/paypal/orders/MOCK-RIBE": CAPTURE_OK, "/api/paypal/orders": ORDER_OK });
    const onPaid = vi.fn();
    render(
      <PayPhaseButton planId="pln_ribera01" phaseId="ph1" amountCents={36_000} status="due" locale="es" onPaid={onPaid} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Pagar \(simulación\)/ }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith({ phaseId: "ph1", captureId: "MOCK-CAP-1" }));

    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => c.url)).toEqual([
      "/api/paypal/orders",
      "/api/paypal/orders/MOCK-RIBE-ph1-O1-AAAA1111/capture",
    ]);
    expect(posts[0]!.body).toEqual({ planId: "pln_ribera01", phaseId: "ph1" });
    expect(posts[1]!.body).toEqual({ planId: "pln_ribera01", phaseId: "ph1", orderId: "MOCK-RIBE-ph1-O1-AAAA1111" });
    expect(screen.getByTestId("pay-phase-paid")).toBeTruthy();
  });

  it("maps a 409 NOT_DUE_YET to a friendly error and calls onError", async () => {
    stubApi(MOCK_CONFIG, {
      "/api/paypal/orders": () => ({ status: 409, body: { error: { code: "NOT_DUE_YET", message: "x" } } }),
    });
    const onError = vi.fn();
    render(
      <PayPhaseButton planId="pln_ribera01" phaseId="ph1" amountCents={36_000} status="due" locale="es" onError={onError} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Pagar \(simulación\)/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Esta fase aún no se puede pagar: se paga el día de la visita.");
    expect(onError).toHaveBeenCalledWith("Esta fase aún no se puede pagar: se paga el día de la visita.");
  });
});

describe("live mode: the JS SDK is loaded once and drives our server", () => {
  function fakeSdk() {
    const buttons: PayPalButtonsOptions[] = [];
    const messages: PayPalMessagesOptions[] = [];
    const sdk = {
      Buttons: vi.fn((o: PayPalButtonsOptions) => {
        buttons.push(o);
        return {
          render: vi.fn(async (el: HTMLElement) => {
            el.innerHTML = '<div data-fake="paypal-buttons"></div>';
          }),
          close: vi.fn(async () => {}),
        };
      }),
      Messages: vi.fn((o: PayPalMessagesOptions) => {
        messages.push(o);
        return {
          render: vi.fn(async (el: HTMLElement) => {
            el.innerHTML = '<span data-fake="paypal-message"></span>';
            o.onRender?.();
          }),
        };
      }),
    };
    return { sdk, buttons, messages };
  }

  async function loadInjectedSdk(sdk: unknown) {
    const scripts = [...document.head.querySelectorAll<HTMLScriptElement>("script[data-namespace]")];
    expect(scripts).toHaveLength(1);
    const script = scripts[0]!;
    const ns = script.getAttribute("data-namespace")!;
    (window as unknown as Record<string, unknown>)[ns] = sdk;
    await act(async () => {
      script.dispatchEvent(new Event("load"));
    });
    return script;
  }

  it("one SDK script for two buttons + the message; URL has EUR, paylater, buyer-country ES, es_ES, capture", async () => {
    stubApi(LIVE_CONFIG);
    const { sdk, buttons, messages } = fakeSdk();
    render(
      <>
        <PayPhaseButton planId="pln_ribera01" phaseId="ph1" amountCents={36_000} status="due" locale="es" />
        <PayLaterMessage amountCents={36_000} locale="es" />
        <PayPhaseButton planId="pln_ribera01" phaseId="ph2" amountCents={150_000} status="overdue" locale="es" />
      </>,
    );
    await waitFor(() => expect(document.head.querySelectorAll("script[data-namespace]")).toHaveLength(1));
    const script = await loadInjectedSdk(sdk);
    const expected = buildSdkUrl({ clientId: "sb-test", locale: "es", intent: "capture", buyerCountry: "ES" });
    expect(script.src).toBe(expected);
    expect(script.getAttribute("data-namespace")).toBe(sdkNamespace(expected));

    await waitFor(() => expect(buttons).toHaveLength(2));
    await waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0]).toMatchObject({ amount: 360, placement: "payment" });
    const msg = screen.getByTestId("paylater-message");
    expect(msg.getAttribute("data-pp-amount")).toBe("360.00");
    await waitFor(() => expect(msg.getAttribute("data-rendered")).toBe("true"));
  });

  it("createOrder asks our server (no amount); DECLINED → actions.restart(); COMPLETED → onPaid", async () => {
    let captureOutcome = "DECLINED";
    const calls = stubApi(LIVE_CONFIG, {
      "/api/paypal/orders/ORDER-LIVE-1/capture": () => ({
        status: 200,
        body: { outcome: captureOutcome, captureId: "CAP-9", paidCents: 36_000, mode: "live" },
      }),
      "/api/paypal/orders": () => ({ status: 201, body: { orderId: "ORDER-LIVE-1", amountCents: 36_000, mode: "live" } }),
    });
    const { sdk, buttons } = fakeSdk();
    const onPaid = vi.fn();
    render(<PayPhaseButton planId="pln_ribera01" phaseId="ph1" amountCents={36_000} status="due" locale="es" onPaid={onPaid} />);
    await waitFor(() => expect(document.head.querySelectorAll("script[data-namespace]")).toHaveLength(1));
    await loadInjectedSdk(sdk);
    await waitFor(() => expect(buttons).toHaveLength(1));
    const opts = buttons[0]!;
    expect(opts.style).toMatchObject({ layout: "vertical" });

    let orderId = "";
    await act(async () => {
      orderId = await opts.createOrder();
    });
    expect(orderId).toBe("ORDER-LIVE-1");
    expect(calls.find((c) => c.url === "/api/paypal/orders")!.body).toEqual({ planId: "pln_ribera01", phaseId: "ph1" });

    const restart = vi.fn();
    await act(async () => {
      await opts.onApprove({ orderID: orderId }, { restart });
    });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("PayPal no ha aceptado ese método de pago");

    captureOutcome = "COMPLETED";
    await act(async () => {
      await opts.onApprove({ orderID: orderId }, { restart });
    });
    expect(onPaid).toHaveBeenCalledWith({ phaseId: "ph1", captureId: "CAP-9" });
    expect(screen.getByTestId("pay-phase-paid")).toBeTruthy();
  });

  it("a failed SDK load shows an error with a retry", async () => {
    stubApi(LIVE_CONFIG);
    render(<PayPhaseButton planId="pln_ribera01" phaseId="ph1" amountCents={36_000} status="due" locale="es" />);
    await waitFor(() => expect(document.head.querySelectorAll("script[data-namespace]")).toHaveLength(1));
    const script = document.head.querySelector<HTMLScriptElement>("script[data-namespace]")!;
    await act(async () => {
      script.dispatchEvent(new Event("error"));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("No se ha podido cargar PayPal.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(document.head.querySelectorAll("script[data-namespace]")).toHaveLength(1));
  });
});

describe("<PayLaterMessage/>", () => {
  it("renders nothing outside the Pay Later range", async () => {
    stubApi(LIVE_CONFIG);
    const { container } = render(<PayLaterMessage amountCents={1_000} locale="es" />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
    expect(document.head.querySelectorAll("script[data-namespace]")).toHaveLength(0);
  });

  it("in mock mode shows only a labelled placeholder for PayPal's message (never an imitation or a claim)", async () => {
    stubApi(MOCK_CONFIG);
    render(<PayLaterMessage amountCents={195_000} locale="es" />);
    await waitFor(() => expect(screen.getByTestId("paylater-message").getAttribute("data-mode")).toBe("mock"));
    const el = screen.getByTestId("paylater-message");
    expect(el.getAttribute("data-pp-amount")).toBe("1950.00");
    expect(el.textContent).toContain("Aquí aparece el mensaje oficial de PayPal sobre el pago a plazos.");
    expect(el.textContent).toContain("Simulación");
    expect(el.textContent).not.toMatch(/elegible|eligible/i);
    expect(document.head.querySelectorAll("script[data-namespace]")).toHaveLength(0);
  });
});
