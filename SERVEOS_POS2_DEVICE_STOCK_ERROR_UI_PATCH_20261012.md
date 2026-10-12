# SERVEOS POS 2.0: Device Access, Stock Conflict Recovery & Operator UI Patch

**Priority:** P0 for stock-fire recovery and trusted-device approval; P1 for cashier usability and error presentation.  
**Target repository:** `davemusau00/SERVEOS-WEB`  
**Target branch:** `feat/pos2-cashier-tickets-offline`  
**Status:** Codex implementation instructions, not a production deployment authorization.  
**Evidence:** Owner screenshots dated 12 October 2026. Activity reports `order.fire`, `status=CONFLICT`, `code=INSUFFICIENT_STOCK`, `retryable=false`; the original SPORTSMAN KES 25 order stays OPEN with one unfired line. Other screenshot exposes old one-sale/30-minute offline panel.

## 0. Instructions to Codex

Read this document alongside `SERVEOS_POS_2_0_OFFLINE_CASHIER_DEV_SPRINT_20261011.md`, `docs/sprint/pos2-offline-cashier.md`, `Deployment.md`, and the actual source before editing. Record exact branch/SHA, changed/untracked files, running services and effective deployed cohort flags. Implement on an isolated feature branch; do not overwrite uncommitted developer work or infer readiness from UI rendering or source-only tests.

**Invariants:** PostgreSQL/API remains the shared authority. Preserve stable command IDs and idempotency, durable local/offline cash evidence, change feed, stock/location versions, printer evidence and receipt immutability. No negative-stock bypass, fabricated opening balances, undocumented inventory edits, premature “paid/fired” claims, auto-replaying `retryable:false` commands, silent overwrites or privilege escalation. Keep signed bounded offline grants. Do not clear IndexedDB, browser caches with unsynced evidence, print queues, active production data or Docker volumes to make a test pass.

These instructions authorize development and staged tests **only**. Any VPS production migration, service cutover, disabling live writers, or release still requires the Deployment.md stop/approval and backup gates.

## 1. Verified code observations

- `src/runtime/web/ActivitySyncCenter.tsx` renders a generic conflict explanation regardless of the actual error code; error details are mostly raw JSON.
- `apps/api/src/pos-commands.mjs` `fire()` validates the order and stock/version state and calls `consumePhysical` before committing stock movements. Preserve the atomic correctness of this flow.
- `src/runtime/web/WebApiPosView.tsx` still exposes `LegacyWebApiPosView` and `WebApiOfflinePosPanel`, the old one-sale/30-minute workflow. In contrast, `pos2/CashierWorkspace.tsx` and `pos2/OfflineCashSetup.tsx` implement the newer signed, four-hour enrolled-shift local cash workflow.
- `src/runtime/web/WebStaffAdminView.tsx` already contains **Staff & devices**, lists enrolled devices and supports `device.revoke`. Do **not** mark listing/revocation missing. The gap is secure **request, approve/deny, scope and enable** user experience for devices, with straightforward visibility and management.
- `apps/api/src/device-commands.mjs` exposes `device.revoke`. `src/runtime/web/apiAuth.ts` requires `devices.register` or `devices.manage` during self-enrollment. A pending admin approval lifecycle must be implemented server-side, not simulated with a frontend toggle.
- `src/runtime/web/WebApiSessions.tsx` manages login sessions, which are distinct from enrolled physical/browser devices and from offline trading capabilities.
- `src/runtime/web/workspaceRegistry.ts` already labels the destination “Staff & devices”; check effective role visibility and navigation instead of creating another disconnected route.

## 2. P0-A: Fix Order Fire / insufficient-stock recovery

### Problem

The API gives `status=CONFLICT` and `error.code=INSUFFICIENT_STOCK` but Activity tells the user to reopen with fresh versions. This is not necessarily a version mismatch. The operator sees no item, location, needed quantity, available quantity or recovery action. A held line is stranded even though its state is correctly preserved.

### API contract

Investigate `consumePhysical`, error serialization, product/recipe snapshots, stock-balance projection and outlet default stock location. Add safe typed details when truly available. Do not guess a quantity on the client.

Suggested backward-compatible result:

