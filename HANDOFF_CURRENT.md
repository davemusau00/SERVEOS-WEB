# ServOS Bar-First v2 Current Handoff

Prepared from the downloaded `davemusau00/servos-` source on 2026-09-24.

## Production journey implemented in the current working tree

The installed Tauri application is being moved to:

`Install → Intake Wizard → Owner Enrollment → Business Setup Wizard → Go-Live Check → Staff Unlock → Open Till → Operate Bar → Reconcile → Close Day → Backup/Sync → Reports → Help`

Current source includes the bar-v2 implementation work for:

- durable installation/setup state and intake persistence;
- native RBAC capability model and session permissions;
- single-use manager approval flow for protected actions;
- owner enrollment without seeding a fake restaurant outlet/store;
- production-native setup wizard and go-live gating;
- native bar POS shell separated from browser sample preview;
- product portions, modifier/recipe snapshots and price-rule snapshots;
- stock opening balances, receiving, transfers, waste and counts;
- item-specific KDS states and routing;
- cash/card/manual M-Pesa and mixed tender foundation;
- protected discounts, comps, void/refund paths and drawer cash movements;
- M-Pesa reconciliation, staff security lifecycle and close-day reporting surfaces;
- dynamic native floorplan/inventory/catalog workspaces;
- generated offline Help Center sourced from `docs/user-guide/`;
- RBAC/onboarding/acceptance/completion/evidence documentation;
- Windows, Linux and Android deployment scripts;
- CI workflow and documentation validation scripts.

## Validation executed in this environment

The following completed successfully immediately before this handoff:

- `node scripts/build-help-index.mjs` → 30 offline help articles generated;
- `node scripts/docs-check.mjs` → documentation checks passed;
- `npm run audit:ui` → 1,682 UI interactions inventoried;
- `node --test tests/*.test.mjs` → 11/11 tests passed.

## Validation not claimed here

This environment does not establish packaged-device acceptance. Before production use, run the target-machine gates documented in `docs/BAR_PRODUCTION_ACCEPTANCE.md` and `docs/TEST_EVIDENCE.md`, including:

- dependency install and real `npm run lint` / `npm run build`;
- Playwright browser suite;
- Rust native domain tests / container tests;
- Tauri native build on target OS;
- Supabase protocol test against isolated test infrastructure;
- full offline/restart/reconnect/backup/restore rehearsal;
- Windows/Linux/Android packaged-device checks.

No module should be called deployment verified until those gates pass.

## Important files

- `src/native/` — installed production UI and workflows.
- `src-tauri/src/store.rs` — authoritative native business commands.
- `src-tauri/src/lib.rs` — Tauri API, enrollment, sync and runtime boundary.
- `src-tauri/migrations/002_bar_v2.sql` — bar-v2 local schema additions.
- `docs/RBAC_AND_PERMISSIONS.md` — permission model.
- `docs/ONBOARDING_AND_SETUP.md` — intake/setup/go-live design.
- `docs/BAR_PRODUCTION_ACCEPTANCE.md` — production rehearsal gate.
- `docs/COMPLETION_LEDGER.md` — completion evidence ledger.
- `docs/TEST_EVIDENCE.md` — executed vs outstanding verification.
- `scripts/deploy-windows.ps1`, `deploy-linux.sh`, `deploy-android.ps1` — deployment helpers.
