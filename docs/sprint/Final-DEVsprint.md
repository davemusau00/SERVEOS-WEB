# Final-DEVsprint.md

# SERVEOS: Final Development Sprint Plan

**Project:** SERVEOS-WEB  
**Product:** Kenyan hospitality ERP, POS, hotel and restaurant operations platform  
**Primary pilot environment:** Countryside  
**Repository:** `davemusau00/SERVEOS-WEB`  
**Development branch reviewed:** `feat/pos2-cashier-tickets-offline`  
**Production baseline previously identified:** `reset/vps-platform`  
**Plan status:** Active implementation backlog; POS2 release evidence recorded separately; operational alerts implementation under local validation; broader epics remain open  
**Prepared:** 12 October 2026  
**Reviewed:** 12 October 2026, against repository source and the recorded POS2 release; no fresh VPS inspection in this documentation update

---

## 1. Executive Summary

SERVEOS has the foundations of a substantial hospitality management system, including POS, cashier operations, kitchen and bar tickets, room reservations, front desk, housekeeping, procurement, inventory, financial records, reporting, offline synchronization, thermal documents, and staff permissions.

The next development phase must turn these capabilities into a **coherent, dependable and easy-to-operate product**.

The objective is not to add more isolated features or apply cosmetic CSS fixes. It is to resolve the gaps between modules, eliminate confusing workflows, unify the interface, strengthen financial correctness, and make the system practical for Kenyan hospitality businesses operating with real staff, real customers, intermittent internet, and inexpensive hardware.

### Primary outcomes

1. A visually consistent interface across every operational screen.
2. A compact, fast, intelligible KDS for kitchen and bar staff.
3. Reliable room bookings with consistent rates, availability and folio calculations.
4. Simpler role-based navigation that exposes relevant tasks rather than every module.
5. Correct, auditable management reporting, including a genuine profit-and-loss statement.
6. Reliable POS2, offline cash, ticket synchronization and 80mm thermal printing.
7. Transparent import permissions, safer catalog migration and reconciliation.
8. Working interactive guidance and staff onboarding.
9. A coherent QR-ordering workflow where supported by the existing architecture.
10. A tested, staged deployment with clear rollback and sign-off procedures.
11. Durable order alerts, cashier M-Pesa reference review and task-focused mobile navigation.

### Non-negotiable product principle

**A new employee should understand the next action without knowing the underlying database, permission codes, transaction states or internal architecture.**

The system should communicate in the language of hospitality operations, not developer implementation details.

---

## 2. Scope, Evidence and Implementation Rules

### 2.1 Evidence classifications

Every issue and feature must carry one of these statuses:

- **Verified in source:** Confirmed by inspecting repository code.
- **Observed in UI:** Reported through screenshots or user testing.
- **Previously identified:** Recorded during earlier repository, deployment or workflow reviews.
- **Requires verification:** Plausible gap or design requirement that must be tested before implementation.
- **Implemented, not deployment-verified:** Source changes exist, but staging or production behavior has not been confirmed.
- **Completed and verified:** Automated tests, operational tests and acceptance criteria have passed.

Do not treat an observation as proof of a backend defect.

Do not mark a feature completed because a component exists or because a pull request was merged.

### 2.2 Core engineering rules

- Preserve existing production data.
- Preserve internal UUID identities, command IDs and audit records.
- Use human-readable references only as presentation identifiers unless the server explicitly owns their allocation.
- Keep all authorization checks enforced on the server.
- Preserve offline idempotency and replay guarantees.
- Do not double-post orders, payments, inventory movements or accommodation charges.
- Do not infer payment success from an uncertain network response.
- Do not invent financial results from incomplete accounting data.
- Do not perform destructive migrations or unreviewed backfills.
- Do not bypass reservation concurrency checks.
- Do not silently change tax categories, cost prices or room rates.
- Do not deploy directly to the live stack before staging verification.
- Do not modify unrelated production applications on the VPS.

### 2.3 Relevant source areas

| Area | Existing implementation |
|---|---|
| Main workspace and navigation | `src/runtime/web/WebBusinessApp.tsx` |
| Shared design tokens | `src/design-system/tokens.ts` |
| Kitchen and bar pass | `src/runtime/web/WebKDSView.tsx` |
| Room administration and bookings | `src/runtime/web/WebApiRoomsView.tsx` |
| Front desk and quick reservations | `src/runtime/web/WebHospitalityViews.tsx` |
| Finance and assets | `src/runtime/web/WebApiFinanceAssets.tsx` |
| Import workflow | `src/runtime/web/WebApiImportCenter.tsx` |
| Interactive guidance | `src/runtime/web/WebGuidanceViews.tsx` |
| Thermal document profiles | `src/runtime/web/documentPaperProfiles.ts` |
| Finance aggregation | `apps/api/src/postgres-store.mjs` |
| Reporting endpoints | `apps/api/src/reports.mjs`, `apps/api/src/server.mjs` |
| POS2 and offline functionality | POS runtime, sync, command and transaction modules |
| Database migrations | `apps/api` migration directory |

File paths must be revalidated against the branch HEAD when implementation begins.

---

### 2.4 Current source and recorded-release checkpoint

This document is the broader development backlog, not a declaration of general availability. The [POS2 release evidence](../releases/pos2-20261012-update.md) records the earlier deployment of `ce59c2b2caeb5aeab5734b605a43086799812801`, API canary on loopback 3103, expanded schema 077 and the retained 3102 API/PWA rollback artifacts. These are recorded observations, not fresh live verification in this turn. Re-run the canonical guide preflight before any further production change.

Repository baseline inspected for this update: `34e6043`, plus current working changes. That commit already includes migration 078 and the new default-off operational capability names. This does **not** establish that schema 078 or alerts are deployed. API readiness requires the candidate binary's exact migration manifest; preserve canonical SQL bytes and never edit applied migrations to satisfy a checksum.

| Area / backlog IDs | Current evidence and status | Remaining work |
|---|---|---|
| POS2 / POS-01 | Prior release documents signed offline cash, manager cash resolution, checkout handoff and pending-ledger upgrade/rollback tests; source contains these paths | Supervised real-staff pilot, complete provisional-stock presentation, exact supported-device evidence; no general-availability claim |
| Docker / OPS-02 | `apps/api/Dockerfile` uses repository-root context, copies root contracts and runs as `node`; prior release records nonroot image acceptance | Rebuild each candidate with its current dependency lockfile and verify module graph/image digest; never reuse stale staged context |
| Thermal / PRINT-01 | Source has explicit thermal-only profiles and fail-closed unknown types, readable reference helpers and immutable issued snapshots | Real printer/driver/cutter/QR/fiscal evidence remains unverified; physical acceptance was waived for the prior update, not passed |
| Navigation / NAV-01, NAV-02 | Source still offers all permitted desktop workspaces; the current alert cohort adds compact role-specific mobile tasks and More | Browser regression, device acceptance, wider desktop grouping/collapse and broader responsive polish |
| KDS / KDS-01 through KDS-04 | Inspection found older `productName`/`courseStatus` reads against canonical `name`/`preparationStatus`; this slice corrects mapping and uses readable order labels | Full dense-board redesign, queue timing, malformed-snapshot recovery and supervised kitchen/bar acceptance |
| Rooms / ROOM-01, ROOM-02 | Rooms passes an explicit `ratePlanId`; Quick Reservation uses configured property context and a different command payload | Prove shared day/night price parity, capacity/concurrency and upfront-payment/checkout behavior under the newly selected business policy |
| Finance / FIN-01 through FIN-03 | `financeSummary` uses journaled `REVENUE_SALES`, posted expenses and payable/payment summaries; it is not a full P&L | Historical sale-time cost/COGS reconciliation, defined accounting coverage, approved valuation policy, reporting drill-down and fixtures |
| Import / IMP-01, IMP-02 | Apply button remains conditional on execution permission; prior release reports 73 products / 72 stock masters | Permission explanation, pack/unit cost validation and authorized new catalogue setup; historical migration is out of scope for the new-install policy |
| Help / HELP-01 | Guided tours, anchor lookup and progress infrastructure exist | Prove published tours across loading, permission changes, navigation and mobile; an existing component is not acceptance |
| QR / QR-01 | No end-to-end ordering acceptance established in this review | Deferred future version; staff acceptance before fire is the selected policy |
| Alerts / ALERT-01 through ALERT-05 | Current source adds durable events/inbox, manual reference proposals/review, push outbox/worker and role-specific mobile tasks | Local acceptance results below, then isolated staging; real-device background delivery and activation remain separate gates |
| Design / DS-01, DS-02, QA-01 | Shared tokens/components exist; screenshots and observations identify remaining inconsistent surfaces | Complete screen matrix, accessibility/visual regression and low-end-device measurement |

### 2.5 Business choices supplied during this review

These choices narrow the corresponding future work; they do not silently change existing stored data or switch production features:

- **Rooms:** one easily configured standard rate across day and night stays; receptionist pricing overrides are not allowed. The current separate booking/rate paths must be reconciled and tested before this is marked implemented.
- **Payments:** cash upfront for the selected room workflow; new guest-deposit functionality is outside this version. Preserve existing authorized folio/deposit records and API compatibility until an explicit tested replacement exists.
- **Historical migration:** no historical data migration for a new installation. This never authorizes erasing the already active `serveos-next` business, its storage or financial evidence.
- **Taxes:** defer new tax/fiscal integration work for this slice. Preserve existing configured rates, issued snapshots and legal identifiers; this is not evidence that transactions are tax-exempt or fiscal-compliant.
- **M-Pesa:** manual merchant verification, no live Daraja/STK integration. A waiter forwards customer-claimed evidence; only the enrolled cashier records verified settlement.
- **Printing:** retain existing browser/OS 80 mm printing and relevant bridge code. No new bridge/hardware activation; physical acceptance remains open rather than recorded as passed.
- **QR:** defer customer QR ordering; a future implementation must require staff acceptance before stock/fire.
- **Inventory valuation:** retain the existing moving weighted-average inventory cost infrastructure and sale-time consumption cost evidence as the implementation starting point. Prove COGS/valuation reconciliation before presenting a full P&L; do not value historical sales using today's product cost.

