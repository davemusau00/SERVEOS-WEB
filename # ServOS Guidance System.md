# ServOS Guidance System
## Extensive Application, Interactive Training, Help Center & Product Education Implementation Plan

**Repository:** `davemusau00/servos-`  
**Target:** Native Tauri terminal first  
**Reference state reviewed:** `main` at `4035337e5d63ba8785e87ba344565cc69c69e68d`
**Baseline note:** This is the original planning snapshot. Current implementation and acceptance status are tracked in [the UX and Guidance Delivery Plan](docs/UX_GUIDANCE_DELIVERY_PLAN.md) and the release ledger.

> Planning baseline only: this hash identifies the original review snapshot, not the current checkout. The current coordination and delivery order is documented in [docs/UX_GUIDANCE_DELIVERY_PLAN.md](docs/UX_GUIDANCE_DELIVERY_PLAN.md). This document remains authoritative for the guidance architecture and training requirements.

---

# 1. Objective

The goal should not be to bolt a conventional “product tour” onto ServOS.

The goal should be to turn ServOS into a **self-teaching operational system**.

A new staff member should be able to unlock a terminal and progressively learn:

- what they are permitted to do;
- where their work happens;
- how a workflow is performed;
- what a successful operation looks like;
- what ServOS actually records;
- what mistakes must be avoided;
- how to recover when something goes wrong;
- which procedures require manager approval;
- where to find detailed documentation later.

This creates one integrated **Guidance System** containing:

```text
SERVOS GUIDANCE SYSTEM
│
├── First-use onboarding
│   └── What should I learn first?
│
├── Platform tours
│   └── Where is everything?
│
├── Interactive workflow training
│   └── Show me how to perform the work.
│
├── Contextual assistance
│   └── What does this button / screen / state mean?
│
├── Help Center
│   └── How do I perform X?
│
├── SOP / operational manual
│   └── What is the correct business procedure?
│
├── Troubleshooting
│   └── Why did this fail and what should I do?
│
└── Training progress
    └── What have I learned and what comes next?
```

The architecture should be reusable beyond ServOS, but ServOS becomes the first serious implementation.

---

# 2. Why ServOS is particularly suited to this architecture

ServOS already contains most of the foundations that a strong guidance system needs.

The repository currently has:

| Existing capability | Guidance opportunity |
|---|---|
| Native authenticated staff sessions | Per-user training |
| `RuntimeSnapshot.actor.permissions` | Permission-aware guides |
| Native command boundary | Advance training on committed operations |
| SQLite local authority | Offline progress |
| Audit architecture | Optional training/activity evidence |
| Hash-based workspace routing | Cross-screen tours |
| `NativeBarShell` | Global guidance host |
| Offline Help Center | Permanent guidance destination |
| `docs/user-guide` | Authoritative educational source |
| deterministic `help-index.json` | Searchable knowledge registry |
| `docs-check.mjs` | Guidance consistency validation |
| `audit-ui.mjs` | Anchor/control coverage validation |
| 40 operational user-guide chapters | Immediate documentation coverage |
| setup state machine | Clear distinction between configuration and staff training |
| RBAC capability catalogue | Eligibility and guide recommendations |
| terminal acceptance framework | Hardware training opportunities |
| barcode scanner integration | Real interactive scanner guidance |

This means we do **not** need to invent a parallel knowledge architecture.

We connect what already exists.

---

# 3. Product principle

ServOS should eventually be capable of answering five questions from inside the application:

> Where is it?

> What does it do?

> How do I use it?

> Did I actually complete the operation correctly?

> What should I learn next?

A normal tooltip system answers only the first two.

ServOS should answer all five.

---

# 4. Preserve the existing business lifecycle

The current lifecycle is conceptually correct:

```text
INSTALL
   ↓
INTAKE
   ↓
ENROLLMENT
   ↓
BUSINESS SETUP
   ↓
GO-LIVE VALIDATION
   ↓
LIVE
   ↓
STAFF UNLOCK
   ↓
OPERATIONS
```

Guidance must **not collapse Business Setup and employee training into one wizard**.

They solve different problems.

### Business Setup

Answers:

> Is the terminal configured to represent the real business?

It controls:

- identity;
- tax;
- payments;
- outlets;
- stock locations;
- catalog;
- inventory;
- floorplan;
- staff;
- till;
- backup;
- go-live readiness.

### Staff Guidance

Answers:

> Does this employee understand how to use the configured business system?

It controls:

- introduction;
- navigation;
- role awareness;
- workflow tours;
- task training;
- Help Center;
- progress.

The separation becomes:

```text
BUSINESS CONFIGURATION
        │
        ▼
      GO LIVE
        │
════════════════════════
        │
 STAFF EDUCATION
        │
        ▼
    OPERATIONS
```

---

# 5. Architectural target

Add a dedicated ServOS guidance domain on the frontend:

```text
src/
└── guidance/
    │
    ├── core/
    │   ├── types.ts
    │   ├── registry.ts
    │   ├── anchors.ts
    │   ├── eligibility.ts
    │   ├── progress.ts
    │   ├── events.ts
    │   └── validation.ts
    │
    ├── components/
    │   ├── GuidanceProvider.tsx
    │   ├── GuidedTour.tsx
    │   ├── TourSpotlight.tsx
    │   ├── TourCard.tsx
    │   ├── TourAnchor.tsx
    │   ├── GuidanceLauncher.tsx
    │   ├── StaffWelcome.tsx
    │   ├── TrainingProgress.tsx
    │   └── ContextHelp.tsx
    │
    ├── hooks/
    │   ├── useGuidance.ts
    │   ├── useGuide.ts
    │   ├── useGuideTarget.ts
    │   ├── useGuideEvents.ts
    │   └── useGuideProgress.ts
    │
    ├── adapters/
    │   ├── servos-navigation.ts
    │   ├── servos-permissions.ts
    │   ├── servos-persistence.ts
    │   └── servos-events.ts
    │
    ├── definitions/
    │   ├── core.ts
    │   ├── pos.ts
    │   ├── inventory.ts
    │   ├── kds.ts
    │   ├── payments.ts
    │   ├── procurement.ts
    │   ├── rooms.ts
    │   ├── frontdesk.ts
    │   ├── housekeeping.ts
    │   ├── folios.ts
    │   ├── assets.ts
    │   ├── maintenance.ts
    │   ├── close-day.ts
    │   ├── reports.ts
    │   ├── imports.ts
    │   └── admin.ts
    │
    └── index.ts
```

The architecture follows one important rule:

```text
guidance/core
knows HOW guidance works.

guidance/definitions
knows WHAT ServOS teaches.
```

That separation is what later permits extraction into:

```text
packages/guided-help
```

for use by KKA and future systems.

---

# 6. Formal guide model

Do not allow guide definitions to become arbitrary React code.

Use a strongly typed declarative model.

