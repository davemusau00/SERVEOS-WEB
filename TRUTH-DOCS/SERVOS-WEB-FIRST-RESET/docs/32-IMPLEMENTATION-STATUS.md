# 32 — Web-First Reset Implementation Status

## Verification evidence checkpoint ? 2026-10-07 (later source changes unverified)

This section records evidence captured on 2026-10-07. The active development instruction defers new checks until the end of the sprint; the 2026-10-08 source continuation below has not been verified.

- Local lint and builds pass; root tests: **218/218**; API/PostgreSQL tests: **19/19, zero skips**.
- Cloud-v2 disposable PostgreSQL suite passes; complete preview browser matrix: **52 passed**, with the dedicated real API case skipped in this matrix and passing separately.
- Real Playwright/API/PostgreSQL acceptance passes, including login/enrollment, catalog mutation, fresh sign-in after reload, missed remote change recovery, full stocktake, authoritative balance version and IndexedDB/outbox checks, with zero legacy RPC calls.
- Durable domain rejections/conflicts are retained; infrastructure errors remain unresolved and replayable. Change records are explicit, and location-balance revisions guard reviewed inventory commands against ABA changes.
- Complete production browser rerun: **88 passed**, 4 skipped (dedicated real API scenario runs separately). GitHub Actions YAML parses and requires the API browser gate, but hosted CI green is **unverified**.
- Next business gates: receiving and exact movement reversal with immutable physical-state evidence and later-activity blockers, then online POS, consumption, payments/tills and printing. Procurement/rooms expansion, production writers and cutover remain gated.
- Source-only auth continuation adds migration 061 to bind a consumed refresh token to one successor. A response-loss retry now re-derives and returns that same successor, preventing the previous implementation from creating competing children. Migrations 060-061 and auth runtime behavior have not been executed or verified.
- Hosted CI run #274 for remote commit `871f542` reported a frontend parse failure in `supplier-return-commands.mjs:22` from nested single quotes in its SQL, plus bridge formatting failures on Linux and Windows. The current worktree uses a template literal and has had `cargo fmt` applied to both bridge manifests. These changes and current local HEAD have not been run through local checks or CI.
- At this checkpoint, API bootstrap had a deterministic permission-filtered manifest but still returned records in one response. The later 2026-10-08 continuation below supersedes that implementation state; the changes remain unverified.

## Baseline captured for this checkout

- Branch: `reset/vps-platform`
- Starting commit: `750ee33d27c235614b2fc272e8c1b961dd8dbc8e`
- Baseline tag `pre-vps-reset-2026-10-06` exists.
- Working tree was clean before implementation.
- Generated build outputs include `docs/generated/OPERATION_PARITY_LEDGER.json`, `docs/generated/OPERATION_PARITY_LEDGER.md`, and `src/generated/help-index.json`; they must be classified as committed or reproducibly generated artifacts before broad refactoring.
- The repository still has one root Vite/Tauri package and Supabase dependencies. The new API lives under `apps/api`; the production client path has not been switched.

## Implemented slice

- Added an authenticated catalog bootstrap projection endpoint and API client call for products, recipes, stock/package masters, locations, and outlets. This is a scoped first projection only; ordered change-feed rebuild and current snapshot sync replacement remain pending.
- Added relational products, stock masters, package units, recipe ingredients, locations, location balances, and movement schema. Added online-only `product.save`, `stockItem.save`, and `catalog.createWithOpeningStock` handlers with expected-version checks, same-business reference validation, duplicate code/barcode checks, and atomic product/recipe/package/opening movement writes. This was initially API groundwork only. API login, projections, and PWA wiring are now in place for the documented catalog operations; broader catalog edge cases remain unverified.
- Added an isolated Node API command kernel with envelope validation, permission enforcement, offline-grant enforcement, canonical payload hashing, idempotent command replay, expected-version checks, audit event, and ordered change cursor.
- Added PostgreSQL schema and migration runner for sessions, enrolled devices, permissions, expected versions, command outcomes, audit, ordered changes, offline grants, relational catalog, and asynchronous jobs.
- Added health/readiness, command submission/status, ordered change polling, catalog listing, and catalog item creation routes. Bearer tokens are hashed and resolved to live session, enrolled device, and permissions from PostgreSQL; callers cannot assert identity or permissions with headers.
- Added expected-version validation under PostgreSQL row locks. Missing rows have version zero; mismatches return a stable conflict with current/expected version details.
- Added the first relational business handler, online-only `catalog.item.create`, with version-0 creation guard, normalized input, duplicate-SKU protection, and command/audit/change evidence.
- Added PostgreSQL job claiming with leases and retry backoff. No job handlers are registered, so the worker cannot claim or fabricate business work.
- Replaced the backup compose placeholder with a manually run container that streams custom-format `pg_dump` output through age encryption to an rclone remote, then verifies a non-empty remote object. Added an environment template and restore-rehearsal instructions; no remote has been configured or exercised.
- Added a deterministic-input PWA release packager that emits immutable Git-SHA directories with per-file SHA-256 manifests, plus a VPS activation/rollback script that validates hashes and atomically switches the Nginx `current` symlink. No VPS release was activated.
- PWA device IDs now migrate from localStorage into IndexedDB alongside a non-exportable WebCrypto P-256 key. The new enrollment helper exists, but current app startup still invokes Supabase registration because the existing Supabase session is not an API staff session.
- Added a one-use, five-minute API device-enrollment challenge signed by the PWA key and a client enrollment helper; issuance and completion both require device-management permission and challenge issuance is rate-limited.
- Added PWA IndexedDB stores for verified offline grants, immutable hashed BusinessDocument snapshots, and durable print-job state; added local-storage diagnostics and sync status broadcasts across tabs.
- Added ECDSA grant-signature verification, an authenticated SSE change-invalidation endpoint, API runtime configuration validation, and worker lease renewal/expiry fencing.
- Added a typed PWA API client for in-memory bearer access, device-scoped requests, command/status/change/catalog calls, enrollment calls, and command-status recovery after response loss. The API login now opens the main PWA business workspace with an API-only IndexedDB projection and API CloudTransport. That workspace exposes Home, Catalog, Activity, and Help; command submission is enabled only for `product.save`, `stockItem.save`, and `stockLocation.save`, and all other command names are blocked before enqueue.
- Added durable API command lifecycle states (`RECEIVED`, `PROCESSING`, `CONFIRMED`, `REJECTED`, `CONFLICT`), terminal error storage, failure audit events, and command-status recovery before an outcome-unknown PWA command is resubmitted. The durable row retains command identity and payload hash without duplicating sensitive request bodies. Legacy committed rows migrate as `CONFIRMED`.
- Converged API bootstrap and change polling on the PWA `records[]` projection shape. Catalog bootstrap reads its records and high-water cursor in one repeatable-read transaction; change pages are adapted into the shared PWA `ChangePage` shape. API login reuses an existing local projection on reload and advances it through ordered change pages on reconnect; bootstrap is reserved for initial or empty projection recovery.
- Added signed, short-lived, bounded API offline grants for explicitly grant-capable catalog edits, server-side grant quota/replay accounting, atomic local quota reservation with API-authority PWA command enqueue, offline queue admission, and API status polling on reconnect. This is limited to `product.save`, `stockItem.save`, and `stockLocation.save`; POS, payment, inventory movement, procurement, and hospitality workflows remain online or draft-only until their API handlers exist.
- Added relational stock-location code/type storage and its API save command so the catalog workspace's three record types are represented by durable API-owned fields.
- Added API-authoritative full and selected physical stock counts with exact row coverage, stale quantity and recipe-use checks, bottle conservation, transactional balance/version/movement/history writes, and ordered `records[]` change entries. Counts serialize against stock and product master changes with a business-scoped PostgreSQL transaction lock.
- Added a versioned inventory movement type column while preserving historical type values, and separated movement type from the operator's reason in API movement writes and projections. This also corrects the stock-count movement insert parameter ordering; the migration and write path remain unverified until sprint-end tests.
- Added persisted sealed/open bottle state to per-location PostgreSQL balances and online-only API transfer and waste commands. Transfers preserve sealed versus open quantities at both locations, enforce the one-open-bottle rule, and emit paired audited movements; waste emits the corresponding single movement. PWA permissions and controls route to these API handlers. New movement and balance migrations have not been executed in this continuation.
- Added a reviewed `inventory.adjust` API command and immutable adjustment history with observed quantity, stock unit, bottle size/state, manager reason, and expected-version checks. Quantity variance creates a `MANAGER_ADJUSTMENT` ledger movement; the API PWA correction form pins the reviewed before-state and exposes no legacy movement-reversal or batch action. Migration and command remain unverified until sprint-end verification.
- Raised the bounded command/request body cap to 2 MiB and added a 10,010-resource expected-version limit so a reviewed full count can fit its stock and recipe dependencies; the API Nginx example uses the same 2 MiB cap.
- Connected the existing atomic `catalog.createWithOpeningStock` API handler to Smart Item setup in the API-authoritative PWA. The operation remains online-only and requires catalog management permission; its API transaction writes stock, optional product/recipe, and optional opening balance together.
- Added an API-native login/password-change/device-enrollment coordinator and connected it to the main PWA sign-in/workspace path. Supabase remains available for the separately selected Remote Manager mode and other not-yet-migrated operations.
- Fixed the API staff-login migration's invalid expression-based table-level UNIQUE constraint; a unique expression index now enforces active case-insensitive login names.
- Fixed API command kernel test adapters for the durable lifecycle and added durable rejection/conflict replay coverage.
- Added a PostgreSQL integration test for fresh migrations, product/stock/location writes, API command status, terminal conflict replay, repeatable catalog bootstrap, and ordered change-feed entries. Added a CI PostgreSQL 16 service job.
- Updated GitHub Actions to run on `reset/vps-platform` pushes and manual dispatch, fixed evidence-summary environment indentation, and included API/PostgreSQL results in release evidence. Release-candidate generation remains restricted to `main`.

## Still pending

- Generated-file policy decision.
- Continue domain migration in the production Web workspace. The API-authoritative PWA entry supports catalog master writes, atomic Smart Item opening-stock setup, physical stock counts, transfers, and waste; no POS or financial command is enabled.
- Added online-only API recipe batch preparation with recipe/ingredient/output version dependencies, transactional ingredient consumption and finished-stock production, sealed/open bottle conservation, weighted average cost, movement history, and persisted batch history in bootstrap and change-feed records. PWA batch preparation now routes through the API with inventory adjustment permission. Corrected weighted costing to use total batch cost before unit rounding. Migrations 013–014 and these paths await sprint-end execution.
- Added a PWA count-history view with full/selected scope, item quantities and variance, bottle state, measurement method, and source command. Reopening a physical-count draft clears it only when synchronized count history confirms its exact pending command ID, covering response-loss recovery once that history arrives. Runtime behavior remains unverified until sprint end.
- Physical counts now persist server-observed item name/unit snapshots and return them consistently through bootstrap and command change records. Older rows retain NULL snapshots rather than inventing historical names from current catalog data; history identifies those rows. Migration 015 awaits sprint-end execution. History pagination remains follow-up work.
- Corrected the sync-update subscriber channel to include command authority, matching sync publishers. API workspaces subscribe to completed sync notifications and reload local projections, redacted queue outcomes, and drafts across tabs. This source change awaits sprint-end multi-tab execution evidence.
- API command recovery now replays the identical persisted envelope after bounded RECEIVED/PROCESSING polling, allowing restart-interrupted commands to resume under the API command lock and payload hash. Transport checks terminal outcome command IDs and confirmed cursors before acknowledging the local outbox. Restart/concurrent replay behavior awaits sprint-end PostgreSQL/browser verification.
- PWA update activation checks open forms/dialogs, persisted pending/unknown commands, and sending/uncertain print jobs. The waiting worker requests a safe-boundary response from every open window client; busy, incompatible, or nonresponding clients defer activation and notify the requester. Acknowledging workspaces hold UI interaction, command submission, and automatic sync until worker activation reloads them or a deferral releases the hold. Worker activation errors also release held clients. Runtime acceptance and race testing remain pending, including newly opened tabs and already-running background work.
- Physical counts, transfers, waste, reviewed corrections, and batch preparation still need native parity and sprint-end integration verification.
- Update readiness now counts active automatic/manual workspace sync cycles through a synchronous ref and rejects readiness until they finish, including failure/early-return cleanup. The worker rechecks its window-client set before activation and defers when a newly opened client was not checked. Remaining activation timing races still require sprint-end browser verification.
- Existing waiting workers are detected on registration, workspace mount, and tab visibility restoration so a reload does not hide an available update. A held tab returning to visibility reloads when activation has completed and no waiting worker remains, recovering a missed activation message. Worker termination during an activation attempt still needs recovery/acceptance coverage.
- Readiness checks now carry a local generation: deferral invalidates unfinished checks so a late storage read cannot reapply a released hold. Hold release, activation messages, and visibility recovery match the requesting worker. Removed the unconditional controller-change reload listener, which could survive a deferral and reload during later work. These changes remain unverified by execution.
- Centralized workspace navigation applies the API migration gate to hash routes, custom navigation events, sidebar buttons, Home shortcuts, and tour callbacks. Unavailable destinations retain the current workspace/hash; API Home quick-add blocks unmigrated room/asset/guest/supplier forms. POS remains gated on the required synchronization proof. Runtime navigation verification is deferred.
- API Home now filters task cards, quick-add entries, and short guides to migrated inventory/catalog work and uses catalog/count/synchronization setup guidance. Unmigrated POS, delivery, room, guest, asset, and supplier shortcuts are hidden in API mode. Visual/runtime acceptance remains deferred.
- API workspace guide progress now reads/writes its scoped IndexedDB metadata instead of legacy Supabase guidance RPCs. Updates merge transactionally by guide ID, and tour completion identifies browser-local persistence. Account-wide API guidance synchronization remains future work; browser persistence verification is deferred.
- Activity exposes a recovery-evidence download from one readonly IndexedDB transaction over projections, command queue/outcomes, workflow drafts, document snapshots, print jobs, and cursors. Existing secret redaction applies; grants and authentication material are excluded. The export explicitly forbids replay/import of redacted commands and is reconciliation evidence rather than a full restore. Recovery acceptance remains deferred.
- Recovery download also includes scoped physical-count/legacy-count localStorage drafts and outcome markers. Malformed entries are preserved as redacted review evidence; unrelated business/staff keys are excluded. The artifact explicitly marks localStorage capture as separate from the atomic IndexedDB snapshot. Count-draft migration into IndexedDB remains outstanding.
- Activity now shows browser persistence status, site storage usage/quota estimates, pending/unknown command counts, pending print jobs, and document counts. Operators can refresh diagnostics or request persistent storage through a user action; denial/error is surfaced without implying storage protection or backup success. Browser acceptance remains deferred.
- Persistence lookup failure/unsupported status now appears as unavailable rather than a known denial. Activity diagnostics refresh on command-state changes, with generation checks preventing an older diagnostic result from replacing a newer result. Execution acceptance remains deferred.
- Verified offline-grant storage validates finite ordered timestamps, supported policy version, and integral quota usage. Re-saving a grant preserves the highest consumed quota atomically and rejects different signed authorization under the same grant ID, preventing local quota reset on reinstallation. Quota/replay execution tests remain deferred.
- Offline authorization lookup and atomic quota consumption share strict stored-grant eligibility checks for policy, scope, timestamps, quota integers, and command lists. Client offline admission is explicitly limited to product/stock/location saves; other operations remain draft-only even if malformed local authorization names them. Signature verification remains at grant installation and server acceptance. Execution tests remain deferred.
- IndexedDB schema v4 adds append-only local print events for queue creation and each accepted state transition, atomically with the job write. Events capture actor/device, previous/next state, attempt, delivery-duplicate confirmation, and error code; recovery exports include them. Existing jobs retain their state without fabricated historical events. Server audit/print transport integration and upgrade verification remain pending.
- Blocked IndexedDB upgrades now return an actionable close-other-tabs message, and abandoned open requests close late-arriving connections. Store instances reject transactions after closure; upgrade/unexpected closure marks the workspace unready and requests reopening without clearing browser data. Upgrade/restart execution acceptance remains deferred.
- Duplicate acknowledgements compare canonical content rather than JSON property order. Projection ingestion validates page continuation/high-water consistency, ordered entry metadata, and record object/archive shape before cursor advancement, retaining transactional rollback on invalid pages. Protocol and response-loss execution tests remain deferred.
- Snapshot replacement now validates record shape, rejects cursor rollback, and checks unresolved API outbox entries in the same IndexedDB transaction as projection replacement. This closes the enqueue-during-bootstrap race; the preflight check also protects zero-cursor workspaces. Rebuild/concurrent-tab tests remain deferred.
- API synchronization refreshes the authenticated staff profile before executing/pulling, updates visible permission checks, and verifies business/staff identity and password-change status. API 401/403 failures mark the workspace unready and remove rendered projections while preserving durable commands for session recovery. Revocation/reconnect execution tests remain deferred.
- Corrected API client staff-profile lookup to require the bearer session without requiring a device ID, matching `/v1/auth/session` and the pre-enrollment sign-in sequence. Business command/bootstrap/change endpoints continue to require enrolled-device authentication. Login/enrollment execution verification remains deferred.
- Enrollment challenge/enroll permission checks now honor wildcard permissions consistently with the client and command kernel, while retaining the unbound-session and password-change checks. Execution verification remains deferred.
- API sign-out clears in-memory bearer/device references, login token copies, password fields, and the open workspace even when server logout fails. UI distinguishes local sign-out from unconfirmed server revocation; scoped IndexedDB commands are retained for later recovery. Logout/network-interruption tests remain deferred.
- API projection reuse now recognizes the atomically saved bootstrap policy marker even with cursor zero or no catalog records. This prevents a first-command response-loss sign-in from being blocked by a needless rebuild. When the projection policy requires replacement and unresolved commands exist, sign-in recovers them through the API transport before bootstrapping. Execution verification remains deferred.
- API PWA now consumes authenticated SSE invalidations through fetch with bearer/device headers, bounded frame parsing, lifecycle abort, and reconnect. Changes request the existing ordered synchronization path; polling remains active and events never mutate projections or cursors directly. Hidden/offline tabs release their streams. Stream reconnect/runtime tests remain deferred.
- Server SSE polls now serialize, reauthenticate staff/device on each poll, respect response backpressure, and stop writes after disconnect. Notifications advance directly to the observed high-water cursor without replaying business records over SSE. Revocation/load/backpressure tests remain deferred.
- Domain handlers must update `business_entity_versions` in the same business transaction; catalog products, stock masters, and count-adjusted stock currently do so, while complete cross-aggregate version semantics and existing-record updates still need review.
- Shared API/client contract generation and broad authenticated bootstrap/change-feed/SSE coverage. The API transport is active in the API-authoritative PWA workspace; the older Supabase mode still uses its existing transport.
- Complete operation payload parity for product/stock commands, including bottle/package units and batch yields, then verify those paths at sprint end. API login and the initial catalog projection are wired; browser reload/reconnect/change-feed behavior still lacks reliable end-to-end evidence.
- API image validation and isolated staging deployment. No hosted/staging database or live deployment was changed.
- Actual off-VPS encrypted backup and restore verification.
- Business domain migrations, document spooler/Print Bridge, one-time data migration, pilot, production cutover, and Tauri retirement.

