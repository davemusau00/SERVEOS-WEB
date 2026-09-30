# Test evidence

## DEV final sprint P4 Web Smart Item recipes - 2026-09-30 (unverified)

The Web Smart Item flow now separates recipe-only menu products from stocked products so POS recipe deductions do not leave a misleading linked stock master. Recipe ingredients are converted to their stock unit, costed for preview, and submitted in one queued `product.save`; setup requires catalog management plus inventory viewing, the dependency resolver records ingredient/outlet versions, and expansion 032 enforces those baselines in the server transaction. Disposable SQL acceptance was added for persisted recipe lines, stale ingredient-version rejection, and permission denial, with source-contract assertions. Neither acceptance suite nor build/lint/browser checks were run; expansion 032 has not been applied. V2 remains default-off.

P4/P10 Web Smart Item now configures Spirit/Wine package sizes in ml, sends `sealedContainerSize` with the stock master, and records opening packages as sealed bottles. It emits a measured serving portion and an optional whole-bottle portion whose volume matches the sealed size, allowing staged POS to retain its existing auto-open/conservation behavior. The disposable SQL fixture was extended to assert sealed/open opening totals, movement evidence, and both portions; it remains unrun with all other deferred acceptance.

## DEV final sprint P22 operator identity foundation - 2026-09-30 (unverified)

The latest native login source uses online Auth credentials plus stable Staff ID verification to create the local session; it no longer requires the separate local PIN online. Local-PIN-only access remains the legacy/offline path. One-time staged terminal registration, OS credential-vault refresh-token storage/rotation, server identity revalidation, and sign-out cleanup remain in source. Expansion 028 adds Auth-bound terminal identity and active-member use of the paired device. `tests/native-operator-identity-source.test.mjs` was updated with source assertions for Auth-only login plus the PIN-only branch; the assertions have not been run. No tests, build, Cargo lock refresh, disposable migration run, hosted Auth validation, or migration application have been performed for this slice. Refresh lifecycle source remains unverified; the v2 command/outbox adapter, rollback/fencing and all v2/cutover gates remain open; v2 stays disabled.

Web v2 command creation now rejects offline enqueue/promotion at the BusinessStore boundary while retaining the existing local draft path; `tests/web-v2-online-only-source.test.mjs` was added but not run. A request that began online and loses its response may remain queued for idempotent status recovery; this is not an offline grant or a confirmed transaction.

## CLEAN-ServOS convergence slices - 2026-09-30

The current convergence pass verified or advanced WP-01/02/03/04/05/07/08/09/10/11 locally. `npm run lint`, `npm test` (122 Node tests), and the isolated production browser suite passed. Production browser evidence is 40/40 across `pos-terminal` (1024 x 600), `aio-terminal` (1280 x 720), `laptop` (1366 x 768), and `mobile-layout` (390 x 844), including whole-location inventory count, transactional POS till/payment/refund/close-day, response-loss workflow retention, and typed-draft storage flows. The focused storage suite is 3/3, including two-tab typed-draft promotion exactly once and sensitive-field redaction. Native MSVC evidence is 72/72 from the current checkout; disposable cloud base/v2 through expansion 026, build, docs, protocol and UI gates were also executed in this convergence run.

WP-04 now has an executable source-level inventory guard: all literal `runtime.command('...')` and local `command('...')` operation call sites under `src` must be declared in `src/runtime/operationManifest.ts`. Canonical staged permission, role and transitional operation-ID inputs are checked from `contracts/permissions.json`, `contracts/roles.json` and `contracts/operations.json`; `npm run contracts:check` passed with 89 permissions, 8 roles, 78 operations and 3 deterministic generated artifacts for TypeScript, Rust and SQL. The source guard passes with 122 Node tests. This proves call-site, ID/permission-input and generated-artifact drift detection only; it does not yet prove payload schemas, handler semantics, or every computed operation.

The operation-specific dependency resolver is now wired into WebBusinessApp and covers the POS payment, till, refund, close-day, order, room and hospitality relation paths exercised by current handlers. This is not full WP-09 closure: the complete operation registry and every declared dependency fixture still need to be derived and checked. WP-08 now retains failed online workflows as typed review drafts, supports reopening drafts that have form metadata, carries validated `supersedes` correlation for reviewed replacements, blocks promotion when the stored policy version differs from the current snapshot, tells operators to create a fresh command after conflict/rejection, and the response-loss browser path passes in all four viewports; inventory count reload/reopen and response-loss recovery are also covered in the focused production POS proof. Shared-device/logout durability remains open.

