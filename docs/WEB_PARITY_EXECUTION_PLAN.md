# Web parity execution plan

Updated: 2026-09-29  
Status: first execution artifact; documentation and parity definition complete, implementation not started from this plan.

## 1. Purpose

The native ServOS terminal, the production web workspace, and the browser UI preview currently describe overlapping products but do not provide the same operational journey.

This document turns that observation into an executable parity plan. It is intentionally written before the next code slice so that the team can distinguish:

- a genuinely missing business capability;
- a capability that exists in the domain but has no web screen;
- a capability that exists in the web screen but is less complete than native;
- a native-device capability that should remain native-only;
- a preview-only visual concept that must not become a fake production transaction;
- a guidance or onboarding gap that can make an existing feature effectively undiscoverable.

The first implementation priority is not to copy every preview screen. It is to make the web product safe and understandable from first access through daily work, then close the highest-value operational gaps using the same authoritative commands, permissions, audit behavior, and queue rules as the existing web workspace.

## 2. Source ownership and evidence rules

This plan is a coordination document. It does not replace the domain, UX, or guidance specifications.

| Concern | Authoritative source | How this plan uses it |
|---|---|---|
| Native installation lifecycle | `C:\Users\Admin\Downloads\servos\src\native\NativeRoot.tsx`, `IntakeWizard.tsx`, `EnrollmentView.tsx`, `SetupWizard.tsx` | Defines the platform intake and Go Live parity contract. |
| Native operational navigation | `C:\Users\Admin\Downloads\servos\src\native\NativeBarShell.tsx` | Defines the complete native workspace inventory and permission model. |
| Native guidance behavior | `C:\Users\Admin\Downloads\servos\src\guidance\GuidanceProvider.tsx`, `core.ts`, `workflow.ts`, `HelpCenterView.tsx` | Defines guide data, target behavior, progress, and completion semantics. |
| Native business workflows | `C:\Users\Admin\Downloads\servos\src\native\NativePOSView.tsx`, `NativeFrontDeskView.tsx`, `NativeFoliosView.tsx`, `NativeHousekeepingView.tsx`, `NativeOperationsViews.tsx`, and related views | Defines parity targets for operations. |
| Production web shell | `C:\Users\Admin\Downloads\servos\src\runtime\RemoteManagerApp.tsx`, `src\runtime\web\WebBusinessApp.tsx` | Defines what web currently exposes and how web sessions, queues, and sync work. |
| Production web modules | `C:\Users\Admin\Downloads\servos\src\runtime\web\Web*.tsx` | Defines current web coverage and partial implementations. |
| Help content | `C:\Users\Admin\Downloads\servos\src\generated\help-index.json`, generated from `docs/user-guide` | Must remain shared between native and web. |
| Preview concepts | `C:\Users\Admin\Downloads\servos\src\components\` and `tests\browser\preview.spec.ts` | Supplies layout and information-architecture references only. Preview data is not production evidence. |
| Existing release evidence | `C:\Users\Admin\Downloads\servos\docs\CURRENT_RELEASE_STATE.md`, `COMPLETION_LEDGER.md`, `TEST_EVIDENCE.md` | Keeps source status separate from executed acceptance. |

The following rules apply to every parity slice:

1. The web interface must use the existing `BusinessStore` command queue and authorized RPC path. No new direct table writes are allowed.
2. Permissions are enforced both when navigation/actions are rendered and by the authoritative server/domain command.
3. Existing records, versions, audit entries, replay protection, and approval requirements remain authoritative.
4. Offline behavior must be explicit. A queued browser change is not the same thing as provider confirmation, server acceptance, or printed output.
5. Preview values, charts, and sample records may guide composition but cannot be presented as live business facts.
6. Every completed slice needs source tests and focused browser coverage before it is marked implemented.

## 3. Current product flows

### 3.1 Native terminal lifecycle

The native root has a complete staged lifecycle:

```text
NativeRoot
  ├─ status unavailable → opening local database
  ├─ not enrolled + NEW / INTAKE_IN_PROGRESS → IntakeWizard
  ├─ not enrolled + confirmed intake → EnrollmentView
  ├─ enrolled but no active staff session → UnlockView
  ├─ active session but installation not LIVE → SetupWizard
  └─ LIVE session → NativeBarShell