## Current continuation notes

- The documentation bundle at `docs/docs.zip` was restored to the tracked `docs/` paths it contains so the existing help build, production build, and repository source tests can operate from this checkout.
- Before the latest edits, the production build succeeded, the existing JavaScript suite passed 216/216, the native Rust/domain suite passed 106/106, and the API suite passed 13/13. Those results do not cover later edits.
- The latest user explicitly requested real PostgreSQL API tests and reload/reconnect/change-feed proof. API unit tests and the PostgreSQL integration test passed locally against a disposable PostgreSQL 16 Docker container; no hosted/staging database was used.
- Tests/build/lint are intentionally deferred until the end of this development sprint per the current user instruction; the inventory handlers, new migrations, and command-size changes added in this continuation are unverified by execution.
- `npm run lint` passed after API workspace wiring. A production build was started but its wrapper returned without final output, so the build result is unverified for this continuation.
- A focused Playwright API-workspace scenario was added, but the local Playwright runner hung in its Windows test-server process and produced no result artifacts. Browser login/reload/reconnect behavior is therefore not yet proven; retry with a stable Playwright process before continuing to POS.
- GitHub Actions was configured in source but no workflow dispatch or remote push was performed; hosted CI status is not yet verified.
- Local disposable PostgreSQL and API processes were stopped; the disposable Docker database container remains available for another run and contains test-only records.

Production use is not enabled by this slice. See roadmap phases 0–17 and gate production activation on their evidence.


## 2026-10-07 verification-first continuation

The latest pasted review supersedes the earlier sprint-end test deferral. POS, procurement, and rooms expansion remain gated on the requested foundation evidence.

- Fixed the nullable active Service Worker access; lint and production build passed locally. Root JavaScript/source suite passed 216/216 after updating obsolete CI/update/offline assertions.
- Corrected API submission to use the pinned reviewed expected versions, including retained drafts, rather than silently replacing them with current projection versions.
- CI evidence now includes API PostgreSQL job conclusions and required same-run database log artifacts. Hosted workflow conclusions have not been verified in this continuation.
- Infrastructure errors and HTTP 5xx command failures no longer persist terminal REJECTED outcomes. They retain unresolved PROCESSING identity and propagate request failure, allowing the original immutable command to recover. Domain rejection/conflict remains durable.
- API suite passed 17/17 with zero skips against a newly created disposable PostgreSQL 16 container. Added rollback-before-commit, recovery with the same UUID, and confirmed replay checks in PostgreSQL, plus two transient-failure unit cases. This does not prove production database readiness or recovery after an actual database/network crash.
- Cloud-v2 disposable PostgreSQL suite passed, including canonical migrations, reconciliation/attestation and real room race. Fixed its outdated weighted-cost assertion to compare the precise fractional cost rate introduced by the later bottle-cost migration; posted monetary total behavior was not changed.
- Browser acceptance is under repair: configured a fixture API origin, followed actual entry navigation, made password matching exact, and returned the generated browser device identity from the enrollment fixture. Reload requires fresh authentication because bearer credentials are intentionally memory-only. Mocked browser evidence and real API/PostgreSQL end-to-end acceptance remain separate gates.
- UI audit and docs checks passed their command exits; operator audit findings remain UNREVIEWED. Full browser matrices, hosted CI green, stock balance/location ABA versioning, explicit handler records contracts, receive/reversal, and real backend browser proof remain outstanding.

- Added dedicated `npm run test:browser:api` acceptance configuration. Its real PostgreSQL/API browser test passed locally (1/1): staff login and signed device enrollment, catalog mutation, authoritative database version, reload with fresh authentication, missed remote mutation after offline/reconnect, persisted IndexedDB record version/outbox outcome, and zero `servos_v2` requests. The test uses the production API server/authenticator and command registry; no API responses are mocked. It requires an explicit disposable `TEST_DATABASE_URL` and uses an isolated browser bundle, loopback API, and database test identities.
- The API PostgreSQL CI job now installs browser prerequisites and runs this acceptance test, retaining logs, traces and HTML report. This is source wiring plus local evidence; no hosted green conclusion is claimed.
- Broader browser runs exposed legacy count tests targeting the retired scalar-count dialogs and unknown-barcode assignment flow. Tests are being updated to the current full/selected physical count workflows while retaining reload, unknown-scan blocking, and single committed-count assertions. Full browser matrix remains pending.

- Replaced recursive change-record discovery with explicit registered handler results `{value, records[]}`. The kernel validates record identities, versions, data/archive shape and duplicates before confirmation. Every catalog/inventory registry entry explicitly selects its changed projections. PostgreSQL regression coverage verifies opening stock emits stock item, product and movement together, and stock-master edits retain existing balances. API suite now passes 19/19 with zero skips; the real API/PostgreSQL Playwright test passed again after this change.
- Fixed legacy browser fixtures for current full/selected physical counts and added the inventory-capabilities RPC to the disposable legacy bridge. Focused native full-count/scanner and web selected-count/reload/single-commit cases passed. The new API workspace still emits zero legacy RPC requests in real acceptance.
- Fixed storage page fixtures to include ordered command metadata and authoritative high-water values. All 10 focused desktop/mobile storage browser tests passed; the cursor-gap case still asserts rollback of records and cursor, rather than merely accepting a malformed page.
- Parsed the GitHub Actions YAML successfully using js-yaml and verified the reset branch trigger. Root suite remains 216/216 and lint passes. Complete preview/production browser reruns are in progress; hosted Actions remains unverified.

- Complete preview browser rerun passed: 52 passed, 2 skipped (the dedicated real-API test is excluded by its project guard and passes in its separate required job). Production's earlier run had 86 passes and two obsolete storage-fixture failures; the corrected complete production rerun is in progress.
- API stock projections now expose per-location balance revisions, and inventory handlers require the reviewed stock/location versions plus independent balance revisions for counts, corrections, transfers, waste and batch inputs/output. No database schema migration was required: existing balance revision columns already increment transactionally. PostgreSQL ABA regression proves a 5 -> 4 -> 5 balance change conflicts against the old revision even when the stock master version remains unchanged; missing revisions are rejected and a freshly reviewed count confirms.
- PWA inventory editors pin their reviewed revisions; count drafts retain balance versions, and the API projection marker advances to api-catalog-v2 so older projections rebuild safely after pending commands are recovered. Older drafts lacking balance metadata require a fresh review. Two additional root tests cover pinned independent revisions and missing/invalid metadata, bringing the root suite to 218/218. Lint passes; API tests remain 19/19 with zero skips.
- Extended the real API/PostgreSQL browser acceptance to perform a full stocktake, verify PostgreSQL quantity/revision, and verify IndexedDB stock revision plus two synchronized outbox entries; it passed locally. No legacy RPC requests were observed.

- Final complete production browser rerun passed: **88 passed, 4 skipped** across 1024x600, AIO, laptop and mobile. The skipped cases are the dedicated real API/PostgreSQL scenario, which passed separately after the latest API changes. Complete preview evidence remains **52 passed, 2 dedicated-project skips**.
- Extended PostgreSQL regression assertions cover transfer replay, source/destination balances, waste, reviewed corrections, and stale movement revisions. They exposed first-response/replay shape differences; movement timestamps now use ISO strings and nullable stock container sizes use explicit nulls. API suite passes **19/19, zero skips** after these changes. Latest real API browser test passes, including full stocktake and persisted balance revision; latest lint and root suite pass (**218/218**). Documentation checks pass.
- Disposable verification API databases were stopped after evidence collection; no hosted database, production writer, unrelated Docker workload, physical printer or cutover was changed. Hosted CI green, receiving and exact reversal remain outstanding; online POS has not been enabled.


## Final sprint continuation ? exact recording reversal (source only)

The active continuation refers to `final-sprint.md`, but that file is absent from the current Downloads tree. `servos-sequential-final-sprint.md` is present and remains the controlling sequence for this checkout. Further tests are deferred to the end of the development sprint by the latest user instruction. Earlier passing evidence does not verify this continuation.

- Added API migration 016 for immutable movement before/after balance evidence, stock unit/container/cost snapshots, and a unique original-command reversal link. Existing movements are intentionally not backfilled with guessed physical states.
- Balance-setting transactions retain the first before-state and resulting revision; newly inserted movements persist that evidence in the same transaction. Transfer and waste commands can now be reversed as complete original commands through `inventory.reverseMovement`, with `inventory.adjust` permission, manager reason, same-business lookup, original-command locking and duplicate-reversal exclusion.
- Exact restoration checks all affected locations before changing any balance: reviewed stock/location/balance revisions, original after-state revision and physical state, unchanged stock units/container size/cost, and reconciled movement delta. Missing evidence, unknown original bottle state, later activity, unsupported financial/batch correction types and already-reversed recordings fail closed. Compensation increments current balance revisions, preserves original movements, and publishes the canonical `movementCorrections` record plus stock and compensating movements through the explicit change-feed contract.
- Added reversal history to API bootstrap and restoration evidence to movement projections. Wired an API-specific operator review dialog showing all affected locations, a manager reason and current revision baselines. Incomplete linked transfers and unresolved submissions cannot be confirmed again in the same dialog. Legacy mode retains its existing correction workflow.
- This migration, handler and PWA wiring are **unverified by execution**. End-of-sprint coverage must include non-bottle and sealed/open transfers/waste, duplicate/replayed reversal, unknown response, simultaneous reversals, later ABA activity, cost/unit/configuration changes, missing history/evidence, cross-business lookup, permissions, bootstrap/reload and compensating-ledger reconciliation.
- Receiving remains next; it must preserve package conversion, weighted cost, source documents, duplicate prevention and supplier/PO policy rather than bypassing their business effects. POS and the later final-sprint phases remain outstanding.


## Final sprint continuation ? direct receiving (source only)

- Added migration 017 for explicit business receiving policy and immutable stock receipt/source snapshots. Direct receiving defaults to disabled; approved-PO-required policy blocks the direct command. Linked supplier/PO receiving remains a separate procurement operation.
- Added online-only `inventory.receive` and administrator `inventory.policy.save` handlers. Receiving pins policy, stock, location and independent balance revisions; stores package conversion and source document evidence; prevents duplicate source lines; updates weighted valuation and physical balances; and publishes receipt, stock and movement records atomically. Posted receipt amounts remain integer minor currency units, while unit cost rates use twelve decimal places.
- Added receipt and policy bootstrap projections plus PWA receiving/policy dialogs. Bottle receipts require explicit sealed/open quantities that reconcile to received liquid. Unknown outcomes hold repeat submission in the open dialog. These source changes do not post supplier payment or claim procurement completion.
- No tests, lint or build were run for this continuation, following the user instruction to defer verification. Earlier passing checkpoints do not verify migrations 016/017 or the new dialogs. Required end-of-sprint evidence includes policy authorization/concurrency, source deduplication, precise weighted cost, package changes, bottle conservation, rollback, response loss, reload/change-feed equivalence and cross-business isolation. Online POS remains outstanding.


## Final sprint continuation ? online POS draft kernel (source only)

- Added migration 018 for API-owned orders, lines and immutable per-version order events. Orders pin outlet/storage location and staff/device attribution; lines retain product/portion/recipe identity and price snapshots. Posted totals use integer minor units.
- Added online-only canonical `order.create`, `order.addItem`, `order.updateItem` and `order.removeItem` handlers with required reviewed order versions, server-selected pricing, product/outlet checks, bounded lines/quantities and durable event recording. Removed lines remain in history; fired lines cannot be edited through draft commands. No client-supplied prices or arbitrary service references are accepted.
- Registered the draft commands in the production API and added batched order/line bootstrap projections. Existing PWA POS remains gated until stock-consuming fire and payment/till authority are connected. Modifier and table/customer/room registries remain to be ported; the draft API rejects those unsupported references explicitly.
- This is a source foundation, not an accepted POS migration. Tests/build/lint remain deferred. Pending work includes modifiers, service registries, atomic fire/consumption/KOT-BOT documents, PWA concurrency/recovery, payments, tills, receipts and all sprint acceptance gates. Earlier passing checkpoints do not verify this migration or module.


## Final sprint continuation ? online fire/consumption and production tickets (source only)

- Added migration 019 for immutable per-line stock consumption links, versioned BusinessDocument snapshots and a queued printer-role job model. Database triggers protect issued documents, order events and consumption evidence from updates/deletes.
- Draft lines now capture canonical base-unit ingredient quantities and stock configuration. Batch sales consume finished stock; recipes consume ingredients; configured spirit/wine portions distinguish whole sealed containers from measured liquid. Invalid tracked-product configuration is rejected rather than treated as untracked.
- Added online-only `order.fire` with pinned order/stock/location/balance revisions, full prevalidation, stock underflow protection, bottle conservation and atomic stock movements/consumption links/order events. Whole bottles are reserved before measured pours; unknown physical bottle state requires a physical count. Previously fired lines cannot be consumed again.
- Fire creates immutable KOT/BOT snapshots and QUEUED jobs for kitchen/bar routes in the same transaction. Canonical snapshot hashes and bootstrap document/job projections support recovery. No printer is contacted and no delivery success is claimed. PWA POS stays gated while payment/till and operator wiring are incomplete.
- All new source remains unverified: no tests, lint, build or database execution ran. Deferred coverage must prove recipe/batch/portion consumption, fractional quantities/costs, sealed/open conservation, stale/ABA revisions, transaction rollback, replay/response loss, second fire after adding lines, permissions/isolation, document hash/bootstrap equivalence and printer-independent confirmation.


## Final sprint continuation ? till lifecycle and financial read boundaries (source only)

- Added migration 020 and online-only till policy/open/cash-movement/close/variance-review commands. Scope is explicit (single-business default, outlet, or operator/device); active tills are unique per scope, operator and device. Policy cannot change while tills remain active and each session retains its policy snapshot.
- Cash operations require the owning staff/device, reviewed till revision, integer minor amounts and manager-readable reasons. Cash entries are append-only, drawer underflow is rejected, and close stores the count before returning expected/variance figures. Above-threshold counts freeze the till in REVIEW_REQUIRED until an authorized variance review closes it. Open outlet orders and unresolved financial command lifecycles block close.
- Added till bootstrap/change records and financial projection access filtering. Cashier records are scoped to their attribution unless their permissions authorize broader visibility; order/doc/print records require corresponding operational permissions. Filtered feed entries retain their sequence so cursors do not develop gaps. Command-status lookup is limited to the issuing staff unless audit authority is present.
- Registered the API till commands. PWA till/payment operator wiring and actual payment posting remain outstanding. No tests/lint/build/database execution ran; this source is unverified. Deferred acceptance includes scope races, ownership/isolation, blind-count UX, policy baselines, ledger totals/underflow, unresolved outcomes, close/payment races, variance review, reload and authorization changes.


## Final sprint continuation ? tender configuration and recovery identity (source only)

- Added migration 021 and online-only `paymentAccount.save` for named KES cash, manual M-Pesa, card and bank accounts. Configuration requires expected versions, explicit reference/status policy and an audit reason. M-Pesa till/paybill destination and paybill account reference are validated; tender method cannot be changed under an existing account identity. Archived accounts remain versioned tombstones.
- Registered account configuration in the API and added account bootstrap/change projection access for authorized configuration/payment/accounting staff. No provider integration or provider-success assertion was introduced. Payment posting and PWA account/payment forms remain to be implemented.
- Source review found command recovery was not bound to original staff/device. Durable command queries now include attribution, and the kernel rejects a different operator/device before replay or processing. Original unresolved outcomes remain intact. RECEIVED now also persists the immutable command envelope in the existing request column, preserving configuration reasons and recovery evidence rather than only their hash.
- No tests/lint/build/database execution ran. Deferred verification must cover configuration validation, null/check constraints, archive/reload, account concurrency, duplicate codes, manual confirmation/reference behavior, original-identity replay, foreign-identity rejection without lifecycle mutation, and durable request/audit recovery.


## Final sprint continuation ? payment posting (source only)

- Added migration 022 and online-only canonical `payment.record` / `payment.split`. Payments retain immutable IDs, tender/account snapshots, order/till/staff/device attribution and recorded timestamps. Same-command replay uses the durable command lifecycle; unique business/method external references prevent reposting under another command ID.
- Payment posting requires reviewed order/till/account revisions, an owned open till in the order outlet, fired lines and a valid outstanding balance. Split tenders settle exactly; single tenders may partially settle. Cash records tender/change separately and adds only the allocated amount to the immutable drawer ledger. Drawer and payment totals remain bounded integer minor amounts.
- External payments require explicit cashier confirmation. M-Pesa additionally requires recording permission, actual received timestamp and matching received amount; discrepancies block posting pending their dedicated reconciliation workflow. No provider success is claimed.
- Posting atomically updates paid totals/order state/till revision, order events, payment records, payment acknowledgement and queued receipt-role job. Payment acknowledgements record funds received; fiscal sales receipts/tax snapshots remain a separate pending requirement. Added payment bootstrap projections; PWA payment activation remains gated.
- No tests/lint/build/database execution ran. Deferred acceptance must prove same-ID response-loss recovery, concurrent balance/till changes, partial/split tenders, cash change/drawer reconciliation, duplicate references, manual M-Pesa truthfulness/discrepancies, rollback/isolation, document hashes and reload/feed recovery. Refunds/reversals, tax snapshots, sales receipts and PWA operator wiring remain outstanding.


## Final sprint continuation ? tax and sales receipt snapshots (source only)

- Added migration 023 and an authorized `business.settings.save` API command for business receipt identity, footer and explicitly configured VAT/levy basis points. No statutory rates are inferred. Trading requires configured settings and reviewed settings versions, preserving the native configuration gate.
- Orders retain business identity snapshots; lines retain tax class, inclusive rate snapshot and integer net/VAT/levy totals. Quantity edits recompute taxes using the original line policy. BigInt intermediate calculations preserve money arithmetic and database constraints enforce line-total conservation. Older orders without required snapshots cannot settle silently.
- Final settlement now reconciles tax and payment ledgers, issues an immutable SALES_RECEIPT with business/cashier/line/tax/tender snapshots, links it to the order and queues the receipt-role job. Partial settlements retain payment acknowledgements. Receipt payment reconciliation loads the complete order payment history rather than the capped bootstrap history.
- No tests/lint/build/database execution ran. Deferred verification includes mixed tax classes, rounding boundaries, rate/identity edits during an order, immutable historical rendering, replay/rollback, payment/tax reconciliation and receipt link/feed/bootstrap equality. Logo/QR image pipeline, canonical rendering, refunds/reversals and PWA operator wiring remain outstanding.


## Final sprint continuation ? canonical browser document renderer (source only)

- Added `BusinessDocumentRenderer` for immutable sales receipts, payment acknowledgements and KOT/BOT snapshots. Layout includes business/cashier identity, quantities/prices, integer-derived tax/tender totals, external manual-confirmation wording and footer. Receipt styling targets 80mm paper with safe margins; browser paper selection remains deployment/hardware acceptance.
- Logo and uploaded payment QR use the same bounded embedded-PNG pipeline; mutable remote image URLs are not rendered. QR appears before the footer with the required exact caption. Full image ingestion/snapshot configuration remains pending.
- Added browser-print preparation with SHA-256 snapshot verification, supported-layout checks, escaped React markup, image decode waiting and preparation timeout. The API explicitly returns UNKNOWN delivery after the browser print dialog; it cannot infer paper delivery or cancellation. No raw-printer cut command or hardware success is claimed.
- This renderer is not yet connected to audited operator print-job actions. No tests/lint/build/browser/hardware execution ran. Deferred acceptance includes long names/totals, fractional quantities, tax/tender layout, malicious snapshot text, tampered hash, broken/oversized PNG, QR scan, browser cancel/delivery uncertainty and physical 80mm margins.


