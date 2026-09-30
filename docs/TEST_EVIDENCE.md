# Test evidence

## CLEAN-ServOS convergence slices - 2026-09-30

The current convergence pass verified or advanced WP-01/02/03/04/05/07/08/09/10/11 locally. `npm run lint`, `npm test` (122 Node tests), and the isolated production browser suite passed. Production browser evidence is 40/40 across `pos-terminal` (1024 x 600), `aio-terminal` (1280 x 720), `laptop` (1366 x 768), and `mobile-layout` (390 x 844), including whole-location inventory count, transactional POS till/payment/refund/close-day, response-loss workflow retention, and typed-draft storage flows. The focused storage suite is 3/3, including two-tab typed-draft promotion exactly once and sensitive-field redaction. Native MSVC evidence is 72/72 from the current checkout; disposable cloud base/v2 through expansion 026, build, docs, protocol and UI gates were also executed in this convergence run.

WP-04 now has an executable source-level inventory guard: all literal `runtime.command('...')` and local `command('...')` operation call sites under `src` must be declared in `src/runtime/operationManifest.ts`. Canonical staged permission, role and transitional operation-ID inputs are checked from `contracts/permissions.json`, `contracts/roles.json` and `contracts/operations.json`; `npm run contracts:check` passed with 89 permissions, 8 roles, 78 operations and 3 deterministic generated artifacts for TypeScript, Rust and SQL. The source guard passes with 122 Node tests. This proves call-site, ID/permission-input and generated-artifact drift detection only; it does not yet prove payload schemas, handler semantics, or every computed operation.

The operation-specific dependency resolver is now wired into WebBusinessApp and covers the POS payment, till, refund, close-day, order, room and hospitality relation paths exercised by current handlers. This is not full WP-09 closure: the complete operation registry and every declared dependency fixture still need to be derived and checked. WP-08 now retains failed online workflows as typed review drafts, supports reopening drafts that have form metadata, carries validated `supersedes` correlation for reviewed replacements, blocks promotion when the stored policy version differs from the current snapshot, tells operators to create a fresh command after conflict/rejection, and the response-loss browser path passes in all four viewports; inventory count reload/reopen and response-loss recovery are also covered in the focused production POS proof. Shared-device/logout durability remains open.

The Web inventory count flow now keeps its browser-local count session when the command is rejected, conflicted or remains pending, blocks confirmation while unknown barcodes remain unresolved, and sends every active stock item in one reviewed command. Forward cloud migration 024 implements the shared `inventory.countLocation` rows contract: every active stock item is required exactly once, baselines/catalog conversion are checked and locked, unknown scans are rejected, one `stockCounts` record is written, and only non-zero variances create movements. `npm run test:cloud:v2` passed through migration 024 and the whole-location fixture, including replay. The production browser acceptance passed 4/4 viewports and the full 40/40 matrix; focused production POS proof now covers reload/reopen and response-loss synchronization cleanup. Physical scanner and packaged-terminal evidence remain open under WP-10.

WP-22 now has an exact decimal input foundation in `src/utils/fiscal.js`: operator percentages such as `16%` become `1600` basis points, percentages above 100 or beyond two decimal places are rejected, money strings become safe integer minor units without floating-point rounding, and quantities are bounded to three decimal places unless a workflow requires whole units. Web and Native room-rate forms, Native hotel-service forms, and setup rate creation use the parser. Web Quick Add, Web Catalog, Native Quick Product, the legacy Native quick form, Native ProductDialog, and first-catalog setup now require an explicit tax class and show standard/zero-rated/exempt choices instead of silently assigning `A_STANDARD`; CSV product creation rejects missing or unsupported tax classes. Web inventory counts/transfers/waste and procurement order/receiving inputs now validate quantity precision, finite range and asset whole-unit rules before command effects. The focused fiscal/inventory tests pass 5/5 and TypeScript lint passes. Native/cloud quantity enforcement and end-to-end fiscal snapshot acceptance remain open.

