# ServOS DEV FINAL SPRINT — FRESH TERMINAL INSTALLATION

**Revision:** 2 — 1 October 2026, Africa/Nairobi  
**Repository:** davemusau00/SERVEOS-WEB  
**Reviewed baseline:** `d54e62699b47fbd8f3eaf0b57d59810df87f825e` (04:26:13 EAT)  
**Release disposition:** BLOCKED — implementation and acceptance plan, not deployment approval  
**Installation decision:** fresh terminal commissioning; existing terminal records are trial data, not a migration source.

## 1. Mandate and precedence

Deliver a dependable single-business hospitality system for the actual terminal: catalogue and inventory, bar/POS, manual M-Pesa, cash/tills, rooms/folios, assets/maintenance, staff, receipts, and business administration. Complete the supported Web workflows and verify the intended relationship between Terminal and Web. Operators should supply real-world facts; the system should calculate, validate, link, default, and record everything it can safely know.

The owner clarified that prior terminal use was trial activity and the deployment will be a fresh installation. This replaces the earlier assumption that trial records must be migrated, reconciled, and retained as production history. It does not authorize deleting an unrelated database or bypassing financial controls after real trading starts. No actual terminal or hosted database was reset during this review.

This active revision supersedes the installation, cutover, receipt, and sequencing instructions in the historical appendix wherever they conflict. The appendix preserves the repository sprint and its P0–P27 design detail for traceability; its old status claims, baseline dates, and upgrade-first requirements are not current release evidence. Keep FS-01–FS-24 identifiers stable. Owners are responsibility roles to assign, not assumed staffing.

### Changed release scope

| Earlier assumption | Fresh-install decision | Remaining requirement |
|---|---|---|
| Migrate trial sales, payments, bookings, and receipt history | Removed from this release | Start with no trial operational history |
| Reconcile trial SQLite against trial Supabase | Removed as a go-live gate | Prove the new live dataset's opening stock, cash, and configured records |
| Drain trial outbox into production | Explicitly prohibited | Isolate/revoke trial clients; discard trial queues only inside the verified trial scope |
| Reuse old staff/device identity | Not required | Enrol real staff and commission a new live device identity |
| Upgrade trial SQLite in place | Not required for this handover | Create current schema from empty storage and validate restart/restore |
| Full historical CSV conversion | Deferred | Controlled actual master-data intake and opening balances remain required |
| Backup/restore | Still required | Restore live data to a replacement terminal after commissioning |
| Web/native shared authority | Still explicit | Select and accept one authority profile; never enable competing writers |

### Authority profile must be explicit

Fresh data removes legacy-data conversion, not architecture decisions. The full shared Terminal/Web profile remains the product target. It requires complete v2 schema, compatible native adapter, tested identity, and hosted concurrency acceptance. Until that evidence passes, keep shared writes disabled. A terminal-first limited release is permissible only as an explicitly agreed reduced release: prove its native scope, keep transactional Web disabled, and show unavailable modules honestly. Do not silently call a legacy terminal-only package the completed Web product. Record the chosen profile, schema, feature flags, allowed clients, and offline permissions in the release manifest before packaging.

## 2. Fresh-check evidence and limitations

A new isolated worktree was created at the baseline above. `npm ci` installed its own dependencies; previous node_modules were not reused. This was a development checkout check, not a Windows terminal installation.

| Evidence | Observed result | Interpretation |
|---|---|---|
| Clean `npm ci` | PASS; 117 packages installed | Fresh frontend dependency installation works in this environment |
| `npm run lint` | FAIL; 2 TypeScript errors | Administration unknown-to-ReactNode and Floorplan BlockerCard prop mismatch remain |
| `npm test` | 168 total; 155 pass; 13 fail | Inspect failures individually; several are source-string assertions, not proof of broken behavior |
| `npm run build` | Environment blocked at tsx IPC: EPERM `/tmp/tsx-0/52.pipe` | Do not report this as a product compilation defect or a passing normal build |
| Diagnostic build | `node --import tsx scripts/build-operation-ledger.ts`, then direct Vite build PASS | Bundling succeeds through an alternative invocation; does not clear tsc or normal release command |
| Parity generation | 89 operations | A generated ledger is source inventory, not operational acceptance |
| Same-commit CI 36801153817 | Native-domain and cloud base PASS; frontend, desktop, cloud v2 FAIL | Native compiler repair now has current-commit evidence; release remains blocked |
| Browser CI | Still running at evidence capture | No pass/fail conclusion inferred |
| Local native/cloud execution | Not run: Cargo and Docker unavailable in this runtime | Same-commit CI is separate evidence; no local physical claim |
| Packaged Windows, scanner, paper output | Not performed here | Required on the actual terminal before live use |

CI reference: https://github.com/davemusau00/SERVEOS-WEB/actions/runs/36801153817  
Commit reference: https://github.com/davemusau00/SERVEOS-WEB/commit/d54e62699b47fbd8f3eaf0b57d59810df87f825e

The prior implementation's cloud log identifies migration 040's mismatched parentheses; that SQL file is unchanged at this baseline. Desktop's locked dependency failure is also unchanged. The latest implementation adds an OUTCOME_UNKNOWN guard before new submissions, typed command results, and confirmed-only state clearing across several POS/hospitality paths. These are progress, not complete workflow acceptance.

Known source-test failures cover tax class, native barcode error collection, batch stock consumption, operator identity/device reuse, staff binding, dispatcher contract, import contract, floorplan, editor retention, replacement correlation, whole-location count, and inventory command routing. Some literal-match tests fail because valid source structure changed; distinguish stale assertions from behavioral defects and replace brittle checks with meaningful behavior coverage where needed. Do not delete expectations merely to obtain green CI.

## 3. Receipt and branding audit: requirements versus implementation

Reviewed sources:

- `docs/RECIEPT-PRINCIPLES.md` — owner's receipt presentation instructions (retain this filename for compatibility).
- `docs/RECEIPT_SPEC.md` — immutable document and 80mm output contract.
- `docs/user-guide/33-receipts-settings.md` — operator settings/history/printing workflow.
- `APP-LOGO.png` — green/gold emblem without the full business wordmark.
- `reciept-logo.png` — Country Side Resort emblem and wordmark; supplied colour raster artwork.
- `src/types/receipt.ts`, `src/components/pos/ReceiptDocumentView.tsx`, `src/native/NativeReceiptDialog.tsx`, `src-tauri/src/receipts.rs`, `src-tauri/src/printer.rs`.
- `src/runtime/web/WebPosView.tsx`, `src/index.css`, `src-tauri/tauri.conf.json`.

| Requirement | Observed gap | Required resolution |
|---|---|---|
| Four-line KINGSFORGE footer | TS and Rust constants still contain old three-line “Built By Davemusau.co.ke” attribution | Update all renderers and fixtures together |
| Replaceable receipt logo | ReceiptDocument has no logo reference/snapshot field; inspected renderers contain no logo output | Add versioned settings and immutable branding snapshot |
| Correct app/business branding | Assets exist at repository root; inspected application sources do not reference the supplied filenames | Deliberately wire the emblem into appropriate business UI; distinguish it from generic ServOS product identity |
| Print selected Web receipt | Web calls `window.print()` from history without establishing its selected document root | Use shared selected-document preview/portal, not arbitrary page printing |
| Consistent print CSS | Global CSS expects `thermal-receipt-print-root`; shared receipt portal uses `servos-receipt-print` | Select one root and one print contract; verify stylesheet ordering and route isolation |
| Thermal logo | Colour source is detailed and gradient-based | Produce bounded monochrome raster output; validate wordmark/detail on actual paper |
| Pretty customer identifiers | Receipt numbering currently includes the device namespace; raw internal identity exists in business copy | Friendly collision-safe public numbers; technical identity retained in audit/detail, not customer presentation |
| Same output across paths | Web history/download is a simplified representation, separate from native document layout | Normalize persisted documents through one contract for preview, text and direct print |
| Footer/cutter space | Owner explicitly requires a buffer | Feed after the complete footer and before each cut; verify physically |

### Receipt ordering decision for this sprint

The principles file says both “footer last after logo” and “logo last on customer side.” Use this explicit interpretation: the logo is the final business-brand element; the fixed developer attribution follows as the last textual block, then blank feed space. Record this interpretation in RECEIPT_SPEC and show the proof to the owner during paper acceptance. Do not silently drop either element.

Customer receipt sequence:

1. Centred business identity, contact details, service area, CUSTOMER COPY label.
2. Readable receipt/order number; local date/time; cashier; table/tab/room and customer where applicable.
3. Item description, portion/modifiers; aligned quantity, unit price and amount.
4. Subtotal, discounts, actual tax/levy where applicable, prominent TOTAL.
5. Tender amounts, real manual M-Pesa reference where applicable, cash tendered/change, paid and balance.
6. Configurable business thank-you.
7. Centred receipt business logo.
8. Centred fixed attribution exactly as below.
9. Blank feed buffer before cut.

```text
Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440
```

Business copy uses the same financial snapshot with an unmistakable BUSINESS RECORD COPY label and a compact audit reference. Preserve full immutable IDs in backend/support detail; do not dump UUIDs on the customer copy. No ETR/eTIMS or provider-confirmed claims are to be invented. Actual tax calculations must remain intact. Amounts use two decimal places and an explicit currency context; references and names wrap without colliding with amounts.

## 4. Execution sequence and release gates

| Gate | Work | Exit evidence |
|---|---|---|
| A — executable baseline | FS-01–03 | Fresh schema applies; lint/tests/locked builds pass; same-commit CI complete |
| B — safe transaction completion | FS-04–09 | Outcomes, drafts, identity, setup, receipt and scanner boundaries accepted |
| C — connected business workflows | FS-10–17 | Stock, finance, rooms and assets conserve quantities/money and preserve failed work |
| D — supported runtime and intake | FS-18–22 | Authority profile accepted; actual master data and opening baselines validated |
| E — physical fresh installation | FS-23–24 | Packaged terminal, printer/scanner, restore, full shift and first close accepted |

Independent source preparation can proceed together, but do not commission a live terminal before required gates pass. No deadline is implied by the word sprint. Estimate remaining effort after Gate A; dependency repairs and hardware evidence determine the finish date. Stop unrelated feature expansion until these gates close.

## 5. Work packages

### FS-01 — Fresh database construction and complete dispatch

**Priority:** P0. **Owner:** backend/domain. **Dependencies:** none. **Status:** blocked.

- Repair expansion 040 syntax around the nested row-preview construction; do not work around it by skipping 040 or 041.
- Apply baseline and the intended expansion chain to an empty disposable database in sorted order with stop-on-error. Record every filename/hash.
- Verify revised 038 and repair 042 keep the complete specialized route chain, permission checks and offline restrictions. Existing-install repair can remain in source even though trial-data migration is no longer a handover requirement.
- Test valid, denied, stale-version and replay cases for payment/refund/credit/M-Pesa, catalog/batches, rooms/folios, staff/devices, settings, floorplan, transfer/merge/discount/comp and close-day routes.
- Revisit whole-location variance and stock conservation after the suite reaches them. An earlier SQL error cannot clear later cases.

**Done:** empty database reaches all acceptance fixtures; each affected command has expected record, stock, financial and audit effects; unauthorized commands have no effects. Store migration hashes and CI run with the candidate.

### FS-02 — Compilation and reproducible installation

**Priority:** P0. **Owner:** frontend/native/release. **Dependencies:** none. **Status:** partial.

Fix Administration JSX unknown rendering with explicit narrowing; fix Floorplan BlockerCard to the actual component API. Reconcile desktop Cargo.lock under the intended Rust toolchain and preserve `--locked` in release checks. Native compilation is now passing in same-commit CI; retain that progress and its tests. Pin/document supported Node/Rust build versions, run npm ci in a clean checkout, and distinguish environment issues from defects. The diagnostic Vite success is not full release verification.

**Done:** normal lint/build, Node suite, locked native tests and locked desktop checks pass from a clean committed tree. No suppressions or test bypasses introduced to claim closure.

### FS-03 — Reliable evidence and candidate promotion

**Priority:** P0. **Owner:** QA/release. **Dependencies:** FS-01–02.

Keep separate browser preview and production jobs with explicit browser installation. Wait for every required job; “running,” “skipped,” and missing evidence cannot become PASS. Summaries must include commit, environment, commands, counts, failure stage, schema hashes, supported profile and artifact checksums. Preserve a distinction between source assertions, mocked browser interactions, real backend behavior, packaged native execution and physical hardware results. Document the 13 current test failures individually. Validate that a failed required check blocks release-candidate generation.

**Done:** one candidate has traceable passing software gates, while physical acceptance remains visibly pending until performed. No historical green result is presented as evidence for newer code.

### FS-04 — Finish command outcomes across every mutation

**Priority:** P0. **Owner:** frontend/domain. **Dependencies:** FS-01–02. **Status:** partial source implementation.

Retain CONFIRMED, DRAFT_SAVED, PENDING, OUTCOME_UNKNOWN, REJECTED, CONFLICT and BLOCKED. Only CONFIRMED may clear transaction fields, close a success dialog or announce that business effects occurred. Audit every caller, including modules still using the boolean compatibility wrapper. POS/refund/reservation improvements must be preserved.

Fix the guest-account payment path that still clears the amount after its wrapper resolves without checking confirmation. Audit Maintenance, Inventory, Procurement, Settings, Staff, Floorplan, and quick actions for the same pattern. Show the reason and next safe action inline. The new global unknown-command guard needs an actionable synchronization/reconciliation path and must not silently deadlock the operator. Do not let a retry create a new payment while its predecessor is unresolved.

**Done:** backend-connected tests exercise all seven outcomes for every high-risk workflow; inputs and selected target survive nonconfirmation; lost responses resolve using the original immutable command ID.

### FS-05 — Draft reconstruction and durable recovery

**Priority:** P0. **Owner:** frontend/storage/domain. **Dependencies:** FS-04.

Replace generic shallow payload merging with operation-specific serializer/deserializer contracts for money, quantities, nested data, dates, tax classes, rooms and approval-dependent actions. Capture specialist form state, target context and field errors. Reopening resolves current records, versions, permissions and policy before promotion. Preserve supersedes correlation only after the original command is terminally rejected/conflicting; block replacements for pending/unknown originals. Discard linked review drafts once the original is confirmed.

Redact tokens and sensitive values from draft presentation and logs without corrupting required immutable command transport. Validate reload/restart, multi-tab promotion, session locking and schema upgrades. Keep the known original command separate from an editable draft.

**Done:** representative payment, booking, stock count, procurement and maintenance drafts reopen meaningfully; exactly one business effect occurs through double-click, response loss and retry; no secret leaks in Activity or exported diagnostics.

### FS-06 — Receipts, logo settings and thermal output

**Priority:** P0 for handover. **Owner:** frontend/native/domain/QA. **Dependencies:** FS-02, FS-04. **Status:** implementation gaps confirmed.

**Document contract:** unify Web/native receipt normalization. Persist business identity, timezone/currency, friendly public numbers, item/portion/modifier snapshots, actual tax/discounts, tender/reference/cash/change, credit/balance and branding version at payment commit. Add a backward-compatible receipt schema version for branding; old documents remain readable. A new logo or header affects future receipts only. Payment commit must never depend on image downloading or printer availability.

**Branding settings:** provide Admin-authorized App emblem and Receipt logo slots, with preview, replace, remove/fallback and save confirmation. Seed this business from the supplied APP-LOGO.png and reciept-logo.png; do not bake Country Side Resort identity into every generic ServOS installation. Validate raster type, size, dimensions and decode results, bound memory use, preserve aspect ratio and normalize transparency onto white for thermal output. Keep a content hash/version and durable local or immutable asset reference so restart/offline reprint uses the correct historical image. A missing historical asset should show an explicit fallback; never silently substitute today's logo.

**Thermal raster:** implement deterministic monochrome preparation and supported ESC/POS image commands for USB/LAN paths. The supplied gold/green artwork is not already a thermal-ready asset. Choose a maximum dot width based on the actual printer profile; do not assume every 80mm model has the same printable dots. Text-only fallback remains explicit and cannot be counted as logo acceptance. Keep user-supplied text and image paths from injecting printer control commands.

**Layout:** follow Section 3. Use 80mm paper with the validated 74mm content contract. Consolidate competing print-root IDs/CSS. Selected receipt preview must match customer/business print copies and remain outside scrolling/fixed UI. Support long names, many items, long M-Pesa references, large totals and zero/change values without clipping. Show SAMPLE on samples and REPRINT on reprints. The business thank-you remains independent of attribution.

**Printing:** queue the exact immutable payload with its document/branding version. Provide clear queued/sent/failed/uncertain states. SENT means transport accepted, not paper verified. A restart during SENDING creates delivery uncertainty; inspect paper and explicitly acknowledge duplicate risk before resending. Feed sufficient blank paper after footer before cutter; configure the feed for the actual printer and record the accepted value. Keep copies distinct and avoid duplicate automatic sends.

**Done:** HTML preview, text output and ESC/POS agree on numbers and identity; both copies contain all four footer lines; logo can be replaced in settings without template changes; old reprint retains prior branding; actual paper proves readable wordmark, alignment, feed and cuts. Save photos of both copies, printer profile/driver/queue and receipt IDs. Update RECEIPT_SPEC, RECIEPT-PRINCIPLES, help and tests together.

### FS-07 — Scanner focus and barcode semantics

**Priority:** P1, required on target hardware. **Owner:** frontend/native/QA. **Dependencies:** FS-04.

Give scans one active owner: POS search, item mapping, stock count or receiving. Payment, refund and approval dialogs suspend background add-item capture. Preserve leading zeros; never parse barcodes as floating point or accept scientific notation as a barcode. Resolve aliases and package barcodes deliberately. POS adds the intended product/portion; count scans add canonical quantity; receiving scans add package quantities as configured. Provide clear unknown/ambiguous barcode feedback without silently creating stock.

**Done:** real scanner tests cover rapid scans, repeated items, unknown codes, long codes, modal focus, receiving/count modes and keyboard fallback with no background sale changes.

### FS-08 — Real operator enrolment and shared-device privacy

**Priority:** P0. **Owner:** Auth/native/frontend. **Dependencies:** FS-01, FS-04.

Create the real owner through the supported Auth/enrolment flow; configure staff roles, outlets and service areas. Staff CSV requires pre-invited Auth identities; it must not manufacture Auth accounts or grants. Use stable staff identifiers for this new live installation and a new device identity. Show role-based capability, including manager approvals tied to the exact action/target and expiry.

Local sign-out/lock must hide prior records even when remote logout fails, while retaining unresolved commands securely. Verify invited-user recovery, token expiry, keyring persistence, revocation, ordinary sign-out versus sign-out-everywhere, account switch, and cross-operator record isolation. Supabase UUID copying is a setup aid, not a normal cashier approval workflow.

**Done:** owner, manager, cashier, storekeeper and receptionist can complete assigned tasks and cannot perform forbidden tasks; operator B cannot see operator A's restricted cached data after switching.

### FS-09 — Fresh intake, business policy and honest readiness

**Priority:** P0. **Owner:** onboarding/domain. **Dependencies:** FS-01, FS-08.

Build the complete empty-state journey: business identity → owner/device → outlet/service areas → stock locations/till/payment methods → catalogue → rooms/assets → opening baselines → hardware test → readiness → Go Live. Allow saving and resuming setup. Use KES, Africa/Nairobi and supported tax policy consistently; do not silently overwrite saved room cutoff/checkout times with defaults. Preserve lifecycle/session fields through the final schema and remove circular “enabled before ready” logic.

Readiness must be server-backed and inspect actual required configuration, permissions, stock provenance and hardware evidence. Show a direct action for every blocker. Preview/tour completion is not proof of configuration. Use the real business name/contact details in preview, never guessed values from logo artwork.