## Final sprint continuation ? audited print lifecycle (source only)

- Added migration 024 for canonical sending/spooler/uncertain states, print-job revisions/claim attribution and append-only print events. Existing job entity versions are seeded; new ticket/payment jobs initialize their versions through one shared queue helper and use the same feed/bootstrap projection shape.
- Added online-only claim/report/confirm/retry/cancel commands with expected versions and document-specific permission checks. Browser transport reports uncertain delivery. Preparation failure requires an explicit assertion that transport never began. Interrupted/uncertain/spooler attempts require a reason plus possible-duplicate acknowledgement before requeue; only queued/known-unsent failures can be cancelled. Physical delivery confirmation is explicit operator evidence.
- Command definitions may authorize one of several listed permissions, while handlers still enforce document access. The PWA update boundary now checks both local jobs and unresolved API claims on the current device. Browser renderer errors after transport begins remain uncertain rather than being treated as safe preparation failures.
- No tests/lint/build/database/browser execution ran. Operator print UI/claim-to-browser orchestration remains pending. Deferred verification includes concurrent claims/retries, same-command replay, interrupted browser delivery, authorization, canonical state migrations, audit immutability and Service Worker update holds/recovery.


## Final sprint continuation ? PWA document queue (source only)

- Added the API document/print queue to Activity with immutable previews, claim-before-browser-print, physical delivery confirmation, guarded requeue and unsent cancellation. Commands pin print-job revisions and require connectivity; they cannot create offline print-action drafts.
- Browser transport starts only after the original claim confirms and the persisted projection shows the exact next revision plus matching staff/device ownership. Missing/stale claim projection stops transport. Unknown command outcomes hold further actions until the shared job advances; interrupted SENDING attempts remain reviewable after restart without automatic resend.
- Preparation failures report known-unsent failure; a browser dialog attempt reports uncertain delivery and asks the operator to check paper before confirmation or possible-duplicate requeue. No print-dialog completion is presented as physical delivery success.
- No tests/lint/build/browser/printer execution ran. Deferred acceptance includes double clicks, concurrent claims, lost claim/report responses, restart with SENDING/uncertain state, cancelled dialogs, missing/tampered documents, offline actions, revisions after requeue, permissions and physical printer/QR/layout checks. POS configuration/operator wiring, refunds/reversals and the remaining sprint phases stay outstanding.


## Final sprint continuation ? API configuration workspace (source only)

- Added a permission-gated API Settings workspace for receipt business identity/tax rates, till scope/variance policy and cash/manual M-Pesa/card/bank payment accounts. API mode renders its own settings controls; legacy master-record forms remain confined to legacy mode.
- Editors pin configuration revisions when opened, require change reasons and explicit rate inputs, preserve M-Pesa till/paybill/account details, and prevent tender-method changes on existing identities. Settings actions require connectivity and use typed API commands rather than generic record replacement or Supabase RPC.
- Unresolved configuration outbox entries disable further configuration submission while Activity recovers their original outcomes. Tax editing additionally requires tax-configuration permission; the API independently enforces it.
- No tests/lint/build/browser execution ran. Deferred acceptance includes percentage/minor conversion, stale edits, archive/reactivation, field validation, permissions, response loss/reconnect and zero legacy calls. Outlet configuration, online POS/till operator wiring and the remaining sprint phases remain outstanding.


## Final sprint continuation ? outlet setup (source only)

- Added online-only authorized `outlet.save`, with expected outlet/storage versions, an active stock-location requirement, explicit archive state and a durable configuration reason. The shared business boundary serializes outlet setup with order/till opening; active outlet orders or tills block storage reassignment and archive.
- Added outlet create/edit/archive/reactivation to API Settings. Editors pin the reviewed outlet and storage projections; unresolved outlet commands join the configuration submission hold. Outlet bootstrap now retains archived tombstones so reactivation remains available after reload.
- Inline configuration editors now expose a dialog boundary for the existing Service Worker update hold, preventing activation while these forms are open.
- No tests/lint/build/database/browser execution ran. Deferred acceptance includes create/edit/archive/reactivate/reload, stale storage/outlet revisions, opening-order/till races, permissions/isolation, response loss and safe updates. Online POS/till operator wiring and the remaining sprint phases remain outstanding.


## Final sprint continuation ? online PWA order workspace (source only)

- Added a dedicated API POS workspace for counter/takeaway order opening, outlet-filtered product/barcode selection, portion/quantity review, unfired-line edit/removal and stock-consuming fire. Legacy POS rendering remains confined to legacy authority mode.
- Review forms capture order/product/settings/location/balance baselines and submit canonical API operations. Unresolved order outbox entries hold repeat operations; original outcomes recover through Activity and release the local hold when terminal. Stale/conflicted intent remains visible for deliberate review rather than being silently overwritten.
- Centralized API workspace navigation for desktop/mobile/hash entry, including permission-gated POS and Settings. API order commands require connectivity; offline POS remains a later bounded-grant phase.
- No tests/lint/build/browser execution ran. Deferred acceptance includes concurrent terminal edits, barcode/portion selection, stale and ABA fire revisions, duplicate clicks/response loss/restart, navigation/viewports, zero legacy calls, stock/document reconciliation and safe updates. Payment/till UI, advanced POS operations and all later sprint phases remain outstanding.


## Final sprint continuation ? PWA till controls (source only)

- Added API POS till opening, paid-in/out, blind close count and manager variance-review forms. Each action pins its reviewed till/outlet/policy versions and requires connectivity. Opening/handling uses the current staff/device identity; an active till elsewhere is called out rather than silently reused.
- Close entry hides expected drawer totals until the count is submitted. REVIEW_REQUIRED records show submitted count/expected/variance for authorized review; the API retains control of thresholds, ownership, order blockers and unresolved financial outcomes.
- Till outbox uncertainty joins the POS repeat-submission hold, and the form recovers original terminal outcomes. Added the corresponding API shell permissions/bootstrap access and corrected order/variance projection access for authorized firing/payment/review staff. Settings money and percent entry now reuse the existing strict decimal parsers.
- No tests/lint/build/database/browser execution ran. Deferred acceptance includes drawer conservation, blind-count presentation, ownership and scope, manager permission boundaries, response loss/restart, active order/financial command blockers and variance review. Tender-entry UI, advanced POS/finance operations and the remaining sprint phases remain outstanding.


## Final sprint continuation ? PWA tender entry (source only)

- Added API POS tender review for cash/manual M-Pesa/card/bank and split allocations. Opening the form pins order/till/account revisions, the outstanding balance and the owning staff/device till. Cash requires physical tender entry and shows change; split review shows allocated/remaining amounts and must settle exactly.
- External tenders require explicit manual confirmation. M-Pesa separately captures actual received amount/time in the business timezone, destination details and reference policy. Changing account/amount/reference/evidence clears confirmation; mismatched received amounts block posting instead of fabricating payment truth.
- Connected payment commands through the API shell with permission/connectivity checks. Pending/unknown payments join the POS submission hold and recover their original terminal outcomes. Till/order/payment reviews avoid opening competing forms. Confirmed documents and printing remain accessible in Activity.
- No tests/lint/build/database/browser execution ran. This completes source wiring for the basic online order/fire/payment/till/document chain, not acceptance or production readiness. Deferred gates include split/cash change, manual M-Pesa discrepancy/ref uniqueness, multi-terminal races, response loss/reload/reconnect, exact-one payment/sale, taxes/stock/drawer/document reconciliation, permissions and physical printing. Refund/reversal/discount/comp/service/modifier workflows and the remaining sprint phases remain outstanding.


## Final sprint continuation ? refund/reversal domain (source only)

- Added migration 025 and online-only `payment.refund` / `payment.reverse`. Native semantics are preserved: reversal refunds the full remaining payment amount; both retain the original sale/payment and record separate immutable returns. They do not restock inventory automatically or silently reopen/alter paid sale lines.
- Refunds require reviewed payment/order/till revisions, an owned open till in the original outlet, an explanation and explicit confirmation of money returned. External returns additionally require manual verification and a return reference. Cash returns enforce drawer availability and add negative immutable refund/reversal cash entries. Remaining refundable amounts and order refund totals are checked transactionally.
- Payment projection revisions now track refund changes, including seeded existing identities and new-payment initialization. Refund/order/payment/till/document changes emit explicit records; separate immutable refund receipts enter the audited print queue and browser renderer. Original receipts remain unchanged. Refunds before later final settlement are disclosed separately in the new sales receipt snapshot.
- Added refund bootstrap/access boundaries and unresolved-refund close blockers. No tests/lint/build/database/browser execution ran. Operator refund UI and accounting journal/tax reversal allocations remain outstanding; this is not finance completion. Deferred gates include partial/full/repeated/concurrent refunds, response-loss replay, cash/external evidence, underflow/isolation, paid-history preservation, document reconciliation and no automatic restock.


## Final sprint continuation ? PWA refund review (source only)

- Added permission-gated API Refunds workspace with original payment/order identification, authoritative remaining-refundable amounts, partial refund/full-remaining reversal review, return reasons and immutable history. Reviews pin payment/order/current owning till revisions.
- Cash/external returns require explicit confirmation of money returned; external returns also require manual verification and a return reference. Evidence changes clear confirmation. Forms retain original uncertain command IDs for recovery; unresolved money/order actions hold further returns. Physical stock returns remain a separate operation.
- Connected refund commands and workspace navigation through API authority mode. Corrected the shell's older-unknown-command block to return BLOCKED for a new unsubmitted action, rather than attaching the previous command ID and potentially reporting its recovery as confirmation of the new action.
- No tests/lint/build/database/browser execution ran. Deferred acceptance includes remaining-balance changes, permissions/till ownership, actual cash/external returns, duplicate references, partial/full/concurrent/replayed refunds, restart and prior-command isolation. Accounting journals/tax reversals, advanced POS and later sprint phases remain outstanding.


## Review reconciliation - local verification on 2026-10-07

- Revisited the pasted inventory/CI blocker review against the current checkout. CI already includes `reset/vps-platform` and dedicated real PWA/API/PostgreSQL acceptance; lifecycle recovery, explicit handler records, balance revisions and inventory receiving/reversal source work preceded this review. Hosted GitHub Actions status has not been verified in this run.
- Fixed two current root-suite failures: added the API-only `inventory.policy.save` and `outlet.save` operations to the ledger without claiming legacy dispatcher coverage; replaced the obsolete assertion that attached an unrelated unknown command ID to a new action. The new assertion requires BLOCKED and forbids identity inheritance.
- Extended real-backend browser acceptance to create a product through the PWA, verify its exact minor-unit price and authoritative PostgreSQL revision, and verify both product and stock projections after reload. Reconnect recovers a missed stock change; a reviewed stock count persists balance revisions; all queued actions synchronize and no servos_v2 requests occur. Improved fixture teardown so a closed page cannot prevent API/pool cleanup.
- Local checks passed: TypeScript, production build, 218/218 root tests, 19/19 API tests with real isolated PostgreSQL and zero skips, cloud-v2 protocol suite, docs checks, UI audit generation, preview browser 52 passed/2 dedicated skips, and dedicated real API browser 1 passed. UI audit generation does not accept its unreviewed findings. The new browser scenario initially timed out on a strict select-label matcher; using the combobox accessible name resolved it and the full scenario passed.
- Production browser viewport matrix passed: 88 tests and 4 dedicated real-API skips across 1024x600, 1280x720, 1366x768 and mobile. The dedicated real-API scenario ran separately and passed. These checks cover catalog/inventory and retained legacy workflows; they do not establish transactional acceptance of the newer API POS/payment/refund domain, physical printing, backup restore, production migration or cutover. Procurement and Rooms have not been expanded in this review slice.

- The isolated review PostgreSQL container was stopped after verification. Existing unrelated database/service containers were not changed. Remaining revenue acceptance requires real PostgreSQL tests for the newer API order/fire/payment/refund/till chain before further major domain expansion.


## Final sprint continuation - payment and refund journals (source only)

- Added migration 026 for immutable financial journal headers and normalized lines, business-scoped source uniqueness/foreign keys and indexed history/source access. Deferred database checks require balanced totals, one tender line, the original payment account, correct debit/credit direction, source money equality and a valid original journal for refunds. No historical allocations are guessed or backfilled.
- Payment and split-tender commands now post asset/sales/VAT/levy journals atomically with payments, drawer entries, order/till changes and documents. Integer BigInt ratios allocate combined tax first and then VAT/levy; cumulative differences preserve exact totals without negative one-minor-unit allocations caused by independently rounding both taxes. This rounding policy is explicitly versioned in journal evidence.
- Subsequent partial payments subtract actual prior posted allocations from the current frozen-line totals. This preserves previous accounting if a tab gains newly fired items. Missing or inconsistent historical journals block further settlement for explicit reconciliation. Refunds use cumulative reversals of their original payment journal, including after rate changes or prior partial returns, and credit the original tender account. No automatic stock restock or paid-history rewriting was introduced.
- Journal projections share bootstrap/feed shape and are restricted to accounting/audit/report permissions. Refund receipts snapshot and render reversed net/VAT/levy amounts and the original journal link; prior immutable receipts remain unchanged.
- No tests, lint, build, database migration or browser execution ran for this slice, following the instruction to defer verification. Earlier green evidence predates these source changes. Deferred gates include one-unit/mixed-tax/large-value allocation, partial payments with added lines, split tender, repeated partial/full refunds, missing-journal refusal, concurrency/replay/response-loss, deferred SQL constraints/immutability, permission-filtered feed/bootstrap and drawer/order/document/journal reconciliation. Full chart of accounts, COGS/AR/AP and day-close reporting remain later work; this is not finance or production completion.

- Added a permission-gated revenue journal evidence panel in API Activity, with payment/command search, original refund links, debit/credit lines and projected balance reconciliation. It explicitly identifies the bootstrap history cap and is not presented as a complete financial report/day close. Prior refund postings must reconcile to the original cumulative allocation before another return can post. UI and reconciliation checks remain source-only and unverified.


## Final sprint continuation - immutable till close-day reports (source only)

- Added migration 027 and online-only `closeDay.generate` under reports permission, preserving the native one-report-per-closed-till boundary. Expected till revisions, completed variance review, unique till/report/document identities and database evidence-link checks protect issue. Issued reports/documents cannot be edited or silently regenerated.
- Reports reconcile payment/refund tender records with original journal allocations and drawer sales/refund entries, then reconcile opening float, movements, expected cash, blind count and accepted variance. Missing historical journals or inconsistent source totals block issue instead of filling missing history with zeros. Sums use integer/BigInt intermediates with safe-range checks.
- Settled-sale totals come from immutable final sales receipts whose settlement command collected money in this till. Collections and tax allocations come from this till's payment/refund postings, including partial payments. These distinct bases prevent assigning a full sale to every session that collected a partial payment. Refunds of older payments remain returns in the till that actually handled the return.
- Business-wide open-order/outstanding/unresolved-money diagnostics use one statement snapshot at generation and explicitly retain that observation time; they are not represented as historical close-time figures. Credit and room/folio exposure are marked NOT_MIGRATED, not assumed zero. This leaves broader Finance/PMS close reporting incomplete.
- Added API Activity issue/review/history/preview controls with original-command outcome recovery, bootstrap/feed report projections, report/document permissions and audited OFFICE print jobs. The shared browser renderer supports the immutable close-day document and Nairobi-local period display. Existing print uncertainty/retry confirmation applies; a print attempt cannot regenerate a report or repeat a financial command.
- No tests/lint/build/database/browser/hardware execution ran. Deferred acceptance includes empty and cross-session partial-payment tills, mixed/split/external tenders, prior-payment refunds, tax/journal/drawer reconciliation, missing history, variance review, parallel report issue, UUID replay/response loss, snapshot/hash/layout, permission-filtered bootstrap/feed, unsupported-domain disclosure and physical print fallback. Earlier green evidence predates migrations 026/027 and these operator/source changes.


## Final sprint continuation - unpaid order void and stock disposition (source only)

- Added migration 028 and online-only `order.void` under its existing permission. Unpaid OPEN/FIRED orders can be voided after reason/disposition confirmation; paid and partly paid orders are refused even after a separate refund. Original line amounts, tax/price snapshots and order value remain available, with prior fired state and void attribution retained. The PWA displays voided orders as not payable.
- Fired orders require explicit RETURN_SEALED, WASTE, CONSUMED or MANAGER_ADJUSTMENT disposition. Waste/consumed choices retain the existing consumption deduction rather than deducting twice. Manager correction is explicitly outstanding and is not silently executed. Unfired orders retain NOT_FIRED evidence.
- Sealed return requires actual unopened-bottle confirmation, immutable original whole-container consumption, unchanged stock units/container configuration, reviewed stock/location/balance revisions and a reconciled current physical balance. Prepared/measured stock cannot be guessed into sealed bottles. Returns add new VOID_RETURN movements to current balances rather than rewinding later activity, with immutable per-consumption links and original posted cost feeding weighted valuation. Added per-line whole-bottle fire validation so fractional bottle lines cannot hide inside a whole aggregate.
- Voids issue immutable ORDER_VOID_NOTICE and relevant KOT_CANCEL/BOT_CANCEL documents through the audited print queue. Queued/known-unsent original preparation tickets are cancelled transactionally with print revisions/events; in-flight/uncertain delivery remains recorded and cancellation notices warn staff. Claim/retry refuses original preparation tickets for already voided orders. Print entity locks precede job-row locks to match command locking.
- Added API POS void review, reason/disposition/physical confirmation, pinned sealed-return revisions, original-outcome recovery, void history and cancellation rendering/permissions. No Supabase mutation path was added.
- No tests/lint/build/database/browser/printer execution ran. Deferred gates include unpaid/paid/refunded orders, draft and mixed fired lines, sealed/recipe/measured returns, per-line bottle fractions, ABA/multi-terminal stock races, original-cost valuation, atomic rollback/replay/response loss, pending ticket claim/report races, known-unsent cancellation versus uncertain delivery, physical kitchen/bar cancellation and permission/feed/bootstrap behavior. Advanced discounts/comps/modifiers/service workflows and later sprint phases remain outstanding.


## 2026-10-07 ? POS price adjustments and zero-value completion (source only)

- Added migration 029 preserving historical recorded gross amounts, bounded discounts, conservation constraints and comp reasons.
- Added online `order.discount`, `order.compItem` and `order.comp` with direct staff permissions, reviewed order revisions, reason evidence and immutable before/after order events. Manager approval delegation remains outstanding.
- Repricing uses exact minor units and frozen line tax policy. Discounts skip comped lines; line and price edits reject any existing payment. Stock consumption is unchanged by repricing.
- PWA exposes separate reviewed discount, selected-line comp and whole-order comp actions. Pending/unknown outcomes retain the original command ID and block new POS operations.
- Fully fired, nonempty zero-value orders complete with an immutable sales receipt and audited print job, explicitly recording no payment. Owned open till attribution is recorded when available; otherwise it remains explicitly unassigned.
- Paid receipts retain total reductions. Browser receipts show line reductions, comp reasons and no-payment status. Close-day receipt aggregation includes explicitly attributed zero-value receipts; business diagnostics expose unassigned zero receipts without guessing a till.
- Verification deferred by sprint instruction: migration execution, API/PWA behavior, concurrency, response-loss, tax-rounding and regression suites have **not** been run for this slice. Production activation and hardware acceptance remain pending.