WP-25 now has a PWA asset foundation: `public/manifest.webmanifest` references 192x192, 512x512 and maskable ServOS SVG icons, while `index.html` exposes favicon and Apple touch icon links. `tests/pwa-assets.test.mjs` also verifies that the generated shell worker does not cache authorized API requests, only activates a waiting update after the explicit `SERVOS_ACTIVATE_UPDATE` message, and that the Web UI blocks activation while a command or synchronization is busy. Standalone installation, installed upgrade retention and physical-device evidence remain open.

The room-stay Settings blocker is now actionable in both Web and Native: nightly rate options are constrained to the selected room type, incompatible saved defaults are cleared, and both clients reject a mismatched rate before submitting `roomStay.settings`. `node --test tests/room-settings-source.test.mjs` passes; full dialog focus/footer and target-viewport acceptance remain open.

The shared Native `ActionDialog` now forwards the design-system footer and accepts a `busy` guard that blocks wrapper dismissal while a command is in flight. Legacy catalog deletion, outlet renaming, staff deletion and inventory deletion now use typed in-app dialogs rather than browser `confirm`/`prompt`. Native close-request flush failures now remain recoverable in an in-app dialog with Keep working and Retry save and close actions. `SearchCombobox` now has an accessible option/listbox contract with stable IDs, keyboard navigation, loading/error/empty states and inline creation support. The shared `Drawer` now traps focus, handles Escape and restores focus on close; `ContextHelpDrawer` now uses it. Staged Web catalog/inventory, procurement, refunds, POS and financial-controls modal wrappers now delegate to the shared `Dialog`. The main Web workflow editor now places actions in the shared fixed footer and associates them with its scrollable form via an explicit form ID; its generic entity selectors and staff role controls now use `SearchCombobox` IDs and labels. `node --test tests/action-dialog-source.test.mjs tests/operator-ux-source.test.mjs` passes. Remaining custom overlays and viewport/focus acceptance remain open.

WP-26 cleanup removed four committed production `.bak` files and the duplicate root reconciliation migration after its SHA-256 matched `supabase/migrations/202609270001_reconciliation_manifest.sql`. `.gitignore` now covers backup suffixes, the staging runbook references the canonical migration, and the reviewed Native POS source no longer contains the targeted mojibake markers. Full Node tests passed 127/127, TypeScript lint passed, documentation checks passed, and `git diff --check` passed. Physical UI capture and broader repository encoding review remain open.

WP-02 CI wiring now has source coverage for frontend, Native domain, base cloud, cloud expansion, desktop shell and production browser jobs. Cloud and desktop jobs upload `artifacts/**` with `if: always()` and the frontend job uploads the full UI audit and browser evidence. `node --test tests/ci-workflow-source.test.mjs` verifies the named commands and evidence steps. This proves the repository workflow contract locally, not a hosted GitHub run or packaged Windows shell.

Room policy and condition convergence now has forward cloud migration 025. `room.condition` requires `rooms.manage`, checks the room version, permits only `AVAILABLE` or `OUT_OF_ORDER`, rejects an active RESERVED/CHECKED_IN reservation from being taken out of order, and writes maintenance condition metadata without changing housekeeping state. Native and cloud room fixtures cover the same state-preservation and active-reservation denial outcomes. `npm run test:native` passed 72/72 and `npm run test:cloud:v2` passed through expansion 025; move, extension, checkout and complete cross-runtime time acceptance remain open under WP-11/WP-12.

WP-12 now routes Web reservation default departure through `businessDateTimeAfterBusinessDays`, which converts the arrival instant to the configured property-local date, advances that calendar date, applies the configured checkout wall time, and converts exactly once to UTC. The regression suite proves this remains correct in `Pacific/Kiritimati` and continues rejecting invalid/ambiguous business wall times. Rust timezone interpretation and cloud reservation comparisons still contain the documented `Africa/Nairobi`/unsupported-zone boundary and require a later cross-runtime migration.

## DEV final sprint P0 local gate - 2026-09-30

After `npm ci` (107 packages installed; 0 reported vulnerabilities), the following local checks passed on the same source state:

- `npm run lint` and `npm run build` (Vite warns that the main JS chunk is 893.87 kB; build succeeds).
- `npm test`: 112 passed.
- `npm run test:browser`: 22 passed across desktop and mobile Playwright projects, including the transactional two-operator and online POS flows.
- `npm run test:native:container`: 71 passed in the Linux container. The host Windows Rust test command is not the evidence used here; its first local attempt could not find `dlltool.exe`.
- `npm run test:cloud`: base migration and disposable PostgreSQL protocol checks passed. This is not hosted Supabase evidence.
- `npm run audit:ui:gate`: passed; 3,492 interactions inventoried and no `window.prompt`/`window.confirm` findings. The generated report still contains 48 review findings and leaves interactions `UNREVIEWED`.
- `npm run docs:check`: 40 guides and 15 core docs passed; `git diff --check` passed (Git emitted only CRLF normalization warnings).

This completes the local P0 gate only. Hosted CI state, Tauri package installation/upgrade, physical scanner/printer, low-height device acceptance, production migration, and live deployment were not tested. P1 UX review and P2-P27 remain open; web-v2 remains default-off.

### P1 audit heuristic follow-up - 2026-09-30

`scripts/audit-ui.mjs` now walks source files in stable order, records a source digest, omits clock-based `generatedAt`, and stores compact semantic summaries in Git while emitting full inventory/audit payloads under `artifacts/ui-audit/` for CI upload. The disabled-opacity rule is shared with the gate and a seeded opacity-only control is verified to exit nonzero; visible-state styling is treated separately. Repeated audit runs produced identical hashes. The latest `npm run audit:ui:gate` reports 3,538 interactions and 379 review candidates and passes the browser-prompt zero rule. The focused source suite passes 17/17. These are static candidates only; no workflow has been manually reviewed or accepted. Selected workflow/operation acceptance remains open. This is P1 progress, not acceptance.

### P2 property-time hospitality slice - 2026-09-30

The staged Web session contract now returns only the configured property timezone, nightly checkout time, and day-use cutoff; a disposable SQL assertion verified that the property's test tax identifier is not returned. Terminal Front Desk derives arrival/departure day buckets and tape-chart day boundaries from property-local dates. Web Front Desk formats stays in the session timezone and exposes why check-in is unavailable (not yet due or room not ready), while the command remains queued through the established v2 path.

Evidence: 8 focused source tests passed; the full Node suite passed 115 tests; lint and documentation checks passed; the Web Front Desk scenario passed on desktop and mobile against disposable PostgreSQL; `npm run test:cloud:v2` passed all expansion SQL suites including migration 023, Web session privacy assertions, and the two-connection room race. Browser production build succeeded during the focused Playwright run. Native domain tests (71 passed) were run before this later TS/UI-only slice; they were not rerun afterward.

This is not full P2 acceptance: quick guest/reservation creation, availability/rate summaries, derived-stay preview, checkout blockers/recovery, room-block and maintenance quick actions, low-height/keyboard/stale-version/duplicate-submit/permission cases, Terminal component runtime, packaged terminal, and hosted deployment remain unverified. Migration 023 is only applied inside disposable test databases.

## Expansion checks — 2026-09-26

### Stay, folio and paid-extension continuation

`node scripts/test-supabase.mjs --expansion` passed with migrations 008-009 and `tests/supabase/folios.sql`, plus all preceding legacy/domain/allocation tests and the independent two-connection room booking race. The new suite used real PostgreSQL records and journal entries to verify:

- opening a reservation folio, deposit liability and captured cash/change;
- check-in with cleanliness/current-interval guards, due nightly/day-use posting and repeated catch-up without duplicate effects;
- rejection of checkout before complete booked-period posting or settlement;
- bounded deposit application, manually confirmed external payment, normalized business-wide M-Pesa reference rejection and overpayment rejection;
- linked unpaid service-charge reversal and immutable folio/stay history;
- room moves with preserved billing, changed occupancy, dirty old room and a turnaround block;
- exact-price paid extensions, rollback of the extension charge/departure when payment reference validation fails, one successful extension after replay, and no repeat charge during catch-up;
- exact resulting revenue, tax, receivable and deposit totals, balanced journals and separate payment/reversal permissions.