The Web inventory count flow now keeps its browser-local count session when the command is rejected, conflicted or remains pending, blocks confirmation while unknown barcodes remain unresolved, and sends every active stock item in one reviewed command. Forward cloud migration 024 implements the shared `inventory.countLocation` rows contract: every active stock item is required exactly once, baselines/catalog conversion are checked and locked, unknown scans are rejected, one `stockCounts` record is written, and only non-zero variances create movements. `npm run test:cloud:v2` passed through migration 024 and the whole-location fixture, including replay. The production browser acceptance passed 4/4 viewports and the full 40/40 matrix; focused production POS proof now covers reload/reopen and response-loss synchronization cleanup. Physical scanner and packaged-terminal evidence remain open under WP-10.

WP-22 now has an exact decimal input foundation in `src/utils/fiscal.js`: operator percentages such as `16%` become `1600` basis points, percentages above 100 or beyond two decimal places are rejected, money strings become safe integer minor units without floating-point rounding, and quantities are bounded to three decimal places unless a workflow requires whole units. Web and Native room-rate forms, Native hotel-service forms, and setup rate creation use the parser. Web Quick Add, Web Catalog, Native Quick Product, the legacy Native quick form, Native ProductDialog, and first-catalog setup now require an explicit tax class and show standard/zero-rated/exempt choices instead of silently assigning `A_STANDARD`; CSV product creation rejects missing or unsupported tax classes. Web inventory counts/transfers/waste and procurement order/receiving inputs now validate quantity precision, finite range and asset whole-unit rules before command effects. The focused fiscal/inventory tests pass 5/5 and TypeScript lint passes. Native/cloud quantity enforcement and end-to-end fiscal snapshot acceptance remain open.

WP-25 now has a PWA asset foundation: `public/manifest.webmanifest` references 192x192, 512x512 and maskable ServOS SVG icons, while `index.html` exposes favicon and Apple touch icon links. `tests/pwa-assets.test.mjs` also verifies that the generated shell worker does not cache authorized API requests, only activates a waiting update after the explicit `SERVOS_ACTIVATE_UPDATE` message, and that the Web UI blocks activation while a command or synchronization is busy. Standalone installation, installed upgrade retention and physical-device evidence remain open.

The room-stay Settings blocker is now actionable in both Web and Native: nightly rate options are constrained to the selected room type, incompatible saved defaults are cleared, and both clients reject a mismatched rate before submitting `roomStay.settings`. `node --test tests/room-settings-source.test.mjs` passes; full dialog focus/footer and target-viewport acceptance remain open.

The shared Native `ActionDialog` now forwards the design-system footer and accepts a `busy` guard that blocks wrapper dismissal while a command is in flight. Legacy catalog deletion, outlet renaming, staff deletion and inventory deletion now use typed in-app dialogs rather than browser `confirm`/`prompt`. Native close-request flush failures now remain recoverable in an in-app dialog with Keep working and Retry save and close actions. Native manager approval now uses the shared `ActionDialog` busy boundary. `SearchCombobox` now has an accessible option/listbox contract with stable IDs, keyboard navigation, loading/error/empty states and inline creation support. The shared `Drawer` now traps focus, handles Escape and restores focus on close; contextual help and remote manager selected-record details now use it. Staged Web catalog/inventory, procurement, refunds, POS and financial-controls modal wrappers now delegate to the shared `Dialog`. The main Web workflow editor now places actions in the shared fixed footer and associates them with its scrollable form via an explicit form ID; its generic entity selectors and staff role controls now use `SearchCombobox` IDs and labels. `node --test tests/action-dialog-source.test.mjs tests/operator-ux-source.test.mjs` passes. Remaining custom overlays and viewport/focus acceptance remain open.

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

`scripts/audit-ui.mjs` now walks source files in stable order, records a source digest, omits clock-based `generatedAt`, and stores compact semantic summaries in Git while emitting full inventory/audit payloads under `artifacts/ui-audit/` for CI upload. The disabled-opacity rule is shared with the gate and a seeded opacity-only control is verified to exit nonzero; visible-state styling is treated separately. Repeated audit runs produced identical hashes. The latest `npm run audit:ui:gate` reports 3,538 interactions and 379 review candidates and passes the browser-prompt zero rule. The focused source suite passes 20/20. These are static candidates only; no workflow has been manually reviewed or accepted. Selected workflow/operation acceptance remains open. This is P1 progress, not acceptance.

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

