#!/usr/bin/env bash
# Render build command (render.yaml → buildCommand). Needs no secret.
#
# Default path (always tried first):
#   npm ci (dev deps included: next build needs typescript and tailwind) → npm run build.
#   Bryntum comes from the PUBLIC npm trial alias ("@bryntum/gantt": "npm:@bryntum/gantt-trial@…").
#
# Fallback (never the default): only when `npm ci` fails AND BRYNTUM_NPM_TOKEN is set, the
# @bryntum scope is pointed at npm.bryntum.com and the install is retried. The token itself is
# never written to disk: .npmrc gets the literal ${BRYNTUM_NPM_TOKEN}, which npm expands from the
# environment. See docs/deploy.md ("Bryntum registry fallback").
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

log() { printf '[render-build] %s\n' "$*"; }

export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
NPM_FLAGS=(--include=dev --no-audit --no-fund)

log "node $(node --version 2>/dev/null || echo '?') · npm $(npm --version 2>/dev/null || echo '?') · commit ${RENDER_GIT_COMMIT:-local}"

use_bryntum_registry() {
  if grep -q '^@bryntum:registry=' .npmrc 2>/dev/null; then
    log ".npmrc already points @bryntum at a private registry"
    return
  fi
  # Single quotes on purpose: the token stays an npm-expanded variable, not a value on disk.
  {
    printf '\n# Added by scripts/render-build.sh: Bryntum registry fallback (build machine only, never committed)\n'
    printf '@bryntum:registry=https://npm.bryntum.com\n'
    printf '%s\n' '//npm.bryntum.com/:_authToken=${BRYNTUM_NPM_TOKEN}'
  } >> .npmrc
  log "switched @bryntum to https://npm.bryntum.com"
}

if npm ci "${NPM_FLAGS[@]}"; then
  log "installed from the public npm registry (Bryntum trial alias)"
elif [[ -n "${BRYNTUM_NPM_TOKEN:-}" ]]; then
  log "npm ci failed; BRYNTUM_NPM_TOKEN is set, retrying with the Bryntum registry"
  use_bryntum_registry
  # The lockfile may pin npmjs tarballs/integrity for @bryntum; try it first, then re-resolve.
  if ! npm install "${NPM_FLAGS[@]}" --no-save; then
    log "install with the lockfile failed; re-resolving without it"
    npm install "${NPM_FLAGS[@]}" --no-save --no-package-lock
  fi
  log "installed with @bryntum from npm.bryntum.com (fallback)"
else
  log "npm ci failed and BRYNTUM_NPM_TOKEN is not set. If the Bryntum trial alias is the cause,"
  log "set BRYNTUM_NPM_TOKEN on the service and redeploy (docs/deploy.md, Bryntum registry fallback)."
  exit 1
fi

# The persistent disk (/var/data) is mounted at runtime only, never on the build machine. Give any
# build-time store access a throwaway directory so `next build` can never need or touch the disk.
BUILD_DATA_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DATA_DIR"' EXIT
log "next build (DATA_DIR=$BUILD_DATA_DIR for the build only)"
DATA_DIR="$BUILD_DATA_DIR" npm run build
log "build OK"