```

Evidence: `C:\Users\Admin\Downloads\servos\src\native\NativeRoot.tsx:3-8`.

The intake profile captures more than business identity. It includes owner and initial administrator identity, venue type, service modes, hours, payment methods, M-Pesa account, sales structure, stock/service areas, tables, staffing estimates, equipment expectations, import mode, and intended go-live information.

Evidence: `C:\Users\Admin\Downloads\servos\src\native\IntakeWizard.tsx:8-17`.

Enrollment then binds the confirmed profile to an owner authorization account and creates the local administrator PIN. Credentials are deliberately not written into the intake profile.

Evidence: `C:\Users\Admin\Downloads\servos\src\native\EnrollmentView.tsx:34-60`.

Setup is a resumable required-step process covering:

- business identity;
- tax configuration;
- payment methods;
- service areas;
- stock locations;
- catalog and stock master;
- optional recipes and portions;
- opening inventory;
- optional floorplan;
- staff access;
- till configuration;
- backup and synchronization rehearsal.

Evidence: `C:\Users\Admin\Downloads\servos\src\native\SetupWizard.tsx:5-25`.

### 3.2 Production web lifecycle

The production web application currently starts from authenticated remote account access:

```text
RemoteManagerApp
  ├─ sign in / recovery / invitation password setup
  ├─ manager verification and web session
  └─ WebBusinessApp
       ├─ authorized snapshot
       ├─ browser device registration
       ├─ IndexedDB command queue
       ├─ automatic synchronization
       └─ operational workspace