### CLEAN-ServOS WP-01 Native rerun — 2026-09-30

The current checkout was rerun with the Windows MSVC Native acceptance runner after the historical CI #28 room-fixture failures were recorded. The existing room safeguards and negative cases remain enabled; no tests were deleted or loosened.

- `npm run test:native` — passed: **72 tests, 72 passed, 0 failed**.
- The run emitted three existing Rust compiler warnings for unused assignments/parameters; they did not affect the result.
- Hosted CI, packaged Tauri shell, physical terminal, printer and scanner acceptance remain separate and unverified.

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

### CLEAN-ServOS WP-05 Native permission and role alignment — 2026-09-30

Native now uses the canonical `till.cashMovement` permission spelling in its explicit permission profile and till handler. The deprecated underscore spelling is covered by a negative Native assertion. Staff create and role-change validation accepts the documented `Admin`, `Manager`, `Cashier`, `Server`, `Chef`, `Housekeeper`, `Accountant`, and `Custom` roles, while unknown roles remain fail-closed.

- `npm run test:native` — passed: 72 tests, 72 passed, 0 failed.
- `npm run contracts:check` — passed: 89 permissions, 8 roles, 78 operations, 3 generated artifacts.
- `node --test tests/web-v2-permission-contract-source.test.mjs` — passed: 4 tests.
- `npm run lint` and `git diff --check` — passed.

This closes the identified Native spelling defect, not the full cross-runtime role/grant matrix or hosted/session-refresh acceptance.

### CLEAN-ServOS WP-11/12 staged room-time boundary — 2026-09-30

Expansion 021 now reads the configured property timezone for room-stay local-date, day-cutoff, and nightly-checkout validation. The canonical staged v2 path rejects an omitted `stayType` instead of silently applying legacy NIGHTLY behaviour. Room SQL fixtures and the concurrency payload now declare `NIGHTLY` or `DAY` explicitly.

- `node --test tests/rooms-engine-source.test.mjs` — passed: 3/3, including the no-hardcoded-Nairobi and explicit-stay-type assertions.
- `git diff --check` — passed.
- `npm run test:cloud:v2` — passed through expansion 026, including the room fixtures and real two-connection booking race.
- Rust timezone implementation/fixture and hosted production database acceptance remain open.

### DEV final sprint P2 Web Quick Reservation investigation â€” 2026-09-30

- `npm run lint` â€” passed after adding the Web reservation dialog and advisory availability helper.
- `node --test tests/operator-ux-source.test.mjs` â€” passed 21/21, including room-type, out-of-order, reservation/turnaround, and active-block preview cases.
- Targeted disposable-Postgres Playwright attempt â€” failed at server acceptance with `VALIDATION_FAILED: room interval`; test-only fixture edits were removed and the failure is recorded as an open timestamp-contract defect. No end-to-end reservation success is claimed.
- `npm test` â€” passed 145/145; `npm run build` and `npm run lint` â€” passed (existing large-chunk warning remains).
- `npm run test:cloud:v2` â€” passed through expansion 026, including the real two-connection room booking race; this does not cure the browser command rejection or establish Web reservation acceptance.
- `npm run audit:ui:gate` â€” passed; 3,554 interactions and 383 static review candidates inventoried, no prompt/confirm findings.
- `npm run docs:check` and `git diff --check` â€” passed. Full browser suite and native tests were not rerun on this change set.

Resolution: the failing attempt used incomplete fixtures (a selected room without a turnaround value, followed by an older reservation without `blockedUntil`). The permanent browser fixture now provides a valid room/rate and interval, and the end-to-end test passes on both desktop and mobile. Expansion 027 also safely handles historical reservations with no `blockedUntil`, validated in `tests/supabase/rooms.sql`.

Current P2 slice evidence: `npx playwright test tests/browser/transactions.spec.ts -g "Quick Reservation" --project=desktop` and the same command with `--project=mobile-layout` both pass. `npm run test:cloud:v2` passes through expansion 027, including the historical-overlap regression and two-connection booking race.

Web Housekeeping extension: source tests verify queued operation names and permission boundaries; `npm run lint` passes. The PostgreSQL-backed block/create, inspection/release, and maintenance/report flow passes under both Playwright projects (`desktop` and `mobile-layout`).

