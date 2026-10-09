#!/usr/bin/env bash
# Builds and deploys one Vercel project from the repository root (the project's
# Root Directory setting picks apps/web or apps/api). Used by the Go live workflow.
# Needs VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID and VERCEL_CLI (a pinned version).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .vercel
npx --yes "$VERCEL_CLI" pull --yes --environment=production --token="$VERCEL_TOKEN"
npx --yes "$VERCEL_CLI" build --prod --token="$VERCEL_TOKEN"
npx --yes "$VERCEL_CLI" deploy --prebuilt --prod --token="$VERCEL_TOKEN"
