#!/usr/bin/env bash
set -euo pipefail
REPO="${1:-$PWD}"; cd "$REPO"
for c in node npm rustc cargo; do command -v "$c" >/dev/null || { echo "$c is required" >&2; exit 1; }; done
[ -f .env.local ] || { echo '.env.local is required; configure the dedicated business Supabase project.' >&2; exit 1; }
npm ci
npm run lint
npm test
npm run test:browser
npm run test:native
npm run docs:check
npm run audit:ui
npm run build
npm run native:build
echo 'Linux package complete. Inspect src-tauri/target/release/bundle.'