### DEV final sprint P2 room-move and checkout-readiness implementation continuation — 2026-09-30

Web Front Desk now previews room-move destination capacity, cleanliness/service state, committed reservation/turnaround overlap, and active blocks. The move uses the staged handler's `roomId` plus reason payload, retains the form on queue failure, and exposes a busy state to prevent duplicate submits. Checkout readiness explains missing stay/folio state, accommodation periods, balance, and unapplied deposit before the queued checkout command. `stay.move` remains partial in the parity manifest until browser acceptance.

Per the implementation-first rush instruction, the final source/lint/browser/native/cloud/docs verification pass is deferred until the feature work is complete. A previous concurrent Playwright attempt encountered preview-port contention and was interrupted; it is not acceptance evidence. No browser acceptance is claimed for these move/checkout additions. Existing prior green-gate evidence above applies only to the source state and flows stated in its dated entries.

### DEV final sprint P3 shared inventory math foundation — 2026-09-30

Added shared TypeScript item-type presets and conversion/calculation functions for canonical measurement units, purchase-package quantities, cost per canonical unit, stock variance, recipe and batch costs, sealed/open totals, and theoretical serving yields. Native Quick Product now consumes the shared canonicalizer. No test/build/lint evidence has been collected for this addition; all new-source verification is intentionally deferred to the sprint's final test stage.

### DEV final sprint P4 Native Smart Item Wizard — 2026-09-30

Native Catalog Add Item now presents four stages and ten product/ingredient/service classes, with recipe ingredient costing and a batch-yield path. The review stage previews product/stock/opening values before native atomic create. The command supports stock-only count/weight ingredients without a sellable product. The operation manifest marks staged PostgreSQL and Web `catalog.createWithOpeningStock` handlers as missing. No verification has been run for this change; the P4 browser/native acceptance matrix is deferred to the final test stage.

### DEV final sprint P5 Native package conversion — 2026-09-30

The Smart Item Wizard now captures supplier package label, contents as sale-container count or canonical stock units, optional package barcode, package price, and opening package count. The native payload derives scan quantity, average cost per stock unit, and opening balance quantity and persists a normalized package definition. Web stock count and PO receiving scanners match saved package barcodes and increment by canonical package base quantity. This is source-only evidence: no verification has been run; package administration and complete P5 acceptance remain deferred to the final test stage.

### DEV final sprint P7 package-aware procurement — 2026-09-30

Web PO drafting now attaches a saved package identity to STOCK lines, labels quantities/prices as packages, and shows remaining approved package and base-unit totals while receiving. Whole-package quantities are enforced in UI and native command validation; the receive dialog warns about over-receipts and requires the separate approval token before posting. PO package barcode scans increment the package count by one. Native and staged SQL PO creation validate package identity against the stock record; receipt posting preserves package quantities and converts them to base stock quantity and cost per base unit for inventory valuation and immutable stock movement. The operation manifest marks create/receive parity partial because hosted migration rollout and acceptance remain outstanding. Source only; tests remain deferred.

### DEV final sprint P9 Admin stock correction — 2026-09-30

Web Stock exposes a separate correction action to `inventory.adjust` permission holders, previews the absolute balance and delta, requires a reason, and queues `inventory.adjust`. Native and staged SQL sources emit `ADMIN_CORRECTION` movements and retain version checks. This source slice has not been verified; re-authentication and operator acceptance remain open.

### DEV final sprint P8 inline barcode resolution — 2026-09-30

The Web count dialog now offers an inline stock-target selector for unknown scanned barcodes to `inventory.adjust` operators. A successful queued stock-master save adds a barcode alias without changing on-hand quantity; operators rescan to include it. Duplicate/ambiguous code matches are not assignable, explicit removal remains possible, and unresolved codes block count submission. Native generic stock saves and staged SQL stock saves validate bounded alias lists and collisions while preserving package definitions. No verification was run; full scanner and cross-client acceptance remain deferred.

### DEV final sprint current-source regression gate â€” 2026-09-30

- `npm test` â€” passed 146/146; `npm run lint` and `npm run build` passed (existing Vite large-chunk warning remains).
- `npm run test:browser` â€” passed 32/32 across desktop and mobile, including Quick Reservation, Housekeeping block/release/report, two-operator response-loss retry, Native preview, inventory, and POS flows.
- `npm run test:native:container` â€” passed 72/72.
- `npm run test:cloud:v2` â€” passed through expansion 027, including legacy reservation overlap fallback and the real two-connection room booking race.
- `npm run audit:ui:gate` â€” passed; 3,578 interactions / 389 static review findings; no prompt/confirm findings. `npm run docs:check` and `git diff --check` passed.
- All evidence is local/disposable. Hosted CI, staged migration deployment, packaged terminal, physical hardware, and live cutover are not proven.