```

Evidence: `C:\Users\Admin\Downloads\servos\src\runtime\RemoteManagerApp.tsx` and `C:\Users\Admin\Downloads\servos\src\runtime\web\WebBusinessApp.tsx:38-65`.

There is no web equivalent of the native installation-stage gate. A web user who can authenticate enters the remote manager flow; the web product does not currently present a first-business intake, owner enrollment, business setup checklist, or Go Live validation experience.

This is a product gap, not merely a navigation-label difference.

### 3.3 Help and guidance lifecycle

Native guidance is a system, not just a modal:

- typed guide definitions in `src/guidance/core.ts`;
- permission-filtered guide eligibility;
- semantic `data-guide-anchor` targets;
- optional route/action transitions;
- persisted per-staff progress;
- resumable steps;
- command-success workflow completion;
- target-loss recovery;
- keyboard Escape handling;
- shared offline Help Center content.

Evidence: `C:\Users\Admin\Downloads\servos\src\guidance\GuidanceProvider.tsx:28-137`, `core.ts:1-67`, and `native\HelpCenterView.tsx:8-21`.

The web implementation currently has:

- `WebStartHere` task cards;
- permission-filtered Quick Add choices;
- a Help screen using `help-index.json`;
- a three-step local quick tour;
- plain-language sync/status guidance.

Evidence: `C:\Users\Admin\Downloads\servos\src\runtime\web\WebGuidanceViews.tsx:13-71`.

The web implementation does not yet have equivalent persisted guidance progress, role-specific first-use welcome, target highlighting, route-aware guide steps, article-linked workflow guides, or success-operation completion.

## 4. Parity definitions

For this plan, parity has four levels:

### Level A — Entry parity

The user can find the capability through a permission-filtered web navigation or task card, using the same staff-facing language as native.

### Level B — Workflow parity

The user can complete the same meaningful business workflow, including required review, validation, rejection, cancellation, and error states.

### Level C — Control parity

The web workflow preserves the native permission, manager approval, version, audit, replay, receipt, journal, and offline/sync rules.

### Level D — Guidance parity

The user receives equivalent Help content, role-appropriate entry guidance, route-aware tour steps, recoverable targets, and progress/completion behavior.

A feature is not complete merely because it has a web tab. The parity level will be recorded for each slice.

## 5. Complete gap inventory

### 5.1 Platform intake and first access

| Capability | Native | Web | Gap | Priority |
|---|---|---|---|---|
| Business intake profile | `IntakeWizard` | None | Missing web intake | P0 |
| Owner identity and initial administrator | `IntakeWizard` | None | Missing web commissioning identity flow | P0 |
| Intake save/resume | Native runtime status and save command | None | Missing | P0 |
| Existing data/import choice | Intake import mode and CSV identity prefill | No intake choice | Missing | P1 |
| Owner authorization/enrollment | `EnrollmentView` | Account invite/password flow only | Account access exists, terminal/business enrollment does not | P0 |
| Local administrator PIN | Native enrollment and unlock | Web uses remote account session | Different security model; do not copy local PIN blindly | P1 |
| Business setup checklist | `SetupWizard` | No equivalent | Missing | P0 |
| Setup progress persistence | `businessSetup` records and required-step gating | No equivalent | Missing | P0 |
| Go Live validation | Setup completion gates and backup/sync rehearsal | No equivalent | Missing | P0 |
| Existing-terminal upgrade awareness | Native release/runbook behavior | No web equivalent | Needs web account/business state messaging | P1 |

#### Scope decision

The web version should provide a **business commissioning and readiness flow**, but it should not pretend to create a local terminal PIN, configure a USB printer, or perform native SQLite backup operations in a browser. Web intake must distinguish:

- business information that can be configured remotely;
- hosted account and staff access;
- browser/device readiness;
- terminal-only setup that must be completed in the native app;
- external provider checks that require manual confirmation.

### 5.2 Home, task intake, Quick Add, and staff welcome

| Capability | Native | Web | Gap | Priority |
|---|---|---|---|---|
| Task-first Home | `NativeHomeView` | `WebStartHere` | Present, needs broader task coverage | P1 |
| Permission-filtered task cards | Present | Present | Mostly aligned | P1 |
| Permission-filtered Quick Add | Present | Present for product, room, property, guest, supplier | Present; add prerequisite parity as modules expand | P1 |
| Staff welcome | `StaffWelcome` with persisted dismissal | No equivalent web welcome | Missing | P0 |
| Role-specific recommendations | Native guide permissions | Web cards are permission-filtered but not role-personalized | Partial | P1 |
| Setup readiness summary | Native setup state | No web readiness summary | Missing | P0 |
| First-use handoff from intake to task work | Native lifecycle | Web opens directly into manager workspace | Missing | P0 |

### 5.3 Help Center parity

| Capability | Native | Web | Gap | Priority |
|---|---|---|---|---|
| Shared generated article index | `help-index.json` | `help-index.json` | Present | P0 |
| Offline/readable article body | Present | Present in web snapshot | Verify cached access and stale-index behavior | P1 |
| Search by title, body, keywords | Present | Present | Present | P0 |
| Role/permission filtering | Guides are filtered; article display is broad | Web article results are not permission-filtered | Partial | P1 |
| Article section/screen metadata | Present | Reduced display | Partial | P2 |
| Guide launcher inside Help | Present | Tour button present | Partial | P1 |
| Per-staff guide progress | Native persisted progress | Web none | Missing | P0 |
| Continue/completed/restart labels | Native | Web no persisted state | Missing | P0 |
| Contextual Help from current workspace | Native shell opens current article context | Web Help is a separate tab without current-screen article selection | Partial | P1 |
| Help availability when disconnected | Native offline architecture | Web article bundle is local, but full browser/offline acceptance is not yet established | Needs acceptance | P1 |

### 5.4 Tour and workflow guidance parity

| Capability | Native | Web | Gap | Priority |
|---|---|---|---|---|
| Typed guide definitions | `GuideDefinition` / `GuideStep` | Hard-coded three-step array | Missing shared web guide model | P0 |
| Stable guide/version IDs | Present | No persisted IDs for web tour steps | Missing | P0 |
| Semantic target anchors | Native shell and views | Web has only limited guidance anchors | Partial | P1 |
| Spotlight/highlight | Native ring/target rect | Web tour is an unanchored bottom-right dialog | Missing | P1 |
| Route-aware step | Native route dispatch | Web tour does not navigate | Missing | P0 |
| Optional action/deep link | Native route action | Web no equivalent | Missing | P0 |
| Practice step | Native waits for committed operation | Web tour only advances by Next | Missing | P0 |
| Success operation matching | Native `matchesGuideCommit` | Web none | Missing | P0 |
| Target loss recovery | Native fallback text and observers | Web no target system | Missing | P1 |
| Resize/scroll observation | Native | Web not applicable to current unanchored tour | Missing with target parity | P1 |
| Escape/keyboard handling | Native Escape close | Web button close only | Partial | P1 |
| Per-staff resume | Native | Web React state resets on reload | Missing | P0 |
| Article reference from guide step | Native | Web no guide/article relationship | Missing | P1 |

### 5.5 Operational workspace gaps

| Native workspace/capability | Web status | Parity level | Priority |
|---|---|---:|---:|
| POS | Present with payment, split, refund, void, barcode, receipt history | B/C partial | P1 |
| KDS | Present | B partial | P1 |
| Inventory | Present; scanner count/resume parity incomplete | B partial | P1 |
| Procurement | Present and substantial; approval parity needs review | B/C partial | P1 |
| Room setup | Present through generic Rooms/editor flows | B partial | P1 |
| Front Desk | No dedicated web workspace | A missing | P0 |
| Guest accounts/Folios | No dedicated web workspace | A/B missing | P0 |
| Housekeeping | No dedicated web workspace | A missing | P0/P1 |
| Assets | Present; lifecycle/maintenance breadth needs review | B partial | P1 |
| M-Pesa reconciliation | No dedicated web workspace | A/B missing | P0/P1 |
| Customer credit | No dedicated web workspace or POS credit flow | A/B missing | P0/P1 |
| Refunds | Present | B/C partial | P1 |
| Till/close day | Present in Finance | B/C partial | P1 |
| Reports center | Reduced to close-day summaries | A/B partial | P1 |
| Floorplan designer | No web equivalent | A missing | P1 |
| Controlled import center | No web equivalent | A missing | P1 |
| Business administration/backup | Staff/device area only; no full equivalent | A/B partial | P1/P2 |

### 5.6 POS-specific gaps

The web POS already contains more parity than the shell inventory suggests. It supports quick/named/table tabs, product configuration, scanning, quantity changes, cash/M-Pesa/card payment, split tender, void, refund, receipt history, and till opening.

The remaining high-value gaps are:

1. Room charge to a checked-in folio.
2. Customer credit charge and account selection.
3. Table transfer and merge.
4. Discounts and comps.
5. Consistent manager approval dialogs for protected actions.
6. Browser receipt print/download behavior, while keeping native printer queues native-only.

Evidence for native room charge and transfer/merge: `C:\Users\Admin\Downloads\servos\src\native\NativePOSView.tsx`. Evidence for current web POS controls: `C:\Users\Admin\Downloads\servos\src\runtime\web\WebPosView.tsx`.

### 5.7 Hospitality gaps

The native shell deliberately separates:

- Front Desk;
- Guest accounts;
- Housekeeping;
- Room setup.

The web shell currently compresses these into `Rooms`. This is an information-architecture and workflow gap, not only a missing button. The web plan must split these responsibilities so that a receptionist, housekeeper, manager, and setup administrator do not receive the same technical screen.

## 6. Target web architecture

### 6.1 Web platform lifecycle components

Proposed components, subject to implementation review:

```text
src/runtime/web/WebPlatformIntake.tsx
src/runtime/web/WebEnrollmentView.tsx
src/runtime/web/WebBusinessSetup.tsx
src/runtime/web/WebGoLiveReadiness.tsx
src/runtime/web/WebStaffWelcome.tsx
src/runtime/web/WebGuidanceProvider.tsx
src/runtime/web/WebGuidedTour.tsx
```

These names are planning targets, not a requirement to duplicate native files line-for-line.

The web lifecycle should remain explicit:

```text
Remote account access
  ↓
