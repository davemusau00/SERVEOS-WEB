# Current release state

## DEV final sprint P0/P1 foundation - 2026-09-30

P0 local verification passed after `npm ci`: lint, build, 112 Node tests, 22 desktop/mobile browser tests, 71 Linux-container native domain tests, disposable cloud protocol checks, documentation checks, UI audit gate, and `git diff --check`. The audit found no browser prompt/confirm use but reports 48 review findings; it inventories 3,492 interactions. These results do not establish hosted CI, packaged-terminal, physical hardware, or live deployment acceptance.

P1 remains partial. Shared operator controls and a keyboard-aware dialog shell exist; the audit generates control and operator-workflow reports; the operation manifest includes parity metadata; and selected native/web date-time forms convert property-local wall time to UTC. Audit signals now cover custom overlays, form busy states, unexplained disabled actions, direct exception text, browser prompts, business-time inputs, and excessive required fields. The latest report has 365 review candidates; none has been manually accepted or cleared, and no form currently crosses the required-field threshold. Workflows remain `UNREVIEWED`, other business-time inputs and feature-local primitives remain, and no operator UX acceptance is claimed. See the sprint document, completion ledger, and test evidence for the exact boundaries.

P2 has started with timezone-correct hospitality calendar views and a narrowly scoped staged session context (`timeZone`, nightly checkout, day-use cutoff). Terminal Front Desk uses the locally stored property settings; Web receives only the whitelisted policy values, not property contact/tax fields. Web check-in shows visible arrival-time and room-readiness blockers. This does not complete reservation/guest creation, rate/availability summaries, checkout recovery, room block/maintenance quick actions, or the hospitality acceptance matrix. The expansion migration is disposable-cloud verified only and has not been applied to a hosted business.

## UX and Guidance foundation — 2026-09-28

The current native shell now has permission-filtered task groups, a Home screen with operational shortcuts and Quick Add entry points, a compact mobile More menu, and an initial shell orientation tour. The offline Help Center launches the tour and displays per-staff progress. SQLite schema 11 stores guide progress and resumable stock-count scanner drafts separately from business records/outbox; runtime operation-success events are emitted only after the native command returns successfully. Source plans and sequencing are cross-linked in [UX and Guidance delivery plan](UX_GUIDANCE_DELIVERY_PLAN.md).

This is a foundation slice, not completion of the full Simple Operations UX or Guidance roadmap. Product/catalog, stock, rooms/property, imports, task-specific training guides, target-hardware interaction, and the broader production acceptance remain open. See [completion ledger](COMPLETION_LEDGER.md) and [test evidence](TEST_EVIDENCE.md) for executed checks.

The next web parity work is documented in [Web parity execution plan](WEB_PARITY_EXECUTION_PLAN.md). It records the native/web differences in platform intake, business setup, Help, staff welcome, tour behavior, and operational workspaces. The plan's first execution artifact is documentation; no web intake or lifecycle implementation is claimed by this entry.

Updated: 2026-09-25. **Bar-first source implementation substantially expanded. Production acceptance is still required on a supported target device.**

## Expansion update — 2026-09-26

The accepted target now includes shared desktop/Vercel operations with allocated offline rights, Rooms, Assets and integration of existing staff-facing modules. [Documentation package](EXPANSION_PLAN.md) written before application changes. Existing single-terminal source remains active until a verified protocol cutover. No multi-writer, Vercel deployment, Rooms or Assets completion is claimed.

Receipt documents now capture atomically with payments, preserve cash/change/header snapshots, reject mutation, and support history/reprint with full 80mm previews and fixed attribution. Native identity/tax/payment/printer settings editors are present. The staged cloud master-command/allocation foundation and browser IndexedDB queue have isolated tests; they are not connected as a production multi-writer application. Service-worker shell caching is opt-in and does not enable offline sales. See [current expansion ledger](COMPLETION_LEDGER.md).

