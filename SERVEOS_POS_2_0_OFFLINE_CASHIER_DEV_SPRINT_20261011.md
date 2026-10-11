# SERVEOS POS 2.0
## Final engineering sprint, acceptance contract and non-destructive VPS deployment runbook

**Prepared:** 2026-10-11  
**Repository:** `davemusau00/SERVEOS-WEB`  
**Audited source:** `reset/vps-platform` at `7a3462292dc3700b9bd0aa978ccf92944fe7fb67`  
**Reference CI:** https://github.com/davemusau00/SERVEOS-WEB/actions/runs/38137610469 (all jobs successful at audited SHA)  
**Target current live installation:** `serveos-next` at `/opt/serveos-next`, PWA `/var/www/serveos-next/current`, API `127.0.0.1:3102`, PostgreSQL volume `serveos_next_data` (confirm before changes)  
**Dedicated existing other stacks:** `sms-platform` and `sms-platform-africa`; static site `detailskilonzo.com`  
**Authority rule:** The production VPS remains the primary business authority. New offline sales are locally recorded and *provisional for central reporting* until reconciled; they must never be displayed as server-confirmed prematurely.

> **WORK ORDER FOR CODING AGENT:** Implement the milestones in order. Preserve all existing operator workflows, data, roles, database history, environment secrets, SSL certificates, Nginx virtual hosts, other Docker Compose projects and production storage. Treat **no production downtime, no silent data loss, no double payment, and no invented settlement** as release blockers. Do not run destructive commands. Never deploy without explicit approval after the specified gates are green.

---

# A. Architecture and operational requirements

## A1. One cashier, many ticket authors

- Exactly **one authoritative checkout terminal** per outlet/installation in v1. It is the only device permitted to accept and record in-person cash, operate the cash till, issue final server-backed receipts, or complete sales. It may be used by cashier accounts with explicit role permissions, but the *device* is enrolled as the dedicated checkout device.
- Waiters and authorized staff log in on phones/tablets and **create order tickets**. They may name a table/customer/order, choose available products, add preparation notes, submit, monitor status and amend/re-submit an unapproved ticket. They cannot record settlement, fire preparation, touch stock or issue a completed-sale receipt.
- Cashier receives a **Tickets (N)** inbox, reviews ticket, adjusts or rejects with reason, and approves. Approval fires only approved lines, consumes/reconciles inventory via the existing POS handler, and generates bar/kitchen preparation outputs *once*.
- Direct cashier transactions skip waiter ticket approval. Tap product -> current bill -> Pay, with minimum round trips and no superfluous editor forms.
- Multiple waiter devices work **online**. In phase 1 of offline support, waiters can only keep personal drafts while internet/API is unavailable. They **must not claim the ticket has reached the cashier** without acknowledgement. Local Wi-Fi ticket delivery is a separate later ServOS Edge milestone, not a condition of the single-terminal cash-sale release.
- Existing rooms, tab, account charge, discounts, refunds, split payments, housekeeping, KDS, stocks, credits and finance functionality remain available in their current authorized screens until explicitly replaced and tested.

## A2. Online + offline have ONE cashier UI

- Normal POS layout is independent of network state. Status appears in a small banner or header. Never show the huge `One offline cash sale` panel once new flow is enabled.
- Uninterrupted consecutive local **cash** sales on the enrolled cashier terminal during outages; no **one-sale / 30-minute** gate, no `BAR`/`KITCHEN` exclusion, no global freeze when an unrelated command is outcome-unknown.
- The operator can use the full cached sellable catalogue, stock rules, inclusive tax, modifiers and portions that have been provisioned. All money computed in integer **minor units** (KES cents). All physical quantities use deterministic fixed-point units (e.g., ml, whole containers), never floating-point money rounding.
- Save each sale atomically and durably: sale snapshot + item IDs + price/tax snapshots + local cash payment entry + provisional stock movements + local receipt/print evidence + same-ID sync outbox entry. If local persistence fails, sale is NOT recorded and the cashier must see a hard failure.
- Local state names: `RECORDED_LOCALLY`, `QUEUED`, `SYNCING`, `SERVER_CONFIRMED`, `OUTCOME_UNKNOWN`, `RECONCILIATION_REQUIRED`. These have distinct meanings. The cashier must see that cash was physically received even if the central ledger has not yet confirmed the sale.
- Offline cash accounting is allowed under a **preprovisioned, signed, enrolled-device capability** (scoped business, cashier device, staff/role, outlet and shift). Authorization is renewable while online and has an explicit validity period and risk policy. Do **not** turn off authorization, assume an expired role is valid indefinitely or accept unsigned/offline forged permissions. Remove an arbitrary *per-sale* quota, not security.
- No automatic assertion that unverified offline **M-Pesa** or bank payments have settled. Support recording a local *customer-claimed* external reference for later reconciliation only, or defer external tender to online mode. Cashier must not label it 'paid/confirmed' until verified against configured evidence. Room charges, credit, refunds and manager overrides remain online-only until individually specified and accepted.
- Printing: local provisional customer slip, local preparation ticket with stable sale/ticket ID and visible `PENDING SYNC` / `NOT FISCAL INVOICE` where applicable. Full receipt and eTIMS/fiscal compliance remain separate evidence gates. An OS print dialog is not proof of physical printing. No automatic duplicate printing on retries.
- Terminal PWA must reopen offline with a provisioned local operator identity, loaded catalogue and local activity. Signing into a previously unused browser requires network. Locally authenticated identity must be secured by a kiosk PIN or equivalent security mechanism: do NOT persist access/refresh tokens or passwords in localStorage or plaintext IndexedDB.

## A3. Non-negotiable scope boundary

The first production offline release supports **one cashier device**. Waiter phones need API reachability to deliver tickets. There is **no promise of offline multi-device stock agreement**. Multiple offline cashier devices, LAN routing, local print servers and server-side multi-master merging are explicitly future work.

---

# B. Source-baseline findings requiring remediation

Audited code artifacts (verified in the live repository at the stated SHA):

| File/module | Actual gap |
|---|---|
| `src/runtime/web/WebApiPosView.tsx` | 264-line tightly composed UI with separately rendered offline sale, till, payment, prep, room charge, credit, detailed order, document queue and numerous advanced forms in one long vertical page. |
| `src/runtime/web/WebApiOfflinePosPanel.tsx` | `maxCommands:1`, `durationMinutes:30`, `pendingEntry` blocks another sale, `['KITCHEN','BAR']` product filter and offline-only separate form. |
| `apps/api/src/offline-pos-commands.mjs` | `order.offlineCashSale` rejects `KITCHEN` and `BAR` route-to; only `COUNTER`/`TAKEAWAY` service destinations; chained create/add/fire/pay in one API command. |
| `apps/api/src/server.mjs` | Grant issuance caps sale to one for up to 30 minutes and rejects broader offline authorization. |
| `src/runtime/web/WebBusinessApp.tsx` | Explicit `navigator.onLine` blocks nearly all POS, payment, till, hospitality operations; any queued `OUTCOME_UNKNOWN` blocks new unrelated actions. |
| `src/runtime/web/BusinessStore.ts` | IndexedDB command queue and bootstrap exist, but there is no full atomic local cashier sale, payment, inventory and print ledger. Grant validation has global maximum 100. |
| `src/runtime/web/sync.ts` | Single sequential queue; `synchronizeStore` stops if earlier command fails. Existing command ID recovery and change feed are useful foundation. |
| `src/runtime/web/apiAuth.ts` | Restores access via API refresh; cold PWA entry needs a separate secure offline identity/session reopening path. |
| `apps/api/src/pos-commands.mjs` | `order.create` and `order.addItem` require `pos.sell`, `order.fire` requires `order.fire`, and these are ONLINE_ONLY. Waiter-specific nonfinancial ticket capability does not yet exist. |
| `src/runtime/web/WebApiPaymentPanel.tsx` | Payment UI depends on a pre-fired order with open, operator/device-owned till. Local provisional cash accounting not present in main POS. |
| `apps/api/src/command-kernel.mjs` | API has durable command IDs, payload hashes, locks and idempotent replay. Preserve these. |
| `apps/api/Dockerfile` | **Broken in repository:** only copies `src`, `migrations`, package files under `/app`; but `src/staff-commands.mjs` imports root `contracts/permissions.json` and `contracts/roles.json`. VPS had a local staged Dockerfile repair to load `/app/contracts/`. Make upstream package path correct and test as nonroot. |
| `scripts/Deploy-ServOSProductionFeatures.ps1` | **Unsafe for current topology:** PWA mode hardcodes `/var/www/serveos-prod`, other modes hardcode `serveos-prod-api-1`, `3101`, old healthcheck and old release paths. Do not execute this unchanged against the new VPS. |
| `scripts/package-pwa-release.mjs` | Requires a clean committed checkout; SHA-bound manifest, SHA-256 asset hashes, immutable release dir. Keep/reuse after parameterizing deployment script. |

**Live diagnostic to resolve before work:** Screenshot shows `Payment confirmed` while order still displays `Paid KES 0 / Balance KES 900`, with one change waiting to sync. This does NOT prove a double charge or data loss, but is a serious UI consistency risk. Inspect exact command ID and terminal outcome in Activity before submitting further payments. Make consistency and recovery acceptance P0.

**Historical production snapshot (as shared):** New `serveos-next-api-1` was healthy at `127.0.0.1:3102`, with migrations `expected=72/applied=72`; PWA staged release `7a3462292dc3`, and first-use account created subsequently. Latest user says deployment succeeded. **Do not infer the current live SHA or containers without a fresh read-only preflight.**

---

# C. Git and deployment workflow: safeguards first

## C0. Start feature branch, never edit the active production checkout

Developer Windows PowerShell:

```powershell
cd 'C:\Users\Admin\Downloads\SERVEOS-RESET'
git status --short
git remote -v
git fetch origin reset/vps-platform
git switch reset/vps-platform
git pull --ff-only origin reset/vps-platform
git switch -c feat/pos2-cashier-tickets-offline
```

**Before branching:** do not discard uncommitted local work. Resolve/stash it explicitly, never `git reset --hard`. The development checkout stays on Windows or an isolated working directory, **not** `/opt/serveos-next/source` if that checkout is used by active deployment tooling.

Establish an implementation contract in `docs/sprint/pos2-offline-cashier.md`. In CI record source SHA, API image digest, migration high-water, PWA manifest digest, database compatibility, flag status and operator acceptance artifacts. All risky features start with default `false` in production runtime configuration.

## C1. Flag design