```ts
export type GuideId = string;
export type GuideStepId = string;
export type GuideAnchorId = string;
export type GuideScreenId = string;

export interface GuideAudience {
  roles?: StaffRole[];
  permissions?: Permission[];
  anyPermissions?: Permission[];
}

export interface GuideRoute {
  screen: GuideScreenId;
  resourceId?: string;
  tab?: string;
}

export interface GuideInteraction {
  mode:
    | 'inform'
    | 'navigate'
    | 'click'
    | 'observe'
    | 'practice';

  event?: string;
  advanceOnSuccess?: boolean;
}

export interface GuideStep {
  id: GuideStepId;

  title: string;
  description: string;

  target?: GuideAnchorId;
  route?: GuideRoute;

  badge?: string;

  placement?:
    | 'auto'
    | 'top'
    | 'right'
    | 'bottom'
    | 'left'
    | 'center';

  requiredPermission?: Permission;

  interaction?: GuideInteraction;

  optional?: boolean;

  fallback?:
    | 'skip'
    | 'center'
    | 'error';

  articleId?: string;
}

export interface GuideDefinition {
  id: GuideId;
  version: number;

  title: string;
  description: string;

  category:
    | 'orientation'
    | 'workflow'
    | 'hardware'
    | 'operations'
    | 'administration'
    | 'troubleshooting';

  estimatedMinutes?: number;

  audience?: GuideAudience;

  steps: GuideStep[];

  relatedArticles?: string[];
  prerequisites?: GuideId[];
}
```

This becomes the contract for the entire system.

---

# 7. Replace raw selectors with semantic anchors

This should improve on the original KKA implementation immediately.

Avoid guide configuration such as:

```ts
targetSelector: '[data-tour="something"]'
```

Instead use:

```ts
target: 'pos.quick-tab'
```

The actual UI exposes:

```tsx
<TourAnchor id="pos.quick-tab">
  <button>Quick tab</button>
</TourAnchor>
```

Internally:

```html
data-guide-anchor="pos.quick-tab"
```

Advantages:

- no CSS selector knowledge in guide definitions;
- easier refactoring;
- compile-time constants if desired;
- duplicate detection;
- responsive target selection;
- deterministic documentation;
- easier testing.

Anchor namespace conventions should be enforced.

```text
shell.*
navigation.*

pos.*
kds.*
inventory.*
procurement.*
catalog.*

rooms.*
frontdesk.*
housekeeping.*
folios.*

assets.*
maintenance.*

payments.*
mpesa.*
closeDay.*
reports.*

admin.*
imports.*

help.*
```

---

# 8. Anchor registry

Create a central registry:

```ts
export const GUIDE_ANCHORS = {
  NAV_POS: 'navigation.pos',
  NAV_INVENTORY: 'navigation.inventory',

  SHELL_HELP: 'shell.help',
  SHELL_SYNC: 'shell.sync',
  SHELL_LOCK: 'shell.lock',

  POS_QUICK_TAB: 'pos.quick-tab',
  POS_SEARCH: 'pos.search',
  POS_SCANNER_TEST: 'pos.scanner-test',
  POS_PRODUCT_GRID: 'pos.product-grid',
  POS_ACTIVE_TAB: 'pos.active-tab',
  POS_FIRE: 'pos.fire',
  POS_PAY: 'pos.pay',

  INVENTORY_SEARCH: 'inventory.search',
  INVENTORY_COUNT: 'inventory.count',
  INVENTORY_TRANSFER: 'inventory.transfer',
  INVENTORY_WASTE: 'inventory.waste',
} as const;
```

Guides reference constants rather than free text where practical.

---

# 9. `NativeBarShell` becomes the global host

`NativeBarShell.tsx` is the natural guidance root because it already controls:

- visible navigation;
- permission-filtered routes;
- active screen;
- contextual help;
- network state;
- pending sync state;
- current staff identity;
- lock;
- sync.

Wrap the shell approximately like:

```tsx
<GuidanceProvider
  actor={snapshot.actor}
  navigation={navigationAdapter}
  persistence={persistenceAdapter}
>
  <NativeBarShellContent />
  <GuidedTour />
  <StaffWelcome />
</GuidanceProvider>
```

That means POS, Inventory, Rooms etc. do **not** individually maintain tour state.

Any screen can simply call:

```ts
const guidance = useGuidance();

guidance.start('inventory.stocktake');
```

---

# 10. Formal navigation adapter

Current ServOS navigation is controlled through:

```ts
window.location.hash
```

and `setTab()`.

Do not let the reusable engine know that.

Define:

```ts
interface GuidanceNavigationAdapter {
  getCurrentScreen(): string;

  navigate(screen: string): Promise<void>;

  isScreenAvailable(screen: string): boolean;
}
```

ServOS implementation handles:

```text
pos
kds
inventory
assets
procurement
catalog
master
imports
frontdesk
folios
housekeeping
rooms
tender
refunds
floorplan
close
reports
admin
help
```

This also makes future migration to another routing system painless.

---

# 11. Make permissions authoritative

ServOS already gets authoritative permissions from:

```ts
RuntimeSnapshot.actor.permissions
```

Guidance must consume the same list.

Never build a second access model such as:

```ts
if (role === 'Manager')
```

when the real system decides capability through:

```ts
permissions.includes('inventory.count')
```

The recommendation engine can use role labels for presentation, but eligibility should use permissions.

Example:

```ts
{
  id: 'inventory.stocktake',
  audience: {
    permissions: [
      'inventory.view',
      'inventory.count'
    ]
  }
}
```

If a permission disappears from an employee, the associated guide should automatically stop being recommended.

---

# 12. Guide eligibility engine

Create:

```ts
getGuideEligibility(
  definition,
  actor,
  capabilities
)
```

Possible result:

```ts
{
  eligible: true,
  reason: null
}
```

or:

```ts
{
  eligible: false,
  reason: 'missing-permission',
  missingPermissions: ['inventory.count']
}
```

The engine should account for:

- permissions;
- installation stage;
- module availability;
- hardware capability;
- configured business features;
- guide prerequisites;
- completed versions;
- current route availability.

Example:

A scanner guide should only be heavily recommended when:

```text
intakeProfile.barcodeScannerExpected === true
```

or when barcode-enabled catalog items exist.

---

# 13. Distinguish orientation, workflow and operational training

Not every guide should behave the same way.

### Orientation

User manually presses Next.

Example:

```text
This is Inventory.
This is Help.
This shows pending synchronization.
```

### Workflow training

User performs actual operations.

Example:

```text
Open a tab
→ Add item
→ Fire
→ Pay
```

### Operational/SOP training

Mixes UI and business explanation.

Example:

```text
Why a refund differs from a void
Why stock doesn't automatically return
What manager approval means
```

This classification belongs in guide metadata.

---

# 14. Interactive steps must advance on success, not clicks

This is one of the most important improvements over a typical tour library.

ServOS already has a powerful central command wrapper:

```ts
runtime.command(...)
```

It:

1. executes the native command;
2. commits locally;
3. refreshes the snapshot;
4. emits `servos:local-commit`.

