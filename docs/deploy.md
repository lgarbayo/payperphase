# Deploying PayPerPhase on Render

Render is only the host. The app is one Node 22 web service with a 1 GB persistent disk. `render.yaml` is the Blueprint.

## Create the service (about 5 minutes, one time)

1. Push the repo to GitHub (branch `main`).
2. Render dashboard > **New** > **Blueprint** > connect the GitHub repo > select branch `main`. Render reads `render.yaml`.
3. Fill the prompted values (all optional; any blank secret leaves that integration in mock mode with a "Mock" badge):
   - `PUBLIC_BASE_URL`: leave a placeholder now, set to `https://<service>.onrender.com` after step 4.
   - `PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (same value), `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `DEMO_PATIENT_EMAIL`, `DEMO_MERCHANT_EMAIL`: see `docs/sandbox-setup.md`.
   - `ANTHROPIC_API_KEY`, `BRYNTUM_NPM_TOKEN` (leave blank normally).
4. **Apply**. The first build takes a few minutes. When live, copy the URL, set `PUBLIC_BASE_URL` to it (Environment tab) and save (this redeploys).
   `NEXT_PUBLIC_*` values are inlined at build time, so changing them needs a redeploy.
5. Verify: `npx tsx scripts/demo-check.ts https://<service>.onrender.com`. Add `--browser` to also confirm Bryntum task bars on `/gantt-lab` (needs `npx playwright install chromium`).

Plan: **Starter** (always on, about $7/month, paid from credits). It never sleeps during judging (1-15 Dec). Health check: `/api/health`. Auto-deploys on every push to `main`; docs/fleet/tests-only changes are skipped.

## Persistent disk and seeding

`DATA_DIR=/var/data` is the disk; `db.json` lives there and survives deploys. If it is missing (first boot, or the free plan which has no disk) the store reseeds on boot. "Reset demo" in the UI (or `POST /api/demo/reset`) returns to the seed at any time.

## Free-plan option

Delete the `disk:` block and set `plan: free`; `DATA_DIR` may stay (the store reseeds when `db.json` is absent, state is lost on each restart/deploy). The free plan sleeps after 15 minutes of inactivity, and a webhook arriving at a sleeping instance can fail. The return reconcile (WP-04) stays the source of truth. To reduce sleeping, set the GitHub repo variable `RENDER_URL`; `.github/workflows/keep-warm.yml` then pings `/api/health` every 10 minutes (no-op when unset).

## Env reference

Every key of `.env.example` is declared in `render.yaml`. Non-secrets carry values; secrets use `sync: false`. The build needs no secret.

## Rollback

Dashboard > the service > **Events** (or **Deploys**) > pick a previous successful deploy > **Rollback**. Then disable auto-deploy if you need it to stay put. The disk is untouched by rollbacks.

## Logs and debugging

Dashboard > **Logs** (live tail), or `render logs` with the Render CLI. `GET /api/health` returns 503 naming malformed env keys (never values) or an unreadable store; `version` is the short commit SHA.

## Bryntum registry fallback

Bryntum comes from the public npm trial alias (`@bryntum/gantt` = `@bryntum/gantt-trial`). Only if `npm ci` fails and `BRYNTUM_NPM_TOKEN` is set does `scripts/render-build.sh` retry with `@bryntum:registry=https://npm.bryntum.com`. Never the default; the token is never written to disk.