Recommended server-controlled effective capabilities: `pos2.simpleCashier`, `pos2.waiterTickets`, `pos2.offlineCash`, `pos2.localKitchenTickets`, `pos2.offlineAuthV2`. Scope flags to business/outlet/device/role where relevant. Default OFF for all existing businesses and devices. A flag should be computed and verified by the API and embedded in the authorized business session, not treated as a frontend security check. A PWA build-time flag is insufficient for per-business rollback because SW assets are cached. Avoid flag proliferation: one release phase may activate multiple backend capabilities as a single small cohort.

Rollout states: `LEGACY_ONLINE_ONLY` -> `SIMPLE_UI_ONLINE` -> `WAITER_TICKETS_ONLINE` -> `SINGLE_CASHIER_OFFLINE_PILOT` -> `GENERAL_AVAILABILITY`. A server feature kill switch must not delete or strand locally queued commands; disabling new creation must retain the replay/reconciliation path for existing local IDs.

## C2. Database migration rules

1. SQL **append-only migration names** after current migration 072. Do not edit previously applied migration files or rewrite existing business tables destructively.
2. Use expand-and-contract: add new nullable columns/new ticket and reconciliation tables, indices and constraints that coexist with old code. Backfill separately, with throttling and validation. Do not remove or rename existing fields until the last old API/PWA can no longer use them and all queues are drained.
3. Schema must support **old API + old PWA**, **new API + old PWA**, **new API + new PWA** during cutover; the new PWA with old API is *not* required only if activation prevents it, but should fail gracefully.
4. Never use `docker compose down -v`, `docker volume rm` or recreate the current `serveos_next_data` volume.
5. Migrations must be rehearsed against a disposable restored database and validated for lock duration before production.
6. **Fix migration readiness** to validate expected names/checksums, not just hardcoded count `72`. Readiness must match the active binary's migration manifest while remaining tolerant of authorized later migrations during transition.

---

# D. Detailed implementation sprints and acceptance contracts

## SPRINT 0: Make existing POS trustworthy before refactoring (P0)

**Tasks**
- Reproduce screenshot inconsistency (server-confirmed `payment.record`, order projection still amountPaid=0 and pending change); trace returned `ApiCommandOutcome`, `synchronizeStore`, change-feed application, stale React record state, and duplicate prevention. Only display `Confirmed by server` if confirmed payment ID/receipt and current projection agree, otherwise `Recorded, updating display` with original-command recovery link.
- Replace broad unknown-outcome global blocking with *per-aggregate* blocking for current online operations; retain conservative behavior for affected order/till. Do not enable unrelated offline operations yet. Keep conflict evidence.
- Add tests that replay a timed-out payment with the **same** command ID and identical payload; ensure settlement once. Simulate stale response and UI refresh.
- Verify current importer-generated products at Countryside: 73 sellables, 72 stock masters as last seen; no duplicate SKU creation. Validate there is one consistent till owner.
- Capture baseline `health/ready`, navigation, current database migration head, current operator role, `git sha`, queue size, DB backup timestamp.

**Accept:** repeated payment retry cannot create second settlement; 900-KES sale shows paid/balance consistent after server confirmation; outstanding queue status is explicit; previous online operations unaffected.

## SPRINT 1: Simplify cashier POS, no backend behavior change (P0)

**Build**
- Replace monolithic `WebApiPosView.tsx` render tree with container and small components, suggested files: `src/runtime/web/pos2/CashierWorkspace.tsx`, `ProductSearchGrid.tsx`, `OrderBasket.tsx`, `PaySheet.tsx`, `TicketsInbox.tsx`, `ShiftHeader.tsx`, `PosMoreMenu.tsx`, `PosConnectivityBadge.tsx`.
- Desktop: top row venue/outlet, shift indicator, network state, waiting-ticket count; center product search/category/favorites; fixed-right visible active bill. Keep total and Pay button always on screen. Mobile/tablet: product view with sticky basket/pay drawer, touch targets >=44 px.
- **Single tap** product adds it at qty 1 (or starts immediate counter order); repeat tap increments. Optional modifiers/portion show a small sheet **only when product requires a choice**. Barcode scanner auto adds exact unique match, with disambiguation on multiple matches.
- One primary action `Pay KES n`. In PaySheet choose Cash, M-Pesa, Split, More. Cash: tendered amount + live change. M-Pesa: actual reference/received amount/time/verification policy. More contains charge room, customer account, discounts, etc. Out-of-scope actions must not vanish for authorized legacy users; route them to existing advanced screens.
- Use compact order tabs `New sale`, `Tickets`, `Held`, `History`; hide advanced form proliferation behind `More`. Remove separate favorite buttons and reduce redundant order name input; use automatic user-friendly sale ID and optional rename.
- Preparation pass remains in KDS view; till cash in/out/close moves to Shift header dialog.
- Replace disabled without reason with contextual tooltip/message. Preserve keyboard Tab focus, screen reader roles, high contrast, input validation, ESC handling, and 80mm-friendly print styles.
- Preserve all existing API commands and order revision rules for this sprint. Feature flag `pos2.simpleCashier` OFF by default.

**Acceptance tests:** 73 products searchable; tap and barcode; two-tap qty; quick add; open tab; create/fire/pay; change; cash/M-Pesa split; room charge/credit More; scanner keyboard focus; 1366x768, 1024x768 and 390x844 viewports; legacy POS screenshot/regression unchanged when flag off. Main cashier flows do not require vertical scrolling.

## SPRINT 2: Waiter ticket proposals -> cashier approvals (P0)

**New domain proposal**
- Add additive table(s): `pos_ticket_submissions` with `business_id`, `ticket_id UUID`, `outlet_id`, `table_id nullable`, `created_by_staff_id`, `source_device_id`, `status`, `revision`, `ticket_payload` or normalized lines, item IDs, `created_at`, `submitted_at`, `approved_by_staff_id nullable`, `approved_at nullable`, `approval_order_id nullable`, `reason nullable`, immutable audit links. Key business+ticket ID; indexed on business/outlet/status/time; row lock+unique command approval.
- Statuses: `SUBMITTED`, `APPROVED`, `REJECTED`, `NEEDS_REVIEW`, `CANCELLED`. Local unsent drafts stay in device IndexedDB and are NOT submitted server tickets.
- Commands: `ticket.submit`, `ticket.revise` only if still pending, `ticket.cancel` (author prior to approval), `ticket.approve` (cashier), `ticket.reject` (cashier). These are **new additive API commands**, not overloaded paid orders. Each uses existing command-kernel IDs, idempotency, audit, validation and permissions.
- Staff permissions: `ticket.create`, `ticket.view_own`, `ticket.view_outlet`, `ticket.approve`, `ticket.reject`; `payment.record`, `payment.split`, `till.*`, `order.fire` restricted to cashier/manager and enrolled checkout device. API must enforce cashier terminal authorization, not just permission/UI. Keep manager supersets explicit.
- Ticket carries reviewed **product ID, modifiers, portion, quantity, note, table/outlet, source version**, but approval uses the current validated catalog/stock/tax rules and highlights meaningful price differences for cashier review. Never silently take funds or alter stock on mere ticket submission.
- `ticket.approve` in one PostgreSQL transaction must validate ticket state+revision, check outlet/table, create or attach to canonical POS order as appropriate, add lines, fire selected lines via existing handler, emit KDS/print ticket once, record approval/audit, mark ticket approved. If stock or price changed, return `NEEDS_REVIEW` and show cashier meaningful choices. No partial fire or duplicate stock debit if transaction fails.
- Support multiple waiters submitting concurrently. Ticket status updates via existing sync/change feed or optional SSE. Do not require cashier to refresh manually.
- The cashier may edit submitted ticket before approval, maintaining an auditable final revision. A later waiter add-on creates a **new pending round**, preserving the prior fired items and payment history.
- Waiter UI: choose table / takeaway, product search, quantities, prep note; `Send to cashier` is one primary action; status pill `Waiting`, `Approved`, `Needs changes`, `Rejected`.
- Cashier inbox: compact card with time, waiter, table, 1–3 line preview, total; `Review`, `Approve & send`, `Reject` (reason). One-tap approval optional only where no validation discrepancy. Avoid automatic release before explicit approval.

**Acceptance:** two or more waiters submit simultaneously, ticket appears within e.g. 5 seconds when online; cashier approves once under simultaneous clicks; exactly one stock effect and each BAR/KITCHEN prep ticket emitted once; waiter cannot record payment or approve; prohibited API calls return 403; a stale ticket returns reviewable 409, no partial state; legacy POS order flow intact.

## SPRINT 3: Full single-cashier offline cash ledger (P0)

**Data-layer design**
- Add new IndexedDB version **incrementally**; never wipe or rename the existing store while pending commands may be present. Suggested objects: `cashSales`, `cashEntries`, `localStockMovements`, `localOrderTickets`, `outboxV2`, `syncReconciliations`, `localShiftLedger`, `localPrintEvidence`, `capabilityLeases` (retain existing `records`, `queue`, `drafts`, `offlineGrants` during migration).
- Ensure a **single readwrite IndexedDB transaction** stores (1) immutable sale envelope; (2) local cash entry; (3) provisional inventory deltas; (4) receipt/ticket; (5) outbox command with stable UUID; (6) local monotonic checkout sequence. Use `navigator.locks` across browser tabs; refuse new offline sale only when this same terminal is genuinely already processing a local commit or local store isn't durable.
- Make the sale envelope deterministic: business, outlet, till ID, cash drawer device, cashier, event timestamp, client transaction UUID, monotonic sequence, service destination, item snapshots/portion/modifier/price/tax, stock/bottle-consumption snapshot, currency, total minor, cash tendered minor, change minor, local document ID and signature/checksum evidence.
- Share the same pricing/tax algorithms between online and offline through a pure package or copied verified deterministic module, including inclusive tax, discounts, sealed bottle unit conversion (ml), modifiers, mixed units, and cash change. No independent rounding forks.
- Price and tax snapshot is locked to the customer-accepted sale. On sync, if server configuration changed, flag the discrepancy; never silently rewrite a cash-received transaction.
- Add a new `pos.offlineSale.commitV2` API command and versioned contract. It must be idempotent and atomic and must accept BAR and KITCHEN product routes. Keep `order.offlineCashSale` as supported legacy behavior for old PWAs until drained. Do not weaken other ONLINE_ONLY operations globally.
- The server validates device-capability signature, business/outlet/till ownership, payload UUIDs, counter uniqueness, catalog snapshots, stock movement consistency, currency, tax and tender. Store a durable replay/dedupe outcome with same command ID and payload hash. Reject command-ID mutation. If server detects stock or configuration conflict, preserve local cash evidence and create actionable `RECONCILIATION_REQUIRED`; **never erase a locally recorded cash receipt**.
- Project pending stock locally and show provisional balances; do not use fake settled figures in central reporting. When server confirms, collapse temporary local overlay without double deducting.
- Local cashier shift can collect cash offline, count cash locally and reconcile on reconnect. Closing remotely should not silently finalize a shift with unsynced sales. Prevent a new device/till from independently becoming offline cashier without explicit handoff and reconciliation.