---

## 3. Priority Register

**P0:** Blocks correctness, safe operation or release.  
**P1:** Serious workflow or usability defect.  
**P2:** Important product improvement.  
**P3:** Optional enhancement.

| ID | Priority | Issue | Evidence | Target |
|---|---|---|---|---|
| DS-01 | P1 | Uneven spacing, inconsistent control sizes and unpolished screens | Observed UI; source uses mixed local styles | Shared design system |
| DS-02 | P1 | Overlapping search icons, text and controls | Observed UI | Component-level fixes |
| NAV-01 | P1 | Too many top-level workspaces | Verified in source | Grouped, role-based navigation |
| ALERT-01 | P1 | Ticket/decision/preparation/payment updates need a durable role-scoped inbox | Current implementation; local validation in progress | Operational alerts |
| ALERT-02 | P0 | Waiter-submitted M-Pesa codes must never imply settlement | Manual-only policy; current API review implementation | Cashier evidence review |
| ALERT-03 | P1 | Background push needs safe subscriptions, retries and actual device delivery proof | Worker/SW implementation; physical devices unverified | Background alerts |
| ALERT-04 | P0 | Duplicate, stale or revoked notifications must not trigger financial actions or leak data | API/SW acceptance required | Authorization and replay |
| ALERT-05 | P1 | Pending cash and uncertain print delivery need accessible recovery alerts | Local and server evidence paths | Recovery inbox |
| NAV-02 | P1 | Navigation wastes space on operational screens | Observed UI | Narrow, collapsible sidebar |
| KDS-01 | P1 | Oversized empty KDS surfaces and weak ticket density | Observed UI | Responsive ticket board |
| KDS-02 | P1 | UUIDs and generic item names exposed to staff | Observed UI; fallback behavior verified | Human references and snapshots |
| KDS-03 | P1 | Conflicts and review indicators lack clear resolution | Observed UI | Actionable exception handling |
| KDS-04 | P1 | Station and status filters are confusing | Observed UI | Clear filter hierarchy |
| ROOM-01 | P0 | Booking and rate selection must be consistent across entry points | Different source flows verified | Shared reservation contract |
| ROOM-02 | P0 | Room availability and concurrent bookings need end-to-end verification | Existing checks verified; behavior pending | Reservation safety |
| ROOM-03 | P1 | Rooms combines setup and daily operations | Verified in source | Separate workspaces |
| FIN-01 | P0 | Existing finance summary is not a complete P&L | Verified in source | Correct accounting model |
| FIN-02 | P1 | Zero-value reports do not explain the underlying state sufficiently | Observed and source review | Explicit empty/error states |
| FIN-03 | P1 | Management lacks integrated trends and drill-down dashboards | Previously identified | Reporting experience |
| IMP-01 | P1 | Import execution button may disappear without explanation | Verified in source | Permission-aware messaging |
| IMP-02 | P0 | Suspicious purchase-cost and tax mappings in historical import | Previously identified | Data validation and approval |
| POS-01 | P0 | Offline cash, replay, tickets and shift reconciliation need pilot verification | Feature work identified | Transaction safety |
| PRINT-01 | P1 | Thermal document behavior needs physical printer acceptance | Source support identified | Printer QA |
| HELP-01 | P1 | Interactive tours reportedly fail on some screens | Observed; source implementation reviewed | Resilient guidance |
| QR-01 | P2 | QR feature requires end-to-end workflow and authorization review | Previously requested; implementation status to verify | Safe QR ordering |
| OPS-01 | P0 | Feature-branch changes are not equivalent to deployed changes | Previous deployment review | Staged release |
| OPS-02 | P0 | API Docker/contracts packaging must be validated in deployment | Previous source and deployment review | Reproducible build |
| QA-01 | P1 | Visual regression and device coverage are insufficiently demonstrated | Requires verification | Automated UI quality gates |

**Release rule:** All P0 items must be closed or explicitly blocked from release behind disabled feature flags. No unresolved P0 may be silently downgraded.

---

# PART I: PRODUCT EXPERIENCE REDESIGN

## 4. Epic DS: Complete UI Polish and Visual Coherence

**Priority:** P1  
**Owner:** Frontend lead and product designer  
**Dependencies:** None  
**Estimated effort:** 12–18 engineering days, distributed across all modules

### 4.1 Problem

SERVEOS currently contains multiple visual patterns that appear to have evolved independently.

Examples include:

- Uneven margins and padding between pages.
- Different spacing between labels, fields and buttons.
- Inconsistent heights for equivalent inputs.
- Cards with excessively large internal whitespace.
- Inconsistent border radius, shadows and background tones.
- Search icons that can overlap input text.
- Misaligned badges and toolbar actions.
- Inconsistent typography and heading hierarchy.
- Different button emphasis for equivalent operations.
- Tables that become difficult to use on narrow screens.
- Modals with inconsistent scrolling and footer behavior.
- Status colors that are not used consistently.
- Screens that feel empty despite containing actionable data.
- Some screens requiring unnecessary vertical scrolling.

These problems must be addressed systematically rather than by making unrelated one-off CSS changes.

### 4.2 Design token specification

Extend the existing shared tokens in `src/design-system/tokens.ts`.

#### Spacing

Use a deliberate 4-point spacing system.

| Token | Value | Usage |
|---|---:|---|
| `space-1` | 4px | Icon and label adjustments |
| `space-2` | 8px | Compact control gaps |
| `space-3` | 12px | Form field grouping |
| `space-4` | 16px | Standard card padding |
| `space-5` | 20px | Medium section spacing |
| `space-6` | 24px | Major section separation |
| `space-8` | 32px | Large layout separation |

Do not introduce arbitrary spacing values without documenting an exception.

#### Control sizing

- Compact input/button height: approximately 36px.
- Standard operational control: approximately 44px.
- Touch-critical primary actions: at least 44px high.
- Consistent icon sizing within the same control tier.
- Consistent label-to-input spacing.
- Consistent focus-ring and disabled-state behavior.
- Buttons must never expand to dominate a card without operational justification.

#### Typography

Define consistent styles for:

- Page title.
- Section title.
- Card title.
- Primary metric.
- Body copy.
- Secondary information.
- Form label.
- Helper text.
- Error text.
- Status label.
- Table heading.
- Monospaced technical identifiers, visible only where appropriate.

Avoid using tiny uppercase text for important operational instructions.

#### Semantic colors

Use shared meanings:

- Green: confirmed success or ready state.
- Amber: warning, pending attention or active preparation.
- Red: destructive action, rejected state or urgent exception.
- Blue: informational or synchronized state.
- Neutral: secondary and inactive content.

Never rely on color alone. Pair important states with readable labels or icons.

### 4.3 Shared component inventory

Standardize or build reusable components for:

- `AppShell`
- `WorkspaceSidebar`
- `PageHeader`
- `SectionHeader`
- `Toolbar`
- `SearchField`
- `FilterGroup`
- `StatusBadge`
- `MetricCard`
- `ActionCard`
- `TicketCard`
- `DataTable`
- `EmptyState`
- `ErrorState`
- `LoadingState`
- `OfflineState`
- `PermissionNotice`
- `ConflictResolutionPanel`
- `FormField`
- `FormGrid`
- `ConfirmationDialog`
- `Drawer`
- `Toast`
- `StickyActionFooter`
- `PrintStatusIndicator`

Reuse existing components where suitable rather than introducing duplicate implementations.

### 4.4 Layout rules

- All screens use the same page gutters and content-width logic.
- Dense operational screens prioritize actionable information above decorative space.
- Desktop screens may use multiple columns where this improves scanning.
- Mobile screens stack content without horizontal page overflow.
- Toolbars wrap predictably.
- Filters have an explicit hierarchy.
- Long names truncate only when the full value remains accessible.
- Search icons must never overlap placeholder text.
- Modal actions remain visible while long content scrolls.
- Empty states should be compact and helpful.
- Every visible status indicator must have a purpose.

### 4.5 Density modes

Introduce two documented layout densities:

**Comfortable:** Default for setup, finance, management and configuration.

**Compact:** Default for KDS, POS queues, stock lists, front desk and other high-frequency operational views.

Density must affect spacing and information layout, not remove required controls or reduce touch targets below acceptable sizes.

### 4.6 Responsive acceptance matrix

Test all priority screens at:

- 320px
- 375px
- 768px
- 1024px
- 1440px

Test on real or representative low-end Android devices, tablets and desktop browsers.

### 4.7 Acceptance criteria

- No overlapping icons, labels, badges or buttons.
- No unintended horizontal page scrolling.
- No clipped action menus or dialogs.
- Equivalent controls use equivalent sizes.
- Consistent page headers, cards and section spacing.
- Accessible focus indicators.
- WCAG 2.2 AA targeted for relevant interactions.
- All core workflows operable using keyboard and touch.
- Visual regression baselines captured for every major workspace.
- Role-specific mobile task bar and alerts retain authorized More access and basket state.
- Every modified screen passes the shared UI checklist.

**Definition of done:** No new screen can introduce an undocumented parallel design language.

---

## 5. Epic NAV: Simplified Navigation and Role-Based Workspaces

**Priority:** P1  
**Owner:** Frontend lead and product owner  
**Estimated effort:** 5–8 engineering days

### 5.1 Current problem

`WebBusinessApp.tsx` defines more than twenty top-level workspaces.

This creates a crowded navigation experience, especially for staff who need only a few daily actions.

A waiter should not have to navigate past accounting, asset management, system administration and procurement to find POS.

### 5.2 Proposed information architecture

Use six primary navigation groups:

| Group | Workspaces |
|---|---|
| Overview | Home, tasks, activity and alerts |
| Sales & Service | POS, cashier, KDS, tables and floorplan |
| Rooms & Guests | Front Desk, Reservations, Rooms, Housekeeping, Guest Accounts |
| Stock & Purchasing | Catalog, Inventory, Procurement, Suppliers |
| Finance & Reports | Finance, Expenses, Reports, Reconciliation, Refunds |
| Management | Staff, Assets, Settings, Imports, Administration, Help |

Groups should expand contextually.