**Done:** a brand-new business reaches readiness without developer database edits or hidden UUID knowledge; missing essential setup blocks Go Live with a useful next step; reload resumes accurate progress.

### FS-10 — Actual catalogue, units and atomic item setup

**Priority:** P1. **Owner:** inventory/domain/frontend. **Dependencies:** FS-01, FS-09.

Retain PRODUCT-INVENTORY.MD semantics. A product, linked stock item, package/portion rules, barcode aliases, tax class and opening movement must be coherent. Make direct resale, measured pours, recipe dishes, modifiers and prepared batches understandable. Default only from valid context; require explicit tax class and meaningful unit conversions. Reject impossible quantities and duplicate identifiers atomically. Show selling unit and stock effect before saving.

**Done:** operator creates and sells a bottle, shot, packaged drink, recipe dish and prepared portion; the correct quantity/cost changes exactly once; a rejected setup leaves no partial records.

### FS-11 — Opening stock, counts and conservation

**Priority:** P0 for commissioning. **Owner:** inventory/domain. **Dependencies:** FS-10, FS-21.

Capture actual physical opening stock per item/location, including sealed/open containers where supported and a documented valuation basis. Treat opening stock as explicit authorized ledger movements, not edited currentStock values. Distinguish uncounted from explicit zero; validate every row; show total value and variance. Require a second review before locking the opening baseline. Initial balances are not trial-history migration.

Retain counts across reload; rejected counts preserve every row and reason. Transfers conserve stock across both locations; waste/corrections require reasons and permissions. Retried opening imports or commands must not double stock.

**Done:** approved opening sheet matches movement-derived and current quantities; transfers, counts and waste reconcile; opening data can be audited without trial sales or fabricated supplier purchases.

### FS-12 — Batch production and serving consumption

**Priority:** P1. **Owner:** inventory/native/cloud. **Dependencies:** FS-10–11.

Verify recipe yield, ingredient consumption, prepared-stock output, unit conversion and output costing. Selling prepared portions consumes prepared stock rather than consuming ingredients a second time. Modifiers follow their declared stock rule. Preserve repair of native movement identity/time helpers; test actual effects rather than regex shape.

**Done:** prepare → sell → waste → count scenario conserves input/output quantities and costs on every supported runtime; concurrent or stale operations cannot produce negative/unexplained balances.

### FS-13 — Purchasing and receiving

**Priority:** P1. **Owner:** procurement/domain. **Dependencies:** FS-10–11.

Carry supplier/PO context into receiving. Default outstanding approved quantity in supplier packages and display canonical stock/cost conversion. Validate delivered, accepted, rejected and reason fields before submission. Handle partial delivery, repeat receipt and separate over-receipt approval. Invoice matching must show actual PO/GRN/invoice differences and preserve failed work.

**Done:** PO → partial GRN → final GRN → supplier invoice → payment reconciles stock, payable and journal effects; duplicate receipt does not duplicate stock; rejected rows remain editable.

### FS-14 — Complete POS and financial close

**Priority:** P0. **Owner:** POS/finance/domain. **Dependencies:** FS-04, FS-06, FS-10–12.

Accept the complete shift: assigned till/opening float → tab/order → item/fire → cash/manual M-Pesa/split tender/customer credit/room charge → immutable receipt → refund/reversal → cash count → reconciliation → close. Calculate remaining balance and change. Require manually verified M-Pesa receipt/reference without implying provider integration. Enforce reference uniqueness policy and refunds' actual money effects. Do not automatically restore consumed ingredients on refund.

Closing requires an actual cash count including explicit zero, variance explanation/approval and one accountable close result. Customer credit shows available limit, due/balance and authorized overrides.

**Done:** full shift totals agree across payments, receipts, till, credit, folios and stock; denied payments remain on screen; duplicate/retried payments have one effect; closed shift cannot be silently reopened by a stale client.

### FS-15 — Rooms, stays, guest accounts and assets

**Priority:** P1; required where used at handover. **Owner:** hospitality/domain. **Dependencies:** FS-09, FS-14, FS-21.

Set up room types → nightly rates → rooms, plus asset categories → room/location-linked assets. Review occupancy, maintenance and housekeeping states. Complete reservation → deposit → check-in → accommodation/service/room charge → extension/move → settlement → checkout → cleaning. Check-in requires available clean room; concurrent booking cannot double-book. Preserve guest creation when a subsequent reservation fails. Fix guest-account amount retention and show correct selected guest/room context.

Assets need identification, custody/location, status, maintenance history and auditable changes. Full historical asset import is out of commissioning scope; actual opening asset inventory is in scope.

**Done:** day/night stay boundaries use property timezone; room charges conserve order/folio money; checkout cannot bypass balance/deposit/accommodation blockers; asset maintenance effects are traceable.

### FS-16 — Floorplan and maintenance task context

**Priority:** P1. **Owner:** frontend/domain. **Dependencies:** FS-04, FS-15.

Use atomic versioned floorplan save with outlet-scoped state. Warn/save/discard deliberately before switching outlets with changes; never silently lose a draft. Tie maintenance editor values to the selected job/room/asset rather than shared card state. Record priority, assignee, materials/cost, status and resolution using correct domain commands. An unsuccessful action must not close the wrong card or show success.

**Done:** edit two outlets and two maintenance jobs sequentially without value leakage; stale save conflicts safely; technician work and room availability agree after resolution.

### FS-17 — Help, tours and operator language

**Priority:** P1. **Owner:** UX/docs/frontend. **Dependencies:** FS-09, FS-14–16.

Update onboarding and help for the fresh-install journey. Remove upgrade-only “do not repeat Intake” from this profile. Guides resume the correct task and mark business actions complete only after confirmation. Avoid overlays hiding actionable errors, totals or navigation. Link setup blockers to the real field/screen. Provide concise cashier, storekeeper, receptionist and manager quick guides, including pending/unknown actions and printer ambiguity.

**Done:** first-time operators complete their reference tasks without command IDs, technical jargon or help that contradicts the selected runtime.

### FS-18 — Terminal/Web authority and compatibility

**Priority:** P0 for shared release. **Owner:** native/platform. **Dependencies:** FS-01–05.

The native v2 adapter exists; validate it rather than replacing it based on an absence assumption. Confirm it uses the accepted command protocol, dependency/version rules and identity. Fresh commissioning must never attach a trial snapshot writer to the new shared project. Block unsupported/stale client versions visibly. Document where local PIN legacy access differs from Auth-bound shared access.

**Done:** Terminal A and Browser B see consistent effects under the selected profile; only supported writers can mutate the live business; switching flags cannot bypass authority checks. Limited terminal-only release, if selected, is labelled and fenced.

### FS-19 — Unified UI, navigation, accessibility and terminal performance

**Priority:** P1. **Owner:** UX/frontend/QA. **Dependencies:** FS-04.

Unify loading, error, empty, confirmed and retry presentation. Keep selected outlet/customer/room context visible. Use permission-aware navigation and honest disabled explanations. Verify focus, keyboard submission, dialog stacking, scrolling, touch targets, numeric fields, readable totals and status indicators at actual terminal resolution and supported browser sizes. Ensure business emblem placement never obscures controls. Profile large catalogue/count lists on the target Celeron terminal rather than inferring performance from a fast development host.

**Done:** no clipped payment totals or unreachable primary controls; stable interaction during scans/search; measured performance and screenshots recorded for target hardware. UI audit review counts are triage inputs, not automatically defects.

### FS-20 — Updates, offline boundaries and reconnection

**Priority:** P0 for safe ongoing use. **Owner:** platform/storage. **Dependencies:** FS-05, FS-18.

A cached shell does not authorize offline transactions. Until bounded signed grants are implemented and accepted, shared-v2 disconnection permits clearly labelled drafts only. Legacy native offline behavior is a separate release capability. Preserve pending commands across app/service-worker updates; show reload/update actions safely. Resolve stale chunk delivery, storage exhaustion and quota loss with actionable messages. Never assign a new command ID just because a request timed out.

**Done:** outage/reload/reconnect/update drills produce no duplicate or missing effects and no false completed sales. Unknown-command guard has a recoverable, visible path.

### FS-21 — Fresh business intake and controlled CSV

**Priority:** P0. **Owner:** data/domain/onboarding. **Dependencies:** FS-01, FS-08–11. **Replaces:** historical trial-data migration requirements.

Support file → explicit template selection/advisory detection → column review → server validation → dry run → apply → result summary. Existing source supports eleven master templates: products, stock items, stock locations, room types, nightly rate plans, rooms, customers, suppliers, asset categories, assets and invited staff profiles. It does not import opening balances, reservations, transaction history or asset history. Label those limits accurately.

Sequence data by dependency: configure business/outlets/tills/payment methods; create locations/suppliers/categories; provision Auth and staff; create stock/products/recipes with validated relations; create room types/rates/rooms; create assets against existing categories/rooms/locations; then establish physical opening stock and starting cash. Cyclic product-stock links require an atomic validated setup path, not ad hoc ID edits.

Add an explicit opening-stock intake path, either a reviewed CSV command workflow or the accepted inventory opening screen. For a large catalogue, provide a row-based import with item/location key, quantity, base unit, sealed/open fields where applicable, valuation, source date and idempotency. Do not claim it already exists in the eleven master templates. Cash float is a till-opening operation; supplier/customer balances, if genuinely outstanding on the start date, need explicit supported opening transactions or must be excluded and disclosed—never invented from trials.

Keep barcodes as text; reject scientific notation, duplicate external IDs, missing dependencies and invalid units. Apply is bound to the reviewed plan/hash and transaction. Cancel open batches with a reason; purge raw source on apply/cancel as designed. State retention for abandoned batches. Corrections go through cancel/restage or supported corrections; repeated apply cannot double records or opening stock.

**Done:** actual approved master-data pack imports on empty staging, invalid cases yield precise row errors, reruns are safe, and signed opening quantities/values match the new system. No trial-history matching is required.

### FS-22 — Connected staging and concurrency

**Priority:** P0 for supported profile. **Owner:** QA/platform/domain. **Dependencies:** FS-01–21 relevant paths.

Use a new isolated staging business and real Auth identities with final candidate schema/RPC exposure. Test terminal plus supported browsers, concurrent booking, sale versus count, stock transfer, duplicate payment, stale checkout, permission change, revoked device, reconnect and two-tab draft promotion. Verify session/guidance endpoints, redirect URLs, public-client key configuration and deployment asset consistency.

**Done:** exact-candidate evidence shows one effect per command, consistent balances and denied forbidden actions. A mocked Tauri test is not packaged-terminal or hosted Auth evidence. If only terminal-first scope is selected, mark shared cases deferred and keep their functionality disabled.

### FS-23 — Clean terminal installation, branding and hardware

**Priority:** P0. **Owner:** release/hardware. **Dependencies:** Gates A–D.

Build the approved Windows NSIS package on the supported build host with all required tests; distribute the installer, SHA-256 sidecar, release profile and setup guide. Record signing status honestly. The cashier terminal needs runtime prerequisites and drivers, not a development toolchain. Verify the app emblem/window/shortcut/package branding intentionally; do not assume a root PNG is packaged as an icon.

Identify the actual app data directory under the intended Windows user using the application identifier/path resolver. Do not guess paths or delete all AppData. Close trial clients and stop launch tasks before reset. Quarantine a labelled trial archive if useful for troubleshooting, but it is not production history or a reconciliation gate. Remove/reset only verified trial application state, trial caches, trial credentials and trial device registration through the commissioning procedure. A fresh/rehearsed live Supabase project is preferred to destructive in-place reset of an ambiguous project. Provision live credentials and redirects; stop old trial clients reaching it.

Install and initialise the current schema from empty state. Verify demo mode is off. Confirm no trial orders/payments/bookings/receipts, no stale queue, no trial staff privilege and no wrong-project connection. Complete actual Intake and opening data. Set exact USB queue/driver or LAN host, test printer and scanner, no cash-drawer pulse unless a drawer is explicitly part of this installation. Verify WebView/runtime, touch/keyboard, reboot and supported OS profile.

**Done:** the physical terminal starts the intended live profile with correct business branding, accepted actual data, functional scanner/printer and passing restart checks. Photos, installer hash, schema and device identity attached. Linux/Android support is not inferred from Windows acceptance.

### FS-24 — First trading day, recovery and handover

**Priority:** P0. **Owner:** release lead/business owner/QA. **Dependencies:** FS-23.

Run a full rehearsal on an isolated dataset before the final live baseline. Keep rehearsal effects out of live opening quantities. Before the first real transaction, capture the commissioned baseline and prove a restore to a separate target; only one device may synchronize after replacement. Complete go-live checks and begin controlled trading. Support the first complete close and review cash, stock, M-Pesa, credit and folios.

Before real trading, a verified trial/commissioning reset can repeat the clean procedure. After the first genuine transaction, blanket reset is no longer an acceptable rollback. Freeze writes when necessary, preserve commands and immutable receipts, restore/replay only through the tested procedure and reconcile post-baseline activity. Revoke/fence replaced devices. Record unresolved issues, training, support contact and handover evidence.

**Done:** first live close reconciles, core workflows are usable, backups restore, and owner/release lead sign the exact candidate's evidence. Unexplained stock/money differences, duplicate payment or lost commands stop further rollout.

## 6. Fresh-install operator journey and reset boundaries

| Stage | Operator task | System must provide | Exit check |
|---|---|---|---|
| Trial isolation | Identify trial terminal/project | Visible app/build/business/device identity | Old clients cannot write to live project |
| Install | Run verified package | Runtime setup and clear errors | Correct candidate launches |
| Enrol | Owner login and terminal registration | Role/device binding | Owner access, no trial accounts |
| Identity | Business/contact/logo settings | Saved preview and permissions | Receipt header/logo are correct |
| Configure | Outlets, till, tenders, tax, timezone | Safe defaults and validation | Required fields complete |
| Load masters | CSV or guided setup | Row errors/dependency ordering | Correct actual catalogue/rooms/assets |
| Open stock | Physical count and valuation | Reviewable opening movements | Approved quantities and value match |
| Open cash | Actual opening float | Till-opening audit | Cash count equals float |
| Hardware | Test scanner and receipts | Profile test and retained jobs | Both paper copies accepted |
| Rehearse | Complete shift and room stay | Clear outcomes and reports | Quantities and money conserve |
| Activate | Final baseline and Go Live | Honest readiness blockers | Correct authority/profile enabled |
| Operate | First real shift and close | Recoverable errors/support | First close signed off |

Reset scope must be recorded by project ID, terminal/device, Windows user and actual application data path. Distinguish executable uninstall from deleting persisted data—an uninstall alone may preserve trials. Do not clear unrelated browser profiles, Auth accounts, shared databases or production data. Store setup secrets securely and exclude them from screenshots/evidence. User authorization establishes the fresh-install direction; this document does not claim the terminal has already been wiped.

## 7. Acceptance matrix

All cases default OPEN unless evidence explicitly proves otherwise. Every result records commit, runtime/profile, schema, tester/time, actual output, evidence link and defects. Existing automated passes can be reused only when they cover the unchanged boundary on the candidate; hardware evidence belongs to the packaged build tested.

| ID | Scenario | Required result |
|---|---|---|
| FI-01 | Empty install + first launch | No trial data; current schema; demo off |
| FI-02 | Wrong project / old trial client | Clear rejection/isolation; no live write |
| FI-03 | Interrupted Intake + restart | Saved setup resumes correctly |
| FI-04 | Missing configuration | Go Live blocked with direct next action |
| FI-05 | Real Auth roles and terminal binding | Correct permissions; new device identity |
| FI-06 | CSV valid/invalid/ambiguous header | Explicit review; precise errors; no partial invalid apply |
| FI-07 | Barcode leading zeros/scientific notation | Text preserved; malformed values rejected |
| FI-08 | Import replay/cancel | No duplicate records; audit and source purge correct |
| FI-09 | Opening stock and valuation | Current and movement totals match approved sheet |
| FI-10 | Explicit zero versus uncounted | Distinct and correctly validated |
| TX-01 | Confirmed/rejected/conflict/blocked | Only confirmed clears inputs or claims success |
| TX-02 | Draft/pending/unknown | Accurate notice, preserved data, actionable recovery |
| TX-03 | Lost payment response + retry | Original command reused; one payment/receipt |
| TX-04 | Double click / two tabs | No duplicate business effect |
| TX-05 | Specialist draft reload/reopen | Correct target, values, types and fresh dependencies |
| TX-06 | Role/policy changes during draft | Review/rejection; no unauthorized replay |
| TX-07 | Guest creation succeeds, booking fails | Guest retained; no duplicate guest on retry |
| TX-08 | Folio payment rejected | Amount and selected guest remain intact |
| INV-01 | Package/portion/recipe sale | Correct stock unit and valuation |
| INV-02 | Batch prepare then sell | Ingredients consumed once; prepared output correct |
| INV-03 | Count/transfer/waste | Conservation, reasons, recoverable conflict |
| INV-04 | Partial/rejected/over GRN | Exact stock/payable effect and approval rules |
| POS-01 | Cash, manual M-Pesa, split tender | Correct paid/balance/change; no invented provider confirmation |
| POS-02 | Credit and room charge | Correct linked accounts/folios and limits |
| POS-03 | Refund/reversal | Correct money effects; no automatic false stock restoration |
| POS-04 | Counted close + variance | Explicit count, approval and reconciled report |
| HOS-01 | Booking race / dirty room / block | No double booking; valid readiness enforcement |
| HOS-02 | Stay move/extend/pay/checkout | Timezone, periods, deposit and balance correct |
| HOS-03 | Asset/maintenance update | Correct target; audit/cost/location consistent |
| UX-01 | Outlet switch with draft | Explicit preserve/discard choice |
| UX-02 | Scan during payment/refund | Background cart unchanged |
| UX-03 | Small viewport/touch/keyboard | No clipped totals or inaccessible controls |
| UX-04 | Help resume/completion | Correct guide; completion follows actual confirmation |
| AUTH-01 | Offline sign-out/operator switch | Prior data hidden; unresolved commands retained safely |
| AUTH-02 | Revoked/expired operator/device | Mutations denied; clear recovery |
| RC-01 | Both copies | Correct labels, identical money, exact four-line footer |
| RC-02 | Logo + footer + cut buffer | Logo readable; footer complete; no cut-off |
| RC-03 | Logo replace, restart, old reprint | New receipt uses new logo; old receipt retains original |
| RC-04 | Missing/invalid logo | Safe explicit fallback; no transaction failure |
| RC-05 | Long/many items, huge totals, zero/change | No clipping or misaligned amounts |
| RC-06 | Selected Web print | Only selected immutable receipt pair; no blank page |
| RC-07 | USB and supported LAN profile | Actual paper output; correct feed/cuts |
| RC-08 | Printer off / interrupted send | Payment remains saved; uncertain retry warns of duplicates |
| RC-09 | Malicious text/control bytes | Sanitized printer output; no injected commands |
| RC-10 | Header/tax settings change | Historical receipt unchanged |
| OPS-01 | Restart/offline/reconnect | No lost commands; profile-correct offline behavior |
| OPS-02 | Replace terminal from backup | Totals restored; old device fenced |
| OPS-03 | App update with pending work | Queue survives; no stale-client write |
| OPS-04 | Full rehearsal and first live close | Stock/cash/folio totals agree; owner sign-off |

## 8. Documentation changes to make with implementation

Update `DEV-FINAL-SPRINT.MD` with this active revision and clearly label older content as historical. Update `docs/DEPLOYMENT_RUNBOOK.md` to put fresh terminal commissioning first for this installation; retain EXISTING_TERMINAL_UPGRADE.md only as a separate future/live-upgrade reference. Do not mix upgrade “do not repeat Intake” with this fresh-install path.