**Offline identity/security**
- Provision only one specific enrolled checkout device for offline cash acceptance; signed, renewable device/outlet/role capability valid over configured shifts, no arbitrary one-sale/30-minute cap. Introduce V2 policy rather than widening v1 grants blindly.
- Secure offline reopening with a per-device local PIN/approved kiosk identity and cryptographically verifiable cached capability. Do not store raw credentials; secret keys remain server-side. Offline revocation is unknowable in real time, so constrain maximum lease duration, enforce local PIN lockouts, and reconcile activity on reconnection.
- Detect storage quota/storage eviction risk. Use `navigator.storage.persist()` where available, plus durable kiosk configuration and local encrypted recovery mechanisms if necessary. Local browser storage is not guaranteed durable through disk failure or profile deletion.

**Acceptance:** 100 varied offline cash sales across four-hour simulated outage, sequential order IDs, no unauthorized product-route filtering; 3 forced reloads; survive browser close/reopen with provisioned offline user; no lost/double cash and stock locally; cash drawer totals match; deduped replay; no second cashier enabled. Offline M-Pesa remains unverified; refunds, room charges and credit remain disabled offline unless separately approved.

## SPRINT 4: Automatic reconciliation and printing (P0/P1)

**Synchronization**
- Replace global blocking and one poisoned sequential queue with dependency-aware replay. Independent completed offline sales can proceed even when another sale enters review. Preserve within-order dependencies and local shift sequencing; never apply a payment without its order or ticket approval.
- Upon reconnect, use `commandStatus(id)` then replay identical payload+ID. Handle `CONFIRMED`, `RECEIVED`, `PROCESSING`, `REJECTED`, `CONFLICT`, `OUTCOME_UNKNOWN` individually. For HTTP timeout, retain same ID; do not silently produce a new `payment.record` ID.
- Recognize `navigator.onLine` as only a hint, not proof of API reachability; use authenticated API probe and retry with bounded jitter/backoff. Trigger on visibility, online and user request; periodic background work is best-effort only. UI shows `X locally recorded, Y pending, Z exceptions`.
- Reconcile cash, items, receipt numbering and stock. Idempotently issue official server documents only after confirmed central commit. Store local provisional slip identity, link final receipt and do not auto-print a second copy. Expose exportable local evidence for disaster recovery with privacy guardrails.
- Add a prominent but compact **Recovery / exceptions** panel accessible to cashier and manager. It must not block other independent cash sales. For unresolved cash already physically received, issue financial reconciliation workflow rather than losing transaction or treating failure as simple cancellation.
- KDS: during no internet, local cashier can print an order preparation ticket if local printer supports it. Waiter smartphones cannot auto-reach cashier/kitchen without LAN edge. No phantom station receipts.

**Acceptance:** API killed and restored; connectivity flapping; 100+ queue backlog; reboot between local commit and network send; server restarts after durable RECEIVE; replay 5x same IDs; rejected ticket approvals; sold sealed 750ml then count; sync after catalog price change; checksum/fiscal document reconciliation; independent ticket/status commands continue without deadlock.

## SPRINT 5: Release hardening and operations (P0)

- Add named CI suites: `pos2-cashier-ui`, `tickets-approval`, `offline-cash-ledger`, `offline-replay`, `backward-compatibility`, `schema-expand`, `PWA-update-pending-ledger`, `print-reconciliation`. Use real PostgreSQL 16 integration, not mocked db only.
- Test all RBAC permutations against actual API, including waiter POST to restricted payment/fire/void routes.
- Keep old POS and API protocol operable while flags off. Existing 73 catalogue items, CSV import, inventory, rooms, till, payment, KDS and receipt behavior must remain intact.
- Run `npm run lint`, `npm run contracts:check`, `npm run architecture:check`, `npm run build`, `npm test`, `npm run test:api`, `npm run test:browser:api`, `npm run test:browser:production`, `npm run audit:ui:gate`, `npm run docs:check`; these integration tests require disposable PG and browser dependencies as described in `docs/testing.md`.
- Preserve the repository's five green CI jobs. Explicitly repair/test the upstream API Dockerfile: import full API module graph as `node` user and verify `/app/contracts/permissions.json` and `roles.json` are files beneath executable directories. Do not rely solely on the bespoke repair staged at `/opt/serveos-next`.
- Add operator help/tour updates, screenshot comparisons, accessibility smoke, kiosk full-screen, quick recovery card, receipt layouts and privacy/access logging.

---

# E. Release/test gates (MUST PASS IN ORDER)

| Gate | Condition | Stop if |
|---|---|---|
| G0 Baseline | Live 3102 health, actual Nginx routing, source SHA/image ID, pending sync counts documented; fresh business DB backup + off-VPS restore verified | Any pending financial command unresolved or live health unhealthy |
| G1 Source | Feature branch committed; CI green; code review; signed build manifest; old UI/commands backward-compatible | Broken tests, permission regression, missed contract files |
| G2 Staging | Dedicated `serveos-stage` Compose project, isolated DB volume, ports 3202/3203 bound to loopback; synthetic business data | Any staging component shares live database or overwrites live files |
| G3 Migration | Restored staging DB tests; expand-only migration checks; old/new binaries against migrated schema | Irreversible migration, excessive locks, rollback incompatibility |
| G4 Candidate API | Image built, canary at unused loopback 3103, no public route; healthy, 72+ expected migration manifest | Wrong DB/secret, no health, fails origin/auth checks |
| G5 UI staging | Candidate PWA release under new immutable directory, exact assets+API compatibility verified, test staff workflows | Missing assets, stale SW, uncaught browser exceptions |
| G6 Internal pilot | Feature flags ON only authorized test/cohort; one terminal; waiter ticket and 100-offline-sales test | Lost/duplicate payments, unapproved stock consumption, wrong balances |
| G7 Controlled switch | Change only ServOS web symlink and API proxy target; test HTTPS, SMS hosts, DB, staff workflows | Any unrelated host fails or new routes return incorrect release |
| G8 Retention | Keep previous live API image/config and old PWA release; keep migrations additive; retain pending queue for replay | Any attempted deletion or cache clear with pending transactions |

**Health 200 and green CI are necessary but not sufficient:** business-flow and recovery tests must also pass.

---

# F. VPS: safe preflight (READ ONLY, run before every release)

From **Windows PowerShell**, use discrete SSH commands (no heredoc CRLF issues):

```powershell
$server = 'administrator@93.127.131.55'
$key = "$env:USERPROFILE\.ssh\id_ed25519"

ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker compose ls --all'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker volume ls'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n nginx -t'
ssh -T -o BatchMode=yes -i $key $server 'curl -fsS --max-time 10 http://127.0.0.1:3102/health/ready'
ssh -T -o BatchMode=yes -i $key $server 'readlink -f /var/www/serveos-next/current'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker inspect serveos-next-api-1 --format "{{.Image}} {{.State.Status}} {{.State.Health.Status}}"'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n grep -E "root /var/www/serveos|proxy_pass http://127.0.0.1:31" /etc/nginx/sites-enabled/serveos-production'
```

Separate each of the three unrelated HTTPS origin checks and record the HTTP response. Site 200 and SMS 307 (login redirect) were prior baseline, but measure again:

```powershell
ssh -T -i $key $server 'for h in detailskilonzo.com sms.detailskilonzo.com africa.detailskilonzo.com; do printf "%s " "$h"; curl -sS -o /dev/null -w "%{http_code} SSL:%{ssl_verify_result}\n" --resolve "$h:443:127.0.0.1" "https://$h/"; done'
```

For complete login/session verification use browser tests, because 307 alone doesn't prove SMS service health. Capture API and PWA source SHA/digests, Nginx active config checksum, env *variable names only* (no values), count of pending/unknown commands by status, live backup evidence. Never print credentials or bearer tokens to the terminal transcript.

**DO NOT continue if live accounting transactions are pending and the planned change touches their protocol or stored IndexedDB schema.** Drain/reconcile them first, or test exact old-command replay against the candidate API while both APIs remain available.

---

# G. Non-destructive staging on the existing VPS

Prepare a **new** staging project, never reuse the production Compose project or volume:

```
/opt/serveos-stage/           # isolated git/source + compose + private credentials
/var/www/serveos-stage/      # staged test PWA files
serveos-stage-postgres       # distinct container
serveos_stage_data           # distinct database volume
127.0.0.1:3202              # suggested staging API (check free)
127.0.0.1:3203              # suggested staging web server (check free)
```

- Use PostgreSQL 16 and Node 22. Source = exact candidate git SHA.
- Stage DB contains **synthetic or sanitized data only**, never production credentials. If using a restored production copy, restrict users, anonymize sensitive personal data, prevent SMS/email/M-Pesa transmissions, ensure workers and cron are disabled, and do not expose it on the public internet.
- Source checkout and Docker build contexts must be separate and mode-safe; correct upstream Dockerfile to include root permission contracts. Containers run unprivileged; preflight module imports as `node`.
- Build stage PWA with API origin **staging API**. DO NOT point stage PWA at the live `serveosapi.davemusau.co.ke`. The current API enforces a fixed `WEB_ORIGIN`; for SSH tunneled local staging use that actual local PWA origin (e.g. `http://127.0.0.1:3203`) and API `http://127.0.0.1:3202` as explicitly configured; test cookies/CORS/session and SW. Alternatively use dedicated correctly TLS-provisioned staging subdomains, only after separately authorizing their DNS and Nginx config.
- `ssh -L 3202:127.0.0.1:3202 -L 3203:127.0.0.1:3203` from developer workstation can expose staging services locally without opening VPS public ports. Never point the production PWA at 3202.
- Run full user flows, real API+PG integration, controlled worker settings, browser offline simulation and stable replay testing. Keep staging separated by project/volume/network and no public host by default.

---

# H. Production deployment sequence: no blind overwrite

## H0. DO NOT USE RETIRED DEPLOYER

