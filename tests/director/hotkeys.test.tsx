// @vitest-environment jsdom
/** Director Mode: hotkeys call the right API and navigate; nothing without ?director=1; typing is ignored; hub Reset. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n";
import { ToastProvider } from "@/lib/ui/Toast";
import { DemoHub } from "@/components/director/DemoHub";
import { DirectorMode } from "@/components/director/DirectorMode";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), search: "director=1" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh }),
  usePathname: () => "/clinic",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const calls: { method: string; url: string; body: unknown }[] = [];
beforeEach(() => {
  calls.length = 0;
  nav.push.mockClear();
  nav.replace.mockClear();
  nav.refresh.mockClear();
  nav.search = "director=1";
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? "GET").toUpperCase();
      calls.push({ method, url, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
      const body =
        url === "/api/health"
          ? { ok: true, version: "dev", modes: { paypal: "mock", paypalWebhooks: "mock", anthropic: "mock", agent: "playbook" }, simToday: "2026-11-16" }
          : url === "/api/clock"
            ? { clock: { today: "2027-01-04", startedAt: "2026-11-16", label: "simulated" } }
            : { ok: true, heroPlanId: "p1" };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const posts = () => calls.filter((c) => c.method === "POST");
const mount = () =>
  render(
    <LocaleProvider>
      <ToastProvider>
        <DirectorMode />
      </ToastProvider>
    </LocaleProvider>,
  );
const press = (key: string, target: Element | Window = window) => fireEvent.keyDown(target, { key });

describe("Director Mode hotkeys", () => {
  const beats: [string, string, string][] = [
    ["1", "B1_CLINIC_EMPTY", "/clinic"],
    ["2", "B2_PLAN_SENT", "/p/demo"],
    ["3", "B3_PHASE1_PAID", "/p/demo"],
    ["4", "B4_WHATIF_READY", "/p/demo#gantt"],
    ["5", "B5_AGENT_READY", "/clinic#plan-editor"],
    ["6", "B6_CLOSURE_READY", "/p/demo#closure"],
  ];

  for (const [key, beat, href] of beats) {
    it(`key ${key} posts beat ${beat} then navigates to ${href}`, async () => {
      mount();
      await screen.findByTestId("director-hud");
      press(key);
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith(href));
      expect(posts()).toEqual([{ method: "POST", url: "/api/demo/beat", body: { beat } }]);
    });
  }

  it("C advances the clock 49 days and the HUD labels it Simulado", async () => {
    mount();
    await screen.findByTestId("director-hud");
    press("c");
    await waitFor(() => expect(posts()).toEqual([{ method: "POST", url: "/api/clock", body: { advanceDays: 49 } }]));
    await waitFor(() => expect(screen.getByTestId("sim-clock").textContent).toMatch(/Simulado/));
  });

  it("G runs the guard test on the demo plan", async () => {
    mount();
    await screen.findByTestId("director-hud");
    press("g");
    await waitFor(() => expect(posts()).toEqual([{ method: "POST", url: "/api/agent/guard-test", body: { planId: "demo" } }]));
  });

  it("R resets the demo and refreshes", async () => {
    mount();
    await screen.findByTestId("director-hud");
    press("r");
    await waitFor(() => expect(posts()).toEqual([{ method: "POST", url: "/api/demo/reset", body: {} }]));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it("H hides and shows the HUD without any request", async () => {
    mount();
    const hud = await screen.findByTestId("director-hud");
    press("h");
    expect(hud.getAttribute("data-hidden")).toBe("true");
    press("h");
    expect(hud.getAttribute("data-hidden")).toBe("false");
    expect(posts()).toEqual([]);
  });

  it("labels mock and cached integrations in the HUD", async () => {
    mount();
    await screen.findByTestId("director-hud");
    await waitFor(() => expect(document.querySelector('[data-mode="cached"]')).not.toBeNull());
    expect(document.querySelectorAll('[data-mode="mock"]').length).toBeGreaterThanOrEqual(2);
  });

  it("ignores keys typed inside an input", async () => {
    mount();
    await screen.findByTestId("director-hud");
    const input = document.createElement("input");
    document.body.appendChild(input);
    for (const k of ["1", "r", "c", "g", "h"]) press(k, input);
    await new Promise((r) => setTimeout(r, 30));
    expect(posts()).toEqual([]);
    expect(nav.push).not.toHaveBeenCalled();
    input.remove();
  });

  it("renders nothing and listens to nothing without ?director=1", async () => {
    nav.search = "";
    mount();
    expect(screen.queryByTestId("director-hud")).toBeNull();
    press("r");
    press("1");
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);
  });

  it("persists Director Mode for the tab after ?director=1, and ?director=0 turns it off", async () => {
    mount();
    await screen.findByTestId("director-hud");
    cleanup();
    nav.search = "";
    mount();
    await screen.findByTestId("director-hud");
    cleanup();
    nav.search = "director=0";
    mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("director-hud")).toBeNull();
  });

  it("a beat deep link applies the beat once and replaces the URL", async () => {
    nav.search = "director=1&beat=5";
    mount();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/clinic#plan-editor"));
    expect(posts()).toEqual([{ method: "POST", url: "/api/demo/beat", body: { beat: "B5_AGENT_READY" } }]);
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("Demo hub", () => {
  it("lists the six beat deep links and Reset demo calls the API and confirms with a toast", async () => {
    render(
      <LocaleProvider>
        <ToastProvider>
          <DemoHub />
        </ToastProvider>
      </LocaleProvider>,
    );
    expect(screen.getByTestId("beat-link-1").getAttribute("href")).toBe("/clinic?director=1&beat=1");
    expect(screen.getByTestId("beat-link-4").getAttribute("href")).toBe("/p/demo?director=1&beat=4#gantt");
    expect(screen.getByTestId("beat-link-5").getAttribute("href")).toBe("/clinic?director=1&beat=5#plan-editor");
    expect(screen.getByTestId("beat-link-6").getAttribute("href")).toBe("/p/demo?director=1&beat=6#closure");
    fireEvent.click(screen.getByTestId("reset-demo"));
    await waitFor(() => expect(posts()).toEqual([{ method: "POST", url: "/api/demo/reset", body: {} }]));
    expect(await screen.findByText("Demo reiniciada")).toBeTruthy();
  });
});