Update RECEIPT_SPEC and RECIEPT-PRINCIPLES with resolved logo/footer order, immutable branding, pretty identifiers, thermal raster/profile limits, print-root contract and physical proof. Update the receipt settings guide to include logo replacement, sample/reprint distinctions and uncertainty. Update Auth setup, CSV guide, terminal acceptance, completion ledger, test evidence and current release state to reflect actual verified results and the fresh-data decision. Remove blanket “testing deferred” from work marked accepted. Link the selected authority profile from all commissioning guides.

Maintain a brand asset manifest: source filename, purpose, version/hash, dimensions/format, configured use and derived thermal/icon assets. Keep generic ServOS product identity separate from business identity. No receipt template rewrite should be needed for future business-logo changes.

## 9. Definition of done and handover package

A work package is accepted only when its required behavior is implemented, meaningful checks pass, operator-facing states are usable, permissions/recovery are verified and documentation matches. Status vocabulary: NOT_STARTED, IMPLEMENTED_UNVERIFIED, BLOCKED, VERIFIED_AUTOMATED, VERIFIED_STAGING, ACCEPTED_PHYSICAL, DEFERRED_OUT_OF_RELEASE. “Implemented” alone is not accepted.

The release package contains:

- Exact commit, schema hashes, authority profile, feature flags and supported platforms.
- Installer and checksum; signing status; installation/runtime/driver instructions.
- Passing required software gates with links and explicit limitations.
- Approved real master-data pack and opening-stock/cash baseline; no trial operational history.
- Business identity and branding versions; both physical receipt copies and accepted printer settings.
- Staff/device setup record without secrets; role and approval acceptance.
- Scanner, restart, outage and replacement-restore evidence.
- Full-shift/stay rehearsal, first-close report, defects and support/escalation ownership.

Production go/no-go requires every release-critical gate for the selected profile. Historical migration and trial-replica matching are no longer gates. Current opening-stock integrity, proper receipts, operator privacy, transactional correctness, backup recovery and physical acceptance remain gates. Do not use a single completion percentage as a substitute for these decisions.

## 10. Developer execution brief

Start with FS-01–03. Preserve existing source progress and review the diff from this pinned baseline before editing if main has moved. Complete FS-04–06 at the common command/receipt boundary, then audit every consumer. Implement fresh Intake and opening-data workflows, not legacy trial-history conversion. Keep backend authority and client flags explicit. Use the acceptance matrix to produce evidence, not just additional screenshots or source-string checks. Do not enable live trading until the packaged candidate passes its physical commissioning and financial/stock rehearsal.

## Appendix — preserved repository sprint at the reviewed baseline

The following is historical reference, retained verbatim. Its former baseline, status statements, upgrade requirements and trial-history migration/cutover instructions do not override Sections 1–10 above. Original P0–P27 detail and crosswalk remain available here. Future edits should change the active section and record evidence there instead of appending contradictory status paragraphs to this archive.

---

# ServOS DEV FINAL SPRINT — UPDATED

## Release recovery, operator workflow completion, and dual-runtime acceptance

**Prepared:** 1 October 2026, Africa/Nairobi  
**Repository:** `davemusau00/SERVEOS-WEB`  
**Evidence baseline:** `abe5db553b3e52e16862669ae6007e5d88933331`  
**Status:** EXECUTION SPECIFICATION — RELEASE BLOCKED  
**Companions:** `PRODUCT-INVENTORY.MD`, the updated gap/deployment report, operation manifest, domain contracts, deployment runbook.

This is a developer-ready revision based on the audited commit, not a declaration that implementation or deployment has been completed. Future commits must be checked against this baseline before applying fixes. Owners below are responsibility roles to assign at sprint kickoff, not named people or assumed staffing.

## 1. Governing objective and document precedence

Complete a reliable single-business hospitality system in which Terminal and Web present coherent operator workflows and use explicitly controlled business authority. A cashier, bartender, storekeeper, receptionist, housekeeper, manager, or owner must be able to finish normal work without understanding command envelopes, UUIDs, database tables, canonical units, or synchronization internals.

**Operating principle:** the operator supplies the real-world facts; ServOS calculates, derives, defaults, validates, links, reconciles, and records everything it can safely know. Inference must be shown for review when it could change business meaning. Sensitive overrides require explicit authority and an auditable reason.

This active plan supersedes earlier execution order, stale “current tree passed” statements, and blanket instructions to defer testing. It retains the original P0–P27 objectives through the crosswalk below. The original repository sprint is preserved verbatim in Appendix B for design detail and history; its dated evidence and conflicting sequencing do not override this revision. `PRODUCT-INVENTORY.MD` remains the detailed product/inventory specification. Resolve genuine domain ambiguities explicitly rather than silently changing financial or stock semantics.

### Non-negotiable release rules

1. Do not mark a feature complete because a button, migration, manifest entry, or source-string test exists.
2. Do not disable validation, weaken authorization, delete failing assertions, or bypass locked dependency checks to obtain green CI.
3. Do not claim a failed suite's later tests passed. Record skipped, blocked, and not-run evidence separately.
4. Do not infer provider settlement from a manually recorded M-Pesa/card entry.
5. Do not enable legacy snapshot writing and shared v2 transaction writing concurrently for the same business.
6. Do not interpret a cached page, local draft, or pending command as a completed business transaction.
7. Preserve valid existing business records, stable IDs, immutable evidence, and original command IDs during retries and migration.
8. Validate each change at its affected boundary before stacking dependent work. Run the full candidate gates at integration milestones.
9. Defer unrelated feature expansion until routing, compilation, transaction completion, and recovery are reliable.

## 2. Verified checkpoint and evidence limits

| Check at audited head | Observed result | Sprint disposition |
|---|---|---|
| TypeScript | Four errors | Release blocker |
| Node suite | 162 tests; 156 pass; six fail | Triage existing failures; keep four newly passing tests |
| Native domain CI | Five Rust compile errors | Release blocker |
| Desktop CI | Failed; locked dependency state unresolved | Reproducibility blocker |
| Base cloud CI | Passed | Retain coverage |
| v2 cloud CI | `room.condition` rejected after migration 038 | Repair routing before interpreting later suite status |
| Latest CI | Failed | No release candidate accepted |
| UI inventory | 3,810 interactions; 408 review candidates | Manual triage required, not 408 proven defects |
| Parity declarations | 85 operations: 64 web implemented, 13 partial, six missing, two blocked | Source coverage only |
| Operator UX acceptance | No accepted entries | Required gate remains open |
| Floorplan/Maintenance/guidance | New source implementations | Complete and accept; do not rebuild blindly |

Evidence source: [exact-commit CI](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/36788540937). This plan is based on that audited snapshot; it does not assert that later unreviewed commits have the same failures.

**Correction to earlier historical wording:** native v2 source in `src-tauri/src/lib.rs` includes gated command enqueue/send/acknowledgement, feed synchronization, and shadow-state logic. The remaining task is compilation, contract completeness, authority fencing, and acceptance. It is inaccurate to scope that adapter as wholly absent. Documentation and manifests must distinguish implemented-but-unverified from missing.

No hosted business migration, physical printer/scanner run, live operator walkthrough, or production cutover was established by the audit. Browser launch failures caused by missing executables are infrastructure failures, not counts of broken screens.

## 3. Authority model and supported release profiles

| Profile | Writer authority | Permitted offline behavior | Activation requirement |
|---|---|---|---|
| Existing legacy terminal | SQLite plus the existing ordered legacy replication path | Existing approved local terminal behavior | Preserve working installation; do not casually migrate |
| Isolated v2 staging | PostgreSQL shared command execution; native SQLite shadow/cache | Web drafts; no implied offline finalization | Disposable/staging infrastructure, explicit flags |
| Shared v2 production | PostgreSQL command authority with validated native/Web clients | Online-only unless a separately accepted signed offline design is enabled | All release, migration, operator, and hardware gates |
| Shared v2 with offline trading | Explicit server-issued, bounded, revocable grants/reservations | Only operations and quantities authorized by those grants | P23 acceptance in addition to shared-v2 gates |

Do not promise that an online-only shared-v2 release preserves unrestricted legacy offline trading. If the business requires offline trading, P23 is mandatory before its cutover. Native and browser may have different technical offline capabilities, but the user-facing state and operational limits must be explicit.

## 4. Delivery stages and dependency gates

| Stage | Work packages | Entry | Exit |
|---|---|---|---|
| A — restore foundations | FS-01–03 | Audited baseline rebased against current head | Complete domain routing; reproducible compilation; meaningful CI |
| B — safe task completion | FS-04–09 | Relevant domain paths executable | Reliable result handling, drafts, receipts, identity, commissioning |
| C — domain and UX closure | FS-10–17 | Stage B contracts available | Stock/finance/hospitality/new modules accepted |
| D — runtime and quality closure | FS-18–20 | Stable domains | Native/Web authority, PWA, accessibility, performance, parity accepted |
| E — business rehearsal | FS-21–24 | Same-commit automated gates green | Reconciled migration, hardware, rollback and controlled launch |

Independent work packages can be assigned concurrently after interfaces are agreed. Integration order remains binding: floorplan acceptance cannot substitute for domain routing; no production cutover may precede migration reconciliation and writer fencing. Assign one integration owner for dispatch/session contracts and one owner for the command-outcome/draft interface to prevent incompatible parallel edits.

## 5. Work packages

### FS-01 — Restore complete migration routing

**Priority:** P0. **Owner:** database/domain. **Maps to:** original P0, P18, P19.

**Problem:** expansion 038 replaces `servos_v2.dispatch` and bypasses previously installed specialized handlers. The observed `room.condition` failure proves a regression; other bypassed families are source-confirmed routing risks.

**Implementation:** preserve the full existing dispatch chain with a narrow floorplan wrapper, or replace it with an exhaustive canonical dispatch definition and equivalent validation. Handle already-applied staging schemas with a forward repair migration. Do not assume editing an old SQL file repairs an installed database. Preserve permissions, search paths, offline restrictions, command deduplication, optimistic versions, and transaction boundaries.

**Required routing matrix:** room.condition; roomStay.settings; catalog.createWithOpeningStock; inventory.produceBatch; credit and M-Pesa commands; staff/device/manager approval; POS room charge; transfer/merge/discount/order comp; payment refund/reversal; closeDay.generate; business.settings.save; floorplan.save; all remaining declared commands.

**Acceptance:** after all migrations, execute valid, forbidden, stale-version, and replay cases for every affected family. Verify actual record, stock, financial, and audit effects. All cloud suites reach completion, including the floorplan fixture. Revisit the previous stock-count assertion after routing is repaired; it has not been cleared by the newer, earlier failure.

**Current status (2026-10-01):** Source repair implemented, unverified. Expansion 038 now wraps the prior dispatcher and handles only `floorplan.save`; forward expansion 042 delegates already-upgraded databases to the preserved `dispatch_before_batch_preparation` chain and repairs those that installed the former 038 definition. Other operations retain the prior offline rejection and specialized domain routes. Both source paths revoke direct execution on wrapper/internal dispatch functions. Disposable suites are wired through sorted expansion migrations, but no database/test execution has been performed; FS-01 acceptance remains open.

### FS-02 — Fix compilation and dependency reproducibility

**Priority:** P0. **Owner:** frontend/native. **Maps to:** P0.

Fix the four TypeScript errors without broad casts that discard validation:

- WebCatalogInventory: decode/normalize count maps to numeric/null values.
- WebFloorplanView: pass BlockerCard content through its supported children API.
- WebGuidanceViews: wrap click callbacks so React events are not passed as guide IDs.
- WebStaffAdminView: explicitly type editable staff-ID state and validate identities at submission.

Fix native store error-type collection at the audited line 3075 and batch output references to missing ID/time helpers and non-existent session organization/property fields at 3412–3413. Use established repository conventions; do not invent identity fallbacks. Reconcile `src-tauri/Cargo.lock` against its manifest and review changes.

**Acceptance:** clean `npm ci`, lint/build, locked native-domain test, locked desktop check/test. No new suppressions or removal of `--locked`. Domain tests prove batch output identity and quantities, not merely compilation.

**Current status (2026-10-01):** Source corrections implemented, unverified: Web count-session values are narrowed into `Record<string, number | null>`; guide buttons no longer pass click events as guide IDs; staff binding state is explicitly typed and validates Auth UUID syntax before command submission; native batch-preparation movements now use the existing UUID/time helpers and the local business/property identifiers rather than nonexistent session fields. The floorplan blocker already uses the shared component's children API. Source assertions were updated; compilation, dependency-lock reconciliation, and native/Web test acceptance remain deferred.

### FS-03 — Make CI and release evidence trustworthy

**Priority:** P0. **Owner:** release engineering. **Maps to:** P0, P18.

Separate browser prerequisites from failing frontend checks or condition browser execution on completed installation. Keep independent cloud/native jobs so one failure does not hide unrelated evidence. Triage the same six Node failures: explicit tax class, batch consumption, native identity, shared terminal identity, count recovery, catalog/inventory coverage. Update stale structural assertions only after intended behavior is demonstrated.

Make the deployment candidate depend on required job results; `npm run build` alone is insufficient because Vite can emit a bundle despite failed type checking. Metadata-summary success must not be shown as overall release success. Record SHA, schema hash/order, runtime versions, test profile, job conclusions, and artifact links.

**Acceptance:** a deliberate missing-browser condition is reported as infrastructure failure; a deliberate domain rejection fails its behavioral test; a failed required job blocks candidate promotion. Candidate CI genuinely launches all configured viewport projects.

**Current status (2026-10-01):** Workflow source updated, unverified. Preview and production browser acceptance are isolated in separate jobs with explicit Playwright installation steps; frontend quality, native, cloud base/v2, and desktop jobs remain independent. The evidence index records required job results, SHA/schema hash, runtime, and artifact names; a main-branch candidate artifact is gated on success of all required jobs and explicitly does not authorize production deployment. CI has not run after these changes. The six previously identified Node failures, deliberate infrastructure/domain failure behavior, protected-branch configuration, and actual candidate artifact acceptance remain open.

### FS-04 — Standardize command outcomes and prevent false success

**Priority:** P1 release blocker. **Owner:** runtime/frontend. **Maps to:** P1, P14, P19, P20.

Introduce a discriminated result contract across the shell and module callers. Suggested outcomes: CONFIRMED, DRAFT_SAVED, PENDING, OUTCOME_UNKNOWN, REJECTED, CONFLICT, BLOCKED. Include command/draft identifiers and actionable error information where applicable. Names may follow repository conventions, but the semantic distinctions are mandatory.

A successful server commit with a delayed local refresh must remain CONFIRMED with an explicit “view refreshing” state; it must not invite a new transaction. Close/reset a transaction form only after confirmed outcome, or after an explicit operator choice to leave a saved draft. Preserve inputs and focus on rejection/conflict. Uncertainty must retain and retry the original command ID. Add a synchronous in-flight guard at the submission boundary; disabled button state alone is not duplicate protection.

Update POS payment/refund/void/configured-item/table/room/credit actions, Maintenance, procurement, inventory, hospitality, and admin callers. Floorplan now checks its boolean result; migrate it to the common contract without regressing that behavior.

**Acceptance:** reject and time out each critical operation; inputs stay recoverable, success is never shown prematurely, and rapid clicks/scans create at most one intended effect.

**Current status (2026-10-01):** Partial source implementation, unverified. Browser submissions now have a synchronous in-flight guard and use the existing shared `CommandOutcome` union with CONFIRMED, DRAFT_SAVED, PENDING, OUTCOME_UNKNOWN, REJECTED, CONFLICT, and BLOCKED states. The Web shell classifies queue/server results at its submission boundary; POS, Front Desk, guest-account/folio reversal, housekeeping, and refund callers consume the rich outcome and report non-confirmed states explicitly. POS orders, configured items, voids, tenders, credit charges, till opening, refunds, room charges, and table actions now close/reset state only after CONFIRMED. Remaining modules use a deliberate boolean adapter that is true only for CONFIRMED, avoiding accidental truthiness success while they are migrated. Before sending a command, its durable queue row changes to `OUTCOME_UNKNOWN`; lost acknowledgements retain the exact command ID for replay. Any new Web business submission is blocked while an unknown command remains, and linked drafts also block replacement until reconciliation. Rejected/conflicted forms retain their current inputs; a delayed feed refresh after synchronized acknowledgement remains confirmed. Activity explains not to submit again. Full rich-outcome adoption across Native/Web feature callers, focus restoration, domain recovery acceptance, and end-to-end rejection/timeout verification remain open.

### FS-05 — Typed drafts and uncertain-result recovery

**Priority:** P1 release blocker. **Owner:** runtime/domain. **Maps to:** P1, P14, P21.

Give each supported specialist workflow a versioned draft schema, validation, serialization, and reopener. Do not rebuild nested command payloads with a generic shallow `{...payload, ...fields}` merge. Reuse the initial operation serializer for resumed edits, including money, units, dates, booleans, nested data, and stable generated IDs.

Link pending/unknown commands to their drafts. Reconcile the original outcome before allowing replacement submission; clear or retire redundant drafts once confirmed. Refresh permissions, policy, and expected record versions on review. Block incompatible draft schema versions with an explained migration/re-entry path. Protect sensitive inputs across payloads, inputValues, fields, and technical details; payload-only token stripping is not a complete draft contract.

**Acceptance:** interruption → reload → review → corrected submit works for POS, count, delivery, reservation, refund, and maintenance. Lost response after server commit produces one effect. Edited guest name, monetary amount, and dates persist exactly as reviewed. Cross-operator drafts remain isolated.

**Current status (2026-10-01):** Partial. The browser queue persists OUTCOME_UNKNOWN across reload and retries the original command ID; a confirmed original retires its redundant linked draft, while unresolved originals block replacement submission. Draft persistence now strips sensitive key/value material from payloads, form input maps, sensitive form fields, validation text, and Activity technical details. Queued command payloads may still contain one-time authorization tokens required for exact replay; IndexedDB protection/encryption remains open. Operation-specific serializer restoration (the current generic payload merge is still unsafe for nested/converted values), versioned migration UX, full specialist-workflow coverage, and acceptance remain open.

### FS-06 — Reliable 80mm receipt output

**Priority:** P1. **Owner:** POS/printing. **Maps to:** P14, P19, P26.

Render the selected immutable receipt through a shared document model and the expected print portal. Web `window.print()` must not hide the application without supplying `#thermal-receipt-print-root`. Align native, browser print, preview, and download representations. Use actual captured business/tax/tender data; do not regenerate old receipts from today's product prices or fabricate fiscal/provider status.

Support long item names, modifiers, quantities, tax display, total, paid/due/change, split tender, refunds, and appropriate reprint indication. Printing failure must not roll back or repeat the sale. Provide an explicit reprint path and useful hardware errors.

**Acceptance:** print the selected receipt only; native and Web totals match; test long receipts and paper width on XP-80T/actual configured printer. Record OS/driver/queue, paper output, clipping/cut results, and successful retry after printer outage.

### FS-07 — Scanner ownership and POS input discipline

**Priority:** P1. **Owner:** POS/inventory. **Maps to:** P8, P13, P26.

Give scanner capture one active workflow owner. Disable/background-isolate it during tender/refund/approval/other dialogs unless that dialog explicitly owns scans. Respect read-only, busy, missing-order, and permission state. Preserve barcode strings including leading zeros and long identifiers; resolve product vs package/alias deliberately. Reject ambiguous duplicates with a correction task.

**Acceptance:** scan with focus on dialog buttons, text inputs, and background surfaces; no unintended order change. Rapid scans are either correctly serialized or clearly blocked. Count and receiving scans use the configured package conversion exactly once. Unknown-scan assignment does not silently add stock.

### FS-08 — Operator identity, local lock, and manager approvals

**Priority:** P1. **Owner:** identity/runtime. **Maps to:** P16, P22.

