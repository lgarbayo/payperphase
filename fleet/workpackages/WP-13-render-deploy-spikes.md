---
id: WP-13
title: Deploy on Render (render.yaml, persistent disk, health check, always-on), Gate A Bryntum check on the live URL, sandbox setup doc, demo-check script
deps: []
owns:
  - render.yaml
  - scripts/render-build.sh
  - scripts/demo-check.ts
  - app/api/health/**
  - docs/deploy.md
  - docs/sandbox-setup.md
  - docs/spikes/bryntum-render.md
status: todo
hours: 1.5
criteria: [Presentation, Technological Implementation]
---

## Goal
The scaffold is live on a public Render URL **before any feature merges** (Gate A, Tue ~19:30 CET), and it redeploys from `main` automatically after that. It runs Node 22, a Starter always-on instance on credits, and a persistent disk for `DATA_DIR`, with seed on boot. `/gantt-lab` renders Bryntum on the live URL. The PayPal sandbox accounts and webhook are documented so live mode can be switched on by setting env vars. A `demo-check` script verifies the live demo path.

## Consumes
- Scaffold: `package.json` scripts (`build`, `start` honours `$PORT`), `.env.example`, `src/env.ts` (`modes()`), `store.getClock()`.
- Bryntum is already verified locally: the public trial alias builds and renders through `next/dynamic` on Next 15.5 / React 19.2.

## Provides
- `render.yaml` Blueprint:
  - web service `payperphase`, `runtime: node`, Node 22 (`NODE_VERSION=22`), region `frankfurt`, plan `starter`;
  - `buildCommand: ./scripts/render-build.sh` (default `npm ci && npm run build`), `startCommand: npm start`, `healthCheckPath: /api/health`, `autoDeploy: true`;
  - a disk mounted at `/var/data` (1 GB) with `DATA_DIR=/var/data`;
  - every `.env.example` key declared, secrets with `sync: false`, `NEXT_TELEMETRY_DISABLED=1`.
- `scripts/render-build.sh`: runs `npm ci && npm run build`. If the public alias ever fails and `BRYNTUM_NPM_TOKEN` is set, it switches `.npmrc` to npm.bryntum.com before installing. Documented, never the default.
- `app/api/health/route.ts`: returns `HealthResponse` with `version` from `RENDER_GIT_COMMIT` and the modes. Already stubbed; keep the shape.
- `scripts/demo-check.ts` (`npx tsx scripts/demo-check.ts <baseUrl>`): checks `GET /api/health`, `POST /api/demo/reset`, `GET /api/plans/demo`, and `GET /p/demo`, `/clinic`, `/gantt-lab`, `/` for 200s. It prints a pass/fail table and exits non-zero on failure.
- `docs/deploy.md` (how to deploy, env, rollback, logs), `docs/sandbox-setup.md` and `docs/spikes/bryntum-render.md` (Gate A evidence).

## Acceptance criteria
- [ ] `render.yaml` is valid as a Render Blueprint, and every `.env.example` key appears in it.
- [ ] Hand the human the exact steps to create the service: connect the GitHub repo as a Blueprint and fill in the secrets. You cannot click in the Render dashboard, so write them in `docs/deploy.md` and report them in your final message. If a `RENDER_API_KEY` is available in the environment, you may use the Render API instead.
- [ ] On the live URL, `/api/health` returns `ok:true` (mock modes are fine at Gate A), `/gantt-lab` shows Bryntum task bars, and `/p/demo` renders. Record the URL, the time, and what was checked in `docs/spikes/bryntum-render.md`. If the human hasn't created the service yet, verify with `npm run build && PORT=3100 npm start` locally plus the same checks, and say so.
- [ ] `scripts/demo-check.ts` passes against the local production build. Give its exit codes a tiny unit test, or document a manual run.
- [ ] `docs/sandbox-setup.md` covers:
  - creating the ES **business** sandbox account (EUR, receiving preferences set to auto-accept EUR) and the ES **personal** buyer;
  - the REST app's client ID and secret;
  - registering the webhook at `https://<render-url>/api/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED` and `INVOICING.INVOICE.PAID`;
  - which env var each value goes into;
  - keeping logins valid until 15 Dec;
  - asking Bryntum for a hackathon licence key (to remove the trial watermark).
- [ ] The Starter (always-on) plan is used, not free, so it never sleeps during judging. The disk keeps `db.json`, and boot reseeds if it is missing.

## Notes
- Render is the host only. We don't target the Render prize, so don't build Render Workflows.
- Never commit secrets. `.env` is git-ignored.
- The `build` must not need any secret: everything mocks without keys.

## Contract change requests
_None yet._
