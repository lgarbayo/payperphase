/**
 * OWNED BY P1 (polish). Real-browser drag test of the Bryntum hero chart on /p/demo.
 *
 *   npm run e2e                      (builds, starts the mock server, runs every spec)
 *   npx playwright test tests/e2e/gantt-drag.spec.ts
 *
 * Own spec file on purpose: demo-path.spec.ts stays untouched. The test resets the demo state through
 * POST /api/demo/reset first, so it is re-runnable. Pixels per day are derived from the DOM (two known
 * visit bars) and the API dates, never hard-coded, and the mouse moves in small steps.
 *
 * What it proves (screenshots land in test-results/gantt-drag/, for humans only):
 *   1 the whole plan is visible (visit-ph4 and pay-ph4 inside the Gantt viewport, no band column, ≥28 px pills,
 *     the payments-per-month summary row)
 *   2 no leftover drag zones on a drag-free load
 *   3 dragging visit-ph3 ~43 days earlier: the healing zone and the safe window are drawn mid-drag,
 *     the drop snaps back (flash + move-alert), the engine's ph3 date is unchanged, the zones are gone
 *   4 a valid drag of ph2 about +6 weeks moves ph3's bar to the right and clears the zones again
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import path from "node:path";

const SHOTS = path.resolve(__dirname, "../../test-results/gantt-drag");
const DAY_MS = 86_400_000;

type PlanView = { plan: { id: string; phases: { id: string; startDate: string }[] } };

const root = (page: Page) => page.getByTestId("plan-gantt");
const task = (page: Page, id: string): Locator => root(page).locator(`[data-task-id="${id}"]`).first();
const zones = (page: Page) => root(page).locator(".ppp-zone");

async function planView(request: APIRequestContext): Promise<PlanView> {
  const res = await request.get("/api/plans/demo");
  expect(res.ok(), "GET /api/plans/demo").toBeTruthy();
  return (await res.json()) as PlanView;
}

const startOf = (view: PlanView, id: string) => view.plan.phases.find((p) => p.id === id)!.startDate;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

/** Pixels per calendar day, from the left edge of two visit bars whose dates the API told us. */
async function pxPerDay(page: Page, view: PlanView): Promise<number> {
  const a = await box(task(page, "visit-ph1"));
  const b = await box(task(page, "visit-ph4"));
  const days = dayNumber(startOf(view, "ph4")) - dayNumber(startOf(view, "ph1"));
  return (b.x - a.x) / days;
}

/** Press on the bar, move in small steps to `days` days away, and leave the button down. */
async function dragStart(page: Page, id: string, days: number, perDay: number) {
  const b = await box(task(page, id));
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 4, y, { steps: 2 }); // pass Bryntum's drag threshold first
  const dx = days * perDay;
  const steps = 24;
  for (let i = 1; i <= steps; i++) await page.mouse.move(x + 4 + (dx * i) / steps, y);
}