Web sign-out must clear/lock locally even when remote revocation fails. Separate that failure notice from local success; ensure a visible recovery channel in the active app. Do not erase unresolved business commands to achieve logout. Validate invitations, recovery, Auth-to-existing-staff binding, active staff, device ownership/revocation, role changes, and switching. Use the same stable staff identity where native already exists.

Replace normal operator UUID/token copying with contextual approval requests. Show operator, action, target, amount/variance, reason, expiry, and outcome to the manager. Retain server-side scope, single-use, actor binding, and replay protections. Non-manager discount/comp approval must have a complete path.

**Acceptance:** offline sign-out hides prior records immediately; revoked or wrong staff cannot resume privileged state; expired/wrong-target approvals are rejected; shared-device switch does not reveal another operator's broader cached records.

**Current status (2026-10-01):** Source and setup documentation implemented, unverified. The native online operator flow binds an authenticated Auth user to the existing stable local Staff ID, keeps terminal device identity separate, stores and rotates refresh credentials through the OS keyring, and clears the active local session on sign-out. The setup runbook covers invitations, stable-ID binding, one-time Admin device commissioning, operator switching, offline legacy-only behavior, and keeping staged v2 writes disabled. This documents intended setup and source behavior; it is not evidence of a successful hosted Auth flow, applied staging migrations, packaged-terminal credential-vault behavior, or operator acceptance. Auth invitation/recovery, cross-operator record isolation, device revocation, credential cleanup, and role/permission-denial acceptance remain open.

### FS-09 — Repair commissioning, policy, and permission contracts

**Priority:** P1 release blocker. **Owner:** platform/admin. **Maps to:** P2, P16.

Restore the full session contract removed by expansion 023: lifecycle stage, setup/profile/readiness plus the intended property-context whitelist. Fix the readiness/enablement circular condition; readiness must be true before Go Live is permitted. Keep settings available through a scoped commissioning path while operational trading remains disabled.

Readiness must verify usable business/outlet/stock/catalog/payment/staff prerequisites rather than only stored checkbox flags. Route blockers directly to the required form and back. Use canonical permission helpers consistently for workspace visibility, actions, and wildcard grants. Initialize all policy fields from loaded state, including checkout/cutoff, without overwriting with defaults on unrelated edits. Use property timezone for input, display, and business-date calculations.

**Acceptance:** empty staging business completes supported commissioning without SQL intervention. Missing configuration blocks with a fix link. A property with 11:30/17:00 settings retains those times after unrelated edits. Restricted custom roles see the tasks they can actually perform.

### FS-10 — Smart Item, units, packaging, recipes, and atomic setup

**Priority:** P1. **Owner:** catalog/inventory. **Maps to:** P3–P6, P11.

Retain the existing wizard and atomic source; finish its missing type/portion parity. Define purchase packaging, count representation, sale portion, barcode aliases, cost, tax class, outlet/location, and stock linkage consistently. Home quick-add must use the same valid creation contract as Catalog. Service/recipe-only products must not acquire unrelated stock masters. Typed unit conversion must reject incompatible dimensions on the server, not only in previews.

**Required examples:** four six-packs at KES 900 → 24 cans, KES 150 unit cost; 5 kg → 5,000 g; 750 ml bottle with 30/60 ml servings and optional sealed whole-bottle sale. These are acceptance fixtures, not replacement business defaults.

**Acceptance:** product, stock, optional opening movement, package metadata and prices commit atomically or none do. Retry is idempotent. No accidental zero/unknown tax-class assignment. Native and Web produce equivalent quantities/costs for the same physical input.

### FS-11 — Counts, correction, transfers, waste, and sealed/open stock

**Priority:** P1. **Owner:** inventory/domain. **Maps to:** P8–P10.

Resolve the cloud variance-movement assertion by specifying and testing zero-delta behavior; do not assume implementation or fixture is automatically correct. Count drafts include all relevant rows, physical pack/loose or sealed/open components, unknown scans, baseline, and review. Preserve explicit zero. Absolute Admin correction and count variance must remain distinct operations with reasons and authority.

Transfers emit paired movements with one transaction. Preserve canonical quantity and sealed/open state; if the current single-open-container representation cannot express a destination, explain and block rather than corrupt metadata. Waste is reasoned and auditable. Existing quantities and movement-derived quantities reconcile under documented opening/conversion rules.

**Acceptance:** unchanged/increase/decrease, concurrent transfer/count, stale baseline, repeated commit, bottle opening, partial remainder, and rejected conversion cases pass. Operator sees physical quantities and variance without manual arithmetic.

### FS-12 — Batch preparation and serving consumption

**Priority:** P1. **Owner:** kitchen/POS/domain. **Maps to:** P12–P13.

Finish and accept the existing batch source. Separate recipe authoring from production. Full batch input quantities and declared yield derive per-portion cost; preparation consumes inputs and creates finished portions. Selling prepared portions does not consume the raw recipe twice. Preserve positive modifier ingredient deductions and their version dependencies. Reject shortages and invalid yields atomically.

**Acceptance:** prepare a known-yield batch, sell portions plus a modifier, waste a portion, and reconcile every ingredient/output movement and valuation across native/Web. Repeat original command and simulate failure mid-operation; no partial batch or duplicate stock.

### FS-13 — Procurement, receiving, invoices, and supplier payments

**Priority:** P1. **Owner:** procurement/finance. **Maps to:** P7, P15.

Default to outstanding approved quantity. Enter packages in supplier language and show derived canonical stock/cost. Validate accepted/rejected quantities, reason, partial receipt, and over-receipt approval before submission. Preserve drafts on failed commands. Carry supplier/PO/receipt context into invoice matching and payment; show evidence rather than only asking for an acknowledgement checkbox.

**Acceptance:** full/partial/over/rejected delivery, package scan, duplicate invoice/reference, stale PO, unauthorized override, and response-loss cases produce correct stock, remaining quantity, payable, and audit. Payment records must not claim bank disbursement unless integrated confirmation exists.

### FS-14 — POS, finance, customer credit, M-Pesa, and close day

**Priority:** P1. **Owner:** POS/finance. **Maps to:** P14, P18.

Finish the complete shift lifecycle: assigned till/opening float → order → fire → payment/credit/room charge → receipt → refund/reversal → reconciliation → counted close/report. Compute change, remaining balance, split-tender total, credit availability, and till variance. Require actual physical cash count, including explicit zero. Enforce configured variance approval with an actionable request.

Reconcile native `customerCredit.charge` with staged `credit.charge` by effects and payload translation; item comp and whole-order comp are not equivalent. Show supported granularity and enforce approval/reason/stock disposition. Manual M-Pesa references and statement discrepancies remain explicit evidence, not provider confirmation. Restore all relevant routes through FS-01.

**Acceptance:** paid balances, A/R, folio transfer, stock firing/void disposition, refunds, tender evidence, and close-day totals reconcile. Double-submit and lost-response never duplicate a payment. Refunds do not silently restock without the intended audited stock operation.

### FS-15 — Hospitality reference workflows

**Priority:** P1. **Owner:** hospitality. **Maps to:** P2, P19.

Use common task components for Rooms and Front Desk entry points. Configuration belongs in Rooms & Rates; daily tasks should have the same readiness and error behavior everywhere. Quick reservation carries guest, availability, capacity, rate, arrival/departure, and policy-derived timing. Check-in checks room readiness and valid stay; moving checks destination, overlapping intervals, blocks and capacity. Checkout explains accommodation posting, folio/deposit/balance blockers and links directly to their resolution.

Housekeeping separates operational condition, inspection, maintenance/blocking, and actual occupancy. Folio deposits, application, service charges, POS room charge, settlement and reversals must preserve evidence and return the operator to the originating guest/stay.

**Acceptance:** simultaneous room bookings; two entry points for the same task; day/night stay; timezone-crossing manager; dirty/blocked destination; partial payment; unapplied deposit; failed move; stale checkout readiness. No conflicting state or hidden manual date arithmetic.

### FS-16 — Floorplan and Maintenance completion

**Priority:** P1/P2. **Owner:** operations UI/domain. **Maps to:** P19.

Floorplan: retain atomic whole-outlet save, baselines, occupied-state preservation and removal guard. Preserve drafts or offer Save/Discard/Stay before outlet changes. Keep generated coordinates valid for larger layouts. Ensure visible invalid-layout explanations. Test concurrent occupancy change while editing and sufficient read/write rights for view-only roles.

Maintenance: scope form state to work-order ID and pass the clicked target explicitly. Fix false success on returned failure. Accept report/assign/start/complete/cancel with resolution and optional supplier-invoice service cost. Complete parts-consumption UI with stock dependencies or explicitly exclude/disable it in the selected release profile; an empty parts array must not be represented as full parts parity.

**Acceptance:** two open repair cards cannot complete each other's records; failed actions retain input; supplier cost posts once. Floorplan outlet switch does not silently lose changes; occupied orders remain attached after valid layout save.

### FS-17 — Contextual help and honest guide progress

**Priority:** P1/P2. **Owner:** guidance/UX. **Maps to:** P17.

Retain task-specific article/guide mapping and server-confirmed practice events. Fix callback typing and completed-state reset behavior. Provide explicit Restart rather than automatically reinitializing completed guides. Overlay/focus design must allow the intended practice action without trapping or hiding it. Align anchor availability, role visibility, progress versioning, and error messaging.

**Acceptance:** initiate from Home/article/context; resume after reload; complete and remain completed; restart intentionally; denied/rejected/draft commands do not advance; expected confirmed command advances once. RPC failure accurately distinguishes local progress from cross-device persistence.

### FS-18 — Terminal v2 adapter and authority fencing

**Priority:** P0 for shared-v2 release. **Owner:** native/platform. **Maps to:** P22.

Complete and verify the already-present native adapter: authenticated identity, stable staff/device binding, durable queue, schema-2 envelope, dependency read set, original-ID retry, acknowledgement persistence, feed application and authorized baseline. Reject pending legacy outbox before enabling shared writes. Detect cross-operator pending work and provide a supported resolution path. Revalidate grants and baseline scope on account/policy change.

Map native command names, payloads, quantities, response shape and permissions to staged contracts explicitly. Unsupported native workflows must be clearly blocked under shared authority rather than silently falling back to the legacy writer. Expose confirmed-but-refreshing state without asking the operator to repeat an acknowledged action.

**Acceptance:** server commit followed by network loss/process kill; restart and replay; feed gap; revoked device; changed grants; another operator's pending command; stale baseline; drained and undrained legacy outbox. Exactly one writer authority and one business effect throughout.

### FS-19 — Shared UX, accessibility, navigation, and performance

**Priority:** P1/P2. **Owner:** UX/frontend. **Maps to:** P1, P18, P20, P26.

Triage all 408 candidates: fix, confirm not applicable, or record a reasoned accepted exception. Adopt common dialogs, busy buttons, fields, blockers, searchable choices, and operator error messages in active production paths. Inventory all empty-state/card/row/menu actions and CRUD/archive/reference behavior. Avoid pretending every record type needs deletion; immutable records require reversal/archive workflows.

Reduce task hunting across the 23-workspace registry through role homes and meaningful grouping. Preserve context across module links. Primary actions remain visible and explain disabled state. Dialog footers work at 1024×600, 1280×720, 1366×768, and 390×844; test real touch/keyboard targets, focus trap/return, Escape, zoom, and text overflow.

Measure cold start, scan response, tab change, count/history rendering and memory on realistic records and the target Celeron terminal. Investigate the prior ~992 kB entry bundle; split unused demo/native paths and paginate long history where measurements justify it. Do not set a bundle-size exemption as a performance fix.

**Acceptance:** no critical unresolved audit candidates, no blank workspace/uncaught render errors, no unusable required action at supported sizes, and recorded representative operator timings.

### FS-20 — PWA updates and offline capability

**Priority:** P1 for supported browser operation; P0 if offline trading is promised. **Owner:** platform. **Maps to:** P21, P23.

Accept installation icons, standalone launch, shell-only caching, stale chunk recovery, and update behavior. Do not activate a new build during active/unknown financial submission or discard dirty drafts on restart. Keep authenticated business API responses outside public shell caching. Provide storage failure/quota/eviction recovery without claiming queued commands are safely stored when persistence failed.

Treat signed offline authority as a distinct capability: define permitted commands, bounded stock/till/receipt/room authority, expiry, exhaustion, reconciliation and conflict policy. Device clocks and cached permissions alone cannot grant authority. If not implemented and accepted, keep shared-v2 trading online-only and show what offline work can be saved.

**Acceptance:** update during payment, offline shell reload, IndexedDB failure, storage loss, stale tab, expired grant, allocation exhaustion, reconnect and duplicate replay. No phantom success or uncapped offline financial/stock writes.

### FS-21 — Controlled CSV import and migration reconciliation

**Priority:** P0 for cutover. **Owner:** data/domain. **Maps to:** P16, P25.

Provide file → template detection → advisory mapping → preview → row validation → dry run → explicit apply → reconciliation. Preserve identifiers and barcode strings; never silently accept scientific notation or truncate leading zeros. Apply dependency order across business/outlets/locations, suppliers/staff, catalog/stock, rooms/rates, assets, and relevant balances. Clearly separate master-data imports from historical transactions.

Snapshot existing terminal data and its cloud replica; identify authority before reconciliation. Preserve references, timestamps/timezone meaning, archive state and immutable history. Specify rejected-row handling, duplicate external IDs, rerun idempotency, and recovery from interrupted batches. Do not reset or reseed a live installation to resolve schema problems.

**Acceptance:** representative existing terminal export imports into isolated v2; local/cloud/movement-derived stock and all control totals match, or each approved exception has an audited resolution. Read-only legacy comparison is useful evidence but not proof of completed v2 migration.

**Current status (2026-10-01):** `IMPLEMENTED_UNVERIFIED` for the bounded Web master-data slice only. Source now supports products, stock items, customers, suppliers, stock locations, room types, nightly KES rate plans, rooms, asset categories, assets, and Auth-bound staff profiles. Header-based template detection is advisory and requires operator confirmation; ambiguous matches do not change the selected template. Staff imports require an already-invited Auth user, stable staff ID, explicit canonical role, and the existing `staff.create` permission/role validator; CSV never creates Auth users or custom grants. Open batches can be cancelled with an audited reason; cancel/apply/dry-run serialize on the batch row, cancelled IDs cannot be reused, and private source/exact-plan rows are purged after apply or cancel while sanitized batch summaries remain. Abandoned open batches have no automatic expiry, and corrections require cancelling then restaging. Expansion 041 and its disposable fixtures remain unapplied/unrun. Opening balances, historical transactions, full dependency-ordered migration, snapshot comparison, and control-total reconciliation remain open. FS-21 is not verified or accepted; v2 remains default-off.

### FS-22 — Multi-client and hosted staging acceptance

**Priority:** P0. **Owner:** QA/platform/domain. **Maps to:** P24.

Use Terminal A and Browsers B/C against one isolated v2 business, real Auth roles, deployed RPC/functions, and the full candidate schema. Test product edits, sale vs correction, transfer vs count, booking race, stale checkout, duplicate payment, simultaneous reconciliation, revocation, account switch, refresh/update and reconnect.

Verify API schema exposure, session/guidance RPC availability, redirects, edge function configuration, public vs privileged keys, timeouts, supported runtime versions, and deployed asset consistency. Never call a mocked Tauri UI test packaged-terminal acceptance.

**Acceptance:** exact-commit staging evidence shows consistent records, permissions, control totals and one effect per command. Every changed high-risk workflow has actual backend-connected execution evidence.

### FS-23 — Packaging, hardware, backup, and restore

**Priority:** P0 for terminal handover. **Owner:** release/hardware. **Maps to:** P26.

Build the intended Windows installer on the supported packaging host with locked dependencies. Install on a fresh target, upgrade an existing representative database, and retain rollback materials. Test USB scanner, real 80mm printer/queue, cash drawer only if supported, touch/keyboard operation, network outage, app/power restart, and disk/storage failure handling.

Backups must restore into a safe isolated target and reconcile records/totals. Record actual device, OS, architecture, WebView/runtime, installer checksum, database/schema, driver and printer queue. Linux/Android require their own evidence if included in the release; Windows results do not establish them.

**Acceptance:** fresh install and upgrade run the accepted shift/hospitality journeys; physical receipts pass; restored backup is operational and reconciled.

### FS-24 — Controlled cutover, rollback, and stabilization

**Priority:** P0. **Owner:** release lead/business owner. **Maps to:** P27.

Freeze the accepted candidate and schema. Back up; drain and reconcile legacy outbox; fence legacy writer; migrate; verify control totals; install authorized native baseline; enable shared authority and clients in the rehearsed order. Run controlled sale/receipt, receive/count, reservation/check-in/payment/checkout, and till-close checks appropriate to the business. Record smoke transactions deliberately and reverse/reconcile through supported operations where needed.

Define rollback by whether shared-v2 commits have occurred. Before any v2 writes, restore the rehearsed pre-cutover state safely. After v2 writes, do not simply restore old SQLite and resume trading: freeze new writes, preserve all post-cutover commands/evidence, reconcile/export them through the rehearsed recovery procedure, then select a compatible authority state. Maintain one writer at every step.

**Acceptance:** release lead and business owner review exact evidence and opening balances. Monitor rejected/unknown commands, sync lag, auth errors, printing failures and reconciliation exceptions through the agreed stabilization period, including the first complete business close. An unexplained stock/financial discrepancy or unavailable core workflow stops expansion and triggers the recovery procedure.

## 6. Original P0–P27 traceability

| Original item | Updated work packages | Required outcome |
|---|---|---|
| P0 CI | FS-01–03 | Green reproducible baseline and full routing |
| P1 UX foundation | FS-04–05, FS-19 | Shared outcomes, recovery and usable controls |
| P2 hospitality | FS-09, FS-15 | Consistent policy and operational journeys |
| P3 domain contracts | FS-10–12 | Physical quantities and server invariants |
| P4 Smart Item | FS-10 | Complete existing wizard |
| P5 packaging | FS-10–13 | Correct purchase/count/sale conversion |
| P6 atomic setup | FS-01, FS-10 | Linked records commit together |
| P7 receiving | FS-13 | Reviewable packaged/partial receipt |
| P8 counts | FS-07, FS-11 | Reliable scans and resumable counts |
| P9 correction | FS-08, FS-11 | Authorized reasoned absolute correction |
| P10 sealed/open | FS-11–12 | Conserved physical/container state |
| P11 ingredients | FS-10 | Canonical grams/ml with dimension checks |
| P12 batches | FS-12 | Correct preparation yield and valuation |
| P13 serving | FS-07, FS-12, FS-14 | Correct sale/modifier deductions |
| P14 finance | FS-04–06, FS-14 | Safe settlement/refund/cashup |
| P15 procurement | FS-13 | Stock/payable/invoice continuity |
| P16 admin/setup | FS-08–09, FS-21 | Commissioning, roles and import |
| P17 guidance | FS-17 | Real task progress and recovery |
| P18 parity | FS-01, FS-14, FS-19, FS-22 | Business-effect equivalence |
| P19 web gaps | FS-06, FS-15–16 | Accepted operational surfaces |
| P20 design system | FS-04, FS-19 | Consistent controls and feedback |
| P21 PWA | FS-20 | Safe install/cache/update |
| P22 adapter | FS-08, FS-18 | Validated existing v2 source |
| P23 offline | FS-20 | Accepted grants or explicit online-only scope |
| P24 staging | FS-22 | Real multi-client acceptance |
| P25 migration | FS-21 | Reconciled existing data |
| P26 hardware | FS-06–07, FS-19, FS-23 | Actual terminal/printer/scanner usability |
| P27 cutover | FS-24 | Controlled activation and recovery |

## 7. Required acceptance matrix