Staged cloud domain source now also includes room/rate masters, reservations/availability blocks/housekeeping, Assets custody/lifecycle and shared maintenance with atomic stock, journal and payable effects. Stay/folio source adds check-in/out, moves, paid extensions, accommodation-period posting, deposits/application, manual settlement and unpaid charge reversal. Disposable PostgreSQL checks cover the implemented handlers and restricted read projections. Refund/credit/POS/receipt integration, authenticated operational UI, signed offline grants, device handover and migration acceptance remain open. These additions do not enable production web transactions or establish full Rooms/Assets delivery.

## Implemented in source

- Native installation state machine from intake through Go Live.
- Resumable pre-enrollment Intake Wizard and owner enrollment that no longer seeds fake operational outlets/stores.
- Business Setup Wizard with real tax, payments, service areas, stock locations, catalog, opening balances, staff access, till policy, floorplan and backup/sync rehearsal.
- Rust capability registry returned with authenticated runtime snapshots; installed UI no longer simulates roles.
- Single-use, target-aware manager approval tokens and staff create/update/deactivate/PIN-reset/role-change lifecycle.
- One-terminal SQLite transactions with command deduplication, immutable audit and ordered outbox.
- Native floorplan atomic save plus `table.ready` cleaning lifecycle.
- Bar POS orders, quick tabs/tables, quantities, portions, modifiers, recipe snapshots, price-rule snapshots, firing and ingredient depletion.
- Item-specific KDS states: FIRED → PREPARING → READY → SERVED.
- Unpaid transfer/merge, protected discounts/comps, fired-void stock disposition.
- Cash/card/manual M-Pesa and atomic split tender, manual M-Pesa reconciliation, refunds/reversals without automatic ingredient restock.
- Opening balance, stock receipt with weighted-average cost/evidence, physical count, transfer and waste movements.
- USB HID keyboard-wedge scanning for POS lookup, product/stock barcode assignment, package scan quantities, inventory count drafts and PO/GRN selection. Barcode uniqueness and scan-unit validation run in the native backend.
- Native PO creation and partial GRN receiving. GRNs retain delivered/accepted/rejected quantities; accepted stock, movement ledger, payable accrual, journal, PO state, audit and outbox commit together. Over-receipts require a single-use approval from a different Admin or Manager.
- Native AP invoice matching compares each billed quantity to accepted GRN quantity and each unit price/total to the approved PO. Mismatches block settlement. Admin/Manager-only supplier payments support partial settlement, manual external confirmation, payment reference, AP journal and due-date tracking.
- Till open, paid-in/out, blind close and protected variance override.
- Persisted close-day report covering sales, tax/levy, tenders, cash, discounts/comps/refunds, COGS/waste, gross profit, top products, staff sales and system state.
- Offline Help Center generated from 31 Markdown user-guide articles.
- Windows build bootstrap, Bash-driven preflight/NSIS packaging, target runtime install/check, XP-80T USB queue setup and RAW test-slip helpers are now present alongside the existing Linux/Android scripts.
- Existing ordered Supabase replica and remote-request architecture retained.

## Hardware status checked 2026-09-24

- On the connected Windows 11 host, Windows exposes the XP-80T as `Printer POS-80` on `USB001`. Its existing queue is `Xprinter XP-80` with driver `Xprinter XP-80`; vendor driver `XP-80C` is also registered.
- `scripts/test-xprinter-usb.ps1` sent a short non-sale RAW slip to that USB queue. The printer was initially out of paper; after paper was loaded, the operator confirmed the test slip printed and the pending job cleared. This verifies one physical USB RAW slip on the Windows 11 host.
- `scripts/configure-xprinter-usb.ps1` now reuses a compatible XP-80 queue on the requested USB port before creating a new queue, so the current driver/queue naming does not create duplicates. Neither helper has yet been rehearsed on the fresh Windows 10 terminal.
- Source includes an XP-80T profile for direct LAN ESC/POS (default TCP port 9100), a Windows RAW USB queue path, 48-column receipt formatting, optional cut between customer and business copies, an in-app setup test slip, and a locally persisted retry list. The standalone USB slip does not verify ServOS's packaged-app path, both receipts or cutter behavior. LAN remains unverified.
- This installation will not use a cash drawer.