`npm run lint`, documentation checks (33 guides/15 core documents) and `git diff --check` passed in this continuation. Native, browser and packaging checks were not rerun for this SQL/documentation slice; their earlier evidence remains below. These tests do not prove production Supabase, desktop/web UI integration, real provider reconciliation, offline grants or physical printing. Test fixtures for hotel services/payment accounts are not evidence of completed master-data UI or configured accounting integration.

### Operational cloud continuation

Staged migrations 003-007 and new asset/room suites passed `node scripts/test-supabase.mjs --expansion` against disposable PostgreSQL 18.6. The suite exercised asset tag uniqueness, guarded lifecycle/custody, immutable history, maintenance state transitions, stock/journal/payable completion, rollback after a later invalid supplier, same-command response-loss replay, permission denial and sensitive change-feed filtering. Expired allocations continued to protect another device's stock, asset and room resources. Room checks covered nightly/day-use overlap, exact day-use duration, turnaround boundary, maintenance blocks/inspection release, cancellation/no-show guards, housekeeping and rate-snapshot preservation.

The harness also launched two independent PostgreSQL connections using two registered devices to compete for the same room/time interval. Exactly one reservation committed; the other returned ROOM_UNAVAILABLE. Both outcomes retained command/audit records; only the committed booking entered the change feed. This is real database concurrency evidence, not full desktop/browser multi-device acceptance.

TypeScript, all 19 Node tests, documentation checks (33 guides/15 core docs), production Vite build and `git diff --check` passed again in this continuation. Native and browser suites were not rerun for this SQL/contract/documentation slice; their results below belong to the earlier receipt/storage work. No staged migration was applied to a live business project. Operational UI, stay/folio commands, acquisition linkage, offline grants and live recovery remain pending.

### Earlier receipt, settings and storage checks

Windows workspace, Node 26, Rust/MSVC and Docker available. Checks below apply to the source slices in [Completion ledger](COMPLETION_LEDGER.md), not the full expansion.

- `npm run lint`: passed.
- `npm test`: 19 passed.
- `npm run build`: passed. Final production JS bundle was 486.29 kB (130.49 kB gzip), without the earlier large-chunk warning; the explicitly enabled demo test bundle still emits that warning.
- `npm run docs:check`: passed, 33 guides and 15 core documents after the receipt/settings guide was added.
- `npm run audit:ui`: 1,901 controls/handlers/routes inventoried, not runtime acceptance.
- `cargo test --manifest-path native-tests/Cargo.toml`: 31 passed, including printer tests and new receipt/settings cases.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: 31 passed, including current receipt/settings and printer code.
- `npm run test:browser`: 12 passed across desktop/mobile, including receipt print-root/footer/overflow, real IndexedDB restart/replay/rollback and service-worker offline shell reload without caching private API responses.
- `node scripts/test-supabase.mjs --expansion`: passed in disposable PostgreSQL, including legacy protocol, staged v2 command/replay/conflict/authorization/cursor/tombstone tests and allocation budget/interval/ownership/expiry/handover tests.

Receipt tests use real SQLite transactions; browser receipt tests mock Tauri transport. Browser queue tests exercise real IndexedDB with simulated cloud responses. Cloud tests use disposable PostgreSQL, not the configured Supabase project. No physical printer, Vercel publication, full multi-device trading, Rooms/Assets operational acceptance or live migration was performed.

Mobile receipt screenshot `test-results/preview-native-checkout-pr-2b26a-and-business-receipt-copies-mobile-layout/receipt-preview.png` was visually inspected: readable two-copy preview and footer with no horizontal clipping. This is screen evidence, not physical paper output. `git diff --check` passed.

Final production-bundle smoke on local port 3012 passed: `/#/hotel` opens authenticated Remote business management and exposes no Open UI preview button or sample route. No online business sign-in or deployment was performed.

## Historical environment — 2026-09-24

Date: 2026-09-24.

Available: Node 22, npm 10, global `tsc`.

Unavailable: Rust/Cargo and Docker. `npm ci` timed out due environment network access, so Vite/Playwright/Tauri package execution cannot be honestly claimed from this environment.