```json
{
  "status":"CONFLICT",
  "error":{
    "code":"INSUFFICIENT_STOCK",
    "message":"Not enough stock to prepare this order.",
    "retryable":false,
    "details":{
      "orderId":"<uuid>",
      "stockLocationId":"<uuid>",
      "shortages":[{
        "stockItemId":"<uuid>",
        "lineIds":["<uuid>"],
        "required":"<numeric-string>",
        "available":"<numeric-string>",
        "shortfall":"<numeric-string>",
        "unit":"piece-or-ml-or-g",
        "sealedContainers":null,
        "openQuantity":null
      }]
    }
  }
}
```

Example placeholders are not real stock values. If a specific quantity is unavailable, return only known IDs and allow a fresh permission-filtered stock lookup. Avoid leaking other-business stock.

### Operator recovery UI

Build a reusable `CommandResolutionCard` used by `ActivitySyncCenter`, POS fire review and related dialogs. It must show:

- **Headline:** “Not enough stock to prepare Counter sale.”
- **Impacted item:** real product name (SPORTSMAN here), requested quantity and physical unit, current outlet/stock location, actual shortage when available.
- **Transaction status:** “Item held, not fired. No preparation ticket issued. Order remains OPEN.” Only assert these after checking confirmed state.
- **Actions:** **View stock**; **Receive delivery** (authorized roles); **Correct stock count** (audited manager/storekeeper permission); **Edit/remove held item** (authorized cashier); **Refresh and review order**.
- **Return-to-order:** retain the original order and focus, refresh records and versions, require the operator to review before creating a new `order.fire` command. Never reuse a known rejected/conflicted command ID for a modified operation.
- **Technical details:** collapsed, redacted, copyable original command ID and structured error code.

Error classification must be based on `error.code` and state, not on `CONFLICT` alone:

| Code/state | User message | Safe next step |
|---|---|---|
| `INSUFFICIENT_STOCK` | Not enough stock at this outlet | Review stock / receive / correct count / edit held line |
| `VERSION_CONFLICT` | Another device changed this record | Refresh current values, compare, re-review and submit new command |
| `STOCK_CONFIGURATION_CHANGED` | Product's stock setup changed | Review product linkage/portion; re-add eligible held line |
| `FIRE_SELECTION_CHANGED` | Items selected to fire changed | Reopen fire review against current held lines |
| `PERMISSION_DENIED` | Your role/device isn't authorized | Request manager or device authorization |
| `PENDING_SYNC` | Saved locally and waiting to synchronize | Show real queue state, no server-confirmation claim |
| `OUTCOME_UNKNOWN` | Still checking whether this completed | Check status of original command ID; no duplicate |
| `REJECTED` | Server definitively declined action | Fix reason before creating different reviewed command |

### Stock cause diagnostics

Review (without inventing any conclusion): genuinely zero stock; opening stock never recorded; wrong outlet/default stock location; product/stock-master linkage mismatch; whole pack vs stick/can configuration; sealed bottle vs open ml; insufficient recipe ingredients; provisional offline consumption; stale stock balance versions; sale quantity greater than balance. The system must identify which case is supported by current data. Stock counts must use approved immutable adjustment movements with before, after, delta, reason, actor and versions. Never silently update a stock balance, stock master or location.

A failed fire must not consume stock, create a KOT/BOT, issue an authoritative receipt, settle payment, lose basket changes, or prevent unrelated safe orders. The rejected command remains immutable evidence.

## 3. P0-B: Proper Admin > Devices & Access management

Create a clear permission-gated page `Management / Devices & Access` or a fully reachable `Staff & devices > Devices` subsection. Reuse existing enrolled-device, staff and sign-in session data. Avoid a second device identity database.

### Screen sections

