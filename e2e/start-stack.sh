#!/usr/bin/env bash
# Starts the built API (mock models) and web app for E2E runs, then waits until both answer.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?set DATABASE_URL to the e2e database}"
export MODELS=mock MOCK_DELAY_MS="${MOCK_DELAY_MS:-100}" PAGE_COUNT="${PAGE_COUNT:-4}"
export FREE_BOOKS=3 DEMO_CODES=E2E-DEMO ORDER_STAGE_MS="${ORDER_STAGE_MS:-1500}"
# Staff generation (translations, theme proposals) costs a cent a call, so the activity flow can reach a daily cap.
export MOCK_STAFF_COST_USD=0.01
# Needs apps/api/geoip/country.mmdb: pnpm --filter @fabulka/api geoip
export GEO_BLOCK=true
# Exchange rates are not fetched from the ECB and the National Bank in E2E runs (no network); flows set them by hand.
export FX_REFRESH=off
# Filling in the form by voice (mocked transcription), for the api-voice flow.
export VOICE_INPUT=true
# Test-only admin account for the admin flow (the password sign-in is off unless asked for).
export ADMIN_EMAIL=admin@e2e.test ADMIN_PASSWORD=e2e-admin-password ADMIN_SECRET=e2e-secret
export ADMIN_PASSWORD_LOGIN=true
# Sign-in through the API's fake identity provider; emails are kept in memory (GET /api/test/mails).
export AUTH_MOCK=true AUTH_SECRET=e2e-auth-secret PUBLIC_URL=http://localhost:3000 RESEND_API_KEY=
# SEO publish re-renders the site at once; IndexNow pings go to the API's test endpoint (GET /api/test/indexnow).
export REVALIDATE_SECRET=e2e-revalidate-secret WEB_INTERNAL_URL=http://localhost:3000
export INDEXNOW_KEY=e2e0indexnow0key0123 INDEXNOW_ENDPOINT=http://localhost:4000/api/test/indexnow
export STORAGE_DIR="${STORAGE_DIR:-$ROOT/apps/api/storage-e2e}" PORT=4000

(cd "$ROOT/apps/api" && node dist/main.js > "$ROOT/e2e/api.log" 2>&1 &)
(cd "$ROOT/apps/web" && API_URL=http://localhost:4000 npx next start --port 3000 > "$ROOT/e2e/web.log" 2>&1 &)

for url in http://localhost:4000/api/health http://localhost:3000; do
  for _ in $(seq 1 60); do curl -sf "$url" > /dev/null && break; sleep 1; done
  curl -sf "$url" > /dev/null || { echo "not up: $url"; tail -n 50 "$ROOT"/e2e/*.log; exit 1; }
done
echo "stack up: web :3000, api :4000"