### 5.3 Role-specific defaults

**Waiter:** POS, tables, own tickets and Help.

**Cashier:** POS, payments, tills, receipts, shift reconciliation and Help.

**Kitchen/bar operator:** KDS, station queue and relevant exception alerts.

**Receptionist:** Front Desk, Reservations, Guests, Room Status and Help.

**Housekeeper:** Assigned rooms, cleaning queue and maintenance escalation.

**Stock controller:** Inventory, receiving, stock counts and procurement.

**Accountant:** Finance, reconciliation, expenses, reports and payables.

**Manager:** Overview, cross-department reporting, approvals and configuration.

Backend permissions remain authoritative. Hiding a navigation item does not replace authorization.

### 5.4 Sidebar behavior

- Desktop: compact sidebar with optional expansion.
- Tablet: narrow rail or collapsible drawer.
- Mobile: fixed role-specific task bar plus a More drawer for all permitted workspaces; safe-area padding and at least 44 px touch targets.
- Remember preferred navigation density per staff/device where appropriate.
- Display current workspace and breadcrumb context.
- Support search or quick access for permitted workspaces.
- Keep operational content wide enough for useful tables and tickets.

### 5.5 Acceptance criteria

- Staff can reach their three most common tasks within two navigation actions.
- No unauthorized screen is accessible through deep links.
- Collapsed navigation remains understandable.
- No sidebar overlaps operational content.
- Mobile navigation does not obstruct dialogs or primary actions.
- Existing workspace URLs remain compatible or redirect safely.

---

## 6. Epic KDS: Kitchen and Bar Pass Overhaul

**Priority:** P1  
**Owner:** Frontend lead and POS/backend engineer  
**Estimated effort:** 8–12 engineering days

### 6.1 Current-state findings

The existing KDS in `src/runtime/web/WebKDSView.tsx` supports station filtering, status filtering, searching and ticket-state progression.

However, the reported UI has serious usability problems:

- Excessively large dark empty surfaces.
- Ticket cards occupying too little of the available workspace.
- Uneven spacing and weak visual hierarchy.
- Search icon overlap.
- Confusing filters.
- Raw UUIDs shown when order numbers are unavailable.
- Generic `Item` fallback instead of useful product names.
- Review and conflict indicators without obvious next steps.
- Technical workflow instructions visible to operational staff.
- Oversized action buttons.
- Weak distinction between waiting, preparing and ready tickets.

### 6.2 Target KDS layout

**Header:** Station name, active ticket count, overdue count, synchronization status and compact refresh action.

**Primary station selector:** Bar, Kitchen or Rooms, depending on configured routing.

**Secondary status selector:** All active, New, Preparing and Ready.

**Ticket board:** Dense responsive grid with cards sized for scanning.

**Exception area:** Small, actionable queue for conflicts, missing item names or synchronization uncertainty.

**Footer or contextual help:** Short guidance only when necessary.

Do not place station filters, order status, technical alerts and ticket actions into a single undifferentiated toolbar.

### 6.3 Ticket card content

Every card must prioritize:

1. Human-readable order or ticket reference.
2. Table, room or takeaway identifier.
3. Product name.
4. Quantity.
5. Special instructions.
6. Elapsed preparation time.
7. Current state.
8. One clear next action.

Example:

**KOT-0048 · Table 7**  
**2 × Chicken Wings**  
No chilli · Extra sauce  
Waiting 6 min  
**Start preparing**

Use actual stored data. The example reference format is illustrative and must not be generated independently by the browser.

### 6.4 Human-readable references

- Prefer server-issued order or document numbers.
- Preserve UUIDs internally.
- Reuse existing business document sequence infrastructure where applicable.
- Do not claim that a legacy alias is globally unique.
- If no human reference exists, use a clearly labeled short display identifier only when collision and support requirements have been considered.
- Full UUIDs remain available in a technical details view for authorized support staff.

### 6.5 Product-name correctness

The source currently falls back to `Item` when `productName` is absent.

Investigate the complete ticket pipeline:

POS item selection → order snapshot → fire command → persisted order → synchronization → KDS rendering.

Requirements:

- Store a durable sale-time product-name snapshot.
- Preserve variant, modifier and special-instruction details.
- Do not rely on mutable catalog names for historical tickets.
- Detect malformed or incomplete snapshots.
- Surface a specific exception instead of silently showing a generic item.
- Ensure kitchen and bar routes receive the correct item.

### 6.6 Status model

Retain backend transition safety:

`FIRED → PREPARING → READY → SERVED`

Present staff-friendly labels:

| Backend state | Staff label | Action |
|---|---|---|
| FIRED | New | Start preparing |
| PREPARING | Preparing | Mark ready |
| READY | Ready | Mark served |
| SERVED | Served | No further action |

Do not allow accidental skipping of states.

Show an explanation only when a transition is blocked.

### 6.7 Conflict handling

Replace vague indicators such as `1 conflict` with an actionable resolution flow.

Example:

**1 ticket needs attention**  
Ticket KOT-0048 could not be updated because another device changed it.  
**Refresh ticket** · **View activity**

Rules:

- Never automatically resubmit an uncertain operation.
- Do not advance a ticket visually until the outcome is confirmed or clearly pending.
- Refresh authoritative state before offering a retry.
- Explain which action is safe.
- Preserve idempotency and audit history.

### 6.8 Layout requirements

- Compact cards with balanced padding.
- Responsive columns based on available width.
- No giant empty panels.
- Readable ticket content from normal kitchen viewing distance.
- High-contrast status indicators.
- Appropriate touch targets.
- Optional elapsed-time emphasis based on configurable service thresholds.
- Audio notifications only if supported, user-controlled and non-disruptive.
- Clear empty state: `No active kitchen tickets`.
- No raw internal IDs in the primary interface.

### 6.9 KDS acceptance tests

- Multiple simultaneous tickets.
- Bar and kitchen items from one order.
- Special instructions and modifiers.
- Missing product snapshot.
- Two operators advancing the same ticket.
- Offline device followed by reconnection.
- Conflict and uncertain outcome.
- Large queues.
- Narrow tablet and phone screens.
- Permission-restricted operator.
- Ticket cancellation or void after firing.

**Release gate:** No duplicate state transitions, no misleading success messages and no unreadable ticket identifiers.

---

# PART II: ROOMS AND HOSPITALITY OPERATIONS

## 7. Epic ROOM: Reservation, Rate and Availability Integrity

**Priority:** P0  
**Owner:** Hospitality backend engineer and frontend lead  
**Estimated effort:** 10–16 engineering days

### 7.1 Verified architectural inconsistency

The repository contains different reservation entry points.

`WebApiRoomsView.tsx` allows a user to select a matching rate plan and sends `ratePlanId` in the reservation command.

`WebHospitalityViews.tsx` has a Quick Reservation flow that uses the configured property rate to calculate an estimate, while the inspected `roomReservation.create` payload does not explicitly include `ratePlanId`.

This difference must be reconciled against the authoritative server behavior.

**Do not assume the quick reservation charges the wrong amount without testing.**

The required outcome is one consistent reservation-pricing contract across all entry points.

### 7.2 Shared reservation service

Introduce or consolidate a shared domain workflow for:

- Room availability.
- Rate eligibility.
- Guest capacity.
- Stay type.
- Arrival and departure policy.
- Price quotation.
- Tax treatment.
- Booking creation.
- Booking modification.
- Walk-in check-in.
- Room move.
- Cancellation.
- Folio posting.

All UI entry points must call the same validated business rules.

### 7.3 Rate and pricing rules

**Selected version policy:** one standard configurable room rate for day/night stays; no receptionist override. Existing rate-plan infrastructure remains compatible. The following broader options are future capabilities unless individually accepted:

Support:

- Room-type-specific rates.
- Nightly rates.
- Day-use rates.
- Applicable tax treatment.
- Date-specific rates where supported.
- Authorized overrides with recorded reasons.
- Price snapshots at reservation confirmation.
- Explicit total, tax and deposit breakdowns.
- Clear distinction between quoted, confirmed, posted and paid amounts.

Never recalculate an old confirmed reservation using a newly edited rate plan unless an authorized modification explicitly requires repricing.

### 7.4 Booking flow

Target staff workflow:

1. Select arrival and departure.
2. Enter number of guests.
3. View available rooms.
4. Choose room and eligible rate.
5. Select or create guest.
6. Review full booking price.
7. Confirm reservation.
8. Display a human-readable booking reference.

Show blockers inline, including:

- Room unavailable.
- Room under maintenance.
- Room not clean when immediate check-in is required.
- Capacity exceeded.
- Missing eligible rate.
- Invalid stay dates.
- Property cutoff violation.
- Connection required to confirm availability.
- Booking changed by another operator.

### 7.5 Concurrency and availability

- Availability must be checked by the server.
- Booking creation must revalidate availability transactionally.
- Two simultaneous bookings cannot allocate the same room for overlapping periods.
- Room moves must enforce the same constraints.
- Room blocks and maintenance restrictions must be respected.
- Stale client availability cannot be treated as guaranteed.
- Offline reservation drafts may be allowed, but offline confirmation must not falsely claim room allocation.

### 7.6 Operational workspace redesign

Split the current combined Rooms experience into:

**Front Desk**
- Arrivals.
- Departures.
- In-house guests.
- Walk-ins.
- Room moves.
- Guest balances.

**Reservations**
- Availability search.
- Reservation list.
- Calendar.
- New and modified bookings.

**Room Status**
- Vacant clean.
- Vacant dirty.
- Occupied.
- Out of service.
- Maintenance.
- Housekeeping assignments.

**Property Settings**
- Room types.
- Room definitions.
- Rate plans.
- Check-in and checkout policies.
- Tax and accommodation configuration.

### 7.7 Folio correctness

- New selected-version bookings use payment upfront; deposits are out of scope. Preserve and correctly classify any existing deposits until a tested replacement or reconciliation explicitly handles them.
- Accommodation charges must post according to the defined stay and revenue-recognition rules.
- Room changes must not double-charge accommodation.
- Refunds and adjustments require audit records.
- Checkout blockers must explain the outstanding task.
- Guest folio balances must reconcile to source entries.
- Receipt and folio printing must use supported thermal document profiles.