1. **This device:** friendly label, browser/OS, browser capability test (online-only vs trusted offline terminal), staff operator, assigned outlet, till status, last sync, device ID masked, signed lease status/expiry, unresolved offline sales/prints. Explicitly distinguish server-confirmed vs locally cached data.
2. **Pending approval:** new browser/tablet/computer requests; requesting staff, device type (POS, waiter, kitchen, receptionist, manager), desired outlet, permitted capabilities, request age and status. **Approve / Deny** with reason and audit. No operator UUID entry required.
3. **Approved devices:** searchable table/cards with friendly name, assigned employee, device type, location/outlet, role/capabilities, last seen, sessions, status and last sync. Statuses: Pending, Approved, Active, Suspended, Revoked, Last seen unknown. Do not call a device online based on stale timestamps.
4. **Capabilities & policies:** controlled role presets and advanced permissions for cashier checkout, waiter tickets, KDS, reception and owner devices. Expose `pos2.simpleCashier`, `pos2.waiterTickets`, `pos2.offlineCash`, `pos2.offlineAuthV2`, `pos2.localKitchenTickets` where appropriate, but only edit through server-authorized versioned policies. UI checkboxes cannot create backend authority.
5. **Sessions:** link to existing Sessions management. Explain that device revocation, session revocation and offline-lease termination are separate operations and may require recovery/reconciliation.
6. **Recovery & security:** suspend, revoke with reason, re-enroll replacement device, controlled handoff, identify pending cash/print evidence; block unsafe closure or reassignment until reconciled. Prevent self-revocation without another trusted admin and enforce last-admin protection.

### Backend work

Inspect current API enrollment route/schema and policies. If requests/approvals do not exist, build server-side request → pending → admin approve/deny → one-use authorization → device enrollment flow. Include short request expiry, replay resistance, rate limits, anti-CSRF/session binding where applicable, staff identity binding, business/outlet scope, device-generated key proof if supported, authorization/audit trail, revoked/stolen-device fencing, and idempotency. A staff user who lacks registration power must be able to **request** access safely, not silently self-enroll. A manager must approve according to explicit `devices.manage`/admin policy, not an arbitrary browser permission flag. Only approved enrolled devices can get signed offline checkout capabilities.

**Important:** Current POS 2.0 intentionally supports a single enrolled offline cashier device in its initial release. Do not enable simultaneous independent offline till authorities on multiple devices simply by adding approval controls. Keep the one-cashier/grant allocation restriction until multi-device offline contention is independently designed and accepted.

**UI copy:** unrecognized device: “This device needs administrator approval.” Actions: “Request access”, “View request status”, “Contact administrator”. An admin sees “Approve this device for waiter orders at BAR”, not “Enter device UUID”. Preserve a safe initial-admin bootstrap/recovery path to prevent lockout.

## 4. P0-C: Retire old offline screen from reachable POS

Remove `WebApiOfflinePosPanel` from active `LegacyWebApiPosView`, Advanced POS, role fallbacks and bookmarked routes. Remove “One offline cash sale / 30 minutes” CTA and BAR/KITCHEN product exclusion. Keep old command history and reconciliation evidence readable; do not delete historical data. Make `CashierWorkspace` the default where the approved POS2 capability is active, with a useful administrator path to enable the eligible cohort/device if disabled. Do not bypass session or lease signatures.

Maintain correct four-hour signed device/offline shift provisioning for the current baseline, configurable duration only under a documented risk policy. Do not equate “we can provision four hours” with indefinite offline authority.

## 5. P1: Simplify old POS/Activity and standardize errors

- Active outlet and stock location must be obvious; show till/cashier and connection/permission state.
- Make sellable catalogue counts intelligible: “2 shown of X available for this outlet”, reset filters, distinguish no products from no products after filters/sync, and do not hide legitimate BAR/KITCHEN items solely because they require preparation.
- Normal task flow: scan/search → add to basket immediately → fire relevant lines → review payment → server confirmation or signed local cash evidence → correct receipt state. Avoid five unrelated settings detours for an ordinary sale.
- Keep customer assignment, discounts, comps, quantities, voids, repeats, tabs/tables and payments, but expose advanced controls contextually rather than saturating the small-screen cashier workspace.
- Activity cards must answer four questions: what happened, what was saved, whether cash/stock changed, what action safely resolves it. Avoid forcing people to parse technical JSON or guess how to open an order.
- Provide route navigation, retry-status-only controls for `OUTCOME_UNKNOWN`, focus restoration, visible progress, empty states and permission-aware actions. Avoid dialogs with controls hidden behind an overlay.
- Show “No stock” vs “Out of stock at BAR location” vs “Not loaded” vs “Pending sync” accurately. Uncertainty must never be presented as confirmed success.
- Keep 80 mm-only printed documents and unverified/possibly printed evidence. A failed fire cannot produce a BOT/KOT. Printing recovery must never trigger a second payment or stock debit.

## 6. Engineering changes / files to examine