The guidance system should expand that concept.

After successful commands, emit a richer event:

```ts
guidance.emit({
  type: 'business-command.committed',

  operation: 'order.addItem',

  result,

  payload
});
```

A POS guide step waits for:

```text
operation === order.addItem
```

rather than:

```text
user clicked product button
```

This distinction is critical.

A button can be clicked and fail validation.

The guide should only celebrate success when the business operation actually committed.

---

# 15. Event taxonomy

Introduce a small domain-event layer for guidance.

Do **not** create hundreds of bespoke events immediately.

Start with generic committed-command events:

```text
business-command.committed
business-command.failed

navigation.changed

dialog.opened
dialog.closed

help.article-opened
```

Guide conditions can inspect:

```ts
{
  operation: 'order.create'
}
```

Later add semantic derived events only where valuable:

```text
pos.tab-opened
pos.item-added
pos.round-fired
pos.payment-completed

inventory.count-committed

rooms.reservation-created
rooms.guest-checked-in

housekeeping.room-cleaned

asset.assignment-completed
```

---

# 16. Never advance on uncommitted draft activity

Some ServOS workflows intentionally have draft phases.

Examples:

- barcode test;
- inventory count drafts;
- form entry;
- search;
- modal configuration.

Guidance should distinguish:

```text
draft interaction
```

from:

```text
business transaction
```

For example:

```text
Scan this stock item
```

could advance when the scanner successfully resolves the item.

But:

```text
Complete the stock count
```

must only advance after:

```text
inventory.count
```

commits.

---

# 17. Per-staff durable persistence

KKA’s global `tourCompletedAt` limitation should not be copied. The original analysis identified the need for per-guide and guide-version progress.

Add:

```text
src-tauri/migrations/010_guidance.sql
```

Suggested schema:

```sql
CREATE TABLE guidance_progress (
    staff_id TEXT NOT NULL,
    guide_id TEXT NOT NULL,
    guide_version INTEGER NOT NULL,

    status TEXT NOT NULL
        CHECK(status IN (
            'NOT_STARTED',
            'IN_PROGRESS',
            'COMPLETED',
            'DISMISSED'
        )),

    current_step_id TEXT,

    completed_step_ids TEXT NOT NULL DEFAULT '[]',

    started_at INTEGER,
    last_seen_at INTEGER,
    completed_at INTEGER,
    dismissed_until INTEGER,

    PRIMARY KEY (
        staff_id,
        guide_id,
        guide_version
    )
);
```

Optional:

```sql
CREATE INDEX guidance_progress_staff_status
ON guidance_progress(staff_id, status);
```

---

# 18. Why this should not be ordinary `record.save`

Guidance progress is system metadata, not business master data.

It should not pollute:

```text
products
customers
outlets
assets
businessSetup
```

nor should it masquerade as a generic editable record.

Use dedicated commands.

---

# 19. Native command boundary

Introduce:

```text
guidance.start
guidance.savePosition
guidance.completeStep
guidance.complete
guidance.dismiss
guidance.restart
```

Or expose them through dedicated Tauri functions.

Recommended abstraction:

```ts
interface GuidancePersistenceAdapter {
  load(): Promise<GuidanceProgress[]>;

  start(
    guideId: string,
    guideVersion: number
  ): Promise<void>;

  savePosition(
    guideId: string,
    guideVersion: number,
    stepId: string
  ): Promise<void>;

  completeStep(
    guideId: string,
    guideVersion: number,
    stepId: string
  ): Promise<void>;

  complete(
    guideId: string,
    guideVersion: number
  ): Promise<void>;

  dismiss(
    guideId: string,
    guideVersion: number,
    until?: string
  ): Promise<void>;

  restart(
    guideId: string,
    guideVersion: number
  ): Promise<void>;
}
```

The authenticated session determines:

```text
staff_id
```

The browser must never choose whose training record is being modified.

---

# 20. Progress should remain local-first

Guidance must work when:

```text
navigator.onLine === false
```

The terminal should retain:

- guides;
- documentation;
- current training position;
- completions;
- recommendations;
- contextual help.

No Supabase roundtrip should be necessary.

The natural authority is local SQLite.

Future synchronization can optionally replicate guide progress to cloud management dashboards, but that is a later concern.

---

# 21. Guidance sync should be lower priority than operations

If guide progress later enters the outbox system, classify it as non-operational metadata.

A temporary failure to sync:

```text
Jane completed POS Basics
```

must never block:

```text
Jane recording a KES 1,500 payment
```

Trading wins.

Guidance sync is background convenience.

---

# 22. Target discovery engine

Do not repeat KKA's permanent 400 ms DOM polling model. Its limitations were already identified.

Implement:

```text
MutationObserver
ResizeObserver
scroll
resize
requestAnimationFrame
```

Use brief polling only during route transitions.

Example:

```ts
await anchorRegistry.waitFor(
  'inventory.count',
  {
    timeout: 5000
  }
);
```

---

# 23. Auto-scroll

When a step targets something outside the viewport:

```ts
element.scrollIntoView({
  behavior: 'smooth',
  block: 'center',
  inline: 'nearest'
});
```

Then wait for layout stabilization before measuring.

This matters for:

- Inventory lists;
- Assets;
- Help Center articles;
- reports;
- mobile screens.

---

# 24. Spotlight placement engine

KKA currently uses a fairly static tour card placement.

ServOS should calculate placement.

For each target:

```text
available top space
available bottom space
available left space
available right space
```

Then choose the best location based on:

```ts
placement: 'auto'
```

while honoring manual overrides.

Avoid covering:

- the target itself;
- important adjacent controls;
- POS totals;
- payment information.

---

# 25. Click-through support

The overlay architecture must permit real interactive training.

A LOOK step can block background interaction.

A DO step must allow interaction with its highlighted element.

So spotlight behavior should support:

```ts
interactionPolicy:
  'blocked'
  | 'target-only'
  | 'unblocked'
```

Example:

```text
Informational navigation explanation
→ blocked

"Click Quick Tab"
→ target-only
```

---

# 26. Keyboard and accessibility

The tour UI should support:

```text
Escape      Close / postpone
ArrowLeft   Previous
ArrowRight  Next, when manual
Enter       Next, where appropriate
```

Also:

- focus trap inside the tour card when blocking;
- `aria-live` for step changes;
- meaningful labels;
- high contrast spotlight;
- reduced motion support;
- no dependence on color alone.

A POS product should not become harder to operate because training is active.

---

# 27. Desktop and mobile anchors

ServOS currently renders:

```text
desktop sidebar
mobile bottom navigation
```

The same semantic target may exist in two locations.

Support:

```tsx
<TourAnchor
  id="navigation.inventory"
  variant="desktop"
/>
```

and:

```tsx
<TourAnchor
  id="navigation.inventory"
  variant="mobile"
/>
```

The registry resolves:

```text
visible + enabled target
```

This avoids duplicate mobile guides.

---

# 28. Target preparation