## Dependency-independent checks

Run before handoff:

```bash
node scripts/build-help-index.mjs
node scripts/docs-check.mjs
node scripts/audit-ui.mjs
node --test tests/*.test.mjs
```

The final handoff response must report their actual results.

## Full target-machine gate

After successful dependency installation:

```bash
npm ci
npm run lint
npm run build
npm test
npm run test:browser
npm run test:native
npm run test:cloud
npm run audit:ui
npm run docs:check
```

Do not change a status to deployment verified unless the complete packaged-device rehearsal in [BAR_PRODUCTION_ACCEPTANCE.md](BAR_PRODUCTION_ACCEPTANCE.md) also passes.

## Verification update — 2026-09-27

### Staff, devices and approvals — 2026-09-28

`node scripts/test-supabase.mjs --expansion` passed the legacy and expansion migrations 001-016, all domain suites, `tests/supabase/staff-devices.sql`, and the real two-connection room booking race. The new SQL suite uses disposable PostgreSQL/Auth substitutes. It verifies canonical permission profiles, Auth-bound staff creation and role synchronization, denied Server-to-Admin escalation, device list/revoke, and command denial after revocation. Approval tests reject wrong action, target, initiator, expiry and replay; procurement over-receipt consumes the scoped approval in its transaction and records the approver on its GRN. These checks do not prove hosted Auth invitations, credential recovery, shared physical terminal accounts, or a production policy configuration.

`npm run lint`, `npm test` (70 tests before the new staff source regression), and `npm run audit:ui` passed during implementation. The full `npm run verify` will be reported after its current-tree run. No hosted migrations, credentials, or production controls were changed. Browser approval tokens are retained in the current IndexedDB command payload until the queued command is acknowledged; encrypting/protecting that sensitive local data is pending.

### Staged POS settlement, refunds and close-day

Against the current tree, `npm run verify` passed the production build and lint, all 70 Node tests, all 16 desktop/mobile browser cases, all 55 native domain tests, the UI interaction inventory (2,738 controls/handlers/routes), and documentation checks (40 guides/15 core documents). Browser transaction tests exercised till open, online cash settlement, refund and close-day report through the disposable PostgreSQL web bridge. They are local staged acceptance, not hosted Supabase or production browser evidence. The production build reports a 808.12 kB main JavaScript chunk above the configured 500 kB warning threshold; Rust emits two pre-existing unused-assignment warnings.

`node scripts/test-supabase.mjs --expansion` passed migrations 001-015 and all disposable PostgreSQL protocol/domain suites, including cash/split/manual MPesa/card payments, replay/conflict/authorization checks, partial refund, over-refund rejection, full reversal, balanced journal/immutable history, close-day totals and the independent two-connection room-booking race. The harness creates disposable local PostgreSQL infrastructure. It does not connect to or modify the configured Supabase project.

Still unverified: hosted migration/RLS acceptance, real provider payment/refund or MPesa statement reconciliation, room-charge settlement, full close-day void/inventory/system-health coverage, authenticated permissions against configured business roles, desktop adapter, signed offline rights, production cutover, real multi-device trading, target installation and physical printer acceptance. The browser bridge does not establish those properties.

The controlled room CSV UPDATE defect is fixed in the native import planner. Planning keeps the staged row separate and removes the create-only `initialStatus` field from the actual room UPDATE command. `room_csv_imports_apply_through_native_room_commands` now covers stage → plan → apply for create and update, verifies the planned UPDATE omits `initialStatus`, changes floor/wing, and preserves existing housekeeping and maintenance state.

Executed against the final source:

