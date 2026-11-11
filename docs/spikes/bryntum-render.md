# Spike: Bryntum on Render (Gate A)

## Status

**Live Render URL: not yet created.** The human has linked Render to GitHub but has not applied the Blueprint (`docs/deploy.md`). Until then the same checks were run against the local production build, which is the build Render runs (`scripts/render-build.sh` then `npm start`).

## Local production run (2026-11-11 00:35 CET)

- `npm run build` (Next 15.5, Node as installed locally) succeeded; `/gantt-lab` prerenders as a static page, Bryntum loads client side through `next/dynamic`.
- `PORT=<free port> DATA_DIR=<tmp dir> npm start`, then `npx tsx scripts/demo-check.ts http://localhost:<port> --browser --chromium-path <chromium>`:

| Check | Result |
| --- | --- |
| GET /api/health | 200, `ok:true`, all modes `mock`, `simToday` 2026-11-16 |
| POST /api/demo/reset | 200, hero plan `pln_ribera01` |
| GET /api/plans/demo | 200, 4 phases, total EUR 4,070.00 |
| GET /p/demo, /clinic, /gantt-lab, / | 200 each |
| Browser: /gantt-lab | **4 Bryntum task bars** (`.b-gantt-task`) rendered, headless Chromium |

7/7 HTTP checks plus the browser check pass (exit code 0).

## Still to do on the live URL

1. Apply `render.yaml` (or `render.free.yaml`) per `docs/deploy.md`.
2. Run `npx tsx scripts/demo-check.ts https://<service>.onrender.com --browser` (needs `npx playwright install chromium`).
3. Record here: the URL, the time, the output above. If the public trial alias fails to install on Render, set `BRYNTUM_NPM_TOKEN` (fallback in `docs/deploy.md`).

Known limits: the trial build shows a Bryntum trial notice; request a hackathon licence key (`docs/sandbox-setup.md`, section 5).