`Deploy-ServOSProductionFeatures.ps1 -Mode Pwa` currently hardcodes `/var/www/serveos-prod`. Other modes use `serveos-prod-api-1` and port 3101. **It is not suitable for your successful `serveos-next` installation without refactoring and testing.** Do not execute it as-is. Change to required `-TargetEnvironment ServeosNext` or parameterized `-WebRoot -ComposeProject -ApiPort -ComposeFile`, validate against an explicit allowlist and fail closed if the current symlink or current virtual host doesn't match expected baseline. No silent fallback to old paths.

The current on-VPS API image uses a locally repaired staged build context because the repository API Dockerfile omitted required root permission JSON files. The first deployment task must commit the upstream Dockerfile correction and test the new image in staging. Otherwise the next production build can reintroduce `ERR_MODULE_NOT_FOUND` for `/app/contracts/permissions.json`.

## H1. Snapshot the **NEW LIVE** business, not the discarded old instance

The user explicitly chose not to preserve the *old* `serveos-prod` business database. This does NOT authorize risking data now being created in *new live* `serveos-next`.

Before releasing new code or schema:
- Read-only record `serveos-next` current container/image IDs, current DB migration names, business identity and representative totals, PWA release symlink, Nginx config checksum, queue and current POS order states.
- Take a consistent `pg_dump -Fc` of **new** database, verify `pg_restore -l`, copy encrypted off VPS, restore to a temporary isolated DB, and verify representative business totals. Keep database credentials private.
- Do not copy live `.env` into logs or upload it to GitHub. Keep at least 2 independently restorable generations of current business records.
- Confirm current cashier shift, order, ticket and payment state; pause only the affected high-risk writes briefly if essential for a migration, never assume quiet operation.

## H2. Publish expand-only SQL migrations

- Test against a staging restore first. All new objects use independent UUIDs, business scoping, unique command IDs and indexes. Establish a schema-compatibility test demonstrating the current production API still works **after** the migration.
- Production migrations run against the verified existing `serveos-next` database ONLY, with explicit confirmation and observed timing. Never use `db push` against a legacy Supabase project or volume recreation.
- Migrations are *not* rolled back by switching a PWA symlink or reverting the API Docker image. Recover via additive fix-forward migration wherever possible; DB restore is a separate business recovery decision requiring reconciliation of writes that occurred since snapshot.

## H3. Deploy canary API separately (blue/green)

- Build candidate immutable Node image by git SHA and Docker image digest. Configure a **separate container/service** (`serveos-pos2-canary-api`) on loopback port **3103** (only after port check), using the same intended production DB *only after compatible schema migration*, and the proper existing Docker private network. Keep original `serveos-next-api-1` alive on 3102.
- Candidate must not run migrations automatically on web requests, generate data on boot or start jobs that duplicate processing; if necessary use read-only validation until cutover. Restrict canary endpoint to loopback and keep its credentials root-only.
- First test with isolated staging DB. Then on production canary, test `/health/ready`, login/session, RBAC, GET projections and synthetic non-mutating checks. Do not run example sales against live business or issue duplicate print jobs.
- **Do not directly attach an untrusted container to the live database without passing the source/CI/restore/compatibility gates.**

## H4. Switch API route with verified rollback

- Current site: `/etc/nginx/sites-enabled/serveos-production`; expected production API proxies currently target `127.0.0.1:3102` (confirm live).
- Prior to changes, copy that one Nginx site file into an owned, restricted, timestamped release checkpoint. Preserve all certificate directives and all unrelated enabled sites.
- Edit **only** the two `proxy_pass http://127.0.0.1:3102;` lines belonging to the ServeOS API virtual host, including `/v1/sync/stream`, to `127.0.0.1:3103`. Fail if expected exact count/host does not match; never blanket replace every 31xx port across `/etc/nginx/`.
- Run `sudo nginx -t`; only then `sudo systemctl reload nginx` (graceful). Check serveos website, serveos API, SMS hosts, Details Kilonzo, and browser origin/CORS. Retain 3102 API and its image as an immediate route fallback while schema remains old-compatible.
- For rollout where changing API is unnecessary, skip API switch and deploy only a compatible PWA.

## H5. Stage and atomically switch PWA

- Build production PWA with `VITE_API_URL=https://serveosapi.davemusau.co.ke` and correct public verification keys; **never** ship signing private keys in the bundle. Confirm new feature flags OFF at first.
- Build from clean committed worktree; use `npm run build`, `npm run release:pwa:package`. The existing `scripts/package-pwa-release.mjs` creates SHA-bound SHA-256 manifest. Refactor target-aware web deployer to accept `serveos-next` root; it must verify archive paths/file hashes and immutable target release.
- Copy immutable build into `/var/www/serveos-next/releases/<candidate-git-sha>`. Do not overwrite existing directories, and make sure Nginx can traverse/read all asset paths.
- Preflight `readlink -f /var/www/serveos-next/current` and confirm expected previous release. Atomically replace **only** this symlink after checks; preserve previous symlink target in release record. Do not use `rm -rf` on existing releases.
- Probe production page, exact hashed JS/CSS referenced by current `index.html`, `/sw.js`, `/manifest.webmanifest`, API readiness, CORS preflight, login flow and cashier test business. Avoid clearing service-worker caches when pending commands exist. SW update must wait for durable local financial outbox and safe restart boundary.
- After new release is stable, enable **one feature cohort at a time** via server-configured flags; verify and only then expand to Countryside operators.

## H6. Rollback matrix

| Symptom | Immediate action | Notes |
|---|---|---|
| POS UI broken but API compatible | Disable `pos2.simpleCashier`, or atomically point PWA current symlink back to known-good bundle | Service worker may retain old/new caches; do not clear local IndexedDB. |
| Ticket approvals faulty | Disable **new ticket creation/approval** flag; continue legacy sales and preserve submitted tickets for repair | Do not delete ticket rows. |
| Offline ledger faulty | Disable **creation** of new offline sales; keep sync decoder, replay and recovery enabled | Never orphan recorded cash entries. |
| API error after switch | Restore only ServOS API `proxy_pass` from 3103 to 3102, validate and gracefully reload Nginx | Safe only if older API accepts migrated schema and pending command protocol. |
| Migration introduced incompatibility | Stop rollout, perform additive fix-forward; use restored DB only as explicitly approved disaster recovery | PWA symlink rollback does not revert PostgreSQL schema or transactions. |
| Failed unrelated-host baseline | Immediately restore only ServOS site checkpoint; verify why Nginx reload impacted unrelated host | Never restart/uninstall other Docker projects. |
| Printed document outcome unknown | Audit print evidence; ask operator to confirm physical output before retry | No automatic duplicate prints. |

**Rollback is not simply deleting the new API.** Business transactions committed after a candidate goes live must not disappear if old code is reinstated. Feature rollout must tolerate mixed versions and retained offline commands.

## H7. No-destruction list

Never use on this VPS during this sprint:

```
docker compose down -v
docker system prune -a --volumes
docker volume prune
docker rm -f $(docker ps -aq)
docker stop $(docker ps -q)
sudo rm -rf /opt/serveos-next
sudo rm -rf /var/www/serveos-next
git reset --hard     # in a workspace with local work
```

Never modify or remove `sms-platform`, `sms-platform-africa`, their Docker volumes/networks, their `.env` files, or Nginx sites `details`, `sms`, `africa-sms`. Avoid global `systemctl restart docker`; use per-project changes and graceful Nginx reload only after validation.

---

# I. Concrete verification commands for developer

Developer, from clean branch with correct test PostgreSQL configured:

```powershell
npm ci
npm ci --prefix apps/api
npm run lint
npm run contracts:check
npm run architecture:check
npm run build
npm test
npm run audit:ui:gate
npm run docs:check
# Only with a disposable PostgreSQL 16 in TEST_DATABASE_URL and Playwright installed:
npm run test:api
npm run test:browser:api
npm run test:browser:production
```

**Add test cases** for dedicated device: cashier vs waiter roles; ticket idempotency; `order.fire` once; BAR/KITCHEN prep tickets once; no stock consumption preapproval; 900 KES cash paid display; pending sync UI; 100 offline sales; 100 replays; browser process crash; partial network restoration; cached identity and expired capability; stock ml precision; SW version update while queue nonempty; receipt duplicate protection; old/new API compatibility.

Release information to paste into PR/release record:

```
release_sha=<40hex>
ci_run=<url>
api_image_digest=<sha256>
pwa_manifest_sha256=<sha256>
prod_migration_before=<name>
prod_migration_after=<name>
backend_health=<expected/applied>
preflight_sms_status=<codes>
preflight_details_status=<code>
prod_backup_restored=<YES + evidence>
staging_acceptance=<PASS + evidence>
cashier_pilot_transactions=<count>
replay_duplicates=0
pending_unresolved_cash=0
rollback_pwa=<path>
rollback_api=<image and loopback port>
feature_flags=<values>
operator_approver=<name/role>
```

---

# J. One-page developer implementation rules

1. **Reuse** existing `pos-commands`, `payment-commands`, inventory pricing, KDS, `command-kernel` and PostgreSQL transaction model. Add only the commands/data required for tickets and single-device offline receipts. No second parallel billing engine.
2. **Waiter ticket is not a sale** until the cashier approves; approval is exactly-once and initiates existing fire/stock/KDS logic. No waiter permissions for settlement.
3. **One enrolled offline cashier terminal** holds local operational continuity; other devices are ticket clients (online) or local draft holders (offline).
4. The cashier's main screen is **products + bill + Pay**, not a vertical aggregation of ten admin modules. Make it genuinely operable in 1366x768 and 1024x768, including scanner.
5. Money and stock must reconcile by stable UUIDs and explicit status. Never say `confirmed` based on a saved local command or optimistic UI notification.
6. Preserve old protocols/UI while flags are off. No destructive migrations or schema rewrite. Do not introduce client cache wipes.
7. Stage with **separate database and API**, validate with real Postgres and production-like browser tests, only then canary the API and atomically switch ServOS routes.
8. Never use the current hardcoded `serveos-prod` deploy script to update `serveos-next`; parameterize, preflight and rehearse it first.
9. **Production remains open and usable** until the complete successor passes business verification. A green CI check alone is not permission to cut over.
10. Never touch the unrelated SMS projects or Details Kilonzo website; measure their health before and after release.

## Definition of done

At Countryside a waiter submits a ticket, the cashier approves it, the bar/kitchen receives the appropriate items once, a cashier takes cash and gets correct change, sales survive hours of API downtime on the single checkout terminal, then reconcile automatically without data loss or duplicates. The POS has no superfluous scrolling to finish ordinary sales, and all pre-existing production systems and records remain intact. Any necessary caveat about physical printer evidence, fiscal receipt compliance or offline M-Pesa confirmation is explicit rather than disguised as a passed test.