Some elements may not exist until a drawer/modal/tab is open.

Support:

```ts
prepare?: async context => {
  await context.ui.openSomething();
}
```

or a declarative form later:

```ts
beforeShow: [
  {
    action: 'OPEN_MOBILE_NAV'
  }
]
```

Use this carefully.

The guidance system may prepare **interface state**, but it must never silently perform a real business transaction.

---

# 29. Missing-target strategy

Every targeted step should define what happens when its anchor does not appear.

```ts
fallback:
  'skip'
  | 'center'
  | 'error'
```

Recommended defaults:

```text
optional step
→ skip

informational step
→ center

critical development inconsistency
→ error in dev/test
```

Development mode should log:

```text
Guide pos.first-sale
Step pay
Anchor pos.pay missing
```

Production should degrade gracefully.

---

# 30. Upgrade the existing Help Center instead of replacing it

`HelpCenterView.tsx` currently has:

```text
articles
search
section
roles
permissions
screen
summary
body
keywords
```

Expand the generated article contract:

```ts
interface HelpArticle {
  id: string;
  title: string;
  section: string;

  roles: string[];
  permissions: Permission[];

  screen: string;

  summary: string;
  body: string;

  keywords: string[];

  guideIds: string[];
  relatedArticleIds: string[];

  difficulty?: 'basic' | 'intermediate' | 'advanced';

  estimatedMinutes?: number;
}
```

---

# 31. Extend Markdown metadata

Current user guide metadata already includes:

```text
Section:
Roles:
Permission:
Screen:
Keywords:
```

Add optional:

```text
Guides:
Related:
Difficulty:
Estimated minutes:
```

Example:

```text
# Running Bar Tabs

Section: POS
Roles: Admin, Manager, Server
Permission: pos.sell
Screen: pos
Keywords: tabs, orders, barcode, round
Guides: pos.first-sale, pos.barcode-scan
Related: 11-cash, 12-mpesa, 13-card
Difficulty: basic
Estimated minutes: 5
```

`build-help-index.mjs` compiles them into JSON.

---

# 32. Do not duplicate documentation inside React

The authority remains:

```text
docs/user-guide/*.md
         ↓
scripts/build-help-index.mjs
         ↓
src/generated/help-index.json
         ↓
HelpCenterView
```

React displays it.

React should not contain another 40 manually maintained copies.

---

# 33. Help Center home dashboard

Transform the initial Help Center state into:

```text
SERVOS HELP CENTER

Good evening, Jane
Bar Operator

Training
────────────────────
3 of 5 recommended guides complete
██████████████░░░░

Continue
Make your first sale
Step 4 of 6

Recommended
• Barcode scanning
• M-Pesa payments

Browse
• POS
• Inventory
• Rooms
• Operations
• Administration
• Troubleshooting

Search
[ How can we help?                     ]
```

Article mode remains available.

---

# 34. Help article actions

A relevant article should expose:

```text
[ Open workspace ]
[ Start guided walkthrough ]
```

For example:

```text
Inventory Overview

[ Open Inventory ]
[ Start Inventory Basics ]
```

A troubleshooting article might instead expose:

```text
[ Open Sync Status ]
```

Contextual actions should come from metadata or the guidance registry, not hardcoded article titles.

---

# 35. Improve existing context help

`NativeBarShell` already has an excellent seed:

```text
? → current route help query
```

Turn that into:

```text
? 
↓
Context Help
↓
Current screen
Related articles
Related tours
Troubleshooting
Keyboard shortcuts
```

Example:

```text
BAR POS HELP

Running Bar Tabs
Barcode Scanning
Cash Payment
M-Pesa Payment
Mixed Tender
Voids & Refunds

Guided training
[ Make your first sale ]
[ Scan an item ]
```

---

# 36. First-login staff onboarding

After the business reaches:

```text
LIVE
```

and an employee successfully unlocks, check guidance state.

If they have never completed:

```text
servos.core
```

display:

```text
Welcome to ServOS, Jane

Access profile
Bar Operator

You currently have access to:
• Bar POS
• Bar Pass
• Help

Recommended training
ServOS Basics          2 min
Make Your First Sale   4 min
Barcode Scanning       2 min

[ Start ServOS Basics ]
[ Explore on my own ]
```

Do not force a lengthy blocking wizard.

---

# 37. “Explore on my own” is not “complete”

Maintain distinct states.

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
DISMISSED
```

Dismissal is not completion.

That preserves useful recommendations later without harassing the user immediately.

---

# 38. Recommendations derive from capabilities

Create:

```ts
recommendGuides(actor, businessState)
```

Examples:

```text
pos.sell
→ servos.core
→ pos.first-sale
→ pos.barcode-scan

mpesa.record
→ payments.mpesa

inventory.count
→ inventory.stocktake

inventory.transfer
→ inventory.transfer

rooms.operate
→ rooms.frontdesk

rooms.manage
→ rooms.configuration

folio.manage
→ folios.operations

assets.operate
→ assets.lifecycle

maintenance.manage
→ maintenance.workflow

till.close
→ close-day.manager

data.import.execute
→ admin.csv-import

backup.create
→ admin.backup
```

---

# 39. Core ServOS tour

First guide to implement:

```text
servos.core:v1
```

Potential steps:

1. Current workspace title.
2. Main navigation.
3. Connectivity indicator.
4. Pending sync count.
5. Context Help.
6. Lock/change staff.
7. Role and authenticated-session identity.
8. POS entry point.

Keep it under roughly two minutes.

The purpose is orientation, not encyclopedic training.

---

# 40. POS first-sale guide

Second guide:

```text
pos.first-sale:v1
```

Suggested workflow:

```text
Open POS
   ↓
Select outlet/service area
   ↓
Quick Tab
   ↓
Select / scan product
   ↓
Review line
   ↓
Fire round
   ↓
Review total
   ↓
Pay
   ↓