## Final sprint continuation - POS product discovery and preparation notes (source only)

- API POS now combines search, outlet-scoped category selection and a favorites filter, with counts, empty results and filter reset. Product buttons have larger touch targets; barcode lookup still uses all available outlet products so display filters cannot hide a scanned match.
- Catalog favorite defaults remain authoritative catalog data. Optional personal overrides are browser preferences scoped to business/staff, tolerate unavailable or malformed storage, and can be reset to catalog defaults. They do not submit business commands or alter product revisions.
- Added migration 030 and preparation notes through the existing `order.addItem` / `order.updateItem` commands. Notes are bounded to 500 characters, reject control codes, and retain reviewed order/line edit boundaries. Omitted notes on quantity updates preserve existing instructions; an explicit empty note clears them.
- Order projections carry preparation instructions into the immutable fired KOT/BOT snapshot and receipt rendering. Draft edits retain before/after note and quantity event evidence. Fired lines cannot be edited, and partially paid orders remain protected.
- No tests, lint, build, migrations or browser execution ran. Deferred acceptance includes staff/business preference isolation, storage failures/reload, category/outlet/favorites/search combinations, scanner behavior under filters, touch layouts, note clearing/validation, stale edits, immutable fired ticket content, replay and response-loss recovery.


## Final sprint continuation - catalog selling options and reviewed product saves (source only)

- Fixed the API catalog product editor dropping inventory type, recipe yield, portion volume, selling mode, portions and outlet availability on ordinary edits. These supported fields now initialize from the captured product and have explicit editing controls.
- Added a dedicated selling-options panel for inventory type, default stock quantity, recipe batch yield, measured/bottle-only mode, named portion prices/quantities/whole-container flags and available outlets. No outlet selection retains the existing all-outlets meaning.
- Product prices and portion prices remain decimal text until strict minor-unit parsing. API product saves pin the product version captured when opening the editor, rather than silently adopting a newer projection version at submit.
- API portion validation now bounds option count, requires unique bounded IDs and names, safe integer prices, positive quantities with at most six decimals, and boolean whole-container flags. Stock snapshot creation rejects a claimed whole-container option without valid linked bottle tracking. POS displays selected portion names and stock quantities during selection.
- Modifiers, price rules, customer/table/room assignment, course/round workflows and manager approval delegation remain outstanding; the new controls do not expose those unsupported actions.
- No tests, lint, builds, migration or browser execution ran. Deferred gates include catalog edit preservation, exact minor-unit round trips, stale reviews, duplicate portion IDs, malformed quantities, unavailable outlets, recipe/batch/direct/serving/bottle consumption, physical bottle conservation, ticket/receipt snapshots, browser layouts and response-loss recovery.


## Final sprint continuation - product modifiers (source only)

- Added migration 031 with versioned product modifier definitions and indexed tenant-scoped stock-reference foreign keys. Active product consumption lookup includes modifier references, preserving stock configuration/archive dependency guards.
- Catalog saves validate bounded unique modifier IDs/names, signed safe minor-unit price deltas, unique stock references and signed base-unit ingredient changes with six-decimal precision. Referenced stock must be active; older callers omitting modifiers preserve existing definitions.
- API product bootstrap/feed carries modifiers. Catalog controls edit names, signed KES prices and stock ingredient changes; decimal input converts at the command boundary. POS captures selected IDs and previews the reviewed option price, with duplicate/unknown selections rejected by the API.
- Order add freezes modifier definitions, adjusted price, original base price in its event and final ingredient consumption. Price addition and ingredient adjustments use integer/BigInt intermediates. Native nonnegative price-floor behavior is preserved; negative resulting ingredient consumption is refused. Whole-bottle consumption cannot become fractional sealed stock through a modifier.
- Quantity edits preserve frozen option pricing/consumption. Fire, ticket and receipt snapshots use the frozen selections; later product edits cannot reinterpret the old sale.
- No tests, lint, builds, migrations or browser execution ran. Deferred gates include duplicate/unknown selections, stale product reviews, decimal and signed boundaries, zero-price floors, ingredient removal/addition/over-removal, unavailable stock, reference guards, bottle conservation, replay/response loss, bootstrap/reload/feed and ticket/receipt layouts. Price rules, course/rounds, service assignment and delegated manager approvals remain outstanding.


## Final sprint continuation - held courses and selective fire (source only)

- Added migration 032 for bounded course labels and explicit fired timestamps. Historical timestamps remain unknown instead of being inferred from mutable line update times.
- Existing add/update commands accept course labels on draft lines, retaining before/after evidence and preserving omitted labels. Fired lines remain immutable to ordinary edits.
- Existing `order.fire` now accepts a course filter and/or a unique explicit draft-line selection. Missing, already-fired, foreign-order or course-mismatched selected lines conflict before stock changes. No selection retains the existing all-draft behavior.
- Selected lines alone consume stock and transition to FIRED. Unselected draft lines remain held; events retain selected and held IDs. Immutable KOT/BOT snapshots now record actual FIRED state and timestamp instead of carrying their pre-transition DRAFT state.
- PWA fire review offers individual line selection, select-all and named-course shortcuts using captured order/stock/balance revisions. Remaining held lines are explicit; empty selections cannot submit. Course labels render in order lines and business documents.
- Existing API and payment-panel checks continue to prevent collecting money while draft lines remain. Zero-value auto-completion still requires all active lines to be fired.
- No tests, lint, build, migrations or browser execution ran. Deferred acceptance includes mixed held/fired courses, stale and foreign line selection, exact selected-stock deductions, concurrent fire, replay/response loss, held-line edits, zero-price orders, payment guards and immutable routed ticket content/layout. Preparation/KDS state, rounds, service assignment and later sprint phases remain outstanding.


## Final sprint continuation - preparation pass (source only)

- Added migration 033 and existing canonical `order.kds` under `kds.update`. Preparation advances FIRED -> PREPARING -> READY -> SERVED with reviewed order versions and audited line/station evidence. Void/missing orders, stale versions, invalid selections and skipped/backward transitions are refused.
- Preparation status is separate from financial line state: these transitions do not consume stock, alter prices/taxes, change payment eligibility or regenerate tickets. Paid/completed orders can still finish preparation; voided orders cannot.
- New fire records preparation status, actor and timestamp. Historical FIRED lines retain known fired status without fabricated preparation times/actors.
- Added permission-filtered API bootstrap/feed access and a PWA preparation pass with kitchen/bar/rooms station selection, notes/modifiers/course display, served filter, single-line advance and original-command recovery. It explicitly identifies the loaded-history scope rather than claiming a complete production queue.
- No tests, lint, build, migration or browser execution ran. Deferred gates include role isolation, stale multi-terminal transitions, station/item mismatch, paid-before-served orders, void races, stock/money invariance, replay/response loss, reload/feed and touch layouts. Complete paginated station history, rounds, service assignment and later sprint phases remain outstanding.


## Final sprint continuation - recover all live POS obligations (source only)

- Removed the global latest-1000 order cap from operational recovery. Bootstrap now includes every OPEN/FIRED order and every nonvoid order with unfinished preparation, including paid/completed sales awaiting service. Only recent closed history remains capped at 1000.
- Explicit order-ID projection lookups no longer inherit the history cap. Added migration 034 indexes for recent closed history and unfinished preparation lookup; the existing bootstrap snapshot/cursor boundary and permission filtering remain in use.
- Preparation UI describes the recovery/history distinction. Preparation-update-only roles can use the same audited preparation-document print actions as preparation viewers.
- No tests, lint, build, migration or browser execution ran. Deferred acceptance includes more than 1000 newer closed orders, old open/paid-unserved orders, void exclusion, served transitions, reload/rebuild/change-feed convergence, role filtering and query performance. This does not complete generalized paginated history or bounded bootstrap streaming, which remain required for large datasets.


## Final sprint continuation - order-local document evidence and print recovery (source only)

- Selected API POS orders now expose their immutable documents and linked audited print jobs through the existing shared preview/print workflow. Tickets, receipts and cancellation evidence are scoped by original snapshot order ID; printing never repeats the order/payment command.
- Fixed print recovery tracking to follow the original command ID. REJECTED/CONFLICT outcomes now release the local pending hold even when the print job version does not change. An unrelated job revision cannot be mistaken for confirmation of that command.
- Persisted pending/unknown print actions block further actions for that job after component remount. Recovery does not automatically open another print dialog; staff review the actual current delivery state, including uncertain delivery and possible duplicates.
- No tests, lint, build, migration or browser execution ran. Deferred acceptance includes POS/Activity switching, original claim/report rejection and conflict, remount/reload, unrelated job changes, cross-device claims, lost responses, scoped document visibility and browser/physical delivery review. Print Bridge and hardware acceptance remain outstanding.


## Final sprint continuation - tracked repeat rounds (source only)

- Added migration 035 with bounded order/line round identities. Existing held drafts begin the new tracked sequence; earlier fired lines retain unknown round identity and cannot be silently guessed into a repeat group.
- Full/current-round fire advances the round after its remaining held lines are selected. Explicit course-only fire retains native nonadvancing behavior. Events retain prior round and advancement evidence.
- Added canonical online `order.repeatRound` under POS permission. The command rebuilds the last recorded fired round through the same add-line validation in one transaction, bumps the order once and records original/copy line evidence. Stock is unchanged until separate fire.
- Repeated lines retain quantities, portion/modifier IDs, course and notes but use current reviewed product prices, tax and consumption configuration. Discounts/comps are not copied. Missing/archived products/options, stale versions, partial payment and line limits refuse the whole command.
- PWA exposes a captured repeat review with current option-adjusted unit prices, pinned product/order/settings versions, pending/unknown recovery and original-round disclosure. No test, lint, build, migration or browser execution ran. Deferred gates include multi-course/partial fire boundaries, historical unknown rounds, unavailable options, exact pricing, atomic refusal after a later invalid line, concurrent repeats, replay/response loss, stock conservation and receipt/ticket round evidence.


## Final sprint continuation - standalone printer transport library (source only)

- Added a standalone Rust printer transport crate retaining native Windows RAW/private-LAN TCP transport, bounded printer profiles, raster handling, cutter/feed behavior, uncertainty classification and inherited tests without Tauri or database dependencies. Native source remains unchanged; provenance records its source hash and three visibility-only changes in the imported module.
- Added a bounded single-document renderer using retained wrapping/image routines. It rejects embedded control codes, oversized text/output and unsupported raster evidence. Logo prints at top; QR uses the native raster path before fixed footer or document end, followed by the required caption. No browser-supplied raw ESC/POS entry point was added.
- This is the Print Bridge transport foundation, not a running service. Pairing, trusted localhost HTTPS, enrolled-device signatures, typed canonical document validation/rendering, durable job deduplication/uncertainty, installer/PWA integration and hardware acceptance remain outstanding.
- No compilation, tests, dependency resolution, browser or printer execution ran. Deferred acceptance includes inherited transport tests, generic layouts and control-code/size bounds, raster/caption placement, Windows spooler failures, TCP partial writes, feed/cut and target printer output.


## Final sprint continuation - durable bridge delivery journal (source only)

- Added the Print Bridge library crate and a local SQLite delivery journal with exact-envelope hashing, canonical UUID identity, idempotent acceptance, immutable envelope/event evidence and guarded revision/attempt transitions. No PostgreSQL or business mutation authority is present.
- SENDING commits before transport can start. Explicit exclusive-startup recovery converts interrupted attempts to DELIVERY_UNCERTAIN; opening a reader cannot automatically invalidate a live send. Transport success remains SENT_TO_SPOOLER, never a claim of paper delivery.
- Uncertain/spooled retries require a reason and explicit possible-duplicate acknowledgement. Active sends cannot be cancelled/retried; only known-unsent jobs can cancel. Original status lookup supports recovery after local response loss without another send.
- Added service-boundary documentation. Signature/canonical payload validation, trusted HTTPS/origins/pairing, singleton locking, configured routing, transport orchestration, API/PWA reconciliation and installer/hardware work remain outstanding. The journal library is not an exposed bridge service.
- No compilation, dependency resolution, tests, browser, migration or hardware execution ran. Deferred acceptance includes crash boundaries, simultaneous opens/transitions, exact-byte replay, UUID aliases, stale revisions, audit immutability, storage failure and uncertain-delivery operator review.


## Final sprint continuation - exclusive bridge journal sessions (source only)

- Added an OS-backed exclusive writer session using a persistent adjacent lock file and canonical journal path. The actual file lock, rather than lock-file existence/PID guesses, determines whether another writer is active. Process exit releases ownership without deleting the lock file.
- Schema initialization and interrupted-send recovery occur only after obtaining the writer lock. Direct journal open/recovery are now crate-private; external callers obtain the journal through the session. A second writer fails before it can reclassify a live attempt as interrupted.
- Documented persistent installer-owned storage, session lifetime and unsupported attacker-controlled/hard-link alias locations. Signed-job authorization, trusted HTTPS/pairing, configured routing, durable send orchestration and installation remain outstanding.
- No compilation, dependency resolution, tests or hardware execution ran. Deferred acceptance includes Windows/Linux lock behavior, concurrent startup, crash release/restart, canonical path aliases, lock-file retention, storage failures and SENDING recovery with no duplicate send.


## Final sprint continuation - signed bridge request foundation (source only)

- Added a domain-separated signed request contract and Rust P-256/SHA-256 verifier compatible with existing browser device keys and WebCrypto P1363 signatures. The browser helper signs exact bounded payload bytes; private keys remain in device identity storage.
- Verification binds bridge/business/device/request identities and exact approved HTTPS origin, rejects private/invalid public JWKs, validates short issue/expiry windows and payload bounds, and returns an opaque verified-request value. Pairing identity fields cannot be modified after construction.
- This does not expose an endpoint or authorize arbitrary print bytes. Approved-pairing persistence/approval/revocation, trusted localhost HTTPS, typed action/document validation, durable request replay handling and API print-claim reconciliation remain outstanding.
- No compilation, dependency resolution, tests, browser or hardware execution ran. Deferred gates include Rust/WebCrypto interoperability, modified payload/bindings, wrong key/origin, clock bounds, malformed signatures/public keys, expired requests and replay-safe service integration.


## Final sprint continuation - durable signed bridge request replay (source only)

- Added local journal schema 2 with immutable signed-request fingerprints, scoped identities, RECEIVED/COMPLETED outcomes and bounded stored responses. Only first durable acceptance permits initial execution; exact replays return the original response or explicit unresolved state. Changed content under a reused ID is refused.
- Completed outcomes are immutable; duplicate identical completion is idempotent. A fresh verified status request can recover an older request after its signature window expires, scoped to the same bridge/business/device.
- Missing responses do not authorize automatic re-execution. Typed operation/job/attempt reconciliation and atomic service orchestration remain outstanding, alongside pairing, canonical document validation, HTTPS and PWA transport integration.
- No compilation, dependency resolution, tests or runtime execution ran. Deferred acceptance includes schema 1 upgrades, exact/changed-content replay, concurrent acceptance, crash after receive/action/complete, immutable outcome evidence, expiry/status recovery and cross-device lookup refusal.


## Final sprint continuation - typed bridge action contract (source only)

- Added matching TypeScript/Rust bridge action contracts for submit, job/request status, reviewed retry and cancellation. Rust parsing requires a verified signed request and refuses unknown actions/fields, malformed IDs/revisions, unbounded copies/reasons, unsupported document types/layouts and snapshot hash mismatches.
- Submit carries immutable document snapshot bytes and API claim revision; it does not accept raw ESC/POS, caller-rendered text, printer addresses or queue names. Browser signing now accepts the typed contract.
- Hash integrity alone does not prove API issuance. Authoritative claim/document verification, per-document schema/rendering, approved local role routing and execution remain outstanding. No endpoint or transport execution was enabled by this slice.
- No compilation, dependency resolution, tests or runtime execution ran. Deferred acceptance includes cross-language field naming, unknown fields/actions, integer/copy/reason bounds, corrupted snapshot bytes, unsupported layouts, claim binding and typed dispatcher integration.


## Final sprint continuation - approved local printer routing (source only)

- Added schema-versioned local printer configuration for RECEIPT/KITCHEN/BAR/OFFICE/LABEL roles. Signed requests select a role only; approved local configuration supplies its TCP or Windows RAW destination and bounded paper/image/feed/cut profile.
- Routes reuse retained native validation, including private-network TCP addresses and local Windows queue restrictions. Windows RAW configuration refuses non-Windows hosts. Unknown fields/schema versions and unconfigured roles fail explicitly; configuration parsing does not probe or print.
- Added an illustrative LAN configuration and Windows queue guidance. Installer ACLs/configuration approval, authoritative claim/document verification, strict rendering and service execution remain outstanding.
- No compilation, dependency resolution, tests, network probing or printer execution ran. Deferred acceptance includes role mapping, unsupported platforms, public/network queue rejection, profile bounds, missing-role fallback, configuration tampering and physical routing on target hardware.


## Final sprint continuation - strict preparation ticket bridge renderer (source only)

- Added the initial dedicated KOT/BOT renderer for validated submit actions and matching kitchen/bar roles. It checks bounded immutable order/line identities, issue time, fired/station evidence, quantities, portions/modifiers/courses/rounds and preparation notes before producing text.
- Tickets retain original order/outlet/staff references and format issue time for Nairobi. Rendering reads no current catalog/pricing/stock and issues no business command. The existing bounded transport renderer handles output; payment QR is excluded from preparation tickets.
- Unsupported/malformed historical snapshots require browser fallback rather than silent reinterpretation. Cancellation, receipt/refund, close-day and procurement bridge layouts, authoritative API claims, service dispatch and hardware acceptance remain outstanding.
- No compilation, dependency resolution, tests, runtime or printer execution ran. Deferred acceptance includes cross-language snapshot shapes, old pre-fire-state documents, route mismatch, Unicode fallback, multiline notes, malformed quantities/identities, layout bounds and target kitchen/bar print output.


## Final sprint continuation - bridge cancellation and void notices (source only)

- Added strict KOT_CANCEL/BOT_CANCEL and OFFICE ORDER_VOID_NOTICE rendering through the implemented-layout dispatcher. Matching station roles, original line states/identities, bounded quantities/options/notes and immutable cancellation evidence are checked before encoding.
- Notices prominently stop preparation/service and retain reason, original amount, stock disposition, sealed-return/correction evidence and warnings for earlier tickets with unresolved delivery. Contradictory disposition flags or duplicate/invalid unresolved identities refuse rendering.
- The bridge does not recompute stock disposition, reverse inventory or claim a refund. Other unsupported layouts continue to require browser fallback; authoritative API verification and actual service execution remain outstanding.
- No compilation, dependency resolution, tests or printer execution ran. Deferred acceptance includes draft/fired mixes, sealed/waste/consumed/correction dispositions, route mismatch, uncertain earlier tickets, original options/notes and target cancellation layouts.