# SERVEOS POS 2.0
## Final engineering sprint, acceptance contract and non-destructive VPS deployment runbook

**Prepared:** 2026-10-11  
**Repository:** `davemusau00/SERVEOS-WEB`  
**Audited source:** `reset/vps-platform` at `7a3462292dc3700b9bd0aa978ccf92944fe7fb67`  
**Reference CI:** https://github.com/davemusau00/SERVEOS-WEB/actions/runs/38137610469 (all jobs successful at audited SHA)  
**Target current live installation:** `serveos-next` at `/opt/serveos-next`, PWA `/var/www/serveos-next/current`, API `127.0.0.1:3102`, PostgreSQL volume `serveos_next_data` (confirm before changes)  
**Dedicated existing other stacks:** `sms-platform` and `sms-platform-africa`; static site `detailskilonzo.com`  
**Authority rule:** The production VPS remains the primary business authority. New offline sales are locally recorded and *provisional for central reporting* until reconciled; they must never be displayed as server-confirmed prematurely.

> **WORK ORDER FOR CODING AGENT:** Implement the milestones in order. Preserve all existing operator workflows, data, roles, database history, environment secrets, SSL certificates, Nginx virtual hosts, other Docker Compose projects and production storage. Treat **no production downtime, no silent data loss, no double payment, and no invented settlement** as release blockers. Do not run destructive commands. Never deploy without explicit approval after the specified gates are green.

---

# A. Architecture and operational requirements

## A1. One cashier, many ticket authors

- Exactly **one authoritative checkout terminal** per outlet/installation in v1. It is the only device permitted to accept and record in-person cash, operate the cash till, issue final server-backed receipts, or complete sales. It may be used by cashier accounts with explicit role permissions, but the *device* is enrolled as the dedicated checkout device.
- Waiters and authorized staff log in on phones/tablets and **create order tickets**. They may name a table/customer/order, choose available products, add preparation notes, submit, monitor status and amend/re-submit an unapproved ticket. They cannot record settlement, fire preparation, touch stock or issue a completed-sale receipt.
- Cashier receives a **Tickets (N)** inbox, reviews ticket, adjusts or rejects with reason, and approves. Approval fires only approved lines, consumes/reconciles inventory via the existing POS handler, and generates bar/kitchen preparation outputs *once*.
- Direct cashier transactions skip waiter ticket approval. Tap product -> current bill -> Pay, with minimum round trips and no superfluous editor forms.
- Multiple waiter devices work **online**. In phase 1 of offline support, waiters can only keep personal drafts while internet/API is unavailable. They **must not claim the ticket has reached the cashier** without acknowledgement. Local Wi-Fi ticket delivery is a separate later ServOS Edge milestone, not a condition of the single-terminal cash-sale release.
- Existing rooms, tab, account charge, discounts, refunds, split payments, housekeeping, KDS, stocks, credits and finance functionality remain available in their current authorized screens until explicitly replaced and tested.

## A2. Online + offline have ONE cashier UI

- Normal POS layout is independent of network state. Status appears in a small banner or header. Never show the huge `One offline cash sale` panel once new flow is enabled.
- Uninterrupted consecutive local **cash** sales on the enrolled cashier terminal during outages; no **one-sale / 30-minute** gate, no `BAR`/`KITCHEN` exclusion, no global freeze when an unrelated command is outcome-unknown.
- The operator can use the full cached sellable catalogue, stock rules, inclusive tax, modifiers and portions that have been provisioned. All money computed in integer **minor units** (KES cents). All physical quantities use deterministic fixed-point units (e.g., ml, whole containers), never floating-point money rounding.
- Save each sale atomically and durably: sale snapshot + item IDs + price/tax snapshots + local cash payment entry + provisional stock movements + local receipt/print evidence + same-ID sync outbox entry. If local persistence fails, sale is NOT recorded and the cashier must see a hard failure.
- Local state names: `RECORDED_LOCALLY`, `QUEUED`, `SYNCING`, `SERVER_CONFIRMED`, `OUTCOME_UNKNOWN`, `RECONCILIATION_REQUIRED`. These have distinct meanings. The cashier must see that cash was physically received even if the central ledger has not yet confirmed the sale.
- Offline cash accounting is allowed under a **preprovisioned, signed, enrolled-device capability** (scoped business, cashier device, staff/role, outlet and shift). Authorization is renewable while online and has an explicit validity period and risk policy. Do **not** turn off authorization, assume an expired role is valid indefinitely or accept unsigned/offline forged permissions. Remove an arbitrary *per-sale* quota, not security.
- No automatic assertion that unverified offline **M-Pesa** or bank payments have settled. Support recording a local *customer-claimed* external reference for later reconciliation only, or defer external tender to online mode. Cashier must not label it 'paid/confirmed' until verified against configured evidence. Room charges, credit, refunds and manager overrides remain online-only until individually specified and accepted.
- Printing: local provisional customer slip, local preparation ticket with stable sale/ticket ID and visible `PENDING SYNC` / `NOT FISCAL INVOICE` where applicable. Full receipt and eTIMS/fiscal compliance remain separate evidence gates. An OS print dialog is not proof of physical printing. No automatic duplicate printing on retries.
- Terminal PWA must reopen offline with a provisioned local operator identity, loaded catalogue and local activity. Signing into a previously unused browser requires network. Locally authenticated identity must be secured by a kiosk PIN or equivalent security mechanism: do NOT persist access/refresh tokens or passwords in localStorage or plaintext IndexedDB.

## A3. Non-negotiable scope boundary

The first production offline release supports **one cashier device**. Waiter phones need API reachability to deliver tickets. There is **no promise of offline multi-device stock agreement**. Multiple offline cashier devices, LAN routing, local print servers and server-side multi-master merging are explicitly future work.

---

# B. Source-baseline findings requiring remediation

Audited code artifacts (verified in the live repository at the stated SHA):

| File/module | Actual gap |
|---|---|
| `src/runtime/web/WebApiPosView.tsx` | 264-line tightly composed UI with separately rendered offline sale, till, payment, prep, room charge, credit, detailed order, document queue and numerous advanced forms in one long vertical page. |
| `src/runtime/web/WebApiOfflinePosPanel.tsx` | `maxCommands:1`, `durationMinutes:30`, `pendingEntry` blocks another sale, `['KITCHEN','BAR']` product filter and offline-only separate form. |
| `apps/api/src/offline-pos-commands.mjs` | `order.offlineCashSale` rejects `KITCHEN` and `BAR` route-to; only `COUNTER`/`TAKEAWAY` service destinations; chained create/add/fire/pay in one API command. |
| `apps/api/src/server.mjs` | Grant issuance caps sale to one for up to 30 minutes and rejects broader offline authorization. |
| `src/runtime/web/WebBusinessApp.tsx` | Explicit `navigator.onLine` blocks nearly all POS, payment, till, hospitality operations; any queued `OUTCOME_UNKNOWN` blocks new unrelated actions. |
| `src/runtime/web/BusinessStore.ts` | IndexedDB command queue and bootstrap exist, but there is no full atomic local cashier sale, payment, inventory and print ledger. Grant validation has global maximum 100. |
| `src/runtime/web/sync.ts` | Single sequential queue; `synchronizeStore` stops if earlier command fails. Existing command ID recovery and change feed are useful foundation. |
| `src/runtime/web/apiAuth.ts` | Restores access via API refresh; cold PWA entry needs a separate secure offline identity/session reopening path. |
| `apps/api/src/pos-commands.mjs` | `order.create` and `order.addItem` require `pos.sell`, `order.fire` requires `order.fire`, and these are ONLINE_ONLY. Waiter-specific nonfinancial ticket capability does not yet exist. |
| `src/runtime/web/WebApiPaymentPanel.tsx` | Payment UI depends on a pre-fired order with open, operator/device-owned till. Local provisional cash accounting not present in main POS. |
| `apps/api/src/command-kernel.mjs` | API has durable command IDs, payload hashes, locks and idempotent replay. Preserve these. |
| `apps/api/Dockerfile` | **Broken in repository:** only copies `src`, `migrations`, package files under `/app`; but `src/staff-commands.mjs` imports root `contracts/permissions.json` and `contracts/roles.json`. VPS had a local staged Dockerfile repair to load `/app/contracts/`. Make upstream package path correct and test as nonroot. |
| `scripts/Deploy-ServOSProductionFeatures.ps1` | **Unsafe for current topology:** PWA mode hardcodes `/var/www/serveos-prod`, other modes hardcode `serveos-prod-api-1`, `3101`, old healthcheck and old release paths. Do not execute this unchanged against the new VPS. |
| `scripts/package-pwa-release.mjs` | Requires a clean committed checkout; SHA-bound manifest, SHA-256 asset hashes, immutable release dir. Keep/reuse after parameterizing deployment script. |

**Live diagnostic to resolve before work:** Screenshot shows `Payment confirmed` while order still displays `Paid KES 0 / Balance KES 900`, with one change waiting to sync. This does NOT prove a double charge or data loss, but is a serious UI consistency risk. Inspect exact command ID and terminal outcome in Activity before submitting further payments. Make consistency and recovery acceptance P0.

**Historical production snapshot (as shared):** New `serveos-next-api-1` was healthy at `127.0.0.1:3102`, with migrations `expected=72/applied=72`; PWA staged release `7a3462292dc3`, and first-use account created subsequently. Latest user says deployment succeeded. **Do not infer the current live SHA or containers without a fresh read-only preflight.**

---

# C. Git and deployment workflow: safeguards first

## C0. Start feature branch, never edit the active production checkout

Developer Windows PowerShell:

```powershell
cd 'C:\Users\Admin\Downloads\SERVEOS-RESET'
git status --short
git remote -v
git fetch origin reset/vps-platform
git switch reset/vps-platform
git pull --ff-only origin reset/vps-platform
git switch -c feat/pos2-cashier-tickets-offline
```

**Before branching:** do not discard uncommitted local work. Resolve/stash it explicitly, never `git reset --hard`. The development checkout stays on Windows or an isolated working directory, **not** `/opt/serveos-next/source` if that checkout is used by active deployment tooling.

Establish an implementation contract in `docs/sprint/pos2-offline-cashier.md`. In CI record source SHA, API image digest, migration high-water, PWA manifest digest, database compatibility, flag status and operator acceptance artifacts. All risky features start with default `false` in production runtime configuration.

## C1. Flag design