Receipt
```

Relevant anchors from the current POS implementation should include:

```text
pos.outlet
pos.quick-tab
pos.named-tab
pos.search
pos.scanner-test
pos.tables
pos.products
pos.active-tab
pos.order-items
pos.total
pos.fire
pos.pay
pos.split
pos.room-charge
pos.discount
pos.transfer
pos.void
```

---

# 41. POS event progression

Guide step:

```text
Open a quick tab
```

waits for:

```text
order.create
```

Guide step:

```text
Add an item
```

waits for:

```text
order.addItem
```

Guide step:

```text
Fire the round
```

waits for:

```text
order.fire
```

Guide step:

```text
Take payment
```

waits for:

```text
payment.record
```

or:

```text
payment.split
```

Guide step:

```text
Review receipt
```

detects receipt modal or recorded receipt.

---

# 42. Protect production data during training

A critical improvement is to distinguish:

```text
GUIDED LIVE OPERATION
```

from:

```text
TRAINING SANDBOX
```

For first implementation, guides operate against real workflows but clearly state:

> Continue with a real transaction when you are ready.

They do **not** invent sample transactions.

Later, a dedicated training mode could use:

```text
TRAINING
```

records or an isolated demo business.

Do not silently mix fake sales into live accounting merely to make a tour look interactive.

---

# 43. Barcode-scanner guide

The current POS already has a non-destructive:

```text
Test scanner
```

This is perfect training material.

Create:

```text
pos.scanner-basics
```

Sequence:

```text
Open Bar POS
↓
Locate Test scanner
↓
Activate scanner test
↓
Scan any barcode
↓
Show received value
↓
Explain difference between scanner test and adding a sale
↓
Show Search / Scan field
```

This can be truly interactive without affecting stock or sales.

---

# 44. Inventory guidance

Potential guides:

```text
inventory.basics
inventory.stocktake
inventory.transfer
inventory.waste
inventory.stock-history
```

Anchors:

```text
inventory.summary.value
inventory.summary.low
inventory.summary.out
inventory.search
inventory.status-filter
inventory.location-filter
inventory.item-list
inventory.item-detail
inventory.movements
inventory.count
inventory.transfer
inventory.waste
```

---

# 45. Stocktake guide

Interactive sequence:

```text
Open Inventory
↓
Select stock item
↓
Choose Count
↓
Select location
↓
Scan or enter quantity
↓
Review expected quantity
↓
Review variance
↓
Enter reason
↓
Commit
↓
Confirm movement recorded
```

Important instructional point:

```text
Scanning is draft input.
Submitting Count changes inventory.
```

This directly reinforces the existing documentation model.

---

# 46. Procurement guide

Potential guides:

```text
procurement.requisition
procurement.receiving
procurement.payables
```

This should explicitly teach the separation between:

```text
request
purchase
receipt
payable
payment
```

because those are operationally easy to confuse.

---

# 47. Room configuration guide

For users with:

```text
rooms.manage
```

provide:

```text
rooms.setup
```

Topics:

```text
Room type
↓
Room
↓
Rate plan
↓
Room availability concepts
↓
Blocks
↓
Out-of-order
```

This should be partly explanatory because misconfiguration can have large downstream effects.

---

# 48. Front desk guide

For:

```text
rooms.operate
```

create:

```text
frontdesk.reservation-to-checkout
```

Eventually:

```text
Search availability
↓
Reservation
↓
Guest
↓
Check-in
↓
Folio
↓
Accommodation posting
↓
Settlement
↓
Checkout
```

This can become one of ServOS's flagship interactive SOPs.

---

# 49. Housekeeping guide

The current state transition is naturally teachable:

```text
DIRTY
  ↓
CLEANING
  ↓
INSPECTION
  ↓
CLEAN
```

Create:

```text
housekeeping.room-turnover
```

The tour can visually show:

- current state;
- action button;
- next state;
- blocked reservation implications;
- out-of-order distinction.

---

# 50. Folio training

Potential:

```text
folios.basics
folios.deposit
folios.accommodation
folios.adjustments
folios.settlement
```

Training must explain that a folio represents money and should therefore never casually encourage trial operations.

Use explanatory steps before real action steps.

---

# 51. Assets guides

Potential:

```text
assets.register
assets.assign
assets.transfer
assets.inspect
assets.retire
```

Teach the crucial invariant:

```text
Editing asset metadata
≠
moving the asset.
```

Location changes should happen through the explicit transfer workflow.

---

# 52. Maintenance guide

Create:

```text
maintenance.workflow
```

Sequence:

```text
Report
↓
Assign
↓
Start
↓
Parts / service
↓
Complete
```

Highlight that completion may:

- consume inventory;
- create expense journals;
- create supplier payable records.

This is a perfect example of guidance needing to explain business consequences, not merely button positions.

---

# 53. M-Pesa guidance

Create:

```text
payments.mpesa
payments.mpesa-reconciliation
```

Cover:

- correct account;
- transaction code;
- amount;
- received time;
- confirmation;
- reconciliation;
- duplicate handling;
- difference between recording and reconciliation.

Do not imply Daraja integration exists where current flows are manual.

---

# 54. Refund guide

Create:

```text
payments.refund
```

Teach explicitly:

```text
Refund reverses money/accounting.
It does not automatically restore ingredient stock.
```

That existing business rule belongs prominently inside the guided workflow.

---

# 55. Close Day guide

One of the most important manager guides:

```text
operations.close-day
```

Sequence should follow the actual close workflow, covering:

- open tills;
- expected cash;
- counted cash;
- variance;
- M-Pesa;
- unresolved payments;
- manager approval if relevant;
- close generation;
- resulting evidence/report.

This guide should only be recommended to staff with:

```text
till.close
```

---

# 56. Import Center guide

CSV import is complex enough to deserve guided onboarding:

```text
admin.csv-import
```

Teach:

```text
Choose correct template
↓
Stage
↓
Validate
↓
Review errors
↓
Plan
↓
Apply
↓
Review result
```

Critically:

```text
Stage ≠ Apply.
```

That distinction should be visible in the guide.

---

# 57. Hardware guidance

ServOS should eventually have dedicated hardware guidance:

```text
hardware.receipt-printer
hardware.barcode-scanner
hardware.cash-drawer
```

The scanner guide can already be interactive.

Printer training can use:

```text
runtime.testPrinter()
```

without fabricating a sale.

---

# 58. Terminal acceptance integration

Terminal acceptance and guidance should connect.

Example:

```text
Scanner evidence missing
```

could expose:

```text
[ Run scanner setup guide ]
```

Similarly:

```text
Printer evidence missing
→ [ Test receipt printer ]
```

This makes acceptance not merely a checklist but a guided commissioning process.

---

# 59. Guidance registry

All guides should register through one source:

```ts
guidanceRegistry.registerModule({
  id: 'pos',

  anchors: POS_ANCHORS,

  guides: [
    firstSaleGuide,
    barcodeGuide,
    paymentGuide
  ]
});
```

And:

```ts
guidanceRegistry.registerModule({
  id: 'inventory',

  anchors: INVENTORY_ANCHORS,

  guides: [
    inventoryBasicsGuide,
    stocktakeGuide,
    transferGuide
  ]
});
```

The Help Center, onboarding, recommendations and validation all consume this registry.

---

# 60. Module-based registration

This becomes particularly useful as ServOS continues growing.

Conceptually:

```text
Module installed
      ↓
