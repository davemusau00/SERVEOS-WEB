# ServOS Final Sweep - Development Instruction

_Updated live-codebase closeout plan_

| Field | Reviewed value |
| --- | --- |
| Repository | `davemusau00/SERVEOS-WEB` |
| Branch | `reset/vps-platform` |
| Last hosted source SHA | `e1ba544d19bae9d536c32ce6f4e0a8621212f5bd` (Actions run in progress) |
| Current locally verified source | `88a2a7ebc8ca2d6ee5ad021f45583caee8a16b4b` with expanded POS PostgreSQL acceptance |
| Current branch state | `reset/vps-platform` is 1 local commit ahead of origin; hosted CI has not yet run on the current local SHA |
| Branch delta | 203 commits ahead of `main`, 0 behind |
| Migration high-water | `068_pos_order_merge.sql` |
| Primary goal | Finish the Web/API/PostgreSQL reset in one continuous engineering sweep |
| Scope exclusion | Actual current Countryside terminal data migration/import |

## Live progress - 2026-10-08

| Gate | Status | Current evidence |
| --- | --- | --- |
| Reviewed source | `88a2a7ebc8ca2d6ee5ad021f45583caee8a16b4b` | Local API, root and lint checks passed on this exact commit. |
| Current branch | `88a2a7ebc8ca2d6ee5ad021f45583caee8a16b4b` | `reset/vps-platform`; one local commit ahead of `origin/reset/vps-platform`. |
| Hosted CI | **IN PROGRESS; previous completed run failed** | [Run 37801328821](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37801328821) is running on `e1ba544`; [run 37800328883](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37800328883) failed on an earlier POS-test commit. The current local commit still needs a hosted run. |
| Hosted Windows printer shell | **PASS on earlier source; latest run pending** | The completed Windows printer-shell check passed on the earlier source-equivalent run. |
| Hosted PWA/API/PostgreSQL browser acceptance | **PASS** | The browser acceptance step passed in the same API/PostgreSQL job. |
| Local API/PostgreSQL | **PASS** | 23/23 on disposable PostgreSQL 16.15, including expanded POS sale, floorplan, transfer and merge acceptance. |
| Local source checks | **PASS** | Root tests 218/218, lint, and UI prompt gate passed on this checkout. |
| UI operator review | **OPEN** | The UI gate found no browser prompt/confirm calls; 619 review findings remain unaccepted, so workflows are not marked reviewed. |
| Local desktop compilation | **PASS** | `npm run check:desktop` passed on the source-equivalent tree; Cargo reported six warnings and no errors. |
| Final green release SHA | **OPEN** | The hosted API/PostgreSQL failure still blocks a full green baseline. Targeted POS development and local acceptance have proceeded as directed; neither closes this release gate. |

The last completed hosted failure was in the API/PostgreSQL test step; its real browser-to-API acceptance passed. Public job-log and artifact endpoints returned HTTP 403, so the precise failure remains unknown. Newer runs are in progress; the current local commit has not yet received hosted CI.

## 0. Executive instruction

The repository is now feature-near-complete and materially more verified than the earlier sprint documents reflected.
Do not continue broad feature expansion.
The remaining work is now:

- resolve the final hosted API/PostgreSQL integration failure
- keep the Windows printer-shell job green at the final SHA
- close POS / floorplan / transfer / merge acceptance
- close the full revenue chain
- close Procurement
- close Customer Credit
- close PMS
- close Finance / Assets
- prove bounded offline cash POS
- finish physical Print Bridge acceptance
- finish staging / restore / rollback
- remove silent legacy authority paths
- replace stale documentation with a current-codebase documentation set
- obtain one exact fully-green release SHA

Do not perform the live Countryside data migration in this sweep.
The system should finish this sweep ready to receive that data later.

## 1. Current completion state

Inherited planning estimates (not remeasured in this progress update and never release evidence):

| Measure | Estimate |
| --- | ---: |
| Source implementation | ~98-99% |
| Workflow coverage | ~97-98% |
| Verified implementation | ~81% |
| Production readiness | ~72% |
| Web-first reset | ~97% |

Domain estimates inherited from the prior code review:

| Area | Estimate |
| --- | ---: |
| Architecture / platform | 98% source |
| API / PostgreSQL kernel | 97% |
| Auth / Staff / Device / Session | 99% |
| Bootstrap / browser recovery | 96% |
| Catalog | 98% |
| Inventory | 96% |
| POS | 95% |
| Floorplan / table service | 85% |
| Revenue chain | 86% |
| Procurement | 86% |
| Customer Credit | 91% |
| Print Bridge | 97% |
| Offline cash POS | 48% |
| Hotel / PMS | 79% |
| Finance / Expenses | 72% |
| Assets / Maintenance | 73% |
| Deployment / VPS | 28% |
| Backup / restore | 18% |

Percentages are planning aids only. Final completion is determined by evidence-backed PASS/FAIL gates.