## Final sprint continuation - API-issued bridge claim authorization (source only)

- Existing `print.claim` accepts an optional canonical bridge ID and signs an API attestation inside the claim transaction. It binds business/staff/device/bridge, job revision/attempt, immutable document identity/type/number/layout/hash, role/copies, original command and a short validity window.
- Signing uses a separate server-only P-256 key/version and a distinct signature domain. Browser claims remain available without bridge signing. Missing/invalid bridge signing configuration refuses the bridge claim transaction; no signing key is exposed to the PWA.
- Attestations are returned only in the original command value, preserving durable command-response recovery, and are excluded from shared projection records. Added deployment secret placeholders.
- Bridge-side pinned API-key verification, claim freshness/revocation reconciliation, PWA token recovery, local dispatcher and service remain outstanding. No tests, build, migration, runtime or key provisioning ran. Deferred gates include missing-key rollback, signed field binding, response loss, expired claims, key rotation and bridge verification interoperability.


## Final sprint continuation - pinned API bridge claim verification (source only)

- Bridge submit now requires the API claim attestation. Added a pinned API P-256 verifier that binds signature/version/window, business/device/bridge, job revision/attempt, document identity/type/number/layout/hash and role/copies to the verified browser request.
- Validated actions retain their verified-request fingerprint, preventing pairing an action parsed from one request with authorization from another. Successful API verification produces an opaque authorized-submit value; request-provided public keys are not accepted as trust pins.
- Shared TypeScript submit contract carries the attestation. Documented separate API/device key trust and approved key rotation.
- Live claim/revocation reconciliation and expiry checks immediately before send remain required; attestation alone is not a perpetual lease. No transport/service activation occurred. No compilation, dependency resolution, tests or runtime execution ran. Deferred gates include Node/Rust signature interoperability, modified signed fields, action/request substitution, wrong pins, expiry, retries/void races and end-to-end claimed-job delivery.


## Final sprint continuation - read-only live bridge claim check (source only)

- Added `/v1/print-bridge/check-claim`, authenticated by the original short-lived API-signed claim capability. It verifies the server signature/key version/expiry before reading the bound business/job; it cannot claim, renew, retry, report or mutate business state.
- The check compares current SENDING revision/attempt/owner/device, immutable document fields, role/copies, active staff and unrevoked staff-bound enrolled device. Original KOT/BOT claims also require an existing nonvoid order.
- Replies are uncached, signed in a separate API-check domain, bound to the original claim payload hash and valid for at most five seconds without extending the claim expiry. This is observation-time evidence, not a lock held across physical transport.
- Bridge-side live-check verification/network integration, permission-change reconciliation, final transport orchestration and service activation remain outstanding. No tests, build, migration or runtime execution ran. Deferred gates include malformed/expired capabilities, changed/cancelled/retried claims, device/staff revocation, order void races, signed-response freshness and unchanged database state.


## Final sprint continuation - bridge live claim verification/client (source only)

- Added pinned API signature verification for live-check responses, bound to the exact authorized claim payload hash. Inactive, substituted, expired or excessive validity windows are refused; returned proof is an opaque ephemeral FreshSubmit.
- Added approved-origin HTTPS claim-check client with TLS verification, no redirects, bounded response reads and connection/total timeouts. Request-controlled API origins and printer destinations are not accepted.
- Freshness rechecks use both expiry and monotonic elapsed time before transport, guarding wall-clock rollback. Live observation remains distinct from an atomic transport lease or delivery acknowledgement.
- No network calls, compilation, dependency resolution, tests or hardware execution ran. Actual send orchestration, permission-change reconciliation, local service/pairing and PWA integration remain outstanding. Deferred gates include TLS/origin handling, response bounds, signature/hash substitution, clock skew/rollback, timeout/expiry and void/retry races.


## Final sprint continuation - current-permission bridge fencing (source only)

- Live bridge checks now read current staff permissions in the same SQL statement snapshot as job/device/document state. Active claims require both the current shared print-action permission policy and current document visibility.
- Extracted the API print permission list into one shared source used by command authorization and live bridge checks, preventing a removed permission from remaining effective merely because an earlier attestation has not expired.
- Permission removal returns signed inactive evidence without mutating the claim or business data. Observation/transport race boundaries still apply; no perpetual lease is implied.
- No tests, builds, migrations, runtime or printer execution ran. Deferred acceptance includes permission removal/restoration, wildcard grants, document-specific visibility, current staff/device revocation and claim/check/transport races.


## Final sprint continuation - authorized bridge delivery boundary (source only)

- Added a consuming delivery function connecting fresh API observation, approved local route, strict document rendering, durable local SENDING and native transport. It rechecks observation freshness after journal commits immediately before transport.
- Local attempt IDs derive from API job UUID and API attempt, preserving evidence across reviewed retries. Any existing local attempt refuses transport, including interrupted QUEUED attempts; recovery must reconcile evidence rather than automatically resend.
- Copies are rendered independently and combined within a 4 MiB bound. Transport acceptance records SENT_TO_SPOOLER, known pre-output failure records FAILED, and possible output records DELIVERY_UNCERTAIN. A failed outcome commit retains durable SENDING for conservative startup recovery.
- No tests, compilation, dependency resolution, network calls or printer execution ran. Request-to-attempt crash reconciliation, authenticated listener/pairing, API outcome reporting, financial renderers and PWA integration remain outstanding. This library boundary does not activate a service or prove physical delivery.


## Final sprint continuation - durable bridge request/attempt reconciliation (source only)

- Added local journal schema version 3 with immutable, unique request-to-local-attempt linkage. Delivery now requires the matching verified request and commits the association before enqueue and transport. Reusing either request or API attempt refuses execution.
- A fresh signed request can inspect an older request's associated delivery evidence within the same business/device/bridge scope. Missing linked delivery, queued, active and uncertain outcomes remain explicit; none authorizes replay. Restart recovery continues to mark interrupted SENDING as DELIVERY_UNCERTAIN.
- Linkage and enqueue are separate durable commits: interruption between them leaves linked evidence with no delivery record and prevents automatic execution. This is conservative recovery, not an automatic retry policy.
- Tests, compilation and runtime execution remain deferred. Listener response serialization, completion reconciliation, API outcome reporting, pairing and PWA wiring still require implementation and final acceptance.


## Final sprint continuation - authenticated bridge dispatcher (source only)

- Added dispatcher verification, typed action parsing, durable receipt, API attestation/live check, delivery and durable JSON completion. Completed request replay returns its exact saved response; interrupted requests return scoped reconciliation evidence without execution.
- Added recovery responses and local job lookup constrained to the originating business/device/bridge pairing. Local job UUID knowledge alone does not permit reading another pairing's delivery evidence.
- Local retry/cancel actions explicitly require API review. Transport and database errors produce bounded reconciliation responses without exposing tokens, snapshots or printer destinations.
- No tests, compilation, network or hardware execution ran. Trusted pairing persistence, HTTPS listener, PWA transport/UI, authoritative outcome reporting and financial document rendering remain incomplete. Stored responses preserve original observations; fresh status lookup is needed for later startup recovery changes.


## Final sprint continuation - PWA bridge transport/recovery evidence (source only)

- Added typed signed HTTPS bridge transport with exact approved origin, omitted credentials, refused redirects, bounded streamed JSON responses and one HTTP attempt. No staff bearer, printer destination or raw print bytes is sent.
- IndexedDB records request identity and scope before fetch. Response loss, timeout and completion-storage failure retain unresolved evidence and instruct recovery before retry or browser fallback. Tokens, document snapshots and private keys are excluded from this tracking store.
- Recovery signs a new REQUEST_STATUS action for the original request, requiring matching bridge/business/device/origin evidence. It never resends SUBMIT or renews an API claim.
- No tests, build or runtime calls ran. Transport is not yet wired into operator print controls; approved pairing configuration, matching HTTPS service route/CORS, strict response schemas, evidence management and authoritative outcome reporting remain outstanding.


## Final sprint continuation - validated bridge responses and recovery listing (source only)

- PWA bridge responses now validate the supported discriminated states, delivery identities/hashes, safe revisions/attempts, bounded details, explicit no-replay recovery policy and bounded nested completion responses before persistence.
- Added IndexedDB evidence schema version 2 with a compound pairing-scope/time index and bounded newest-first lookup for recovery after reload. Evidence remains retained across logout; scoped queries require the matching configured bridge and device.
- No tests, builds or runtime execution ran. Operator recovery UI, pairing/service hosting and authoritative outcome reporting remain outstanding; bridge transport acceptance still does not prove physical delivery.


## Final sprint continuation - operator bridge recovery controls (source only)

- Wired retained Print Bridge submission recovery into API Settings for the current enrolled device. The screen shows request identity, saved bridge origin and outcome; network lookup requires an explicit operator action.
- Recovery queries the original request, then offers a separate current-delivery lookup when a local attempt is known. It never submits print bytes, retries or switches to browser fallback. Saved completion observations remain distinct from later delivery state.
- No tests, builds or runtime execution ran. Full submission controls, pairing/HTTPS hosting, recovery pagination, authoritative outcome reporting and hardware acceptance remain outstanding.


## Final sprint continuation - trusted local bridge pairing configuration (source only)

- Added bounded installer-file configuration for one bridge/business, pinned API public key and HTTPS origin, approved printer routes and up to 100 locally approved device public keys.
- Each pairing retains explicit approval timestamp/reason and revocation state. Duplicate device IDs, private JWK fields, mismatched business/bridge/origin and revoked devices fail closed before dispatch. Empty pairing configuration grants no access.
- Documented installer ACL ownership, independent key verification, per-request configuration reload and in-flight revocation limits. CORS origin permission is distinct from signature authorization.
- No tests, builds, file provisioning, network or hardware execution ran. HTTPS listener, actual local approval workflow/installer, PWA submission wiring and API outcome reporting remain outstanding.


## Final sprint continuation - exclusive bridge worker entry point (source only)

- Added serial private stdio worker binary holding the exclusive journal session throughout its lifetime. Bounded, correlated messages support origin preflight and authenticated dispatch; protocol output contains no transport diagnostics or secret material.
- Approved configuration reloads before every message, including preflight. Invalid replacement fails closed rather than retaining stale device approvals; malformed/oversized/truncated framing terminates the worker.
- Documented host ownership, private pipes, no automatic replay after worker loss and recovery requirements. No compilation, dependency resolution, tests or worker execution ran. HTTPS host/installer, PWA submission controls and API outcome reporting remain outstanding.


## Final sprint continuation - loopback HTTPS Print Bridge host (source only)

- Added Node HTTPS adapter using installer-provisioned TLS and a private Rust worker. Exact local Host and approved PWA Origin, JSON-only bounded bodies, credential refusal, scoped CORS/private-network preflight and a bounded serial worker queue guard the sole request route.
- HTTP disconnects never release an active worker operation for overlapping transport. Worker exit fails closed without automatic restart or replay; saved request identities remain the recovery path. TLS, executable/configuration and journal paths require local provisioning.
- No host/worker execution, dependency resolution, builds, tests, certificate provisioning or printer checks ran. Installer/service recovery, browser TLS/private-network acceptance, PWA submission controls and authoritative outcome reporting remain outstanding.


## Final sprint continuation - API claim to PWA bridge submission orchestration (source only)

- Added submission orchestration through the existing persisted command callback, original command-status lookup for the private attestation, current shared claim ownership/version checks, and canonical immutable snapshot hash verification.
- Unsupported bridge layouts are refused before claiming. Supported preparation/void documents submit a typed signed bridge action exactly once; unresolved API claims never trigger bridge submission or a replacement claim.
- Recorded transport acceptance remains shared DELIVERY_UNCERTAIN pending physical confirmation. Known local pre-output failure can report PREPARATION_FAILED; absent/refused/recovery evidence leaves the original SENDING claim for explicit reconciliation. Reporting uses the normal durable command path.
- No tests, build or runtime execution ran. Operator submission controls/approved bridge selection, service installation, recovery-to-API reporting and physical acceptance remain outstanding.


## Final sprint continuation - PWA bridge selection and document submission controls (source only)

- Added device-scoped local bridge selection in API Settings with explicit installed-identity approval acknowledgement and public enrollment identity display for local provisioning. This preference grants no authority on the service.
- Wired supported preparation/void document submission into Activity and selected-order print queues using API session, persisted claim flow and bridge orchestration. Financial documents retain browser printing pending supported bridge renderers.
- Exposed scoped recovery controls in Activity for operators without configuration permission. Unknown claim/report outcomes retain their original command IDs and prevent another action for that job.
- No tests, build, host or printer execution ran. Installer/pairing acceptance, recovery-to-API reporting, financial renderers and hardware/TLS verification remain outstanding.


## Final sprint continuation - recovered bridge outcome reporting (source only)

- Retained submission evidence now includes original API attempt/revision. Recovery derives the exact per-attempt local UUID and queries current scoped delivery status before reporting.
- Operator-triggered reporting requires the original SENDING API attempt, revision, operator and device still to match. Known pre-output failure reports preparation failure; accepted/uncertain transport reports uncertain paper delivery. No recovery path confirms physical delivery or reprints.
- Recovery reporting is blocked while any print command outcome remains pending/unknown and uses the existing persisted command path. Older evidence without attempt metadata requires manual shared-job review.
- No tests, build, worker/HTTPS execution or hardware acceptance ran. Installation, financial renderers, complete browser/hardware acceptance and release gates remain outstanding.


## Final sprint continuation - immutable financial bridge text layouts (source only)

- Added receipt-role payment acknowledgement/refund layouts using issued snapshot amounts, Nairobi timestamps, original tender references, manual cashier confirmation, refund reasons and tax reversal facts. Tender amounts are checked against the issued acknowledgement total; no prices/taxes are recalculated.
- Renderer rejects invalid IDs, amounts, methods, duplicate tenders and unsupported image content. Financial submission remains disabled in PWA until the PNG/logo/QR pipeline is connected, avoiding silent omission of branding or payment QR.
- No tests, build, runtime or printer execution ran. Sales/close-day layouts, embedded images and shared canonical renderer parity remain incomplete, with physical layout/QR acceptance deferred.


## Final sprint continuation - shared snapshot PNG thermal pipeline (source only)

- Added bounded PNG decoding for immutable logo and uploaded QR images, rejecting animation, invalid format and excessive compressed/decoded dimensions. Both images use the same alpha-on-white monochrome raster pipeline and retained transport validation.
- Financial renderers now carry snapshot images into encoding. QR remains square, uses nearest-neighbor scaling without cropping, and prints the required caption before the immutable custom footer. Added an explicit validated footer boundary to standalone document encoding; frozen Tauri source remains unchanged.
- No dependency resolution, compilation, tests or hardware execution ran. PNG resource-limit behavior, raster fidelity, scaled QR scanning, footer placement and physical printer acceptance require final verification; financial PWA enablement remains pending.


## Final sprint continuation - sales receipt bridge layout and financial submission (source only)

- Added immutable sales receipt layout with fired item identities/quantities, frozen portions/modifiers, discounts/comps, notes, cashier, tax totals, tenders/manual external-payment confirmation and zero-payment truthfulness.
- Checks reconcile issued line/tax/discount/tender totals before encoding; it does not recompute prices or tax policy. Reused tender formatting with payment acknowledgements.
- Enabled sales/payment/refund bridge selection in PWA document queues now that financial image encoding is connected. Close-day reports still require a dedicated renderer; unsupported documents retain browser fallback.
- No tests, compilation, dependency resolution, runtime or printer execution ran. Shared browser/native layout parity, multiline branding, schema edge cases, physical QR/receipt acceptance and installation remain final gates.


## Final sprint continuation - close-day bridge report and Unicode transport safety (source only)

- Added office-role close-day rendering for issued till-session settlement/collection bases, tenders, revenue/tax allocations, signed drawer variance, review reasons and generation-time business diagnostics. Sales and collections remain explicitly distinct; unavailable credit/folio exposure is stated.
- Enabled close-day bridge submission with immutable logo and no payment QR. Issued settled-tax totals and counted/expected/variance relationships are checked before transport.
- Standalone document transport now applies ASCII fallback before legacy byte-indexed wrapping, preventing non-ASCII text from panicking at UTF-8 boundaries. Frozen Tauri source remains unchanged.
- No tests, compilation, runtime or printer execution ran. Multiline branding/layout parity, complete source acceptance, installer/TLS and physical report/receipt/QR checks remain deferred gates.


## Final sprint continuation - financial snapshot parity corrections (source only)

- Added explicit bounded multiline handling for issued addresses and footers, preserving LF/CRLF while rejecting stray carriage returns and printer control codes. Financial and close-day layouts now preserve those business settings.
- Financial tender rendering checks issued cash tender/change reconciliation and supported payment origins. External payments remain explicitly cashier-confirmed; unknown provider origins are refused rather than rendered as success. Refund method is now required and validated.
- Updated standalone transport provenance for custom footer boundaries and ASCII-before-wrap handling. No tests, builds, runtime or hardware execution ran; renderer parity and physical acceptance remain deferred.


## Final sprint continuation - bounded recovery pagination (source only)

- Replaced unbounded device-wide evidence loading and the hidden 100-submission display cutoff with IndexedDB schema 3 indexed SUBMIT pagination, ordered by creation time/request ID across bridges for the current business/device.
- Added explicit older-submission loading with stable exclusive cursors and duplicate suppression. Recovery components remount on business/device changes so prior device observations are not reused in another scope.
- No tests, build or runtime execution ran. Final acceptance must cover legacy index upgrades, equal timestamps, page boundaries, concurrent inserts and retained old unresolved submissions.


## Final sprint continuation - retained recovery observations and export (source only)

- Read-only bridge recovery/status responses are now linked transactionally to the original submission while preserving its original response and unresolved state. Scope checks require matching business/device/bridge/origin, and late older observations cannot overwrite newer retained evidence.
- Recovery screens restore the latest linked observation after reload. API reconciliation retains its fresh local status before attempting the shared report.
- Workspace recovery export now includes paged bridge submission evidence and linked observations, excluding print tokens, snapshots and private keys. Export does not grant replay/print authority or constitute automatic restore.
- No tests, build or runtime execution ran. Final acceptance must cover response-loss/storage failure, concurrent observation writes, reload and full recovery export.


## Final sprint continuation - procurement supplier API foundation (source only)

- Added migration 036 for tenant-scoped supplier identities, active-code uniqueness, bounded contact/tax/address/terms fields and version/provenance metadata. Added dedicated online-only supplier.save with reviewed versions, permission checks, transaction locking and standard audit/idempotency/change-feed handling.
- Supplier projections join repeatable-read bootstrap and are filtered by supplier/procurement permission. No generic record replacement or Supabase mutation path was added.
- Supplier archiving/restoration is deliberately unavailable until PO/payable blockers have their authoritative tables and reviewed workflows; save refuses archive fields. Legacy open-PO/payable archive behavior was inspected for preservation.
- No migration, tests, builds or runtime execution ran. Procurement UI, PO/GRN/receiving, invoice/payable/payment/return workflows remain incomplete; offline POS remains disabled pending prerequisite verification.


## Final sprint continuation - API supplier operator workspace (source only)