test("Gantt hero: whole plan, constraint zones while dragging, snap-back and a valid move", async ({ page, request }) => {
  const reset = await request.post("/api/demo/reset", { data: {} });
  expect(reset.ok(), "POST /api/demo/reset").toBeTruthy();

  await page.goto("/p/demo");
  await expect(task(page, "visit-ph1")).toBeVisible({ timeout: 30_000 });
  await expect(task(page, "visit-ph4")).toBeVisible();
  const view = await planView(request);
  const ph3Start = startOf(view, "ph3");
  const ph2Start = startOf(view, "ph2");

  await test.step("1 · the whole plan is visible, pills are legible, no payment-form column", async () => {
    const gantt = await box(root(page));
    for (const id of ["visit-ph4", "pay-ph4"]) {
      const b = await box(task(page, id));
      expect(b.y, `${id} below the top`).toBeGreaterThanOrEqual(gantt.y);
      expect(b.y + b.height, `${id} inside the Gantt (no internal scroll)`).toBeLessThanOrEqual(gantt.y + gantt.height);
    }
    // No internal vertical scroll: the grid's scroller shows all its content.
    const scroll = await root(page)
      .locator(".b-grid-vertical-scroller")
      .first()
      .evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.clientHeight + 1);
    for (const id of ["visit-ph1", "visit-ph2", "visit-ph3", "visit-ph4"]) {
      expect((await box(task(page, id))).width, `${id} pill width`).toBeGreaterThanOrEqual(28);
    }
    await expect(task(page, "visit-ph3")).toContainText("3");
    // The patient chart never shows the "Forma de pago" column (the phase cards carry that chip).
    await expect(root(page).locator('[data-column="band"], [data-column-id="band"]')).toHaveCount(0);
    await expect(root(page).getByText(/Forma de pago|Payment$/)).toHaveCount(0);
    // The footer row sums the payments due per month tick (hero plan: 360 € in November).
    await expect(root(page).locator(".ppp-sum").first()).toContainText("360");
    // A drag-free load leaves no constraint zones behind.
    await expect(zones(page)).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "1-whole-plan.png") });
  });

  await test.step("2 · too-early drag of ph3: zones while dragging, snap-back after the drop", async () => {
    const perDay = await pxPerDay(page, view);
    expect(perDay).toBeGreaterThan(0.5);
    await dragStart(page, "visit-ph3", -43, perDay);
    await expect(root(page).locator(".ppp-zone-heal").first()).toBeVisible();
    await expect(root(page).locator(".ppp-zone-safe").first()).toBeVisible();
    await expect(root(page).locator(".ppp-zone-heal label, .ppp-zone-heal").first()).toContainText(/Cicatrizando|Healing/);
    await expect(root(page).locator(".ppp-zone-safe label, .ppp-zone-safe").first()).toContainText(/Ventana segura|Safe window/);
    await page.screenshot({ path: path.join(SHOTS, "2-mid-drag-zones.png") });
    await page.mouse.up();

    await expect(page.getByTestId("plan-gantt-flash")).toBeVisible();
    // The clinician-note card (role=alert; the plain fallback carries data-testid=move-alert) names the earliest date.
    await expect(page.locator('[data-testid=move-alert], [role=alert]').filter({ hasText: /7 abr 2027|7 Apr 2027/ }).first()).toBeVisible();
    await expect(zones(page)).toHaveCount(0);
    expect(startOf(await planView(request), "ph3"), "the engine kept ph3 where it was").toBe(ph3Start);
    await page.screenshot({ path: path.join(SHOTS, "3-snap-back.png") });
  });

  await test.step("3 · valid drag of ph2 about +6 weeks: ph3's bar follows to the right", async () => {
    await page.goto("/p/demo");
    await expect(task(page, "visit-ph4")).toBeVisible({ timeout: 30_000 });
    await expect(zones(page)).toHaveCount(0);
    const perDay = await pxPerDay(page, view);
    const ph3Before = (await box(task(page, "visit-ph3"))).x;
    await dragStart(page, "visit-ph2", 42, perDay);
    await expect(root(page).locator(".ppp-zone-heal").first()).toBeVisible();
    await page.mouse.up();

    await expect(zones(page)).toHaveCount(0);
    await expect
      .poll(async () => (await box(task(page, "visit-ph3"))).x, { message: "ph3 bar moves right after ph2 moves later" })
      .toBeGreaterThan(ph3Before + 20);
    await expect.poll(async () => startOf(await planView(request), "ph2") > ph2Start).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, "4-valid-move.png") });
  });
});

test("Gantt hero in English: the snap-back reason is not truncated and the legend steps aside", async ({ page, request }) => {
  const reset = await request.post("/api/demo/reset", { data: {} });
  expect(reset.ok(), "POST /api/demo/reset").toBeTruthy();
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("ppp.locale", "en");
    } catch {
      /* private mode: the test then runs in the default locale and still checks truncation */
    }
  });
  await page.goto("/p/demo");
  await expect(task(page, "visit-ph4")).toBeVisible({ timeout: 30_000 });
  const view = await planView(request);
  const perDay = await pxPerDay(page, view);
  await dragStart(page, "visit-ph3", -43, perDay);
  await expect(root(page).locator(".ppp-zone-heal").first()).toContainText(/Healing|Cicatrizando/);
  await page.mouse.up();

  const flash = page.getByTestId("plan-gantt-flash");
  await expect(flash).toBeVisible();
  await expect(flash).toContainText(/7 Apr 2027|7 abr 2027/);
  // While the reason is shown the legend items are gone, so the text has the whole strip: nothing is clipped.
  await expect(page.getByTestId("plan-gantt-legend").locator("ul")).toHaveCount(0);
  const clipped = await flash.evaluate((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  expect(clipped, "snap-back text is not clipped").toBe(false);
  await page.screenshot({ path: path.join(SHOTS, "5-en-snap-back.png") });
});