### 7.8 Acceptance criteria

- The same booking produces the same quoted and posted price through all entry points.
- Concurrent reservation attempts cannot double-book a room.
- Rate edits do not silently rewrite historical bookings.
- Guest count and room capacity are enforced.
- Nightly and day-use policies work in `Africa/Nairobi`.
- Room moves, cancellations and walk-ins preserve financial correctness.
- A receptionist can complete a standard booking without entering an administration screen.
- Full booking history is auditable.

---

## 8. Epic HOTEL: Housekeeping, Maintenance and Guest Operations

**Priority:** P1  
**Owner:** Hospitality frontend/backend engineers  
**Estimated effort:** 6–10 engineering days

### Deliverables

- Compact housekeeping task board.
- Room status cards with room number, floor, state and assigned staff.
- One-action cleaning completion where authorized.
- Maintenance escalation with reason and timestamp.
- Clear separation of room cleanliness and room serviceability.
- Front Desk visibility into housekeeping blockers.
- Guest account and folio navigation from an active stay.
- Occupancy dashboard with accurate denominators.
- Property-local business-day calculations.

### Acceptance criteria

- A room marked out of service cannot be booked incorrectly.
- Housekeeping changes synchronize to Front Desk.
- Staff can identify rooms requiring attention without opening each record.
- Occupancy figures reconcile to actual reservations and stays.
- Room-status actions respect backend permissions.

---

# PART III: POS, CASHIER AND SERVICE WORKFLOWS

## 9. Epic POS: POS2 and Offline Transaction Safety

**Priority:** P0  
**Owner:** POS/backend engineer and QA lead  
**Estimated effort:** 10–15 engineering days

### 9.1 Scope

Complete and verify the existing POS2 waiter/cashier ticket and offline cash functionality.

The feature branch contains related work, but source availability must not be confused with verified staging or production readiness.

### 9.2 Core workflows

- Waiter creates ticket.
- Waiter assigns table or tab.
- Enrolled cashier explicitly approves the submitted ticket; only approved lines are fired to the correct station.
- KOT/BOT is generated.
- Cashier views and settles ticket.
- Split or partial payments follow authorized rules.
- M-Pesa or other external payment is reconciled against provider confirmation.
- Cash transaction is recorded against the correct till.
- Receipt is queued and printed.
- Shift is closed and reconciled.
- Refunds and reversals follow approval rules.

### 9.3 Offline requirements

- Every command has a stable idempotency identity.
- Queued commands preserve order and dependencies.
- Reconnect does not duplicate sales or payments.
- Pending, confirmed, rejected and uncertain outcomes remain distinct.
- Cashiers cannot mistake a queued payment for a server-confirmed payment.
- Conflicts show safe recovery instructions.
- Browser update boundaries protect unfinished cash operations.
- Device and operator identity are preserved.
- Audit logs record final outcomes.

### 9.4 Till and shift controls

- Opening float.
- Cash received.
- Cash refunds.
- Cash paid out where authorized.
- Expected closing cash.
- Counted closing cash.
- Variance and reason.
- Manager approval for overrides.
- Shift report and printout.

### 9.5 Acceptance criteria

- No duplicate order or payment after network retries.
- No double stock depletion on repeated fire commands.
- Offline queue recovers after browser restart.
- Conflicts are recoverable without data loss.
- Shift totals reconcile to posted transactions.
- Unauthorized operators cannot override tills or refunds.
- Pilot staff can complete a sale and print a receipt on supported devices.

---

### 9.6 Epic ALERT: Order alerts and manual M-Pesa reference forwarding

**Selected scope:** durable in-app inbox, optional foreground sound, optional background Web Push and role-specific mobile navigation. No customer messaging, SMS scraping, direct Daraja integration or offline waiter-to-cashier delivery.

| Event | Recipient | Safe next action |
|---|---|---|
| Ticket submitted/revised | Enrolled outlet cashier | Review latest proposal; never automatically approve |
| Ticket approved/rejected/needs review | Ticket author | See actual decision/reason |
| Approved preparation requested | Authorized preparation staff | Open canonical KDS station queue |
| Preparation reaches READY | Responsible ticket authors and cashier | Inspect current ready items before collection |
| Customer-provided M-Pesa code submitted | Enrolled cashier | Check actual merchant receipt and current bill |
| Payment committed | Responsible ticket authors and cashier | Read current paid amount and remaining balance |
| Pending/unknown local cash | Original terminal/operator | Recover original ID; do not repeat payment |
| Server reconciliation required | Cashier and authorized manager | Open original cash evidence and resolution |
| Print delivery uncertain/failed | Responsible operator | Inspect paper/evidence; retry only through marked reprint workflow |

Use readable order/table labels, staff names and Nairobi timestamps in the authenticated inbox. Lock-screen push contains a generic operational message, no transaction code, amount or customer details. Opening an alert refreshes current state; stale alerts cannot settle, approve, fire or print.

### 9.7 Alert data and API contracts

- Expand-only migration `078_operational_alerts.sql`: operational events, staff/device-scoped inbox entries, push subscriptions, delivery outbox/attempt evidence, M-Pesa reference submissions and immutable review history.
- Relevant successful business commands save events and delivery-outbox entries within their existing PostgreSQL transaction. Durable original command ID/payload hash remains the deduplication boundary; no second order or billing engine.
- `mpesaReference.submit` is online-only, idempotent and ticket-author scoped. Input: stable submission ID, approved ticket ID, transaction code, integer minor-unit amount, explicit received timestamp and optional note. The server derives order/outlet ownership; it does not trust a waiter-supplied order association.
- `mpesaReference.review` is online-only and requires M-Pesa/payment permission plus the enrolled outlet checkout device. Input: submission ID/current version, VERIFIED or REJECTED, evidence/reason and explicit actual-funds confirmation for verification.
- SUBMITTED means customer-claimed evidence. VERIFIED means cashier reviewed merchant evidence. PAID means matching funds were posted by the existing payment command. Reading an alert changes only its seen state. Partial payment never implies a fully settled bill.
- Duplicate codes and references already in the financial ledger are flagged; conflicting verified references are rejected. Retain every submission and review reason. Same-ID retries return the original outcome.
- Authenticated routes: `GET /v1/operations/inbox`, `POST /v1/operations/read`, `POST /v1/operations/push`, `DELETE /v1/operations/push`. Apply existing session/enrollment/origin controls and current role/device filtering.
- Foreground updates reuse the change stream after committed commands, with periodic refresh fallback. Locally pending cash and uncertain print evidence remain available without inventing a server-success event.

### 9.8 Push, escalation and failure behavior