## Verification executed in this environment

The Windows package was built on Windows 11 Pro (build 26200) with Node 26.5, Rust 1.98.1 MSVC, Visual Studio C++ Build Tools and WebView2. `bash scripts/deploy-windows-pos.sh --package` passed lint, 11 Node tests, 8 Playwright cases across desktop/mobile projects, 21 native domain tests, 25 Tauri desktop tests, 31 guide/15 core-document checks, and the UI inventory. `npm ci` reported zero vulnerabilities. Vite emitted its existing large-chunk warning.

The NSIS installer is `src-tauri/target/release/bundle/nsis/ServOS_0.1.0_x64-setup.exe` (4,036,233 bytes). Its `.sha256` sidecar was independently verified as `0220498af115878c4b0c46b0fb47439a229ba76bc81deed9e5fbfa5b17be5d35`. The installer is not Authenticode-signed; the SHA-256 sidecar checks file integrity but does not identify a publisher.

This package build ran on Windows 11. Installation and first-run setup on the fresh Windows 10 terminal, packaged-app USB printing, the customer/business paper pair, cutter behavior and LAN printing remain unverified there.

The bootstrap warns about unsupported standard Windows 10 editions; the target install script handles the WebView2 runtime and installer integrity check without putting business data or enrollment state in the build scripts.

Dependency-independent checks are recorded in [TEST_EVIDENCE.md](TEST_EVIDENCE.md). The target development machine must run the full `npm run verify` gate after `npm ci`.

## Remaining release gates

- successful `npm ci`, TypeScript/Vite build and Playwright run against the finished tree;
- scanner focused component/browser coverage and native command acceptance for duplicate barcodes, partial/rejected receipts, offline commit, stale PO versions and separate over-receipt approval; physical scanner validation remains required on the target terminal;
- successful Rust domain tests and Tauri desktop build;
- native procurement acceptance for exact and mismatched 3-way invoice lines, invoice reference uniqueness, partial settlement, duplicate payment references and balanced AP journals; source implementation is not yet build/test verified in this turn;
- disposable PostgreSQL/Supabase protocol test;
- fresh Windows 10 installation acceptance and Linux/Android packages if those are release targets;
- packaged-app XP-80T USB printing and customer/business two-copy paper output, optional cut behavior, LAN handoff, retry/restart recovery, and acceptance on the fresh Windows 10 terminal;
- complete Phase 16 fresh-install/offline/restart/reconnect/backup acceptance rehearsal;
- encrypted/rotated remote backups and verified replacement-terminal restore remain beyond the current local backup implementation.

No claim of **deployment verified** should be made until [BAR_PRODUCTION_ACCEPTANCE.md](BAR_PRODUCTION_ACCEPTANCE.md) is completed on the target hardware.

## 2026-09-27 source continuation

Fixed the controlled room CSV UPDATE contract: `initialStatus` remains in the staged import representation for CREATE intent/audit, but the planner omits it from the versioned UPDATE command. The native regression exercises stage, plan, and apply, including state preservation. `npm run verify`, both 55-test Rust suites, and the disposable PostgreSQL expansion suite passed; details and exclusions are in [test evidence](TEST_EVIDENCE.md).

The README now starts with the active single-terminal authority and disabled v2 status and documents developer commands and their evidence limits. The implementation remains incomplete: signed offline grants, web/desktop domain integration, full shared multi-device acceptance, migration rehearsal, production cutover, and packaged target acceptance remain outstanding. No live project was changed.

## 0.2.0 release candidate closure — 2026-09-28

ServOS is now version **0.2.0** with local SQLite schema **12**. The Simple Operations source set is substantially complete: task Home/Quick Add, product families and variants, atomic opening stock, location-first counts, resumable scanner counts, Simple Receive Delivery, simple Rooms, simple Property, Report Problem, per-staff welcome/guides, and Friendly CSV / Excel-paste import.

