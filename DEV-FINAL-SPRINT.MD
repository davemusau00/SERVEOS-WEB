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

P22 identity implementation slice (2026-09-30; source unverified): Native online sign-in combines the local staff PIN with individual Supabase Auth credentials, resolves the Auth user through the stable staff profile and paired terminal, and stores the refresh token through OS secure storage. Sessions rotate/revalidate on renewal and app resume; sign-out clears the active session. Local-PIN-only unlock preserves the legacy/offline path while shared v2 is disabled. Expansion 028 adds authenticated multi-operator access on the shared paired device. The subsequent P22 adapter progress is recorded below; all hosted/packaged validation and cutover remain incomplete, and v2 stays default-off.

P22 adapter progress (2026-09-30; source only): Native commands now derive optimistic expected-version dependencies from the shared resolver. When the Auth-resolved identity says v2 is enabled, the command boundary refreshes Auth, checks local/Auth actor and server business, refuses pending legacy outbox, durably stores a schema-2 envelope, dispatches through `servos_v2_execute`, persists the acknowledgement, and reconciles the change feed into the isolated v2 replica. An uncertain response remains replayable by original ID; cross-operator pending commands block the next action. Runtime reads and UI permissions switch to server-authenticated shadow state only under enabled Auth identity and a complete baseline. Legacy-only import-apply, local approval, Intake mutation, and acceptance-write paths are fenced while that identity is active. With v2 disabled or local-PIN offline unlock, the existing SQLite path remains active. Cross-operation payload/read-set parity, unsupported-workflow UX, permission-denial recovery, hosted/native acceptance, rollback/fencing, and all P22/P24-P27 gates remain incomplete. V2 stays default-off.

P22 Auth refresh continuation (2026-09-30; source only): native Auth sessions now rotate their refresh token into OS credential storage, retain the server-resolved identity in process memory, and revalidate the active staff/device binding on expiry and app resume. Sign-out always clears the local session and reports failures to flush drafts or remove an OS credential. `tests/native-operator-identity-source.test.mjs` records source-contract assertions for online identity, secure storage, offline separation and shared paired-device ownership. No tests or builds were run; the Cargo lockfile resolution issue remains recorded in test evidence.

P22 operator setup/security continuation (2026-09-30; source only): the operator setup guide now describes one Auth account per operator, stable Auth-user-to-staff-ID binding, one-time terminal pairing, OS-vault refresh-token storage, operator switching/sign-out, and the separate local-PIN legacy/offline route. New staged migration 030 adds the same deterministic permission-policy fingerprint to `servos_v2_terminal_identity` as `servos_v2_session`. Native shared-shadow reads fail closed if the active operator's policy fingerprint differs from the installed baseline, preventing a wider prior operator baseline from being exposed after a staff/grant change. Migration, test, and packaged acceptance are not claimed; v2 remains default-off.

P22 server-grant read boundary follow-up (2026-09-30; source only): native v2 snapshot synthesis now receives the active Auth-resolved permission list; room-charge target projections are created only for server `folio.room_charge` or wildcard grants, rather than the legacy terminal role. The snapshot actor also carries server grants directly. Source assertions were added but not run; Rust compile, cross-operator privacy tests, hosted migration checks, packaged acceptance, and all authority/cutover gates remain open.

Production incident/setup follow-up (2026-09-30; read-only): a fresh request to the Vercel root returned HTTP 200 and its HTML referenced entry bundle `index-DmrTBM_q.js`, which differs from the reported `index-DL-bDI3x.js` runtime and old lazy chunk hashes. This supports a stale-tab/deployment asset-graph mismatch as one cause of the reported dynamic-import and corrupted-content errors; the `WebCatalogInventory` UUID TypeError is still not mapped to a source expression and is not claimed fixed. Expansion 017 defines the reported guidance-progress RPC locally, but the authenticated hosted 404 cannot be verified or repaired without authorized hosted migration evidence. `docs/TERMINAL_OPERATOR_AUTH_SETUP.md` now includes safe migration/deployment recovery checks. No deployment, migration, tests, or builds were run; production resolution remains open.

Offline v2 command fence (2026-09-30; source only): Web `BusinessStore.enqueue` and draft promotion now independently require `navigator.onLine` (checked before and within IndexedDB transactions). The existing Web submit flow continues to save a recoverable draft while offline; only an online-origin command can enter the retry queue, and server transport/acknowledgement is still required before the UI reports success. Source assertions were added but not run. This does not create signed offline authority or enable native v2 writes.