## 2. What has already been proven

Do not treat the following as blank phases. They must still be rerun at the final release SHA, but substantial evidence already exists.

### 2.1 Hosted CI at the reviewed source

GitHub Actions run [#37795083074](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37795083074) completed on `e05870e8afeda56bf060aebb8d1e18ccaec02ea2`. This commit changes the instruction document only relative to the locally tested source SHA.

| Job | Status |
| --- | --- |
| `frontend` | PASS |
| `browser-preview` | PASS |
| `browser-production` | PASS |
| `native-domain` | PASS |
| `cloud-protocol-base` | PASS |
| `cloud-protocol-v2` | PASS |
| `desktop-shell` | PASS |
| `windows-printer-shell` | PASS |
| Print Bridge - Ubuntu | PASS |
| Print Bridge - Windows | PASS |
| `evidence-summary` | PASS |
| `api-postgres` | FAIL |
| `release-candidate` | SKIPPED |

The Windows Print Bridge job passed its hosted checks, including the Windows service job. Keep these green while fixing the API suite.

### 2.2 Current hosted API/PostgreSQL failure

The confirmed remaining hosted software failure is:

| API/PostgreSQL job step | Status |
| --- | --- |
| API unit / PostgreSQL integration tests | FAIL |
| Real PWA / API / PostgreSQL acceptance | PASS |

The browser-to-API-to-PostgreSQL acceptance step passed in that run. Newer Actions run [#37801328821](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37801328821) is in progress on `e1ba544`; the current local commit `88a2a7e` is one commit ahead and has not yet received hosted CI. Job details remain inaccessible through the public endpoint.

### 2.3 Auth locally passed

| Check | Result on this checkout |
| --- | --- |
| npm run test:api | PASS - 23 passed, 0 failed, 0 skipped |
| npm run test:browser:api | PASS |
| Web storage acceptance | PASS |
| npm test | PASS - 218 passed, 0 failed |

Verified behavior includes:

- initial Admin concurrency
- setup-secret retirement
- password lifecycle
- device challenge / enrollment / replay
- cross-staff device collision
- staff create/update/deactivate
- permission ceilings
- last-Admin protection
- session review/revocation
- device revocation
- 15-minute access expiry
- refresh rotation
- refresh retry
- refresh replay/family revocation
- logout
- disabled staff refusal
- password-change session invalidation
- multi-tab refresh locking
- SSE refresh
- credential redaction/storage rules

Treat Auth as locally closed unless regression evidence appears.

### 2.4 Bootstrap / browser recovery locally passed

Current repo evidence includes:

- interrupted snapshot transfer
- same-snapshot resume
- manifest corruption refusal
- page hash corruption refusal
- collection-count mismatch
- high-water validation
- snapshot expiry
- pending-command guard
- OUTCOME_UNKNOWN guard
- QuotaExceededError simulation
- IndexedDB activation abort rollback
- large 1,203-record snapshot
- projection deletion + server rebuild
- authorization tuple binding

Treat Bootstrap as locally closed and guard against regression.

### 2.5 Catalog locally passed

Current repo evidence includes:

- barcodes
- aliases
- purchase packages
- recipes
- portions
- modifiers
- outlet assignments
- archive blockers
- reactivation
- duplicate-code/barcode refusal
- stale versions
- bootstrap tombstones
- concurrent archive/edit
- response-loss replay
- operator UI
- physical-count barcode use

Recorded local results:

| Check | Result |
| --- | --- |
| API tests | PASS |
| Real browser/API/PostgreSQL | PASS |
| Root tests | PASS |
| Lint | PASS |

Treat Catalog as locally closed.

### 2.6 Inventory core locally passed

Current repo evidence includes:

- package conversion
- weighted-average cost
- concurrent receives
- duplicate receipt source reference
- response-loss replay
- sealed bottle receiving
- full physical count
- selected count
- count revision race
- transfer replay
- waste reversal
- transfer reversal
- later-activity reversal refusal
- sealed/open bottle conservation
- browser Full Count
- browser Quick Count

Remaining Inventory work is mostly cross-domain acceptance:

- POS consumption
- modifier consumption
- void return
- GRN / partial GRN
- supplier physical return
- batch preparation

Do not reopen Inventory architecture.

## 3. Non-negotiable architecture

**Canonical authority:**
```text
PWA
 |
ServOS API
 |
PostgreSQL
```
**Canonical command path:**
```text
UI intent
-> durable command UUID
-> canonical payload
-> authentication
-> permissions
-> expected versions
-> manager approval if required
-> PostgreSQL transaction
-> audit / immutable evidence
-> ordered change feed
-> durable command outcome
-> local projection
```
**Canonical browser recovery:**
```text
authenticated snapshot
-> manifest
-> high-water cursor
-> page hashes
-> staged IndexedDB data
-> count/hash verification
-> atomic activation
-> change-feed continuation
```
**Canonical printing:**
```text
PWA
-> signed localhost HTTPS
-> Print Bridge
-> API claim verification
-> durable local print journal
-> Rust renderer / transport
-> Windows RAW or TCP 9100
-> printer
```
No dual writers. No direct browser shared-database mutation. No silent Supabase fallback. No Tauri/SQLite shared business authority after cutover.

## 4. Final sweep execution rules

### 4.1 No more tests deferred

Every changed workflow must receive acceptance coverage in the same sweep.

### 4.2 No broad new module

Allowed:

- complete an existing workflow
- fix an invariant
- add a required constraint
- fix operator UX required by an existing workflow
- add missing acceptance tests
- add missing audit/reconciliation evidence
- finish deployment/recovery behavior
- remove obsolete authority

Not allowed:

- new speculative business module
- new unrelated dashboard
- new second migration architecture
- new competing storage authority

### 4.3 Do not manufacture green

Never:

- skip a required test
- weaken a constraint to satisfy a test
- remove assertions because behavior is broken
- hide a race with arbitrary delay
- catch-and-ignore an accounting mismatch
- convert a real failure into a warning

Fix the product.

## 5. Step 1: fix the last hosted API/Postgres failure

This is the highest-priority software blocker.

| Hosted check | Status |
| --- | --- |
| npm run test:api | FAIL |
| npm run test:browser:api | PASS |

Current local evidence is 22/22 against PostgreSQL 16.15 under Node 26.5.0 and Node 22.23.3. Seven Linux Node 22.23.3 runs passed; three used a two-CPU limit, and one repeated the CI sequence with fresh API/root installs, Playwright system/browser installation, CI environment flags, and the exact npm test script.
Investigate the CI/local discrepancy as deterministic test-isolation or environment work. The public Actions log endpoint and the API-job artifact download returned HTTP 403, so the test-level failure has not been identified yet.
Check:

- test ordering
- schema isolation
- migration 045 constraint fix
- environment variables
- parallelism
- shared fixture IDs
- time dependence
- timezone
- token expiry timing
- PostgreSQL advisory locks
- service startup timing
- fixture cleanup
- sequence values
- current_timestamp assumptions
- Node 22 behavior
- filesystem assumptions

**Reproduce with:**

- PostgreSQL 16
- Node 22
- fresh dependencies
- fresh schema
- same CI environment variables

Required exit:

- api-postgres PASS

The real PWA/API/PostgreSQL browser acceptance must continue to pass.
Required exit:

- api-postgres PASS

The real PWA/API/PostgreSQL browser acceptance must continue to pass.

## 6. Step 2: confirm Windows printer shell hosted gate

At the current source-equivalent SHA, the hosted `windows-printer-shell` job completed successfully in run [#37795083074](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37795083074).
The job covered the Windows desktop check, desktop tests, native Rust tests, and artifact upload.
Status for the reviewed SHA:

| Check | Status |
| --- | --- |
| npm install | PASS |
| Rust toolchain | PASS |
| `npm run check:desktop` | PASS |
| `npm run test:desktop` | PASS |
| `cargo test src-tauri` | PASS |
| Artifact upload | PASS |

This gate is closed for the current source-equivalent SHA and must be rerun on the final candidate SHA. If it regresses, fix it without regressing the dedicated Windows Print Bridge job.
Exit:

- windows-printer-shell PASS

## 7. Step 3: lock the current green baseline

Once the hosted API/PostgreSQL test passes and the Windows printer-shell job remains green, obtain one exact SHA where:

- api-postgres             PASS
- frontend                 PASS
- browser-preview          PASS
- browser-production       PASS
- native-domain            PASS
- cloud-protocol-base      PASS
- cloud-protocol-v2        PASS
- desktop-shell            PASS
- windows-printer-shell    PASS
- print-bridge Ubuntu      PASS
- print-bridge Windows     PASS
- evidence-summary         PASS
- Record the SHA as the final-sweep baseline.
- All later domain work must keep this matrix green.

## 8. Step 4: POS / floorplan / table service acceptance

This is now the biggest unclosed core domain.
Current source includes:

- counter orders
- takeaway orders
- table orders
- selling options
- modifiers
- notes
- courses
- partial fire
- preparation states
- KOT / BOT
- rounds
- repeat round
- discount
- item comp
- order comp
- void
- customer assignment
- floorplan
- table.ready
- order.transfer
- order.merge
- room charge

Do not add more features. Close what exists.

#### Verified API/PostgreSQL slice (2026-10-08)

`apps/api/tests/pos-lifecycle.integration.test.mjs` now covers real PostgreSQL customer assignment, portions/modifiers, note/course capture, partial KOT/BOT fire, kitchen preparation transitions, repeated and later rounds, discount/item comp, split cash plus cashier-confirmed M-Pesa, immutable receipt, consumed-order void, concurrent table opening and transfer races, active-table edit refusal, line-preserving merge, merged-order mutation refusal, and cleaning/ready transitions. It verifies idempotent replay, exactly-once stock/event/document effects, and ordered change-feed entries.

`npm run test:api` passed **23/23** against disposable PostgreSQL 16.15, root `npm test` passed **218/218**, `npm run lint` passed, and `npm run docs:check` passed. This is partial acceptance, not POS phase completion. Order-level comp, the full transfer/merge rejection matrices, inactive-table archive, fired/settled table edge cases, browser cashier/barcode/reload workflows, and physical print behavior remain open. Hosted acceptance of the current local commit is pending; the earlier hosted API failure has inaccessible logs.

### 8.1 Standard POS lifecycle

Test:

- open till
- create order
- add product
- scan barcode
- selling option
- modifier
- note
- course
- partial fire
- KOT
- BOT
- prep transition
- repeat round
- later round
- discount
- comp
- void
- customer assignment
- settlement
- receipt

Verify:

- stock consumption exactly once
- events exactly once
- documents exactly once
- change-feed projection converges
- command replay does not duplicate
- response loss recovers original result

### 8.2 Floorplan

Test:

- create/update layout
- archive inactive table
- refuse destructive active-table edit
- open table order
- second terminal races same table
- only one succeeds
- finish order
- table becomes cleaning
- table.ready
- table returns available
- Use real PostgreSQL concurrency.

### 8.3 Order transfer

Test:

- source order revision
- source table revision
- destination table revision
- same outlet
- unsettled order
- no active prep
- destination available
- atomic transfer
- source cleaning
- destination occupied

Refuse:

- settled
- cross-outlet
- active preparation
- stale source
- stale destination
- already occupied destination
- Race two transfers to one destination. Only one succeeds.

### 8.4 Order merge

- Migration 068_pos_order_merge.sql must receive full acceptance.

**Explicitly define and test:**

- which order survives
- which order becomes MERGED
- merged_into_order_id
- line preservation
- round preservation
- preparation preservation
- customer identity policy
- discount/comp preservation
- table state
- payment eligibility
- receipt behavior
- close-day behavior
- stock behavior

Hard invariants:

- no stock consumed twice
- no fired line fired twice
- no KOT/BOT duplicated
- MERGED order cannot accept new business mutation
- merged source not double-counted in sales/close day
- target version advances
- source version advances

Race:

- merge vs payment
- merge vs add-line
- merge vs transfer
- two simultaneous merges
- Response-loss replay must recover the same merge.

### 8.5 Multi-terminal POS race matrix

At minimum:

- line add
- quantity
- modifier
- note
- course
- fire
- prep state
- round
- repeat round
- discount
- comp
- void
- transfer
- merge
- payment
- customer credit
- room charge

No last-write-wins business loss.
Exit:

- POS PASS
- FLOORPLAN PASS
- TRANSFER PASS
- MERGE PASS
- MULTI-TERMINAL PASS

## 9. Step 5: close inventory cross-domain linkage

- Core Inventory is locally proven. Finish only remaining integration edges.
- POS linkage

Verify:

- direct-stock product
- recipe product
- selling-option quantity
- portion
- modifier ingredients
- repeat round
- void return
- comp policy
- Procurement linkage

Verify:

- GRN
- partial GRN
- second GRN
- package conversion
- weighted cost
- supplier physical return
- Batch preparation

Verify:

- ingredient versions
- finished output
- weighted cost
- sealed/open constraints
- response loss
- concurrent stock mutation

Exit:

- POS STOCK LINK PASS
- PROCUREMENT STOCK LINK PASS
- BATCH PASS
- CONSERVATION PASS

## 10. Step 6: revenue / payments / tills / journals / close day

Treat this as one atomic business domain.
Supported channels:

- cash
- manual M-Pesa
- manual card / external
- split tender
- Customer Credit
- POS room charge

External references are already shared across:

- POS
- Customer Credit
- supplier payment
- guest folio
- expenses

Now prove them.

### 10.1 Payments

Test:

- full cash
- full M-Pesa
- full card
- cash + M-Pesa
- cash + card
- multiple partial payment
- duplicate external reference
- same reference race
- response loss

### 10.2 Refund / reversal

Test:

- partial refund
- second partial refund
- full remaining refund
- over-refund refusal
- cash refund
- external refund evidence
- full reversal
- response loss

### 10.3 Till

**Equation:**

```text
opening float

+ cash sales
+ Customer Credit cash collections
+ paid in

cash refunds
credit cash reversals
cash expenses
paid out
=
expected drawer

```

Test:

- blind count
- variance
- manager variance approval
- close
- reopen policy

### 10.4 Journal

**Every financial operation must satisfy:**

- sum(debit) == sum(credit)

No orphan journal, duplicate journal, missing source link or missing tax evidence.

### 10.5 Close day

Must reconcile:

- sales
- MERGED-order exclusion
- discounts
- comps
- zero-value sales
- cash
- M-Pesa
- card
- refunds
- Customer Credit sales accrual
- credit reversal
- credit collection
- POS room charge
- room-charge reversal
- VAT
- levy
- journals
- drawer
- variance
- expenses where included

Exit:

- PAYMENTS PASS
- REFUNDS PASS
- TILL PASS
- JOURNALS PASS
- CLOSE DAY PASS
- MONEY RECONCILIATION PASS

## 11. Step 7: procurement complete

**Test end-to-end:**

- supplier
- -> PO draft
- -> approve
- -> issue
- -> partial GRN
- -> second GRN
- -> Inventory
- -> payable
- -> invoice match
- -> supplier payment

Then:

- supplier return
- -> physical return
- -> supplier credit note
- -> credit application
- -> payable settlement

Edge acceptance:

- duplicate receive
- over-receive refusal
- manager-approved over-receive
- concurrent GRN
- package conversion
- weighted average cost
- duplicate invoice
- duplicate external payment reference
- partial supplier payment
- multiple payments
- payment after credit
- credit after payment
- return cancel
- later stock movement
- response loss
- Reconcile Inventory, payable, supplier payment, credit note, credit application, documents and journals/evidence.

Exit:

- PROCUREMENT PASS
- PAYABLE PASS
- SUPPLIER PAYMENT PASS
- SUPPLIER RETURN PASS
- SUPPLIER CREDIT PASS

## 12. Step 8: Customer Credit complete

Run full matrix:

- customer create
- account configure
- terms
- limit
- credit sale
- limit refusal
- manager override
- journal
- statement
- partial settlement
- second settlement
- cash settlement
- external settlement
- duplicate external reference
- write-off
- charge reversal
- settlement reversal
- write-off reversal
- FIFO allocation
- aging
- statement continuation
- stable high-water
- reconcile match
- reconcile mismatch
- discrepancy resolution
- close-day accrual
- close-day cash collection
- response loss
- concurrency
- Reconcile customer ledger, AR journal, order, till, close day, statement and aging.

Exit:

- CUSTOMER CREDIT PASS
- AGING PASS
- STATEMENTS PASS
- RECONCILIATION PASS
- DOCUMENTS PASS

## 13. Step 9: hotel / PMS complete

PMS source is already broad. Apply migrations and test, do not redesign.
Current source covers:

- room types
- rooms
- rate plans
- availability
- reservation
- modification
- cancellation
- no-show
- walk-in
- check-in
- stay
- extension
- room move
- folio
- folio payment
- checkout
- housekeeping
- maintenance
- POS room charge
- room-charge reversal
- documents

### 13.1 Property masters

Test:

- room type create/edit
- capacity rule
- room create/edit
- rate plan create/edit
- invalid reference
- stale revision

### 13.2 Availability + reservation

Test:

- availability
- guest count
- date/timezone
- reserve
- modify
- cancel
- no-show
- walk-in
- maintenance exclusion

Hard concurrency:

- two overlapping incompatible reservations
- => only one succeeds

### 13.3 Stay lifecycle

Test:

- reservation check-in
- walk-in check-in
- stay extension
- room move
- stale room/stay version
- double check-in refusal

### 13.4 Folio

Test:

- nightly charge
- service charge
- POS room charge
- manual adjustment
- cash payment
- external payment
- balance
- document

### 13.5 POS room charge

Verify:

- active checked-in guest
- open folio
- fully fired order
- remaining order balance
- pos.roomCharge
- folio receivable
- sales/tax journal
- order settlement
- receipt
- print queue

**Reversal:**

- eligible unpaid charge
- exact versions
- folio reversal
- linked order reversal
- journal consistency
- single reversal
- response loss

### 13.6 Checkout

Test:

- zero-balance checkout
- explicit unpaid-balance rule
- checkout evidence
- room transition
- housekeeping queue
- folio immutability

### 13.7 Housekeeping / maintenance

Test:

- DIRTY
- CLEANING
- INSPECTED
- READY
- OUT_OF_SERVICE

- maintenance block
- availability exclusion
- work order
- resolution
- return to service

Exit:

- PMS MASTERS PASS
- AVAILABILITY PASS
- BOOKING CONCURRENCY PASS
- CHECK-IN PASS
- STAY PASS
- FOLIO PASS
- ROOM CHARGE PASS
- CHECKOUT PASS
- HOUSEKEEPING PASS
- MAINTENANCE PASS

## 14. Step 10: finance / expenses complete

- Migration 065 source already exists.

Verify:

- expense category create
- expense category edit
- stage expense
- approve/post
- reject
- cash expense
- external expense
- unique external reference
- till cash outflow
- balanced journal
- voucher
- event history
- sales/expense period report
- debtor aging
- payable aging
- supplier-payment summary
- property timezone handling
- invalid calendar date rejection

Do not expand into a full enterprise general ledger.
Exit:

- EXPENSES PASS
- CASH LINK PASS
- JOURNALS PASS
- VOUCHERS PASS
- REPORTS PASS

## 15. Step 11: assets / maintenance complete

Verify:

- asset category
- asset create/edit
- unique tag
- location
- room/area linkage
- custodian
- reviewed staff revision
- condition
- history
- maintenance request
- work order
- vendor/assignee
- cost
- status
- resolution
- Unify with PMS maintenance rules. There must not be contradictory room-maintenance authorities.

Exit:

- ASSETS PASS
- CUSTODY PASS
- HISTORY PASS
- WORK ORDERS PASS
- PMS LINK PASS

## 16. Step 12: bounded Offline Cash POS

- Keep scope to order.offlineCashSale.

Verify:

- obtain explicit grant while connected
- one-command authorization
- <= 30 minute grant
- permissions
- review product versions
- review stock balance revisions
- review till/account/settings
- disconnect
- queue one sale
- close browser
- restart Windows
- reopen
- recover queued command
- reconnect
- submit original UUID
- order once
- stock once
- cash payment once
- receipt only after server confirmation
- grant quota once
- rejected/conflicted command consumes quota
- response-loss recovery
- stale stock rejection
- operator reconciliation instruction

Explicitly refuse offline:

- M-Pesa
- card
- credit
- refund
- full reversal
- managerApproval.issue
- supplier payment
- room charge
- kitchen/bar preparation-routed sale
- staff/device/session management

Exit:

- OFFLINE CASH PASS
- RESTART PASS
- RECONNECT PASS
- IDEMPOTENCY PASS
- STOCK PASS
- MONEY PASS

## 17. Step 13: Print Bridge runtime / hardware closeout

- Automated Linux and Windows Print Bridge CI is already green on current HEAD.

Do not rebuild its architecture. Finish runtime proof.

### 17.1 Crypto / trust

Test:

- TypeScript signature -> Rust verification
- API claim -> Rust verification
- live API claim check
- tampered payload refusal
- tampered device refusal
- wrong business refusal
- expired claim refusal
- revoked device refusal

### 17.2 Pair / revoke

Test:

- pair
- approve
- unknown refusal
- revoke
- revoked device cannot print

### 17.3 Crash / uncertainty

**Terminate processes at:**

- before persistence
- after persistence
- before transport
- during transport
- after possible spool
- before server outcome
- after server outcome
- before browser response

**Invariant:**

- possible physical output
- => DELIVERY_UNCERTAIN
- No blind auto-reprint.

### 17.4 Windows service

**Prove on Windows:**

- install
- SCM registration
- LocalService identity
- ProgramData ACL
- certificate / TLS
- approved config
- service start
- worker start
- restart
- stop
- uninstall
- journal preservation

### 17.5 Physical printer

If target hardware is available, run:

- sale receipt
- refund
- KOT
- BOT
- cancel
- void
- close day
- PO
- GRN
- supplier return
- supplier payment
- customer credit invoice
- customer payment acknowledgement
- folio
- logo
- M-Pesa QR
- long document
- margins
- cutter
- paper out
- printer off
- queue stall
- USB interruption
- TCP/LAN interruption
- power interruption

If hardware is unavailable, do not fake PASS. Create a precise terminal acceptance harness and mark EXTERNAL GATE.

## 18. Step 14: VPS / production readiness

Finish production-like topology:
Internet
 |
Nginx
 |--- PWA
 |
 +--- API
       |
    private network
      /       \
PostgreSQL   worker
      \
      backup
Verify:

- TLS
- strict CORS
- refresh-cookie behavior
- private PostgreSQL
- secret loading
- migrations
- API restart
- PostgreSQL restart
- worker restart
- health
- readiness
- release SHA
- schema version
- resource limits
- disk monitoring
- logging
- backup age
- immutable activation
- rollback

Readiness must validate database reachability, expected migration high-water, critical schema objects, required config and required secrets.

## 19. Step 15: backup / restore proof

Use synthetic/staging data only. Do not use Countryside live data.
Prove:

- staging PostgreSQL
- -> pg_dump
- -> encryption
- -> off-node destination or configured simulation
- -> clean PostgreSQL
- -> decrypt
- -> restore
- -> start API
- -> login
- -> verify representative data

Verify:

- Auth
- Catalog
- Inventory
- POS
- Revenue
- Procurement
- Customer Credit
- PMS
- Finance
- Assets
- audit
- commands
- documents
- Record backup duration, backup size, restore duration, commands and verification outcome.

Exit:

- BACKUP PASS
- RESTORE PASS
- RUNBOOK PASS

## 20. Step 16: complete synthetic staging scenario

No Countryside business data.
**Run one contiguous scenario:**

- Admin setup
- staff
- device
- session
- manager approval
- bootstrap rebuild

- Catalog
- Inventory receive/count/transfer/waste

- supplier
- PO
- GRN
- payable
- invoice
- supplier payment
- supplier return
- supplier credit

- counter POS
- table POS
- floorplan
- course
- round
- KOT/BOT
- transfer
- merge
- discount
- comp
- void

- cash
- manual M-Pesa
- manual external/card
- split
- refund
- reversal

- Customer Credit
- statement
- settlement

- room type
- room
- rate
- reservation
- check-in
- POS room charge
- folio payment
- room move
- checkout
- housekeeping

- expense
- asset
- maintenance

- Print Bridge contract

- backup
- restore
- release rollback

Reconcile:

- stock
- cash
- external payment references
- journals
- AR
- supplier payables
- Customer Credit
- folios
- room states
- till
- close day
- Zero unexplained variance.

## 21. Step 17: legacy authority cleanup

**Search for remaining legacy business writers:**

- /rest/v1
- rpc/servos_v2_
- Supabase mutation paths
- Tauri business mutation paths
- SQLite business writers
- legacy POS mutation
- legacy hospitality mutation
- legacy finance mutation

Required production invariant:

- API authority active
- => ZERO silent legacy business writers

Legacy source may remain only for migration evidence, parity fixtures, historical migrations, explicit read-only fallback or useful native printer transport.
No silent fallback.

## 22. Step 18: fresh current documentation set

The reset-era truth docs are historical.
Create a clean current-codebase reference set:

- docs/current/00-SYSTEM-OVERVIEW.md
- docs/current/01-ARCHITECTURE.md
- docs/current/02-REPOSITORY-STRUCTURE.md
- docs/current/03-DATABASE-AND-MIGRATIONS.md
- docs/current/04-AUTH-STAFF-DEVICE-SESSIONS.md
- docs/current/05-COMMAND-KERNEL-SYNC-RECOVERY.md
- docs/current/06-CATALOG-INVENTORY.md
- docs/current/07-POS-FLOORPLAN-TABLE-SERVICE.md
- docs/current/08-PAYMENTS-TILLS-JOURNALS-CLOSE-DAY.md
- docs/current/09-PROCUREMENT.md
- docs/current/10-CUSTOMER-CREDIT.md
- docs/current/11-HOTEL-PMS.md
- docs/current/12-FINANCE-ASSETS.md
- docs/current/13-OFFLINE-POS.md
- docs/current/14-PRINT-BRIDGE.md
- docs/current/15-DEPLOYMENT-VPS.md
- docs/current/16-BACKUP-RESTORE.md
- docs/current/17-TESTING-ACCEPTANCE.md
- docs/current/18-SECURITY-MODEL.md
- docs/current/19-OPERATIONS-RUNBOOK.md
- docs/current/20-RELEASE-CUTOVER-READINESS.md

- docs/current/CURRENT-IMPLEMENTATION-STATUS.md
- docs/current/COMMAND-CATALOG.md
- docs/current/PERMISSION-CATALOG.md
- docs/current/DOCUMENT-CATALOG.md
- docs/current/MIGRATION-CATALOG.md

Generate from current source. Do not blindly copy old reset docs.
npm run docs:check must pass afterward.

## 23. Countryside migration - excluded by scope

Do not perform:

- live terminal extraction
- live SQLite inspection
- Countryside-specific record mapping
- Countryside-specific normalized CSV generation
- final stock balance conversion
- customer-credit cutover conversion
- supplier payable cutover conversion
- live import
- terminal write freeze
- final business cutover

Allowed:

- retain migration templates
- retain forensic export script
- retain generic reconciliation utilities
- retain destination schema readiness
- document later migration entry point

The later process remains:

- terminal forensic export
- -> inspect actual DB
- -> normalize actual data
- -> dry run
- -> reconcile
- -> final frozen export
- -> final import

This is intentionally outside this sweep.

## 24. Final release verification

At the final candidate SHA run:

```sh
npm run verify:fast
npm run test:api
npm run test:browser:api
npm run test:browser
npm run test:browser:production
npm run test:cloud:base
npm run test:cloud:v2
npm run test:native
npm run test:desktop
npm run protocol:check
npm run audit:ui:gate
npm run docs:check
```

Run the Print Bridge matrix again.
Push one exact SHA and require:
api-postgres             PASS
frontend                 PASS
browser-preview          PASS
browser-production       PASS
native-domain            PASS
cloud-protocol-base      PASS
cloud-protocol-v2        PASS
desktop-shell            PASS
windows-printer-shell    PASS
print-bridge Ubuntu      PASS
print-bridge Windows     PASS
evidence-summary         PASS

## 25. Updated one-swoop execution order

Do not repeat already-proven phases unless required for regression verification.
Work in this exact order:
1. FIX HOSTED API/POSTGRES INTEGRATION TEST FAILURE

2. KEEP WINDOWS-PRINTER-SHELL GREEN IN THE BASELINE RUN

3. OBTAIN ONE FULL GREEN BASELINE SHA

4. CLOSE POS CORE ACCEPTANCE

5. CLOSE FLOORPLAN / TABLE CONCURRENCY

6. CLOSE ORDER TRANSFER

7. CLOSE ORDER MERGE

8. CLOSE REMAINING INVENTORY CROSS-DOMAIN LINKS

9. CLOSE PAYMENTS / REFUNDS

10. CLOSE TILLS / JOURNALS / CLOSE DAY

11. CLOSE PROCUREMENT

12. CLOSE CUSTOMER CREDIT

13. CLOSE HOTEL / PMS

14. CLOSE FINANCE / EXPENSES

15. CLOSE ASSETS / MAINTENANCE

16. CLOSE BOUNDED OFFLINE CASH POS

17. CLOSE PRINT BRIDGE RUNTIME / SERVICE / TRUST / CRASH RECOVERY

18. RUN REAL PRINTER ACCEPTANCE IF HARDWARE AVAILABLE
    ELSE DELIVER EXACT EXTERNAL ACCEPTANCE HARNESS

19. FINISH VPS PRODUCTION READINESS

20. PROVE BACKUP RESTORE

21. RUN COMPLETE SYNTHETIC STAGING SCENARIO

22. REMOVE / FENCE LEGACY BUSINESS WRITERS

23. GENERATE FRESH CURRENT-CODEBASE DOCUMENTATION

24. RUN FULL LOCAL RELEASE MATRIX

25. PUSH FINAL CANDIDATE SHA

26. REQUIRE FULL HOSTED CI GREEN

27. PRODUCE FINAL RELEASE-READINESS REPORT

STOP.

DO NOT PERFORM COUNTRYSIDE LIVE-DATA MIGRATION.

## 26. Domain exit matrix

Previously accepted locally; rerun at the final release SHA:

| Domain | Last recorded state |
| --- | --- |
| Auth / Staff / Device / Session | PASS locally |
| Bootstrap / Recovery | PASS locally |
| Catalog | PASS locally |
| Inventory core | PASS locally |

Still open in this sweep:

| Gate | Current state |
| --- | --- |
| Hosted API/PostgreSQL | OPEN ? hosted test failure |
| POS | OPEN |
| Floorplan | OPEN |
| Order transfer | OPEN |
| Order merge | OPEN |
| Inventory cross-domain | OPEN |
| Revenue | OPEN |
| Procurement | OPEN |
| Customer Credit | OPEN |
| PMS | OPEN |
| Finance | OPEN |
| Assets | OPEN |
| Offline cash | OPEN |
| Print runtime / physical | OPEN / EXTERNAL GATE |
| VPS | OPEN |
| Backup restore | OPEN |
| Synthetic staging | OPEN |
| Legacy authority cleanup | OPEN |
| Current documentation | OPEN |
| Final green SHA | OPEN |

## 27. Definition of done

The sweep is complete only when:

- one exact SHA passes the complete CI matrix

- API/PostgreSQL integration passes hosted

- real PWA/API/PostgreSQL acceptance remains green

- Auth remains green

- Bootstrap remains green

- Catalog remains green

- Inventory remains green including POS/procurement linkage

- POS / floorplan / transfer / merge passes

- Revenue chain reconciles

- Procurement reconciles

- Customer Credit reconciles

- PMS passes reservation/stay/folio/room-charge/checkout concurrency

- Finance/Expenses passes

- Assets/Maintenance passes

- bounded Offline Cash survives restart/reconnect

- Print Bridge Linux and Windows CI remains green

- Windows service runtime behavior is proven

- physical printer is either proven or clearly marked EXTERNAL GATE

- VPS staging is deployable

- backup restore is proven

- release rollback is proven

- synthetic staging scenario has zero unexplained variance

- API mode has zero silent legacy business writers

- fresh current-codebase documentation is complete and passes docs checks

**The only allowed EXCLUDED BY SCOPE item is:**

- ACTUAL CURRENT COUNTRYSIDE DATA MIGRATION

## 28. Final report required

**Produce one final report containing:**

- FINAL SHA
- BRANCH
- MIGRATION HIGH-WATER

- HOSTED CI MATRIX
- LOCAL RELEASE MATRIX

- AUTH
- BOOTSTRAP
- CATALOG
- INVENTORY
- POS
- FLOORPLAN
- TRANSFER
- MERGE
- REVENUE
- PROCUREMENT
- CUSTOMER CREDIT
- PMS
- FINANCE
- ASSETS
- OFFLINE CASH
- PRINT BRIDGE
- VPS
- BACKUP / RESTORE
- ROLLBACK
- SYNTHETIC STAGING
- LEGACY AUTHORITY
- DOCUMENTATION

- PHYSICAL PRINTER:
- PASS or EXTERNAL GATE

- COUNTRYSIDE LIVE-DATA MIGRATION:
- EXCLUDED BY SCOPE / NOT PERFORMED

Use only:

- PASS
- FAIL
- EXTERNAL GATE
- EXCLUDED BY SCOPE

Do not use percentages as final evidence.
