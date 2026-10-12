# SERVEOS POS 2.0: Device Access, Stock Conflict Recovery & Operator UI Patch

**Priority:** P0 for stock-fire recovery, trusted-device approval, and shared transaction notifications; P1 for cashier usability and consistent error presentation.  
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

## 5A. P0-D: SERVEOS-wide toast notification and persistent-alert system

**Observed requirement:** The owner reports missing toast notifications. Screens currently depend heavily on inline notices, technical Activity cards and generic alerts. Before creating a second implementation, Codex must locate and audit any existing toast, notification, snackbar, global-alert, operation-outcome and connectivity components. Reuse or consolidate rather than layering duplicate systems.

### Design and component architecture

Create **one** typed application-shell notification service, available to POS 2.0, legacy advanced functions while retained, Inventory, Procurement, Rooms, Front Desk, Guest Accounts, Finance, Activity, Staff/Devices, Settings and printer workflows. Suggested interface (adapt to actual repository conventions):

```ts
// Illustration only. Keep actual implementation aligned with existing TypeScript conventions.
type NoticeSeverity = 'success' | 'info' | 'warning' | 'error';
type NoticeStage = 'local' | 'pending' | 'confirmed' | 'rejected' | 'conflict' | 'unknown';
type OperatorNotice = {
  id: string;                        // stable event/command identity for deduplication
  severity: NoticeSeverity;
  stage?: NoticeStage;
  title: string;
  message?: string;
  scope?: { businessId: string; deviceId?: string; orderId?: string };
  dedupeKey?: string;
  action?: { label: string; onAction: () => void };
  persistent?: boolean;
};
```

A single `ToastProvider` / `NotificationCenter` + `ToastViewport` at the authenticated application shell should own rendering, queueing and lifecycle. Domain screens publish **semantic events**, not arbitrary success strings. Bind notices to canonical command outcomes and local-store events, not simply the fulfilment of a click handler or optimistic React mutation. Do not require every component to maintain a separate `setMessage()` and duplicate alert.

**Visual and responsive requirements:** clean compact dark-theme surfaces matching SERVEOS, descriptive icon plus short title, optional concise body, semantic severity, optional one-click action and accessible close. Desktop: top right below the global header; compact POS 1024×600 and tablets: a safe nonblocking inset position that never covers basket totals, payment buttons, barcode search, dialog actions or nav; mobile: top safe area or an explicitly measured unobstructed region. Toast should never steal focus by default. Position may be responsive, but the business status must remain visible even when a toast times out.

### Notification taxonomy: required state and messaging

| Event | Correct user-facing feedback | Notification policy |
| --- | --- | --- |
| Product added to local **draft** basket | “SPORTSMAN added to basket” | Optional lightweight 1–2 second toast or non-toast inline feedback; never “Order saved to server” |
| Normal order command confirmed | “Order updated” / “Items fired” with order context | Success toast **only after** API confirmation; preserve order status in screen |
| Fire rejected: `INSUFFICIENT_STOCK` | “Cannot fire: not enough stock for SPORTSMAN” with **Review stock** | Error toast **plus persistent** actionable shortage panel, exact details only if known |
| `VERSION_CONFLICT` | “Order changed on another device” / **Review current order** | Warning toast plus persisted conflict workflow |
| Local offline cash recorded durably | “Cash recorded on this device. Pending server sync.” | Info/warning toast, not fully settled/authoritative; retain local Activity proof |
| Offline sale synchronized and confirmed | “Offline cash sale confirmed by server” with original stable sale reference | Success transition **once per command**, not once per sync poll |
| `OUTCOME_UNKNOWN` | “We are checking whether this was saved” / **Check Activity** | Warning toast plus persistent outstanding-outcome banner; no duplicate submission |
| Payment server-confirmed | “Payment confirmed” with formatted KES amount where verified | Success toast after server and visible order/payment state reconcile; no premature “Paid” |
| Customer-reported M-Pesa reference not verified | “Reference saved for verification” | Informational; never “M-Pesa payment confirmed” |
| Stock receipt/count correction confirmed | “Stock updated at Bar Store” | Success toast, with audit trail; on failed validation show specific remedy |
| Device access request submitted | “Device approval requested” | Info toast + persistent pending request state |
| Device approved/revoked | “Device approved” / “Access revoked” | Success on confirmed API outcome, with security context; do not reveal secrets |
| Connection lost/restored | “Offline. Using available device capabilities” / “Back online. Checking pending work” | One **transition** toast, not every browser event/re-render |
| Sync completed | “3 changes confirmed; 1 needs review” | Grouped notice once per completed cycle **only if meaningful changes**, with Activity link |
| Printer job queued / delivery uncertain | “Receipt queued” / “Printer result uncertain. Check paper before reprinting” | Stage-specific notice; delivery uncertain must retain persistent recovery evidence |
| Storage unavailable or local save failed | “Sale not saved. Do not hand over items or accept payment on this screen.” | Blocking/persistent operational warning; never a disappearing toast alone |