routes
permissions
guides
articles
anchors
training
```

A future Laundry or Spa module could register its own guidance without editing a giant central switch statement.

---

# 61. Build-time guidance manifest

Generate:

```text
src/generated/guidance-manifest.json
```

containing:

```json
{
  "guides": [],
  "anchors": [],
  "articleLinks": [],
  "screens": [],
  "permissions": []
}
```

This provides a machine-readable product education inventory.

---

# 62. Upgrade `docs-check.mjs`

Add validation rules.

The build should fail if:

- guide ID is duplicated;
- guide version is invalid;
- guide step ID is duplicated;
- permission doesn't exist;
- related article doesn't exist;
- article references unknown guide;
- guide references unknown screen;
- required target anchor isn't registered;
- prerequisite guide doesn't exist;
- circular prerequisites exist.

Example failure:

```text
GUIDANCE ERROR:
inventory.stocktake
step commit-count
references unknown anchor:
inventory.submit-count
```

Much better to catch this during development than at a live terminal.

---

# 63. Upgrade `audit-ui.mjs`

The current script inventories buttons, inputs, selects and handlers.

Extend generated rows with:

```text
guideAnchor
guideReferences
helpArticle
```

Possible output:

```json
{
  "file": "src/native/NativePOSView.tsx",
  "line": 82,
  "kind": "button",
  "guideAnchor": "pos.quick-tab",
  "guideReferences": [
    "pos.first-sale"
  ]
}
```

Eventually this provides:

```text
1,682 UI interactions
347 guidance-eligible
212 anchored
135 intentionally unanchored
```

That is a meaningful UX coverage metric.

---

# 64. Guidance coverage report

Generate:

```text
docs/generated/GUIDANCE_COVERAGE.json
```

and perhaps:

```text
docs/GUIDANCE_COVERAGE.md
```

Report by module:

| Module | Articles | Guides | Anchors | Interactive flows |
|---|---:|---:|---:|---:|
| POS | 8 | 3 | 15 | 2 |
| Inventory | 5 | 4 | 12 | 3 |
| Rooms | 5 | 3 | 14 | 2 |
| Assets | 3 | 2 | 10 | 1 |

This makes product education measurable.

---

# 65. Development validation mode

In development, expose a special overlay:

```text
GUIDANCE DEBUG
```

that can display every registered anchor.

Example:

```text
[pos.quick-tab]
[pos.search]
[pos.fire]
[pos.pay]
```

This makes tour authoring dramatically easier.

---

# 66. Guide preview tool

Inside development builds or Admin settings:

```text
Guidance Developer
──────────────────

Guide:
POS First Sale v1

[ Start ]
[ Jump to step ]
[ Reset progress ]
[ Show anchors ]
[ Validate targets ]
```

Do not expose it to ordinary staff.

---

# 67. Versioning policy

Every guide has:

```ts
version: number
```

Increment version when:

- workflow meaningfully changes;
- critical steps change;
- target architecture changes significantly;
- employee retraining is warranted.

Do not increment because of copy punctuation.

Example:

```text
pos.first-sale:v1 COMPLETE

Major checkout redesign

pos.first-sale:v2 NOT_STARTED
```

That allows intelligent retraining.

---

# 68. Optional migration strategy

When a new guide version is released, classification can be:

```text
REQUIRED_RETRAIN
RECOMMENDED_REVIEW
NO_RETRAIN
```

Later.

For the first implementation, new versions simply appear as new progress records.

---

# 69. Training states

Use consistent state language:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
DISMISSED
```

Optionally later:

```text
EXPIRED
RECOMMENDED_REVIEW
```

Avoid ambiguous:

```text
done = true
```

---

# 70. Completion semantics

A guide completes when:

```text
all required steps complete
```

Optional steps may be skipped.

Guide progress must not complete simply because the user closed the final card.

For interactive guides, required domain events must have occurred.

---

# 71. Resume behavior

If user exits during:

```text
Step 4/7
```

next time:

```text
Continue "Make Your First Sale"
Step 4 of 7
```

But route-sensitive guides should first verify whether the saved step still makes sense.

If not, navigate to the appropriate workspace.

---

# 72. Postponement

Allow:

```text
Later today
Tomorrow
Don't remind me automatically
```

Internally:

```text
dismissed_until
```

Do not bombard busy bar staff mid-service.

---

# 73. Context-aware prompting

Do not automatically start tours simply because they exist.

Examples of good prompts:

```text
First staff login
→ ServOS Basics

User opens Inventory for first time
→ subtle "Take Inventory tour"

Scanner configured during intake
→ suggest scanner guide

First access to Close Day
→ suggest close-day walkthrough
```

No random popup confetti during dinner service.

---

# 74. Training Center

Help Center can include:

```text
Training
```

tab.

Possible UI:

```text
YOUR TRAINING

Required
✓ ServOS Basics

Recommended
✓ First Sale
○ Barcode Scanning
○ M-Pesa Payment

Available
Stock Basics
Front Desk
Assets

Completed
3 guides
```

---

# 75. Role-specific dashboard examples

### Server / Bar Operator

Recommended:

```text
ServOS Basics
First Sale
Barcode Scanning
Cash Payment
M-Pesa Payment
Tables
Bar Pass
```

### Manager

Additional:

```text
Inventory
Stocktake
Transfer & Waste
Refunds
Close Day
Procurement
Reports
Manager approvals
```

### Admin

Additional:

```text
Staff
Imports
Business settings
Backup
Terminal acceptance
Assets
Room configuration
```

Again, capability filtering is authoritative.

---

# 76. Search improvements

The Help Center search currently searches article metadata and content.

Extend search across:

```text
articles
guide titles
guide descriptions
step titles
keywords
permissions
screens
```

Searching:

```text
barcode
```

could return:

```text
GUIDES
Barcode Scanner Basics

ARTICLES
Running Bar Tabs
Inventory Overview
CSV Import

SCREENS
Bar POS
Catalog
Inventory
```

---

# 77. Search synonyms

Add a small synonym dictionary.

Examples:

```text
till → cash drawer, cash, shift
stocktake → stock count, inventory count
bill → tab, order
mpesa → m-pesa, mobile money
room booking → reservation
asset → equipment
```

This significantly improves help usability without AI dependencies.

---

# 78. Error-to-help mapping

This is a major future improvement.

Known native errors could expose:

```text
[ Learn how to fix this ]
```

Example:

```text
Barcode 616... is not assigned
```

Links to:

```text
Catalog barcode setup
```

Another:

```text
Manager approval required
```

Links to:

```text
Manager approval guide
```

Maintain a registry:

```ts
errorHelpRegistry.register({
  match: /manager approval/i,
  articleId: 'rbac',
  guideId: 'manager.approvals'
});
```

---

# 79. Contextual micro-help

Not everything deserves a tour.

Add tiny reusable:

```tsx
<ContextHint articleId="..." />
```

for high-risk concepts such as:

```text
Stock variance
Room turnaround
Refund
Void
Comp
Reconciliation
Expected cash
Physical barcode
SKU
```

This complements full guides.

---

# 80. Safety around destructive operations

Guidance must never:

- auto-confirm refunds;
- auto-submit voids;
- auto-close a till;
- auto-adjust stock;
- auto-check out a guest;
- auto-dispose an asset;
- auto-apply an import.

It can:

```text
navigate
highlight
explain
wait for action
observe success
```

But final business intent remains human.

---

# 81. Audit strategy

Do not flood the business audit ledger with:

```text
Viewed Step 3
Viewed Step 4
```

That would create noise.

Keep detailed progression in `guidance_progress`.

Potentially audit only meaningful events:

```text
required training completed
required training reset
mandatory retraining assigned
```

If ServOS later needs compliance-style certification.

---

# 82. Analytics without cloud dependency

Locally derive:

```text
completion %
most abandoned step
average guide duration
guides never launched
```

Cloud analytics can be added later.

Do not make telemetry a prerequisite.

---

# 83. Future AI Help integration

The structured Guidance Registry also creates a safe future AI assistant foundation.

Instead of an AI hallucinating workflows, it can retrieve:

```text
help articles
guide definitions
permissions
current screen
```

and answer:

> How do I record waste?

with authoritative ServOS documentation.

That should be later.

The deterministic Help Center remains the source of truth.

---

# 84. Phase implementation roadmap

## G00: Baseline & specification

Create:

```text
docs/GUIDANCE_SYSTEM.md
docs/GUIDANCE_IMPLEMENTATION_PLAN.md
```

Document:

- architecture;
- terminology;
- progress semantics;
- permissions;
- event model;
- anchor conventions;
- testing.

No runtime behavior changes yet.

### Acceptance

```text
npm run docs:check
```

passes.

---

## G01: Core types & registry

Add:

```text
src/guidance/core/*
```

Implement:

- definitions;
- registry;
- eligibility;
- anchor IDs;
- validation.

No UI overlay yet.

### Acceptance

Unit tests verify:

- duplicate guide rejection;
- duplicate step rejection;
- permission filtering;
- prerequisites.

---

## G02: Anchor layer

Implement:

```text
TourAnchor
anchor registry
useGuideTarget
```

Instrument only:

```text
NativeBarShell
```

initially.

Anchors:

```text
navigation.*
shell.help
shell.sync
shell.lock
shell.status
shell.actor
```

### Acceptance

Debug output identifies every shell anchor.

---

## G03: Tour renderer

Build:

```text
GuidedTour
TourSpotlight
TourCard
```

Support:

- Next;
- Back;
- Skip;
- Close;
- progress;
- target placement;
- scroll;
- responsive repositioning;
- missing target;
- keyboard;
- accessibility.

### Acceptance

Static mock guide works across desktop/mobile layouts.

---

## G04: Navigation adapter

Implement cross-workspace steps using current hash routing.

### Acceptance

One test guide can navigate:

```text
POS
→ Inventory
→ Help
```

without knowing implementation details.

---

## G05: Native persistence

Add:

```text
010_guidance.sql
```

and backend guidance state operations.

Add runtime APIs.

### Acceptance

```text
Start guide
→ close app
→ restart
→ login
→ guide resumes
```

Different staff accounts must have different progress.

---

## G06: Core ServOS orientation

Create:

```text
servos.core:v1
```

Integrate first-login prompt.

### Acceptance

Admin, Manager and Server each see only available controls.

---

## G07: Help Center convergence

Extend help index metadata.

Add:

- training dashboard;
- guide launchers;
- related articles;
- related guides;
- progress;
- open-workspace actions.

### Acceptance

Help remains fully offline.

---

## G08: POS instrumentation

Add semantic anchors to `NativePOSView.tsx`.

Create:

```text
pos.first-sale
pos.scanner-basics
```

### Acceptance

Scanner guide works without modifying sale.

First-sale guide advances through committed commands.

---

## G09: Guidance event bridge

Extend the runtime command wrapper to expose successful command metadata to GuidanceProvider.

Do not change business command semantics.

### Acceptance

Guide automatically advances after successful:

```text
order.create
order.addItem
order.fire
payment.record
```

and does not advance on command failure.

---

## G10: Inventory training

Instrument:

```text
NativeInventoryView
```

Create:

```text
inventory.basics
inventory.stocktake
inventory.transfer
inventory.waste
```

### Acceptance

Count completion waits for actual inventory command success.

---

## G11: Payments & close-day

Instrument:

```text
M-Pesa
refunds
close-day
```

Focus heavily on consequences and approvals.

---

## G12: Hospitality

Instrument:

```text
Rooms
Front Desk
Housekeeping
Folios
```

Create end-to-end guides for reservation and room turnover.

---

## G13: Assets & maintenance

Instrument:

```text
Assets
Maintenance
```

Teach dedicated lifecycle commands and accounting effects.

---

## G14: Imports & administration

Instrument:

```text
Import Center
Staff
Business Admin
Backup
Terminal Acceptance
```

---

## G15: Verification tooling

Extend:

```text
docs-check.mjs
audit-ui.mjs
```

Create:

```text
tests/guidance-registry.test.mjs
tests/guidance-source.test.mjs
tests/guidance-permissions.test.mjs
tests/guidance-help-links.test.mjs
```

Plus native tests.

---

## G16: Playwright tour tests

Test:

```text
launch
navigation
spotlight
missing anchor
responsive target
completion
restart/resume
```

The actual terminal backend remains separately tested.

---

# 85. Required automated test matrix

| Area | Required evidence |
|---|---|
| Registry | IDs unique |
| Versioning | positive integer versions |
| Anchors | referenced anchors registered |
| Screens | route exists |
| Permissions | permission exists |
| Eligibility | inaccessible guides excluded |
| Progress | persists per staff |
| Resume | saved step restored |
| Completion | required steps enforced |
| Missing target | no deadlock |
| Mobile | visible anchor selected |
| Desktop | sidebar anchor selected |
| Navigation | target screen opens |
| Commands | advance only after success |
| Failure | failed command does not advance |
| Help | linked article exists |
| Offline | tour/help/progress still work |
| Restart | local state survives |
| Lock | next staff gets their own progress |

---

# 86. Performance requirements

Guidance should be nearly invisible when inactive.

No:

```text
permanent 400ms polling
large runtime libraries
network dependency
heavy DOM scanning
```

Inactive cost should be approximately:

```text
provider state
anchor map
event listeners
```

Observers activate only while a guide needs them.

---

# 87. Bundle strategy

No need to add React Joyride, Intro.js, Shepherd or similar.

ServOS already uses:

```text
React
Motion
Tailwind
Lucide
```

Everything needed to build a lightweight owned renderer already exists.

That avoids another dependency becoming architectural glue.

---

# 88. Design language

Use existing ServOS styling:

```text
slate background
amber active state
rounded panels
strong operational typography
compact terminal controls
```

Guidance should feel native, not imported.

Suggested treatment:

```text
amber spotlight
subtle dim overlay
dark instructional card
white title
slate explanatory copy
amber progress marker
```

Use motion sparingly.

Busy operational software should feel calm.

---

# 89. Tour card anatomy

```text
┌───────────────────────────────────┐
│ POS BASICS                  2 / 6 │
│                                   │
│ Add an item                       │
│                                   │
│ Select a product from the catalog │
│ or scan its barcode.              │
│                                   │
│ Waiting for an item to be added…  │
│                                   │
│ ▬▬▬▬▬▬▬░░░░░░░░░░░                │
│                                   │
│ Back                 End training │
└───────────────────────────────────┘
```

