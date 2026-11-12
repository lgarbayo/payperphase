/**
 * Browser smoke of the whole demo path, in the order the video records it.
 *
 *   npm run e2e                      builds the app, starts it in mock mode, runs this file, stops it
 *   E2E_SKIP_BUILD=1 npm run e2e     reuses the existing .next build
 *
 * playwright.config.ts starts `next start` with FORCE_MOCKS=1 (no live PayPal or Anthropic call is
 * possible), a fresh temporary DATA_DIR and a free port. The test resets the demo state through the
 * API first, so it is re-runnable and order-independent. Reset, beats and the simulated clock are
 * driven through the API, not the Director hotkeys (tests/director unit-tests those).
 *
 * Steps (one `test.step` each, screenshots in test-results/demo-path/):
 *   1 reset + health is mock · 2 clinic: real PDF → 12 lines → plan → notes → approve → link + QR
 *   3 patient pays phase 1 (SSE) · 4 what-if delay (API) → Gantt · 5 "clinic closes today" button
 *   6 beat B5 (clock on phase 2's visit day) → bone-graft preset → diff → agent feed → approve → send_invoice
 *   7 clock +49 days → phase 2 overdue → send_invoice_reminder
 *
 * Screenshots are for humans (the PR, the video check); only the assertions can fail the run.
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { GOLDEN_DELAY_MOVE } from "../../src/contracts/fixtures/implantCase";

const HERO_PDF = path.resolve(__dirname, "../../public/samples/presupuesto-implantes-ribera.pdf");
const SHOTS = path.resolve(__dirname, "../../test-results/demo-path");

type PlanView = {
  plan: {
    id: string;
    status: string;
    phases: { id: string; startDate: string; amountCents: number; payment: { status: string; dueDate: string } }[];
  };
  clock: { today: string };
  exposure: { prepaidUndeliveredCents: number };
  stress: { linkedLoan: { owedCents: number }; payPerPhase: { owedCents: number } } | null;
};

async function planView(request: APIRequestContext): Promise<PlanView> {
  const res = await request.get("/api/plans/demo");
  expect(res.ok(), "GET /api/plans/demo").toBeTruthy();
  return (await res.json()) as PlanView;
}

async function post(request: APIRequestContext, url: string, data: unknown = {}) {
  const res = await request.post(url, { data });
  return { res, body: (await res.json().catch(() => null)) as unknown };
}

/** Full-page by default; a modal overlay is fixed to the viewport, so those use `fullPage: false`. */
const shot = (page: Page, name: string, fullPage = true) =>
  page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });

/** Bryntum draws each Gantt row's bar in a wrapper carrying data-task-id (visit-ph3, pay-ph3, …). */
const ganttTask = (page: Page, id: string): Locator => page.locator(`[data-testid=plan-gantt] [data-task-id="${id}"]`);

async function leftOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box.x;
}

/** Bryntum paints once the data is loaded; wait for the visit bars, then let the layout settle. */
async function ganttReady(page: Page) {
  await expect(ganttTask(page, "visit-ph1")).toBeVisible({ timeout: 30_000 });
  await expect(ganttTask(page, "visit-ph4")).toBeVisible();
}