### Reliability and safety rules

1. **Never use a toast as the only evidence of a financial, stock, offline, device-security, or print outcome.** Persistent contextual state, Activity history, API/audit records and local cash evidence remain authoritative.
2. **No false success:** distinguish tap accepted, draft saved, queued, outcome unknown, rejected, server confirmed and physically printed. Payment and offline sale wording must match confirmed authority.
3. **Exactly-once presentation per meaningful event in the active tab:** use command ID + outcome state (or local sale reference + transition) as dedupe key. Do not re-fire toast on rendering, background polling, rehydration, periodic feed refresh, multi-tab duplicate update, or repeat push. Cross-tab coordination should avoid redundant notifications without hiding each tab's critical persistent state.
4. **Queue/rate limit:** no storm of identical toasts on sync. Show at most 3 visible toasts, coalesce bulk results and prioritize errors. A rapid series of basket taps should not blanket the screen. On business change or sign-out, clear nonpersistent notifications without losing the underlying durable Activity evidence.
5. **Duration policy:** suggested default 3–4 s for confirmed success, 5–7 s for informational/warnings; critical errors must also appear in a persistent panel and cannot be silently lost when toast expires. If a toast has an actionable control, allow enough time to access it and offer the same action in the main workflow. Pause timed dismissal for pointer hover and keyboard focus, but do not use an infinite pile of toasts.
6. **Accessibility:** `role=status` / polite announcement for routine info/success; `role=alert` / assertive for genuinely urgent failures only. Avoid duplicating the same announcement through an inline alert and a toast; use an announcement coordinator. Fully keyboard operable, screen-reader labels, sufficient contrast, predictable Tab order and prefers-reduced-motion support.
7. **Action security:** toast buttons only open authorized UI or request confirmed status; no hidden elevated action, no 'retry payment' for outcome unknown, no direct stock override, no 'print again' before uncertainty review, and no issuing a new signed offline grant when offline.
8. **Offline durability:** transient toasts do not need persistence, but unsynchronized sale/print/device approval/outcome data must persist in the existing IndexedDB/server store. Toasts cannot be a replacement for the Activity and recovery screens.
9. **Privacy:** display human-readable product names and safe order references, not full sensitive tokens, customer details, PINs, password, private JWK, raw JSON or UUIDs except through authorized technical details. Scope subscriptions by business and authenticated session.
10. **Honest connectivity:** `navigator.onLine` alone does not prove API reachability. Use authenticated API/sync health state for “Back online / synchronized” claims; separate network transitions from server-confirmed recovery.

### Engineering integration checklist