- Wired API Procurement to supplier search/add/edit with reviewed supplier versions, bounded fields, explicit terms/reasons and current permission controls. API sessions no longer enter the legacy procurement view for this workspace.
- Supplier saves use the API outbox/command path and remain online-only. Pending/unknown commands block another supplier write across remounts; recovered outcomes close the stale editor and require reopening current data after rejection/conflict.
- Aligned supplier payload validation with existing UI review metadata; authoritative expected versions still come from the command envelope. Added bootstrap eligibility for procurement-only operator sessions.
- No tests, builds, migrations or runtime execution ran. PO approval/issue/receiving, GRN/payables/returns and supplier archive blockers remain upcoming procurement work.


## Final sprint continuation - purchase order draft authority (source only)

- Added migration 037 with tenant-scoped PO headers/normalized lines, supplier/stock foreign keys, immutable identity numbers, status/amount/quantity constraints and lookup indexes.
- Added online-only procurement.saveDraft with reviewed PO/supplier/stock versions, active-source checks, frozen supplier/item/package snapshots, unique stock/line identities and exact six-decimal quantity/minor-money arithmetic. Package counts remain whole and draft save never posts inventory.
- PO projections join bootstrap and permission-filtered feed. Only DRAFT can be edited; expense/asset treatments remain explicitly unavailable pending their accounting workflows rather than being converted into stock purchases.
- No migrations, tests, builds or runtime execution ran. Draft operator UI, approval/issue documents, GRN/canonical receive, payable/payment/return and archive blockers remain unfinished.


## Final sprint continuation - purchase draft operator UI (source only)

- Added API purchase-order draft list/editor with reviewed supplier/stock baselines, package/base-unit selection, whole-package counts, decimal quantity/money entry, delivery date and reasons. Issued draft totals and frozen line identities come from API projections.
- Draft commands use the normal API persistence/sync path and remain online-only. Pending/unknown outcomes block another purchase-draft write across remounts; recovered rejection/conflict requires reopening current data.
- Tightened derived base-quantity range to the bounded stock precision supported by the API/UI. No draft action receives inventory, approves an order or creates a payable.
- No tests, builds, migrations or runtime execution ran. Approval/issue/GRN/receiving, financial procurement treatments, invoice/payable/payment/return and archive workflows remain unfinished.


## Final sprint continuation - PO approval and immutable issue (source only)

- Added migration 038 with approval/issue metadata, immutable transition events, post-approval content protection and draft-only line mutation guards.
- Added online reviewed procurement.approve/issue transitions. Approval checks frozen supplier/stock revisions against active source records; issue freezes an immutable PURCHASE_ORDER document and office print job without claiming supplier delivery or receiving inventory.
- Added browser PO document rendering and procurement document/print permissions. PO snapshots retain supplier, purchase/package/base quantities, costs, dates, notes and approval identity.
- No migrations, tests, builds or runtime execution ran. Approval/issue operator controls, PO bridge layout, GRN/canonical receiving and financial procurement workflows remain unfinished.


## Final sprint continuation - PO approval/issue operator review (source only)

- Added explicit approval/issue review panels showing frozen supplier, line quantities/costs and totals. Review binds the selected PO version and requires acknowledgement/reason; pending or unknown procurement transitions block another transition across remounts.
- Issued PO documents open the existing audited document/print queue directly from Procurement. Browser printing remains available; issue explicitly does not claim supplier transmission or receipt.
- PO issue now requires configured business identity before creating immutable documents. No tests, builds, migrations or runtime execution ran. PO bridge rendering, canonical GRN receive, invoices/payables/returns and archive/recovery gates remain unfinished.


## Final sprint continuation - immutable PO bridge layout (source only)

- Added office-role PURCHASE_ORDER bridge rendering with immutable supplier contact/tax/terms, package/base quantities, frozen item costs, delivery date, notes and approval/issue identities. Quantity/package/cost/total consistency is checked before transport.
- PO logos use the shared PNG pipeline; payment QR is excluded. Typed browser/bridge contracts and document queue submission now support issued POs with existing signed claims, live checks and durable delivery evidence.
- No tests, build, migration or runtime execution ran. Browser/thermal document parity, physical printing and GRN/canonical inventory receiving remain unfinished acceptance/development work.


## Final sprint continuation - canonical receipt posting extraction (source only)

- Extracted the existing reviewed-balance check and inventory receipt posting into shared transaction primitives. Direct inventory receiving retains its policy/source validation and delegates the same physical bottle, quantity-limit, weighted valuation, stock-version and movement writes.
- The posting primitive accepts frozen purchase-unit inputs and stays inside the caller transaction, preparing GRN receiving to reuse canonical inventory semantics rather than create a parallel stock path. It is not registered as a command or independent authority boundary.
- No tests, builds, migrations or runtime execution ran. Multi-line receipt evidence/schema, GRN command/UI, partial/rejected/over-receive behavior and reconciliation still require implementation and deferred acceptance.


## Final sprint continuation - GRN evidence and multi-line posting schema (source only)

- Added migration 039 for immutable GRN headers/lines, per-PO delivery-reference uniqueness, accepted/rejected conservation and accepted-line inventory receipt links. Rejected-only lines require no stock receipt; accepted lines require linked inventory evidence.
- Extended receipt command uniqueness to preserve one direct receipt per command while permitting distinct accepted GRN lines within one atomic command. Canonical posting passes the source line identity to storage.
- PO projections now derive cumulative delivered/accepted/rejected quantities from immutable GRN lines. Permission-filtered goods-receipt projections join bootstrap.
- No migrations, tests, builds or runtime execution ran. GRN validation/command/UI, over-receive permissions, immutable documents and financial posting remain unfinished.


## Final sprint continuation - atomic canonical GRN receiving command (source only)

- Added online procurement.receive with reviewed PO/policy/location/stock/balance versions, per-delivery duplicate checks, delivered=accepted+rejected conservation, whole-package rules and permission/acknowledgement-gated over-receiving.
- Accepted lines call the shared inventory receipt primitive inside the GRN transaction; rejected-only lines post no stock. Frozen purchase costs use cumulative rounding deltas across partial receipts, preserving total cost reconciliation. Current base-unit/container identity must match purchased stock identity.
- The command creates immutable GRN/document/line evidence, linked inventory receipts, cumulative PO status/version/events and an office print job atomically. It does not fabricate an invoice, supplier payment or provider success.
- No tests, builds, migrations or runtime execution ran. GRN operator UI/renderers, purchase accrual/payable finance, returns, concurrency/replay/rollback and physical acceptance remain unfinished.

### Procurement GRN operator workflow (source only; verification deferred)

- Added API-only purchase delivery review for issued/partially received POs, with frozen PO/catalog/balance revisions, stable GRN identity, delivered/accepted/rejected quantities, rejection reasons, bottle physical quantities, receiving location and delivery reference.
- Explicit receiving acknowledgement and permission-bound over-receive review precede the normal command/outbox submission. Pending/unknown procurement commands block additional receiving and PO transitions; recovered terminal outcomes close the stale receiving editor.
- Added immutable GOODS_RECEIPT browser rendering and the existing audited document/print queue to confirmed GRNs. No supplier invoice, payable or payment is implied.
- No tests, builds, migrations, runtime, printer or deployment checks performed; all remain deferred. Bridge GRN rendering, supplier invoice/payment/return workflows and production gates remain open.

### GRN Print Bridge layout (source only; verification deferred)

- Added GOODS_RECEIPT typed bridge submission and office-route renderer with immutable identity/schema/currency checks, unique line identities, delivered/accepted/rejected and package/base conservation, accepted-value control total, rejection and operator provenance. Partial-delivery cost remains the API cumulative rounding delta.
- Uses existing bounded logo/footer pipeline, signed claim validation and durable delivery journal. No QR payment prompt or supplier invoice/payment assertion. Browser fallback remains available.
- Compilation, tests, actual delivery, hardware layouts and end-to-end bridge acceptance remain unverified and deferred.

### Partial receiving cost/range hardening (source only)

- Bound cumulative accepted, delivered and rejected quantities so repeated over-receiving cannot create an unreadable/out-of-range PO projection.
- Freeze previous and cumulative accepted quantities in each immutable GRN document line. The bridge now verifies the exact cumulative minor-money rounding delta instead of trusting only the accepted-value control total. Browser GRNs display that cost basis.
- Client over-receive review compares six-decimal scaled quantities. Runtime/compilation/tests remain deferred; these edits do not constitute verified receiving or printer acceptance.

### Received-uninvoiced liability (source only; migration not applied)

- Migration 040 adds tenant-scoped supplier payables, one per nonzero-value GRN, invoice reference uniqueness and reviewed versions.
- Receiving atomically creates its payable and immutable balanced inventory debit/AP credit journal at frozen accepted PO cost, including line basis and explicit no-input-tax-claim treatment. Zero-value/rejected-only deliveries create no monetary liability/journal.
- Payable bootstrap/change records use procurement visibility. No historical liabilities are fabricated or silently backfilled; existing GRNs require reconciliation before cutover.
- Invoice matching, settlement and supplier returns remain incomplete. Schema migration, compilation, tests and runtime execution remain deferred.

### Supplier invoice matching API (source only)

- Registered online-only `supplierPayable.matchInvoice` under procurement.manage with reviewed payable version, business procurement serialization, duplicate supplier invoice protection and exact accepted-GRN line matching.
- Requires invoice/date/due-date/reason and complete line quantities, frozen unit costs and cumulative rounded line amounts; mismatches require a separate reviewed correction. Captures invoice evidence/provenance and transitions RECEIVED_UNINVOICED to MATCHED_UNPAID. No duplicate inventory/liability journal or payment is posted.
- Migration 041 freezes receiving liability identity and matched invoice evidence, requires monotonically reviewed payable versions and constrains invoice/payment status consistency. Operator UI, settlement and returns/corrections remain outstanding. Tests/builds/migrations/runtime deferred.

### PWA supplier invoice review (source only)

- Added API procurement payables list with outstanding values, matched invoice reference/due date and explicit GRN-based invoice review. Operator enters billed quantities, unit costs, line amounts, total, dates and review reason against frozen accepted evidence.
- Submits supplierPayable.matchInvoice through normal API command/outbox permission and online boundaries with pinned payable version. Pending/unknown procurement or invoice actions block further receiving/matching/PO changes; original terminal recovery closes stale invoice review.
- No payment is implied. Tests/builds/runtime/migrations remain deferred. Settlement and supplier returns remain unfinished.

### Manual supplier settlement API (source only)

- Migration 042 and online procurement.pay command add immutable supplier payments, method/reference deduplication, actual payment time, reviewed account/payable versions, explicit actual-payment confirmation and outstanding-balance bounds.
- Atomically transitions matched liabilities through PARTIALLY_PAID/PAID and posts AP debit/tender credit; emits payment/payable/journal projections. Bank/M-Pesa are manually confirmed facts, never provider success. Cash requires explicit petty-cash-outside-POS confirmation, preserving native behavior without silently consuming till cash.
- Settlement UI, documents/reversals and supplier returns remain outstanding. All migrations, tests/builds and runtime checks remain deferred.

### PWA supplier settlement review (source only)

- Added matched/partially paid invoice settlement entry with frozen payable/account revisions, stable payment identity, actual paid time/reference, outstanding-bound amount and explicit money-already-paid acknowledgement.
- Cash additionally requires petty cash outside POS confirmation. UI states that recording does not initiate a bank/M-Pesa transfer. Normal API/outbox flow enforces procurement.pay and online submission; original uncertain payment recovery blocks replacement actions.
- Displays immutable supplier payment history. Settlement documents, reversal/return workflows and physical acceptance remain open; tests/builds/migrations/runtime deferred.

### Supplier payment vouchers (source only)

- Supplier payment now atomically issues an immutable office voucher with original supplier identity, invoice/payment/account facts, actual paid time, operator provenance and before/after payable control totals. Migration 043 links payment evidence to its document; historical vouchers are not fabricated.
- Added browser voucher rendering and existing audited print queue access from supplier payment history. Explicit manual external confirmation or petty-cash-outside-POS wording; payment QR suppressed.
- Dedicated bridge voucher layout remains outstanding; browser fallback supported in source. All migrations/tests/builds/runtime/physical checks remain deferred.

- Follow-up: added typed office Print Bridge voucher layout with strict payment identity, manual origin/method, amount and payable-balance reconciliation, actual-time/operator provenance and QR suppression. Browser and bridge layouts both describe payment as manually confirmed. End-to-end printer acceptance remains pending.

### Supplier physical return API foundation (source only; migration unapplied)

- Added tenant-scoped return draft/line/event schema linked to original GRN lines and inventory receipts, with immutable line/evidence guards and explicit DRAFT -> APPROVED -> DISPATCHED lifecycle.
- Added online `supplierReturn.create`, `supplierReturn.approve` and `supplierReturn.dispatch` operations. Drafts require accepted original lines, reviewed locations/balances, quantities within accepted GRN less prior approved/dispatched returns, package and bottle conservation, condition and reasons.
- Dispatch requires reviewed current stock, sufficient location/physical bottle balances, actual physical dispatch confirmation and named supplier/driver acknowledgement. It posts negative SUPPLIER_RETURN_OUT movements and an estimated supplier-credit-pending/inventory journal at current stock cost. It does not mislabel the event as a receipt reversal or claim a credit note/payment was received.
- Bootstrap and permission-filtered projections are wired. Added a PWA create/approve/cancel/dispatch review and browser return-note printing. Original accepted receipt rows and inventory receipt IDs are tenant-scoped foreign keys; approval reserves quantities before physical dispatch. Approval rechecks other reserved returns against original accepted quantities. Draft cancellation is an audited online DRAFT-only transition and does not touch stock. Tests/builds/migrations/runtime/hardware checks remain deferred.
- Registered online `supplierReturn.cancel`, which requires the current draft version and a reason, records the immutable CANCEL event, and retains the cancelled draft lines as evidence. The PWA presents a separate cancellation review and confirmation; approved or dispatched returns cannot use this action.

### Supplier credit-note matching API (source only; migration unapplied)

- Added online `supplierReturn.matchCreditNote` for dispatched returns, with versioned return/payable checks, duplicate supplier reference protection, bounded note date/amount and immutable matching evidence. Credit amounts cannot exceed the remaining dispatch estimate; variances require accounting review.
- Credit matching applies available value against the original GRN payable and retains excess as an unapplied supplier-credit asset. It reclassifies the estimated pending credit journal and updates a return-credit lifecycle without rewriting the physical stock movement.
- Payable projections/payment bounds now account for applied supplier credits. Supplier credit-note projections are permission-filtered. Applying an unused supplier credit to another payable/refund remains open. Migration 045 also expands the guarded return lifecycle to partial and complete credit-note matching.

- Follow-up: added PWA return credit-note review with unique reference/date/amount, frozen return/payable versions and explicit comparison acknowledgement. It shows applied and unapplied supplier credit separately; unresolved procurement outcomes block further receiving, matching, returns and PO changes.

### Applying unapplied supplier credit (source only; migration unapplied)

- Migration 046 adds immutable same-supplier credit application evidence with tenant-scoped credit/payable foreign keys and source command uniqueness.
- Added online `supplierCredit.apply`: reviewed credit-balance and payable versions, available-credit and due-balance bounds, same-supplier validation, immutable allocation row and balanced AP debit/supplier-credit asset credit journal.
- Credit note and application projections expose remaining available balances through the API change feed. PWA procurement UI allows an operator to allocate excess supplier credit to another payable for that supplier; it does not initiate a cash refund.
- Tests, migration execution, builds and runtime remain deferred. Supplier-credit cash refund and broader finance close/report integration remain open.

### Supplier return Print Bridge layout (source only)

- Added typed office routing for SUPPLIER_RETURN_NOTE with return/supplier/GRN identities, unique lines, package/base-unit conservation, condition, line and total estimated-credit reconciliation, dispatch/acknowledgement provenance and bounded business logo/footer.
- The layout states physical return evidence only and suppresses payment QR. Browser fallback remains available. Bridge compilation, print transport, target-printer layout and physical acknowledgement remain unverified/deferred.

### Supplier payable credit settlement lifecycle (source only; migration unapplied)

- Added migration 047 with an explicit `SETTLED` payable state when matched invoice liability is fully cleared by supplier credit, including a mixed cash-payment/credit settlement. Uninvoiced payables remain uninvoiced until invoice evidence is reviewed.
- Supplier return credit matching and credit application now update payable status and version alongside credited balance. Invoice matching and later payments derive the status from paid plus credited amounts, so a fully settled payable is no longer presented as open for payment.
- Supplier payment vouchers now snapshot and display supplier credit applied when the cash/external payment was recorded; remaining payable reconciles against liability less both paid and credited totals. Print Bridge validation retains compatibility with older version-1 vouchers that omit the credit field.
- Supplier credit-note matching now emits the `supplierCredits` balance projection in the same command result, allowing the change feed to expose newly available credit without waiting for bootstrap/reload.
- Source-only review; no tests, lint, builds or migrations were run, following the instruction to defer verification until the end of the sprint.

### Print Bridge local pairing administration (source only)

- Added a local-only interactive CLI to approve an enrolled PWA public identity into the installer-owned bridge configuration and to revoke an existing pairing. Approval/revocation require device-specific typed confirmation and an operator reason; approval explicitly instructs the operator to compare the identity with the authenticated ServOS device record.
- Configuration replacement is atomic. Revocation retains the pairing record plus RFC3339 time/reason, and the Rust configuration loader rejects active/revoked metadata inconsistencies. The worker's existing per-request reload makes revocation effective for subsequent requests; in-flight print delivery remains subject to uncertainty reconciliation.
- This adds source for pairing administration only. Service installation, execution, ACL verification, crypto interoperability, and browser/printer acceptance remain unverified. No tests, lint, or builds were run.

### API receipt image snapshots and sales QR (source only; migration unapplied)

- Migration 048 adds bounded normalized PNG fields for the business logo and optional payment QR, with database checks for the data URL signature, size and enabled-image relationship.
- API business settings validation retains images when older callers omit the new fields. Bootstrap/change-feed projections and receipt-setting snapshots include them, so newly issued documents retain their immutable image data.
- The API PWA settings editor normalizes logo uploads to bounded PNG and validates Till QR structure using the existing hard-edge QR pipeline. QR printing requires explicit enablement and is restricted to sales receipts in browser and bridge renderers; copy states that it does not confirm payment.
- The Print Bridge places the One app caption before the QR so the QR is immediately before the footer. Financial receipt tax-total reconciliation now checks overflow.
- Office renderers now share strict bounded PNG snapshot validation for logos; an enabled sales QR missing from its immutable snapshot fails closed. Browser snapshots use the same 240 KB data URL bound.
- Source only. Migration application, tests, lint, builds, API/PostgreSQL integration, snapshot recovery, and physical printer acceptance remain deferred.

### Dedicated Print Bridge CI (workflow source only)

- Added a dedicated Linux and Windows workflow matrix for the standalone bridge and printer transport. Each OS runs formatting, Clippy, unit tests and release builds for both Rust packages and uploads a separate evidence artifact.
- The Windows matrix now also compiles the optional `windows-service` SCM wrapper with Clippy and release-build steps. Workflow execution remains deferred.
- Added the matrix result and both required artifacts to the same-commit CI evidence gate and release-candidate eligibility. Updated the sprint's required CI matrix accordingly.
- Workflow execution is deferred; current-commit CI status is not claimed.