Each scenario must identify actor/role, runtime, business/outlet, starting records, action, expected domain effect, expected visible result, and evidence. Use fixed fixture values for deterministic assertions and representative business-sized data for performance checks.

| ID | Scenario | Required assertion |
|---|---|---|
| AT-01 | Full post-migration routing | Every declared supported command reaches intended handler |
| AT-02 | Fresh commissioning | Setup and Go Live through supported UI |
| AT-03 | Restricted/custom role | UI aligns with server enforcement; direct forbidden command denied |
| AT-04 | Offline logout/switch | Local privacy preserved despite remote error |
| AT-05 | Rapid double action | One intended mutation and clear busy feedback |
| AT-06 | Server commit, response lost | Original-ID reconciliation, one effect |
| AT-07 | Rejected payment/refund | Retained tender/context; no false success |
| AT-08 | Draft edit/reload | Correct nested payload, minor units and dates |
| AT-09 | Printer outage/reprint | Sale unchanged; selected immutable receipt only |
| AT-10 | Scanner in foreground dialog | No background mutation |
| AT-11 | Packaged delivery | Correct base quantity, unit cost, PO remainder and payable |
| AT-12 | Count vs concurrent transfer | Explicit conflict; no silent stock overwrite |
| AT-13 | Sealed/open conservation | Correct physical and canonical quantities |
| AT-14 | Batch plus modifier | Inputs consumed at production; portions/modifier at sale |
| AT-15 | Credit/room charge | Receivable effect without invented cash tender |
| AT-16 | M-Pesa discrepancy | Manual evidence and accepted resolution retained |
| AT-17 | Till counted zero/variance | Zero preserved; configured authority enforced |
| AT-18 | Booking race | One valid occupancy; rejected competitor recoverable |
| AT-19 | Move/check-out blockers | Capacity/condition/folio/deposit constraints consistent |
| AT-20 | Foreign-timezone device | Same property dates/times and business totals |
| AT-21 | Two maintenance cards | Clicked order is the only target |
| AT-22 | Floorplan switch/concurrency | No silent draft loss or occupied-order detachment |
| AT-23 | Guide completion/restart | Confirmed-only progress; completion persists |
| AT-24 | Native restart/permission change | Safe outbox and authorized baseline |
| AT-25 | PWA update/storage failure | No lost transaction/draft or false durability claim |
| AT-26 | Migration rerun/restore | Idempotent import and reconciled control totals |
| AT-27 | Shared offline authority | Bounded accepted grants or enforced online-only boundary |
| AT-28 | Cutover/post-write rollback | One authority; all committed business evidence retained |

## 8. Operator UX acceptance standard

A critical workflow fails acceptance if it requires avoidable mental arithmetic, manual lookup of known context, duplicate known data entry, technical IDs, unexplained disabled action, hidden primary CTA, off-screen confirmation, raw technical error without recovery, or conflicting Web/Terminal semantics.

Measure input facts requested, values derived, context retained, errors recoverable within the task, and action visibility. Use the existing trained-operator reference targets as usability goals, not backend latency promises: configured reservation ≤20 seconds; ready guest check-in ≤10 seconds; standard item add ≤3 seconds; known packaged receive ≤10 seconds; known stock transfer ≤10 seconds; simple issue report ≤15 seconds; balanced till close ≤20 seconds. Clearly define start/end and exclude external payment/customer delays. Record misses and causes; never reduce validation merely to meet timing.

Test operator roles on actual supported screen sizes. A successful screenshot is not sufficient: exercise primary, secondary, disabled, empty, loading, error, and recovery paths. Require each critical button/card/row/menu action to have a real state transition or a clearly explained restriction.

## 9. Validation commands and evidence handling

Run in a supported clean environment, with disposable databases for cloud tests:

```bash
npm ci
npm run lint
npm run contracts:check
npm run build
npm test
npm run test:cloud:base
npm run test:cloud:v2
npm run test:native
npm run check:desktop
npm run test:desktop
npm run test:browser
npm run test:browser:production
npm run protocol:check
npm run audit:ui:gate
npm run docs:check
```

Use `npm run verify:release` as the repository aggregate where appropriate, while confirming its current script covers the agreed candidate profile. Ensure browsers and platform dependencies exist first. A local environment restriction must be logged as blocked and resolved on a capable runner; do not attribute it to application behavior or declare a skipped gate passed.

For each work package record: status, owner, commit, schema hash, changed surfaces, tests executed, outcomes, evidence links, remaining limitations, operator reviewer and decision. Status vocabulary: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, BLOCKED, VERIFIED, ACCEPTED. ACCEPTED requires behavioral evidence and the appropriate operational review; it is not inferred from VERIFIED source compilation.

Update `DEV-FINAL-SPRINT.MD`, `docs/COMPLETION_LEDGER.md`, `docs/CURRENT_RELEASE_STATE.md`, `docs/TEST_EVIDENCE.md`, operation manifest/generated ledger, and relevant user guides together at each accepted slice. Preserve dated evidence; never replace old commit results with ambiguous “current tree” claims.

## 10. Release go/no-go checklist

- [ ] Exact candidate SHA and full migration order/hash recorded.
- [ ] FS-01–03 pass; all affected domain suites actually execute.
- [ ] No unresolved P0 or critical P1 operator defect for the selected release profile.
- [ ] Payment/stock/folio outcomes and uncertain retries are accepted.
- [ ] Actual session/readiness contracts and hosted Auth/RPC/functions verified.
- [ ] Native/Web parity maps differences honestly; unsupported actions are explained.
- [ ] Offline claims match accepted capability and business requirement.
- [ ] Imports, balances, stock, payments, credit, folios, payables and immutable history reconcile.
- [ ] Old writer is fenced before new authority writes.
- [ ] Fresh install, upgrade, printer/scanner and low-height operator flows pass.
- [ ] Backup restoration and both pre-write/post-write recovery boundaries rehearsed.
- [ ] Product owner/operator and release owner record go/no-go decision.
- [ ] Monitoring, escalation owner, first-business-close review and rollback materials ready.

## 11. Developer handoff instructions

Start by rebasing this checkpoint against the actual current branch and checking applicable repository instructions. Resolve already-fixed items using new evidence rather than reintroducing old code. Implement the smallest coherent work package, execute its targeted behavioral acceptance, then update status and integrate. Do not silently broaden scope into unrelated modules or claim production readiness from a partial profile.

First implementation sequence: **FS-01 routing → FS-02 compilation/lock → FS-03 meaningful CI → FS-04/05 outcomes and recovery → FS-09 commissioning → affected domain closure → FS-18/20 authority and offline boundaries → FS-21–24 rehearsal/cutover.** Independent repair tasks can proceed concurrently, but dependent acceptance cannot be skipped.

## Appendix A — Baseline references