P3 implementation has started: `src/utils/inventoryUnits.ts` now provides shared item-type presets, COUNT/WEIGHT/VOLUME canonicalization (piece/g/ml), package-to-base quantity conversion, package unit-cost derivation, stock variance, recipe/batch cost calculation, sealed-plus-open stock totals, and theoretical serving yield with range validation. Native Quick Product uses the shared unit normalizer and persists normalized size units, avoiding the previous litre-only conversion special case. This is a foundation only: the Smart Item Wizard, purchase packaging/receiving, Web adoption, and terminal/Web command parity are still open. Per rush direction, newly added P2/P3 behavior has not yet received the deferred final verification pass.

P4 initial implementation slice: Native Catalog's Add Item path was introduced as a four-step Smart Item Wizard (identity/type, selling/packaging/recipe, stock setup, review/save). It offers the ten planned item classes, recipe cost previews, batch-yield costing, package-size normalization, and a review summary before save. Native `catalog.createWithOpeningStock` supports sellable product+stock or stock-only ingredient creation, optional opening quantity, and immutable opening movement in one transaction. At that initial slice, staged PostgreSQL/Web handlers and recipe acceptance were open; see the dated continuation below for subsequent source implementation. No verification has yet been run for this wizard; tests stay deferred to the final pass.

P4 cross-runtime implementation continuation (2026-09-30; source only): staged expansion 031 adds `catalog.createWithOpeningStock` as one outer command transaction: permission checks, expected versions for the new stock/location/product/opening movement, reuse of existing catalog validators, linked product+stock persistence, canonical purchase package cost, and an optional immutable opening movement. The Web Catalog offers a four-step task-first Smart Item path for stocked sellables and stock-only items, with package conversion, cost/opening-stock preview, storage location, and stable record IDs in the queued payload. Recipe-only dishes/mixed drinks now use one queued `product.save`, require catalog management plus inventory viewing, use shared-unit conversion and ingredient-cost preview, and do not create an unrelated stock master. Expected versions cover every ingredient and supplied outlet; staged expansion 032 enforces those dependencies server-side. Full Terminal/Web item-type and portion parity remain open; stock creation remains Web-partial in the manifest. Source acceptance cases were added but no tests, builds, migration, disposable SQL, or hosted deployment were run; final verification remains deferred and v2 default-off.

P5 implementation has started across native setup and staged Web scanner flows: operators can enter supplier package name, sale containers per package (or canonical stock units for stock-only ingredients), package cost, opening package count, and optional package barcode. ServOS derives scan quantity, opening stock quantity, and average unit cost; native stock records retain the normalized reusable package definition. Web stock-count and PO-receiving scanners resolve saved package barcodes and increment by the package's canonical base quantity. Package editing/alias administration, PO line package semantics beyond barcode quantity conversion, native scanner coverage, broader Web package setup, and acceptance remain open. No verification has been run.

P7 implementation has started for package-aware procurement: Web PO drafting can select a stock item's saved purchase package and treats ordered quantity and unit price as package count and package price. Native and staged SQL command sources validate the package belongs to the stock item, persist package/base-quantity metadata, and convert accepted packages into canonical stock quantity and per-base-unit weighted cost in the receipt transaction. Web package barcode scans add one whole PO package; count-session scans continue to add canonical base quantity. The receiving view now shows outstanding package/base quantities and warns/blocks posting an over-receipt without an approval token. Hosted migration rollout, standalone receiving package selection, invoice matching acceptance, and all verification remain open.

P9 implementation has started: the Web Stock workspace exposes a separate `inventory.adjust` action to operators with `inventory.adjust` permission. It previews the current balance and exact change, requires a reason, submits the absolute corrected balance as a queued command, uses optimistic record versioning, and emits `ADMIN_CORRECTION` movement evidence. The native SQLite handler and staged SQL dispatch both support the operation; step-up re-authentication and operator acceptance remain open. No tests have been run for this source change.

P8 implementation has started: unknown scanner codes in the Web location-count draft can be assigned inline to a selected stock master by an `inventory.adjust` operator. Assignment uses queued `stockItem.save`, preserves package definitions and existing aliases, adds only a barcode alias (no quantity movement), and removes the unresolved scan only after command success. Duplicate/ambiguous existing codes are blocked and routed to master-data cleanup; the count remains blocked until each unknown scan is assigned or explicitly removed. Native and staged SQL stock-master paths validate alias count, length, internal collisions and cross-stock collisions. Rescan an assigned alias to contribute its configured quantity. Tests and full scanner acceptance remain deferred.

P10 implementation has started: Native Quick Product persists bottle size for tracked ml spirits/wine; opening balances split into sealed containers and open remainder. Native POS stock consumption auto-opens only enough sealed containers to cover a serving, while whole-container sales require sealed containers and leave open liquid untouched. Native inventory adjustment and staged SQL `inventory.adjust` accept sealed-container/open-ml counts and record before/after breakdowns as immutable movement evidence. Web stock-master editing can configure ml container size, and staged POS `order.fire` distinguishes direct whole-container products from serving demand when item metadata is present. Staged transfer/count sealed-state semantics, full Smart Item integration and acceptance remain open. No verification has been run.