- Audit whether a toast component/provider already exists. Extract it into a shared shell-level service if so, rather than introducing competing `setTimeout` implementations in individual workspaces.
- Integrate the existing command outcome union (`CONFIRMED`, `PENDING`, `OUTCOME_UNKNOWN`, `REJECTED`, `CONFLICT`, `BLOCKED`), API errors, synchronizer updates, IndexedDB local cash state transitions, device request/revoke workflows, and print-delivery outcomes. Do not infer semantics from HTTP 200 alone.
- Wire actions to existing route/open-record handlers: **View order**, **Review stock**, **Open Activity**, **View device request**, **Open printer recovery**. Preserve keyboard focus and scroll state on navigation.
- Add common copy rules and severity mapping for `INSUFFICIENT_STOCK`, `VERSION_CONFLICT`, permissions, checkout authorization expiry, missing product/location, storage quota failure, printer uncertain delivery and unverified M-Pesa.
- Cover user roles, mobile/compact POS and page transitions. Keep toast host outside modal backdrops where appropriate without allowing interaction with an inaccessible background. Do not hide a modal's focus trap or create focus leaks.

### Toast-specific acceptance tests (must run in addition to section 7)

1. One stock-failed `order.fire` produces **one** specific error toast and a persistent actionable shortage card; no generic stale-version instruction, no stock debit, no ticket and no hidden basket.
2. Retrying background sync 5+ times with unchanged known conflict/confirmed command produces **zero repeated toasts**. On a genuine new state transition, show exactly one correctly worded notice.
3. A local offline cash commit first says “Recorded locally, pending sync.” A later server confirmation updates it **once**; page reload does not falsely reannounce confirmation. No receipt/paper claim before appropriate printing evidence.
4. `OUTCOME_UNKNOWN` produces a persistent review path and never renders a green confirmed toast until same-ID status is proved.
5. Staff access request, approval, denial and revocation show role-appropriate notifications with server-confirmed semantics; an unauthorized device cannot approve or alter its own policy via a toast action.
6. 20 rapid product scans, repeated sync ticks and simultaneous notification sources remain usable (max 3 stacked, coalesced); scanner focus, basket totals and pay button stay usable on 1024×600 and tablet/mobile.
7. Keyboard-only and screen-reader operation announces messages appropriately; reduced-motion mode works; toast actions are reachable and a dismissed toast leaves the persistent transaction result accessible.
8. API disconnected but `navigator.onLine=true` never produces false “Back online / synchronized”. A rejected M-Pesa reference never produces a “Payment received” success toast.
9. Unknown print delivery does not create a “Printed” success toast; retry only through existing print recovery guard and without regenerating money/stock commands.

## 6. Engineering changes / files to examine

**Frontend:** application shell notification provider/viewport, any existing toast/snackbar components, `src/runtime/web/ActivitySyncCenter.tsx`, `WebApiPosView.tsx`, `WebApiOfflinePosPanel.tsx`, `pos2/CashierWorkspace.tsx`, `pos2/OfflineCashSetup.tsx`, `WebStaffAdminView.tsx`, `WebApiSessions.tsx`, `WebBusinessApp.tsx`, `workspaceRegistry.ts`, `apiAuth.ts`, `apiClient.ts`, `BusinessStore.ts`, `operatorError.ts`; common dialogs, navigation and stock view components.

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

**Order:** (0) confirm branch, state and current implementation; (1) reproduce shortage on a disposable API/DB; (2) add structured typed stock diagnostics, without weakening validation; (3) implement recovery card + POS navigation and role-specific actions; (4) audit existing notifications and build shared typed toast/alert service; (5) finish server-side device approval + Devices & Access UI; (6) remove legacy offline UI access; (7) simplify cashier layout/empty/error states and wire scoped notifications; (8) add comprehensive tests including notification timing, deduplication, accessibility and offline semantics; (9) update sprint docs and staged release evidence; (10) propose deployment candidate, without cutting over.

**Done only when:** An operator understands the stock shortage and can resolve it through a legitimate workflow without losing the order or duplicating stock/money. An authorized admin can discover, approve, scope, inspect and revoke devices through one visible workspace. Legacy one-sale offline UI is unreachable. Operators receive reliable, scoped, accessible toasts for meaningful outcomes without losing persistent audit/recovery evidence or receiving false payment/stock confirmations. The updated tests prove this against the same SHA, and production requires its separate deployment approval.