test("demo path: PDF quote → plan → pay → what-if → closure → agent → clock", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  // The app must never reach a live PayPal or Anthropic endpoint (the server is FORCE_MOCKS=1,
  // and the mock button never loads the PayPal SDK).
  const external: string[] = [];
  page.on("request", (r) => {
    const host = new URL(r.url()).hostname;
    if (/paypal|paypalobjects|anthropic/i.test(host)) external.push(r.url());
  });

  await test.step("1 · reset, mock mode", async () => {
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    const h = (await health.json()) as { ok: boolean; modes: Record<string, string> };
    expect(h.ok).toBe(true);
    expect(h.modes).toMatchObject({ paypal: "mock", paypalWebhooks: "mock", anthropic: "mock", agent: "playbook" });

    const reset = await post(request, "/api/demo/reset");
    expect(reset.res.status()).toBe(200);
    expect(reset.body).toMatchObject({ ok: true });
  });

  // ---------------------------------------------------------------- 2 · clinic
  let patientPath = "";
  await test.step("2 · clinic: upload the hero PDF, create the plan, approve, send", async () => {
    await page.goto("/clinic");
    await expect(page.getByTestId("clinic-console")).toBeVisible();

    await page.getByTestId("quote-file-input").setInputFiles(HERO_PDF);

    const lines = page.getByTestId("quote-line");
    await expect(lines).toHaveCount(12, { timeout: 30_000 });

    const bar = page.getByTestId("check-bar");
    await expect(bar).toBeVisible({ timeout: 30_000 });
    await expect(bar).toHaveAttribute("data-sum-matches", "true");
    await expect(page.getByTestId("check-sum")).toContainText("✓");
    await expect(page.getByTestId("check-sum")).toContainText("4.070,00 €");
    await expect(page.getByTestId("check-invalid")).toContainText("0 piezas inválidas");
    await expect(page.getByTestId("check-review")).toContainText("1 a revisar");
    await expect(page.getByTestId("odontogram")).toBeVisible();
    await shot(page, "01-clinic-extraction");

    await page.getByTestId("create-plan").click();
    await expect(page.getByTestId("plan-status")).toContainText("Borrador");
    await expect(page.getByTestId("plan-gantt")).toBeVisible();
    await ganttReady(page);
    await expect(page.getByTestId("trust-strip")).toBeVisible();

    // The approve button stays locked until every clinical note is ticked.
    const approve = page.getByTestId("approve-send");
    await expect(approve).toBeDisabled();
    const noteBoxes = page.locator("input[data-note-id]");
    expect(await noteBoxes.count()).toBeGreaterThan(0);
    await page.getByTestId("approve-all-notes").click();
    await expect(approve).toBeEnabled();
    await shot(page, "02-clinic-plan-notes");

    await approve.click();
    await expect(page.getByTestId("patient-link-card")).toBeVisible();
    await expect(page.getByTestId("patient-qr")).toBeVisible();
    await expect(page.getByTestId("plan-status")).toContainText("Aprobado");
    const link = (await page.getByTestId("patient-link").innerText()).trim();
    expect(link).toMatch(/\/p\/pln_[a-z0-9]+$/);
    patientPath = new URL(link).pathname;
    await shot(page, "03-clinic-approved-link");

    // The alias "demo" now resolves to the plan the dentist just created and approved.
    const view = await planView(request);
    expect(patientPath).toBe(`/p/${view.plan.id}`);
    expect(view.plan.status).toBe("approved");
    expect(view.plan.phases.map((p) => p.amountCents)).toEqual([36000, 150000, 52000, 169000]);
  });

  // ---------------------------------------------------------------- 3 · pay phase 1
  await test.step("3 · patient pays phase 1 (mock button, SSE)", async () => {
    await page.goto("/p/demo");
    await ganttReady(page);
    const card = page.getByTestId("phase-card-ph1");
    await expect(card).toHaveAttribute("data-status", "due");
    await expect(page.getByTestId("exposure-prepaid")).toContainText("0,00 €");
    await expect(page.getByTestId("paylater-message").first()).toBeAttached();
    await shot(page, "04-patient-before-pay");

    const pay = card.getByTestId("pay-phase");
    await expect(pay).toBeEnabled();
    await expect(pay).toContainText("360,00 €");
    await pay.click();

    await expect(card).toHaveAttribute("data-status", "paid", { timeout: 5_000 });
    await expect(card.getByTestId("phase-paid")).toBeVisible();
    await expect(page.getByTestId("ledger-row-ph1")).toContainText("360,00 €");
    await expect(page.getByTestId("ledger")).toContainText("360,00 €");
    await expect(page.getByTestId("exposure-prepaid")).toContainText("0,00 €");
    await expect(page.getByTestId("exposure-chip")).toBeVisible();
    await shot(page, "05-patient-paid");

    // Server agrees.
    const view = await planView(request);
    expect(view.plan.phases[0]?.payment.status).toBe("paid");
    expect(view.exposure.prepaidUndeliveredCents).toBe(0);
  });

  // ---------------------------------------------------------------- 4 · what-if delay
  await test.step("4 · what-if: delay the implants (API), the Gantt follows", async () => {
    const before = await planView(request);
    const ph3Before = before.plan.phases[2]!;
    await page.goto("/p/demo");
    await ganttReady(page);
    const ph3BarBefore = await leftOf(ganttTask(page, "visit-ph3"));
    const ph3CardDateBefore = await page.getByTestId("phase-card-ph3").getByTestId("phase-date").innerText();

    const { res, body } = await post(request, `/api/plans/${before.plan.id}/whatif`, {
      ...GOLDEN_DELAY_MOVE,
      persist: true,
    });
    expect(res.status()).toBe(200);
    expect(body).toMatchObject({ ok: true });

    const after = await planView(request);
    expect(after.plan.phases[1]?.startDate).toBe(GOLDEN_DELAY_MOVE.newStartDate);
    const ph3After = after.plan.phases[2]!;
    expect(ph3After.startDate > ph3Before.startDate, "ph3 moves later with the implants").toBe(true);

    await page.reload();
    await ganttReady(page);
    // ph3 moved: its Gantt bar is further right and its card shows a different date ...
    const ph3BarAfter = await leftOf(ganttTask(page, "visit-ph3"));
    expect(ph3BarAfter, "ph3 Gantt bar moved right").toBeGreaterThan(ph3BarBefore + 20);
    const ph3CardDateAfter = await page.getByTestId("phase-card-ph3").getByTestId("phase-date").innerText();
    expect(ph3CardDateAfter).not.toBe(ph3CardDateBefore);
    expect(ph3CardDateAfter.trim().startsWith(String(Number(ph3After.startDate.slice(8))))).toBe(true);
    // ... and the baseline ghost (the original plan) is still drawn, left of the moved ph3 bar.
    const ph3Row = await ganttTask(page, "visit-ph3").boundingBox();
    const baselines = await page.locator("[data-testid=plan-gantt] .b-task-baseline").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width };
      }),
    );
    expect(baselines.length, "baseline ghosts exist").toBeGreaterThanOrEqual(4);
    expect(
      baselines.some((b) => Math.abs(b.y - ph3Row!.y) < 40 && b.x < ph3BarAfter - 20),
      "a baseline ghost of ph3 stays at its original date",
    ).toBe(true);
    await shot(page, "06-patient-whatif-gantt");
  });

  // ---------------------------------------------------------------- 5 · closure
  await test.step("5 · \"¿Y si la clínica cierra hoy?\"", async () => {
    const closure = page.getByTestId("closure-button");
    await closure.scrollIntoViewIfNeeded();
    await expect(closure).toBeVisible();
    await closure.click();
    const panel = page.getByTestId("closure-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("3.710,00 €");
    await expect(panel).toContainText("0,00 €");
    await expect(page.getByTestId("closure-illustrative")).toBeVisible();
    const source = page.getByTestId("closure-source");
    await expect(source).toHaveAttribute("href", /dsca\.gob\.es/);
    await expect(source).toContainText("dsca.gob.es");
    // The counters count up for ~1 s: wait for the settled value so the screenshot is not taken mid-animation.
    await expect(page.getByTestId("closure-loan-owed").locator("[aria-hidden]")).toHaveText("3.710,00 €", { timeout: 5_000 });
    await expect(page.getByTestId("closure-ppp-owed").locator("[aria-hidden]")).toHaveText("0,00 €", { timeout: 5_000 });
    await shot(page, "07-patient-closure", false);
    await page.getByTestId("closure-close").click();
    await expect(panel).toBeHidden();
  });

  // ---------------------------------------------------------------- 6 · agent
  await test.step("6 · beat B5, bone graft preset, diff, agent feed, approve", async () => {
    // Step 4 persisted a 6-week delay; the video records this beat from B5, so go there.
    const beat = await post(request, "/api/demo/beat", { beat: "B5_AGENT_READY" });
    expect(beat.res.status()).toBe(200);

    await page.goto("/clinic#plan-editor");
    await expect(page.getByTestId("plan-editor-body")).toBeVisible();
    await expect(page.getByTestId("agent-feed")).toBeVisible();
    await shot(page, "08-clinic-before-preset");

    await page.getByTestId("preset-bone-graft").click();
    const diff = page.getByTestId("diff-panel");
    await expect(diff).toBeVisible();
    await expect(page.getByTestId("diff-total-delta")).toContainText("450,00 €");
    await expect(page.getByTestId("diff-headline")).toBeVisible();
    await expect(page.getByTestId("preset-bone-graft-done")).toBeVisible();
    await shot(page, "09-clinic-diff");

    const feed = page.getByTestId("agent-feed");
    const toolStep = (tool: string) => feed.locator('[data-testid=agent-step][data-kind=tool_call]').filter({ hasText: tool });
    await expect(toolStep("cancel_sent_invoice").first()).toBeVisible({ timeout: 15_000 });
    await expect(toolStep("create_invoice").first()).toBeVisible({ timeout: 15_000 });
    const card = feed.getByTestId("approval-card");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId("approval-summary")).toBeVisible();
    await expect(card.getByTestId("approval-hash")).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await shot(page, "10-clinic-agent-approval");

    await card.getByTestId("approve-button").click();
    await expect(toolStep("send_invoice").filter({ hasNotText: "send_invoice_reminder" }).first()).toContainText("✓", {
      timeout: 15_000,
    });
    await expect(feed.getByTestId("approval-card")).toHaveCount(0, { timeout: 15_000 });
    await shot(page, "11-clinic-agent-sent");
  });

  // ---------------------------------------------------------------- 7 · clock
  await test.step("7 · clock +49 days: phase 2 overdue, reminder in the feed", async () => {
    // B5 put the clock on phase 2's visit day: phase 2 is due and its reissued invoice was sent.
    const before = await planView(request);
    expect(before.plan.phases[1]?.payment.status).toBe("due");

    const clock = await post(request, "/api/clock", { advanceDays: 49 });
    expect(clock.res.status()).toBe(200);

    const after = await planView(request);
    expect(after.plan.phases[1]?.payment.status).toBe("overdue");

    // Live on the clinic page (SSE): the clock badge moves, the agent logs the reminder.
    const feed = page.getByTestId("agent-feed");
    await expect(
      feed.locator("[data-testid=agent-step][data-kind=tool_call]").filter({ hasText: "send_invoice_reminder" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(feed.locator("[data-testid=agent-step][data-kind=tool_call]").filter({ hasText: "send_invoice_reminder" }).first()).toContainText("✓");
    await expect(page.getByTestId("sim-clock")).toBeVisible();
    await shot(page, "12-clinic-reminder");

    await page.goto("/p/demo");
    await ganttReady(page);
    await expect(page.getByTestId("phase-card-ph2")).toHaveAttribute("data-status", "overdue");
    await shot(page, "13-patient-overdue");
  });

  expect(external, "no request to a live PayPal or Anthropic host").toEqual([]);
  expect(consoleErrors, "no uncaught page errors").toEqual([]);
});