P11 implementation has started in Native Smart Item and Web Catalog: weight stock accepts a physical package amount such as `5 kg`, converted to canonical grams before stock quantity, package cost, opening balance, and scan quantity are derived. Native and Web product recipe editors accept kitchen units (`kg`/`g`, `l`/`ml`, or compatible count units) and convert to the selected stock item's base unit before save and costing. Native validates referenced recipe stock, and staged SQL persists bounded recipe lines with active stock references. Full Smart Item parity, legacy-unit normalization, dimension-specific server validation, and gram-based workflow acceptance remain open. No verification has been run.

P12/P13 source work is underway: the Native Smart Item already divides full-batch recipe quantities by declared yield and previews per-portion cost; POS orders snapshot selected portions/recipe usage and deduct ingredients when fired. This slice extends Web Catalog recipe authoring and staged SQL persistence, preserves serving and inventory metadata during product edits, and records staged serving/whole-container stock effects in `order.fire`. Separate batch-prep inventory production, full Web Smart Item/batch setup, and serving/recipe acceptance remain open. No verification has been run.

P14 implementation has started: Web till close now shows expected cash, counted cash, and computed variance; it treats an explicit zero count as zero, requires a reason for any non-zero variance, and blocks variance-authority actions unless the user's permission is present and configured tolerance is exceeded. Native SQLite and staged SQL apply the same tolerance rule from `tillPolicy.varianceThreshold` (KES); exact-tolerance variance is within policy. Web POS/Finance/Refunds route protocol errors through operator-facing guidance for permission, conflict, duplicate-reference, state, validation, unsupported operation, and connectivity failures. Existing Web M-Pesa statement review and original-payment-aware refund flows remain the source baseline. Standardized payment footer and full financial acceptance remain open. No verification has been run.

P15 implementation has started: Web goods-receipt entry defaults each line's delivered quantity to its remaining approved quantity, including partial receipts, and uses whole-number input steps/validation for package counts. Rejected quantities remain explicit and require a reason; invalid lines now block the entire receipt draft with a visible correction message instead of silently omitting a line. Over-receipt remains a separate approval-gated action and rejected goods do not reduce outstanding accepted quantity. Native and staged SQL already enforce optimistic PO versions, partial receipt accounting, package conversion, and separate over-receipt approval. Procurement defaults, broader invoice/receipt acceptance, and all verification remain open.

P16 implementation has started: Administration's controlled Import Center inspects only the selected CSV/TSV header row and suggests likely field matches for product, stock, guest, and supplier templates. Suggestions are explicitly advisory and are not submitted as mappings or used to alter import data; the server dry-run remains authoritative. Staff role choices are presented as built-in role templates with plain-language scope reminders. Direct readiness-to-settings links, generated staff identifiers, sensitive-action re-authentication, custom mapping workflows and acceptance remain open. No verification has been run.

P17 implementation has started: the deterministic help-index generator now emits structured overview, example, procedure steps, system-handled/recorded notes, common mistakes, related tasks, optional guide ID, and estimated duration for all 40 operator guides. Web Help renders these as task-first cards with a direct **Show me** workspace action, related-task navigation, guided-tour entry and expandable full reference. Procedure prose is split into concise sentence steps; duration is estimated from step count unless guide metadata supplies one. Authenticated committed-operation guide progress remains separate. Native/Web visual parity, contextual guide anchors and acceptance remain open; no tests have run.

P18 implementation has started: a generated Markdown/JSON parity ledger now materializes all 79 `WEB_OPERATION_MANIFEST` entries with native, staged PostgreSQL, Web, offline, approval, versioning, audit, stock, financial, acceptance-test and operator-UX fields. Duplicate/missing metadata are rejected by the generator; build and documentation commands regenerate it, and docs checks compare operation counts and required fields. These entries remain source declarations, not proof of UX/domain acceptance or deployment. Manual operator UX review and remaining parity implementation remain open; no verification tests have run.

P19 implementation has started: audit against current call sites found Guest Accounts already queues `folio.postService` and `folio.pay`, and Web POS already has `pos.roomCharge`; the manifest has been corrected to reflect those existing flows. Guest Accounts now adds a permission-gated reversal workflow for an unreversed unpaid folio charge (including POS room charges), with required reason and server-side paid-charge/replay/version checks. The folio guide documents the Web path. Broader assets, maintenance, floorplan, imports and cross-client workflow acceptance remain open. No tests have run.

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

Complete:

```text
upload/paste
→ map
→ validate
→ dry-run
→ error rows
→ correct
→ review
→ admin.import.apply
→ result
→ audit
```

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