Recommended server-controlled effective capabilities: `pos2.simpleCashier`, `pos2.waiterTickets`, `pos2.offlineCash`, `pos2.localKitchenTickets`, `pos2.offlineAuthV2`. Scope flags to business/outlet/device/role where relevant. Default OFF for all existing businesses and devices. A flag should be computed and verified by the API and embedded in the authorized business session, not treated as a frontend security check. A PWA build-time flag is insufficient for per-business rollback because SW assets are cached. Avoid flag proliferation: one release phase may activate multiple backend capabilities as a single small cohort.

Rollout states: `LEGACY_ONLINE_ONLY` -> `SIMPLE_UI_ONLINE` -> `WAITER_TICKETS_ONLINE` -> `SINGLE_CASHIER_OFFLINE_PILOT` -> `GENERAL_AVAILABILITY`. A server feature kill switch must not delete or strand locally queued commands; disabling new creation must retain the replay/reconciliation path for existing local IDs.

## C2. Database migration rules

1. SQL **append-only migration names** after current migration 072. Do not edit previously applied migration files or rewrite existing business tables destructively.
2. Use expand-and-contract: add new nullable columns/new ticket and reconciliation tables, indices and constraints that coexist with old code. Backfill separately, with throttling and validation. Do not remove or rename existing fields until the last old API/PWA can no longer use them and all queues are drained.
3. Schema must support **old API + old PWA**, **new API + old PWA**, **new API + new PWA** during cutover; the new PWA with old API is *not* required only if activation prevents it, but should fail gracefully.
4. Never use `docker compose down -v`, `docker volume rm` or recreate the current `serveos_next_data` volume.
5. Migrations must be rehearsed against a disposable restored database and validated for lock duration before production.
6. **Fix migration readiness** to validate expected names/checksums, not just hardcoded count `72`. Readiness must match the active binary's migration manifest while remaining tolerant of authorized later migrations during transition.

---

# D. Detailed implementation sprints and acceptance contracts

## SPRINT 0: Make existing POS trustworthy before refactoring (P0)

**Tasks**
- Reproduce screenshot inconsistency (server-confirmed `payment.record`, order projection still amountPaid=0 and pending change); trace returned `ApiCommandOutcome`, `synchronizeStore`, change-feed application, stale React record state, and duplicate prevention. Only display `Confirmed by server` if confirmed payment ID/receipt and current projection agree, otherwise `Recorded, updating display` with original-command recovery link.
- Replace broad unknown-outcome global blocking with *per-aggregate* blocking for current online operations; retain conservative behavior for affected order/till. Do not enable unrelated offline operations yet. Keep conflict evidence.
- Add tests that replay a timed-out payment with the **same** command ID and identical payload; ensure settlement once. Simulate stale response and UI refresh.
- Verify current importer-generated products at Countryside: 73 sellables, 72 stock masters as last seen; no duplicate SKU creation. Validate there is one consistent till owner.
- Capture baseline `health/ready`, navigation, current database migration head, current operator role, `git sha`, queue size, DB backup timestamp.

**Accept:** repeated payment retry cannot create second settlement; 900-KES sale shows paid/balance consistent after server confirmation; outstanding queue status is explicit; previous online operations unaffected.

## SPRINT 1: Simplify cashier POS, no backend behavior change (P0)

**Build**
- Replace monolithic `WebApiPosView.tsx` render tree with container and small components, suggested files: `src/runtime/web/pos2/CashierWorkspace.tsx`, `ProductSearchGrid.tsx`, `OrderBasket.tsx`, `PaySheet.tsx`, `TicketsInbox.tsx`, `ShiftHeader.tsx`, `PosMoreMenu.tsx`, `PosConnectivityBadge.tsx`.
- Desktop: top row venue/outlet, shift indicator, network state, waiting-ticket count; center product search/category/favorites; fixed-right visible active bill. Keep total and Pay button always on screen. Mobile/tablet: product view with sticky basket/pay drawer, touch targets >=44 px.
- **Single tap** product adds it at qty 1 (or starts immediate counter order); repeat tap increments. Optional modifiers/portion show a small sheet **only when product requires a choice**. Barcode scanner auto adds exact unique match, with disambiguation on multiple matches.
- One primary action `Pay KES n`. In PaySheet choose Cash, M-Pesa, Split, More. Cash: tendered amount + live change. M-Pesa: actual reference/received amount/time/verification policy. More contains charge room, customer account, discounts, etc. Out-of-scope actions must not vanish for authorized legacy users; route them to existing advanced screens.
- Use compact order tabs `New sale`, `Tickets`, `Held`, `History`; hide advanced form proliferation behind `More`. Remove separate favorite buttons and reduce redundant order name input; use automatic user-friendly sale ID and optional rename.
- Preparation pass remains in KDS view; till cash in/out/close moves to Shift header dialog.
- Replace disabled without reason with contextual tooltip/message. Preserve keyboard Tab focus, screen reader roles, high contrast, input validation, ESC handling, and 80mm-friendly print styles.
- Preserve all existing API commands and order revision rules for this sprint. Feature flag `pos2.simpleCashier` OFF by default.

**Acceptance tests:** 73 products searchable; tap and barcode; two-tap qty; quick add; open tab; create/fire/pay; change; cash/M-Pesa split; room charge/credit More; scanner keyboard focus; 1366x768, 1024x768 and 390x844 viewports; legacy POS screenshot/regression unchanged when flag off. Main cashier flows do not require vertical scrolling.

## SPRINT 2: Waiter ticket proposals -> cashier approvals (P0)

**New domain proposal**
- Add additive table(s): `pos_ticket_submissions` with `business_id`, `ticket_id UUID`, `outlet_id`, `table_id nullable`, `created_by_staff_id`, `source_device_id`, `status`, `revision`, `ticket_payload` or normalized lines, item IDs, `created_at`, `submitted_at`, `approved_by_staff_id nullable`, `approved_at nullable`, `approval_order_id nullable`, `reason nullable`, immutable audit links. Key business+ticket ID; indexed on business/outlet/status/time; row lock+unique command approval.
- Statuses: `SUBMITTED`, `APPROVED`, `REJECTED`, `NEEDS_REVIEW`, `CANCELLED`. Local unsent drafts stay in device IndexedDB and are NOT submitted server tickets.
- Commands: `ticket.submit`, `ticket.revise` only if still pending, `ticket.cancel` (author prior to approval), `ticket.approve` (cashier), `ticket.reject` (cashier). These are **new additive API commands**, not overloaded paid orders. Each uses existing command-kernel IDs, idempotency, audit, validation and permissions.
- Staff permissions: `ticket.create`, `ticket.view_own`, `ticket.view_outlet`, `ticket.approve`, `ticket.reject`; `payment.record`, `payment.split`, `till.*`, `order.fire` restricted to cashier/manager and enrolled checkout device. API must enforce cashier terminal authorization, not just permission/UI. Keep manager supersets explicit.
- Ticket carries reviewed **product ID, modifiers, portion, quantity, note, table/outlet, source version**, but approval uses the current validated catalog/stock/tax rules and highlights meaningful price differences for cashier review. Never silently take funds or alter stock on mere ticket submission.
- `ticket.approve` in one PostgreSQL transaction must validate ticket state+revision, check outlet/table, create or attach to canonical POS order as appropriate, add lines, fire selected lines via existing handler, emit KDS/print ticket once, record approval/audit, mark ticket approved. If stock or price changed, return `NEEDS_REVIEW` and show cashier meaningful choices. No partial fire or duplicate stock debit if transaction fails.
- Support multiple waiters submitting concurrently. Ticket status updates via existing sync/change feed or optional SSE. Do not require cashier to refresh manually.
- The cashier may edit submitted ticket before approval, maintaining an auditable final revision. A later waiter add-on creates a **new pending round**, preserving the prior fired items and payment history.
- Waiter UI: choose table / takeaway, product search, quantities, prep note; `Send to cashier` is one primary action; status pill `Waiting`, `Approved`, `Needs changes`, `Rejected`.
- Cashier inbox: compact card with time, waiter, table, 1–3 line preview, total; `Review`, `Approve & send`, `Reject` (reason). One-tap approval optional only where no validation discrepancy. Avoid automatic release before explicit approval.

**Acceptance:** two or more waiters submit simultaneously, ticket appears within e.g. 5 seconds when online; cashier approves once under simultaneous clicks; exactly one stock effect and each BAR/KITCHEN prep ticket emitted once; waiter cannot record payment or approve; prohibited API calls return 403; a stale ticket returns reviewable 409, no partial state; legacy POS order flow intact.

## SPRINT 3: Full single-cashier offline cash ledger (P0)

**Data-layer design**
- Add new IndexedDB version **incrementally**; never wipe or rename the existing store while pending commands may be present. Suggested objects: `cashSales`, `cashEntries`, `localStockMovements`, `localOrderTickets`, `outboxV2`, `syncReconciliations`, `localShiftLedger`, `localPrintEvidence`, `capabilityLeases` (retain existing `records`, `queue`, `drafts`, `offlineGrants` during migration).
- Ensure a **single readwrite IndexedDB transaction** stores (1) immutable sale envelope; (2) local cash entry; (3) provisional inventory deltas; (4) receipt/ticket; (5) outbox command with stable UUID; (6) local monotonic checkout sequence. Use `navigator.locks` across browser tabs; refuse new offline sale only when this same terminal is genuinely already processing a local commit or local store isn't durable.
- Make the sale envelope deterministic: business, outlet, till ID, cash drawer device, cashier, event timestamp, client transaction UUID, monotonic sequence, service destination, item snapshots/portion/modifier/price/tax, stock/bottle-consumption snapshot, currency, total minor, cash tendered minor, change minor, local document ID and signature/checksum evidence.
- Share the same pricing/tax algorithms between online and offline through a pure package or copied verified deterministic module, including inclusive tax, discounts, sealed bottle unit conversion (ml), modifiers, mixed units, and cash change. No independent rounding forks.
- Price and tax snapshot is locked to the customer-accepted sale. On sync, if server configuration changed, flag the discrepancy; never silently rewrite a cash-received transaction.
- Add a new `pos.offlineSale.commitV2` API command and versioned contract. It must be idempotent and atomic and must accept BAR and KITCHEN product routes. Keep `order.offlineCashSale` as supported legacy behavior for old PWAs until drained. Do not weaken other ONLINE_ONLY operations globally.
- The server validates device-capability signature, business/outlet/till ownership, payload UUIDs, counter uniqueness, catalog snapshots, stock movement consistency, currency, tax and tender. Store a durable replay/dedupe outcome with same command ID and payload hash. Reject command-ID mutation. If server detects stock or configuration conflict, preserve local cash evidence and create actionable `RECONCILIATION_REQUIRED`; **never erase a locally recorded cash receipt**.
- Project pending stock locally and show provisional balances; do not use fake settled figures in central reporting. When server confirms, collapse temporary local overlay without double deducting.
- Local cashier shift can collect cash offline, count cash locally and reconcile on reconnect. Closing remotely should not silently finalize a shift with unsynced sales. Prevent a new device/till from independently becoming offline cashier without explicit handoff and reconciliation.