- `npm run lint` — passed.
- `npm test` — 68 passed.
- `cargo test --manifest-path native-tests/Cargo.toml` — 55 passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` — 55 passed.
- `npm run verify` — passed: production Vite build, Node suite, browser suite (12 passed, 2 PostgreSQL-backed browser cases skipped because no staging browser session is configured), native container suite (55 passed), UI inventory, and documentation checks.
- `node scripts/test-supabase.mjs --expansion` — passed migrations 001–013 and all disposable PostgreSQL suites, including the real two-connection room booking race.
- `git diff --check` — passed.

The production build still reports a main JavaScript chunk above 500 kB. PostgreSQL tests used disposable local infrastructure, not the configured business Supabase project. No v2 activation, live migration, fresh-device rehearsal, or physical acceptance was performed by these checks. A Windows Tauri release executable compiled, but `npm run native:build` exited 1 during MSI bundling because Tauri could not resolve/download its WiX bundle tool (`No such host is known`, OS error 11001). This is an environment/network packaging failure, not installer acceptance.

Windows packaging follow-up: `npm run native:build` compiled the optimized `servos.exe`, then failed before producing the MSI because Tauri attempted to download WiX and DNS resolution failed (`No such host is known`, OS error 11001). Re-run packaging on a host with the required WiX toolchain available; a compiled executable is not an installer or terminal acceptance.

### UX and Guidance foundation — 2026-09-28

Executed against the current working tree after adding the Home/task navigation and native guidance foundation:

- `npm run lint` — passed.
- `npm test` — 79 passed, including UX/guidance alignment, permission-filtered navigation, commit-event source checks, and executable guide-registry validation.
- `npm run test:browser` — 16 passed across desktop and mobile-layout projects. The native Tauri mock unlock flow checked Home, the core tour, Quick Add permission filtering, and the existing receipt flow. This is browser-mocked UI evidence, not packaged terminal acceptance.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` — 56 passed, including staff-isolated, restart-durable guidance progress kept outside the business outbox and schema 10 acceptance.
- `npm run test:native:container` — 56 passed.
- `npm run docs:check` — passed: 40 Help Center articles and 15 core documents.
- `npm run audit:ui` — inventoried 2,798 controls, handlers, and routes; this is static inventory, not acceptance.
- `npm run build` — passed. The main JavaScript chunk is 833.26 kB, above the 500 kB warning threshold.
- `git diff --check` — rerun after the evidence update.

### Simple Operations Release A follow-up — 2026-09-28

Implemented first-run catalog and inventory empty states and translated common version, duplicate, missing-reference, and validation errors into staff-facing messages. This changes UI presentation only; native command payloads and transaction semantics are unchanged.

- `npm run lint` — passed.
- `npm run build` — passed; generated 40 offline help articles. Main JavaScript chunk is 835.41 kB and still triggers Vite's 500 kB warning.
- `npm run docs:check` — passed: 40 Help Center guides and 15 core documents.
- `git diff --check` — passed.

Room/property/import empty states, complete centralized error coverage, smart-default audit, and task workflow acceptance remain open.

### Products & Menu creation follow-up — 2026-09-28

New product creation now starts with a unified Drink/Food/Retail/Service choice, name, selling price and fulfillment destination. It generates an editable item code, offers existing-stock tracking as an explicit opt-in, and defers portions/recipes to later setup. Existing products retain the established advanced edit form. No family/physical-variant data model or atomic new-stock/opening-balance orchestration was added in this UI-only slice.

- `npm run lint` — passed after implementation.
- `npm run build` — passed (835.41 kB main chunk warning; see above).
- `npm run docs:check` — passed: 40 Help Center guides and 15 core documents.
- `git diff --check` — passed after implementation.

Family/variant compatibility, stock setup orchestration, storage-place workflow, and targeted browser/native acceptance remain open.

### Stock master and Storage Places follow-up — 2026-09-28

Stock master creation now starts with the item name and count unit; item code is generated and editable under advanced controls with barcode, scan quantity, average cost and reorder level. The form explicitly says it creates a master only and directs opening quantities to ledger-backed receiving/opening-balance flows. Master Data labels stock locations as Storage Places, offers an optional location description, generates an internal place code when omitted, and gives an actionable empty state. The existing `stockLocations` collection, `inventory.adjust` permission, and archive reference protections remain in force.

- `npm run lint` — passed.
- `npm run docs:check` — passed: 40 Help Center guides and 15 core documents.
- `git diff --check` — passed.