### Print Bridge Windows service lifecycle (source only)

- Added a Windows SCM wrapper that launches the loopback HTTPS host exactly once, runs under the configured LocalService account, and forwards SCM stop/shutdown through a private stdin token. The host stops accepting new requests and drains admitted work before closing its worker; forced termination is treated as an uncertain print outcome. There is no automatic restart/replay.
- Added a manual-start install/uninstall script. It keeps business-specific approved pairing and TLS material outside the release bundle, applies restrictive ProgramData ACLs, preserves journal/pairing/TLS data on unregister, and does not start the service or install a TLS trust root.
- Added bounded code-only service lifecycle logging. This is not deployment evidence: wrapper compilation, installer execution, account/printer ACL verification, localhost certificate trust, browser service calls, printer delivery and restart recovery remain deferred and unverified.

### Print Bridge shared outcome mapping (source only)

- API print reports now preserve `FAILED`, `SENT_TO_SPOOLER` and `DELIVERY_UNCERTAIN` as separate shared states. Spooler acceptance remains distinct from operator-confirmed paper delivery.
- PWA bridge submission and reconciliation report the exact durable local terminal outcome. Every durable `FAILED` local attempt is recognized as a known pre-output failure regardless of attempt number; interrupted in-flight sends remain uncertain.
- Browser preparation failures use the same shared `FAILED` state with explicit `transportStarted: false`. Existing queued `PREPARATION_FAILED` command payloads remain accepted for recovery compatibility.
- No tests, lint, builds or runtime checks were run; verification remains deferred.

### API customer credit account terms (source only; migration unapplied)

- Added migration 050 for tenant-scoped named-customer credit terms and append-only, command-linked term-review evidence. The API command uses expected account versions, `credit.manage`, integer minor-unit limits, 0–365 day terms, and an explicit reason; projections are permission-filtered and included in bootstrap/change feed.
- Added an API-only Finance Controls account view for configuring account terms, showing derived balance, and reading a bounded statement. Closing requires a zero derived balance. Follow-up slices now provide API settlement and write-off paths.
- Native behavior was inspected in `src-tauri/src/customer_credit.rs`. This slice does not port ledger charge, payments, FIFO allocation, reconciliation, write-off, POS order completion, till cash, M-Pesa, or journal behavior.
- No tests, lint, builds, migrations or runtime checks were run. Migration and handler behavior remain unverified; the complete credit ledger and API POS charge path are still required before credit may be used operationally.

### Customer credit ledger schema and read projection (source only; migration unapplied)

- Migration 051 adds tenant-scoped immutable customer-credit entries with signed integer-minor balance deltas, positive amounts, source command identity, order/tender/reversal links and FIFO allocation snapshots. It adds named customer identity and credited amount columns to POS orders while constraining total paid plus credited against the order total.
- API bootstrap exposes derived customer balances and a bounded recent statement projection with running balances. Finance Controls labels the statement read-only; it does not create or edit ledger entries.
- API terms changes and future ledger commands serialize on a shared per-customer advisory lock; closing remains blocked whenever the derived ledger balance is nonzero.
- Follow-up source adds versioned API/PWA customer assignment on order open or before settlement, and the canonical online `credit.charge` command for a FIRED order with no held lines. It serializes on the customer account, requires the exact remaining order amount to fit the active credit limit, posts an immutable ledger entry plus balanced AR/revenue/tax journal, updates order completion, and issues an immutable customer credit invoice with a browser-print queue job.
- The existing financial journal tables now admit customer-credit charge/settlement/write-off/reversal sources and AR/bad-debt accounts, with deferred balance/source validation and exact journal reversal checks. Migration 052 retains existing procurement journal source/account types and runs their existing balanced-journal validation path. Charge posting supports an over-limit exception only for an actor with `credit.override_limit`, an explicit confirmation and a reason. Approval step-up and full statement pagination remain outstanding.
- No tests, lint, builds, migrations, browser runtime, printing or PostgreSQL checks were run. All new migrations and ledger/journal behavior remain unverified and must be reviewed during the deferred sprint verification phase.

### Customer credit settlement API and acknowledgement (source only; migrations unapplied)

- Migration 053 adds immutable payment-account/till/received-time evidence to settlement entries, a globally coordinated external-reference lock shared with POS payments, and a `CREDIT_COLLECTION` till movement kind.
- Added online `credit.settle` for named accounts. It checks reviewed account, tender and till versions; blocks closed accounts and overpayments; requires explicit cash receipt or manual external-funds confirmation; requires exact M-Pesa/card received amount and actual timestamp; and allocates the settlement FIFO across open credit charges.
- Settlement atomically writes the immutable ledger entry, AR/tender journal, customer/tender/till projections, cash drawer event where applicable, immutable customer payment acknowledgement and office print job. No external transfer is initiated or provider success implied.
- Online `credit.writeOff` now requires the dedicated permission, current account version, positive amount within the balance, and a reason. It allocates FIFO across original charges, posts bad-debt expense against AR, and issues an immutable write-off notice. The PWA requires operator acknowledgement that no cash is being paid.
- Online `credit.reverse` can reverse an original charge, settlement or write-off once. It checks account and entry revisions, blocks reversal of allocated charges, exactly inverts the original journal, and writes an inverse ledger entry with a reason and immutable notice. Settlement returns require an open cash till and physical return confirmation, or an operator-confirmed external return reference; cash returns debit the drawer and are reconciled in till close-day controls. This command does not initiate or verify external refunds.
- Till close now waits for unresolved credit settlements and reversals and reconciles cash customer-credit collections and cash returns separately from POS sale receipts. Close-day evidence includes till-attributed credit collections and their net reversal journal controls.
- API Finance Controls exposes settlement and reversal review forms, reason-bound write-off review and a read-only statement. Reconciliation/discrepancy workflows, approval step-up and full statement pagination remain outstanding. Customer-credit bridge document layouts and till-attributed credit-sale accrual are now present in source, with verification deferred.
- The standalone close-day renderer includes immutable customer-credit tender rows and cash collection/return amounts, and now also renders the separate accrued charge/reversal and revenue/tax reconciliation section. Older version-1 reports without the accrual field remain renderable.
- Customer account projections also expose current, 1–30, 31–60, 61–90 and over-90-day aging buckets derived from unreversed FIFO allocations; the projection flags a mismatch when bucket totals do not equal the ledger balance. This remains source-only and requires PostgreSQL reconciliation coverage.
- These customer-credit additions are source-only. Write-off, settlement and charge reversal, accounting concurrency, cash drawer reconciliation, external return-reference uniqueness, projection convergence, and physical documents remain unverified. Immutable reconciliation/discrepancy commands are now present in source; manager approval step-up and complete statement pagination remain outstanding. Tests, lint, builds, migrations, PostgreSQL, browser, print and runtime checks remain deferred to the end-of-sprint verification phase.

### Customer-credit Print Bridge layouts (source only)

- Added strict office-role renderers for customer payment acknowledgements, write-off notices and reversal notices, and a receipt-role renderer for immutable customer credit invoices. Invoice source lines reconcile against the original order value, while the partial amount charged to the customer account and its allocated tax reconcile independently. Customer payment acknowledgements preserve cashier-confirmed/manual wording.
- Registered all four document types in Rust request validation and renderer dispatch and enabled the existing PWA bridge submission action for them. The customer credit invoice suppresses payment QR under the current sales-receipt-only QR policy; browser printing remains available.
- This closes the source-layout gap only. Tests, formatting, lint, builds, PostgreSQL, bridge execution, physical layouts and hardware acceptance remain deferred and unverified.

### Till-attributed customer-credit sales accrual (source only)

- Close-day generation now identifies customer-credit charges and their charge reversals through the originating order's till, requires exactly one linked accounting journal per entry, and reconciles net accounts receivable against net sales revenue, VAT and levy.
- The immutable report separates charged-to-account, reversed, and net accrued sales from tender and cash collection. Browser and bridge layouts label these figures as accruals, not cash received; existing reports without the field retain their historical rendering. Unresolved-command diagnostics now include credit charges.
- No tests, lint, builds, migrations, PostgreSQL or renderer execution were run. Reconciliation and document behavior remain unverified.

### Customer-credit statement reconciliation and discrepancy evidence (source only; migration unapplied)

- Added migration 054 for immutable account-to-statement comparisons, append-only open discrepancies and one immutable resolution per discrepancy. The ledger is never edited by these workflows.
- Added online `credit.reconcile`, which serializes with customer ledger commands, checks the reviewed account version, snapshots ledger and statement balances, and opens a discrepancy only for a nonzero difference. Added `credit.discrepancy.resolve`; manager-only dispositions require `credit.manage` or `credit.write_off` and remain evidence decisions, not ledger postings.
- Added permission-filtered bootstrap projections and connected the supported API PWA account screen to comparison, open-exception review, resolution and history. The reconciliation command now pins the account revision in the PWA dependency resolver.
- No tests, builds, migrations, PostgreSQL or browser checks were run. Statement pagination and manager step-up remain open; the feature is source-only and unverified.

### Customer-credit statement pagination (source only; migration unapplied)

- Added migration 055 with a tenant/customer-scoped immutable entry sequence, backfilled in historical posting order. The authenticated API now returns bounded 100-entry statement pages with an opaque high-water/continuation cursor and running balances over the same stable snapshot.
- The API PWA statement now loads and appends pages, refreshes to the latest high-water, and uses paged rows for ledger review/reversal selection. POS now reads the account's authoritative projected balance instead of summing the bootstrap's bounded recent entries. Credit-only staff are admitted by the bootstrap route.
- No tests, builds, migrations, API or browser checks were run. Cursor durability across migration and page reads remains source-only and unverified; approval step-up remains open.

### API manager approvals (source only; migration unapplied)

- Added migration 056 for hashed, five-minute, single-use approvals bound to recipient staff, action and exact target. Issuance requires an active Admin/Manager and consumption plus audit evidence are transactional with the approved command.
- Registered API approval issuance and wired it to API-mode staff administration. Credit limit exceptions and order discounts/comps require a matching token when the operator lacks the elevated permission; customer-credit write-off accepts delegated approval. POS now requests that token for an over-limit customer account charge.
- Extended delegated approval to order void, full payment reversal, customer-credit reversal, procurement over-receipt and till-variance review. Tokens are omitted from API command outcomes and persisted command request JSON, removed from the local issuance command after terminal acknowledgement, and redacted in Activity details and recovery export.
- Approval metadata is filtered to staff administrators/auditors and the named recipient in the ordered change feed.
- No tests, builds, migration execution, API, authorization abuse-case or browser checks were run. Transaction rollback/replay and the whole approval slice remain unverified.

### API staff provisioning and role management (source only; migration unapplied)

- Added migration 057 for versioned API staff lifecycle evidence and backfilled existing API profiles into employee entity versions. The PWA bootstrap now projects API staff profiles and filters them by staff visibility.
- Added transactional API staff create/update/deactivate commands. Creation hashes an initial password with the API scrypt scheme and requires change at first login; Admin cannot be granted through routine staff management. Role permission ceilings are enforced, custom grants are allowlisted and bounded by the issuing actor's permissions. Deactivation revokes sessions and enrolled devices and preserves last-Admin protection.
- The API Staff screen now creates API sign-ins, changes API staff roles and deactivates profiles, and selects named staff as approval recipients. API profile operations are online-only. Command request JSON and the local terminal queue redact passwords/tokens after terminal acknowledgement; the raw password is never part of a command result.
- API enrolled devices are now included in the permission-filtered bootstrap; API staff with `devices.manage` can revoke another device through a transactional command, which revokes its sessions and updates the ordered projection. Deactivating API staff also revokes their devices and publishes those device revisions.
- No tests, migration execution, password-lifecycle, authorization, session/device revocation or browser checks were run. Device enrollment/revocation behavior and the entire staff lifecycle remain unverified.

### API device lifecycle feed and audit evidence (source only; migration unapplied)

- API device enrollment now creates an `enrolledDevices` entity version and ordered change-feed entry in the same transaction as first enrollment. Re-authenticating an already enrolled device does not emit a duplicate device-created record.
- Added migration 058 for append-only enrollment/revocation evidence with actor, reason, device revision and before/after state. Explicit device revocation and staff deactivation write revocation evidence transactionally; staff deactivation publishes all affected device revisions in its command change.
- Enrollment now locks and checks the active staff profile inside its transaction, serializing device enrollment against staff deactivation. The API Staff screen lists enrolled devices from the filtered API bootstrap and permits online revocation by a different device.
- Last-seen and command-sequence fields are not backed by API telemetry yet; API device rows now show these as untracked rather than implying a zero sequence or a never-seen device.
- No migration, API, authorization, change-feed/reload, session invalidation, browser or database verification was run. Device lifecycle and staff-management remain source-only and unverified.

### API own-session review and revocation (source only; migration unapplied)

- Added migration 059 for append-only session revocation evidence. Authenticated staff can list only their own latest 100 sessions and revoke another session belonging to the same staff profile; the current session must use Sign out and cannot be revoked through this endpoint.
- Added API endpoints and PWA session dialog with session/device IDs, created/expiry/revocation state and explicit revocation confirmation. Session listing is read-only; access tokens remain only in the in-memory auth closure, and no refresh credential is persisted.
- Password changes now compare the current credential inside the database transaction, retain the initiating session, revoke every other active staff session, and append revocation evidence with `PASSWORD_CHANGED` cause.
- Session expiry/rotation behavior is tracked in the later rotating API access/refresh section below. No tests, migration, API, concurrency, reload or browser checks were run.

### Initial-admin setup secret lifecycle (source only)

- On startup, the API checks whether staff setup has already completed and removes `INITIAL_ADMIN_SETUP_SECRET` from its process environment when an Admin profile exists. Successful one-time setup also removes it immediately; the database's existing one-Admin bootstrap fence remains authoritative after restarts.
- This is source behavior only. Deployment secret-store cleanup, startup behavior, concurrent setup and restart acceptance remain unverified.

### Rotating API access/refresh sessions (source only; migrations unapplied)

- Migration 060 adds hashed access-token rows, refresh families and hashed refresh tokens; existing access sessions are copied into the new token table so their current expiry remains valid. Migration 061 links each consumed refresh token to exactly one successor.
- API login issues a 15-minute bearer access token and a 30-day HttpOnly SameSite refresh cookie bounded by a 90-day family. A retry within 30 seconds re-derives the same successor and issues a fresh access token, preventing response-loss retries from creating competing child tokens. Reuse after the recovery window revokes the family and session and appends replay evidence; session/device/staff revocation also revokes refresh families.
- Refresh cookies are named and path-scoped to their session ID, and the rotation route binds the presented token to that same session. This keeps simultaneous staff sign-ins on a shared terminal from overwriting or crossing refresh credentials.
- The PWA keeps access tokens in memory, sends the refresh cookie only with credentialed API requests, serializes refresh calls across tabs with Web Locks, and retries one 401 request with the refreshed bearer. SSE authentication also refreshes once. No refresh token is written to IndexedDB or localStorage.
- This source has not been tested or run. Migrations 060-061, cookie/CORS/HTTPS deployment, cross-tab behavior, refresh replay/retry, expiry, logout, session/password/device revocation, SSE reconnect and browser acceptance remain unverified.

### API bootstrap paging and atomic activation (source only; verification deferred, 2026-10-08)

- Migration 062 stores ten-minute bootstrap manifests and ordered projection rows. Snapshot access is bound to business, staff, enrolled device, session and a hash of current permissions; creation removes expired snapshots and bounds retained snapshots per session.
- API bootstrap protocol v2 returns deterministic collection counts, fixed page boundaries, page SHA-256 values and a manifest hash, with authenticated manifest-resume and page routes. The records originate from a repeatable-read PostgreSQL snapshot at the recorded high-water cursor.
- IndexedDB v5 stores a resumable temporary page set. The PWA validates the manifest and each page, rereads and rehashes staged pages after interruption, validates collection totals, protects unresolved commands and cursor monotonicity, then atomically swaps the projection and cursor. The API browser fixture now follows protocol v2; it was updated but not run.
- No migration, tests, lint, build, API/PostgreSQL execution or browser acceptance ran for this slice. Reload resume, response loss, storage failure, authorization changes during transfer and large snapshots remain unverified.

### Phase 0 local lint/format repair (2026-10-08; historical checkpoint, tests deferred)

- `npm run lint` found `BusinessDocumentRenderer.tsx` rendering an `unknown` tax-reversal value as a React child. The conditional now converts the value to a boolean before rendering; the follow-up `npm run lint` passed.
- Ran `cargo fmt` for `apps/print-bridge` and `crates/servos-printer-transport`; both corresponding `cargo fmt --check` commands passed.
- No test suite, build, migration, API/PostgreSQL runtime, or browser suite was run. Local `HEAD` was `c624460`, one commit ahead of `origin/reset/vps-platform` at `a0684e2`; the render fix is uncommitted. The latest public run available was #274 on older commit `871f542`, whose frontend, API/PostgreSQL, browser preview/production, and both bridge jobs failed. Current-head CI remains unknown.

### Phase 0 lint repair and generated-file cleanup (2026-10-08; tests deferred)