This release is a **release candidate**, not yet physically accepted. Browser/native/source verification does not substitute for packaged-terminal evidence. Physical terminal acceptance remains open for the real USB scanner, 80 mm printer, existing-terminal migration, offline/restart behavior and final operator workflow.

The staged PostgreSQL/web-v2 expansion remains non-authoritative and must not be activated as part of 0.2.0 terminal deployment.

See [Existing Terminal Upgrade](EXISTING_TERMINAL_UPGRADE.md) and [0.2.0 Release Acceptance](RELEASE_0.2_ACCEPTANCE.md).

The release executable compiled on this Windows host, but the installer bundle step failed because Tauri could not resolve its WiX download host. Installer creation and target-machine acceptance remain open; see [test evidence](TEST_EVIDENCE.md).

## 2026-09-27 staged settlement continuation

Expansion 11E now includes staged payment migration 014, refund/reversal and immutable close-day report migration 015, a queued Web POS refund flow, and a Finance workspace for till cash movement/close and report generation. Refunds preserve the original payment, require a manual external reference/confirmation for MPesa and card, and never automatically restock. Reports explicitly mark provider reconciliation and sync health as unverified. The web v2 gate remains disabled by default; no hosted Supabase project or production control was changed.

Current-tree `npm run verify` passed: lint, production build, 70 Node tests, 16 desktop/mobile browser cases, 55 native domain tests, UI interaction inventory and documentation checks. The separate disposable PostgreSQL expansion harness passed migrations 001-015 and its legacy, inventory, rooms/folios/assets, payment/refund/close-day acceptance suites, including the independent room-booking race. See [test evidence](TEST_EVIDENCE.md) for limits. The build emits a 808.12 kB main JavaScript chunk warning. This is staged/local acceptance, not live migration or deployment.

Remaining in this slice: room-charge settlement, MPesa statement reconciliation, fuller close-day void/inventory/system evidence and authenticated operational permissions. Broader brief gates also remain: canonical staff/device administration, signed offline grants, native desktop adapter, migration and cutover rehearsal, real multi-device trading, fresh-terminal installation and hardware acceptance. The installer bundle itself remains unverified due the earlier WiX DNS failure.

## 2026-09-28 staged staff and device continuation

Expansion migration 016 adds Auth-bound staff records, canonical permission profiles based on native permission strings, role permission ceilings, outlet/service-area assignments, version-checked staff edits, protection against removing the final Admin, device inventory/revocation and scoped five-minute manager approvals. The procurement over-receipt handler consumes its approval in the same transaction and snapshots the approver on the immutable GRN. An authenticated Staff workspace now uses the existing browser command queue for profile changes, approvals and device revocation. Supabase Auth invitation, password reset and session recovery are not implemented; staff can only be bound to an already existing Auth user ID. Approval tokens are placed in the browser command queue, so sensitive local storage protection remains a required follow-up.

The disposable expansion SQL acceptance passed migrations 001-016 and the staff/device suite: canonical role rights, escalation denial, approval action/target/initiator/expiry/replay boundaries, inventory/revocation and server rejection for the revoked device. Lint, Node tests and UI inventory also passed before the broader final gate. The feature is staged and default-off; this is not hosted Supabase/Auth or production acceptance.

Remaining work includes the complete 10B Auth invitation/recovery/session flows, richer custom permission editing, report/audit UI, shared multi-operator device ownership, and 11E room-charge/M-Pesa/close-day gaps. Continue the 12A desktop adapter and migration/rollback rehearsal. Signed offline grants, cutover and physical acceptance remain open.

## Final 0.2.0 customer-credit closure

The installed terminal now includes authoritative customer tabs and Accounts Receivable under SQLite schema 13. A POS tab may be linked to a reusable customer, settled partly by normal tender and then charged to an active customer credit account. Credit charges complete the order without pretending receivables are cash. Later Cash/M-Pesa/Card settlements reduce A/R, with M-Pesa reusing the existing statement reconciliation workflow. Customer credit ledger entries and reconciliation snapshots are immutable.

The staged PostgreSQL/web-v2 authority remains disabled for this terminal release.