Atomic create-stock-plus-opening-balance was implemented in Phase 1 below. Phase 2's location-first count is recorded below; consistent Storage Place labels across remaining screens and broader workflow acceptance remain open.

### Quick Add and guide routing follow-up — 2026-09-28

Reconciled the user-supplied upstream-main review against checked-out local source. Quick Add now encodes direct `add-item`, `add-room`, and `add-asset` actions, exposes them only with manage permissions, and opens the matching flow or its prerequisite. Guide cards use their own versioned progress, route steps request shell navigation through the permission-filtered allowlist, and the tour observes target resize and closes on Escape.

- `npm test` — passed, 79 tests.
- `npm run lint` — passed.
- `npx playwright test tests/browser/preview.spec.ts -g "native checkout provides customer and business receipt copies"` — passed, desktop and mobile. This verifies the item Quick Add deep link opens the create form and that a user without room/property create permission sees no such choices.
- `npm run test:browser` — passed, 16 cases across desktop and mobile layouts.
- `git diff --check` — passed.

Guide route transition behavior has source coverage but no cross-workspace route-step browser scenario yet. Room and asset Quick Add prerequisite branches also need targeted browser coverage. First-login welcome, role-specific guide recommendations, larger workflow guides, and the complete anchor/focus refinements remain pending.

The source workflows for product/catalog, stock, rooms/property, imports, and operational summaries, along with their task-specific guides, are not implemented by this foundation slice. No target-device, hosted cloud, or production acceptance is claimed.



### Product families and physical variants - 2026-09-28

The native catalog accepts additive product-family metadata on the existing JSON product records. Each sellable size keeps its own product ID/code/barcode and can link a distinct existing stock item. Whole-container and embedded serving formats reuse existing product portions and the committed order-fire inventory path. Native validation rejects incomplete/invalid family metadata, duplicate size labels, and reuse of one stock item across sizes in the same family. Products without family metadata remain compatible.

- `cargo test --manifest-path src-tauri/Cargo.toml --lib product_families_keep_container_variants_and_sale_formats_on_separate_stock` - passed (1 test; 56 filtered). It verified separate stock balances, portions, duplicate size rejection, and duplicate stock-link rejection through committed commands.
- `npm run lint` - passed after variant UI changes.
- `npm test` - passed, 79 tests.
- `npm run docs:check` - passed: 40 offline Help articles and 15 core docs.
- `git diff --check` - passed at check time.

`npx playwright test tests/browser/preview.spec.ts -g "native checkout provides receipts and location stock count"` - passed, desktop and mobile. It verifies family creation, selecting another family size, unique stock links (the existing stock link is disabled), portions, receipt behavior, and that location-count draft/review stages issue no command before a single full-count command at confirmation. This remains browser-mocked UI evidence. Room/property workflow simplification, first-use onboarding, and workflow guides remain open.


### Phase 1 - Atomic Add Item + Stock + Starting Quantity - 2026-09-28

The Quick Product dialog can now create a product and new stock master together, choose a Storage Place, enter whole starting containers, and convert that count into the stock item's base unit. The native `catalog.createWithOpeningStock` command generates both record IDs, links the product to its stock master, stores the barcode, initializes on-hand quantity, and records a valued `OPENING_BALANCE` movement. The complete write is one native transaction, audit entry, command result, and outbox envelope. Both `catalog.manage` and `inventory.adjust` are required. Existing product-only and existing-stock-link paths remain available.