**Offline identity/security**
- Provision only one specific enrolled checkout device for offline cash acceptance; signed, renewable device/outlet/role capability valid over configured shifts, no arbitrary one-sale/30-minute cap. Introduce V2 policy rather than widening v1 grants blindly.
- Secure offline reopening with a per-device local PIN/approved kiosk identity and cryptographically verifiable cached capability. Do not store raw credentials; secret keys remain server-side. Offline revocation is unknowable in real time, so constrain maximum lease duration, enforce local PIN lockouts, and reconcile activity on reconnection.
- Detect storage quota/storage eviction risk. Use `navigator.storage.persist()` where available, plus durable kiosk configuration and local encrypted recovery mechanisms if necessary. Local browser storage is not guaranteed durable through disk failure or profile deletion.

**Acceptance:** 100 varied offline cash sales across four-hour simulated outage, sequential order IDs, no unauthorized product-route filtering; 3 forced reloads; survive browser close/reopen with provisioned offline user; no lost/double cash and stock locally; cash drawer totals match; deduped replay; no second cashier enabled. Offline M-Pesa remains unverified; refunds, room charges and credit remain disabled offline unless separately approved.

## SPRINT 4: Automatic reconciliation and printing (P0/P1)

**Synchronization**
- Replace global blocking and one poisoned sequential queue with dependency-aware replay. Independent completed offline sales can proceed even when another sale enters review. Preserve within-order dependencies and local shift sequencing; never apply a payment without its order or ticket approval.
- Upon reconnect, use `commandStatus(id)` then replay identical payload+ID. Handle `CONFIRMED`, `RECEIVED`, `PROCESSING`, `REJECTED`, `CONFLICT`, `OUTCOME_UNKNOWN` individually. For HTTP timeout, retain same ID; do not silently produce a new `payment.record` ID.
- Recognize `navigator.onLine` as only a hint, not proof of API reachability; use authenticated API probe and retry with bounded jitter/backoff. Trigger on visibility, online and user request; periodic background work is best-effort only. UI shows `X locally recorded, Y pending, Z exceptions`.
- Reconcile cash, items, receipt numbering and stock. Idempotently issue official server documents only after confirmed central commit. Store local provisional slip identity, link final receipt and do not auto-print a second copy. Expose exportable local evidence for disaster recovery with privacy guardrails.
- Add a prominent but compact **Recovery / exceptions** panel accessible to cashier and manager. It must not block other independent cash sales. For unresolved cash already physically received, issue financial reconciliation workflow rather than losing transaction or treating failure as simple cancellation.
- KDS: during no internet, local cashier can print an order preparation ticket if local printer supports it. Waiter smartphones cannot auto-reach cashier/kitchen without LAN edge. No phantom station receipts.

**Acceptance:** API killed and restored; connectivity flapping; 100+ queue backlog; reboot between local commit and network send; server restarts after durable RECEIVE; replay 5x same IDs; rejected ticket approvals; sold sealed 750ml then count; sync after catalog price change; checksum/fiscal document reconciliation; independent ticket/status commands continue without deadlock.

## SPRINT 5: Release hardening and operations (P0)

- Add named CI suites: `pos2-cashier-ui`, `tickets-approval`, `offline-cash-ledger`, `offline-replay`, `backward-compatibility`, `schema-expand`, `PWA-update-pending-ledger`, `print-reconciliation`. Use real PostgreSQL 16 integration, not mocked db only.
- Test all RBAC permutations against actual API, including waiter POST to restricted payment/fire/void routes.
- Keep old POS and API protocol operable while flags off. Existing 73 catalogue items, CSV import, inventory, rooms, till, payment, KDS and receipt behavior must remain intact.
- Run `npm run lint`, `npm run contracts:check`, `npm run architecture:check`, `npm run build`, `npm test`, `npm run test:api`, `npm run test:browser:api`, `npm run test:browser:production`, `npm run audit:ui:gate`, `npm run docs:check`; these integration tests require disposable PG and browser dependencies as described in `docs/testing.md`.
- Preserve the repository's five green CI jobs. Explicitly repair/test the upstream API Dockerfile: import full API module graph as `node` user and verify `/app/contracts/permissions.json` and `roles.json` are files beneath executable directories. Do not rely solely on the bespoke repair staged at `/opt/serveos-next`.
- Add operator help/tour updates, screenshot comparisons, accessibility smoke, kiosk full-screen, quick recovery card, receipt layouts and privacy/access logging.

---

# E. Release/test gates (MUST PASS IN ORDER)

| Gate | Condition | Stop if |
|---|---|---|
| G0 Baseline | Live 3102 health, actual Nginx routing, source SHA/image ID, pending sync counts documented; fresh business DB backup + off-VPS restore verified | Any pending financial command unresolved or live health unhealthy |
| G1 Source | Feature branch committed; CI green; code review; signed build manifest; old UI/commands backward-compatible | Broken tests, permission regression, missed contract files |
| G2 Staging | Dedicated `serveos-stage` Compose project, isolated DB volume, ports 3202/3203 bound to loopback; synthetic business data | Any staging component shares live database or overwrites live files |
| G3 Migration | Restored staging DB tests; expand-only migration checks; old/new binaries against migrated schema | Irreversible migration, excessive locks, rollback incompatibility |
| G4 Candidate API | Image built, canary at unused loopback 3103, no public route; healthy, 72+ expected migration manifest | Wrong DB/secret, no health, fails origin/auth checks |
| G5 UI staging | Candidate PWA release under new immutable directory, exact assets+API compatibility verified, test staff workflows | Missing assets, stale SW, uncaught browser exceptions |
| G6 Internal pilot | Feature flags ON only authorized test/cohort; one terminal; waiter ticket and 100-offline-sales test | Lost/duplicate payments, unapproved stock consumption, wrong balances |
| G7 Controlled switch | Change only ServOS web symlink and API proxy target; test HTTPS, SMS hosts, DB, staff workflows | Any unrelated host fails or new routes return incorrect release |
| G8 Retention | Keep previous live API image/config and old PWA release; keep migrations additive; retain pending queue for replay | Any attempted deletion or cache clear with pending transactions |

**Health 200 and green CI are necessary but not sufficient:** business-flow and recovery tests must also pass.

---

# F. VPS: safe preflight (READ ONLY, run before every release)

From **Windows PowerShell**, use discrete SSH commands (no heredoc CRLF issues):

```powershell
$server = 'administrator@93.127.131.55'
$key = "$env:USERPROFILE\.ssh\id_ed25519"

ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker compose ls --all'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker volume ls'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n nginx -t'
ssh -T -o BatchMode=yes -i $key $server 'curl -fsS --max-time 10 http://127.0.0.1:3102/health/ready'
ssh -T -o BatchMode=yes -i $key $server 'readlink -f /var/www/serveos-next/current'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker inspect serveos-next-api-1 --format "{{.Image}} {{.State.Status}} {{.State.Health.Status}}"'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n grep -E "root /var/www/serveos|proxy_pass http://127.0.0.1:31" /etc/nginx/sites-enabled/serveos-production'
```

Separate each of the three unrelated HTTPS origin checks and record the HTTP response. Site 200 and SMS 307 (login redirect) were prior baseline, but measure again:

```powershell
ssh -T -i $key $server 'for h in detailskilonzo.com sms.detailskilonzo.com africa.detailskilonzo.com; do printf "%s " "$h"; curl -sS -o /dev/null -w "%{http_code} SSL:%{ssl_verify_result}\n" --resolve "$h:443:127.0.0.1" "https://$h/"; done'
```

For complete login/session verification use browser tests, because 307 alone doesn't prove SMS service health. Capture API and PWA source SHA/digests, Nginx active config checksum, env *variable names only* (no values), count of pending/unknown commands by status, live backup evidence. Never print credentials or bearer tokens to the terminal transcript.

**DO NOT continue if live accounting transactions are pending and the planned change touches their protocol or stored IndexedDB schema.** Drain/reconcile them first, or test exact old-command replay against the candidate API while both APIs remain available.

---

# G. Non-destructive staging on the existing VPS

Prepare a **new** staging project, never reuse the production Compose project or volume:

```
/opt/serveos-stage/           # isolated git/source + compose + private credentials
/var/www/serveos-stage/      # staged test PWA files
serveos-stage-postgres       # distinct container
serveos_stage_data           # distinct database volume
127.0.0.1:3202              # suggested staging API (check free)
127.0.0.1:3203              # suggested staging web server (check free)
```

- Use PostgreSQL 16 and Node 22. Source = exact candidate git SHA.
- Stage DB contains **synthetic or sanitized data only**, never production credentials. If using a restored production copy, restrict users, anonymize sensitive personal data, prevent SMS/email/M-Pesa transmissions, ensure workers and cron are disabled, and do not expose it on the public internet.
- Source checkout and Docker build contexts must be separate and mode-safe; correct upstream Dockerfile to include root permission contracts. Containers run unprivileged; preflight module imports as `node`.
- Build stage PWA with API origin **staging API**. DO NOT point stage PWA at the live `serveosapi.davemusau.co.ke`. The current API enforces a fixed `WEB_ORIGIN`; for SSH tunneled local staging use that actual local PWA origin (e.g. `http://127.0.0.1:3203`) and API `http://127.0.0.1:3202` as explicitly configured; test cookies/CORS/session and SW. Alternatively use dedicated correctly TLS-provisioned staging subdomains, only after separately authorizing their DNS and Nginx config.
- `ssh -L 3202:127.0.0.1:3202 -L 3203:127.0.0.1:3203` from developer workstation can expose staging services locally without opening VPS public ports. Never point the production PWA at 3202.
- Run full user flows, real API+PG integration, controlled worker settings, browser offline simulation and stable replay testing. Keep staging separated by project/volume/network and no public host by default.

---

# H. Production deployment sequence: no blind overwrite

## H0. DO NOT USE RETIRED DEPLOYER