- [Audited repository commit](https://github.com/davemusau00/SERVEOS-WEB/commit/abe5db553b3e52e16862669ae6007e5d88933331)
- [Original sprint at baseline](https://github.com/davemusau00/SERVEOS-WEB/blob/abe5db553b3e52e16862669ae6007e5d88933331/DEV-FINAL-SPRINT.MD)
- [Product/inventory specification](https://github.com/davemusau00/SERVEOS-WEB/blob/abe5db553b3e52e16862669ae6007e5d88933331/PRODUCT-INVENTORY.MD)
- [Migration 038](https://github.com/davemusau00/SERVEOS-WEB/blob/abe5db553b3e52e16862669ae6007e5d88933331/supabase/expansion/038_floorplan_atomic_save.sql)
- [Native adapter source](https://github.com/davemusau00/SERVEOS-WEB/blob/abe5db553b3e52e16862669ae6007e5d88933331/src-tauri/src/lib.rs)
- [CI evidence](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/36788540937)

## Appendix B — Preserved original sprint and historical implementation log

The following is the original `DEV-FINAL-SPRINT.MD` from the audited commit, retained verbatim for its detailed specifications and implementation history. Its old status counts, “tests deferred” directives and earlier execution order are historical; the active revision above governs current work. No historical pass is upgraded into current acceptance.

---

# ServOS DEV FINAL SPRINT
## Dual-Runtime Finish-Line Execution Plan

**Repository:** `davemusau00/SERVEOS-WEB`  
**Architecture:** Permanent ServOS Terminal + ServOS Web redundancy  
**Companion specification:** `PRODUCT-INVENTORY.MD`  
**UX principle:** The operator states the real-world intent. ServOS derives, calculates, defaults, validates, reconciles, and records everything it can safely know.

## Implementation progress - 2026-09-30

P0 is locally verified on 2026-09-30 after a clean `npm ci`: lint, production build, 112 Node tests, UI audit gate, documentation checks, 22 browser tests (desktop/mobile), 71 native domain tests in the Linux container, disposable cloud protocol tests, and `git diff --check` passed. `npm run audit:ui` inventoried 3,492 interactions and found no `window.prompt`/`window.confirm` use; the audit still contains 48 review findings. This is local evidence only: hosted CI, packaged-terminal, physical hardware, and live deployment are not verified.

Latest post-P2 regression evidence on the current source tree: `npm test` 146/146, lint/build pass, full Playwright desktop/mobile 32/32, native container 72/72, cloud v2 through expansion 027 (including legacy room overlap and two-connection concurrency), UI audit gate and documentation checks pass. The full browser rerun also passed after correcting test-only tax-class/family selectors and isolating the intentional response-loss fixture. Hosted CI, packaged terminal, physical hardware, and live deployment remain unverified.

Implementation continuation (2026-09-30): Web Front Desk now previews room-move blockers from destination capacity/condition, reservation intervals/turnaround, and active blocks, and queues the staged `stay.move` payload (`roomId`, reason). A blocked or failed queue retains the form; duplicate submission is suppressed with a visible busy state. Checkout readiness has a source-level helper and guest-facing blocker queue, but must be verified at the final acceptance pass. The focused source/lint checks passed before the move addition; a Playwright rerun was intentionally stopped after concurrent runs contended for preview port 3000. No browser acceptance is claimed for checkout/move, and the remaining P2 gates stay open. Per the current rush instruction, feature work is proceeding ahead of broad testing; final comprehensive verification is deferred until implementation is complete.

P22 identity implementation slice (2026-09-30; updated 2026-10-01; source unverified): Native online sign-in uses each operator's Supabase Auth credentials and resolves that Auth user through the selected stable staff profile and paired terminal before creating a local operational session; no local PIN is required online. Local-PIN-only unlock preserves the legacy/offline path. Refresh tokens use OS secure storage; sessions rotate/revalidate on renewal and app resume; sign-out clears the active session. Expansion 028 adds authenticated multi-operator access on the shared paired device. Native/browser/hosted/packaged validation and cutover remain incomplete, and v2 stays default-off.

P22 adapter progress (2026-09-30; source only): Native commands now derive optimistic expected-version dependencies from the shared resolver. When the Auth-resolved identity says v2 is enabled, the command boundary refreshes Auth, checks local/Auth actor and server business, refuses pending legacy outbox, durably stores a schema-2 envelope, dispatches through `servos_v2_execute`, persists the acknowledgement, and reconciles the change feed into the isolated v2 replica. An uncertain response remains replayable by original ID; cross-operator pending commands block the next action. Runtime reads and UI permissions switch to server-authenticated shadow state only under enabled Auth identity and a complete baseline. Legacy-only import-apply, local approval, Intake mutation, and acceptance-write paths are fenced while that identity is active. With v2 disabled or local-PIN offline unlock, the existing SQLite path remains active. Cross-operation payload/read-set parity, unsupported-workflow UX, permission-denial recovery, hosted/native acceptance, rollback/fencing, and all P22/P24-P27 gates remain incomplete. V2 stays default-off.

P22 Auth refresh continuation (2026-09-30; source only): native Auth sessions now rotate their refresh token into OS credential storage, retain the server-resolved identity in process memory, and revalidate the active staff/device binding on expiry and app resume. Sign-out always clears the local session and reports failures to flush drafts or remove an OS credential. `tests/native-operator-identity-source.test.mjs` records source-contract assertions for online identity, secure storage, offline separation and shared paired-device ownership. No tests or builds were run; the Cargo lockfile resolution issue remains recorded in test evidence.

P22 operator setup/security continuation (2026-09-30; source only): the operator setup guide now describes one Auth account per operator, stable Auth-user-to-staff-ID binding, one-time terminal pairing, OS-vault refresh-token storage, operator switching/sign-out, and the separate local-PIN legacy/offline route. New staged migration 030 adds the same deterministic permission-policy fingerprint to `servos_v2_terminal_identity` as `servos_v2_session`. Native shared-shadow reads fail closed if the active operator's policy fingerprint differs from the installed baseline, preventing a wider prior operator baseline from being exposed after a staff/grant change. Migration, test, and packaged acceptance are not claimed; v2 remains default-off.

P22 operator setup guide refresh (2026-10-01; documentation only): the guide now identifies expansion source through `039_controlled_csv_import.sql` as the current repository set, removes the stale claim that `034_sealed_location_counts.sql` is the current end point, and distinguishes identity/snapshot migrations needed for the read-only setup exercise from later feature migrations. It explicitly says source presence is not evidence of staging/hosted application and does not authorize v2 writes. No migration, build, or test was run; operator identity and all shared-v2 release gates remain unverified/default-off.

P22 stable staff binding correction (2026-10-01; source only): the Web staff binding form now accepts an existing terminal Staff ID, while retaining UUID generation for a genuinely new staff record. This is required because native online sign-in rejects an Auth identity whose server `staffId` differs from the selected local Staff ID. Guide and source-contract assertion updated; tests/builds/hosted Auth and packaged-terminal checks remain deferred. V2 remains default-off.

P22 server-grant read boundary follow-up (2026-09-30; source only): native v2 snapshot synthesis now receives the active Auth-resolved permission list; room-charge target projections are created only for server `folio.room_charge` or wildcard grants, rather than the legacy terminal role. The snapshot actor also carries server grants directly. Source assertions were added but not run; Rust compile, cross-operator privacy tests, hosted migration checks, packaged acceptance, and all authority/cutover gates remain open.

Production incident/setup follow-up (2026-09-30; read-only): a fresh request to the Vercel root returned HTTP 200 and its HTML referenced entry bundle `index-DmrTBM_q.js`, which differs from the reported `index-DL-bDI3x.js` runtime and old lazy chunk hashes. This supports a stale-tab/deployment asset-graph mismatch as one cause of the reported dynamic-import and corrupted-content errors; the `WebCatalogInventory` UUID TypeError is still not mapped to a source expression and is not claimed fixed. Expansion 017 defines the reported guidance-progress RPC locally, but the authenticated hosted 404 cannot be verified or repaired without authorized hosted migration evidence. `docs/TERMINAL_OPERATOR_AUTH_SETUP.md` now includes safe migration/deployment recovery checks. No deployment, migration, tests, or builds were run; production resolution remains open.

Offline v2 command fence (2026-09-30; source only): Web `BusinessStore.enqueue` and draft promotion now independently require `navigator.onLine` (checked before and within IndexedDB transactions). The existing Web submit flow continues to save a recoverable draft while offline; only an online-origin command can enter the retry queue, and server transport/acknowledgement is still required before the UI reports success. Source assertions were added but not run. This does not create signed offline authority or enable native v2 writes.

P12 batch-preparation continuation (2026-10-01; source only): `inventory.produceBatch` now prepares whole saved batches in one native transaction and one staged authenticated SQL command. It checks the recipe's linked finished-portions stock master, consumes `per-portion quantity × declared yield × batch count`, prevents ingredient shortages, recalculates weighted output cost, and records immutable ingredient/output movements. Native and Web Inventory expose a reasoned preparation workflow; Web is online-command-only. BATCH POS sales consume the linked prepared portions rather than deducting recipe inputs a second time. Source-contract tests were authored but not run. Web batch-recipe authoring and cross-client/concurrency/replay acceptance remain open; P12 is not complete and v2 remains default-off.

P12 Web Smart Item continuation (2026-10-01; source only): Web Smart Item now offers a distinct batch-recipe path for users with catalog and inventory-adjust permissions. Operators enter full-batch ingredient quantities and declared portion yield; the wizard converts quantities into the shared per-portion recipe representation, previews cost per portion, and uses the atomic catalog setup command to create the sellable BATCH product plus its linked, zero-on-hand `portion` stock master. A storage location and outlet are required. Batch production remains the separate online-only Inventory action. Source-contract assertions were added but not run; full cross-client, server validation, replay and UX acceptance remain open.

P13 batch modifier parity continuation (2026-10-01; source only): staged batch POS item construction now replaces the raw recipe snapshot with prepared portion stock while retaining positive ingredient adjustments from selected modifiers. It validates each adjustment stock record/version, and the Web dependency resolver includes selected modifier ingredient stock masters in the command read set. Native behavior already retains these selected adjustments alongside the prepared portion deduction. Source-contract assertions were extended but not run; SQL/browser/native replay and stock-conservation acceptance remain open.

P3 implementation has started: `src/utils/inventoryUnits.ts` now provides shared item-type presets, COUNT/WEIGHT/VOLUME canonicalization (piece/g/ml), package-to-base quantity conversion, package unit-cost derivation, stock variance, recipe/batch cost calculation, sealed-plus-open stock totals, and theoretical serving yield with range validation. Native Quick Product uses the shared unit normalizer and persists normalized size units, avoiding the previous litre-only conversion special case. This is a foundation only: the Smart Item Wizard, purchase packaging/receiving, Web adoption, and terminal/Web command parity are still open. Per rush direction, newly added P2/P3 behavior has not yet received the deferred final verification pass.

P4 initial implementation slice: Native Catalog's Add Item path was introduced as a four-step Smart Item Wizard (identity/type, selling/packaging/recipe, stock setup, review/save). It offers the ten planned item classes, recipe cost previews, batch-yield costing, package-size normalization, and a review summary before save. Native `catalog.createWithOpeningStock` supports sellable product+stock or stock-only ingredient creation, optional opening quantity, and immutable opening movement in one transaction. At that initial slice, staged PostgreSQL/Web handlers and recipe acceptance were open; see the dated continuation below for subsequent source implementation. No verification has yet been run for this wizard; tests stay deferred to the final pass.

P4 cross-runtime implementation continuation (2026-09-30; source only): staged expansion 031 adds `catalog.createWithOpeningStock` as one outer command transaction: permission checks, expected versions for the new stock/location/product/opening movement, reuse of existing catalog validators, linked product+stock persistence, canonical purchase package cost, and an optional immutable opening movement. The Web Catalog offers a four-step task-first Smart Item path for stocked sellables and stock-only items, with package conversion, cost/opening-stock preview, storage location, and stable record IDs in the queued payload. Spirit/Wine setup initializes sealed bottle counts and carries serving plus optional whole-bottle portions in that same atomic save. Recipe-only dishes/mixed drinks use one queued `product.save`, require catalog management plus inventory viewing, use shared-unit conversion and ingredient-cost preview, and do not create an unrelated stock master. Expected versions cover every ingredient and supplied outlet; staged expansion 032 enforces those dependencies server-side. Full Terminal/Web item-type and portion parity remain open; stock creation remains Web-partial in the manifest. Source acceptance cases were added but no tests, builds, migration, disposable SQL, or hosted deployment were run; final verification remains deferred and v2 default-off.

P5 implementation has started across native setup and staged Web scanner flows: operators can enter supplier package name, sale containers per package (or canonical stock units for stock-only ingredients), package cost, opening package count, and optional package barcode. ServOS derives scan quantity, opening stock quantity, and average unit cost; native stock records retain the normalized reusable package definition. Web stock-count and PO-receiving scanners resolve saved package barcodes and increment by the package's canonical base quantity. Package editing/alias administration, PO line package semantics beyond barcode quantity conversion, native scanner coverage, broader Web package setup, and acceptance remain open. No verification has been run.

P7 implementation has started for package-aware procurement: Web PO drafting can select a stock item's saved purchase package and treats ordered quantity and unit price as package count and package price. Native and staged SQL command sources validate the package belongs to the stock item, persist package/base-quantity metadata, and convert accepted packages into canonical stock quantity and per-base-unit weighted cost in the receipt transaction. Web package barcode scans add one whole PO package; count-session scans continue to add canonical base quantity. The receiving view now shows outstanding package/base quantities and warns/blocks posting an over-receipt without an approval token. Hosted migration rollout, standalone receiving package selection, invoice matching acceptance, and all verification remain open.

P9 implementation has started: the Web Stock workspace exposes a separate `inventory.adjust` action to operators with `inventory.adjust` permission. It previews the current balance and exact change, requires a reason, submits the absolute corrected balance as a queued command, uses optimistic record versioning, and emits `ADMIN_CORRECTION` movement evidence. The native SQLite handler and staged SQL dispatch both support the operation; step-up re-authentication and operator acceptance remain open. No tests have been run for this source change.

P8 implementation has started: unknown scanner codes in the Web location-count draft can be assigned inline to a selected stock master by an `inventory.adjust` operator. Assignment uses queued `stockItem.save`, preserves package definitions and existing aliases, adds only a barcode alias (no quantity movement), and removes the unresolved scan only after command success. Duplicate/ambiguous existing codes are blocked and routed to master-data cleanup; the count remains blocked until each unknown scan is assigned or explicitly removed. Native and staged SQL stock-master paths validate alias count, length, internal collisions and cross-stock collisions. Rescan an assigned alias to contribute its configured quantity. Tests and full scanner acceptance remain deferred.

P10 implementation has started: Native Quick Product persists bottle size for tracked ml spirits/wine; opening balances split into sealed containers and open remainder. Native POS stock consumption auto-opens only enough sealed containers to cover a serving, while whole-container sales require sealed containers and leave open liquid untouched. Native inventory adjustment and staged SQL `inventory.adjust` accept sealed-container/open-ml counts and record before/after breakdowns as immutable movement evidence. Web stock-master editing can configure ml container size, and staged POS `order.fire` distinguishes direct whole-container products from serving demand when item metadata is present. Staged transfer/count sealed-state semantics, full Smart Item integration and acceptance remain open. No verification has been run.

P10 sealed-transfer continuation (2026-09-30; source only): staged expansion 033 now routes Spirit/Wine `inventory.transfer` through an atomic sealed/open-aware handler. It validates the source and destination balances against canonical ml, consumes open liquid before opening sealed stock, updates both location balances together, and includes before/after state in immutable paired transfer movements. If the destination's single-open-container model cannot represent the incoming open quantity without exceeding bottle size, the operation is rejected instead of silently relabeling liquid as sealed. Non-tracked transfer behavior delegates to the existing dispatcher. A disposable SQL acceptance fixture and source assertion were authored; tests, migration execution, and hosted verification remain deferred. Whole-location count semantics for sealed/open stock and overall P10 acceptance remain open.

P10 sealed-count continuation (2026-09-30; source only): expansion 034 extends staged `inventory.countLocation` with required sealed-bottle and open-ml quantities for configured Spirit/Wine stock. The Web resumable count draft persists both physical components, presents dedicated fields for tracked bottle items, derives canonical total, and submits both in the existing queued command. The server checks bottle-size rules and total conservation, updates quantity and bottle state atomically, and records before/after state in the count movement. SQL fixture and source assertions are authored but not run. Migration, browser/native acceptance, recovery, and full P10 gates remain open.

P11 implementation has started in Native Smart Item and Web Catalog: weight stock accepts a physical package amount such as `5 kg`, converted to canonical grams before stock quantity, package cost, opening balance, and scan quantity are derived. Native and Web product recipe editors accept kitchen units (`kg`/`g`, `l`/`ml`, or compatible count units) and convert to the selected stock item's base unit before save and costing. Native validates referenced recipe stock, and staged SQL persists bounded recipe lines with active stock references. Full Smart Item parity, legacy-unit normalization, dimension-specific server validation, and gram-based workflow acceptance remain open. No verification has been run.

P12/P13 source work is underway: Native and Web Smart Item create BATCH products with per-portion recipe lines and a linked finished-portion stock master; POS orders consume prepared portions, while other recipe items snapshot ingredient usage. Staged batch-item construction preserves selected modifier ingredient adjustments without consuming raw batch recipe inputs a second time; modifier stock records are part of the optimistic command read set. Staged recipe persistence preserves serving/inventory metadata and staged `order.fire` records serving/whole-container stock effects. The distinct `inventory.produceBatch` workflow consumes full-yield ingredients and adds finished portions in native and staged SQL, with Web Inventory command UI. Full P12/P13 acceptance remains open. No verification has been run.

P14 implementation has started: Web till close now shows expected cash, counted cash, and computed variance; it treats an explicit zero count as zero, requires a reason for any non-zero variance, and blocks variance-authority actions unless the user's permission is present and configured tolerance is exceeded. Native SQLite and staged SQL apply the same tolerance rule from `tillPolicy.varianceThreshold` (KES); exact-tolerance variance is within policy. Web POS/Finance/Refunds route protocol errors through operator-facing guidance for permission, conflict, duplicate-reference, state, validation, unsupported operation, and connectivity failures. Existing Web M-Pesa statement review and original-payment-aware refund flows remain the source baseline. Standardized payment footer and full financial acceptance remain open. No verification has been run.

P14 explicit till-count continuation (2026-10-01; source only): Web no longer prepopulates counted cash from the server's expected balance. The operator must enter the physical drawer total; zero remains a valid explicit count. Count and variance-reason drafts are scoped to the active till and Auth actor, so a new session or operator cannot inherit a prior close count. A source-contract test was added but not run. Till close/browser/native/cloud acceptance remains deferred.

P15 implementation has started: Web goods-receipt entry defaults each line's delivered quantity to its remaining approved quantity, including partial receipts, and uses whole-number input steps/validation for package counts. Rejected quantities remain explicit and require a reason; invalid lines now block the entire receipt draft with a visible correction message instead of silently omitting a line. Over-receipt remains a separate approval-gated action and rejected goods do not reduce outstanding accepted quantity. Native and staged SQL already enforce optimistic PO versions, partial receipt accounting, package conversion, and separate over-receipt approval. Procurement defaults, broader invoice/receipt acceptance, and all verification remain open.

P15 invoice review continuation (2026-10-01; source only): the supplier invoice match action now requires an explicit operator acknowledgement that invoice quantities and unit prices were compared with the approved PO and accepted GRN before submitting the exact server-side three-way match. Server mismatch checks remain authoritative and unchanged. The existing procurement source-contract test now asserts the review gate; it was not run. Cross-client and accounting acceptance remain open.

P16 implementation has started: Administration's controlled Import Center inspects only the selected CSV/TSV header row and suggests likely field matches for product, stock, guest, and supplier templates. Suggestions are explicitly advisory. The Web v2 import slice is now connected to a server CSV parser and dry-run for those four master-data templates; see P16/P19 continuation below. Staff role choices are presented as built-in role templates with plain-language scope reminders. Direct readiness-to-settings links, generated staff identifiers, sensitive-action re-authentication, custom mapping workflows and acceptance remain open. No verification has been run.

P16 stable staff-key continuation (2026-10-01; source only): the Auth-to-staff binding form now generates a UUID staff key, displays it read-only, and offers explicit regeneration before submission. The exact generated key is both the `staff.create` target and `staffId` payload, preserving stable Auth-to-staff linkage without asking operators to invent an identifier. Successful creation generates the next blank-form key. A source-contract test was authored but not run. Readiness links, sensitive-action re-authentication, and broader P16 acceptance remain open.

P17 implementation has started: the deterministic help-index generator now emits structured overview, example, procedure steps, system-handled/recorded notes, common mistakes, related tasks, optional guide ID, and estimated duration for all 40 operator guides. Web Help renders these as task-first cards with a direct **Show me** workspace action, related-task navigation, guided-tour entry and expandable full reference. Procedure prose is split into concise sentence steps; duration is estimated from step count unless guide metadata supplies one. Authenticated committed-operation guide progress remains separate. Native/Web visual parity, contextual guide anchors and acceptance remain open; no tests have run.

P17 committed-operation Web guidance continuation (2026-10-01; source only): Help now chooses the associated POS, stock-count, or receiving task guide from selected article metadata/context. A queued command is reported to an open guide only after its durable queue state becomes `SYNCHRONIZED`; already-synchronized history is marked seen when the device opens. Practice steps cannot be advanced by Next/keyboard clicks and advance only when the expected operation receives that server-confirmed event. Guide progress remains actor/business-scoped via the existing guidance RPC. The guide target button opens its relevant workspace. A source-contract test was added but not run; browser, RPC, responsive and reload acceptance remain open.

P17 structured guide-link continuation (2026-10-01; source only): authored getting-started, POS, stocktake, and receiving articles now carry their stable guide IDs; the generated Help index reflects those IDs. Home opens Help by guide ID, Help resolves that ID to its matching article and tour, and the stock-count guide references the actual `21-stocktake` article. Starting a Web task tour records an `IN_PROGRESS` row and resumes its current step; tour launch checks the guide permission, and a failed progress RPC shows a recovery notice rather than silently claiming cross-device persistence. First-use copy now distinguishes invited online Auth accounts from local-PIN legacy/offline unlock. The deterministic Help generator was run (40 articles); source tests were updated but not executed. P17 accessibility, role-visibility, progress reload and browser acceptance remain open.

P18 implementation has started: a generated Markdown/JSON parity ledger now materializes all 82 `WEB_OPERATION_MANIFEST` entries with native, staged PostgreSQL, Web, offline, approval, versioning, audit, stock, financial, acceptance-test and operator-UX fields. Duplicate/missing metadata are rejected by the generator; build and documentation commands regenerate it, and docs checks compare operation counts and required fields. These entries remain source declarations, not proof of UX/domain acceptance or deployment. Manual operator UX review and remaining parity implementation remain open; no verification tests have run.

P18 source-parity correction (2026-10-01; generator only): auditing concrete Web POS/Finance Controls call sites corrected table transfer/merge and manual M-Pesa reconciliation/discrepancy statuses to implemented; order discount remains partial because non-manager approval-token UX is absent. The ledger now distinguishes native `customerCredit.charge` from Web/staged `credit.charge`, and native item-level `order.compItem` from staged/Web order-level `order.comp`; these names are not interchangeable parity. Two exact-operation rows were added and the ledger regenerated for 82 operations. A source-contract test was authored but not run; status remains source coverage only.

P19 implementation has started: audit against current call sites found Guest Accounts already queues `folio.postService` and `folio.pay`, and Web POS already has `pos.roomCharge`; the manifest has been corrected to reflect those existing flows. Guest Accounts now adds a permission-gated reversal workflow for an unreversed unpaid folio charge (including POS room charges), with required reason and server-side paid-charge/replay/version checks. The folio guide documents the Web path. Asset parts, controlled-import, and cross-client workflow acceptance remain open. No tests have run.

P19 maintenance parity continuation (2026-10-01; source only): Web now has a separately permission-discoverable Maintenance workspace with asset issue reporting, assignment to active staff, work start, completion with resolution and optional supplier/invoice-backed service cost, and reason-required cancellation. It queues the existing exact `maintenance.*` commands; native SQLite and staged PostgreSQL remain authoritative. Web completion currently submits an empty parts list (parts consumption UI remains open). The manifest removes the unsupported `asset.maintenance` alias and records the actual report/assign/start/complete/cancel operations. No broad tests or build have run; maintenance acceptance, parts issue, asset parity and imports remain open.

P19 floorplan parity continuation (2026-10-01; source only): Web now exposes a permission-gated outlet floorplan editor with visual positioning, shape/capacity/section/minimum-spend/server assignment fields, whole-layout submit, stale-version reload, and occupied-table protection. `floorplan.save` now resolves expected versions for the outlet and all baseline/new tables; expansion 038 adds a staged atomic handler that serializes by outlet, validates table IDs/labels/geometry/staff, preserves active table state and archives only removable unoccupied tables. A disposable PostgreSQL acceptance fixture is wired into both cloud and browser transaction harnesses; the floorplan guide and parity metadata are updated. No tests/builds ran; staged migration application and runtime/native/Web acceptance remain unverified.

P16/P19 controlled-import source continuation (2026-10-01; source-only snapshot before expansions 040/041): expansion 039 replaces the metadata-only Web import path with bounded CSV/TSV parsing (2 MB, 20,000 rows), header aliases, duplicate-mapped-header, populated-unmapped-header and row-width checks, required case-insensitively unique stable external IDs, text-preserved IDs/barcodes, and strict decimal parsing that rejects scientific notation. Raw source and parsed apply plans reside in a private RLS-enabled, non-API table and are excluded from browser snapshots; normal batch records contain status/hash and sanitized row summaries. Server dry-run invokes existing catalog, supplier and master-data domain validators inside rolled-back subtransactions; rejected rows retain row/reason details. A fully valid, hash-bound plan applies new products, stock-item definitions, customers or suppliers through those domain handlers in the same `servos_v2_execute` transaction, requiring import and corresponding domain permissions; existing target IDs/codes that conflict are rejected rather than updated. Outer command replay/idempotency applies. Raw files are deleted after successful apply. The Web Import Center now lists batches and exposes dry-run, rejected rows and explicit apply. At that implementation point it did not yet import opening balances, historical transactions, staff, rooms or assets and lacked dependency-complete migration, control-total reconciliation, inline correction, cancellation/retention policy or hosted evidence. A disposable acceptance fixture was wired into cloud and browser SQL harnesses but was not run. The parity manifest records these operations as partial. Tests/build/migration application were deferred; FS-21 and v2 cutover remain incomplete/default-off.

P20 implementation has started: the new Guest Accounts reversal flow now adopts shared `FormField`, `BusyButton`, and `BlockerCard` primitives for accessible field state, consistent busy/disabled feedback, and explicit reversal limits. This is a focused consumer adoption; feature-local styles remain across the application. No verification has run.

P21 source inventory: PWA manifest and real icon assets, guarded offline-shell caching, update-ready signaling, and protection against activating an update while busy/syncing already exist. Source acceptance tests cover icon references, authorization-response cache exclusion, offline reload, and safe update activation. No test was run for this continuation, so P21 remains locally unverified; packaged install/standalone and offline recovery acceptance remain open.

Live Web incident investigation (2026-09-30): the four reported Vercel chunk URLs returned 404 while current HTML referenced a different hashed entry. During read-only checks the root then changed to a new entry build (`index-BrNGxRSK.js`) whose current Catalog/Inventory, POS, receipt, and utensils lazy chunks all returned 200; the prior entry started returning 404. This directly supports a deployment-transition/edge-cache inconsistency as the dynamic-import failure cause. A one-reload guard for Vite preload failures is present in `src/main.tsx`. The reported `servos_v2_guidance_progress` authenticated 404 remains unverified; an unauthenticated POST returned 401, and staged migration 017 defines the function. The exact minified `n[UUID]` exception remains unattributed because the reported old bundle is unavailable. Inventory session-map normalization is only a plausible separate safeguard, not a confirmed fix. No hosted writes or deployment were made; refresh the browser and coordinate hosted migration state separately.

Follow-up hardening: Web inventory count-session restoration now filters malformed count entries and baseline rows, validates quantities/version fields and normalizes the timestamp before indexed reads. This is defensive local-storage validation only; it does not establish the cause or fix of the unavailable minified catalog exception. No test or build was run, per the deferred final verification instruction.

P22 original boundary finding: the terminal had only local PIN sessions while `servos_v2_execute` required an authenticated Supabase actor. The identity, schema-14 shadow state, snapshot/feed client, and gated online native command path are now implemented in source as recorded above; v2 remains disabled by default pending payload parity, verification, rollback/fencing, and acceptance. P23 signed offline authority remains disabled. P24/P25 staging and migration rehearsals, P26 hardware acceptance, and P27 cutover remain separate incomplete gates.

P25 migration-reconciliation source slice: the existing read-only SQLite↔legacy-cloud comparison now emits side-by-side control totals for record counts by collection, active/archive counts, stock quantity per item/location, movement-derived quantity per item/location, and selected order/procurement/payment/refund/M-Pesa/credit/folio/deposit/receipt minor-unit values. Each replica independently checks stock quantities against immutable movement history. Any total mismatch or internal stock conservation failure blocks readiness in addition to record-level differences. The native evidence panel exposes totals without business payloads. This extends the existing legacy replica reconciler; it is not a v2 import rehearsal, does not cover a real migrated target, and is unverified until the final test pass.

P1 remains in progress. Shared operator controls, keyboard-aware dialogs, property-time conversion, extended operation-parity metadata, prompt removal, and the generated audit are present. The audit flags custom overlays, form busy-state gaps, potentially unexplained disabled actions, directly surfaced exception text, and excessive required fields. The latest gate inventories 3,578 interactions and 389 static review findings (36 overlays, 246 disabled-action explanations, 12 visibility, 1 required-fields, 10 form-busy, 84 raw-error). These are review candidates, not confirmed defects. Interactions/workflows remain `UNREVIEWED`; shared primitives are not yet adopted across all features. No operator UX acceptance is claimed.

P2 is underway, not complete. The staged authenticated Web session returns a whitelist of timezone and room-stay policy (including configured room type/rate IDs), not the full property record. Terminal Front Desk calendar buckets/tape-chart intervals and Web Front Desk date labels use property-local dates, and Web check-in shows due/readiness blockers. Web now has a Quick Reservation dialog with guest creation through `record.save`, policy/rate preview, property-time conversion, advisory overlap/turnaround/block checks, and reservation submission through `roomReservation.create`; it does not write directly to browser storage. Web Housekeeping supports permission-gated room block creation, inspection-noted release, and room maintenance reports through queued commands. Expansion 027 handles legacy reservations without `blockedUntil` and cloud tests cover the two-connection booking race. Web Front Desk also now previews room-move capacity/condition/overlap/block blockers, queues the staged `stay.move` `roomId` payload, and retains the form on queue failure; checkout readiness explains accommodation, balance, deposit, and stay-state blockers before checkout submission. The previous Quick Reservation/Housekeeping desktop/mobile evidence does not cover these newer move/checkout additions. Final browser acceptance, checkout recovery, complete native/web workflow parity, and the full hospitality matrix remain open. P3-P27 remain open, and staged web-v2 authority remains default-off.

---

# 1. SOURCE OF TRUTH

The finish line is a deliberately redundant ServOS system where:

- Tauri/SQLite Terminal remains a permanent first-class client.
- Web/PWA remains a permanent first-class client.
- PostgreSQL/Supabase v2 coordinates shared business truth.
- SQLite remains the terminal's local survival authority during permitted offline operation.
- IndexedDB provides durable Web cache, drafts, synchronization state, and later controlled offline capability.
- Both clients use the same business command contracts, permissions, invariants, audit model, reconciliation rules, and operator-facing semantics.

After every major workstream:

1. update this document;
2. update the operation/parity manifest;
3. update affected acceptance tests;
4. update user guidance;
5. record remaining blockers.

Do not allow documentation, UI capability, backend capability, and operator workflows to drift into different versions of ServOS.

---

# 2. CURRENT REPOSITORY CHECKPOINT

Current main includes:

- Web workspace registry;
- Activity / synchronization center;
- contextual help drawer;
- PWA manifest and service-worker update flow;
- room-stay configuration and required setup validation;
- PostgreSQL/Supabase v2 domain migrations;
- Native Tauri/SQLite business engine;
- Web/PWA runtime foundations;
- POS;
- catalog/inventory;
- procurement;
- financial controls;
- rooms/front desk/folios/housekeeping;
- assets foundations;
- staff/devices;
- controlled import foundations;
- guidance infrastructure;
- `DEV-FINAL-SPRINT.MD`;
- `PRODUCT-INVENTORY.MD`.

Latest checked main before this document revision: `a11e104027819f0754992553d4db9c2b5c67bc99`.

GitHub Actions was still failing at that checkpoint, so production cutover remains blocked.

---

# 3. IMMEDIATE P0: GET MAIN GREEN

Before accepting a release candidate:

```text
npm ci
npm run lint
npm run build
npm test
npm run audit:ui
npm run docs:check
npm run test:browser
npm run test:native
npm run test:cloud
```

must all pass from the same commit.

Fix stale tests against the current workspace registry rather than restoring retired hardcoded tab behavior.

Fix contradictory room-stay fixtures by constructing the correct pre-policy or explicitly unconfigured state. Do not weaken production validation to satisfy tests.

---

# 4. PRODUCT + INVENTORY SIMPLIFICATION

`PRODUCT-INVENTORY.MD` remains the primary implementation specification for:

- Smart Item creation;
- packaging;
- unit conversion;
- gram-based ingredients;
- ml-based drinks;
- sealed/open bottle stock;
- receiving;
- stock count;
- transfer;
- waste;
- recipes;
- batch recipes;
- Admin stock correction;
- barcode aliases;
- contextual Help.

Core rule:

> **ServOS stores technical units. People enter physical reality.**

Examples:

```text
4 six-packs at KES 900 each
→ ServOS calculates 24 cans
→ ServOS calculates KES 150 cost per can
```

```text
5 kg beef
→ ServOS stores 5,000 g
```

```text
750 ml bottle
30 ml shot
→ ServOS calculates 25 theoretical shots
```

This same rule now extends to the entire application.

---

# 5. OPERATOR UX P0: STOP MAKING THE OPERATOR DO SERVOS'S WORK

This is release-critical.

The system must not make a cashier, bartender, storekeeper, receptionist, housekeeper, manager, or administrator reconstruct information ServOS already knows.

The rule:

```text
KNOWN OR DERIVABLE
→ ServOS does it

AMBIGUOUS BUT INFERABLE
→ ServOS proposes it and shows the interpretation

BUSINESS FACT ONLY THE OPERATOR KNOWS
→ ask the operator

HIGH-RISK OVERRIDE
→ ask clearly, explain the impact, and require authorization
```

The goal is not fewer fields at any cost.

The goal is fewer unnecessary decisions.

---

# 6. OPERATOR-WORK AUDIT TAXONOMY

Every interactive surface must be reviewed for these failure classes.

## 6.1 Arithmetic leakage

Bad:

```text
How many individual cans?
What is unit cost?
How many ml remain?
What is the variance?
What is the balance after deposit?
```

Better:

```text
4 six-packs at KES 900 each
→ 24 cans
→ KES 150/can

Counted cash KES 28,500
→ ServOS calculates expected cash and variance
```

## 6.2 Date/time derivation leakage

Operators should not manually calculate:

- checkout date;
- nightly checkout time;
- day-stay cutoff;
- blocked-until time;
- turnaround release;
- shift duration;
- policy-defined due dates.

ServOS derives them from policy.

## 6.3 Record-linking leakage

Do not ask for data already known from the action context.

Examples:

- room when action started from room card;
- guest when action started from guest account;
- order when refund started from receipt;
- stock item when action started from item;
- location when receiving from a location workspace;
- folio when charging an active stay;
- supplier when receiving an existing PO;
- asset when reporting from asset card.

## 6.4 Identifier leakage

Generate routine identifiers:

- SKU;
- stock code;
- reservation reference;
- receipt number;
- transfer reference;
- maintenance ticket number;
- folio number;
- asset tag where possible;
- command ID.

Allow authorized override only where an external identifier genuinely matters.

## 6.5 Policy lookup leakage

Operators should not need to remember:

- checkout time;
- day-stay cutoff;
- refund rules;
- discount ceiling;
- over-receive policy;
- stock-count rules;
- room readiness requirements;
- till variance tolerance;
- whether an item is sold by shot or whole bottle.

The UI reads policy and presents the valid action.

## 6.6 Availability lookup leakage

ServOS should determine or filter:

- available rooms;
- clean rooms;
- compatible rate plans;
- transferable stock;
- sealed bottle availability;
- open till;
- outstanding PO quantity;
- valid payment accounts.

## 6.7 Re-entry leakage

Once captured, do not ask again unless confirmation is needed.

Examples:

- phone from customer profile;
- invoice reference from receiving;
- room from active stay;
- payment method from original payment;
- package size from catalog;
- configured tax;
- checkout policy.

## 6.8 Interpretation leakage

Prefer business language.

```text
Whole pack cost
```

not:

```text
averageUnitCost
```

Prefer:

```text
Correct recorded quantity
```

not:

```text
inventory.adjust
```

---

# 7. ONE DECISION PER SURFACE

Every primary operational surface should answer one question.

Examples:

```text
Reserve this room
Check this guest in
Move this stay
Receive this delivery
Transfer this stock
Count this location
Sell this drink
Refund this payment
Correct this stock mistake
Close this till
Report this room problem
```

The first view contains only what is required for that decision.

Everything else becomes:

- inferred;
- defaulted;
- calculated;
- already known;
- More options;
- Advanced;
- a later step only when genuinely necessary.

Do not use a wizard merely to spread unnecessary fields across multiple screens.

---

# 8. RESERVATION FLOW REFERENCE IMPLEMENTATION

Current reservation forms ask for too much:

```text
Guest
Room
Stay type
Guests
Arrival datetime
Departure datetime
```

If launched from Room 1, the room is already known.

For a nightly reservation, checkout time is configured policy.

Target quick reservation:

```text
Reserve Room 1

Guest
[ Search guest or + New guest ]

Stay
[ Tonight ] [ Future date ] [ Day stay ]

Nights
[ - ] 1 [ + ]

Tue 30 Sep → Wed 1 Oct
Checkout 10:00
KES 3,500

1 guest                         [ Change ]

[ Cancel ]       [ Reserve Room 1 ]
```

Normal required operator input:

```text
guest
stay choice
number of nights
```

ServOS derives:

```text
departureDate = arrivalDate + nights
departureTime = property.nightlyCheckoutTime
blockedUntil = departure + room.turnaroundMinutes
rate = configured compatible nightly rate
quote = nights × rate + configured taxes/charges
```

For Day Stay:

```text
arrival = now or selected arrival
departure = configured dayStayCutoffTime
```

Explicit arrival/departure times move under:

```text
More options
→ Change times
```

when policy allows.

---

# 9. BUSINESS TIMEZONE CONTRACT

Hospitality truth uses the property's configured timezone.

Do not present:

```text
Arrival (this device's local time)
```

as authoritative reservation time.

Default:

```text
Arrival
Tue, 30 Sep · 2:45 PM

Property time · Africa/Nairobi
```

For remote Web access, optionally show:

```text
Hotel time   14:45
Your time    12:45
```

Audit all business workflows using:

```text
datetime-local
new Date()
getTimezoneOffset()
hardcoded timezone offsets
```

Replace ad hoc logic with shared property/business-time helpers.

---

# 10. CHECK-IN SIMPLIFICATION

Default check-in should be a readiness decision, not a dense identity wizard.

Target:

```text
ROOM 1

John Kamau
Reserved · 1 night

Room ready                 ✓
Reservation valid          ✓
Account ready              ✓
Balance                  KES 0

[ Check In ]
```

Then:

```text
[ Issue key ]
[ Open folio ]
[ Guest details ]
```

Only request passport, vehicle, email, deposit, or key information when:

- property policy requires it;
- information is missing;
- it matters to the current action;
- operator chooses to capture it.

Known guest information prefills.

---

# 11. CHECKOUT SIMPLIFICATION

Checkout presents a computed readiness summary.

```text
CHECK OUT ROOM 1

Accommodation posted        ✓
Services posted              ✓
Guest balance              KES 0
Unapplied deposit           KES 0
Room key returned             ✓

[ Check Out ]
```

If blocked:

```text
Cannot check out yet

KES 2,400 remains unpaid.

[ Settle account ]
```

Never make the operator discover the blocker through a failed command if ServOS can determine it beforehand.

---

# 12. ROOM MOVE SIMPLIFICATION

ServOS already knows:

- current room;
- guest;
- stay interval;
- room type;
- current folio;
- occupancy state.

Ask only:

```text
Move John Kamau from Room 1

Available rooms
[ Room 4 · Standard ]
[ Room 7 · Standard ]

Reason
[ Guest request ▼ ]

[ Move to Room 4 ]
```

Filter out:

- occupied rooms;
- blocked rooms;
- out-of-order rooms;
- rooms not ready under policy;
- incompatible room types unless authorized.

---

# 13. HOUSEKEEPING STATE SIMPLIFICATION

Do not make users understand the raw state machine.

Present the next valid action.

```text
DIRTY
→ Start cleaning

CLEANING
→ Ready for inspection

INSPECTION
→ Mark clean
```

If blocked:

```text
Mark clean

Complete 2 remaining checklist items first.
```

The CTA remains visible and explains why it cannot proceed.

---

# 14. MAINTENANCE QUICK REPORT

When launched from a room or asset, preserve that context.

Target:

```text
Report problem · Room 104

What is wrong?
[ AC not cooling ]

Priority
[ Normal ▼ ]

[ Report problem ]
```

Advanced fields:

- technician;
- estimated cost;
- parts;
- asset category;
- internal notes.

Do not require retyping room or asset identifiers.

---

# 15. POS SELLING

The cashier chooses what was sold.

ServOS determines what inventory/accounting effect follows.

For configured liquor:

```text
Jameson
[ Shot ] [ Double ] [ Bottle ]
```

ServOS derives:

- ml consumed;
- sealed/open bottle effect;
- unit cost;
- tax;
- route;
- stock location;
- receipt detail.

For food:

```text
Beef Stew × 1
```

ServOS consumes recipe ingredients.

Do not expose recipe internals during the sale.

---

# 16. PAYMENT AND M-PESA RECONCILIATION

Where reliable transaction data exists, do not ask the operator to re-enter it.

Manual M-Pesa reconciliation target:

```text
Transaction code
[ UIQ5G8E0D7 ]
```

ServOS matches available evidence and presents:

```text
UIQ5G8E0D7
KES 19,000
Kasina Kituli
26 Sep · 1:26 PM

Best match:
Order #184 · KES 19,000

[ Confirm match ]
```

If authoritative transaction lookup is unavailable, clearly label manually entered evidence as unverified rather than implying verification.

---

# 17. REFUNDS AND REVERSALS

Starting from a receipt/order should prefill:

- receipt;
- items;
- quantities;
- paid amounts;
- original payment method;
- customer where available.

Target:

```text
Refund Order #184

[✓] Jameson Double      KES 650
[ ] Coke                KES 200

Refund amount           KES 650

Return to:
M-Pesa                  Original payment

Reason
[ Incorrect order ▼ ]

[ Authorize refund ]
```

Do not ask for the original receipt number again.

Manager authorization appears only when policy requires it.

---

# 18. TILL CLOSE

The cashier counts physical cash.

ServOS calculates the rest.

```text
CLOSE TILL

Expected cash        KES 28,350

Counted cash
[ KES 28,500 ]

ServOS variance
+ KES 150

[ Review & close ]
```

If over policy:

```text
Variance exceeds the KES 100 limit.

Manager approval required.
```

Do not ask the cashier to calculate expected cash or variance.

---

# 19. PROCUREMENT AND RECEIVING

For an existing PO, ServOS already knows:

- supplier;
- ordered items;
- ordered quantities;
- already-received quantities;
- outstanding quantities;
- expected unit.

Target:

```text
PO-1042 · ABC Suppliers

Coke 330 ml
Ordered           10 crates
Already received   6 crates
Remaining          4 crates

Received now
[ 4 ] crates

[ Receive delivery ]
```

Over-receipt is detected automatically and routed to approval.

---

# 20. INVENTORY TRANSFER

Use operator-friendly package quantities.

```text
Transfer Coke

From Main Store
Available:
3 crates + 8 loose bottles

To
[ Main Bar ▼ ]

Move
[ 2 ] crates
[ 3 ] loose bottles

ServOS will transfer:
51 bottles

[ Transfer ]
```

Never ask for canonical quantity when packaging is known.

---

# 21. STOCK COUNT AND ADMIN CORRECTION

`PRODUCT-INVENTORY.MD` remains authoritative.

This sprint additionally requires:

- package-aware count entry;
- scanner contribution visible;
- unknown scans resolved inline;
- calculated total shown before commit;
- Admin correction with before/after/delta;
- stale conflict in business language;
- no silent direct stock overwrite.

The operator records physical reality.

ServOS computes the adjustment.

---

# 22. CUSTOMER AND GUEST QUICK CREATE

Do not force full CRM capture during a reservation or sale.

Target:

```text
New guest

Name
[             ]

Phone
[             ]

[ Add guest ]
```

Then:

```text
More details
```

may include:

- email;
- passport/ID;
- address;
- company;
- notes;
- preferences.

Only fields genuinely required by business/legal policy should block the immediate task.

---

# 23. STAFF AND PERMISSIONS

Use role templates for routine administration.

```text
Cashier
Storekeeper
Bar Manager
Front Desk
Housekeeping
Manager
Admin
```

Example:

```text
Cashier can:
✓ sell
✓ take payment
✓ open/close own till

Cannot:
× edit inventory
× change staff
× configure business
```

Advanced permission override remains available to Admin.

Do not require ordinary role setup through dozens of raw permission flags.

---

# 24. IMPORT WORKFLOW

CSV import flow:

```text
Upload
→ detect columns
→ suggest mapping
→ preview
→ show problems
→ correct mapping
→ dry-run
→ apply
```

ServOS may infer mappings from:

- header names;
- known aliases;
- template version;
- data shape.

Never silently guess destructive or ambiguous mappings.

Show confidence and require review where uncertain.

---

# 25. SEARCH INSTEAD OF LONG SELECTS

Use searchable comboboxes for:

- customers;
- products;
- rooms;
- suppliers;
- stock items;
- staff;
- assets.

Support:

- typeahead;
- barcode scanning;
- recent choices;
- context ranking;
- keyboard navigation;
- quick-create.

Plain select remains appropriate for short enums such as:

```text
Cash / M-Pesa / Card
Low / Normal / High
Nightly / Day stay
```

---

# 26. PRIMARY ACTIONS MUST NEVER DISAPPEAR

The current pattern:

```text
disabled:opacity-40
```

must not be the only disabled treatment for important actions.

Required states:

## Ready

High-contrast primary CTA.

## Blocked

The CTA remains legible.

```text
[ Reserve Room 1 ]

Choose a guest first.
```

or:

```text
[ Select a guest to continue ]
```

## Busy

```text
[ Reserving… ]
```

Duplicate submit locked.

## Success

Show committed result.

## Error

Preserve input and provide recovery.

A disabled primary action without an adjacent explanation is a defect.

---

# 27. STANDARD DIALOG ARCHITECTURE

Replace divergent modal systems with a shared primitive.

```text
Dialog
├── Header
│   ├── title
│   ├── optional context
│   └── close
├── Scrollable body
└── Sticky footer
    ├── secondary action
    ├── blocker/help text
    └── primary action
```

Required:

- CTA visible at supported viewport heights;
- header/footer do not scroll away;
- Escape closes when safe;
- focus enters the dialog;
- focus returns to launcher;
- focus remains trapped while open;
- background does not scroll;
- destructive actions use suitable confirmation;
- busy state prevents duplicate submission;
- close during submit is controlled;
- errors preserve entered data;
- mobile may use full-width/bottom-sheet treatment.

Migrate:

- Native `ActionDialog`;
- reservation;
- room block/release;
- maintenance;
- refunds;
- stock requisition;
- approvals;
- check-in;
- receipt-related actions;
- other custom fixed-overlay surfaces.

---

# 28. REMOVE WINDOW.PROMPT / WINDOW.CONFIRM

Production operational flows must not use:

```text
window.prompt()
window.confirm()
```

for business data or high-impact actions.

Replace with standard dialogs that provide:

- context;
- validation;
- permission state;
- reason codes;
- busy/error states;
- consistent keyboard behavior.

Add CI detection.

---

# 29. STANDARD FORM CONTRACT

Every field primitive supports:

```text
label
value
required state
helper text
error text
unit
prefix/suffix
disabled/read-only
loading dependency
context help
```

Submission errors appear:

- next to affected field;
- in a compact form summary where useful.

Do not rely only on browser-native required-field bubbles.

---

# 30. PROGRESSIVE DISCLOSURE

Move secondary fields behind:

```text
More options
Advanced
Details
```

Examples:

- SKU override;
- internal notes;
- manual timestamps;
- floor/wing;
- custom tax configuration;
- technical stock unit;
- external references;
- special pricing rules.

Do not hide information essential to the current decision.

---

# 31. SAFE DEFAULTS

Defaults reduce effort but must remain visible.

Examples:

```text
Guests = 1
Nights = 1
Arrival = today
Checkout = property policy
Receiving package = preferred package
Payment account = configured default
Priority = Normal
```

Never default a destructive action.

---

# 32. ERROR TRANSLATION

Raw protocol/database errors are not the normal operator experience.

Map:

```text
VALIDATION_FAILED
CONFLICT
DUPLICATE_REFERENCE
ROOM_UNAVAILABLE
permission required
```

to business language with recovery.

Example:

```text
Room 4 was reserved by another user while this form was open.

[ Choose another room ]
```

Keep technical details behind:

```text
Details
```

for support/admin use.

---

# 33. BLOCKERS MUST CONTAIN THE FIX

Every blocker answers:

```text
What is wrong?
Why does it matter?
What can I do next?
```

Example:

```text
Room not ready
Housekeeping still marks Room 4 as Cleaning.
[ Open housekeeping ]
```

Example:

```text
No rate configured
This room type has no active nightly rate.
[ Configure rate ]
```

Example:

```text
Till not open
Open a till before taking payment.
[ Open till ]
```

---

# 34. CONTEXT MUST FLOW BETWEEN MODULES

When transitioning:

```text
reservation → check-in → folio → checkout
```

or:

```text
PO → receive → payable → supplier payment
```

or:

```text
product → stock → sale → count
```

pass forward known context.

Do not make every module behave as if the operator arrived from a blank page.

---

# 35. OPERATOR-FIRST LANGUAGE AUDIT

Search UI copy for implementation terms including:

```text
base unit
scan unit quantity
target version
command
record
collection
minor amount
basis points
canonical
payload
property version
```

These may remain in engineering/admin diagnostics.

Ordinary business workflows use business language.

---

# 36. MOBILE, TOUCHSCREEN, AND LOW-HEIGHT ACCEPTANCE

Required viewports:

```text
390 × 844
768 × 1024
1024 × 600
1280 × 720
1366 × 768
1920 × 1080
```

At every size verify:

- primary CTA visible;
- dialog footer reachable without hunting;
- no clipped labels;
- no horizontal overflow in primary workflows;
- tap targets usable;
- native date/time widgets do not destroy layout;
- virtual keyboard does not hide active field/action;
- tables have usable alternatives on narrow screens.

The `1024 × 600` case is mandatory for POS/AIO terminals.

---

# 37. KEYBOARD ACCEPTANCE

Required where appropriate:

- Enter submits valid form;
- Escape safely closes;
- Tab order follows visual order;
- searchable selectors support arrows + Enter;
- scanner input is not broken by shortcuts;
- focus enters first meaningful field;
- validation focuses first blocking field;
- no invisible focus traps.

---

# 38. ASYNC / DOUBLE-SUBMIT CONTRACT

Every command-driven form uses:

```text
idle
→ validating
→ submitting
→ success | error | conflict
```

During submit:

- preserve values;
- lock duplicate submit;
- use action-specific progress text;
- control Cancel/Close;
- retry using idempotency where appropriate.

No repeated tap should create duplicate reservations, payments, transfers, refunds, or corrections.

---

# 39. EMPTY STATES MUST BE ACTIONABLE

Bad:

```text
No customers.
```

Better:

```text
No guests yet.

Add the guest now to continue this reservation.

[ + Add guest ]
```

Bad:

```text
No compatible rates.
```

Better:

```text
Room 1 has no active nightly rate.

[ Configure room rate ]
```

---

# 40. CROSS-CLIENT UX CONTRACT

Terminal and Web do not need pixel-identical layout.

They do need identical business interaction rules for:

- field meaning;
- defaults;
- derived values;
- blockers;
- permissions;
- confirmation;
- audit effect;
- command semantics.

Moving from Terminal to Web must not require relearning the business model.

---

# 41. OPERATOR UX AUDIT DELIVERABLE

Extend UI auditing with:

```text
docs/generated/OPERATOR_UX_AUDIT.json
```

Each important interaction records:

```text
id
workspace
file
surface
operatorIntent
operatorInputs
servosDerivedValues
contextPrefill
defaultSource
primaryAction
disabledReason
busyState
errorRecovery
permission
businessTimezone
mobileStatus
keyboardStatus
helpAnchor
acceptanceTest
status
```

Statuses:

```text
UNREVIEWED
NEEDS_SIMPLIFICATION
BLOCKED_BY_DOMAIN
IMPLEMENTED
ACCEPTED
```

Rendering does not equal acceptance.

---

# 42. UI AUDIT CI RULES

Expand `scripts/audit-ui.mjs` or add a companion audit to flag:

- `window.prompt(`;
- `window.confirm(`;
- new unapproved custom fixed-overlay dialogs;
- primary buttons using only opacity-based disabled styling;
- critical forms with no busy state;
- unexplained disabled primary actions;
- business-facing `datetime-local` outside approved components;
- direct hardcoded timezone offsets;
- duplicated button/input style constants outside the design system;
- raw protocol errors rendered directly where detectable;
- high-value forms with excessive required fields for manual review.

Use reviewed allowlists where necessary.

Do not create brittle regex rules that encourage unsafe code changes.

---

# 43. MANUAL OPERATOR UX REVIEW

For every primary workflow, answer:

```text
1. What is the operator trying to do?
2. What facts does ServOS already know?
3. What can ServOS safely derive?
4. What defaults come from policy?
5. What does only the human know?
6. Which fields are exceptional rather than normal?
7. Is the CTA always visible?
8. If blocked, is the reason visible?
9. Does the error tell the operator what to do next?
10. Can the task be completed without mental arithmetic?
11. Can it be completed without remembering another screen?
12. Does Web behave like Terminal semantically?
```

Mandatory workflows:

```text
POS sale
open tab
repeat round
discount
void
refund
split payment
M-Pesa reconciliation
till open
cash movement
till close

add item
receive inventory
count inventory
transfer inventory
waste
Admin correction
purchase order
receive PO
supplier payment

room reservation
check-in
room move
extension
checkout
room block
housekeeping
folio deposit
folio service charge
folio settlement

asset creation
asset assignment
maintenance report
maintenance completion

staff create
role change
business setup
CSV import
backup/restore
device administration
```

---

# 44. OPERATOR UX ACCEPTANCE METRICS

Track:

## Required input count

How many facts must the operator personally supply?

## Derivation ratio

How many values does ServOS calculate or prefill?

## Error recoverability

Can the operator recover without leaving the workflow?

## Context retention

Does the related action preserve the source record?

## Action visibility

Is the CTA visible on supported screens?

## Reference time targets

For a trained operator:

```text
reserve configured room           <= 20 seconds
check in ready reserved guest     <= 10 seconds
sell standard POS item            <= 3 seconds
receive known packaged stock      <= 10 seconds
transfer known stock item         <= 10 seconds
record simple maintenance issue   <= 15 seconds
close balanced till               <= 20 seconds
```

These are interaction targets, not backend latency SLAs.

---

# 45. DESIGN SYSTEM COMPLETION

Build/reuse:

```text
Button
PrimaryButton
DestructiveButton
BusyButton

Dialog
DialogHeader
DialogBody
DialogFooter
Drawer

FormField
SearchCombobox
Select
MoneyInput
QuantityInput
UnitInput
PackageQuantityInput
BusinessDateTimeField
DurationStepper
NumberStepper

CalculationCard
DerivedValue
ActionSummary
WarningCard
BlockerCard
RecoveryAction
InlineHelp

DataTable
ActionMenu
ConfirmDialog
AdminReauthDialog
ManagerApprovalDialog
PermissionGate

LoadingState
EmptyState
ErrorState
ConflictNotice
SyncState
```

Stop creating local `field`, `button`, and `primary` class definitions inside feature files.

---

# 46. HOSPITALITY IMPLEMENTATION SEQUENCE

```text
1. Shared business-time helpers
2. Standard Dialog primitive
3. Visible disabled/busy/blocker contract
4. Quick Reservation
5. Reservation availability/rate summary
6. Quick Guest create
7. Check-in readiness card
8. Simplified check-in
9. Move-room filtered choices
10. Checkout readiness/blockers
11. Housekeeping next-action UI
12. Room block/release dialogs
13. Maintenance quick report
14. Web parity
15. responsive acceptance
16. keyboard/touch acceptance
```

---

# 47. POS + FINANCE IMPLEMENTATION SEQUENCE

```text
1. Standard payment action footer
2. Payment-method defaults
3. Original-payment-aware refund
4. Computed refund amount
5. M-Pesa match summary
6. Till expected/count/variance flow
7. Approval only when policy requires
8. Actionable payment errors
9. Web/Terminal parity tests
```

---

# 48. INVENTORY + PROCUREMENT IMPLEMENTATION SEQUENCE

Align with `PRODUCT-INVENTORY.MD`.

```text
1. Smart Item Wizard
2. package-aware receiving
3. outstanding-PO calculation
4. package-aware transfer
5. package-aware count
6. Admin correction
7. derived cost/variance summaries
8. scanner-assisted selection
9. searchable stock/supplier selectors
10. Web/Terminal parity tests
```

---

# 49. ADMIN + SETUP IMPLEMENTATION SEQUENCE

```text
1. role templates
2. context-aware setup defaults
3. auto-generated identifiers
4. import mapping suggestions
5. actionable readiness blockers
6. structured Help task cards
7. direct links from blockers to configuration
8. consistent sensitive-action re-authentication
```

---

# 50. HELP + TRAINING REDESIGN

Help must stop looking like README content.

Home:

```text
HELP & TRAINING

What are you trying to do?
[ Search ]

COMMON TASKS
[ Make a sale ]
[ Reserve a room ]
[ Check in guest ]
[ Receive stock ]
[ Count stock ]
[ Sell shots ]
[ Correct stock mistake ]
[ Refund ]
[ M-Pesa ]
[ Close day ]

LEARN BY DOING
▶ Reserve a room in under 20 seconds
▶ Sell a bottle by shots
▶ Add a six-pack
▶ Build a gram-based recipe
```

Help entries use structured fields:

```text
title
summary
whenToUse
example
steps
systemHandles
commonMistakes
relatedTasks
guideId
estimatedMinutes
```

Render task cards, steps, calculation examples, warnings, success states, and `Show me`.

Do not render raw long preformatted text as the primary experience.

---

# 51. OTHER WEB PARITY WORK

Complete remaining gaps after the Operator UX foundation is in place.

## Assets / Maintenance

Complete:

```text
asset.assign
asset.return
asset.transfer
asset.inspect
asset.lose
asset.retire
asset.dispose
asset.commission

maintenance.report
maintenance.assign
maintenance.start
maintenance.complete
maintenance.cancel
```

Include barcode/asset tag lookup.

## Hospitality

Complete:

```text
stay.extend
folio.refundDeposit
folio.reverse
reservation modification
room-charge reversal
folio reopen rules
```

## Controlled Import

Historical scope note (039-era source snapshot, before expansions 040/041): Web v2 then supported four server-validated master-data templates. The current source has since added stock locations, room types, nightly rate plans, rooms, asset categories, and assets; the broader FS-21 workflow remains incomplete:

```text
upload
→ advisory header suggestions
→ server row validation and dry-run
→ rejected-row review (restage corrected source; no inline editor)
→ explicit apply of a fully valid plan
→ command result and audit
```

Not yet supported by Web v2 imports: opening balances or movements, historical transactions, staff, asset history, dependency-ordered full-terminal migration, control-total reconciliation, snapshot comparison, or cutover evidence. Native controlled import remains the existing local-terminal route; this Web slice does not enable dual writers.

## Floorplan

Implement Web manager editor.

---

# 52. CROSS-CLIENT PARITY LEDGER

Replace stale parity assumptions with generated/validated operation coverage.

Track:

```text
operation
domain
permission
nativeBackend
cloudBackend
terminalUI
webUI
offlineEligibility
requiresApproval
requiresVersion
auditEffect
stockEffect
financialEffect
acceptanceTest
operatorUxStatus
```

Product/Inventory minimum:

```text
catalog.createItem
inventory.receive
inventory.count
inventory.transfer
inventory.waste
inventory.correctQuantity
recipe.save
package.save
barcodeAlias.save
```

---

# 53. WEB PWA FINISH

Complete:

```text
192 icon
512 icon
maskable icon
favicon
apple-touch icon
install tests
standalone tests
offline shell tests
update-while-busy protection
recovery tests
```

Never activate a new service worker in the middle of a financial transaction.

---

# 54. TERMINAL V2 ADAPTER

Target:

```text
SQLite command
↓
BusinessCommandV2
↓
durable outbox
↓
PostgreSQL execution
↓
acknowledgement
↓
change feed
↓
SQLite reconciliation
```

Fence legacy snapshot authority before shared v2 authority becomes production writer.

---

# 55. OFFLINE AUTHORITY

Terminal retains offline trading through signed/reserved authority.

Potential grants:

```text
stock allocation
till session
outlet authority
receipt-number range
room lease
discount ceiling
refund ceiling
```

Canonical quantities remain authoritative beneath friendly packaging.

---

# 56. DUAL-CLIENT STAGING

Test:

```text
Terminal A
Web Browser B
Web Browser C
```

against isolated v2 staging.

Scenarios include:

- same product edited concurrently;
- sale while Admin correction open;
- transfer while count open;
- room booking concurrency;
- duplicate command replay;
- Terminal offline then reconnect;
- browser refresh with draft;
- device revocation;
- service-worker update;
- stale permissions;
- stock allocation exhaustion;
- reservation opened on one client and changed on another;
- stale checkout readiness;
- simultaneous M-Pesa reconciliation attempt.

---

# 57. DATA MIGRATION

Before production cutover reconcile:

```text
products
stock items
stock locations
current quantities
stock movements
purchase receipts
orders
payments
M-Pesa
credit
rooms
folios
assets
staff
```

Inventory must reconcile:

```text
local quantity
cloud quantity
movement-derived quantity
```

Any unexplained difference blocks cutover.

Misentries use migration reconciliation or audited Admin correction.

Never silently patch current balances.

---

# 58. PRODUCTION CUTOVER

Required sequence:

```text
CI green
↓
Operator UX P0 acceptance green
↓
Product/Inventory acceptance green
↓
Terminal v2 adapter green
↓
Web v2 green
↓
Full local backup
↓
Drain legacy outbox
↓
Control-total reconciliation
↓
Fence legacy writer
↓
Migrate v2 state
↓
Enable cloud authority
↓
Enable Terminal v2
↓
Enable Web v2
↓
Smoke sale
↓
Smoke receive
↓
Smoke stock correction
↓
Smoke room reservation
↓
Smoke check-in
↓
Smoke payment
↓
Smoke till close
↓
Reconcile
↓
Open business
```

Never run legacy snapshot authority and v2 transaction authority concurrently for the same business.

---

# 59. FINAL SPRINT EXECUTION ORDER

```text
P0   Repair CI

P1   Operator UX audit foundation
     - standard Dialog/Button/Form primitives
     - OPERATOR_UX_AUDIT
     - prompt/confirm audit
     - disabled CTA audit
     - business-time contract

P2   Hospitality reference implementation
     - Quick Reservation
     - quick guest create
     - check-in readiness
     - checkout readiness
     - room move
     - housekeeping actions
     - maintenance report

P3   Product/Inventory domain contracts
P4   SmartItemWizard
P5   Packaging + measurement conversion
P6   Atomic item creation
P7   Receiving UX
P8   Stock count UX
P9   Admin Stock Correction
P10  Spirit sealed/open inventory
P11  Gram-based ingredients + recipes
P12  Batch recipes
P13  POS serving integration

P14  POS/Finance operator simplification
     - refund
     - M-Pesa reconciliation
     - payments
     - till close variance

P15  Procurement operator simplification
     - outstanding quantity
     - receiving defaults
     - over-receipt approval

P16  Admin/setup simplification
     - role templates
     - import mapping suggestions
     - actionable readiness blockers

P17  Structured Help + contextual training
P18  Cross-client parity + Operator UX acceptance
P19  Remaining Web parity gaps
P20  Design-system consolidation
P21  PWA completion
P22  Terminal v2 adapter
P23  Offline authority
P24  Dual-client staging
P25  Data migration rehearsal
P26  Physical hardware + low-height viewport acceptance
P27  Production cutover
```

---

# 60. OPERATOR UX RELEASE GATE

Production is blocked if any P0 workflow has:

- invisible or effectively invisible primary CTA;
- unexplained disabled primary CTA;
- mental arithmetic ServOS can safely perform;
- manual policy-defined date/time derivation;
- duplicate entry of known context;
- `window.prompt` or `window.confirm` for operational data;
- modal action that disappears below usable viewport without sticky footer;
- raw technical error with no recovery path;
- desktop-only workflow required on physical terminal;
- conflicting Web vs Terminal semantics;
- required long dropdown where search is necessary;
- missing busy state on a command that can duplicate work.

---

# 61. DEFINITION OF DONE

## 62. Operator account and one-time terminal setup follow-up (2026-10-01)

- Corrected terminal online sign-in to authenticate with the operator's individual Auth credentials and selected stable Staff ID; local PIN-only login remains available for the existing offline/legacy path.
- Online Auth resolution creates a local operational session only after the server confirms the Auth user maps to the selected active Staff ID and paired device. Refresh credentials remain in OS secure storage; v2 remains default-off.
- Updated [terminal operator setup](docs/TERMINAL_OPERATOR_AUTH_SETUP.md), README and documentation index to use ServOS Auth invitations, then bind Auth UUID to the existing Staff ID, commission the terminal once as an authorized Admin, and have each operator sign in individually.
- This slice is source/docs only and unverified. Native login/UI tests, native build, invitation flow, hosted migration state, packaged terminal, session switching/revocation, and all v2 acceptance gates remain open.

ServOS is finished when:

- a cashier can sell without understanding inventory internals;
- a bartender can sell shot, double, or bottle from one product;
- a kitchen operator can build gram-based recipes without manual conversion;
- a storekeeper can receive crates/packs/bags using supplier language;
- a storekeeper can count using packs plus loose units;
- an Admin can correct misentered stock without corrupting history;
- a receptionist can reserve a configured room without manually calculating checkout;
- check-in shows readiness rather than making the operator rediscover prerequisites;
- checkout explains blockers before submission;
- no P0 workflow asks for a value ServOS can safely derive;
- no P0 workflow asks for context ServOS already knows;
- property time follows the business timezone contract;
- every blocked primary action remains legible and explains what is missing;
- important dialog actions remain visible at supported terminal/mobile sizes;
- production workflows do not use `window.prompt` or `window.confirm` for business data;
- operational errors explain the problem and next action;
- Terminal and Web use the same business defaults and derived values;
- every stock change leaves an immutable movement;
- duplicate commands are harmless;
- stale updates conflict safely;
- scanner and printer have physical acceptance evidence;
- Terminal survives network loss;
- Web survives terminal loss;
- PostgreSQL coordinates shared truth;
- SQLite provides local terminal resilience;
- Help teaches tasks inside the application;
- complete CI is green;
- migration control totals reconcile exactly.

The terminal is the resilience machine.

The Web app is the reach and multi-device machine.

PostgreSQL is the coordination machine.

SQLite is the local survival machine.

The operator should see the business.

ServOS should see the mathematics, policy, state, and bookkeeping.


FS-21 controlled-import continuation (2026-10-01; source-only): forward expansion 040 preserves installed expansion 039 and adds stock locations and room types; forward expansion 041 adds nightly rate plans, rooms, asset categories, assets, audited cancellation, and Auth-bound staff profiles without rewriting 039/040. The Import Center exposes eleven templates. Rate and room rows reference an active room-type ID; new rooms use validator defaults CLEAN/AVAILABLE. Asset imports use `record.save`/`asset.save`, require active category plus exactly one active room or stock location, preserve unique tags, and emit immutable domain events. Staff rows require a pre-existing invited Auth user and stable staff ID, and call `staff.create` with explicit role through the normal permission/role checks; imports cannot create Auth users or custom grants. Header-based template identification now derives an advisory suggestion from the CSV header, requires explicit operator confirmation, and leaves selection unchanged for ambiguous matches. Open batches have an explicit cancel workflow: cancel/apply/dry-run lock the batch row in the same order, cancellation records actor/time/reason and purges private source/exact-plan rows while retaining sanitized summaries, and batch IDs cannot be reused. Open batches do not expire automatically; corrections require cancelling and staging a new batch. Asset history, depreciation configuration, reservations, opening balances, and historical transactions are not imported. Full migration/reconciliation, balance/history imports, and staging acceptance remain open. Fixtures and source-contract coverage were extended but intentionally not run; expansion 041 remains unapplied and v2 remains default-off.
FS-01 dispatch continuation (2026-10-01; source-only): corrected expansion 038 to preserve its immediately previous dispatcher and intercept only `floorplan.save`; added forward expansion 042 for databases that already applied the former partial router, delegating to the preserved `dispatch_before_batch_preparation` chain. Existing offline rejection and domain dispatch remain in the delegated chain. Source assertions were authored; disposable PostgreSQL/domain suites, migration application, permissions, replay, stale-version behavior, and transaction effects have not been verified. FS-01 remains open.

FS-02 compilation-source continuation (2026-10-01; source-only): narrowed persisted Web count maps, corrected Web Help's click-event/guide-ID callback boundary, typed staff identity form state and validate Auth UUIDs before `staff.create`, and repaired native batch-output movement construction to use `id()`, `now()`, and the established local business/property IDs. The BlockerCard call sites already matched the shared children contract. Source assertions were authored/updated but not run; no compiler, lockfile reconciliation, build, or native test has been run. FS-02 remains unverified.

FS-04/05 recovery continuation (2026-10-01; source-only): browser queue rows persist an explicit OUTCOME_UNKNOWN state before network execution and retry with the same command ID; Activity displays a no-resubmit warning. A synchronous form-submission guard prevents rapid duplicate sends. Linked review drafts wait for original-command reconciliation and are removed when the original is confirmed. Draft and Activity presentation redacts sensitive keys, bearer/JWT text, and sensitive form inputs. Source and browser acceptance assertions were authored/updated but not run. The broad discriminated outcome contract and operation-specific draft serializers remain open; testing/builds remain deferred.

FS-08 operator-auth setup continuation (2026-10-01; source/docs-only): added `docs/TERMINAL_OPERATOR_AUTH_SETUP.md` covering individual invitations, Auth-to-stable-staff binding, one-time Admin terminal pairing, OS-keyring refresh-token handling, operator switching/sign-out, offline legacy-only behavior, and the v2 default-off boundary. Native source contains the online Auth/session and keyring integration. No Auth, SQL, native, packaged-terminal, hosted, or operator acceptance has been run; FS-08 remains open.