Business not commissioned → Web Platform Intake
  ↓
Owner/admin access confirmed → Web Enrollment / staff setup
  ↓
Required business setup incomplete → Web Business Setup
  ↓
Setup complete but readiness checks incomplete → Web Go Live Readiness
  ↓
Ready → Web Start Here / operational workspace
```

The authoritative source for state should be the hosted business/session domain, not browser-only state. Browser local storage may remember dismissed guidance, but it must not be the authority for whether a business is configured or safe to transact.

### 6.2 Web guidance architecture

The web should adopt the native guide data model rather than maintaining a second ad hoc tour format.

Recommended shared contract:

```ts
type PlatformGuideStep = {
  id: string;
  title: string;
  description: string;
  interaction?: 'inform' | 'observe' | 'practice';
  target?: string;
  route?: { screen: string; action?: string };
  articleId?: string;
  successOperations?: string[];
};

type PlatformGuide = {
  id: string;
  version: number;
  title: string;
  description: string;
  permissions?: string[];
  audience?: 'owner' | 'manager' | 'cashier' | 'server' | 'chef' | 'housekeeper' | 'all';
  steps: PlatformGuideStep[];
};
```

The first implementation should reuse or extract the non-native portions of:

- `src/guidance/core.ts`;
- `src/guidance/workflow.ts`;
- the progress shape used by `GuidanceProvider`;
- the generated Help article IDs.

It should not create a second incompatible guide-definition format.

### 6.3 Guidance persistence

Web guidance progress must be scoped by:

- business ID;
- authenticated actor/staff ID;
- guide ID;
- guide version.

It must not be written into business records or the business command outbox. It may be stored in an authorized guidance-progress endpoint or a staff-scoped browser store, but the choice must be explicit and tested for reload, account switching, and multi-business isolation.

### 6.4 Web platform setup boundaries

The web setup flow should support configuration that belongs in the shared business domain:

- business identity;
- tax settings;
- payment methods and M-Pesa account metadata;
- service areas/outlets;
- storage places;
- catalog and stock masters;
- opening balances where the existing command supports them;
- staff access and roles;
- floorplan data where the existing web command path supports it;
- readiness checklist.

The web setup flow should link to or clearly defer native-only capabilities:

- local PIN enrollment;
- USB/LAN printer handshake and test output;
- local SQLite backup;
- physical scanner acceptance;
- terminal migration and device cutover;
- local offline grant/device acceptance.

The UI must say what remains to be done rather than displaying a false “ready” state.

## 7. Execution sequence

### Step 0 — Documentation and parity contract

This document is Step 0.

Deliverables:

- parity matrix;
- platform lifecycle definition;
- Help/tour parity definition;
- scope boundaries for preview-only and native-only features;
- acceptance strategy;
- source ownership and evidence rules.

Exit criteria:

- implementation tasks can cite a specific gap and parity level;
- no feature is marked complete based only on a preview route;
- intake, Help, and tours are included in the same execution plan as operational workspaces.

### Step 1 — Web platform intake and readiness foundation

Build the web business commissioning path before adding more operational screens.

Scope:

1. Detect whether the authenticated business is commissioned, setup-incomplete, readiness-incomplete, or live.
2. Provide resumable intake with business, owner/admin, venue/service, payment, operating-area, equipment-expectation, and import information.
3. Preserve owner/admin authorization boundaries.
4. Provide a setup checklist with required and optional steps.
5. Provide an honest Go Live readiness summary.
6. Route a ready user to Web Start Here.

Acceptance:

- A new or incomplete web business cannot silently enter a misleading operational state.
- Intake saves and resumes without creating fake products, outlets, stock, or payments.
- Setup completion uses authoritative versioned commands.
- Required setup steps block readiness; optional setup steps explain their consequence.
- Refresh and sign-in from another browser preserve the server-authoritative state.
- Native-only hardware steps are visible as deferred/terminal-required, not falsely passed.

### Step 2 — Web staff welcome and guidance foundation

Implement the shared guidance system for web before authoring many new tours.

Scope:

1. Add a web staff welcome panel on first use.
2. Filter recommendations by permissions and role/audience.
3. Persist dismissal, in-progress, completed, and restarted states.
4. Use stable guide/version IDs.
5. Add target anchors to the web shell and high-value workspaces.
6. Add keyboard close and target-loss fallback.
7. Support route/action transitions through the web workspace allowlist.
8. Keep the current plain-language quick tour as a compatibility fallback until the shared provider is active.

Acceptance:

- A new web staff member receives a non-blocking welcome appropriate to their access.
- A dismissed welcome does not reappear for the same actor/business/version unless restarted.
- Switching actors or businesses cannot reveal another actor’s progress.
- A guide cannot navigate to a permission-denied workspace.
- A practice step completes only after the matching authorized command succeeds.
- Failed or merely queued actions do not mark a guide complete.
- A missing target never blocks the underlying workflow.

### Step 3 — Help Center parity

Upgrade the existing web Help view rather than creating a separate help corpus.

Scope:

1. Continue importing `src/generated/help-index.json`.
2. Add article role/permission visibility rules where appropriate.
3. Add guide cards with progress states.
4. Link guide steps to article IDs.
5. Add current-workspace contextual Help selection.
6. Make Help available from the shell header and Start Here.
7. Verify that article search and selected content work after reload and with a disconnected browser shell.

Acceptance:

- Native and web use the same generated article IDs and article bodies.
- A Help search result never points to a missing article.
- Permission-sensitive operational instructions are not shown as available actions to unauthorized staff.
- Help can start, continue, restart, and complete eligible tours.
- The web Help page remains readable at desktop and mobile widths.

### Step 4 — Hospitality foundation

Split the web `Rooms` information architecture and implement the minimum operational path:

1. `Front Desk`: arrivals, departures, occupancy, search, check-in, check-out, move stay.
2. `Guest Accounts`: folio selection, deposits, accommodation, services, settlement, checkout conservation.
3. `Housekeeping`: readiness board, transitions, inspection, out-of-order and blocks.
4. `Room Setup`: existing room/rate/reservation configuration.
5. POS room charge to a checked-in folio.

Guidance deliverables:

- first reservation/arrival article links;
- first check-in tour;
- room-charge Help article and practice step;
- housekeeping workflow article and role-specific recommendation.

### Step 5 — Financial control and credit parity

Implement:

- M-Pesa reconciliation;
- customer credit workspace;
- POS charge-to-account;
- customer payment/reconciliation/write-off;
- reusable web manager approval flow;
- approval-aware refund, void, discount, over-receive, and write-off controls.

Guidance deliverables:

- payment verification guidance;
- refund versus reversal guidance;
- M-Pesa reconciliation guide;
- credit settlement and discrepancy guide;
- explicit language that the browser does not initiate provider payouts.

### Step 6 — POS and operations parity

Implement and verify:

- POS table transfer/merge;
- discounts and comps;
- scanner count session/resume/unknown barcode handling;
- procurement exception approvals;
- richer catalog/menu editor;
- floorplan designer;
- browser receipt print/download path.

### Step 7 — Administration and scale

Implement or explicitly defer:

- controlled import center;
- reports center;
- business identity/tax/payment settings;
- backup and reconciliation health;
- administrative readiness panels;
- multi-device cutover and recovery guidance.

## 8. First implementation slice after this document

The next code slice should be the platform/guidance foundation, not a preview dashboard.

Recommended order within that slice:

1. Add an authoritative web lifecycle/readiness contract to the web session response or an equivalent authorized RPC.
2. Add the web intake/setup/readiness route shell with no business writes beyond approved setup commands.
3. Add a web guidance provider using the native guide shape and actor/business-scoped progress.
4. Convert the existing web quick tour into the shared core guide.
5. Add web staff welcome and progress-aware Home/Help cards.
6. Add direct browser tests for intake resume, setup gating, welcome dismissal, Help search, tour resume, route permission filtering, and practice-step success.

This slice should not yet attempt to implement Front Desk, folios, M-Pesa reconciliation, or every missing operational screen. It creates the platform needed to deliver those features without repeating the current web/native divergence.

## 9. Acceptance and test plan

### 9.1 Source contracts

Add focused tests covering:

- web lifecycle route selection for each installation/readiness state;
- intake fields and save/resume behavior;
- required versus optional setup steps;
- native-only hardware deferrals;
- guide ID/version uniqueness;
- permission/audience filtering;
- article ID references;
- route/action allowlist behavior;
- success-operation matching;
- actor/business progress isolation;
- no direct Supabase table writes from guidance or intake UI.

### 9.2 Browser tests

Add desktop and mobile cases for:

1. New business opens web intake rather than POS.
2. Intake can save, reload, and continue.
3. Incomplete required setup blocks readiness.
4. Ready setup opens Start Here.
5. Staff welcome appears once, can be dismissed, and can be restarted from Help.
6. Help search opens a shared generated article.
7. Tour route step navigates only to an authorized web workspace.
8. Practice step remains waiting before command success.
9. Practice step completes after command success.
10. A rejected command does not complete a guide.
11. Actor A’s progress is not visible to Actor B.
12. Offline browser shell retains guidance content and does not claim provider success.

### 9.3 Transactional acceptance

When Docker Desktop’s Linux engine is available, extend the PostgreSQL browser suite for:

- setup command authorization and idempotency;
- room/folio commands;
- room charge;
- M-Pesa reconciliation;
- customer credit;
- manager approvals;
- audit and journal effects.

These checks must remain separate from preview smoke tests and must not be replaced by static route assertions.

### 9.4 Native regression protection

Every web guidance/platform change must keep these native guarantees intact:

- NativeRoot installation routing;
- intake save/complete/reopen;
- enrollment requirements;
- setup step gating;
- native Help search;
- per-staff progress;
- native workflow guide completion;
- local-only device, printer, backup, and offline claims.

## 10. Definition of done for parity slices

A slice may be marked `implemented and locally verified` only when all applicable conditions are true:

- the web route/action is permission-filtered;
- the business operation uses the existing command/RPC path;
- the operation has source coverage;
- the view has desktop and mobile browser coverage where relevant;
- errors and offline states use plain staff-facing language;
- approvals, audit, versions, and replay behavior are preserved;
- Help content exists or is explicitly marked as pending;
- an eligible guide exists or the decision not to guide is documented;
- preview-only data is not used as live data;
- generated documentation/help checks pass;
- exact test commands and limitations are recorded in `TEST_EVIDENCE.md`;
- `COMPLETION_LEDGER.md` distinguishes source implementation from executed acceptance.

## 11. Explicit non-goals

This plan does not require:

- copying the old preview route names into the production web shell;
- copying static preview metrics or sample business records;
- exposing raw command IDs in primary staff-facing workflow copy;
- browser-side direct writes to Supabase tables;
- browser control of native USB/LAN printer queues;
- treating a successful request submission as provider payment confirmation;
- treating a queued offline command as server acceptance;
- replacing the native terminal lifecycle with an unauthenticated web wizard;
- merging business configuration and staff training into one confusing wizard.

## 12. Current limitations and open decisions

1. The exact hosted representation of business installation/readiness state must be confirmed before implementing web intake. The browser must not infer it solely from the presence of records.
2. The web guidance progress persistence endpoint or store is not yet selected. It must support actor/business isolation and must not pollute business records/outbox.
3. The web permission vocabulary differs in places from native permission names. A canonical mapping must be documented before adding cross-shell guide eligibility.
4. The web authentication flow is account-based while native enrollment includes a local administrator PIN. The security model should be aligned at the policy level, not by blindly copying the PIN UI.
5. Native hardware readiness cannot be honestly completed in a browser. The readiness screen must show deferred terminal checks with clear ownership and next steps.
6. The full transactional browser suite remains blocked until Docker Desktop’s Linux engine is available. Source and mock-browser evidence must not be described as hosted production acceptance.

## 13. Links to existing planning and evidence

- [UX and Guidance Delivery Plan](UX_GUIDANCE_DELIVERY_PLAN.md)
- [Current release state](CURRENT_RELEASE_STATE.md)
- [Completion ledger](COMPLETION_LEDGER.md)
- [Test evidence](TEST_EVIDENCE.md)
- Guidance System specification: `C:\Users\Admin\Downloads\servos\ServOS Guidance System.md`