- Current local `HEAD` and `origin/reset/vps-platform` are both `5e380e888379126dec98ffd313a1a6314fbf591c`; the branch is 167 commits ahead of `main`. Local changes are limited to the CI diagnostic condition and these sprint checkpoint documents.
- The renderer and Print Bridge source fixes pass `npm run lint`, `cargo fmt -- --check` for both Rust manifests, strict all-target Clippy for both crates, and Windows-service Clippy. These checks ran against source committed at `c8cd45c`; subsequent commits through `5e380e8` changed documentation, ignore rules, generated outputs and Rust workflow locking only.
- Generated-file policy is now explicit: root `.gitignore` ignores every Rust `target/` directory; 1,212 `apps/print-bridge/target/` entries have been removed from Git while the local cache remains on disk; all four Cargo lockfiles remain tracked.
- The Print Bridge workflow now passes `--locked` to both crates' Clippy, test and release-build commands, including the optional Windows service. `cargo metadata --locked --no-deps` passed for each manifest, and strict Clippy passed with `--locked` for both all-target crates and the Windows-service binary. The test commands were not run locally.
- Public Actions run [#282](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37696734473) completed on `5e380e8` with overall failure. Frontend failed at `npm test`; API/PostgreSQL failed at its test command. Preview and production browser suites, both Print Bridge jobs, desktop-shell, native-domain, both cloud protocol jobs and evidence-summary passed. The dedicated real PWA/API/PostgreSQL browser acceptance step was skipped after the API test failure; release-candidate was skipped because this is not `main`. GitHub returned 403 for job logs and 401 for artifact downloads without authentication, so the test-level failure details are unavailable.
- The API job now has a local workflow change that attempts the real browser/API/PostgreSQL acceptance after the API test step fails, as long as its prerequisites ran and the job was not cancelled. This diagnostic change is not yet verified by a hosted run. No local test suite, release build, migration, PostgreSQL runtime, or browser suite was run during this checkpoint; local tests remain deferred to the end of the sprint. Phase 0 remains open until the frontend/API failures are diagnosed and the full same-commit matrix passes.

### Phase 1 staff lifecycle hardening (2026-10-08; tests deferred)

- The current local branch is at `7121a7238b380e89ace447fc80df9cf186a5a139`, one commit ahead of `origin/reset/vps-platform` at `76c5e7ad9b99e781b4cd2ea505aac0b218fe812e`; the working tree has two checkpoint documents and three PWA/API source files modified.
- Static review found a last-Admin write-skew race: concurrent role changes or deactivations against different Admin profiles could both pass the active-Admin count before either transaction committed.
- `staff.update` and `staff.deactivate` now acquire the same transaction-scoped advisory lock keyed by business before reading the target profile and checking the Admin set. This serializes those lifecycle changes and lets the later transaction observe the first transaction's result.
- Device enrollment challenge issuance previously counted and inserted in separate transactions, so parallel requests could exceed the hourly cap. Count and insert now run under one staff-scoped transaction advisory lock.
- Password login treated any non-null `locked_until` as permanent. Login now recognizes expiry, resets the account failure counter after an expired lock, and avoids extending an active account lock for attempts made during it. Known and unknown usernames perform one password-hash verification via the real or dummy credential.
- API devices are owned by one staff profile, but the browser previously reused one device identity across the whole business. The IndexedDB registry now keeps staff-scoped API identities while retaining the legacy business identity; sign-in falls back to a new staff identity only for the server's explicit other-owner collision response. Revoked IDs and key mismatches remain errors.
- Reload now resumes API authentication using only a non-secret session UUID stored in localStorage plus the existing session-scoped HttpOnly refresh cookie. The bearer remains in memory, the PWA rechecks its profile and exact device binding, and a missing bound private key requires sign-in again. Reload, revocation and cookie behavior remain unverified.
- Source change is untested by user direction. Phase 1 exit gates remain open; Phase 0's hosted frontend/API failures also remain unresolved and unpassed.

### Phase 2 bootstrap authorization hardening (source only; tests deferred)

- The PWA now keys its cached API projection policy to the current permission set. If staff authorization changes, it hides the prior projection, resolves saved API commands under the current permissions, and rebuilds from a newly filtered catalog snapshot before showing records. Snapshot, permission-revocation, and storage recovery acceptance remain unverified.

### Phase 3 catalog archive and restore source continuation (2026-10-08; tests deferred)

- At continuation start, local `HEAD` and `origin/reset/vps-platform` were both `2508b2072476588a9ed4351ce0c5c73db8f0e255`. Current source and checkpoint edits are not yet committed.
- Added online-only `product.archive` / `product.reactivate`, `stockItem.archive` / `stockItem.reactivate`, and `stockLocation.archive` / `stockLocation.reactivate` handlers. Every transition requires the current expected entity version and an operator reason and writes the next business entity version in the same PostgreSQL transaction.
- Product archive refuses open draft order lines. Stock archive refuses nonzero balances including sealed/open bottle state, active direct/recipe/modifier consumption, open purchase orders, and draft/approved supplier returns. Location archive refuses balances, active outlet defaults, open orders, and draft/approved returns. Shared catalog, procurement and till-policy transaction locks serialize these blockers with catalog, receiving/procurement, order-opening and outlet configuration writes.
- Restore checks duplicate active codes/barcodes and prevents reactivating products whose stock or outlet references remain archived. Bootstrap now includes archived master tombstones, and archive/restore change-feed entries carry the complete current master projection so recovery survives reload.
- Catalog UI now requests an archive/restore reason and restricts restore controls by permission. PWA command routing admits the six online-only operations; stock-location commands honor either catalog-management or inventory-adjust permission, matching the workspace controls. Offline-grant permission discovery now respects command `permissionAny`.
- Location saves no longer clear `archived_at` implicitly; edits to archived products, stock items or locations are rejected until explicit restore.
- `npm run lint` (TypeScript), `node --check` for `catalog-commands.mjs`, `postgres-store.mjs`, and `server.mjs`, and `git diff --check` passed. No tests, database migrations, API/PostgreSQL runtime, browser execution or production acceptance ran. Catalog archive/restore and all sprint gates remain unverified.

### Phase 10 bounded offline cash POS source foundation (2026-10-08; tests deferred)

- At continuation start, local `HEAD` and `origin/reset/vps-platform` were `2dcf90dd36b95d6676da93de38190ed81e77f1a7`. Source and this checkpoint are local worktree changes.
- Added the API-only `order.offlineCashSale` handler. It runs existing order creation, item pricing, inventory fire and one full CASH tender inside one PostgreSQL transaction and correlates all domain events/documents to the durable parent command ID. The command requires `pos.sell`, `order.fire` and `payment.record`, an owned open till, an active cash account, a positive sale total, expected versions and reviewed stock-balance revisions. Only counter/takeaway orders are supported; kitchen/bar preparation lines are rejected and rolled back.
- API grant issuance now evaluates each command's complete permission set. A cash-sale grant must authorize only `order.offlineCashSale`, one command, and at most 30 minutes. Default grants omit this operation. Rejected/conflicted granted commands spend quota; command/grant consumption is idempotent across response loss.
- IndexedDB grant policy admits the composite operation. The PWA POS displays an authorization step, prepares the cash sale while connected from the current outlet, till, cash account, settings and stock projection, then queues exactly one order while disconnected. It labels the sale pending until the API confirms after reconnect, creates no local authoritative payment/receipt, and instructs staff to reconcile drawer and stock if the API rejects/conflicts.
- `npm run lint` (`tsc --noEmit`), `node --check` for `offline-pos-commands.mjs`, `command-kernel.mjs`, `postgres-store.mjs` and `server.mjs`, and `git diff --check` passed. No tests were run, per the user's instruction to defer tests. Real PostgreSQL execution, offline/restart/reconnect and response-loss behavior, stock race/revision rejection, printer behavior and a physical operating-day pilot remain unverified. This is a source foundation only; Phase 10 and earlier exit gates remain open.

### Phase 11 PMS and Phase 12 Finance/Assets source continuation (2026-10-08; tests deferred)

- At continuation, local `HEAD` was `a1775472b40997710dc876a4616be4d5d3725ca9`; the current room-command and Finance/Assets UI edits are local worktree changes.
- PMS source includes room types, room/rate create and edit, API availability lookup, reservations and modification/cancellation/no-show/walk-in, check-in/stays/extensions/moves, folios, payments, checkout evidence, housekeeping, maintenance and immutable documents. Booking and stay changes retain transactional locks and version checks. The PWA availability result is a search hint; the API remains the booking authority.
- Finance/Assets source adds migration 065, staged expense review and posting, manual external payment evidence, cash till outflows, immutable voucher/event/journal records, period sales/expense and aging summaries, asset register/category/custodian/location/history, and linked maintenance work orders and costs. Receipt references are serialized and checked across the existing external-payment workflows.
- `npm run lint` (`tsc --noEmit`), API `node --check` and `git diff --check` passed. No tests were run. Migrations 063-065 are unapplied; PostgreSQL, API runtime, browser/PWA, print hardware, backup/restore and pilot evidence remain unverified. Phase 11/12 and all prior production acceptance gates remain open.

### Phase 5 API floorplan and table order source continuation (2026-10-08; tests deferred)

- At continuation, local `HEAD` is `e8abf268275dd4de005b4f1e7b1a85665b785c42`; floorplan follow-up and checkpoint edits remain in the worktree.
- Added API/PostgreSQL table masters, permission-filtered table projections, atomic outlet floorplan save/archive, `table.ready`, and API table-order opening. Table opens are version-checked and serialized; the partial unique index prevents two active orders on one table. POS and Floorplan derive occupied/cleaning state from the synchronized order lifecycle, with table readiness recorded against the latest closed order.
- The PWA route now authorizes floorplan/table commands and the API staff role map recognizes canonical floorplan permissions. `order.transfer` and `order.merge` still have no ServOS API/PWA implementation. Existing floorplan data is not imported by this source change; migration 067 remains unapplied.
- API/PWA `order.transfer` is also registered as an online-only transaction. It checks order/source/destination revisions and moves only an unsettled order with no active preparation to an available table in the same outlet; source enters cleaning.
- `npm run lint` (`tsc --noEmit`), `node --check` for all 51 API modules, and `git diff --check` passed after the transfer follow-up. No tests were run. PostgreSQL execution, API/browser synchronization, table concurrency, migrated table data, `order.merge`, and all prior production acceptance remain unverified. Phases 5 and 11 and the overall reset are not accepted.

### Phase 1 Auth / Staff / Device / Session acceptance (2026-10-08; local disposable evidence)

- At this verification, `HEAD` is `f84af3601884d801a53f20189b614a699c4c6fdc`; `origin/reset/vps-platform` is `a12676dfe7ec2c20d73c86fdf2dc275288566f08`. Changes remain in the worktree. PostgreSQL evidence used only the isolated local Docker test service `serveos-final-sweep-pg-20261008` and schema-scoped synthetic fixtures; no Countryside data was accessed.
- Fixed migration 045: PostgreSQL names the paid-total inline check `procurement_payables_check`; the migration had attempted to drop a nonexistent name. The replacement paid-plus-credit constraint now has the explicit name `procurement_payables_settlement_total_check`. The migration runner applied the full migration set in a fresh schema.
- Added a PostgreSQL auth/staff integration suite to `npm run test:api`. It covers competing initial Admin setup, the startup setup-secret retirement guard, initial password change, device challenge proof/replay, same-owner repeat enrollment, cross-staff device collision, staff creation and password secrecy, permission ceiling, refusal to create another Admin, role change, deactivation cascades, own-session revocation/current-session refusal, device revocation, password-change revocation, 15-minute access-token expiry, refresh rotation/retry/replay, logout, disabled-account refusal, and concurrent final-Admin demotion.
- `npm run test:api` against the disposable real PostgreSQL service: **20 passed, 0 failed, 0 skipped**. This includes fresh-schema migrations and the existing API command/catalog/change-feed integration.
- `npm run test:browser:api` against real PostgreSQL: **1 passed**. The PWA signs in, reloads through the session-resume path, changes catalog data, reconciles missed changes, and uses the ordered API feed. The test inspects actual browser storage: access and refresh credentials are absent from localStorage/IndexedDB; the refresh cookie is HttpOnly and path-scoped. It forces an SSE 401 and verifies API refresh, then expires access credentials and verifies both tabs request the shared `serveos-api-refresh` Web Lock and complete recovery.
- Focused `tests/browser/web-storage.spec.ts` acceptance: **2 passed** (desktop and mobile), including recovery evidence redaction of approval-token and bearer text. Root `npm run lint` passed; root `npm test` passed **218/218**.
- **Phase 1 exit: AUTH / STAFF / DEVICE / SESSION / REFRESH / REPLAY / CONCURRENCY PASS** for the local disposable software gates above. The restart case exercises the same real-store startup secret-retirement guard called by API startup, but did not restart a separately launched production service. Hosted CI, deployed HTTPS/CORS/cookie behavior, physical-terminal/browser acceptance, and live operator acceptance remain unverified. Phase 0 hosted matrix is still unverified; the user explicitly directed work to continue to Phase 1 while the run #282 logs were unavailable.

### Phase 2 API bootstrap and browser recovery acceptance (2026-10-08; local disposable evidence)

- At this verification, `HEAD` remains `f84af3601884d801a53f20189b614a699c4c6fdc`; all edits remain uncommitted in the existing worktree. Only the disposable local PostgreSQL service `serveos-final-sweep-pg-20261008` was used.
- Added browser acceptance for protocol-v2 manifest/page hashes, a transfer interrupted after the first staged page, reload and resume from the same snapshot, invalid manifest and high-water metadata, page tamper, collection-count mismatch, stale cursor, unresolved `PENDING_SYNC` and `OUTCOME_UNKNOWN` command guards, local and server-reported snapshot expiry, and preservation of the active projection when rebuild fails.
- A deliberately injected `QuotaExceededError` at the IndexedDB staging boundary leaves the prior records/cursor/policy intact. A separate test corrupts one staged record so the real IndexedDB activation transaction aborts after clearing its target store; IndexedDB rollback preserves the old active projection. This simulates quota exhaustion; it does not consume the browser's actual storage quota.
- The same browser suite installs a 1,203-record projection in two bounded pages. `tests/browser/api-bootstrap-recovery.spec.ts`: **8 passed** across desktop and mobile; after adding the server-expiry path, its focused expiry/queue test passed **2/2**. `npm run lint` passed.
- Extended the real API/PostgreSQL browser scenario to inspect the stored snapshot owner tuple and verify correct access plus refusal for changed business, staff, device, session, permission hash, and expiry. It also leaves the PWA, deletes only its `servos-api-v1:*` projection database, and reloads: the HttpOnly session/device identity remains available and the API rebuilds the catalog projection. The local acknowledged-command history in the deleted disposable DB is naturally absent; the test performs this only after prior commands are synchronized. `npm run test:browser:api`: **1 passed**.
- `npm run test:api` against the disposable PostgreSQL service: **20 passed, 0 failed, 0 skipped**, including isolated-schema migration coverage through migration 062 and API command/change-feed tests. No Countryside database or business data was used.
- **Phase 2 exit: BOOTSTRAP / RESUME / HASH / ATOMIC ACTIVATION / CORRUPTION RECOVERY PASS** for the local software gates described above. Actual low-storage hardware behavior, live device-revocation acceptance, deployed browser storage recovery, restore drills and hosted CI remain unverified.

### Phase 3 catalog lifecycle and operator acceptance (2026-10-08; local disposable evidence)

- Verification ran at `HEAD=f84af3601884d801a53f20189b614a699c4c6fdc` on `reset/vps-platform`; edits remain in the existing worktree. All database work used only the disposable Docker service `serveos-final-sweep-pg-20261008` and synthetic identities/data.
- Closed a catalog editor gap found while writing the operator acceptance: editing a stock master could discard existing barcode aliases, and the Web Catalog form had no purchase-package editor. Stock edits now retain and edit barcode aliases, and package rows expose name, base-unit quantity, cost, and barcode with explicit quantity/cost validation.
- `npm run test:api` against real PostgreSQL: **21 passed, 0 failed, 0 skipped**. `catalog-lifecycle.integration.test.mjs` covers barcode/alias/package projection, product recipe/portion/modifier/outlet persistence, invalid references, archive blockers for open orders, balances, dependent recipes/modifiers, open POs/returns and outlet defaults, stale versions, restore code/barcode collisions, bootstrap tombstones, concurrent archive versus product edit, and response-loss replay.
- `npm run test:browser:api`: **1 passed** on a fresh PWA build against the disposable real PostgreSQL service. The operator flow edits stock and a purchase package without losing its alias, creates a recipe product with a portion, modifier and outlet assignment, confirms archive/reactivation outcomes, scans the package barcode in a physical count and verifies the resulting balance in PostgreSQL, then covers projection deletion/rebuild, reload, and missed-change/SSE refresh recovery.
- Root `npm test`: **218 passed, 0 failed**. `npm run lint` passed. `git diff --check` passed (Git reported only existing LF/CRLF normalization warnings).
- **Local catalog API / PostgreSQL / operator UI / barcode scan / recipe configuration / modifier configuration / selling-option configuration / archive-restore / concurrency / response-loss gates: PASS.** Actual recipe/POS sale behavior (whole item, portions/packages, bottle conservation, category/favorites barcode filters, and archived-modifier refusal) remains assigned to Phase 5 POS acceptance and is not claimed here. Hosted CI, physical scanner/printer hardware, deployed migration/cutover, and pilot acceptance remain open; Phase 0 hosted run #282 is still unresolved.

### Phase 4 Inventory receipt, count, and movement acceptance (2026-10-08; local disposable evidence)

- Verification ran at `HEAD=f84af3601884d801a53f20189b614a699c4c6fdc` on `reset/vps-platform`; source and checkpoint changes remain in the existing worktree. PostgreSQL work used only the disposable local Docker service `serveos-final-sweep-pg-20261008` with a fresh schema and synthetic fixtures.
- Added `apps/api/tests/inventory-lifecycle.integration.test.mjs` to exercise package-to-base-unit receipt conversion and weighted-average costing; competing receives and duplicate source-reference rejection; durable response-loss recovery with one committed receipt; sealed-bottle receipt; full count with an estimated sealed/open reconciliation and historical measurement method; selected-count revision races; transfer replay; waste and transfer reversals; later-activity reversal blocking; and sealed/open bottle conservation across locations.
- Extended the real API/PWA browser scenario to complete a barcode-assisted Full stocktake and a Quick Count. The test verifies both acknowledged commands and the selected-count row against PostgreSQL, with no legacy request path.
- `npm run test:api` against disposable real PostgreSQL: **22 passed, 0 failed, 0 skipped**. `npm run test:browser:api`: **1 passed** on a fresh PWA build. Root `npm test`: **218 passed, 0 failed**. `npm run lint` and `git diff --check` passed; Git emitted only its existing LF/CRLF normalization warnings.
- **Local inventory receipt / weighted cost / count / multi-command concurrency / movement / reversal / bottle conservation API and PostgreSQL gates: PASS. PWA Full and Quick Count acceptance: PASS.** The overall Phase 4 exit remains open for POS consumption/linkage, modifier and void-return conservation, procurement GRN/partial-GRN/supplier-return linkage, batch-preparation acceptance, and target-hardware operator verification. Hosted CI run #282, production migration/cutover, backup restore, physical hardware, and pilot acceptance remain open.

### Final-sweep hosted and local checkpoint (2026-10-08)

- Reviewed source SHA: `cb1ccebb9e481e9868df79b0fb09c1962cbb2ed4` on `reset/vps-platform`; local branch and origin match. This checkpoint changes progress documentation only. No Countryside data was accessed or migrated.
- GitHub Actions run [#37790563428](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37790563428) completed on that SHA. Eleven jobs passed, `api-postgres` failed, and `release-candidate` was skipped. Frontend, preview and production browser, native domain, both cloud protocol jobs, desktop shell, Windows printer shell, both Print Bridge jobs, and evidence summary passed.
- Within `api-postgres`, the API unit/PostgreSQL test step failed while the real PWA/API/PostgreSQL browser acceptance step passed. The Windows printer-shell job's dependency install, toolchain checks, desktop check/tests, Rust library tests, and evidence upload all passed.
- Public GitHub metadata confirms the statuses, but the job-log endpoint and the API artifact download returned HTTP 403. The test-level hosted failure remains unknown; the test failure must not be described as fixed.
- Current-checkout `npm run test:api`: **22 passed, 0 failed, 0 skipped** against the disposable Docker service `serveos-final-sweep-pg-20261008`, PostgreSQL **16.15**. Local Node is **26.5.0**; CI uses Node **22**, so this local pass does not close the hosted discrepancy.
- Current-checkout root `npm test`: **218 passed, 0 failed**. `npm run lint` passed. `npm run audit:ui:gate` passed with 4,939 interactions inventoried and no browser `prompt`/`confirm` findings; 619 review findings remain, and operator workflows are still marked unreviewed.
- The overall hosted baseline remains **FAIL** until `api-postgres` passes on one exact SHA. The Windows printer-shell gate is **PASS** at the reviewed SHA and must be rerun on the final candidate SHA. POS acceptance remains next after the complete green baseline.
- Local desktop compilation previously stopped when the C: volume ran out of space. At this checkpoint only about 0.01 GiB was free; that failure is an environment limit, not evidence of a source compile defect. Production migration/cutover, restore, rollback, physical hardware, and pilot acceptance remain open.
