// @vitest-environment jsdom
/** <PlanChat/> in jsdom: suggestions, citation chips, referral toast, ghost toggle, errors. fetch is mocked. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest, ChatResponse, Locale } from "@/contracts";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { answerMock } from "@/ai/chat";
import { PlanChat } from "@/components/chat/PlanChat";
import { LocaleProvider } from "@/i18n";
import { ToastProvider } from "@/lib/ui/Toast";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The real mock router stands in for the server, so the panel renders real ChatResponses. */
const serverAnswer = (init: RequestInit | undefined): ChatResponse => {
  const req = JSON.parse(String(init?.body)) as ChatRequest;
  return answerMock(req, GOLDEN_PLAN, "2026-11-16");
};

let fetchMock: ReturnType<typeof vi.fn>;
const onGhost = vi.fn();

function mount(locale: Locale = "es") {
  window.history.replaceState(null, "", `/?lang=${locale}`);
  return render(
    <LocaleProvider initial={locale}>
      <ToastProvider>
        <PlanChat planId={GOLDEN_PLAN.id} locale={locale} onGhostPreview={onGhost} />
      </ToastProvider>
    </LocaleProvider>,
  );
}

beforeEach(() => {
  onGhost.mockReset();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json(serverAnswer(init)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<PlanChat/>", () => {
  it("keeps the data-testid hook and shows the two localized suggested questions", () => {
    mount("es");
    expect(screen.getByTestId("plan-chat")).toBeTruthy();
    const chips = screen.getAllByTestId("chat-suggestion").map((c) => c.textContent);
    expect(chips).toEqual(["Si espero 3 meses para el implante, ¿qué cambia?", "¿Puedo tomar ibuprofeno?"]);
    cleanup();
    mount("en");
    expect(screen.getAllByTestId("chat-suggestion").map((c) => c.textContent)).toEqual([
      "If I wait 3 months for the implant, what changes?",
      "Can I take ibuprofen?",
    ]);
  });

  it("the delay question posts the transcript, shows the answer, a cached badge, citation chips and the what-if card", async () => {
    mount("es");
    fireEvent.click(screen.getAllByTestId("chat-suggestion")[0]!);
    await screen.findByTestId("chat-whatif");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/chat");
    expect(JSON.parse(init.body)).toEqual({
      planId: GOLDEN_PLAN.id,
      locale: "es",
      messages: [{ role: "user", text: "Si espero 3 meses para el implante, ¿qué cambia?" }],
    });
    expect(screen.getByTestId("chat-answer").textContent).toContain("12 abr 2027");
    expect(document.querySelector('[data-mode="cached"]')).toBeTruthy();
    const chips = screen.getAllByTestId("chat-citation-chip").map((c) => c.textContent);
    expect(chips).toContain("Aprobado por Dra. Lucía Ruiz · Fase 2");
    // The user bubble and the thinking state are gone / present in order.
    expect(screen.getAllByTestId("chat-message")).toHaveLength(2);
    expect(screen.queryByTestId("chat-thinking")).toBeNull();
    // Citation chips expand to the approved note text.
    fireEvent.click(screen.getAllByTestId("chat-citation")[0]!.querySelector("button")!);
    expect(within(screen.getAllByTestId("chat-citation")[0]!).getByText(/6 meses/)).toBeTruthy();
  });

  it("the ghost preview is drawn on the answer and the toggle clears and restores it", async () => {
    mount("es");
    fireEvent.click(screen.getAllByTestId("chat-suggestion")[0]!);
    const toggle = await screen.findByTestId("chat-ghost-toggle");
    expect(onGhost).toHaveBeenCalledTimes(1);
    const shifts = onGhost.mock.calls[0]![0] as { phaseId: string }[];
    expect(shifts.map((s) => s.phaseId)).toEqual(["ph2", "ph3", "ph4"]);
    expect(toggle.textContent).toContain("Ocultar del calendario");
    fireEvent.click(toggle);
    expect(onGhost).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId("chat-ghost-toggle").textContent).toContain("Ver en el calendario");
    fireEvent.click(screen.getByTestId("chat-ghost-toggle"));
    expect(onGhost).toHaveBeenLastCalledWith(shifts);
  });

  it("the ibuprofen question is refused: fixed referral text, no what-if, and the clinic button toasts once", async () => {
    mount("es");
    fireEvent.click(screen.getAllByTestId("chat-suggestion")[1]!);
    const button = await screen.findByTestId("chat-referral");
    expect(screen.getByTestId("chat-answer").textContent).toBe("Esa pregunta debe responderla tu dentista. Puedes enviar un mensaje a tu clínica.");
    expect(screen.queryByTestId("chat-whatif")).toBeNull();
    expect(onGhost).not.toHaveBeenCalled();
    expect(button.textContent).toBe("Enviar mensaje a mi clínica");
    fireEvent.click(button);
    expect(await screen.findByText("Mensaje enviado a la clínica (demo)")).toBeTruthy();
    expect((screen.getByTestId("chat-referral") as HTMLButtonElement).disabled).toBe(true);
  });

  it("works in English and sends the locale", async () => {
    mount("en");
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "What if I delay the crowns 2 weeks?" } });
    fireEvent.click(screen.getByTestId("chat-send"));
    await screen.findByTestId("chat-whatif");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).locale).toBe("en");
    expect(screen.getByTestId("chat-answer").textContent).toMatch(/^If you wait 2 weeks on Phase 4/);
    expect(screen.getByTestId("chat-ghost-toggle").textContent).toContain("Hide from the calendar");
  });

  it("a follow-up carries the whole transcript, and Enter sends while Shift+Enter does not", async () => {
    mount("es");
    fireEvent.click(screen.getAllByTestId("chat-suggestion")[1]!);
    await screen.findByTestId("chat-referral");
    const input = screen.getByTestId("chat-input");
    fireEvent.change(input, { target: { value: "¿Y el color de la sala?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const sent = JSON.parse(fetchMock.mock.calls[1]![1].body).messages;
    expect(sent.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("an empty draft cannot be sent; the input is disabled while waiting", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (release = r)));
    mount("es");
    expect((screen.getByTestId("chat-send") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "hola" } });
    fireEvent.click(screen.getByTestId("chat-send"));
    await screen.findByTestId("chat-thinking");
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(true);
    await act(async () => release(json(serverAnswer({ body: JSON.stringify({ planId: GOLDEN_PLAN.id, locale: "es", messages: [{ role: "user", text: "hola" }] }) }))));
    await screen.findByTestId("chat-answer");
    expect(screen.queryByTestId("chat-thinking")).toBeNull();
  });

  it("shows a retry for server errors and a rate-limit message for 429", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "CHAT_FAILED", message: "x" } }, 500));
    mount("es");
    fireEvent.click(screen.getAllByTestId("chat-suggestion")[0]!);
    const error = await screen.findByTestId("chat-error");
    expect(error.textContent).toContain("No he podido responder");
    fireEvent.click(within(error).getByRole("button", { name: "Reintentar" }));
    await screen.findByTestId("chat-whatif");
    expect(screen.queryByTestId("chat-error")).toBeNull();

    fetchMock.mockResolvedValueOnce(json({ error: { code: "RATE_LIMITED", message: "x" } }, 429));
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "otra" } });
    fireEvent.click(screen.getByTestId("chat-send"));
    expect((await screen.findByTestId("chat-error")).textContent).toContain("Demasiadas preguntas");
  });

  it("a network failure degrades to the same error card, never a crash", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    mount("en");
    fireEvent.click(screen.getAllByTestId("chat-suggestion")[0]!);
    expect((await screen.findByTestId("chat-error")).textContent).toContain("couldn't answer");
  });
});