- `cargo test --manifest-path src-tauri/Cargo.toml --lib` - passed, 59 tests. This full run preceded the final audit-count assertion; the two focused Phase 1 tests were rerun afterward.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib atomic_catalog_setup` - passed, 2 tests. Covers linked records and converted opening stock/cost, single audit/outbox result and idempotent retry; invalid location leaves no partial records; Server role is denied.
- `npx playwright test tests/browser/preview.spec.ts -g "native checkout provides customer and business receipt copies"` - passed on desktop and mobile. Browser mock verified 12 x 1,000 ml becomes 12,000 ml and the UI sends one atomic native command.
- `npm test` - passed, 79 tests.
- `npm run lint` - passed.

This is local native/domain and browser-mocked UI evidence. A packaged terminal run remains open. Phases 2 and 3 are recorded below; Phases 4-8 remain queued in the order listed in the delivery plan.

### Phase 2 - Location-first Stock Count - 2026-09-28

Inventory now starts a count with a Storage Place, then presents every active stock item with expected quantity, a manual counted quantity, and a live variance. The review summarizes matching, short, and over counts. Draft and review are frontend-only; confirmation sends one `inventory.countLocation` command. The native transaction requires `inventory.count` or a valid manager approval, requires every active stock item exactly once, rejects stale expected balances, records a committed count review, and applies only non-zero variances as stock movements. Because the command executes in one SQLite transaction, any failed movement rolls back the whole count. Continuous scan drafts remain Phase 3.

- `cargo test --manifest-path src-tauri/Cargo.toml --lib location_count` - passed, 2 focused tests. Covers complete count summary, movement/audit/outbox idempotency, incomplete and stale count rejection, rollback after a forced second-item movement failure, and Server-role authorization gating.
- `npm run lint` - passed.
- `npx playwright test tests/browser/preview.spec.ts -g "native checkout provides receipts and location stock count"` - passed, desktop and mobile. The browser mock verifies no command for draft or review and one full-location command after confirmation.
- Physical scanner, target-terminal operation, and ManagerApprovalDialog interaction were not exercised in this slice.

### Phase 3 - Continuous Scanner Count Session - 2026-09-28

Inventory now offers a continuous scanner session from a selected Storage Place. USB keyboard-wedge barcodes and stock codes resolve to stock masters; each scan adds `scanUnitQuantity` (or one base unit when unset). Unrecognized or ambiguous codes remain visible in the draft; a cashier can assign a code to a stock item or dismiss it. Manual count edits remain available for stock not represented by a barcode. Every item must have an explicit quantity and unknown codes must be resolved or dismissed before review. The native review still calls Phase 2's single `inventory.countLocation` transaction.

SQLite migration 011 adds a dedicated scanner-draft table scoped to signed-in staff and Storage Place. Native read/save/clear APIs validate the session, item IDs, and quantities. They do not create business commands, audit entries, stock movements, or outbox records. Drafts persist through app restart and one staff member cannot read another's session. A successful count clears the local draft; failed or stale commits retain it for correction.

- `cargo test --manifest-path src-tauri/Cargo.toml --lib inventory_scanner_draft` - passed; verifies local quantity accuracy, invalid item/precision rejection, staff isolation, restart resume, discard, unchanged stock/movements, and no business outbox effect from draft writes.
- `npx playwright test tests/browser/preview.spec.ts -g "native checkout, location count, and resumable scanner draft"` - passed, desktop and mobile. Browser mock exercises scanner keyboard input, 350 ml and 750 ml scan quantities, unknown-code assignment, close/reopen resume, and confirms scans do not issue another stock-count command.
- `npm run lint` - passed.
- Physical barcode scanner, packaged-terminal migration rehearsal, and actual SQLite terminal restart remain open.


### 0.2.0 release-candidate gate — PENDING EXECUTION

Baseline: `c946ee1493067e6bcca2bccd8ebfcf40ad9920c4` or a reviewed descendant.

This patch adds source-contract tests, desktop/mobile Simple Operations browser acceptance, an existing-terminal upgrade runbook, a target-device acceptance worksheet and `scripts/verify-release-0.2.ps1`.

Run while uncommitted:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-release-0.2.ps1 -Repo C:\Users\Admin\Downloads\servos -AllowDirty
```

After commit, rerun without `-AllowDirty`.

Do not mark this section passed until command output has been reviewed. Physical acceptance remains pending until `RELEASE_0.2_ACCEPTANCE.md` is completed on the packaged terminal.

### Final customer-credit release gate — PENDING EXECUTION

Run the complete 0.2.0 verifier after applying the final customer-credit patch. The expected installed schema is 13. Required new evidence includes native customer credit charge/settlement/reconciliation tests, source contract tests, the full browser suite, Windows native/Tauri suites and staged PostgreSQL regression tests. Packaging and physical acceptance remain separate.