- Default OFF cohort variables: `OPERATIONS_INBOX_COHORTS`, `OPERATIONS_REFERENCE_COHORTS`, `OPERATIONS_PUSH_COHORTS`; each contains exact business/staff/device tuples, computed by the API. Activate inbox/reference cohorts before background push.
- Worker default OFF: `OPERATIONS_WORKER_ENABLED=false`. Configure server-held `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` only for the accepted stage/cohort. Never put the private key in PWA assets or logs.
- Explicit Enable alerts user action requests permission; denied/unsupported push retains the inbox. Only approved browser push endpoints are accepted; subscriptions cannot be reassigned across staff/business/device ownership.
- The worker claims due deliveries with database locking, retries transient failures with bounded backoff/jitter, retires 404/410 subscriptions, and rechecks active session/staff/device/cohort/permissions/checkout before sending. Delivery ACCEPTED is provider transport evidence, not staff-read or task-resolution evidence.
- Notification clicks open the authenticated inbox. Service-worker handling does not bypass the cash-safe update/rollback boundary and does not cache authenticated financial API responses.
- Foreground sound is opt-in after interaction, once across coordinated tabs, and does not replay a historical login/reconnection backlog. Badges count unread alerts independently of actionable tickets/reference reviews.
- Unresolved ticket/reference escalation defaults to five minutes, configurable with `OPERATIONS_ESCALATION_MINUTES`, once per event. Decisions cancel old task escalation; reading does not. Managers receive the durable task, not a new financial command.
- Logout and revoked staff/session/device prevent further delivery; checkout handoff prevents routing to the old terminal. Browser push is best-effort, never a guaranteed cashier acknowledgement or substitute for the durable inbox.
- iOS delivery requires supported installed Home Screen PWA behavior. Exact Windows/Android/iOS device tests remain open until recorded. [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [WebKit Home Screen push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

### 9.9 Mobile tasks and state preservation

| Staff capability | Primary mobile destinations |
|---|---|
| Waiter | Orders, permitted Tables, Alerts, More |
| Cashier | Sale, Tickets, Alerts, More; Shift within cashier header |
| Preparation operator | Preparation, Alerts, More |
| Manager | Overview, Operations, Alerts, More |

Derive access from API permissions and enrolled-device authority, not role-name guesses. Preserve all authorized modules under More and existing workspace links. Keep navigation above safe-area insets and outside basket/payment/dialog controls; handle keyboard, Escape and focus. Preserve the cashier basket/drafts while opening alerts or More; restore workspace scrolling. Live badges are distinct from API connection state; an unsent offline waiter draft is never shown as delivered.

### 9.10 Acceptance and activation evidence

- PostgreSQL: simultaneous tickets, same-ID approval/event replay, author/outlet isolation, review permission/device restrictions, duplicate/used references, immutable review history, partial balances, cashier timeout recovery and payment replay without a second settlement.
- Browser: each role at 390x844, 1024x768 and 1366x768; safe areas, More access, no overlap/overflow, keyboard/focus, current-record deep links, preserved baskets and clear unacknowledged reference wording.
- Push: generic payload, explicit permission, denied support fallback, expired subscriptions, transient retry, multiple tabs, sign-out/staff/device revocation, stale tasks and no alert storm. Simulated worker tests do not establish actual browser delivery.
- Upgrade/rollback: keep pending financial IndexedDB evidence, safe SW activation and old release assets. Never clear local storage to fix notification behavior.
- Local source/test results are recorded below after execution; isolated staging, real devices and external code review remain open. No production deployment or new capability activation is authorized by this implementation slice.

### 9.11 Current local verification record

| Evidence | Result / artifact |
|---|---|
| TypeScript | `npm run lint` passed |
| API contract and architecture checks | Passed; operational commands use existing registry/permissions |
| Build | Passed; new service-worker listeners included |
| Real PostgreSQL 16 | Dedicated local `serveos-alerts-test-pg`, loopback 54359, synthetic data; API suite initially 44/44 passed; final rerun recorded at completion |
| Focused operational API test | Passed reference forwarding/review without settlement, ready event, partial payment/replay, duplicate evidence, recipient isolation, escalation, expired subscription and logout suppression |
| Browser regressions | In progress; results to be finalized after fixes/checks |
| Hosted CI / candidate image / staging | Not run for this working change; prior release CI is not this candidate's CI |
| Actual Windows/Android/iOS push delivery | Not tested; no VAPID production activation |
| Production mutation | None in this implementation turn |

---

## 10. Epic QR: QR Ordering and Service Integration

**Priority:** P2, elevated to P1 if required for the pilot  
**Owner:** POS engineer and frontend lead  
**Estimated effort:** 6–12 engineering days after architecture review

### 10.1 Verification requirement

Review the previously requested QR feature work and current repository implementation before coding.

Do not assume QR ordering is complete, deployed or connected to POS2.

### 10.2 Target workflow

Where enabled:

1. Manager configures table or service-point QR codes.
2. Guest scans the code.
3. Guest sees the correct outlet menu.
4. Guest selects items and modifiers.
5. Guest submits an order request.
6. Staff confirms or accepts it according to business policy.
7. Confirmed items enter the normal order and KDS workflow.
8. Cashier settles the order through the normal payment system.

### 10.3 Security and correctness

- QR identifiers must not grant administrative permissions.
- Validate outlet and table association server-side.
- Protect against forged prices and item quantities.
- Rate-limit public endpoints.
- Handle expired, revoked and regenerated QR codes.
- Prevent duplicate submission.
- Preserve order provenance.
- Do not fire stock or create a financial sale merely because an unauthenticated client displayed a success message.
- Support poor connectivity with clear submission status.
- Avoid collecting unnecessary guest personal data.

### 10.4 Acceptance criteria

- A scanned code opens only its authorized menu and service context.
- Item prices come from the server.
- Orders enter the same audited workflow as staff-created tickets.
- Duplicate guest submissions do not create duplicate orders.
- Invalid or revoked QR codes fail safely.
- Staff can identify and manage QR-origin orders.

---

# PART IV: FINANCE AND BUSINESS INTELLIGENCE

## 11. Epic FIN: Correct Accounting and Genuine Profit-and-Loss Reporting

**Priority:** P0  
**Owner:** Backend/accounting engineer, with accountant sign-off  
**Estimated effort:** 15–25 engineering days, depending on ledger gaps

### 11.1 Verified current limitation

`apps/api/src/postgres-store.mjs` currently computes the finance summary using journaled `REVENUE_SALES` and posted business expenses, with additional payables and supplier-payment information.

This is a useful operational summary.

It is **not a complete profit-and-loss statement**.

It does not, by itself, establish correct gross profit, net profit, complete COGS, depreciation, all accruals, financing expenses, or the full treatment of accommodation revenue.

### 11.2 Required accounting model

Produce a documented chart of accounts and mapping for:

- Sales revenue.
- Accommodation revenue.
- Discounts and returns.
- Sales tax liabilities.
- Cost of goods sold.
- Inventory assets.
- Operating expenses.
- Supplier payables.
- Customer receivables.
- Guest deposits and advance payments.
- Cash and bank clearing accounts.
- Payment processor clearing.
- Fixed assets.
- Depreciation.
- Finance costs.
- Other income and expenses.
- Relevant accruals and adjustments.

The exact treatment must be approved by a qualified accountant familiar with the business and Kenyan requirements.

### 11.3 P&L structure

A proper period report should support:

**Revenue**
- Food sales.
- Beverage sales.
- Accommodation revenue.
- Other operating revenue.
- Discounts and returns.

**Net revenue**

**Cost of sales**
- Food COGS.
- Beverage COGS.
- Other applicable direct costs.

**Gross profit**

**Operating expenses**
- Payroll where recorded.
- Utilities.
- Rent.
- Supplies.
- Repairs.
- Other approved expenses.
- Depreciation where implemented.

**Operating profit**

**Finance and other items**

**Profit before tax**

**Tax and net profit**, only when the accounting data and policies support those calculations.

Do not display unsupported profit figures.

### 11.4 Historical cost correctness

COGS must be calculated using historical sale-time cost information or a properly defined inventory valuation ledger.

Do not calculate historical profitability from the product's current mutable purchase cost.

Handle:

- Purchases.
- Stock receipts.
- Returns.
- Transfers.
- Adjustments.
- Wastage.
- Complimentary items.
- Refunds.
- Negative-stock edge cases.
- Historical imports without reliable cost information.

Where historical COGS cannot be reconstructed reliably, display a clearly identified limitation rather than fabricating profit.

### 11.5 Reconciliation

Every summary total must be traceable to source transactions.

Required reconciliation views:

- Sales to journals.
- Cash sales to till movements.
- External payments to settlement records.
- M-Pesa transactions to provider statements.
- Supplier invoices to payables.
- Supplier payments to payable reductions.
- Stock movements to inventory valuation.
- Accommodation postings to folio entries.
- Guest deposits to liabilities and application entries.

**Supplier payment is not automatically an expense.**

**Guest deposit is not automatically earned revenue.**

### 11.6 Period closing

Implement or complete:

- Open-period status.
- Close-period review.
- Unposted transaction warnings.
- Reconciliation exceptions.
- Authorized closing adjustments.
- Closed-period protection.
- Controlled reopening with audit trail.
- Report version and generated-at timestamp.

### 11.7 Acceptance criteria

- P&L totals reconcile to ledger source lines.
- Revenue, COGS and expenses are not double-counted.
- Deposits and supplier payments are classified correctly.
- Historical cost assumptions are explicit.
- Date filters respect the business time zone.
- Reports support drill-down to source documents.
- Accountant approves the chart of accounts and test fixtures.
- No unsupported metric is labeled `Net profit`.

---

## 12. Epic BI: Management Dashboards and Reporting

**Priority:** P1  
**Owner:** Frontend lead and reporting backend engineer  
**Estimated effort:** 10–15 engineering days

### 12.1 Target dashboards

**Manager Overview**
- Today's sales.
- Sales versus previous comparable period.
- Sales by department.
- Open tills.
- Outstanding exceptions.
- Occupancy.
- Stock alerts.
- Receivables and payables.

**Sales Dashboard**
- Daily trend.
- Hourly sales.
- Payment-method mix.
- Product/category performance.
- Discounts, voids and refunds.
- Average ticket value.

**Hotel Dashboard**
- Available rooms.
- Occupied rooms.
- Occupancy percentage.
- Average daily rate.
- Revenue per available room.
- Arrivals and departures.
- Outstanding guest balances.

**Inventory Dashboard**
- Stock on hand.
- Low-stock items.
- Stock movement.
- Wastage.
- Valuation.
- Fast-moving items.
- Margin warnings.

**Finance Dashboard**
- Revenue.
- Gross profit where supported.
- Operating expenses.
- Payables aging.
- Receivables.
- Cash position.
- Period comparisons.

### 12.2 Visualizations

Use the charting library already available in the project where suitable.

Charts must include:

- Clear units.
- KES formatting.
- Relevant date labels.
- Meaningful legends.
- Accessible table alternatives.
- Drill-down links.
- Empty-data handling.
- Loading and error states.
- Source and refresh timestamps.

Avoid charts that are visually attractive but financially ambiguous.

### 12.3 Zero-state rules

Distinguish:

1. No qualifying activity in the selected period.
2. No data imported or posted.
3. Report loading.
4. Report failed.
5. Access denied.
6. Partial or incomplete accounting coverage.
7. Genuine numerical zero.

Never show four `KES 0` cards as the only explanation of a failed or incomplete report.

### 12.4 Report output

Support, as appropriate:

- On-screen dashboard.
- CSV export.
- XLSX export.
- Digital report exports where implemented; any physical Print or Print PDF action must render an 80 mm thermal layout.
- Narrow, vertically reflowed 80mm layouts for **every** physical print workflow; unknown document types fail closed without A4/Letter fallback.

Do not squeeze a desktop chart or A4 report onto an 80mm receipt.

### 12.5 Acceptance criteria

- All metrics have documented definitions.
- Date and department filters work consistently.
- Values reconcile to source transactions.
- A manager can drill into a suspicious number.
- Reports do not silently mix cash basis and accrual basis.
- Zero, loading and error states are distinguishable.
- Exported values match on-screen values.

---

# PART V: CATALOG, INVENTORY AND DATA MIGRATION

## 13. Epic IMP: Import Workflow and Historical Data Integrity

**Priority:** P0 for data correctness, P1 for UX  
**Owner:** Data/backend engineer and frontend lead  
**Estimated effort:** 7–12 engineering days

### 13.1 Previously identified Countryside import

A reviewed catalog import previously contained:

- 73 valid rows.
- Zero opening stock.
- `DRY_RUN_READY` status.
- A missing or inaccessible `Apply reviewed import` action.
- 11 suspicious cost-versus-selling-price relationships.
- Tax category mappings requiring review.

The import must not be treated as applied without an authoritative confirmation.

### 13.2 Verified permission behavior

`WebApiImportCenter.tsx` renders the apply action conditionally based on execution permission.

When a staff member lacks the relevant permission, the interface must not silently hide the action and leave the operator confused.

### 13.3 Required import states

- File selected.
- File validated.
- Dry run pending.
- Dry run ready.
- Dry run blocked.
- Ready for authorized approval.
- Applying.
- Applied.
- Partially applied or interrupted.
- Cancelled.
- Failed with recoverable diagnostics.

### 13.4 Permission-aware UX

If the user cannot apply an import, display:

**Import is ready for approval.**

You can review the data, but your account does not have permission to apply imports. Ask an administrator with import-execution permission to continue.

Include a permission explanation and appropriate escalation path.

Do not display an enabled button that the backend will inevitably reject.

### 13.5 Data quality checks

Flag:

- Purchase cost greater than selling price.
- Pack price entered as unit price.
- Missing unit-of-measure conversion.
- Duplicate product codes.
- Duplicate barcodes.
- Invalid tax mapping.
- Unsupported categories.
- Missing supplier references.
- Unexpected negative stock.
- Missing opening balance evidence.
- Currency and decimal errors.

For the previously reviewed data, specifically recheck the example of a product selling at KES 100 with a recorded cost of KES 1,230, which may indicate pack-versus-unit confusion.

### 13.6 Kenyan tax mapping

Previously observed mappings included `C_EXEMPT` and `B_0`.

These must be reviewed against actual product classification and current applicable tax requirements.

Do not automatically convert them to another category or claim KRA compliance without accountant or tax-specialist validation.

### 13.7 Historical migration

Catalog import alone does not restore:

- Opening inventory valuation.
- Historical sales.
- Supplier balances.
- Customer balances.
- Guest deposits.
- Active reservations.
- Room stays.
- Financial journals.
- Prior cash balances.

Each requires a separate, documented migration and reconciliation process.

### 13.8 Acceptance criteria

- Import permissions are explained.
- Dry-run results match the application result.
- Repeated apply attempts are idempotent.
- Interrupted imports can be diagnosed safely.
- Suspicious prices require review or explicit approval.
- Tax classifications are signed off.
- Opening stock remains zero unless separately authorized.
- Imported records can be traced to source rows and batch IDs.

---

## 14. Epic STOCK: Inventory and Procurement Coherence

**Priority:** P1  
**Owner:** Inventory/backend engineer  
**Estimated effort:** 8–12 engineering days

### Deliverables

- Consistent stock-unit and purchase-unit handling.
- Explicit pack-to-unit conversions.
- Purchase cost and selling price shown in their proper units.
- Clear stock on hand versus reserved or unavailable stock.
- Low-stock alerts.
- Receiving workflow linked to supplier orders.
- Supplier credit and return reconciliation.
- Stock count variance review.
- Wastage and adjustment reasons.
- Inventory valuation with documented methodology.
- Source-document drill-down.

### Acceptance criteria

- Stock movements reconcile.
- Purchase units convert correctly.
- Sales and KDS fire commands do not double-deplete stock.
- Returns and reversals restore stock only under defined rules.
- Inventory reports identify their valuation basis.
- Staff can resolve stock discrepancies without technical identifiers.

---

# PART VI: GUIDANCE AND STAFF ONBOARDING

## 15. Epic HELP: Reliable Interactive Guide and Contextual Assistance

**Priority:** P1  
**Owner:** Frontend lead and QA engineer  
**Estimated effort:** 6–10 engineering days

### 15.1 Current state

`WebGuidanceViews.tsx` contains guided tours, anchor-based targets, progress tracking and task-oriented help.

The reported problem is that some guide experiences do not work reliably.

The existing implementation checks for target elements and can detect missing targets. This does not prove all guides behave correctly across navigation, permissions, loading and mobile layouts.

### 15.2 Required improvements

- Versioned guide definitions.
- Central registry of valid target anchors.
- Automated verification that guide targets exist.
- Permission-aware guide availability.
- Reliable navigation to the correct workspace.
- Graceful handling of lazy-loaded screens.
- Retry when a target is temporarily unavailable.
- Clear recovery when a target is genuinely missing.
- Correct overlay and focus behavior.
- Mobile-friendly guide positioning.
- Progress persistence and reset.
- Skip, back, resume and restart.
- Searchable contextual help.
- Safe practice mode where feasible.

### 15.3 Guide behavior

A guide must not simply freeze when a target disappears.

Example:

**This step is not available on your screen.**

The control may be hidden by your permissions or the workspace may still be loading.

**Retry** · **Skip step** · **Open Help**

### 15.4 Required guides

- Getting started.
- Opening a till.
- Creating a POS ticket.
- Sending an order to the kitchen.
- Marking a KDS ticket ready.
- Recording a payment.
- Closing a shift.
- Adding a product.
- Receiving stock.
- Importing a catalog.
- Creating a reservation.
- Checking in a guest.
- Checking out a guest.
- Reviewing daily reports.

### 15.5 Safety rules

- Tours must never automatically execute financial transactions.
- A guide must not bypass permission checks.
- Successful operation steps should advance only after confirmed results.
- Pending or uncertain outcomes must not be presented as completed.
- Training progress must not expose sensitive guest or financial information.

### 15.6 Acceptance criteria

- Every published guide passes automated anchor checks.
- Guides work at mobile and desktop sizes.
- Missing targets produce recovery options.
- Guide progress survives normal navigation.
- A new staff member can complete the relevant introductory workflow without developer assistance.

---

# PART VII: KENYAN OPERATING REQUIREMENTS

## 16. Epic KE: Localization, Payments and Practical Operations

**Priority:** P1  
**Owner:** Product owner, backend engineer and local operations testers  
**Estimated effort:** Cross-cutting

### 16.1 Currency and time

- KES formatting everywhere.
- Minor-unit storage for money.
- Consistent decimal handling.
- `Africa/Nairobi` property-local business dates.
- Overnight hospitality shifts.
- Correct daily reporting cutoffs.
- Correct date and time labels on documents.

### 16.2 Payments

Support the business's configured payment methods, potentially including:

- Cash.
- M-Pesa Till.
- M-Pesa Paybill.
- STK Push where integrated.
- Bank or card payments where integrated.
- Split payments.
- Customer credit under authorization.

Payment-provider callbacks and reconciliations must be authoritative.

Never infer successful settlement solely from a frontend timeout or optimistic state.

### 16.3 Tax and compliance

Review relevant Kenyan requirements, including:

- Applicable VAT classifications.
- eTIMS integration obligations where relevant.
- Tax invoice and receipt content.
- Audit retention.
- Kenya Data Protection Act obligations.
- Access control for guest and employee data.

Implementation must be based on current professional and regulatory validation, not assumptions in this plan.

### 16.4 Language

Use concise English labels that are understandable to local hospitality staff.

Design components to accommodate longer Swahili translations in future.

Avoid unexplained terms such as:

- `expectedVersions`
- `stockFired`
- `days1To30Minor`
- `OUTCOME_UNKNOWN`
- Raw UUIDs.
- Internal operation codes.

Technical details can remain available to administrators and support staff.

### 16.5 Device reality

Optimize for:

- Low-end Android phones.
- Affordable Android tablets.
- Shared cashier computers.
- Unreliable Wi-Fi.
- Mobile data connections.
- Intermittent electricity.
- 80mm thermal printers.
- Touch-first operation.

A workflow that works only on a powerful desktop with perfect connectivity is not pilot-ready.

---

## 17. Epic PRINT: Consistent 80mm Thermal Documents

**Priority:** P1  
**Owner:** Frontend/backend document engineer and QA lead  
**Estimated effort:** 5–8 engineering days

### 17.1 Existing foundation

`documentPaperProfiles.ts` defines a strict thermal-80mm profile for supported physical documents.

The source includes document reference and copy-status helpers.

These are implementation foundations, not proof of physical printer readiness.

### 17.2 Required verification

Test:

- Sales receipts.
- Payment acknowledgements.
- Refund receipts.
- KOT.
- BOT.
- Cancellation and void notices.
- Shift and close-day reports.
- Purchase orders and goods receipts.
- Supplier payment vouchers.
- Guest folios.
- Reservation confirmations.
- Guest checkout documents.

### 17.3 Document requirements

- Consistent business identity.
- Human-readable document number.
- Property-local date and time.
- Operator or station where appropriate.
- Clear original/reprint label.
- Correct KES formatting.
- Tax details where legally required.
- No clipped columns.
- Long product names wrap correctly.
- No horizontal overflow.
- No desktop-oriented tables squeezed onto thermal paper.
- Print retry status remains visible.

### 17.4 Print queue safety

Distinguish:

- Queued.
- Printing.
- Printed.
- Failed.
- Outcome uncertain.
- Reprint requested.

A printer timeout must not automatically generate a new sale or payment.

### 17.5 Acceptance criteria

- Physical tests pass on supported printer models.
- Text is readable and not clipped.
- Reprints are labeled.
- Unknown print outcomes can be investigated.
- Receipt totals reconcile with transaction records.
- Document identifiers are consistent with the business sequence rules.

---

# PART VIII: QUALITY, SECURITY AND DEPLOYMENT

## 18. Epic QA: Automated and Manual Quality Gates

**Priority:** P0/P1  
**Owner:** QA lead and all engineers  
**Estimated effort:** Continuous

### 18.1 Unit tests

Cover:

- Money calculations.
- Date and time conversion.
- Rate selection.
- Stay-duration calculations.
- Inventory unit conversions.
- Financial aggregation.
- KDS state transitions.
- Permission visibility.
- Document references.
- Import validation.
- Idempotency logic.

### 18.2 Integration tests

Cover:

- Reservation creation and modification.
- Concurrent room booking.
- Guest folio posting.
- POS fire-to-KDS flow.
- Cashier settlement.
- Offline replay.
- Shift reconciliation.
- Import dry-run and apply.
- Accounting journal creation.
- Report reconciliation.
- Thermal document queue.

### 18.3 End-to-end tests

Required operator journeys:

1. Waiter submits ticket, enrolled cashier approves it → kitchen receives it → cashier settles → receipt prints.
2. Offline cashier records eligible cash transaction → reconnects → no duplicate payment.
3. Receptionist checks availability → books room → checks guest in → posts accommodation → checks out.
4. Housekeeper updates room status → Front Desk sees the change.
5. Stock controller receives inventory → stock valuation and availability update.
6. Accountant reviews expenses → posts adjustments → checks report totals.
7. Administrator stages catalog import → reviews validation → authorized user applies it.
8. New staff member follows an interactive guide through a permitted task.
9. Guest submits a QR-origin order, if QR ordering is enabled.

### 18.4 Visual regression

Capture baseline screenshots at:

`320 / 375 / 768 / 1024 / 1440px`

For:

- Home.
- POS.
- KDS.
- Rooms.
- Front Desk.
- Housekeeping.
- Inventory.
- Procurement.
- Finance.
- Reports.
- Imports.
- Settings.
- Help.
- Modal dialogs.
- Error and empty states.

Test light and dark themes only where both are actually supported.

### 18.5 Automated layout checks

Detect:

- Horizontal overflow.
- Overlapping fixed elements.
- Off-screen dialogs.
- Inaccessible action buttons.
- Truncated critical labels.
- Missing input labels.
- Missing keyboard focus.
- Broken guide targets.
- Unreachable sticky footers.

### 18.6 Performance checks

Define budgets during baseline measurement for:

- Initial workspace load.
- Time to interactive.
- POS item search.
- KDS queue refresh.
- Reservation availability search.
- Large table rendering.
- Report generation.
- Offline queue replay.

Use representative low-end devices and realistic data volumes.

Do not optimize only for empty databases.

---

## 19. Epic OPS: Build, Deployment and Rollback Readiness

**Priority:** P0  
**Owner:** DevOps/backend lead  
**Estimated effort:** 5–8 engineering days plus staged observation

### 19.1 Previously identified environments

The earlier deployment review identified:

- Repository: `davemusau00/SERVEOS-WEB`.
- Baseline branch: `reset/vps-platform`.
- Feature branch: `feat/pos2-cashier-tickets-offline`.
- Isolated next stack: `/opt/serveos-next`.
- Staged API service: `serveos-next-api-1`.
- Web endpoint: `https://serveos.davemusau.co.ke`.
- API endpoint: `https://serveosapi.davemusau.co.ke`.

These details must be revalidated before any operational change.

### 19.2 Deployment isolation

Do not touch unrelated stacks, including previously identified:

- `serveos-prod`
- `sms-platform`
- `sms-platform-africa`

The development deployment must remain isolated from unrelated production services.

### 19.3 Build verification

A previous review identified an API Docker/contracts packaging problem and subsequent feature-branch source changes intended to address it.

Required checks:

- Docker build uses the correct repository-root context.
- API package includes required contracts.
- No stale copied build context is used.
- CI build and VPS build produce compatible artifacts.
- Runtime environment variables are complete.
- Database migration order is validated.
- Health checks pass.
- API and web versions are compatible.

### 19.4 Migration policy

- Back up before migration.
- Test against a staging copy.
- Prefer additive schema changes.
- Avoid destructive renames or drops in the same release.
- Preserve backward compatibility during rolling transitions.
- Document data backfills.
- Make backfills restartable and auditable.
- Define explicit rollback or forward-recovery strategy.

### 19.5 Feature flags

Use flags or cohort controls for risky functionality, including existing POS2 offline cash capabilities.

Rollout order:

1. Local development.
2. CI.
3. Isolated staging.
4. Internal test accounts.
5. Small pilot cohort.
6. Supervised Countryside shift.
7. Wider rollout after sign-off.

### 19.6 Rollback triggers

Rollback or disable the affected feature when:

- Duplicate financial postings occur.
- Reservation double-booking is detected.
- KDS commands repeatedly conflict without recovery.
- Offline transactions cannot reconcile.
- Payment status is misleading.
- Printer failures cause transaction duplication.
- Critical permissions are bypassed.
- Accounting reports materially disagree with source journals.
- Data loss or irreversible corruption is suspected.

### 19.7 Rollback requirements

- Record exact deployed commit and image digest.
- Preserve pre-deployment backups.
- Preserve migration logs.
- Preserve queued offline operations.
- Do not clear client storage as a routine recovery measure.
- Disable feature flags before reverting code when safer.
- Follow database compatibility rules.
- Document the incident and reconciliation actions.

---

# PART IX: SCREEN-BY-SCREEN POLISH REQUIREMENTS

## 20. Visual Audit Matrix

Every screen must be reviewed using the same criteria.

| Surface | Required polish |
|---|---|
| Home | Useful dashboard density, consistent metric cards, no oversized empty panels |
| POS | Fast product selection, compact ticket panel, readable payment states |
| KDS | Dense cards, visible names, clear station filters, actionable conflicts |
| Catalog | Consistent forms, readable prices, unit-of-measure clarity |
| Inventory | Compact tables, stock alerts, consistent action menus |
| Procurement | Clear document lifecycle, supplier information and totals |
| Front Desk | Compact arrival/departure queues, easy booking access |
| Reservations | Availability-first workflow, explicit rate and price review |
| Rooms | Clear operational status, separate configuration |
| Housekeeping | Touch-friendly task list, obvious status transitions |
| Guest Accounts | Readable folio entries, balances and deposit treatment |
| Maintenance | Clear work-order ownership and resolution |
| Finance | Meaningful summary states, readable tables, correct labels |
| Reports | Defined metrics, charts, filters, exports and drill-down |
| Imports | Permission explanations, validation issues, visible approval state |
| Staff | Role-based access explanations, consistent forms |
| Administration | Clear separation of technical and daily operational tasks |
| Help | Working search, reliable tours, readable contextual guidance |
| Dialogs | Consistent headers, scrolling, focus and action placement |
| Print views | Strict 80mm layouts for physical documents |
| Mobile | No overlap, clipped controls or unintended horizontal scrolling |

### Universal screen acceptance checklist

- [ ] Correct page title and description.
- [ ] Correct spacing tokens.
- [ ] Correct typography hierarchy.
- [ ] Consistent control heights.
- [ ] No icon/input overlap.
- [ ] No clipped text or controls.
- [ ] Correct loading state.
- [ ] Correct empty state.
- [ ] Correct error state.
- [ ] Correct permission state.
- [ ] Correct offline state where applicable.
- [ ] Keyboard accessibility.
- [ ] Touch accessibility.
- [ ] Responsive layout verified.
- [ ] Long names and identifiers handled.
- [ ] Screenshot regression baseline updated.
- [ ] No misleading success or completion messages.

---

# PART X: DELIVERY PLAN

## 21. Sprint Structure

The following is a proposed six-sprint sequence, assuming two-week sprints and a small cross-functional team.

Estimates are planning ranges, not verified implementation commitments. Re-estimate after the first engineering audit.

### Sprint 0: Baseline, Safety and Design Foundations

**Goal:** Establish a trustworthy development baseline.

**Work:**
- Confirm current branch HEAD and deployed versions.
- Verify build and Docker packaging.
- Inventory existing tests and failures.
- Record current UI screenshots.
- Establish design tokens and component conventions.
- Confirm database backup and staging strategy.
- Build a prioritized issue board.
- Define accounting and reservation acceptance fixtures.

**Exit criteria:**
- Reproducible staging build.
- No untracked production assumptions.
- Baseline screenshots and test results stored.
- P0 issues assigned to owners.

### Sprint 1: UI Coherence, Navigation and KDS

**Goal:** Fix the most visible operational friction.

**Work:**
- Shared page layout and control standards.
- Compact sidebar.
- Role-based navigation groups.
- KDS ticket-card redesign.
- KDS filter hierarchy.
- Human-readable ticket references.
- Product-name snapshot investigation.
- Actionable conflict states.
- Search and icon overlap fixes.
- Role-specific mobile task bar, safe-area/focus/state preservation and inbox access (?9.9).
- Correct canonical KDS names/status fields before preparation-ready alert acceptance.

**Exit criteria:**
- KDS pilot journey passes.
- No major overlap at required widths.
- Core role navigation is substantially simplified.

### Sprint 2: Rooms, Rates and Front Desk

**Goal:** Make booking and accommodation workflows trustworthy.

**Work:**
- Shared reservation pricing contract.
- Quick Reservation and Rooms booking parity.
- Transactional availability verification.
- Room calendar and operational status views.
- Reservation confirmation breakdown.
- Folio and deposit test cases.
- Housekeeping/front desk synchronization.

**Exit criteria:**
- No double-booking in concurrency tests.
- Matching price outcomes across booking entry points.
- Receptionist workflow passes supervised testing.

### Sprint 3: POS2, Offline Cash, Printing and Imports

**Goal:** Verify high-risk transactional workflows.

**Work:**
- POS2 pilot tests.
- Offline replay and uncertain-outcome handling.
- Till reconciliation.
- Durable operational inbox and waiter M-Pesa evidence/review without settlement (?9.6-9.8).
- Background push after actual device acceptance; safe subscription revocation and escalation.
- KOT/BOT printing.
- 80mm document physical testing.
- Import permission messaging.
- Catalog cost and tax review.
- QR feature architecture validation.

**Exit criteria:**
- No duplicate financial operations in retry tests.
- Printed documents pass hardware QA.
- Import approval flow is understandable and safe.

### Sprint 4: Accounting, Finance and Reporting

**Goal:** Deliver reliable management information.

**Work:**
- Chart-of-accounts review.
- Historical cost model.
- P&L calculations.
- Journal reconciliation.
- Report filters and drill-down.
- Manager dashboards.
- Occupancy, ADR and RevPAR validation.
- Export and thermal report layouts.

**Exit criteria:**
- Accountant signs off sample P&L.
- Dashboard figures reconcile.
- Incomplete financial data is explicitly identified.

### Sprint 5: Guidance, QR, Regression and Release

**Goal:** Finish cross-module integration and pilot readiness.

**Work:**
- Repair guided tours.
- Validate QR ordering if in pilot scope.
- Complete responsive polish.
- Accessibility review.
- End-to-end workflow testing.
- Load and performance testing.
- Staff usability sessions.
- Deployment rehearsal.
- Rollback rehearsal.
- Pilot release and observation.

**Exit criteria:**
- No open P0 issues.
- P1 exceptions explicitly accepted or resolved.
- Operational sign-off recorded.
- Rollback plan tested.
- Pilot monitoring enabled.

---

## 22. Suggested Ownership

| Role | Responsibilities |
|---|---|
| Product owner | Priorities, business rules, staff feedback, acceptance |
| Frontend lead | Design system, navigation, KDS, forms, guidance |
| POS/backend engineer | Tickets, offline replay, payment safety, QR integration |
| Hospitality engineer | Reservations, rates, availability, folios |
| Accounting/backend engineer | Journals, COGS, P&L, reconciliations |
| Data engineer | Imports, historical migration, stock integrity |
| QA engineer | E2E, device testing, visual regression |
| DevOps engineer | Build, staging, backups, release and rollback |
| Accountant | Financial definitions, tax review, P&L sign-off |
| Countryside operations representative | Real-world workflow and usability acceptance |

A single engineer may hold multiple roles, but each issue needs one accountable owner.

---

## 23. First Ten Working Days

### Day 1
- Confirm repository branch, deployment state and open changes.
- Create issue tracker entries from this plan.
- Identify all P0 release blockers.

### Day 2
- Capture baseline screenshots.
- Run existing tests and builds.
- Record failures without hiding them.

### Day 3
- Establish shared spacing, typography and component standards.
- Define visual regression coverage.

### Day 4
- Implement the compact navigation shell.
- Verify role-specific workspace visibility.

### Day 5
- Redesign KDS ticket cards and filters.
- Fix search icon overlap and empty-space problems.

### Day 6
- Trace missing KDS product names and human references.
- Add regression fixtures.

### Day 7
- Implement actionable KDS conflict and review states.
- Test concurrent ticket updates.

### Day 8
- Compare both reservation entry points against server pricing rules.
- Document differences and required contract changes.

### Day 9
- Implement or prototype shared reservation quote behavior.
- Test nightly and day-use calculations.

### Day 10
- Review sprint results with staff.
- Re-estimate remaining work.
- Confirm Sprint 2 scope and blockers.

---

# PART XI: ACCEPTANCE AND RELEASE

## 24. Product Acceptance Scenarios

### Scenario A: Restaurant Service

A waiter opens a table, adds food and drinks, fires the order, and the kitchen and bar receive their respective items. Staff see readable product names and order references. The cashier settles the bill and prints a receipt.

**Pass:** No duplicate orders, correct stock movement, correct totals, readable tickets.

### Scenario B: Kitchen Operation

A kitchen operator sees incoming tickets, starts preparation, marks items ready and handles one concurrent-update conflict.

**Pass:** Clear actions, no technical IDs, no silent state loss.

### Scenario C: Hotel Booking

A receptionist checks availability, selects a room and rate, confirms a booking, checks in the guest and later checks out with a correct folio.

**Pass:** Consistent rates, no double-booking, correct accommodation charges.

### Scenario D: Offline Cashier

The connection drops during an eligible cash transaction. The system preserves the operation, reconnects and confirms its final outcome.

**Pass:** Exactly one transaction and an understandable recovery state.

### Scenario E: Finance Manager

The manager selects a reporting period, reviews revenue and expenses, drills into a total and compares it with the underlying records.

**Pass:** Figures reconcile, limitations are visible, no unsupported profit claims.

### Scenario F: Catalog Import

An operator uploads a CSV, reviews a dry run, sees suspicious prices and receives a clear explanation if approval permission is missing.

**Pass:** No silent data changes and no unexplained missing action.

### Scenario G: New Employee

A new waiter, cashier or receptionist follows the relevant guide on a tablet.

**Pass:** No broken tour steps and no unauthorized operations.

### Scenario I: Order Alerts and Payment Evidence

A waiter submits a ticket, the cashier receives it, explicitly approves, preparation staff mark items ready, and the waiter forwards a customer M-Pesa reference. The cashier verifies merchant evidence, records a partial payment through the existing payment command and sees the correct remaining balance. Duplicate references, stale alerts and retries cannot create a second settlement. Background push is accepted only after actual device delivery evidence.

**Pass:** Correct recipients, distinct sent/seen/verified/paid states, safe offline/permission fallback and usable role-specific mobile navigation.

### Scenario H: Thermal Printing

A cashier prints a receipt and reprints it after a controlled printer failure.

**Pass:** Correct content, readable 80mm layout, correct reprint labeling, no duplicate sale.

---

## 25. Measurable Success Targets

The team should capture a baseline before finalizing targets.

Proposed pilot targets:

| Metric | Target |
|---|---|
| Critical financial duplication | Zero |
| Confirmed room double-bookings caused by system | Zero |
| Open P0 defects at release | Zero |
| Unintended horizontal overflow on tested core screens | Zero |
| Known icon/input overlaps | Zero |
| Core E2E journey pass rate | 100% |
| Published guide target validation | 100% |
| Financial reconciliation fixture pass rate | 100% |
| Supported thermal document hardware checks | 100% |
| Staff task completion | Measured in supervised sessions |
| Staff onboarding time | Demonstrably reduced from baseline |
| Report data freshness | Visible and documented |
| Offline recovery | Demonstrated without duplicate posting |

Performance and onboarding time thresholds should be agreed after baseline testing, not invented.

---

## 26. Definition of Done

A development item is complete only when:

1. The business requirement is documented.
2. The code is reviewed.
3. Existing behavior remains compatible or has an approved migration path.
4. Relevant unit and integration tests pass.
5. E2E tests pass for critical workflows.
6. Permissions are enforced server-side.
7. Error and uncertain-outcome states are handled.
8. Offline behavior is tested where relevant.
9. Responsive layout is verified.
10. Accessibility is reviewed.
11. Visual regression is updated.
12. Audit and reconciliation requirements are met.
13. User-facing wording is understandable.
14. Operational documentation is updated.
15. The change is verified in staging.
16. The responsible business representative accepts it.

For financial or reservation changes, the appropriate specialist must additionally sign off correctness.

---

## 27. Release Readiness Checklist

### Engineering

- [ ] All P0 issues resolved.
- [ ] CI passes.
- [ ] Staging build is reproducible.
- [ ] API contracts package correctly.
- [ ] Database migrations tested.
- [ ] Backups verified.
- [ ] Rollback procedure rehearsed.

### Operations

- [ ] POS workflow accepted.
- [ ] KDS workflow accepted.
- [ ] Front Desk workflow accepted.
- [ ] Housekeeping workflow accepted.
- [ ] Import workflow accepted.
- [ ] Physical printers tested.
- [ ] Offline recovery tested.

### Finance

- [ ] Till reconciliation accepted.
- [ ] Payment reconciliation accepted.
- [ ] Accounting definitions reviewed.
- [ ] P&L fixtures reconciled.
- [ ] Tax assumptions reviewed.
- [ ] Historical migration limitations documented.

### Experience

- [ ] Shared design system applied.
- [ ] No major visual inconsistencies.
- [ ] No control overlap.
- [ ] Mobile and tablet layouts tested.
- [ ] Navigation simplified.
- [ ] Alert/reference role and checkout authorization tested.
- [ ] Mobile task bar, basket/keyboard/focus and More access tested.
- [ ] Push subscriptions/revocation and actual device delivery recorded.
- [ ] Same-ID reference/payment replay and partial balance verified.
- [ ] Escalation cancels on resolution, never on read acknowledgement.
- [ ] Help and tours tested.
- [ ] User-facing errors are actionable.

### Deployment

- [ ] Correct environment confirmed.
- [ ] Unrelated VPS stacks protected.
- [ ] Feature flags reviewed.
- [ ] Release commit recorded.
- [ ] Monitoring available.
- [ ] Pilot staff briefed.
- [ ] Rollback owner assigned.

---

## 28. Business Choices and Remaining Decisions

The explicit choices supplied in this file are consolidated in ?2.5 and take precedence over broader optional capabilities listed in the backlog. They are requirements, not evidence that the corresponding code has been changed.

| Question | Selected policy / remaining evidence |
|---|---|
| Room rates | One standard configurable rate across day/night; parity test and shared workflow still required |
| Receptionist override | None; API/UI enforcement and regression evidence required |
| Guest deposits | No new deposit workflow for this version; upfront payment; existing records remain protected |
| Valuation / COGS | Start from existing moving weighted-average inventory and sale-time costs; prove reconciliation before full P&L |
| Historical migration | None for new installations; no authority to erase active production |
| Tax | Defer new integration work; preserve configured tax snapshots/identifiers; no compliance claim |
| M-Pesa | Manual; waiter forwards reference, cashier verifies and records payment |
| Printing | Existing browser/OS 80 mm retained; actual hardware acceptance unverified |
| QR | Deferred future version; staff acceptance required before fire |
| Alerts and navigation | In-app + optional push; manual reference forwarding; role-specific mobile destinations selected |

Remaining business/device decisions: actual supported POS/Android/iOS versions and devices, pilot staff/outlet cohort, property-local shift/day-close policy, first-release report definitions and accepted deferred P1 items. These must be recorded before their dependent features are called accepted.

---

## 29. Final Delivery Artifacts

The development team must produce:

- Updated shared design system.
- Unified workspace navigation.
- Durable operational inbox and manual M-Pesa reference/review audit.
- Push configuration/permission/revocation runbook and actual device delivery report.
- Redesigned KDS.
- Consolidated reservation and pricing logic.
- Improved Front Desk and Rooms workflows.
- Verified POS2 and offline cash operations.
- Reliable thermal document printing.
- Correct import approval and validation workflow.
- Reconciled finance model.
- Management dashboards.
- Reliable interactive guides.
- QR-ordering integration where approved.
- Automated unit, integration, E2E and visual tests.
- Accessibility and device test report.
- Data migration and reconciliation report.
- Deployment and rollback runbooks.
- Pilot acceptance report.
- Updated staff training material.
- Final release checklist with signed approvals.

---

## 30. Final Direction

SERVEOS should evolve from a collection of capable modules into one connected hospitality operating system.

The highest-value work is not simply adding dashboards or redesigning buttons. It is making the entire product behave consistently:

- One design language.
- One understandable navigation structure.
- One reliable ticket lifecycle.
- One authoritative reservation-pricing model.
- One auditable financial truth.
- One safe offline transaction model.
- One consistent document-printing standard.
- One clear explanation when something fails.

Every screen should look like part of the same product.

Every action should have an understandable outcome.

Every financial number should be traceable.

Every operational workflow should be usable by the staff member responsible for it.

**Final release objective:** A polished, dependable and coherent SERVEOS experience that Countryside staff can operate confidently during real hospitality service, without sacrificing financial correctness, data integrity or deployment safety.