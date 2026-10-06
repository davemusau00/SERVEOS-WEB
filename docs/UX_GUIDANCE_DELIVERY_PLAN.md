# ServOS UX and Guidance Delivery Plan

Updated: 2026-09-28  
Status: coordination plan; source UX and Guidance specifications remain authoritative for their own requirements.

## Purpose and source ownership

This document sequences the two existing product plans without replacing them:

- [Simple Operations UX](../simple-ux.md) owns task-first navigation, operational workflows, plain language, progressive disclosure, migration compatibility, and business safety requirements.
- `# ServOS Guidance System.md` owns guide definitions and rendering, staff training progress, contextual assistance, the offline Help Center connection, and guidance validation.
- This delivery plan owns dependencies, implementation order, and cross-plan acceptance evidence. Detailed UI or domain contracts stay in their source plan.

The web/native operational parity inventory and the first documentation-first execution step are maintained in [Web parity execution plan](WEB_PARITY_EXECUTION_PLAN.md). That plan extends this coordination layer with the production web lifecycle, platform intake, Help, staff welcome, and tour parity requirements alongside the operational workspace gaps.

Both source documents describe the reviewed `4035337e5d63ba8785e87ba344565cc69c69e68d` checkout. Treat that hash as their original planning baseline, not the current checkout. Verify all proposed capabilities against current source and [release state](CURRENT_RELEASE_STATE.md) before implementation; source presence and staged database tests do not establish production acceptance.

## External review reconciliation — 2026-09-28

A user-supplied review of upstream `main` cites commit `c33762fe29dff5384c61c409979877d9b105bf72`. That remote revision was not fetched in this workspace. The checked-out local `HEAD` at reconciliation is `be83578727d6e0b49fe23c264bc4fb465ffc2a05`, with the current UX implementation changes in the worktree; local source inspection, not the remote commit claim, governs delivery status here.

A follow-up user review sharpened the next priority: product families, physical container variants, and sale formats should precede additional beverage setup; the room and property entry points are improved but their workspaces remain technical; first-login onboarding and operational guides are still absent. The review called recent direct-action verification pending. Since then, the checkout advanced to `1544de44db93946911d89011c5082bff1a3b35a6`, and local verification completed: 79 Node tests, lint, and all 16 browser cases passed, including the item Quick Add route on desktop and mobile. Current evidence below supersedes that pending note. The cited upstream hash remains user-provided and was not fetched.

The review's main architectural assessment aligns with this checkout: task-group navigation and Home are permission-filtered; Help is offline; guide progress uses per-staff local storage; command events are commit-based; new product and stock forms disclose advanced fields progressively; and the domain remains authoritative. The review also calls out work not yet delivered in this checkout:

- Quick Add is still a workspace launcher, not a direct creation action. Creation choices must be filtered by **manage/create** permission, then open the requested form directly.
- Home currently uses the core guide's progress row for every guide card. Resolve progress by each guide ID before adding more guides.
- `GuideStep.route` is declared but not acted on. Add permission-checked route transitions before authoring cross-workspace steps; expand semantic anchors from a central registry and improve resize/keyboard handling before scaling the guide set.
- There is one orientation guide, not role-personalized first-use onboarding or workflow training. Keep onboarding non-blocking and permission-derived; add it only after multi-guide state and deep actions work.
- Inventory still centers its table for browsing; Phase 2 adds a location-first full count. A simple receiving flow remains later workflow work. Product family, physical container variants, and sale formats were the next high-priority model slice; that slice is now implemented and recorded below.
- The existing product, stock, room, and asset creation screens are not all equally simplified. Quick Add may deep-link only to operations that the target screen can safely open; missing prerequisites must produce an actionable setup state, not a false completion.

These points are a reconciled backlog from the supplied review and inspected local files; they do not mean the upstream commit was independently validated.

### Delivered after review reconciliation

- Quick Add choices require `catalog.manage`, `rooms.manage`, or `assets.manage`; selecting a choice adds a route action and opens the relevant create flow. Room setup opens room creation when a type exists, or the required room-type setup when it does not. Asset creation checks for a category and physical place and explains missing prerequisites.
- Home reads each guide card's progress by that guide's ID and version, so one guide cannot incorrectly label another as resumable.
- Guide steps with a route dispatch a shell navigation request. The shell enforces its normal permission-filtered route allowlist and supports an optional action. Anchor tracking observes element resize, and Escape closes the active tour.
- These are local source changes in the current worktree; exact checks and results are recorded in the test evidence document.