For manual steps:

```text
Back                     Next
```

For event-driven steps:

```text
Waiting for action…
```

---

# 90. Make progress visible without turning ServOS into a game

Useful:

```text
3/5 training modules complete
```

Not useful:

```text
+500 XP! Inventory Wizard!
🔥 7-day streak!
```

This is operational software.

Competence should feel satisfying without becoming carnival UI.

---

# 91. Guide authoring standards

Every guide should answer:

```text
What is the user learning?
Who is it for?
What permission is required?
What prerequisite knowledge exists?
Which screen does it use?
Which anchors are needed?
Which actions are informational?
Which operations must commit?
What can go wrong?
What article explains the details?
What proves completion?
```

No guide should be merged without those answers.

---

# 92. Documentation authoring standards

Every guide should have supporting documentation when it teaches a business procedure.

The relationship becomes:

```text
GUIDE
"Do this"

ARTICLE
"Here is why and what it means"
```

A tour is not a substitute for documentation.

Documentation is not a substitute for training.

Together they become much stronger.

---

# 93. Recommended initial guide set

Do **not** instrument the entire system immediately.

Ship the first five:

```text
1. servos.core
2. pos.first-sale
3. pos.scanner-basics
4. inventory.basics
5. inventory.stocktake
```

These five prove almost every architectural concern:

- shell navigation;
- permissions;
- responsive anchors;
- documentation links;
- static guidance;
- event-driven guidance;
- scanner events;
- transaction success;
- local persistence;
- resume;
- Help Center integration.

Once those are solid, expanding the catalogue becomes mostly content and anchors.

---

# 94. First milestone definition

### Guidance Foundation Alpha

Complete when:

```text
✓ GuidanceProvider exists
✓ registry exists
✓ anchors exist
✓ overlay works
✓ shell navigation works
✓ permissions work
✓ per-staff SQLite progress works
✓ ServOS Basics works
✓ Help Center launches it
✓ mobile + desktop supported
✓ restart/resume works
✓ docs-check validates registry
```

No business commands need modification beyond safe event observation.

---

# 95. Second milestone definition

### Interactive Training Beta

Complete when:

```text
✓ POS is instrumented
✓ First Sale guide exists
✓ successful commands emit guidance events
✓ failed commands do not advance
✓ Scanner Basics works
✓ POS documentation links to guides
✓ progress shown in Help Center
```

This is the moment ServOS crosses from “tour software” into actual embedded training.

---

# 96. Third milestone definition

### Operational Guidance v1

Complete when:

```text
POS
Inventory
Payments
Close Day
Rooms
Front Desk
Housekeeping
Assets
Maintenance
Imports
Admin
```

all have at least one task-oriented guide where appropriate.

---

# 97. Improvements over KKA to carry forward

The KKA architecture gives us the right foundation, especially its semantic DOM contract, global launch state, role-aware recommendations, server-side progress and searchable operational manual.

ServOS should improve it by adding:

| KKA approach | ServOS evolution |
|---|---|
| raw `targetSelector` | typed semantic anchors |
| fixed spotlight tracking | observer-based target engine |
| mainly informational | transactional event-driven training |
| one global tour completion | guide/version progress |
| onboarding loosely connected to tours | unified registry |
| route changes | formal navigation adapter |
| hidden targets can fail | explicit target fallback |
| role tracks | permission-driven eligibility |
| static fixed popover | target-aware placement |
| generic server persistence | offline native SQLite |
| Help content inside component | compiled markdown authority |
| help checklist indexes | stable semantic IDs |
| manual step advance | business-success advance |
| tours + help | onboarding + tours + SOP + contextual help + training |

---

# 98. Repository-specific files likely to change

### New

```text
src/guidance/**
src-tauri/migrations/010_guidance.sql
docs/GUIDANCE_SYSTEM.md
docs/GUIDANCE_IMPLEMENTATION_PLAN.md
tests/guidance-*.test.mjs
```

### Core modifications

```text
src/native/NativeBarShell.tsx
src/native/HelpCenterView.tsx

src/runtime/RuntimeProvider.tsx
src/types/runtime.ts

src-tauri/src/store.rs
src-tauri/src/lib.rs
src-tauri/src/tests.rs

scripts/build-help-index.mjs
scripts/docs-check.mjs
scripts/audit-ui.mjs
```

### Progressive instrumentation

```text
src/native/NativePOSView.tsx
src/native/NativeInventoryView.tsx
src/native/NativeProcurementView.tsx
src/native/NativeRoomsView.tsx
src/native/NativeFrontDeskView.tsx
src/native/NativeHousekeepingView.tsx
src/native/NativeFoliosView.tsx
src/native/NativeAssetsView.tsx
src/native/NativeOperationsViews.tsx
src/native/NativeImportCenterView.tsx
src/native/NativeAdmin...
```

---

# 99. Things the guidance work must not destabilize

The implementation should preserve existing invariants around:

```text
native business command authority
SQLite offline authority
manager approval
audit evidence
outbox sequencing
payment idempotency
inventory movements
folio accounting
room lifecycle
asset lifecycle
imports
terminal acceptance
receipt delivery
```

Guidance observes and educates.

It must not become another business-logic layer.

---

# 100. End-state product experience

A newly hired bartender should eventually be able to:

```text
Unlock ServOS
↓
See only relevant modules
↓
Take a 90-second orientation
↓
Start "Make Your First Sale"
↓
Open an actual tab
↓
Scan/add an item
↓
Fire it
↓
Take payment
↓
Print receipt
↓
ServOS confirms training completion
↓
Help Center recommends scanner/M-Pesa training
```

A manager gets:

```text
Inventory
Stocktake
Refunds
Close Day
Procurement
Reports
```

A front-desk employee gets:

```text
Reservations
Check-in
Folios
Housekeeping coordination
Checkout
```

An administrator gets:

```text
Staff
Imports
Business configuration
Backup
Terminal acceptance
Assets
```

All from the same engine.

---

# 101. Strategic outcome

At maturity, ServOS should not need a trainer standing beside every deployment explaining:

> “Click this, then this, but don't click that.”

The software itself should contain the operational memory of the product.

The resulting architecture becomes:

```text
                SERVOS DOMAIN AUTHORITY
                         │
              permissions / commands
                         │
                         ▼
                 GUIDANCE REGISTRY
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
     Guides            Help            Context
       │              Articles            │
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                 GuidanceProvider
                         │
           ┌─────────────┼─────────────┐
           │             │             │
          POS        Inventory       Rooms
           │             │             │
           └─────────────┼─────────────┘
                         │
                committed commands
                         │
                         ▼
                  Tauri / SQLite
                         │
                  staff progress
```

That is a much more valuable system than a collection of onboarding tooltips.

It means **documentation, application state, permissions, training and real workflows all describe the same product**.

And because the mechanism is generic while the definitions remain ServOS-specific, this becomes the architecture we can eventually extract and reuse across KKA and subsequent ERP/CRM/business-system builds.