**Frontend:** `src/runtime/web/ActivitySyncCenter.tsx`, `WebApiPosView.tsx`, `WebApiOfflinePosPanel.tsx`, `pos2/CashierWorkspace.tsx`, `pos2/OfflineCashSetup.tsx`, `WebStaffAdminView.tsx`, `WebApiSessions.tsx`, `WebBusinessApp.tsx`, `workspaceRegistry.ts`, `apiAuth.ts`, `apiClient.ts`, `BusinessStore.ts`, `operatorError.ts`; common dialogs, navigation and stock view components.

**Backend:** `apps/api/src/pos-commands.mjs` `fire()`/physical consumption, `device-commands.mjs`, auth/enrollment/session routes, device/migration/permission policies, error serializer, command kernel, idempotency and stock balance projections. Reuse existing event/audit models. Add migrations only after inspecting actual schema and checksum history. Existing migrations are immutable.

**Docs:** this patch, `docs/sprint/pos2-offline-cashier.md`, operator Help, role/device authorization guidance, release/deployment evidence and acceptance matrix.

## 7. Non-negotiable acceptance tests

1. Given SPORTSMAN ×1 held at BAR and no valid stock, server returns `INSUFFICIENT_STOCK`; POS shows a named shortage and authorized actions. Order remains OPEN and line held. No stock movement, preparation document, payment or receipt is created.
2. Receive stock or perform approved counted correction, then open the same original order, fetch latest stock/order versions and fire with a **new** ID. Fire once, decrement once, one KOT/BOT if route requires it. Old conflict remains visible historically.
3. Role without inventory rights sees stock details but cannot correct stock; manager correction demands valid reason and creates immutable evidence.
4. Correct unit/location presentation for product sold as pack/stick and bottle/sealed/open ml. An archived/wrong location or empty stock is not misrepresented as available elsewhere.
5. `VERSION_CONFLICT` gives distinct guidance; an `OUTCOME_UNKNOWN` command resolves via original ID, with no double fire or payment. Known `INSUFFICIENT_STOCK` is never blindly retried.
6. Device request → approve → enrolled projection → scoped POS access works. Request expiration/denial, replay, cross-business isolation, role checks and stolen-device revocation all fail closed. An ordinary waiter cannot approve themselves.
7. Staff/device list remains usable, sign-in sessions remain separate, active self-revocation and last-admin protections hold, and previous signed offline evidence remains recoverable.
8. Legacy “one-sale / 30 minutes” screen is inaccessible through Advanced POS, capability fallback, mobile, page reload and bookmarked link, without deleting historic offline records.
9. Approved V2 cashier performs multiple cash sales while offline within the signed shift limit, survives reload and reconnect, reconciles exactly once with correct tax, prices, quantities and provisional receipt handling.
10. Test 1024×600 POS, 1280×720 desktop, 1280×800 Android/tablet landscape, portrait and 390×844 mobile. All primary actions visible; scanner, keyboard and touch navigate correctly. Inputs and unsynced basket survive recoverable errors.
11. Safe server/session/protocol updates preserve persistent cash/print evidence and status. No hidden failure on connection loss or browser storage quota failure.
12. End-to-end physical XP-80T print and receipt/QR/margin tests remain separately required before print acceptance can be claimed; passing browser tests alone is not physical print proof.

Use the repository's real scripts (including `npm run verify:release` where available), real API + PostgreSQL acceptance tests, Playwright desktop/mobile, and hardware checks. Report executed commands, skipped gates, exact SHA, before/after screenshots, and verified results. Do not edit tests to hide a failed business invariant. Do not call this complete merely because UI source compiles.

## 8. Codex sequence and definition of done

**Order:** (0) confirm branch, state and current implementation; (1) reproduce shortage on a disposable API/DB; (2) add structured typed stock diagnostics, without weakening validation; (3) implement recovery card + POS navigation and role-specific actions; (4) finish server-side device approval + Devices & Access UI; (5) remove legacy offline UI access; (6) simplify cashier layout/empty/error states; (7) add comprehensive tests; (8) update sprint docs and staged release evidence; (9) propose deployment candidate, without cutting over.

**Done only when:** An operator understands the stock shortage and can resolve it through a legitimate workflow without losing the order or duplicating stock/money. An authorized admin can discover, approve, scope, inspect and revoke devices through one visible workspace. Legacy one-sale offline UI is unreachable. The updated tests prove this against the same SHA, and production requires its separate deployment approval.