### Product model boundary

The delivered implementation is an additive product family and physical-variant layer over existing generic JSON product records. Each sellable variant remains a distinct product record with its own identifier/barcode, optional existing stock-item link, and its own embedded sale portions. Family identity and package metadata group variants without rewriting legacy products or introducing a parallel sale ledger. POS must continue to price and consume stock through the existing committed order commands and frozen ingredient snapshots. The dedicated native `catalog.createWithOpeningStock` command enforces product, stock master, link, and opening movement in one transaction; its UI and local acceptance evidence are recorded under Phase 1.


### Product family and physical variants - implemented slice

The catalog now groups additive physical variants with `productFamilyId`, `productFamilyName`, package type, container quantity/unit, and a canonical variant label. Each size remains its own legacy-compatible product record with its own generated/editable code, optional barcode, optional existing stock link, and existing embedded portions for whole-container and serving formats. The Add another size flow creates within an existing family. Native `record.save` validation requires complete physical metadata, positive quantities and valid portions, rejects duplicate sizes, and prevents reuse of the same stock item inside one family. Existing products without family metadata remain valid.

Order firing continues through the established domain commands. The focused Rust regression creates two stock masters, sets opening quantities through existing inventory commands, saves two physical sizes, rejects duplicate size/stock links, and verifies whole-container and serving portions consume their own committed stock quantities. This does not implement atomic creation of a new stock master and its opening balance; that remains a separate native transaction slice. Receiving and workflow-specific training remain open.

## Current checkout baseline

- The installed Tauri shell now presents grouped, permission-filtered task navigation; the offline Help Center searches generated Markdown articles and can launch the shell tour.
- `RuntimeProvider.command()` returns after the native command commits and refreshes local state. It is the observation point for successful operation events; business command payloads and authorization remain unchanged.
- Native SQLite schema is version 11. Staff identities and expiring sessions are local. Guidance progress and scanner count drafts are staff-scoped local tables, separate from business records and outside the business outbox.
- Implemented foundation: task-group navigation, permission-aware Home/Quick Add destinations, the core shell tour, Help Center tour launch/progress, a native progress table, and commit-only guidance events. The current follow-up adds first-run catalog and inventory empty states plus human-readable common native errors. Detailed task workflows and their guides remain pending.
- The current release ledger remains authoritative for what is implemented and verified. This plan does not claim completion of the web expansion, production rollout, or target-device acceptance.

## Condensed finish train

Remaining Simple Operations work is governed by [the condensed finish train](SIMPLE_OPERATIONS_FINISH_TRAIN.md).

1. **F1 Operations Complete** — Simple Receive Delivery plus receive guide and focused acceptance.
2. **F2 Hospitality + First Use** — Simple Rooms, Property/Report Problem, first-login onboarding and stabilized workflow guides.
3. **F3 Data Intake + Release Hardening** — friendly CSV/paste intake, mapping, usability and target-device acceptance.

Implemented Phases 1–3 remain unchanged. This changes sequencing, not domain safety. Web-v2 authority/cutover remains separate.

## Delivery order

The following eight-phase list is the historical decomposition from the earlier review. Use the condensed finish train above for remaining implementation order. Update phase status only from checked source and executed evidence. Phase 1 is implemented and locally verified; physical-terminal and deployment evidence are not inferred from local tests.