### Hosted Web incident investigation — 2026-09-30

The reported inventory TypeError is consistent with a resumed stock-count session stored in browser localStorage without a `counts` map: the stock selector indexed `resumable.counts[stockId]` on click. The Web inventory source now normalizes persisted count-session structure and uses guarded map access in read, selection, count, and commit paths. This diagnosis is a source-based inference; the deployed minified chunk was not retrievable for source-level confirmation.

Independent deployment evidence: the live app root returned HTTP 200 and referenced `/assets/index-DwUvRkVu.js`, but that asset returned HTTP 404 when fetched. All four exact asset URLs reported in the incident also returned 404 at investigation time. This supports a deployment artifact/HTML-cache inconsistency as the likely cause of the missing-module and corrupted-content messages; it does not by itself explain the count-map TypeError. The `servos_v2_guidance_progress` RPC also returned HTTP 404; its function exists in staged migration `017_web_lifecycle_guidance.sql`, so the deployed Supabase project likely lacks that migration or is targeting a project without it. No production mutation or deployment was performed. The inventory hardening change remains unverified; preserve separate hosted migration and deployment gates.
### Live Web deployment incident investigation — 2026-09-30

Read-only HTTP checks found that all four user-reported Vercel chunk URLs (`WebCatalogInventory-D5U9JeHX.js`, `WebPosView-DKY47-eT.js`, `receipt-Dp24HHuH.js`, and `utensils-DYqpNFla.js`) return 404. At the same time, `/` returns current HTML referencing `index-BhGwssST.js`; this supports a stale-tab/deployment chunk mismatch as the cause of dynamic-import failures and `NS_ERROR_CORRUPTED_CONTENT`. The exact `n[83df…]` catalog property access cannot be mapped to current source because the referenced bundle is unavailable. The user-reported hosted Supabase `servos_v2_guidance_progress` 404 was not independently authenticated/reproduced; staged migration `017_web_lifecycle_guidance.sql` defines and grants it, so the hosted project needs an authorized migration-state check. Added a one-time guarded Vite preload-error reload in `src/main.tsx`. No hosted writes/deployments were made, and no app-level test was run.

### DEV final sprint P10 sealed/open inventory source slice — 2026-09-30

Native setup, sale deduction, and correction paths now carry per-location sealed/open bottle state; staged SQL supports explicit sealed/open corrections, POS `order.fire` serving/whole-container consumption when product metadata is present, plus sealed/open-aware transfer/count via expansions 033/034. Web stock editing configures ml container size; correction and count drafts collect bottle count plus open ml. No tests, build, lint, migration, or hosted checks were run; complete P10 acceptance remains open.

### DEV final sprint P11 physical-unit recipe entry â€” 2026-09-30

Native Smart Item accepts weight package contents as a human quantity/unit and converts packages to canonical grams. Native and Web product recipe editors convert compatible kitchen units to the linked stock base unit; native and staged SQL validate bounded ingredient lists and stock references. Full Web Smart Item parity, dimensional rejection coverage, legacy compatibility and acceptance remain open. No tests, build, lint, or verification were run.

### DEV final sprint P12/P13 recipe yield and POS serving source slice â€” 2026-09-30

The existing native batch wizard derives per-portion recipe lines and cost from declared yield. Web Catalog now authors recipe lines, converts entered kitchen units, previews cost, and queues `product.save`; staged SQL validates and persists those linked stock ingredients while preserving existing sale metadata. POS staged order-fire consumes recipe/portion stock with sealed/open effects. No execution evidence was collected; batch preparation, acceptance, and staged hosted behavior remain unverified.

P12 batch preparation continuation (2026-10-01): source now includes native and staged `inventory.produceBatch`, a Web Inventory command form, linked finished-portion stock enforcement, full-yield ingredient deductions, weighted output cost, immutable movements, and POS consumption of prepared BATCH portions. `tests/inventory-batch-preparation-source.test.mjs` was authored but intentionally not executed. No lint, build, Node/native/browser/cloud test, migration, hosted deployment, or packaged evidence is claimed; all verification is deferred to the final implementation-pass stage.

