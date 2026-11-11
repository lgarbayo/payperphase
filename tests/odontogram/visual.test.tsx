/**
 * Visual harness: renders the odontogram to static HTML with the app's CSS tokens and screenshots
 * it with Playwright Chromium at 320 / 360 / 540 / 720 px, ES and EN. Skipped unless asked for:
 *   ODONTOGRAM_SHOTS=tests/odontogram/screenshots npx vitest run tests/odontogram/visual.test.tsx
 */
import { describe, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { GOLDEN_LINES, GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { Odontogram, marksFromLines, type ToothMark } from "@/components/odontogram/Odontogram";

const out = path.resolve(process.env.ODONTOGRAM_SHOTS ?? "tests/odontogram/screenshots");

const css = readFileSync("app/globals.css", "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("@theme"));

const golden = marksFromLines(GOLDEN_LINES, GOLDEN_PLAN.phases);
const delivered: ToothMark[] = [
  { tooth: 36, category: "SURGICAL", phaseN: 1, state: "missing", code: "EXTRACTION" },
  { tooth: 46, category: "IMPLANT", phaseN: 2, state: "done", code: "IMPLANT" },
  { tooth: 37, category: "RESTORATIVE", phaseN: 1, state: "done", code: "FILLING" },
  { tooth: 16, category: "ENDODONTIC", phaseN: 3, state: "planned", code: "ROOT_CANAL" },
  { tooth: 24, category: "PROSTHETIC", phaseN: 3, state: "planned", code: "CROWN" },
  { tooth: 11, category: "ORTHODONTIC", phaseN: 1, state: "planned", code: "ORTHO_BRACES" },
  { tooth: 21, category: "PERIODONTAL", phaseN: 1, state: "planned", code: "SCALING_ROOT_PLANING" },
  { tooth: 75, category: "RESTORATIVE", phaseN: 1, state: "planned", code: "FILLING" },
];

const cases: Array<{ name: string; width: number; el: ReactElement }> = [
  { name: "golden-es-720", width: 720, el: <Odontogram marks={golden} locale="es" size="lg" /> },
  { name: "golden-es-540", width: 540, el: <Odontogram marks={golden} locale="es" size="md" highlight={[36, 46]} /> },
  { name: "golden-en-320", width: 320, el: <Odontogram marks={golden} locale="en" size="sm" /> },
  { name: "golden-es-360-md", width: 360, el: <Odontogram marks={golden} locale="es" size="md" /> },
  { name: "empty-es-540", width: 540, el: <Odontogram marks={[]} locale="es" size="md" /> },
  { name: "states-es-720", width: 720, el: <Odontogram marks={delivered} locale="es" size="lg" primary /> },
];

const html = (el: ReactElement, width: number) => `<!doctype html><html><head><meta charset="utf-8"><style>
${root}
html,body{margin:0;background:var(--ppp-bg);font-family:var(--ppp-font);color:var(--ppp-ink)}
.card{box-sizing:border-box;width:${width}px;padding:16px;background:var(--ppp-surface);border:1px solid var(--ppp-border);border-radius:14px;margin:16px}
.text-muted{color:var(--ppp-muted)} .text-xs{font-size:12px} .text-\\[11px\\]{font-size:11px}
.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.justify-center{justify-content:center}
.gap-1{gap:4px}.gap-2{gap:8px}.gap-x-3{column-gap:12px}.gap-y-1{row-gap:4px}.mx-auto{margin-left:auto;margin-right:auto}.mt-1{margin-top:4px}.pt-1{padding-top:4px}
.w-full{width:100%}.block{display:block}.h-auto{height:auto}.inline-flex{display:inline-flex}.inline-block{display:inline-block}.h-2{height:8px}.w-2{width:8px}.rounded-full{border-radius:9999px}
.font-medium{font-weight:500}.text-center{text-align:center}ul{list-style:none;margin:0;padding:0}p{margin:0}
</style></head><body><div class="card">${renderToStaticMarkup(el)}</div></body></html>`;

describe("odontogram screenshots", () => {
  it.skipIf(!process.env.ODONTOGRAM_SHOTS)(
    "saves screenshots at 320–720 px",
    async () => {
      mkdirSync(out, { recursive: true });
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ deviceScaleFactor: 2 });
        for (const c of cases) {
          const file = path.join(out, `${c.name}.html`);
          writeFileSync(file, html(c.el, c.width + 34));
          await page.setViewportSize({ width: c.width + 70, height: 600 });
          await page.goto(`file://${file}`);
          await page.locator(".card").screenshot({ path: path.join(out, `${c.name}.png`) });
        }
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});