1. **Atomic Add Item + Stock + Starting Quantity (implemented):** `catalog.createWithOpeningStock` creates the sellable product, new stock master, relationship, barcode, and opening movement in one native transaction. It requires both catalog and inventory permissions. Local Rust tests verify rollback, idempotency, one audit/outbox entry, and opening valuation; desktop/mobile browser mocks verify the Quick Add payload. Physical-terminal acceptance remains open.
2. **Location-first Stock Count (implemented; locally verified):** choose a Storage Place, count every active stock item, review match/short/over totals, then submit one native transaction. Draft quantities do not mutate stock. Native commit checks permissions, complete item coverage, and unchanged expected balances; stale or failed writes roll back the count and all adjustments. Scanner-session drafts remain Phase 3.
3. **Continuous Scanner Count Session (implemented; locally verified):** scan stock barcodes/SKUs into a persistent per-staff, per-Storage-Place SQLite draft. Apply `scanUnitQuantity`, preserve unknown codes for explicit assignment or dismissal, resume after restart, then review and submit once through Phase 2's native count command. Draft writes stay outside business records/outbox and never mutate stock. Physical scanner and packaged-terminal acceptance remain open.
4. **Simple Receive Delivery:** collect supplier/reference and scanned line quantities/costs in a simple screen while preserving native GRN, inventory, weighted-cost, payable/journal, approval, and audit behavior.
5. **Simple Rooms + Property:** simplify room and property/asset entry with progressive disclosure and inherited defaults; retain native IDs, prerequisite checks, custody and operational protections.
6. **First-login Staff Onboarding:** non-blocking, per-staff welcome and permission-derived next steps with progress kept separate from business records.
7. **First Sale + Stock Count interactive guides:** author these only after their workflows stabilize; progress moves on matching successful committed commands, never drafts or failures.
8. **Friendly Excel/CSV Import:** provide paste/file import and forgiving column mapping on top of the existing staged, previewed, permission-checked native import path. Preserve dry run, validation, approvals, rollback and row-level evidence.
## Shared interfaces and invariants

- Atomic catalog setup creates native IDs and links the product to its new stock record inside one transaction. The starting container count is converted to the stock base unit before submission. The command emits one audit/outbox result; failures do not leave partial product or stock records.

- Guides are typed data: stable guide/step IDs, version, audience permissions, semantic target IDs, optional route, article reference, interaction mode, and explicit success operations. Guide definitions do not contain arbitrary React callbacks or raw CSS selectors.
- UI anchors use `data-guide-anchor` through a small anchor component; IDs are namespaced by shell or domain. Missing targets produce a readable fallback and never block the operation.
- A committed operation event is emitted only after `runtime.command()` succeeds and includes the operation name and command result. Failure paths emit no success event.
- Native progress reads and writes require a live staff session and derive the staff ID from that session. Progress is resumable per staff member, local-first, excluded from business records/outbox, and survives restart.
- Scanner count drafts use a dedicated native SQLite table keyed by authenticated staff and Storage Place. Draft APIs validate stock IDs and quantities, are unavailable without a live staff session, and do not create business commands, audit rows, or outbox effects. Only confirmed review uses `inventory.countLocation`.
- Guidance can explain and observe operations but cannot grant permissions, execute business commands, or imply provider/payment/sync success.

## Acceptance evidence

- **Foundation:** navigation remains permission-filtered on desktop and narrow layouts; Home and Quick Add only expose eligible destinations; current modules remain reachable; the Help Center and articles continue to work offline.
- **Guidance:** definitions reject duplicate IDs and unknown targets; keyboard users can launch, advance, back, and close a guide; target loss is recoverable; staff progress is isolated and survives restart.
- **Outcome events:** a successful local commit can advance a matching step; command rejection and uncommitted drafts cannot. A refresh error after a committed write must not invite a duplicate transaction or erase the success event.
- **Scanner stock count:** exact SKU/barcode matches increment by the stock item's scan quantity; repeated and unknown codes remain visible in the staff-scoped local draft; a draft survives app restart and is isolated from other staff; stock movements remain absent through scanning/review and occur only through one confirmed, permission-checked count command.
- **Quick Add:** each choice requires the target's real creation permission and opens its form directly. Missing prerequisites show a safe next step.
- **Guide growth:** each Home card reflects its own guide progress; route steps navigate only to permission-allowed workspaces; anchors remain recoverable through resize, mobile layouts, and keyboard close.
- **Quick Add:** each choice requires the target's real creation permission and opens its form directly. Missing target prerequisites show a safe next step.
- **Guide growth:** each Home card reflects its own guide progress; route steps navigate only to permission-allowed workspaces; anchors remain recoverable through resize, mobile layouts, and keyboard close.
- **Each workflow release:** cover existing-record compatibility, permissions, approvals, audit effects, offline commits, and relevant restart/reload behavior with focused native/browser acceptance. Update completion and evidence documents with exact executed results; keep target hardware, live cloud, and deployment claims separate.

## Assumptions

- The two source specifications remain separate and authoritative; this file is the coordination layer.
- Guidance foundation work starts early; workflow guides follow stabilized workflows.
- Current source and release evidence take precedence over the source plans’ older checkout snapshot.