P12 Web batch-authoring continuation (2026-10-01): Smart Item now has a BATCH setup path which records declared yield and converts full-batch recipe inputs into per-portion quantities, then creates the sellable product and linked zero-on-hand portion stock via `catalog.createWithOpeningStock`. Source-contract assertions were expanded but remain unexecuted. No build, native/browser/cloud verification or hosted migration evidence is claimed.

P13 BATCH modifier inventory continuation (2026-10-01): expansion 037 rebuilds staged BATCH item inventory snapshots from prepared portion stock plus positive ingredient adjustments from selected modifiers; each adjustment stock master is read and version-checked. Web `order.addItem` dependencies include selected modifier ingredient stock IDs. Source assertion authored; no SQL execution, migration, test, build or runtime evidence is claimed.

P14 explicit till-count continuation (2026-10-01): Web close no longer treats expected cash as a physical count and keys count/variance drafts by open till and actor. `tests/p14-till-explicit-count-source.test.mjs` was authored but intentionally not executed. No browser, native, SQL, build or lint evidence is claimed.

P15 invoice review continuation (2026-10-01): Web now requires an explicit confirmation that invoice quantities/prices were compared to the approved PO and accepted GRN before sending the exact-match command. `tests/web-v2-procurement-source.test.mjs` was updated but intentionally not run. No runtime, server, browser, migration, or accounting acceptance evidence is claimed.

P16 stable staff-key continuation (2026-10-01): Auth-to-staff binding generates a visible read-only UUID and reuses it as both the command target and persisted staff ID; new forms receive a fresh ID only after confirmed success. `tests/web-admin-generated-staff-id-source.test.mjs` was authored but intentionally not executed. No browser, backend, identity, build or lint evidence is claimed.

### DEV final sprint P14 till variance and payment recovery source slice â€” 2026-09-30

Web Finance now previews expected drawer cash, counted cash and variance, accepts an explicit zero, requires a reason for any non-zero variance, and blocks authority-required closure when the actor lacks `till.override_variance`. Native and staged close handlers apply `tillPolicy.varianceThreshold` (KES), requiring override permission only when the absolute variance exceeds the tolerance. Web POS/Finance/Refunds use an operator-facing protocol error formatter. No tests, build, lint, or runtime checks were run; payment/cash-up acceptance remains deferred.

### DEV final sprint P15 receipt defaults source slice — 2026-09-30

Web receiving now initializes each PO line to its outstanding approved quantity and uses integer-only package counts. Rejected quantities remain separate, require an explanation, and do not decrement received quantity. Invalid values, rejection above delivery, or missing rejection reasons block the entire receipt draft visibly rather than silently omitting lines; server-side over-receipt approval remains authoritative. No tests, build, lint, or runtime checks were run; procurement acceptance remains deferred.

### DEV final sprint P16 import/admin guidance source slice — 2026-09-30

Administration now derives advisory field-match suggestions from the selected CSV/TSV first row for supported templates. No map is posted; existing server staging and dry-run authority is unchanged. Staff role options display scope guidance. No tests, build, lint, or runtime checks were run; administration acceptance remains deferred.

### DEV final sprint P17 structured Help source slice — 2026-09-30

The help-index generator was run to refresh 40 generated guide records with structured sections and Web Help now presents task cards, `Show me` navigation and expandable reference content. This was a code-generation step only, not a test pass. Contextual anchors and full acceptance remain open.

### DEV final sprint P18 parity-ledger source slice — 2026-09-30

Added a TypeScript-driven generator for a 79-entry cross-client Markdown/JSON ledger, connected it to build/docs workflows, and added documentation completeness checks. `npm run parity:build` executed successfully as generation only; lint, tests, full build and acceptance were not run.

### DEV final sprint P19 folio reversal and parity correction — 2026-09-30

Source inspection confirmed Web folio service posting/settlement and POS room charges were already present although manifest entries called them missing/partial. The manifest now reflects those call sites. Guest Accounts adds a queued reason-required reversal form for unpaid folio charges; server validation remains authoritative. No runtime verification was run.

### DEV final sprint P20 shared-control adoption — 2026-09-30

The new Guest Accounts reversal workflow now uses the common form-field, busy-button, and blocker-card primitives. Source-only change; no lint, tests, build, browser or accessibility verification was run.

### DEV final sprint P21 PWA source inventory — 2026-09-30