`Deploy-ServOSProductionFeatures.ps1 -Mode Pwa` currently hardcodes `/var/www/serveos-prod`. Other modes use `serveos-prod-api-1` and port 3101. **It is not suitable for your successful `serveos-next` installation without refactoring and testing.** Do not execute it as-is. Change to required `-TargetEnvironment ServeosNext` or parameterized `-WebRoot -ComposeProject -ApiPort -ComposeFile`, validate against an explicit allowlist and fail closed if the current symlink or current virtual host doesn't match expected baseline. No silent fallback to old paths.

The current on-VPS API image uses a locally repaired staged build context because the repository API Dockerfile omitted required root permission JSON files. The first deployment task must commit the upstream Dockerfile correction and test the new image in staging. Otherwise the next production build can reintroduce `ERR_MODULE_NOT_FOUND` for `/app/contracts/permissions.json`.

## H1. Snapshot the **NEW LIVE** business, not the discarded old instance

The user explicitly chose not to preserve the *old* `serveos-prod` business database. This does NOT authorize risking data now being created in *new live* `serveos-next`.

Before releasing new code or schema:
- Read-only record `serveos-next` current container/image IDs, current DB migration names, business identity and representative totals, PWA release symlink, Nginx config checksum, queue and current POS order states.
- Take a consistent `pg_dump -Fc` of **new** database, verify `pg_restore -l`, copy encrypted off VPS, restore to a temporary isolated DB, and verify representative business totals. Keep database credentials private.
- Do not copy live `.env` into logs or upload it to GitHub. Keep at least 2 independently restorable generations of current business records.
- Confirm current cashier shift, order, ticket and payment state; pause only the affected high-risk writes briefly if essential for a migration, never assume quiet operation.

## H2. Publish expand-only SQL migrations

- Test against a staging restore first. All new objects use independent UUIDs, business scoping, unique command IDs and indexes. Establish a schema-compatibility test demonstrating the current production API still works **after** the migration.
- Production migrations run against the verified existing `serveos-next` database ONLY, with explicit confirmation and observed timing. Never use `db push` against a legacy Supabase project or volume recreation.
- Migrations are *not* rolled back by switching a PWA symlink or reverting the API Docker image. Recover via additive fix-forward migration wherever possible; DB restore is a separate business recovery decision requiring reconciliation of writes that occurred since snapshot.

## H3. Deploy canary API separately (blue/green)

- Build candidate immutable Node image by git SHA and Docker image digest. Configure a **separate container/service** (`serveos-pos2-canary-api`) on loopback port **3103** (only after port check), using the same intended production DB *only after compatible schema migration*, and the proper existing Docker private network. Keep original `serveos-next-api-1` alive on 3102.
- Candidate must not run migrations automatically on web requests, generate data on boot or start jobs that duplicate processing; if necessary use read-only validation until cutover. Restrict canary endpoint to loopback and keep its credentials root-only.
- First test with isolated staging DB. Then on production canary, test `/health/ready`, login/session, RBAC, GET projections and synthetic non-mutating checks. Do not run example sales against live business or issue duplicate print jobs.
- **Do not directly attach an untrusted container to the live database without passing the source/CI/restore/compatibility gates.**

## H4. Switch API route with verified rollback

- Current site: `/etc/nginx/sites-enabled/serveos-production`; expected production API proxies currently target `127.0.0.1:3102` (confirm live).
- Prior to changes, copy that one Nginx site file into an owned, restricted, timestamped release checkpoint. Preserve all certificate directives and all unrelated enabled sites.
- Edit **only** the two `proxy_pass http://127.0.0.1:3102;` lines belonging to the ServeOS API virtual host, including `/v1/sync/stream`, to `127.0.0.1:3103`. Fail if expected exact count/host does not match; never blanket replace every 31xx port across `/etc/nginx/`.
- Run `sudo nginx -t`; only then `sudo systemctl reload nginx` (graceful). Check serveos website, serveos API, SMS hosts, Details Kilonzo, and browser origin/CORS. Retain 3102 API and its image as an immediate route fallback while schema remains old-compatible.
- For rollout where changing API is unnecessary, skip API switch and deploy only a compatible PWA.

## H5. Stage and atomically switch PWA

- Build production PWA with `VITE_API_URL=https://serveosapi.davemusau.co.ke` and correct public verification keys; **never** ship signing private keys in the bundle. Confirm new feature flags OFF at first.
- Build from clean committed worktree; use `npm run build`, `npm run release:pwa:package`. The existing `scripts/package-pwa-release.mjs` creates SHA-bound SHA-256 manifest. Refactor target-aware web deployer to accept `serveos-next` root; it must verify archive paths/file hashes and immutable target release.
- Copy immutable build into `/var/www/serveos-next/releases/<candidate-git-sha>`. Do not overwrite existing directories, and make sure Nginx can traverse/read all asset paths.
- Preflight `readlink -f /var/www/serveos-next/current` and confirm expected previous release. Atomically replace **only** this symlink after checks; preserve previous symlink target in release record. Do not use `rm -rf` on existing releases.
- Probe production page, exact hashed JS/CSS referenced by current `index.html`, `/sw.js`, `/manifest.webmanifest`, API readiness, CORS preflight, login flow and cashier test business. Avoid clearing service-worker caches when pending commands exist. SW update must wait for durable local financial outbox and safe restart boundary.
- After new release is stable, enable **one feature cohort at a time** via server-configured flags; verify and only then expand to Countryside operators.

## H6. Rollback matrix

| Symptom | Immediate action | Notes |
|---|---|---|
| POS UI broken but API compatible | Disable `pos2.simpleCashier`, or atomically point PWA current symlink back to known-good bundle | Service worker may retain old/new caches; do not clear local IndexedDB. |
| Ticket approvals faulty | Disable **new ticket creation/approval** flag; continue legacy sales and preserve submitted tickets for repair | Do not delete ticket rows. |
| Offline ledger faulty | Disable **creation** of new offline sales; keep sync decoder, replay and recovery enabled | Never orphan recorded cash entries. |
| API error after switch | Restore only ServOS API `proxy_pass` from 3103 to 3102, validate and gracefully reload Nginx | Safe only if older API accepts migrated schema and pending command protocol. |
| Migration introduced incompatibility | Stop rollout, perform additive fix-forward; use restored DB only as explicitly approved disaster recovery | PWA symlink rollback does not revert PostgreSQL schema or transactions. |
| Failed unrelated-host baseline | Immediately restore only ServOS site checkpoint; verify why Nginx reload impacted unrelated host | Never restart/uninstall other Docker projects. |
| Printed document outcome unknown | Audit print evidence; ask operator to confirm physical output before retry | No automatic duplicate prints. |

**Rollback is not simply deleting the new API.** Business transactions committed after a candidate goes live must not disappear if old code is reinstated. Feature rollout must tolerate mixed versions and retained offline commands.

## H7. No-destruction list

Never use on this VPS during this sprint:

```
docker compose down -v
docker system prune -a --volumes
docker volume prune
docker rm -f $(docker ps -aq)
docker stop $(docker ps -q)
sudo rm -rf /opt/serveos-next
sudo rm -rf /var/www/serveos-next
git reset --hard     # in a workspace with local work
```

Never modify or remove `sms-platform`, `sms-platform-africa`, their Docker volumes/networks, their `.env` files, or Nginx sites `details`, `sms`, `africa-sms`. Avoid global `systemctl restart docker`; use per-project changes and graceful Nginx reload only after validation.

---

# I. Concrete verification commands for developer

Developer, from clean branch with correct test PostgreSQL configured:

```powershell
npm ci
npm ci --prefix apps/api
npm run lint
npm run contracts:check
npm run architecture:check
npm run build
npm test
npm run audit:ui:gate
npm run docs:check
# Only with a disposable PostgreSQL 16 in TEST_DATABASE_URL and Playwright installed:
npm run test:api
npm run test:browser:api
npm run test:browser:production
```

**Add test cases** for dedicated device: cashier vs waiter roles; ticket idempotency; `order.fire` once; BAR/KITCHEN prep tickets once; no stock consumption preapproval; 900 KES cash paid display; pending sync UI; 100 offline sales; 100 replays; browser process crash; partial network restoration; cached identity and expired capability; stock ml precision; SW version update while queue nonempty; receipt duplicate protection; old/new API compatibility.

Release information to paste into PR/release record:

```
release_sha=<40hex>
ci_run=<url>
api_image_digest=<sha256>
pwa_manifest_sha256=<sha256>
prod_migration_before=<name>
prod_migration_after=<name>
backend_health=<expected/applied>
preflight_sms_status=<codes>
preflight_details_status=<code>
prod_backup_restored=<YES + evidence>
staging_acceptance=<PASS + evidence>
cashier_pilot_transactions=<count>
replay_duplicates=0
pending_unresolved_cash=0
rollback_pwa=<path>
rollback_api=<image and loopback port>
feature_flags=<values>
operator_approver=<name/role>
```

---

# J. One-page developer implementation rules

1. **Reuse** existing `pos-commands`, `payment-commands`, inventory pricing, KDS, `command-kernel` and PostgreSQL transaction model. Add only the commands/data required for tickets and single-device offline receipts. No second parallel billing engine.
2. **Waiter ticket is not a sale** until the cashier approves; approval is exactly-once and initiates existing fire/stock/KDS logic. No waiter permissions for settlement.
3. **One enrolled offline cashier terminal** holds local operational continuity; other devices are ticket clients (online) or local draft holders (offline).
4. The cashier's main screen is **products + bill + Pay**, not a vertical aggregation of ten admin modules. Make it genuinely operable in 1366x768 and 1024x768, including scanner.
5. Money and stock must reconcile by stable UUIDs and explicit status. Never say `confirmed` based on a saved local command or optimistic UI notification.
6. Preserve old protocols/UI while flags are off. No destructive migrations or schema rewrite. Do not introduce client cache wipes.
7. Stage with **separate database and API**, validate with real Postgres and production-like browser tests, only then canary the API and atomically switch ServOS routes.
8. Never use the current hardcoded `serveos-prod` deploy script to update `serveos-next`; parameterize, preflight and rehearse it first.
9. **Production remains open and usable** until the complete successor passes business verification. A green CI check alone is not permission to cut over.
10. Never touch the unrelated SMS projects or Details Kilonzo website; measure their health before and after release.

## Definition of done

At Countryside a waiter submits a ticket, the cashier approves it, the bar/kitchen receives the appropriate items once, a cashier takes cash and gets correct change, sales survive hours of API downtime on the single checkout terminal, then reconcile automatically without data loss or duplicates. The POS has no superfluous scrolling to finish ordinary sales, and all pre-existing production systems and records remain intact. Any necessary caveat about physical printer evidence, fiscal receipt compliance or offline M-Pesa confirmation is explicit rather than disguised as a passed test.