Read-only inspection confirmed PWA manifest/icon assets, the Web shell plugin, update-safe activation, and dedicated PWA asset/service-worker browser tests already exist. This is source inspection only; the PWA tests and installed/standalone acceptance were not run.

### Hosted incident evidence correction — 2026-09-30

The earlier paragraph attributing the UUID property exception to a missing persisted `counts` map was too specific: current inventory code already normalizes malformed persisted sessions, and the retired minified chunk cannot confirm that hypothesis. Treat the exception cause as unknown. At 2026-09-30 17:19 UTC the current site entry was `index-BhGwssST.js`; the four reported legacy chunk URLs returned 404, consistent with a stale tab's lazy-import graph. An unauthenticated POST to the guidance RPC returned 401, not 404, and cannot verify the authenticated user's reported result or hosted function availability. Migration 017 defines the function in source. No hosted mutations/deployment or app tests were performed.

Follow-up snapshot at 17:28 UTC observed a new root HTML ETag/Last-Modified and entry `/assets/index-BrNGxRSK.js` (200, cache MISS). That entry's current lazy imports included `WebCatalogInventory-DIiVOT7U.js` and `WebPosView-B1ZR-SdA.js`; both returned 200, as did the referenced receipt and utensils chunks. The formerly observed entry `index-BhGwssST.js` began returning 404 during the transition. The changing root/entry responses plus old-chunk 404s and new-chunk 200s are direct evidence of a deployment transition/edge cache inconsistency during observation, which explains the reported lazy-import failures better than a persistent missing-asset condition. It remains a point-in-time read-only sample; refresh the client and recheck under the same deployed revision.

Follow-up source inspection found inventory count drafts already normalized their top-level maps but accepted arbitrary map values. `readCountSession` now filters invalid count and baseline entries and normalizes malformed timestamps before the click workflow consumes them. This is local-storage hardening only. The reported `n[83df0391-21eb-4b89-9aa8-312c32fb730d]` access cannot be tied to this or any other source expression without the exact bundle/source map; no causal fix is claimed. This source edit was not tested or built because sprint verification is deferred.

Terminal operator setup follow-up (2026-09-30; source only): documented per-operator Auth invitations and stable staff-ID binding, one-time device pairing, session switching, OS credential storage, offline legacy behavior, staging migration sequence, and fail-closed troubleshooting in `docs/TERMINAL_OPERATOR_AUTH_SETUP.md`. Expansion 030 makes the terminal identity RPC return the `servos_v2_session` permission fingerprint. Native `runtime_snapshot` now force-refreshes the active Auth identity before shared reads and rejects a cached shadow whose saved policy fingerprint differs. Source assertions were added. No test, build, native compilation, migration, hosted request, or packaged test was run.

Follow-up source inspection found that `native_v2_snapshot` synthesized folio room-charge targets based on the local role helper even though the v2 actor's grants are Auth-resolved. It now accepts the current server permission list, applies the projection only for `folio.room_charge` or `*`, and returns that same permission set. Assertions were added. This closes the inspected local-role projection path only; no Rust build, native privacy regression, cloud test, or packaged test was run.

P4 cross-runtime Smart Item source follow-up (2026-09-30): expansion 031 adds an atomic staged handler reusing stock/product validators and recording the opening movement in the same transaction; Web adds a queued four-step item/stock/package/opening-balance workflow and expected-version dependency entries for generated IDs and referenced records. Spirit/Wine setup now derives sealed bottle counts from package size and stores serving plus optional whole-container portions; SQL/source acceptance cases are authored. Manifest source is updated. No tests/builds, PostgreSQL execution, hosted migration, or browser acceptance were run; recipe-rich Web setup, complete inventory parity, and all P4/P10 evidence remain open.

P22 terminal operator setup correction (2026-09-30): the runbook now states that the first staged device registration must be commissioned by an active Admin granted `devices.register`, because current native source performs registration at first online identity initialization. Cashier accounts must not be given that grant as a pairing workaround. Documentation only; no Auth account, device registration, migration, hosted project, native package, or test was changed or verified.

P10 sealed/open transfer continuation (2026-09-30): expansion 033 routes tracked Spirit/Wine transfers through canonical-quantity and sealed/open reconciliation, adds paired movement-state evidence, and rejects an unrepresentable destination open-liquid balance. A disposable inventory SQL fixture and source-contract assertion are authored. No tests, migrations, builds, native package, or hosted checks were run; all P10 acceptance remains outstanding.

P10 sealed/open count continuation (2026-09-30): expansion 034 makes tracked bottle-state quantities mandatory in the staged whole-location count contract; Web persists and edits the two physical quantities and submits their derived total. The disposable inventory fixture now asserts sealed/open count reconciliation. Source changes only; tests, migrations, builds, browser/native acceptance, and hosted checks remain deferred.

P12 batch preparation continuation (2026-10-01): source now includes native and staged `inventory.produceBatch`, a Web Inventory command form, linked finished-portion stock enforcement, full-yield ingredient deductions, weighted output cost, immutable movements, and POS consumption of prepared BATCH portions. `tests/inventory-batch-preparation-source.test.mjs` was authored but intentionally not executed. No lint, build, Node/native/browser/cloud test, migration, hosted deployment, or packaged evidence is claimed; all verification is deferred to the final implementation-pass stage.

P22 source-contract finding: native runtime synchronization authenticates with local staff PIN/session and calls legacy `servos_upload` using terminal/device credentials. Staged `servos_v2_execute` requires a Supabase-authenticated actor UUID matching `auth.uid()`. No native pairing/access-token refresh path exists in the terminal runtime. Therefore the v2 uplink and signed offline grants remain disabled; enabling them without a defined identity, credential lifecycle, sequence/read-set mapping, acknowledgement reconciliation and rollback/fencing procedure would cross the approved authority boundary. No test, hosted request, or state mutation was performed for this finding.

P22 continuation (source only, unverified): corrected command provenance; added SQLite schema 14 with isolated `native_v2_state`, empty `native_v2_outbox`, and `native_v2_records`. Authenticated identity initializes paired device/business sequence and feed cursor only on first registration; refresh cannot skip unapplied feed changes. `apply_native_v2_page` validates cursor continuity and writes a page's records plus cursor atomically into the shadow replica, without changing legacy operational records. No command is copied into the v2 outbox. Source assertions were expanded but not run; no build or database migration was executed. Full v2 adapter, rollback/fencing, hosted and packaged acceptance remain open.

P22 read-only baseline/feed source slice (unverified): expansion 029 redefines the authorized v2 snapshot RPC to work while command writes remain disabled. Native `runtime_v2_install_snapshot` refreshes Auth, checks actor/business identity, pages at a stable control cursor and permission-policy version, enforces 100,000-record/200-page bounds, then transactionally installs or refreshes `native_v2_records` (refuses refresh while commands are pending). `runtime_v2_sync_replica` verifies the current permission-policy hash and downloads/applies up to 100 pages of feed changes per request. The reconciliation panel exposes both actions. Legacy records are untouched. Source assertions were added; no SQL, UI, Rust build, migration, or test was run. Command translation/send/ack, rollback, and authority/cutover gates remain open.

P22 native command dispatch source slice (unverified): `RuntimeProvider` builds expected-version sets with the shared operation dependency resolver and passes them to Tauri. When the refreshed server identity reports v2 enabled, native code binds the local token to the same Auth-bound staff ID, refuses unresolved legacy outbox work, persists a `BusinessCommandV2` envelope before `servos_v2_execute`, and stores synchronized/conflict/rejected acknowledgements. Network response loss leaves the exact command ID/sequence pending for replay; the next user action is not sent until a previous pending command is resolved. Successful writes reconcile into the isolated shadow replica, which becomes the runtime read source with server permissions only for enabled Auth sessions with a complete baseline. Legacy-only import apply, local approval, setup mutation, and acceptance-write paths are fenced during that session. Disabled v2 and local-PIN offline unlock continue through SQLite legacy. Source assertions were added; no native compile, SQL migration, hosted request, or test was run. Full operation payload parity and all acceptance/recovery/fencing gates remain open.

P25 implementation slice (unverified): `reconciliation_compare` now calculates and compares collection active/archive counts, stock quantity by item/location, movement-derived quantity by item/location, and selected order, procurement, payment, refund, M-Pesa, customer-credit, folio/deposit, and receipt values. Each side independently compares movement-derived quantities with current stock; mismatch or conservation failure adds a cutover blocker. The Native evidence panel displays aggregate totals only and retains record-level identity/status output. This remains SQLite↔legacy-replica reconciliation, not a v2 migration/import rehearsal; assets/staff/rooms are represented by record counts and exact record comparisons, and hosted/packaged acceptance is absent. Tests/build remain deferred.

