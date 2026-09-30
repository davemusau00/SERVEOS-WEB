# CLEAN-ServOS — Convergence, Integrity and Release Sweep

> **Implementation specification and updated forensic assessment.** This document replaces the earlier narrative audit with a dependency-ordered remediation programme. A finding is closed only when its business effect, permissions, durability, recovery and runtime parity are demonstrated.

| Document control | Value |
| --- | --- |
| Repository | [davemusau00/SERVEOS-WEB](https://github.com/davemusau00/SERVEOS-WEB) |
| Current reviewed HEAD | `703693d29742c537ac918330005420bb307777fa` on `main` |
| Deep source snapshot inspected | `ccadfca9ee58b21513c24a9e1d3e22b529938294`, plus the complete one-file delta to current HEAD |
| Earlier forensic baseline | `d9124e9` |
| Comparison | 11 commits ahead of the earlier baseline; latest commit fixes the Staff navigation test locator |
| Review date | 30 September 2026, Africa/Nairobi |
| Latest inspected CI | [ServOS CI #28](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/36657483693), completed, **failure**; frontend/browser green, Native still failing |
| Deliverable status | Specification; remediation code and production migration have not been executed by this review |
| Intended destination | Repository root, replacing `CLEAN-ServOS.MD` |
| Intended operator | Codex or a developer implementing a coordinated sweep, with a human reviewing release evidence |

## Contents

1. [Outcome and scope](#1-outcome-and-scope)
2. [Updated evidence and corrections](#2-updated-evidence-and-corrections)
3. [Execution rules and preserved invariants](#3-execution-rules-and-preserved-invariants)
4. [Dependency order](#4-dependency-order)
5. [Implementation work packages](#5-implementation-work-packages)
6. [Canonical protocol and acceptance contracts](#6-canonical-protocol-and-acceptance-contracts)
7. [Complete original-finding crosswalk](#7-complete-original-finding-crosswalk)
8. [Release acceptance and evidence](#8-release-acceptance-and-evidence)
9. [Data migration and rollback](#9-data-migration-and-rollback)
10. [File and symbol reference index](#10-file-and-symbol-reference-index)
11. [Codex execution prompt and completion ledger](#11-codex-execution-prompt-and-completion-ledger)

## 1. Outcome and scope

ServOS contains a substantial SQLite business engine, a growing production Web client and an extensive staged PostgreSQL domain. The immediate job is to converge their contracts and make release evidence reliable. Further UI work must connect to the same operation, permission, payload and business invariants in both runtimes.

The sweep must deliver these outcomes:

- Every production action resolves to a registered operation, validated payload, server-enforced permission and tested business effect.
- Local drafts, pending commands, local commits and cloud commits have distinct, accurate states.
- Inventory counts preserve every counted row and reject unresolved scans, stale baselines and incomplete sessions.
- Business settings edits preserve omitted identity, policy and receipt fields.
- Room policy, rate selection, readiness, folio accounting and timezone handling agree across Native and cloud.
- Stable staff identity and explicit roles replace permissive role fallbacks and synthetic shared identities.
- Legacy terminal authority and shared v2 authority cannot write the same business concurrently.
- Imports create audited business records; backups produce recoverable artifacts and restore evidence.
- Dialogs and primary actions work on low-height POS screens, touchscreens and keyboards.
- CI tests the actual expansion schema, Tauri shell and production browser configuration.

**One pass** means one coordinated programme with a frozen contract, ordered patches, regression checkpoints and a final integration assessment. It does not mean one unreviewable commit or an automatic cutover on an operating terminal.

### 1.1 Two release profiles must remain explicit

Current documentation describes the installed terminal as SQLite-authoritative and v2 as staged. Preserve that distinction while implementing convergence.

| Profile | Authority | Permitted behaviour | Release implication |
| --- | --- | --- | --- |
| `TERMINAL_LEGACY` — proposed explicit profile name | SQLite terminal | Existing local commands and legacy replica/request flow under existing restrictions | Terminal release can be evaluated separately; no claim of shared v2 authority |
| `SHARED_V2` — proposed explicit profile name | PostgreSQL for shared commits; bounded SQLite offline rights if implemented and accepted | Canonical v2 commands, authorized replicas, allocations and reconciliation | Requires identity mapping, terminal v2 adapter, complete cutover and concurrency evidence |
| Preview/demo | Isolated disposable fixtures | Simulated application paths | Never satisfies production acceptance |

The specification covers the complete target. If a provider integration or physical acceptance is unavailable, mark that package **BLOCKED** and accurately gate the corresponding feature. Do not close it as implemented because its UI was hidden or renamed.

### 1.2 Severity and closure vocabulary

| Priority | Definition | Required handling |
| --- | --- | --- |
| P0 | Data loss, fiscal misstatement, privilege drift, authority collision, core operation failure or release evidence that omits the active engine | Must close before the affected release profile is accepted |
| P1 | Durability, recovery, workflow completeness or critical operator interaction | Close before the feature is generally available |
| P2 | Packaging, maintainability, diagnostics or noncritical friction | Complete in the sweep after P0/P1 foundations |

Use `OPEN`, `IN_PROGRESS`, `IMPLEMENTED_UNVERIFIED`, `VERIFIED`, `BLOCKED` and `NOT_APPLICABLE_WITH_REASON` in the completion ledger. `VERIFIED` requires the command, assertion and artifact reference. “Tests added”, “UI present” and “manifest says implemented” are insufficient.

## 2. Updated evidence and corrections

### 2.1 What was checked

This revision inspected the deep source snapshot's branch/tree, ten-commit comparison, current `CLEAN-ServOS.MD`, relevant Native/Web/SQL sources, workflow configuration and CI #27 logs. A final refresh found `703693d`, inspected its entire one-file delta and retrieved completed CI #28 jobs plus Native/browser logs. All 21 expansion files were retrieved. Only `tests/browser/transactions.spec.ts` changes between the two inspected SHAs. Repository paths below are relative to the repository root; the reference index supplies immutable source links. Proposed files are explicitly labelled **NEW**.

The supplied screenshot shows a room reservation form with an almost invisible disabled Confirm action, empty dates, a generic guest selector and device-local-time labels. It is useful evidence of the reported operator problem. It is not evidence that the latest source still produces exactly that form: the latest `reserve()` already prefills dates and labels property timezone. The current dialog consumers and default departure calculation still need acceptance.

No production Supabase database, installed terminal database, packaged printer or physical scanner was accessed. CI logs are observed remote execution evidence; this review did not rerun the full application suites locally. Deployment and data migration recommendations are therefore acceptance requirements, not claims that production has already passed them.

### 2.2 Current CI: precise failure classes

| Area | Latest result at `703693d` | Meaning |
| --- | --- | --- |
| Dependency installation | Pass | Frontend dependency install completed |
| TypeScript (`lint`) | Pass | `tsc --noEmit` completed; this script is not a general lint engine |
| Vite build | Pass | Bundle builds |
| Node/source tests | Pass | Existing source/unit suite completed |
| UI audit generation | Pass | Scanner completed; no findings threshold is enforced |
| Documentation check | Pass | Current documentation check completed |
| Browser acceptance | **22 passed, 0 failed** | Locator fix landed; existing desktop/mobile suite green |
| Native domain | **61 passed, 10 failed** | Compilation completed; ten room-related tests failed |
| Cloud protocol | Pass | Base migration/protocol path only; expansion requires `--expansion` |
| Desktop/Tauri shell | Not scheduled | No release evidence from CI #28 |

Prior browser failure in CI #27: `tests/browser/transactions.spec.ts:120` waited for `getByRole('button', {name:'Staff', exact:true})` while navigation was labelled **Staff & devices**. Commit `703693d` fixes that exact locator; CI #28 reports all 22 browser tests passing. Preserve this fix and the staff/device assertions. It closes this observed locator defect, not the missing production-flag/terminal-viewport coverage.

Native failures fall into three observed classes:

| Class | Evidence | Implementation implication |
| --- | --- | --- |
| Rate/type mismatch | Seven failing tests report `VALIDATION_FAILED: rate plan does not match room type` | `setup()` seeds a property-wide rate/type; reservations prioritize that configured rate over payload `ratePlanId` |
| Duplicate setup reference | `rooms_engine_blocks_overlap_turnaround_and_preserves_rate_snapshot` reports `DUPLICATE_REFERENCE: code already exists` | Fixtures create room type code `STD` already seeded by shared setup |
| Absolute-count assumptions | `simple_rooms_and_property_share_existing_domain_safeguards` and `room_csv_imports_apply_through_native_room_commands` assert 1 and observe 2 | Assertions assume an empty room type/rate catalog despite seeded setup data |

These are confirmed errors and a strongly supported fixture/policy explanation. Preserve the genuine rate/type safeguard. Separate generic setup from room scenario setup and verify the intended room policy before altering any production rule.

### 2.3 Progress to preserve

The ten-commit comparison includes shared dialog/form controls, business-time utilities, Native room/housekeeping improvements, M-Pesa interaction changes, audit metadata, documentation and browser accessibility adjustments. These are useful foundations.

However, the comparison does **not** change `BusinessStore.ts`, `sync.ts`, `src-tauri/src/store.rs`, `src-tauri/src/lib.rs`, expansion SQL, CI workflow or PWA manifest. The integrity and convergence findings touching those files remain open.

The latest commit's message suggests broad core refactoring, while its changed files are the original forensic report, one control adjustment and a small browser test adjustment. Use accurate commit descriptions during the sweep; do not rewrite published history merely to rename this commit.

### 2.4 Corrections to the earlier audit

1. **A cloud upload fence already exists.** Expansion `001_protocol.sql` wraps `public.servos_upload` and rejects legacy upload after v2 is enabled. Preserve and extend that fence. The remaining problem is complete authority coordination, including Native local writes, legacy request endpoints, terminal runtime selection and migration—not the total absence of a fence.
2. **Native CI is not currently failing to compile.** It executes 71 tests and fails ten room scenarios. Fix the observed failures instead of treating lockfile/build configuration as the proven root cause.
3. **Browser CI is now green.** Run #27 had two locator failures and 20 passes; the inspected follow-up commit fixes the locator and run #28 has 22 passes.
4. **Web count failure also discards operator work.** `WebInventoryView.commit()` ignores the boolean confirmation result, removes saved count metadata/unknown scans and closes the modal even when the command fails. This must be repaired alongside cloud parity.
5. **Reservation defaults remain inconsistent with enforced checkout.** `reserve()` derives tomorrow's departure from the arrival hour; migration 021 requires NIGHTLY departure at the configured checkout time. Native also contains compatibility behaviour for omitted `stayType`. A timezone helper alone does not resolve this domain-policy mismatch.
6. **Hosted backup language is partially truthful already.** Current Administration includes a provider-validation caveat. Preserve that caveat while implementing actual completion states and workers.
7. **The existing protocol envelope is not business-neutral identity.** Cloud `actorId` presently resolves to Auth identity. Introduce stable staff correlation additively; do not change actor meaning silently.

## 3. Execution rules and preserved invariants

### 3.1 Repository and data rules

- Refresh HEAD before implementation. If it changed, inspect the diff from `ccadfca9` and revalidate affected findings.
- Read applicable `AGENTS.md` in the implementation checkout. No such file appeared in the inspected repository tree; local parent instructions may still apply.
- Create a working branch such as `fix/servos-convergence-sweep`. Keep work packages reviewable and describe actual changes in commits.
- Preserve existing SQLite and cloud records, immutable history, staff access, printer configuration, device identifiers and pending commands.
- Do not run reset/seed commands against the user's operating terminal or production Supabase database.
- Add forward migrations for existing deployments. Do not edit already-applied migrations to repair their runtime effects.
- Retain the old protocol reader where queued commands require it. Never reinterpret an existing immutable request using a different payload meaning.
- Do not enable shared authority, merge, deploy, apply production migrations or replace installed binaries merely because this specification was implemented locally. Produce the concrete release candidate and evidence first.

### 3.2 Domain invariants

| Domain | Invariants that must survive every refactor |
| --- | --- |
| Commands | Stable ID, immutable submitted body, monotonic device sequencing, durable retry, one business effect per ID |
| Authorization | Backend enforcement, active staff/device validation, explicit role mapping, last-Admin protection, approval scope and expiry |
| Money | Integer minor-unit canonical values, balanced journals, no duplicate receipts/payments/revenue on retries |
| Inventory | Movements explain balance changes; counts are reviewed; stock consumption cannot be duplicated; opening balances are setup-only |
| Rooms | Capacity, availability, turnaround, blocks, maintenance/readiness and quote snapshots enforced transactionally |
| Folios | Deposits are liabilities; room charges do not inflate cash; settlement and checkout preserve accounting conservation |
| Assets | Custody/status transitions, lifecycle history and maintenance linkage remain auditable |
| Replication | Authorized snapshots, durable cursor progression, gap detection, allocation limits and policy revocation |
| Backup | Valid artifact, integrity check, restore rehearsal and recorded reconciliation—not a timestamp claiming a backup |
| Printing | Immutable receipt source, queue persistence, explicit reprint/retry semantics, accurate copies and tender values |

Preserve the existing PostgreSQL immutable triggers, version checks, permission functions, device checks, idempotency and allocation machinery. Preserve SQLite transaction boundaries, Argon2 PIN handling, session invalidation, audit/outbox durability and printer queue recovery.

### 3.3 Scope boundaries

Manual M-Pesa confirmation/reconciliation remains the supported financial model unless a separate provider integration is explicitly introduced and accepted. Do not represent a recorded reference as live provider verification. Source tests remain useful, but financial, authorization, concurrency and command lifecycle claims require behavioural tests.

## 4. Dependency order

| Wave | Work packages | Required result before continuing |
| --- | --- | --- |
| A: Establish truthful evidence | WP-01–03 | Observed CI failures fixed; expansion and shell checks scheduled; baseline failures captured |
| B: Freeze protocol and identity | WP-04–06 | One registry, explicit aliases, role matrix, stable identity mapping design |
| C: Repair integrity and durability | WP-07–12 | Settings safe; drafts recoverable; counts durable; room semantics and time consistent |
| D: Coordinate authority | WP-13 | Legacy/v2 profile fences, staged terminal adapter and migration rehearsal verified |
| E: Complete operational services | WP-14–18 | Import effects, backup evidence, safe exports, shared-device policy, useful approvals/invitations |
| F: Finish operator interactions | WP-19–23 | Dialogs/selectors, fiscal inputs, scanner flows, receipts and role workspaces accepted |
| G: Structural and packaging cleanup | WP-24–28 | Install assets, isolated preview, smaller modules, canonical fresh schema, accurate documentation |
| H: Integrate and release | WP-29–30 | Cross-runtime/concurrency rehearsal, data migration evidence and explicit release decision |

Contract changes are dependencies for all domain patches. Write tests while implementing each package; do not defer every test until Wave H. Large module movement happens after behavioural corrections so reviewers can distinguish semantic changes from file relocation.

## 5. Implementation work packages

### WP-01 — Repair Native fixture/policy failures and preserve the browser fix

**Priority:** P0. **Status:** VERIFIED locally; hosted/package/physical acceptance remains open. **Dependencies:** None.

**Existing files:** `src-tauri/src/tests.rs`, `src-tauri/src/store.rs`, `native-tests/Cargo.toml`, `tests/browser/transactions.spec.ts`, `src/runtime/web/workspaceRegistry.ts`.

**Anchors:** Rust `setup()`, `room_execute()`, configured-rate selection in `roomReservation.create/update`; browser transactional test around line 120.

**Implementation:**

1. Introduce scenario-specific test builders. Base initialization should establish tax/payment/till/readiness without silently contaminating room domain assertions. A room fixture builder must explicitly create or reuse its type, rate and configured room-stay policy.
2. Where Go Live requires room setup, keep a minimal room policy fixture and explicitly reuse it or configure the scenario's own policy through `roomStay.settings`. Avoid ad hoc direct table updates that bypass the production command.
3. Replace absolute count assertions with assertions against known baseline plus expected delta, or query the specific imported IDs. Continue proving rollback creates no additional records.
4. Use unique fixture codes. Keep a dedicated test proving duplicate room type codes are rejected.
5. Keep the reservation mismatch test: a configured rate incompatible with the selected room must produce a useful error, with no reservation/folio/ledger effect.
6. Preserve the already-landed `Staff & devices` locator fix. Scope to visible navigation if newly added viewport projects introduce duplicate controls. Preserve assertions for both staff profiles and trusted devices; current run #28 passes all 22 browser tests.
7. Use a deterministic test clock where time is policy-relevant. Avoid tomorrow-at-current-hour fixtures for a fixed-checkout rule.

**Acceptance:** All 71 existing Native tests pass with original financial/room protections intact; keep the now-green browser transactional scenario passing in both current projects. New negative tests preserve rate/type rejection, duplicate-code rejection and orchestration rollback. Record actual final counts rather than assuming the suite remains the same size.

**Do not:** Remove `--locked`, delete failing tests, loosen room validation, increase timeouts or remove staff assertions to obtain green CI.

### WP-02 — Make CI verify the active engines

**Priority:** P0. **Status:** IMPLEMENTED_UNVERIFIED locally; hosted CI and packaged-shell acceptance remain open. **Dependencies:** WP-01 for an interpretable baseline.

**Existing files:** `.github/workflows/ci.yml`, `package.json`, `scripts/test-supabase.mjs`, `scripts/test-native-container.mjs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `native-tests/Cargo.lock`, `playwright.config.ts`.

Create separate named checks for frontend, base cloud protocol, cloud v2 expansion, Native domain, desktop shell and browser production acceptance. Add registry/UI gates after WP-04/WP-19 provide meaningful policies.

Proposed package scripts, to be added before use:

```json
{
  "test:cloud:base": "node scripts/test-supabase.mjs",
  "test:cloud:v2": "node scripts/test-supabase.mjs --expansion",
  "check:desktop": "cargo check --locked --manifest-path src-tauri/Cargo.toml",
  "test:desktop": "cargo test --locked --manifest-path src-tauri/Cargo.toml --lib",
  "verify:fast": "npm run lint && npm run build && npm test",
  "verify:release": "npm run verify:fast && npm run test:cloud:base && npm run test:cloud:v2 && npm run test:native && npm run test:desktop && npm run test:browser:production && npm run protocol:check && npm run audit:ui:gate && npm run docs:check"
}
```

Add locked behaviour to `test:native` or use the locked command directly. `verify:release` is a target script; several referenced scripts are **NEW** and must be implemented. Keep quick and complete verification names distinct. Docker/native prerequisites must be checked explicitly; missing prerequisites cannot silently skip a required engine and return success.

Run cloud expansion tests on a disposable PostgreSQL instance. Log migration filenames, schema fingerprint and suite counts. Extend the runner's explicit test list with count, room condition, settings, import effects, backup states and lifecycle/recovery tests. Merely adding `--expansion` does not supply missing coverage.

Run Tauri checking/testing on a supported runner with the repository's platform prerequisites installed. Add Windows packaging/smoke evidence for the real target; Linux domain success does not prove a packaged Windows shell or printer works. Capture failure traces and test reports as CI artifacts with `if: always()` and suitable retention. Avoid secrets or live customer payloads in artifacts.

**Acceptance:** Removing an expansion handler or introducing a shell compilation error fails its named check. Required verification rejects a missing engine. CI publishes an evidence summary tied to SHA, environment/profile and schema digest.

### WP-03 — Test production flags and terminal viewport behaviour

**Priority:** P0/P1. **Status:** VERIFIED locally for the isolated production browser matrix; final dialog/target-device acceptance depends on WP-19 and physical checks. **Dependencies:** WP-02; final dialog acceptance depends on WP-19.

**Existing files:** `playwright.config.ts`, `tests/browser/transactions.spec.ts`, `tests/browser/web-storage.spec.ts`, `src/App.tsx`, `src/native/NativeRoomsView.tsx`, `src/runtime/web/WebBusinessApp.tsx`.

**NEW:** Separate production Playwright configuration or equivalent isolated build orchestration; workflow test files for low-height interactions.

| Project | Viewport | Purpose |
| --- | --- | --- |
| `pos-terminal` | 1024 × 600 | Minimum low-height operational acceptance |
| `aio-terminal` | 1280 × 720 | Target AIO layout |
| `laptop` | 1366 × 768 | Typical operational desktop |
| `mobile-layout` | 390 × 844 | Mobile Web workflow/layout |

Use separate builds for demo acceptance and production acceptance. A Playwright project's viewport alone does not change Vite's compiled environment flags. Production Web tests must build with `VITE_ENABLE_DEMO=false` and the intended v2 flag. The legacy profile must have its own smoke test while supported. Use isolated output directories/ports or serial build phases so one test server cannot accidentally serve another profile's bundle.

For reservation, count review, payment, refund, M-Pesa reconciliation, import review, staff invitation and asset maintenance:

- Open the real production workflow, validate required fields, complete it and verify its durable effect.
- Assert the action footer remains in the viewport while the form body scrolls.
- Assert no horizontal overflow, and that wrapped errors do not hide Confirm/Cancel.
- Test keyboard focus, Escape, focus restoration, touchscreen target sizes and a busy action.
- Test a blocked action with readable text explaining the missing requirement.
- Use Native runtime fixtures or a controlled bridge harness for terminal UI; Web-only browser tests cannot stand in for Native views.

**Acceptance:** The screenshot's failure mode is reproduced as a regression scenario: missing guest/date input yields a visible disabled CTA and actionable blocker. Completed inputs yield a usable CTA and an accepted reservation. Screenshot/trace artifacts exist for each required viewport.

### WP-04 — Create the executable operation and permission contract

**Priority:** P0. **Status:** OPEN; operation/permission registry and generated parity remain required. **Dependencies:** Baseline from WP-02.

**Existing files:** `src/runtime/operationManifest.ts`, `src/types/transactions.ts`, `src/native/*`, `src/runtime/web/*`, `src-tauri/src/store.rs`, `supabase/expansion/001_protocol.sql` through `021_room_stay_policy.sql`, `tests/web-v2-permission-contract-source.test.mjs`.

**NEW:** `contracts/operations.json`, `contracts/permissions.json`, `contracts/roles.json`, a contract generator, a parity checker and generated TS/Rust/SQL contract constants. Choose exact generated paths during implementation and record them.

The registry must describe operation ID, contract version, payload schema, permission, approval policy, lifecycle eligibility, expected-version dependencies, allocation needs, Native handler, cloud handler, UI workflow and behaviour test references. `implemented` becomes an evidence-derived result instead of an unverified handwritten label.

Use static call-site extraction to find unknown operations, but do not claim regex matches prove handler or semantic coverage. Computed operations need an explicit declaration. Function existence tests, typed payload validation and runtime fixtures must demonstrate that declared handlers actually dispatch and enforce the same effect.

Proposed canonical migration choices:

| Existing dialect | Canonical target | Compatibility requirement |
| --- | --- | --- |
| Native `order.compItem`; Web/cloud `order.comp` | `order.comp` | Validate item-target semantics; retain a versioned legacy adapter |
| `customerCredit.configure` | `credit.account.save` | Translate field layout and money units explicitly |
| `customerCredit.charge/settle/reconcile` | `credit.charge/settle/reconcile` | Preserve receipts, allocations and accounting effects |
| `customerCredit.writeOff` | `credit.write_off` | Keep reason, approval and reversal semantics |
| Native permission `till.cash_movement` | `till.cashMovement` | Migrate saved grants/approvals; reject ambiguous mappings |
| Web single-row `inventory.countLocation` | `inventory.spotCount` **NEW**, if supported | Do not alias to a whole-location count |
| Native full reviewed count | `inventory.countLocation` | Shared `rows[]` contract and complete-session semantics |

Do not rename operations by string replacement. Inventory every remaining credit/discrepancy/reversal operation and define its target explicitly. Alias adapters must validate the original version and normalize once, before dispatch. Record canonical operation and original operation for audit correlation. Keep a retirement policy for aliases without destroying evidence or abandoning pending commands.

Parity output must show `Terminal UI`, `Native handler`, `Web UI`, `cloud handler`, `permission`, `payload version`, `behaviour test` and `release profile`. An intentionally device-local operation such as raw USB printing needs an explicit exemption; it does not need a fake cloud handler.

**Acceptance:** Unknown call sites fail CI. Missing required handlers/tests fail CI. A handler registered with the wrong payload semantics fails shared fixtures. Generator output is deterministic and regeneration does not change checked-in files.

### WP-05 — Align roles, grants and role-appropriate workspaces

**Priority:** P0. **Dependencies:** WP-04.

**Existing files:** Rust `permissions()`, staff create/change-role branches in `src-tauri/src/store.rs`; `supabase/expansion/016_staff_devices_approvals.sql` (`role_permissions`, profiles and role triggers); `src/runtime/web/session.ts`; `src/runtime/web/workspaceRegistry.ts`; Native shell/workspace gating.

Support `Admin`, `Manager`, `Cashier`, `Server`, `Chef`, `Housekeeper`, `Accountant` and `Custom` in every participating runtime. Unknown roles must fail closed. The current `_` Rust role fallback cannot grant POS, till and procurement access to an unrecognized role.

Build the precise grants from the canonical contract. Preserve current backend restrictions while reviewing inconsistencies: Manager exclusions already differ on `devices.manage`, and cash/credit responsibilities need deliberate alignment. Do not increase permissions merely to make a screen work.

Workspace visibility and action authorization are separate:

- POS visibility depends on selling/operational capability, not generic `records.view`.
- Administration visibility depends on actual configuration/import/backup responsibilities, not `business.view` alone.
- Staff reading and device administration may share a surface only if the read-only operator has a meaningful view.
- Activity shows only the operator's authorized local work. Permission changes must refresh data and prevent stale sensitive records remaining visible.
- Native shell applies the same workspace purpose rules; backend checks remain mandatory even if the button is hidden.

Store Custom grants explicitly with schema/policy version. Do not map Custom to the generic Server role. Role/PIN/grant changes invalidate applicable sessions and offline authority; last-Admin and self-demotion protections remain transactionally enforced.

**Acceptance:** Parameterized Native/cloud grant tests cover every role × permission pair. Chef and Housekeeper cannot settle payments, open tills or configure staff unless explicitly granted. Navigation tests match allowed responsibilities; crafted direct commands are denied. Role changes take effect on active clients and after restart.

### WP-06 — Establish stable person, Auth, staff and device identity

**Priority:** P0 for shared authority. **Dependencies:** WP-04–05.

**Existing files:** `src-tauri/src/store.rs` staff/session/audit model, `src-tauri/src/lib.rs` synthetic Remote Manager actor, `src/types/transactions.ts`, `src/runtime/web/session.ts`, expansion `001_protocol.sql`, `016_staff_devices_approvals.sql`.

**NEW:** Additive identity-map migrations, reconciliation report and resolution UI/documentation.

Define one stable shared staff/person ID. Map local staff ID, Auth user ID and legacy remote actor to it. Device and replica identity are separate records. Do not infer person equivalence solely from display name or email; produce an explicit reviewed mapping with unresolved duplicates reported.

Current cloud `actorId` is tied to Auth user identity. Preserve this authenticated envelope meaning until a deliberately versioned protocol changes it. Add a server-derived `staffId` to audit results/events; derive it from the active staff profile rather than trusting arbitrary client data. Map Native PIN sessions to stable staff identity via enrollment/migration. Remote authority requires a real authenticated grant, not a local synthetic Manager.

Recommended event correlation fields: canonical staff ID, authenticating principal ID, device ID, local replica ID where relevant, canonical command ID, original legacy actor reference, authority profile and policy version. Backfill correlation metadata separately; do not rewrite immutable history.

**Acceptance:** One mapped person performing terminal and browser work yields correlated audit events without conflating authentication methods. Unmapped staff cannot receive shared offline rights. Deactivation revokes both Auth-derived and PIN-derived authority according to the accepted policy. Migration reruns do not generate new staff identities.

### WP-07 — Make partial business settings updates lossless

**Priority:** P0. **Status:** VERIFIED locally for staged settings migration 022 and SQL preservation/rejection fixtures; hosted migration/application remains open. **Dependencies:** WP-04; test infrastructure WP-02.

**Existing files:** `supabase/expansion/020_admin_operations.sql` (`business.settings.save`), `004_domain_helpers.sql` (`read_record`, `assert_version`, `put_record`), `src/runtime/web/WebAdministrationView.tsx`, Native business/property settings commands.

`put_record` intentionally replaces its document. Do not globally change it to merge: archive/state/ledger handlers may rely on replacement semantics. Repair the settings handler by assembling the complete validated replacement from current record plus permitted patch.

Required semantics:

1. Validate organization ID and permission; require the expected version for updates.
2. Read/lock the current authorized record, handling expected version 0 only for an explicit creation path.
3. Validate an allowlist of editable fields and types. Reject IDs, lifecycle markers, ownership fields, audit metadata and unknown properties in the user patch.
4. Preserve omitted fields. Define clear semantics for explicit nulls/empty strings; null must not accidentally erase required identity.
5. Merge permitted nested groups according to their schema. A shallow JSONB merge would still replace a nested receipt/contact object if only one nested field is supplied.
6. Add server-derived update metadata and write once, with one audit event.
7. Split tax/fiscal changes into their stronger permission/policy path where necessary.

Illustrative logic, not a drop-in migration:

```text
current = lock_and_read(organization, id)
assert_expected_version(current, command)
patch = validate_allowed_settings(command.payload.data)
next = schema_aware_merge(current, patch)
validate_complete_settings(next)
write_replacement(next + server_metadata)
```

**Acceptance:** Start with contact, branding, tax and receipt settings. Change only trading name and prove every other field is preserved. Reject protected fields, malformed nested data and stale versions without mutation. Test an explicit permitted clear, initial creation and simultaneous editors. Include receipt/business CSV imports in the same preservation tests.

### WP-08 — Separate drafts from commands and make recovery usable

**Priority:** P0. **Status:** IN_PROGRESS; typed drafts, atomic promotion and browser proof are implemented, while review/reopen UI, policy recheck and count-session recovery remain open. **Dependencies:** WP-04–06.

**Existing files:** `BusinessStore.ts`, `sync.ts`, `WebBusinessApp.tsx` (`submit`), `ActivitySyncCenter.tsx`, `src/types/transactions.ts`, `tests/browser/web-storage.spec.ts`.

**NEW:** Typed draft/workflow context model, workflow resume adapters and IndexedDB upgrade migration.

Drafts must retain operation/contract version, original editor kind, target IDs, input values, relevant baselines, policy version, validation summary and timestamps. Avoid storing credentials, approval secrets or unnecessary personal data. Generic payload JSON alone is not enough to reopen a meaningful workflow.

Implement `resumeDraft`, `discardDraft` and an atomic `promoteDraftToCommand`. Reconnect refreshes authorized records and permissions, compares relevant dependencies and opens a review. Sensitive financial drafts require review; reconnect is not permission to execute them.

Atomic promotion allocates a command ID and device sequence, inserts the queued command and marks/removes the originating draft in one IndexedDB transaction. Two tabs promoting the same draft must result in one command. IndexedDB transactions and the existing synchronization lock should coordinate this; no network work may occur inside a transaction that could become inactive.

Submission lifecycle:

```text
Local draft → Review against current state → Explicit submit
→ Pending command → Server result
→ Confirmed business effect, or Conflict/Rejected recovery
```

Keep the form open while sending when practical. If the command is durably queued and the operator leaves, retain a recoverable pending workflow entry. Never return success while displaying a rejection elsewhere. Use structured outcomes such as `DRAFT_SAVED`, `QUEUED`, `CONFIRMED`, `CONFLICT` and `REJECTED`; the current boolean result conflates several situations.

Response loss retries the identical command ID/body. A confirmed conflict/rejection is immutable: reopen input, show current values, then create a **new** reviewed command ID/sequence with a `supersedes` correlation. Do not resend a rejected command with a modified body or expect the same cached rejection to become success.

Preserve pending-command sequence discipline. Discarding an unsent queue entry cannot simply delete its sequence; define a server-recognized cancellation/tombstone or reconcile it before removal. Drafts have no allocated sequence and can be discarded independently.

**Acceptance:** Offline save survives reload; reconnect does not silently transact. Promotion occurs once across tabs. Response loss yields one effect. Conflict and rejection reopen original values with latest record comparison. Quota/storage failure never displays “saved”. Policy revocation prevents promotion. Count sessions are not removed after unconfirmed submissions.

### WP-09 — Build operation-specific version dependencies

**Priority:** P1, P0 where dependency omission could permit an invalid effect. **Status:** IN_PROGRESS; operation-specific resolver is implemented and production POS/room/browser proof passes, but the complete registry-backed dependency inventory remains open. **Dependencies:** WP-04, WP-08.

**Existing files:** `WebBusinessApp.tsx` full-snapshot `baselines`, `src/types/transactions.ts`, cloud `assert_version` and execution locking, Native target/dependency version fields.

**NEW:** Generated or registry-backed expected-version builders with shared fixture tests.

Replace `records.map(...)` with an operation dependency resolver. A room move includes reservation/stay/folio/source room/destination room and policy/rate records it actually reads. Payment includes the order/folio/till/payment configuration and relevant allocation dependencies. Stock count includes its complete stock membership/baseline and count-session revision. New records carry the intended expected absence.

Build these baselines at review time, retain them with the submitted command and let the server verify them. Do not silently refresh a pending command's versions to make it pass. Permissions and authoritative invariants must still be derived/revalidated on the server; a short client baseline is not authorization to ignore a dependency.

Expansion 001 currently serializes writers through its control row before validating commands. Preserve that correctness mechanism during this sweep unless a measured, separately proven locking strategy replaces it. “Fewer versions” does not by itself justify removing global locking. For any future concurrency improvement, prove lock ordering and predicate protection against double booking and stock overspend.

**Acceptance:** Unrelated customer/product changes do not cause an otherwise valid room operation to conflict. Each relevant dependency change does. Command size scales with operation dependencies, not total snapshot size. Expected-version ordering/deduplication is deterministic. Tests enumerate every registry operation that declares version dependencies.

### WP-10 — Implement reviewed whole-location counts and scanner durability

**Priority:** P0. **Dependencies:** WP-04, WP-08–09.

**Existing files:** `WebCatalogInventory.tsx`, `NativeInventoryView.tsx`, Rust `inventory.countLocation` near line 3021 and count-draft helpers, SQLite migrations `011_inventory_count_drafts.sql` / `012_count_sessions.sql`, cloud `011_inventory_catalog.sql`, scanner hook and barcode utilities.

**NEW:** Web IndexedDB count-session store, forward SQL count migration, shared count fixtures and direct SQL/browser tests.

Use Native's reviewed `rows[]` meaning as the canonical whole-location operation. Native currently requires **every active stock item**, not merely items with a positive balance at the location. Preserve that scope initially for parity; if location assortment is desired, add an explicit shared policy and membership revision rather than silently narrowing one runtime.

A count session retains session ID, location, actor, baseline quantities, stock/catalog versions, item names/base units, scan conversion, counted quantities, unknown/ambiguous scans, revision and reviewed status. Zero counted is distinct from uncounted. Counts survive page reload, application restart and interrupted review.

Implementation steps:

1. Remove `&& false` from unknown-scan disabling. Backend also rejects unresolved/ambiguous scans; a UI restriction alone is insufficient.
2. Persist every item's count when scanning or editing. Changing the selected item must not reset another item's physical count.
3. Preserve barcode strings and leading zeros. Match only one active valid stock definition; duplicate/ambiguous matches remain blocked.
4. Validate `scanUnitQuantity`, base unit and package conversion against the reviewed catalog. Unknown codes require explicit mapping or documented removal of a mistaken scan; never silently keep an unresolved code in a finalized count.
5. Generate a complete reviewed payload with deterministic item ordering, session revision and baseline. Server cannot require access to an unsubmitted browser-local draft; supply sufficient review/baseline evidence or stage a server-reviewed session with equivalent semantics.
6. In one cloud transaction, verify location, permission, membership, all versions/quantities and scan state. Create one `stockCounts` record and one movement per nonzero variance.
7. Reject changed quantities/catalog/membership without partial movements. Reopen review with affected rows; do not reset all counts.
8. Close/delete the local session only after confirmed business commit. A rejection, transport failure or pending status retains it.
9. If spot counts are supported, implement separate `inventory.spotCount` with a single-item contract and matching Native/cloud tests. Do not route its payload through the full-count operation.

**Acceptance:** Two scanned items and manually entered zero counts survive reload. Unknown/duplicate codes block both clients and crafted requests. Concurrent sale/receipt causes a relevant conflict. A successful full count has complete rows and matching movements, and retry creates no duplicates. Current failed command behaviour no longer erases the count.

### WP-11 — Converge room policy, defaults and condition commands

**Priority:** P0. **Status:** IN_PROGRESS; room policy and Native/cloud `room.condition` parity are locally verified, while the broader stay move/extension/checkout acceptance remains open. **Dependencies:** WP-01, WP-04, WP-07, WP-09; time abstraction WP-12.

**Existing files:** `NativeRoomsView.tsx`, `NativeFrontDeskView.tsx`, `NativeHousekeepingView.tsx`, `WebBusinessApp.tsx` (`reserve`, `addRate`), `WebHospitalityViews.tsx`, Rust `room_execute`, expansion `007_rooms.sql`, `009_stays.sql`, `021_room_stay_policy.sql`, Native/cloud room tests.

The latest policy deliberately simplifies stays to one configured NIGHTLY rate supporting NIGHTLY and DAY stay types. Respect that direction. Do not restore a multi-rate product merely to make older fixtures pass. Use room types/rates as internal setup records only to the extent the accepted product still needs them, and expose business-oriented setup to the operator.

Required contract:

- Property selects a compatible active room type/rate and explicit checkout/day cutoff.
- Reservation quote snapshots the applicable rate/tax/policy. Later edits do not retroactively reprice booked stays.
- Nightly departure is calculated from a business-local calendar date and configured checkout wall time. It is not arrival instant plus 24 hours or tomorrow at the same device-local hour.
- Day stay begins/ends on the permitted local date and before the cutoff. Show calculated price and allowed departure before Confirm.
- Guests must fit room capacity. Archived guest/room/rate and missing configuration produce an actionable blocker.
- Room changes, moves and extensions revalidate availability, turnaround, maintenance/readiness and version dependencies atomically.

Native currently gives the property's configured rate precedence over payload rate and has compatibility behaviour when `stayType` is omitted; cloud 021 applies its current policy. Make the canonical v2 contract require explicit `stayType`, then confine legacy omitted-type behaviour to the versioned v1 adapter. Share the same fixture outcomes in Native/cloud. Detect incompatible existing room types during intake/reconciliation; do not rewrite rooms or bookings to the configured type automatically.

Implement missing cloud `room.condition` with the same domain semantics as Native. Define allowed states using current Native rules, keep maintenance separate from housekeeping, and preserve active-stay/reservation safety. Returning to service requires the appropriate inspection/readiness transition; it must not mark a dirty room clean.

Transaction outcome tests must prove:

- Condition/block races cannot accept incompatible new reservations.
- Check-in creates stay/folio/accommodation effects together or none.
- Room move preserves quote, checks target capacity/readiness and dirties the vacated room.
- Extension records its charge/payment/receipt and updated availability together, with duplicate external references rejected.
- Checkout refuses unsettled balance/deposit, closes the folio and records dirty/turnaround state.

**Acceptance:** Native and cloud consume identical NIGHTLY/DAY fixtures and UTC inputs. Web prefills a server-valid checkout and displays a quote. `room.condition` succeeds/denies for the same scenarios in both engines. Existing terminal records with incompatible setup are reported for review, not silently altered.

### WP-12 — Apply one property-time contract everywhere

**Priority:** P1. **Dependencies:** WP-04; supports WP-11, financial imports/reconciliation.

**Existing files:** `src/utils/businessTime.ts`, `src/design-system/controls.tsx` (`BusinessDateTimeField`), Native room/M-Pesa fields, Web editors, Rust `room_local_minutes`, `room_local_date`, expansion `021_room_stay_policy.sql`.

Store instants in UTC and interpret business wall-clock fields in the configured property's IANA timezone. Retain `Africa/Nairobi` as the configured/default Kenyan property timezone, not arithmetic scattered across languages.

Use the existing TS helper; do not create a second frontend conversion implementation. Add equivalent Rust timezone support or reject unsupported property zones explicitly until that runtime can interpret them. Cloud queries use the validated property zone rather than hardcoding Nairobi in each reservation comparison. Do not accept an arbitrary unvalidated timezone from a client command.

Separate instant, local date and wall-clock policy values:

| Value | Representation | Example |
| --- | --- | --- |
| Payment received/reservation instant | UTC ISO 8601 | `2026-09-30T07:00:00Z` |
| Business closing/report date | Property-local date | `2026-09-30` |
| Nightly checkout policy | Local wall-clock time | `10:00` |

Departure defaults must advance the local calendar and apply policy before converting to UTC. The current Web code uses `setDate`/`setMinutes` on a device-local Date; replace that policy derivation even though formatting now uses the property helper.

Make timezone visible where operators enter arrival/departure or provider statement timestamps. Do not label a business field “this device's local time”. For imports, record source timezone or require a known template convention. Never infer a timestamp timezone from the browser location.

**Acceptance:** Same operation behaves identically when the device is in Nairobi, UTC or another zone. Midnight business-date boundaries and next-day checkout work. Invalid dates/zones are rejected. Nonexistent/ambiguous DST wall times fail clearly if supported zones include them. Cross-language fixtures prove equivalent conversion and stay unit calculation.

### WP-13 — Complete the authority fence and terminal v2 transition

**Priority:** P0 for shared release. **Dependencies:** WP-04–12; import/migration WP-14 and rehearsal WP-29–30.

**Existing files:** `src-tauri/src/lib.rs` legacy sync/upload/polling/remote execution, `src-tauri/src/store.rs`, `src/types/transactions.ts`, expansion `001_protocol.sql` upload fence/control, `002_allocations.sql`, Web runtime/session selection, base remote-request migrations, `docs/CURRENT_RELEASE_STATE.md`, `docs/CONTROLLED_IMPORT_MIGRATION.md`.

**NEW:** Explicit authority profile state, terminal v2 command adapter/transport, authenticated staff/device grant mapping, cutover handshake and reconciliation report.

Preserve the existing upload fence. Extend coordinated authority control to legacy request creation/polling/acknowledgement, local terminal write eligibility and runtime routing. An environment flag alone is not a business-wide cutover mechanism: an older terminal binary may ignore it. Server rejects legacy writes after cutover; enrolled terminals persist and honor profile/epoch state; old binaries must fail safely and visibly.

A suitable state progression is:

```text
LEGACY → MIGRATION_PREPARED → WRITES_QUIESCED
→ RECONCILED → SHARED_V2_ENABLED
```

These are proposed coordination states. Validate against existing installation/control models before adding schema. Transition requires backups, identity mapping, pending-outbox/request disposition, data comparison, compatible software and accepted concurrency fixtures. Cutover metadata includes business ID, authority epoch, schema/contract version, terminal enrollment and reconciliation digest.

Legacy Native polling currently creates `remote:<authorId>` with Manager role and executes constrained v1 record edits. In shared profile this path must be unreachable, including scheduled/background calls. Keep it only in the named migration/legacy profile. Verify legacy cloud endpoint guards directly, not only UI route removal.

Terminal shared commands must use the canonical contract. Local SQLite commits while offline require implemented bounded rights/allocations, validated local policy and replay-safe reconciliation; these are not proven by the current v1 terminal engine. If these rights are not ready, shared terminal offline mutations remain blocked/drafts while online shared commands work. Do not claim offline sales parity from a type declaration alone.

**Acceptance:** A shared-enabled business rejects legacy upload/request attempts. Native profile change stops legacy polling and unsupported local mutations. Device/actor/contract mismatch is rejected. Offline expiry/overspend is denied. Same shared command retried through terminal/web transport yields one effect. Terminal release documentation continues to show v2 as staged until cutover evidence exists.

### WP-14 — Implement imports as reviewed, auditable business changes

**Priority:** P0/P1. **Dependencies:** WP-04, WP-07, WP-09, WP-13 for authority selection.

**Existing files:** `WebAdministrationView.tsx`, cloud `020_admin_operations.sql`, `NativeImportCenterView.tsx`, `src/native/csvImport.ts`, `importMapping.ts`, `importTemplates.ts`, `src/types/imports.ts`, Rust import staging/planning/application, `import-templates/*.csv`, controlled-import tests/docs.

**NEW:** Private upload references, parser/validation processor, persisted reviewed plan, import application service and reconciliation tests. Prefer reuse of existing Native template/schema behaviour instead of independent cloud meanings.

The current cloud stage counts newline rows and computes MD5. It neither parses CSV safely nor produces a usable plan. `admin.import.apply` currently changes batch status to APPLIED without record effects. Remove that false completion immediately through a forward migration and UI gate; keep real implementation OPEN until complete.

Target lifecycle:

```text
UPLOADED → PARSING → VALIDATING → REVIEW_READY
→ REVIEWED → APPLYING → APPLIED → RECONCILED
```

Include `FAILED`, `CANCELLED` and an explicit partial/batch-failure state if chunked application is used. Never mark APPLIED merely because processing was requested or a job ID was created.

Required behaviour:

1. Parse quoted commas, embedded newlines, escaped quotes, BOM/encoding, CRLF/LF and empty cells with a real parser. Count actual data rows, not newline characters.
2. Preserve external IDs/barcodes as strings. Reject scientific notation or ambiguous conversion rather than fabricating lost barcode digits.
3. Normalize names, quantities, money, booleans and timestamps with template-specific schemas. Reject invalid enum values, NaN/infinity, unit mismatches and unsafe field sizes.
4. Resolve relationships by external ID: products/stock, room types/rates/rooms, categories/assets, customers/suppliers, employees, locations/outlets and business identity.
5. Produce a plan with create/update/skip/reject rows, target IDs/versions, reasons, dependency order, opening balances and money/stock totals. Attach template/contract versions and source/plan digests.
6. Operator reviews row errors and effects. Any edited mapping generates a new plan/review digest.
7. Apply using canonical domain validation, permission checks, audit, movements and idempotent row/step identities. Do not use unrestricted generic writes to insert fiscal/stock/room lifecycle records.
8. Small imports may be one transaction. Larger imports use dependency-safe idempotent batches with checkpointed progress and declared partial status. Resume does not duplicate effects.
9. Applying a reviewed plan rechecks target versions and policy. A changed product/customer/rate produces conflict/review, not silent overwrite.
10. Reconcile actual created/updated/skipped counts, ledger/stock effects and reference integrity. Retain downloadable row error/reconciliation reports.

Business intake must support existing terminal/local and cloud data. Business CSV updates obey WP-07's permitted merge semantics. Existing room imports must preserve operational housekeeping/maintenance/status; `initial_status` is for new records. Opening stock is applied as setup-only movements and must not be added twice to an already operating inventory. Employee imports stage identity matching; never reset PINs, invite staff automatically or grant Admin solely because a CSV says so.

**Acceptance:** Real product/customer/supplier/room/asset import effects are visible in both authorized clients, with expected versions and audit/movements. Reapply/resume is idempotent. One invalid row produces the declared atomic/batched outcome. Existing operational records remain intact. APPLIED cannot be produced without reconciled application evidence.

### WP-15 — Remove raw CSV from immutable command envelopes

**Priority:** P1. **Dependencies:** WP-04, WP-14.

**Existing files:** Web `stageImport`, SQL staging handler, `servos_v2.commands.request` and protocol command validation, import metadata models.

**NEW:** Private object-storage upload service/policy, upload manifest and source-reference validation.

Upload source files privately, then submit a compact domain command containing object reference, SHA-256, byte size, filename, template key/version and relevant metadata. The server verifies the object belongs to the authorized business/import, is complete, satisfies size/content limits and matches the digest. Client-supplied hashes are not proof until server-verified.

Do not place signed URLs, credentials or full CSV in the immutable command. Store a stable private object key and hash; mint short-lived read access only for authorized processing. Define source retention and deletion separately from permanent audit metadata. A source object lifecycle can expire while the compact audit remains.

Avoid naive redaction inside existing command execution: current idempotency depends on request equality. Introduce this as a validated contract evolution, preserving meaningful canonical request comparison. Block new oversized/raw-source domain commands after migration. Report any historic raw CSV-bearing commands through an access-controlled assessment; do not secretly mutate immutable history.

**Acceptance:** An import command stays compact as file size grows. Cross-business object references are denied. Tampered hash/size fails before application. Raw names/phones from the CSV do not appear in new immutable command bodies, browser error logs or CI artifacts. Expired/deleted source produces an explicit recoverable processor error.

### WP-16 — Make backup requests produce verified recovery evidence

**Priority:** P1, P0 when used as a Go Live prerequisite. **Dependencies:** WP-04, WP-13, identity/permissions WP-05–06.

**Existing files:** `WebAdministrationView.tsx`, SQL `backup.request`, Native backup/restore code and terminal acceptance, release/backup documentation.

**NEW:** Provider-specific backup worker, backup artifact metadata, restore rehearsal runner and direct lifecycle tests.

`backup.request` may remain an asynchronous request operation. It must create a durable job consumed by an actual configured worker. Use lifecycle `REQUESTED → RUNNING → ARTIFACT_CREATED → VERIFIED`, with FAILED/retry states. `RESTORE_REHEARSED` is separately recorded after a successful isolated restoration.

Backup scope must be explicit: business data, immutable history, schema/migrations, attachments/private import sources as required, settings and identity maps. A Web CSV export is not a complete PostgreSQL backup, and a database backup does not automatically contain object storage or provider Auth identities. Document exclusions and the restoration procedure for them.

The worker uses only server-side provider credentials, bounded permissions and an idempotent job ID. Record artifact location, checksum, size, completion time, schema version and scope. Restore into an isolated target and compare key counts, balances, stock, open reservations/folios and identity references. Never rehearse by overwriting production.

For Native backups, verify consistency during writes, restore compatibility, pending outbox and printer-job treatment, device credential handling and replacement-terminal enrollment. A byte copy that reuses another active terminal's authority is not a safe recovery.

Show the most recent verified backup and restore rehearsal distinctly. Provider absent/down yields “Backup request recorded; provider unavailable” or a blocker, not “backup successful”. Current hosted-validation caveat remains until evidence is produced.

**Acceptance:** One request causes one backup job/artifact. Provider failure is visible and retryable. Checksum mismatch cannot become VERIFIED. Isolated restore validates business invariants and produces evidence. The UI/readiness gate cannot substitute REQUESTED or timestamp-only records for a verified artifact.

### WP-17 — Secure exports and financial/string serialization

**Priority:** P1. **Dependencies:** WP-04; import strings WP-14–15.

**Existing files:** `WebAdministrationView.tsx` (`exportReport` and quote serializer), Native CSV import/export utilities, barcode schemas/templates.

**NEW:** Shared safe CSV serializers, export schema descriptors and tests.

Quoting CSV is required but does not neutralize spreadsheet formulas. For text cells, detect formula-leading `=`, `+`, `-` and `@`, including control/leading-whitespace patterns that spreadsheet applications may ignore. Neutralize them according to the accepted spreadsheet-safe export policy, typically a leading apostrophe, then quote/escape the CSV cell.

Typed numeric cells may legitimately be negative and should serialize as validated finite numbers. Phone numbers, identifiers, barcodes, reference codes and external IDs remain text. Distinguish a machine-import export from a spreadsheet-safe report; document any protective prefix so it cannot silently change reimported business IDs. Barcode exports must have a format that preserves leading zeros and exact digit strings when opened in common spreadsheets.

Flatten nested fields through an explicit report schema or serialize them as safe text; do not accidentally create formula-bearing cells from object JSON/string conversion. Filenames and business date labels use property time. Reports include applied filters/scope and are restricted to authorized records.

**Acceptance:** Test `=1+1`, `+254...`, `@...`, `-formula`, whitespace/control prefixes, quotes, commas, newlines, non-ASCII names, legitimate negative amounts and leading-zero barcodes. Export/reimport expectations are explicit. Permission-restricted fields do not leak through download columns.

### WP-18 — Provide real shared-device sign-out and revocation policy

**Priority:** P1. **Dependencies:** WP-06, WP-08.

**Existing files:** `RemoteManagerApp.tsx` (`clearSession`, `signOut`), `BusinessStore.ts`, `session.ts` device key, Web automatic sync, service worker/cache code, localStorage count data.

**NEW:** Device trust preference, scoped purge coordinator and local retention tests.

Ordinary sign-out uses the current/local session scope; “Sign out everywhere” is a separate security action. Verify the supported Auth API behaviour and retry/error handling during implementation. Sign-out clears in-memory state promptly even when a remote logout request fails; never leave the visible business session open solely because the network is down.

Offer an explicit “Sign out and clear local business data” action for shared devices, and a deliberate private-device retention policy. Do not describe the current plaintext IndexedDB cache as encrypted. If encrypted retention is implemented, include key lifecycle and recovery design; otherwise clearly describe the local access limits.

Purge ordering:

1. Stop and abort background sync/workflow operations, invalidate generation/session callbacks and acquire appropriate scope coordination.
2. Detect drafts/pending commands and show their status. Unsynchronized work must not be silently discarded; shared-device purge is an explicit choice with safe handling/export where appropriate.
3. Close all scoped database handles, notify other tabs and delete the correct business/device/actor databases. Handle blocked deletion visibly.
4. Remove associated device/count/workflow localStorage and any business-bearing cache entries, without wiping another business's unrelated data.
5. Clear credentials/session memory and restore the signed-out UI. A late async callback must not recreate the cleared database.

Revocation/deactivation purges authorized cached records on next online contact and blocks new commands. An offline browser cannot learn a new server-side revocation instantly; expire offline grants and describe this limit accurately. Re-register a new device after intentional purge where sequence reconciliation requires it; never reset a registered device's sequence to zero silently.

**Acceptance:** After shared-device purge, IndexedDB, localStorage and business caches contain no scoped business data. Other tabs stop access. Pending-work loss requires explicit handling. Signing out on one browser does not log out another unless “everywhere” was selected. Deactivated staff/device cannot sync or retain authorized records on the next contact.

### WP-19 — Finish shared dialogs, blockers and interaction states

**Priority:** P1. **Dependencies:** WP-03, WP-08; shared controls already exist.

**Existing files:** `src/design-system/controls.tsx`, `tokens.ts`, `components.tsx`, `src/native/ActionDialog.tsx`, generic Web editor and custom Native/Web overlays, `scripts/audit-ui.mjs`.

Reuse `Dialog`, `FormField`, `BusyButton`, `BlockerCard`, `RecoveryAction` and `ConflictNotice`. Current `Dialog` supports a dedicated footer, but Native `ActionDialog` forwards only children. Add footer forwarding and migrate action consumers; a footer rendered inside the scrolling body does not gain the shared component's fixed-action behaviour.

Use a form ID and footer submit button association when the action footer lives outside the form. Ensure Enter submits once and Escape/backdrop dismissal cannot hide an in-flight financial result. Introduce explicit busy/dirty-dismissal policy without inventing browser confirmation prompts. Keep results recoverable if the form closes.

Dialog requirements:

- Accessible title, focus containment, visible focus, background inertness and reliable restoration.
- Escape/backdrop policy appropriate to pending commands; double overlay stacks must not compete for focus.
- Non-scrollable header/action footer, scrollable body with `min-height:0`, safe viewport limits.
- Readable disabled/busy/error state; opacity alone never hides the CTA.
- Per-field errors and an adjacent summary/blocker indicating guest, dates, stock setup, permissions, till or other requirements.
- Drawer gets equivalent focus/modal behaviour when used as a blocking workflow; current Drawer is not equivalent to Dialog.

Replace `window.prompt`, `confirm` and `alert` in production flows with typed in-app interactions. Audit all reported views, including current Web POS/financial/hospitality and Native rooms/housekeeping/inventory. Do not patch only one runtime. Preview code can remain separately inventoried but must not mask production findings.

Current `SearchCombobox` is a styled search input, not a complete entity selector. Implement an accessible searchable selector with options, selection identity, loading/error/empty state and permission-gated inline creation. Guest/product/supplier/room selectors should not require operators to know UUIDs.

**Acceptance:** Required workflow tests at 1024 × 600 and mobile prove footer visibility, validation, focus and recovery. No production prompt/confirm/alert call remains except a documented intentionally permitted browser API use. Submitting does not discard values on rejection. Disabled actions remain readable and explain why they cannot proceed.

### WP-20 — Replace approval-token handoff with approval requests

**Priority:** P1. **Dependencies:** WP-04–06, WP-08, WP-19.

**Existing files:** `WebStaffAdminView.tsx`, Native manager approval UI/backend, SQL `016_staff_devices_approvals.sql` approval issuing/consumption, protected POS/refund/procurement/credit actions.

**NEW:** Approval request lifecycle, manager inbox and initiator notification/polling.

The initiating operator requests approval from the actual workflow. Persist a request containing stable initiator identity, canonical permission/operation, exact target, material payload digest, amount/variance summary, versions, business and expiry. Show the manager the business effect in plain language: who, what changes, why and how much.

Manager approves or denies with a reason. The server validates active approver/grant, target, initiator, payload/version scope and expiration. The approval capability remains internal and is consumed atomically by the approved command. Operators do not copy UUID tokens between people.

Bind approval to the action's material content, not just target ID: approval to discount KES 900 to KES 750 must not authorize a later different discount. A changed target/version/payload invalidates approval and requires review. Maintain separate-approver rules such as procurement over-receipt, plus one-time/expiry/active-manager checks already implemented.

Do not queue stale approvals offline as if still authorized. Native PIN approval may remain a local interaction under the accepted terminal profile, while shared authority records the same stable approver identity and scope.

**Acceptance:** Initiator request appears in authorized manager inbox, approval/denial returns automatically and no token is exposed in normal UI/logs/clipboard. Changed amount/target/initiator, reuse, expiry, deactivated approver and self-approval restrictions are denied. Approved business command and approval consumption are one transaction.

### WP-21 — Connect staff invitations to identity binding

**Priority:** P1. **Dependencies:** WP-05–06, WP-19.

**Existing files:** `WebStaffAdminView.tsx`, Administration Auth lifecycle UI, `supabase/functions/servos-auth-lifecycle/index.ts`, SQL Auth authorization/profile functions, Native staff administration.

**NEW:** Pending staff invitation model, automatic authenticated acceptance binding and invitation reconciliation.

Normal workflow asks for email, name, role and permitted outlet/service scope. Server derives the canonical staff ID and stores a pending invitation. Provider invite and profile creation are coordinated with an idempotent request identity, explicit pending/failed/accepted status and retry/reconciliation because external Auth and database transactions are not one atomic transaction.

On acceptance, link the provider Auth ID to the pending staff identity using trusted server/provider evidence. Do not accept an arbitrary UUID supplied by the invited browser as proof. Handle already-existing accounts, duplicate invites, expired links, conflicting staff identities and partially completed provider actions. Only the correct business's authorized administrator may invite/bind that user.

Keep role assignments within administrator grants; preserve last-Admin, self-change and deactivation safeguards. A normal employee CSV intake may create a pending identity proposal, not automatically send invitations without an authorized invitation action.

The current Auth lifecycle function provides a foundation. Verify authorization, allowed redirect origins and server-only credentials before extending it. Keep provider implementation detail out of normal staff forms; retain any advanced repair binding under a clearly restricted admin/support action with audit.

**Acceptance:** Admin can invite by email/name/role and the accepted user appears with correct staff identity/permissions. Ordinary staff UI requires no Auth UUID or staff ID entry. Invitation resend/reconciliation cannot duplicate profiles or escalate roles. Failed provider request remains visible and recoverable.

### WP-22 — Make fiscal, quantity and tax inputs operator-friendly

**Priority:** P1. **Dependencies:** WP-04, WP-07, WP-11, WP-19.

**Existing files:** `WebBusinessApp.tsx` (`addRate`, `quickProduct`, `minor`), catalog/payment/rate forms, Native fiscal conversion/helpers, import schema definitions.

Operators enter percentages and business units. Convert percentage to basis points with exact decimal parsing; do not require “1600 means 16%”. Validate supported range and precision before storage. Keep integer minor units canonical for money; use safe integer/range checks and deterministic decimal handling instead of arbitrary floating-point multiplication followed by rounding.

Quick Product must resolve the configured default tax class or require selection. Show tax class/rate/inclusion in review. Do not silently hardcode `A_STANDARD`. Missing tax configuration is a blocker, not a concealed default. Policy changes are versioned; historical price/tax/receipt snapshots remain unchanged.

Quantity inputs show base unit and scan/package conversion. Counts, receiving, recipes and portions must share units. Fractional quantity precision is explicitly specified per unit; NaN, infinity, negative forbidden values and overflow are rejected by clients and engines.

**Acceptance:** Tax 16% stores 1600 basis points; invalid precision/range is rejected. Money decimal boundary fixtures agree in Native/cloud. Exempt/zero-rated/default classes appear accurately and immutable receipts retain their original fiscal snapshot. Barcode package-to-stock conversion matches receiving/count/sale effects.

### WP-23 — Accept scanner and receipt behaviour on the real terminal

**Priority:** P1 for terminal release. **Dependencies:** WP-10, WP-19, WP-22.

**Existing files:** `src/hooks/useBarcodeScanner.ts`, Native/Web catalog/inventory/POS views, barcode equality/import utilities, `src-tauri/src/printer.rs`, Native receipt/acceptance panels, `scripts/configure-xprinter-usb.ps1`, `scripts/test-xprinter-usb.ps1`, printer/user-guide documents.

The project has specific hardware requirements: scanner-assisted product/inventory work and conventional 80 mm receipts. This sweep must retain and validate them. Their physical behaviour was not assessed by the supplied screenshot or this source review.

Scanner acceptance covers keyboard-wedge termination/timing, repeated scans, focus in text inputs, unknown code, duplicate code, damaged/missing scan, package quantity and manual fallback. Capturing a scanner stream must not steal a guest name, PIN, M-Pesa reference or free-text input. Use documented capture contexts and a visible scan result. Reject ambiguous matches and preserve exact barcode strings during CSV intake/export.

Receipt acceptance covers immutable source document, business identity/header, receipt number, business date/time, cashier, item description/quantity/unit price/total, tax/tender/change summary and correct copy purpose. Numeric columns align; long names wrap without breaking totals. Use the printer's actual printable width (often narrower than the 80 mm roll), not a hardcoded full 80 mm content area.

Verify browser preview/print and native printer output separately. Printer queue persists across restart. Reprint refers to the original receipt and is marked/audited appropriately; it does not create a sale. Distinguish “accepted by spooler”, “print attempt failed/unknown” and physical confirmation. A crash after spool submission cannot always prove whether paper printed; surface that ambiguity before retry to avoid unlabelled duplicate copies.

**Acceptance:** Capture real terminal/scanner test evidence and photos/scans of 80 mm customer/business copies with representative long items and tenders. Unplug/reconnect, paper-out and restart/retry are handled. A print failure never rolls back an already committed sale or repeats its accounting/stock effects. Native receipt preview is readable on the target AIO screen.

### WP-24 — Repair UI audit policy, determinism and repository noise

**Priority:** P1 for gate correctness; P2 for artifact size. **Dependencies:** WP-04, WP-19.

**Existing files:** `scripts/audit-ui.mjs`, `docs/generated/UI_INTERACTION_INVENTORY.json`, `docs/generated/OPERATOR_UX_AUDIT.json`, `src/runtime/operationManifest.ts`, `.github/workflows/ci.yml`, `.gitignore`.

Separate inventory generation from acceptance. Preserve the script's truthful UNREVIEWED terminology. Add an `audit:ui:gate` that evaluates explicit high-confidence rules and workflow evidence. Source heuristics should produce review findings; they cannot reliably infer runtime accessibility, focus or whether a command succeeds.

Repair the disabled-opacity condition. It currently requires `disabled:opacity-*` while also requiring no `disabled:opacity`, making it self-cancelling. The replacement detects opacity-only disabled styling, checks component/state context and requests review for a blocker/visible state. Include small fixtures proving the rule fires and proving styled/shared controls do not generate meaningless duplicate warnings. Do not use a line-level regex as conclusive evidence of accessibility.

Start the gate with production prompt/confirm/alert violations, unresolved operation references, selected critical workflows without acceptance references and validated high-risk bypasses. Store waivers with rule, scoped file/workflow, reason, owner, expiry and evidence. No global “ignore existing issues” bypass or mass acceptance of generated rows.

Store compact metadata: workflow/operation ID, file/symbol/line, rule, status, test/evidence reference and source digest. Avoid copying entire minified JSX lines or repeated file context into thousands of records. Generate full inventories as CI artifacts; keep a small authoritative workflow acceptance manifest and summary in Git.

Use source commit/digest, stable ordering and stable IDs. Omit clock-based `generatedAt` from tracked deterministic output. Generated line-number noise should not replace semantic workflow identity. Record current production/demo scope explicitly.

**Acceptance:** Generator emits byte-identical tracked output for identical source. A seeded gate violation exits nonzero. Removing a required test reference fails selected workflow acceptance. CI uploads full artifacts; tracked summaries remain compact. A green inventory step is never labelled as complete UI acceptance.

### WP-25 — Complete PWA installation assets and production packaging

**Priority:** P2. **Dependencies:** WP-03; update/pending-work behaviour WP-08.

**Existing files:** `public/manifest.webmanifest`, HTML head assets, service-worker registration/update logic and production runtime selection.

**NEW:** 192/512 px icons, maskable icon, apple-touch icon and favicon assets based on the existing ServOS identity.

Manifest currently has `icons: []`. Supply correct sizes/types/purposes, ensure maskable safe area and add matching HTML references. Check deployed scope/start URL, content types, offline shell and installation on a supported browser. Do not treat successful Vercel bundling as proof of installability.

Preserve the existing deliberate update activation strategy. Prevent update/reload while financial commands or durable promotion are in-flight; explain pending work clearly. Test that an installed app upgrades its local database safely and does not reset sequence/cursor/drafts. Offline cached shell must not accidentally expose demo routes, stale unauthorized business records or an incompatible command schema.

**Acceptance:** Manifest references real correctly sized files, installable Web build displays the correct icon, standalone launch uses the intended production profile, and service-worker upgrade retains or explicitly migrates pending work. Browser acceptance checks manifest/icon requests; physical installation evidence records the supported device/browser.

### WP-26 — Remove stale backups, duplicate SQL and production encoding defects

**Priority:** P2. **Dependencies:** Behaviour fixes; migration provenance checked before deletion.

**Existing files:** `.gitignore`, `src-tauri/src/store.rs.before-result-fix.bak`, scanner/catalog/POS timestamped `.bak` files, root `202609270001_reconciliation_manifest.sql`, canonical `supabase/migrations/202609270001_reconciliation_manifest.sql`, `NativePOSView.tsx`.

Remove committed `.bak` files after checking no build/documentation/script relies on them. Ignore `*.bak` and `*.bak.*`; do not use broad rules that accidentally ignore intentional test fixtures. Git history retains source recovery.

Both reconciliation migration copies have the same inspected content/blob identity. Keep `supabase/migrations/...` canonical and replace the root copy with a documented reference if discoverability is needed. Check terminal setup/manual commands and docs before deletion so operators cannot follow a broken migration path.

Normalize UTF-8 mojibake in user-facing strings (`Â·`, corrupted ellipsis and similar sequences). Search across production Native/Web/help docs. Review each match: do not globally replace legitimate non-English characters or blindly recode already-valid files. Keep source encoding consistent.

**Acceptance:** No production `.bak` is tracked, migration references resolve to one canonical file, source compiles and help/docs checks pass. UI captures show clean typography; scanner references/receipt copy retain exact text.

### WP-27 — Isolate preview and split large modules safely

**Priority:** P2. **Dependencies:** WP-04–13 integrity fixes and passing regression baseline.

**Existing files:** `src/App.tsx`, legacy `MainApp`/components/context, `src/native/NativeRoot.tsx`, `NativeBarShell.tsx`, `src/runtime/RemoteManagerApp.tsx`, `WebBusinessApp.tsx`, `src-tauri/src/store.rs`, `src-tauri/src/tests.rs`, `src/context/ServOSContext.tsx`.

**NEW:** Explicit preview subtree and domain-oriented Rust store modules. Confirm exact legacy context path in the checkout; the earlier narrative used inconsistent spelling.

Production entry points are NativeRoot → NativeBarShell and RemoteManagerApp → WebBusinessApp. Legacy MainApp remains preview-only under DEV/demo flags. Make that boundary unmistakable and use dynamic imports so production bundles do not unnecessarily pull preview assumptions or data. Keep preview fixtures isolated from operating business state.

Refactor the Rust store through an explicit public façade. Split auth/permissions, commands, POS/payments, inventory/counts, procurement, rooms/stays, folios, credit/reconciliation, assets/maintenance, staff, imports, accounting and recovery while retaining transaction ownership in the orchestration layer.

Avoid splitting code and changing behaviour in the same patch unless unavoidable. Preserve helper visibility, error contracts, migration includes and Native test crate imports. The current native-tests crate references source modules directly; update that path architecture so it exercises the refactored implementation, not an orphaned pre-refactor file. Move domain tests into coherent modules without deleting tests or duplicating fixtures.

WebBusinessApp should retain shell/session/navigation coordination while typed workflow/command adapters own domain editors. Share contracts and controls, not one enormous generic editor pretending all domains have the same invariants.

**Acceptance:** Production flags make preview inaccessible and avoid preview-only code in the main bundle where feasible. Native/domain/shell suites run the new module graph and preserve effects/error behaviour. Existing migration paths still work. Registry links point to authoritative handlers; no duplicate old implementation remains active.

### WP-28 — Build a canonical fresh v2 schema without losing upgrade history

**Priority:** P2 for maintainability; P1 for deployment reproducibility. **Dependencies:** WP-04, repaired SQL packages, WP-13.

**Existing files:** `supabase/expansion/001_protocol.sql` through `021_room_stay_policy.sql`, subsequent sweep forward migrations, `scripts/test-supabase.mjs`, cloud tests.

**NEW:** Canonical v2 bootstrap/schema representation and schema equivalence tests.

Historical wrapper migrations remain upgrade history. Produce the intended final dispatch/helper/permission definitions without requiring a new installer to understand the whole wrapper chain. Choose explicit handler registry/dispatch tables or a clear dispatcher with domain functions; do not rely on “contains operation string” as proof of dispatch.

Test two disposable databases:

1. Historical base + expansion + new forward migrations.
2. Fresh canonical bootstrap.

Compare tables, columns, constraints, grants, RLS/policies, functions, triggers, indexes, registry/role versions and behaviour outcomes. Normalize expected installation-specific identifiers before comparing. The canonical bootstrap is for fresh setup only; it must not be applied over an existing database or used as an excuse to delete historical migrations.

**Acceptance:** Both schema paths pass identical domain/concurrency/authorization fixtures. Drift fails CI. Privileged function search paths/grants remain constrained. Existing upgrade path preserves historical data and control/fence defaults. Dispatcher behaviour is discoverable in one authoritative current definition.

### WP-29 — Complete domain parity, adversarial acceptance and concurrency

**Priority:** P0/P1. **Dependencies:** All related domain/identity/authority packages.

**Existing files:** `operationManifest.ts`, all production Native/Web views, Native tests, `tests/supabase/*.sql`, `tests/supabase/concurrency.mjs`, browser transactional tests, financial/import/terminal acceptance tests.

**NEW:** Shared business scenario fixtures, operation coverage report, domain integration suites and failure-injection harness.

Coverage is judged by effects and safeguards. For each declared production operation, prove success, permission denial, invalid state/payload, relevant version conflict, duplicate/retry and expected durable artifacts. Generic record edits cannot substitute for protected domain workflows.

| Domain | Required end-to-end scenarios |
| --- | --- |
| POS/KDS | Create/edit/fire/prepare/serve, repeat round, transfer/merge, discount/comp/void, named customer, stock consumption |
| Payments/tills | Cash/change, manual external evidence, split tender, duplicate reference, partial settlement, refund/reversal, till cash movement/close |
| Credit/M-Pesa | Account configure/limit, charge/settle, statement match, discrepancy/review/resolution, write-off and protected reversal |
| Catalog/inventory | Product/portion/modifier/recipe, barcode string/uniqueness, receiving/transfer/waste, full reviewed count, opening balance |
| Procurement | Purchase order, partial delivery, over-receipt approval, supplier invoice/payable/payment and stock/accounting conservation |
| Rooms/folios | Setup, NIGHTLY/DAY reserve, condition/block, check-in/move/extend/checkout, services/deposit/application/refund/room charge |
| Assets/maintenance | Category/tag uniqueness, commission, assign/return/transfer, inspect/lose/retire/dispose, report/assign/start/complete/cancel maintenance |
| Staff/devices | Invite/bind, role/grant/deactivate/PIN/session invalidation, revoke, manager approval and last-Admin protection |
| Administration | Safe settings, real import plan/application/reconciliation, authorized exports, backup/restore evidence and lifecycle readiness |
| Help/training | Permission-appropriate guides, valid anchors, resumable tour, no fake setup completion |

Assets/maintenance need explicit state transition coverage. Asset assigned to a room must retain custody/history, active maintenance must be considered when moving/retiring/disposing, completion must not automatically return an unsafe room to service, and protected history cannot be erased by generic record edits. Existing handlers are substantial; inventory actual gaps before adding competing implementations.

Concurrency fixtures run independent sessions/devices against the same authoritative database:

- Same room overlapping reservation: exactly one valid outcome, no orphan folio.
- Sale versus count/transfer/receipt: accepted order respects stock/baseline policy; conflicts identify changed dependencies.
- Two payments/credit settlements with the same external reference: one financial effect.
- Checkout versus POS room charge/extension: no closed folio receiving a new charge.
- Maintenance versus asset transfer/room return to service: correct final safety state.
- Role/device revocation versus pending command: authority checked at execution, not only at UI rendering.
- Response dropped after server commit: identical retry returns original result.
- Two tabs submit/promote the same workflow: no duplicate command/effect and no sequence hole.
- Service-worker update/restart versus queued work: original command preserved and recoverable.

Compare semantic projections across Native/cloud: balances, journals, movement totals, statuses, audit correlation and receipt contents. Generated IDs/timestamps need normalization; real differences in money/state/permission must not be normalized away. Browser-only two-operator tests prove Web concurrency, not a real terminal/cloud cutover. Label test surfaces precisely.

**Acceptance:** No unexplained missing cell remains in the required operation matrix. Every financial/stock/room transition has behaviour evidence. Failure injection proves rollback/retry conserves money/stock and preserves operator work. Physical-only limitations stay separately visible.

### WP-30 — Publish truthful release state and protect integration

**Priority:** P0 for release decision. **Dependencies:** WP-01–29, profile-specific exceptions explicitly recorded.

**Existing files:** `docs/CURRENT_RELEASE_STATE.md`, `docs/COMPLETION_LEDGER.md`, `DEV-FINAL-SPRINT.MD`, release/user-guide/acceptance docs, workflow checks and this file.

Generate a concise release dossier tied to exact source SHA, contract/policy version, schema fingerprint, build/profile flags and packaged artifact. It lists checks, observed results, test references, migrations, reconciliation/backup evidence, unresolved blockers and physical acceptance status. Do not copy optimistic status from old docs or a manifest.

Protect `main` through the repository owner's available settings, requiring meaningful named checks. This is an administrative configuration task; document the exact rules/checks to apply if the implementation agent lacks permission. Do not report protection configured unless it has actually been verified. Avoid requiring a check that never runs for the selected event/profile.

Use accurate PR/commit descriptions centered on final behaviour and validation. Keep large generated artifacts out of review. Release through a reviewed candidate; no force-push or automatic downgrade of checks.

**Acceptance:** Dossier identifies the release profile and distinguishes source/browser/native/cloud/shell/hardware evidence. Required checks are green for the candidate SHA. P0 items are VERIFIED or genuinely outside that profile with reason; unresolved shared authority means no shared-release claim. Production migrations/cutover remain an explicit final operation after rehearsal and review.

## 6. Canonical protocol and acceptance contracts

### 6.1 Registry record: proposed shape

This is a schema illustration, not a claim that the registry files already exist:

```json
{
  "id": "inventory.countLocation",
  "contractVersion": 2,
  "permission": "inventory.count",
  "releaseProfiles": ["TERMINAL_LEGACY", "SHARED_V2"],
  "lifecycle": ["LIVE"],
  "payloadSchema": "countLocationV2",
  "baselineResolver": "locationCountDependencies",
  "approvalPolicy": "inventoryVariancePolicy",
  "offlinePolicy": "reviewedDraftUnlessAllocated",
  "handlers": {"native": "inventory.countLocation", "cloud": "inventory.countLocation"},
  "workflows": ["terminal.inventory.count", "web.inventory.count"],
  "tests": ["count.complete", "count.unknownScan", "count.stale", "count.retry"]
}
```

Field values above are proposed identifiers. Implementors must map them to real typed resolvers/tests and verify that references resolve; a string in JSON cannot satisfy acceptance by itself.

One operation contract defines required fields, optional fields, units, enum values, creation/update semantics, error codes, approval target and version dependencies. Registry generation supplies language constants and validation metadata. Rust/SQL still enforce domain invariants; generated schemas cannot infer accounting/availability safety.

### 6.2 Count payload: canonical direction

```json
{
  "sessionId": "count-session-id",
  "locationId": "main-store-id",
  "sessionRevision": 7,
  "reason": "Reviewed closing count",
  "unknownBarcodes": [],
  "rows": [
    {"stockItemId":"stock-a","expectedQuantity":24,"countedQuantity":22},
    {"stockItemId":"stock-b","expectedQuantity":6,"countedQuantity":0}
  ]
}
```

The envelope provides relevant record versions; the reviewed session model provides catalog/membership/scan conversion evidence. Adapt Native's current `draftSessionId`/revision representation explicitly, not by pretending the sample is its current exact wire format. Validate complete membership, unique rows, permitted precision, zero-versus-uncounted and current baseline in both runtimes. Unknown scans may only be resolved through a recorded action before finalization.

### 6.3 Command outcomes and operator language

| State/outcome | Business meaning | Operator-facing wording |
| --- | --- | --- |
| Local draft | Inputs saved; no business transaction | “Draft saved on this device. Review and submit when online.” |
| Pending command | Durable immutable command awaiting execution/result | “Waiting for server confirmation.” |
| Committed local | Accepted SQLite effect under valid terminal/offline authority | “Saved on this terminal; synchronization pending.” |
| Cloud synchronized | Authoritative command effect accepted, with result/audit | “Confirmed and synchronized.” |
| Conflict | Submitted baseline no longer satisfies policy | “Records changed. Review the latest values.” |
| Rejected | Server refused the submitted command | “Change was not applied. Review the reason.” |
| Import staged | Source accepted for processing | “Import source received; validation pending.” |
| Import applied | Plan's actual business effects completed | “Import applied,” with effect counts/reconciliation |
| Backup requested | Job recorded | “Backup requested; completion pending.” |
| Backup verified | Artifact integrity verified | “Backup verified,” with timestamp/scope |
| Restore rehearsed | Isolated restore/business validation completed | “Restore rehearsal passed,” with evidence |

`SYNCHRONIZED` presently represents the accepted cloud result. If renaming/enriching states, migrate readers and existing queues deliberately. Do not silently change state meaning inside a UI label. A page refresh is not proof an effect committed; use the immutable server result and corresponding records/audit.

### 6.4 Error contract and recovery

| Error class | Retry policy | Recovery |
| --- | --- | --- |
| Transport timeout/response loss | Same ID/body retry | Keep pending command; query/retry for original result |
| Version conflict | No automatic revised-body retry | Compare latest values, review and submit new command |
| Validation/invalid state | Correct inputs/state, new reviewed command | Keep original values and show field/domain cause |
| Permission/device/identity revoked | Stop mutation and refresh authority | Reauthenticate or obtain authorized approval; purge revoked cache |
| Allocation expired/exhausted | Never fabricate more rights | Reconnect/reallocate or save draft |
| Storage failure | Never claim durability | Preserve in-memory form and give explicit retry/export option |
| Processor/provider failure | Idempotent job retry per state | Show failure detail and last completed checkpoint |
| Printer outcome unknown | No sale/payment retry | Audited reprint decision for original document |

Each error includes stable code, operator-safe message, retryability, command/correlation ID and field/dependency details where permitted. Avoid exposing raw SQL, provider secrets or unnecessary personal payloads in normal notices.

### 6.5 Minimal role workspace policy

This is a product-purpose guide; exact command grants remain the reviewed canonical matrix.

| Role | Default work focus | Protected capabilities |
| --- | --- | --- |
| Admin | Business/setup/staff/devices plus all authorized operations | Tax/policy/grants/import execution/restore |
| Manager | Operations and exception management | Explicit restricted Admin-only actions remain excluded |
| Cashier | POS, payments, till and assigned service work | Refund/discount/void/credit exceptions require applicable grant/approval |
| Server | Orders and service status | No accidental broad till/accounting/staff authority |
| Chef | KDS and relevant service information | No POS/till merely because `records.view` exists |
| Housekeeper | Room readiness, assigned maintenance and room context | No financial/admin workspace by generic read grant |
| Accountant | Reports/reconciliation/authorized credit settlement | Operational/staff edits only through explicit grants |
| Custom | Explicitly assigned useful workspaces | Unknown/unassigned permissions denied |

Read scope matters as much as mutation scope: one role should not obtain full business snapshots solely to render a few cards. Authorized server snapshot/change-feed projection and cache purge must agree with the role policy.

## 7. Complete original-finding crosswalk

Original section numbers are retained here so none of the earlier forensic work disappears in the rewrite. The current status refers to the inspected source snapshot, not to the desired result of this specification.

| Original section | Finding | Updated assessment | Work packages / closure proof |
| --- | --- | --- | --- |
| 1 | Executive severity assessment | Replaced by profile-specific priorities and evidence | All packages; release dossier |
| 2 | Offline edits falsely promise automatic sync | OPEN; exact notice and missing promotion path remain | WP-08; durable draft → review → one command |
| 3 | Full-location count/cloud semantics mismatch | PARTIAL PROGRESS; expansion 024 now enforces the shared full-location rows contract and the Web sends that contract, while durable browser session/review remains open | WP-08, WP-10; shared full-count fixtures and reload/rejection evidence |
| 4 | Unknown barcode `&& false` bypass | PARTIAL PROGRESS; Web confirmation now blocks unresolved scans and cloud 024 rejects crafted unresolved payloads; Native and duplicate-code acceptance remain to be consolidated | WP-10, WP-24; client/backend denial |
| 5 | Count resume incomplete | PARTIAL PROGRESS; rejected Web submissions retain the local session and Native durable drafts remain covered, but Web per-item rows and full review reopening are still incomplete | WP-08, WP-10; restart/reload rows preserved |
| 6 | Settings document replacement/clobber | OPEN; current SQL passes partial replacement | WP-07; omitted/nested fields preserved |
| 7 | Operation/permission dialect drift | OPEN; backend implementations unchanged in comparison | WP-04; versioned adapters and registry parity |
| 8 | Native/cloud role mismatch | OPEN; Native permissive fallback remains | WP-05; exact role/grant matrix |
| 9 | Broad workspace visibility | OPEN; POS/Administration generic read grants remain | WP-05; role workspace acceptance |
| 10 | Stale operation manifest | OPEN; declared implementation and tests not executable proof | WP-04, WP-24; derived parity matrix |
| 11 | Missing cloud `room.condition` | PARTIAL PROGRESS; expansion 025 now provides Native-equivalent maintenance-state and active-reservation safety, while broader room lifecycle parity remains open | WP-11; Native/cloud state fixtures |
| 12 | CI omits cloud expansion | OPEN; workflow calls base script without flag | WP-02; named cloud-v2 job |
| 13 | Expansion coverage misses late operations | OPEN; runner test list omits direct late-operation suites | WP-02, WP-29; behaviour coverage report |
| 14 | CI failing | UPDATED at #28: 61/71 Native, 22/22 browser; locator fixed, Native remains open | WP-01; Native suite green and browser success retained |
| 15 | UI inventory is not acceptance gate | OPEN; script prints findings and exits normally | WP-24; real selected-rule gate |
| 16 | Disabled-opacity rule self-cancels | OPEN; exact impossible condition confirmed | WP-24; positive/negative rule fixtures |
| 17 | Missing terminal viewports | OPEN; desktop + 390 × 844 only | WP-03, WP-19; 1024 × 600 and AIO evidence |
| 18 | Tauri shell outside normal CI | OPEN; domain crate only | WP-02, WP-13; shell tests + target packaging |
| 19 | Competing authority architectures | CORRECTED: cloud upload fence exists; full transition incomplete | WP-13, WP-30; all writer/runtime fences |
| 20 | Import apply only changes status | OPEN; stage/plan/application processor absent | WP-14–15; actual effects and reconciliation |
| 21 | Hosted backup only records request | OPEN; some current UI caveats already present | WP-16; artifact and isolated restore evidence |
| 22 | Whole-snapshot version baselines | OPEN; `records.map` remains | WP-09; operation-specific dependencies |
| 23 | Raw CSV persists in immutable command history | OPEN; `csvText` still submitted | WP-15; private object references/digests |
| 24 | Spreadsheet formula injection | OPEN; export quotes only | WP-17; safe typed serialization fixtures |
| 25 | Local business cache survives logout | OPEN; memory-only clear, no scoped purge | WP-18; multi-tab cache deletion acceptance |
| 26 | Ordinary logout is global | OPEN; explicit global scope remains | WP-18; local vs everywhere tests |
| 27 | Conflict/rejection recovery weak | OPEN; Activity lacks workflow reopening | WP-08; new reviewed superseding command |
| 28 | Humans copy approval UUIDs | OPEN; token/initiator/target fields remain | WP-20; manager inbox/internal capability |
| 29 | Staff creation requires Auth UUID | OPEN; normal binding form still exposes IDs | WP-21; trusted invitation acceptance linking |
| 30 | Browser prompts/confirms | PARTIAL PROGRESS; production flows still need complete inventory | WP-19, WP-24; scoped zero-violation gate |
| 31 | Time handling differs | PARTIAL PROGRESS; TS helper added, Rust +3/SQL Nairobi remain | WP-11–12; cross-language time fixtures |
| 32 | Rate editor exposes basis points | OPEN; `addRate` still uses internal unit label | WP-22; percentage input/conversion |
| 33 | Quick Product hardcodes tax class | OPEN; `A_STANDARD` remains | WP-07, WP-22; configured default/review |
| 34 | Native POS mojibake | OPEN; current source matches remain | WP-26; reviewed UTF-8 normalization |
| 35 | PWA icons empty | OPEN; current manifest confirms | WP-25; asset and install acceptance |
| 36 | `.bak` source committed | OPEN; files remain in tree | WP-26; removal/reference check |
| 37 | Legacy preview mixed into production tree | OPEN; explicit flag gate exists and should be preserved | WP-27; isolated lazy preview |
| 38 | Very large store/context/view files | OPEN; structural refactor not demonstrated by latest commit | WP-27; façade/domain modules, same tests |
| 39 | Multi-megabyte generated audits | OPEN; comparison grows generated metadata substantially | WP-24; compact tracked summary + CI artifacts |
| 40 | Audit nondeterminism | OPEN; clock `generatedAt` remains | WP-24; deterministic output |
| 41 | Duplicate reconciliation migration | OPEN; both copies identical in inspected snapshot | WP-26; canonical path + updated instructions |
| 42 | SQL wrapper dispatch chain | OPEN; preserve history but supply current canonical schema | WP-28; fresh/upgrade equivalence |
| 43 | `verify` omits cloud/desktop | OPEN; current script confirms | WP-02; complete explicit release script |
| 44 | Browser tests use demo-enabled flags | OPEN; single webServer builds demo + v2 | WP-03; isolated production build acceptance |
| 45 | Forms close before confirmation | OPEN; editor closes after enqueue | WP-08, WP-19; retained/reopenable context |
| 46 | Requested vs completed wording | PARTIAL; lifecycle distinction needs consistent implementation | WP-08, WP-14, WP-16, WP-30; effect-derived labels |
| 47 | Staff/Auth/local identity ambiguity | OPEN; synthetic/local/Auth identities coexist | WP-06, WP-13, WP-21; stable reviewed mapping |
| 48 | Existing safeguards worth preserving | PRESERVE; regression obligations enumerated | Section 3, WP-29 |
| 49 | Recommended execution order | Replaced by dependency-ordered sweep | Section 4 + WP-01–30 |

### 7.1 Additional findings established in this revision

| ID | Finding | Evidence / solution |
| --- | --- | --- |
| NEW-F01 | Failed count submission deletes count metadata and unresolved scan list | FIXED in Web count commit; failed/pending results retain the local session and unresolved scan list | WP-08/WP-10; browser rejection evidence |
| NEW-F02 | Default NIGHTLY departure can violate configured checkout | Web `reserve()` keeps arrival hour; SQL 021 requires checkout; WP-11/WP-12 |
| NEW-F03 | Shared test setup seeds a rate/type that conflicts with older room fixtures | `setup()` + property-preferred rate + CI errors; WP-01 |
| NEW-F04 | Native omitted-stay-type compatibility diverges from canonical cloud policy | Rust reservation units branch vs SQL 021; WP-04/WP-11 |
| NEW-F05 | Existing dialog footer capability is not forwarded by Native wrapper | `ActionDialog` children-only props; WP-19 |
| NEW-F06 | Current `SearchCombobox` is an input, not an entity combobox | Shared controls implementation; WP-19 |
| NEW-F07 | Conflict guidance implies retrying the original immutable rejected command | Activity copy vs cached command outcome; WP-08/section 6.4 |
| NEW-F08 | Whole-location scope currently means every active stock item | Native handler checks all active IDs; WP-10 must preserve or explicitly version this policy |
| NEW-F09 | Cloud concurrency currently includes global control-row serialization | Execute locks control row; WP-09 must not remove it casually |

## 8. Release acceptance and evidence

### 8.1 Required evidence tiers

| Tier | Evidence | What it establishes | What it cannot establish alone |
| --- | --- | --- | --- |
| E1 | Tree/static/type/source tests | Paths, signatures, call sites and selected compile-time contracts | Actual domain effect, hardware or concurrency |
| E2 | Native/cloud domain tests | Business invariants and transaction outcomes in those engines | Real packaged UI/transport/hardware |
| E3 | Browser/workflow/transport tests | Operator flow, durable state and authenticated client interaction | USB printer/scanner physical behaviour |
| E4 | Tauri integration/packaged target tests | Real bridge/runtime/profile path | Operating-terminal migration and paper output unless exercised |
| E5 | Migration/restore/two-runtime rehearsal | Cutover, data conservation and shared authority | Unexercised business scale/hardware variants |
| E6 | Physical terminal acceptance | Actual scanner, printer, paper, AIO layout and operator flow | All possible future regressions |

Every release dossier lists evidence tier and limitation. A mock RPC test does not become a cloud integration test because its button looks correct. A browser test backed by real PostgreSQL should be described as such; it still is not a terminal/cloud concurrency test unless a real terminal adapter participates.

### 8.2 Acceptance matrix with stable proposed IDs

The IDs below are proposed test/evidence identifiers. Implement them in real suites and record file/test names, rather than inserting them as unverifiable strings into manifests.

| ID | Scenario | Required assertion | Surfaces |
| --- | --- | --- | --- |
| AC-001 | Expansion dispatch gap | Remove required handler; gate fails | Registry + cloud CI |
| AC-002 | Desktop shell regression | Shell compile/test defect fails named check | Tauri CI |
| AC-003 | Staff navigation | Current accessible name leads to profiles/devices | Desktop/mobile browser |
| AC-004 | Room setup fixtures | Scenario policy/rate coherent; duplicate test retained | Native |
| AC-005 | Offline draft reload | Values/target survive; no automatic financial effect | Web storage/UI |
| AC-006 | Draft promotion race | Two tabs create one queued command | Web storage + cloud |
| AC-007 | Response-loss retry | One receipt/journal/stock effect | Native/shared transport/cloud |
| AC-008 | Conflict recovery | Original values reopen; new command links predecessor | Web/Native workflow |
| AC-009 | Settings partial edit | Omitted/nested fiscal/receipt/contact fields unchanged | Cloud + UI |
| AC-010 | Settings stale/protected patch | No mutation or success notice | Native/cloud |
| AC-011 | Full count resume | Every item/count/unknown scan preserved | Web/Native |
| AC-012 | Count unresolved/ambiguous scan | UI and backend reject finalization | Both engines/workflows |
| AC-013 | Count concurrency | Changed stock/catalog/membership produces review | Cloud + Native |
| AC-014 | Count failure | Session never erased before confirmed commit | Web storage/UI |
| AC-015 | Role/grant parity | Explicit allow/deny for every canonical pair | Native/cloud |
| AC-016 | Workspace purpose | Chef/Housekeeper see appropriate navigation | Native/Web |
| AC-017 | Identity correlation | One person mapped across local/Auth actors | Migration/audit |
| AC-018 | Authority cutover | Legacy upload/request/local writes fenced | Cloud + actual terminal |
| AC-019 | Offline grant | Expired/exhausted/unmapped grant rejected | Terminal/shared cloud |
| AC-020 | Valid departure defaults | NIGHTLY default at property checkout; DAY cutoff honored | Native/Web/cloud |
| AC-021 | Condition/maintenance safety | Cannot accept unsafe reservation/check-in | Both engines |
| AC-022 | Folio conservation | Deposit/charge/refund/checkout money conserved | Both engines |
| AC-023 | Import real effects | Created/updated records, movements, row totals match plan | Processor/Native/cloud/UI |
| AC-024 | Import retry/partial failure | No duplicates; truthful atomic/batched status | Processor/cloud |
| AC-025 | Private import source | Compact command, unauthorized source denied | Storage/cloud |
| AC-026 | Backup provider failure | Requested never becomes verified without artifact | Worker/cloud/UI |
| AC-027 | Restore rehearsal | Counts/balances/open work match isolated restore | Native/cloud/provider |
| AC-028 | CSV safety | Formula strings neutralized; numeric/text types correct | Serialization |
| AC-029 | Shared-device purge | Scoped stores/cache removed; late callbacks stopped | Multi-tab Web |
| AC-030 | Local/everywhere logout | Only chosen session scope affected | Auth integration |
| AC-031 | Approval binding | Changed action/amount/target/reuse denied | Native/cloud |
| AC-032 | Staff invitation | Email acceptance links stable role without UUID input | Auth/processor/UI |
| AC-033 | Low-height dialogs | Body scroll; footer/CTA/error remain usable | 1024 × 600/AIO/mobile |
| AC-034 | Tax/quantity input | Exact conversion/default policy shown and enforced | Native/Web/cloud |
| AC-035 | Scanner context | No free-text/PIN capture; exact barcode match | Workflow + physical scanner |
| AC-036 | Receipt queue/reprint | One sale; explicit unknown print/reprint status | Native + physical printer |
| AC-037 | UI gate | Seeded selected violation fails; waiver expires | Audit CI |
| AC-038 | Preview isolation/PWA update | Production boot/install/profile and pending state retained | Browser/package |
| AC-039 | Fresh/upgrade schema | Same schema/grants/effects from both install paths | Cloud integration |
| AC-040 | Migration reconciliation | Existing history, balances/stock/open work preserved | Rehearsal |
| AC-041 | Assets/maintenance | Valid transitions/history and safety links | Native/cloud/workflows |
| AC-042 | Two-runtime race | Real terminal and Web converge with one effect | Shared adapter + cloud |

### 8.3 Commands and verification checkpoints

Commands that exist at the inspected snapshot:

```bash
npm ci
npm run lint
npm run build
npm test
node scripts/test-supabase.mjs --expansion
cargo test --locked --manifest-path native-tests/Cargo.toml
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run test:desktop
npm run test:browser
npm run audit:ui
npm run docs:check
```

Run in the proper environment; Docker is required for the existing cloud runner and desktop platform libraries are required for Tauri. Current `test:desktop` does not include `--locked`; WP-02 adds it. Current browser command uses demo-enabled flags and current UI audit is inventory-only. Their initial success cannot substitute for the new production/gate scripts.

After implementation, add and use the full scripts specified by WP-02. A quick local checkpoint can run affected domain/workflow tests and type/build checks. At the completed release candidate, run the complete suite once for the final SHA and record its results. Repeat impacted verification after any subsequent code/schema/flag change.

### 8.4 Candidate evidence record

```text
Source SHA:
Artifact/package SHA or checksum:
Authority profile:
Contract/role/policy versions:
Schema fingerprint and install path:
Production build flags:
Target OS/browser/device:
Frontend/source result:
Native domain result:
Cloud base result:
Cloud expansion result:
Desktop integration/packaging result:
Production browser/viewport result:
Operation parity/UI gate result:
Migration/reconciliation/restore result:
Physical scanner/receipt result:
Remaining blockers and exact scope:
Release decision and reviewer:
```

Do not fill fields with assumed PASS. Include a link/file/test reference for each result. A skipped test is reported as skipped/blocked and the affected release capability is not accepted.

## 9. Data migration and rollback

The operating terminal may contain the primary current business data, and cloud may contain a replica, shared staging data or both. Do not choose an authority by taking whichever timestamp is newest. Inspect configured profile, installation/control state, outbox/request backlog, command history and enrollment before preparing migration.

### 9.1 Read-only inventory before any write

Capture schema/contract versions and an access-controlled inventory of:

- Business identity/property/receipt/tax/payment/till configuration.
- Staff/local/Auth mappings, active roles and device enrollments.
- Products, barcodes, stock units/locations, stock balances and movements.
- Customers/suppliers/credit accounts and outstanding receivables/payables.
- Open orders/tills, payments, receipts, journals and external references.
- Rooms/types/rates, reservations/stays/folios/deposits, blocks and readiness.
- Assets/custody/maintenance orders and immutable lifecycle history.
- Pending Native outbox, remote requests, Web commands/drafts/count sessions and printer jobs.
- Existing imports and source/plan/application state; verified backups and restore evidence.

Use counts/digests and totals where possible; reports containing personal details stay access-controlled. Normalize external identifiers without changing them. Explicitly identify unmatched references, duplicated barcodes/staff, incompatible room configuration and divergent command IDs.

### 9.2 Rehearsal sequence

1. Create verified backups of each authoritative source and required attachments/configuration; prove isolated restore.
2. Clone into a disposable rehearsal target with credentials/enrollment disabled or replaced so it cannot sync as a live device.
3. Apply forward migrations and identity mapping proposals. Reconcile duplicates with operator review rather than guessing.
4. Generate controlled import/cutover plans with source IDs, baseline versions and digests. Preserve original immutable command/audit references.
5. Compare before/after money, stock, open work, receipts and history. Journal debit totals equal credit totals; deposit/credit/payable balances match business projections.
6. Exercise terminal/Web reads and operations through the selected authority profile. Include a crash/response-loss retry and at least the concurrency scenarios in WP-29.
7. Prepare exact cutover steps, temporary write quiescence, pending-work disposition, rollback eligibility and communication-visible status. Produce a reviewable candidate; live execution is separate.

### 9.3 Cutover prerequisites

Shared cutover requires compatible terminal/client versions, accepted staff/device mapping, complete required domain handlers, safe staged command dispositions, verified backup, reconciliation with no unexplained delta and authority-fence tests. Missing rights/allocations cannot be bypassed with `*` permissions or a synthetic Manager.

Quiesce writes briefly according to the accepted operating plan; drain or explicitly account for all pending legacy writes/remote requests. Fence legacy endpoints in the same coordinated control transition that enables v2. Persist the epoch/profile locally and online. Validate first shared commits before resuming broad operation.

### 9.4 Rollback rules

- Before accepting shared commits, an approved rollback may restore the known legacy profile and backed-up source after verifying no conflicting writes occurred.
- After shared commits, rollback is a forward reconciliation/migration or a carefully coordinated restored state. Do not simply re-enable the old terminal database: that would create an alternate history and lose cloud effects.
- Immutable financial history is corrected through audited reversal/compensating operations, not raw deletion.
- Replacing a terminal requires new/approved device enrollment and sequence/allocation reconciliation; do not clone live credentials blindly.
- Print spool ambiguity is handled separately from transaction history. Never replay a sale merely to get paper.
- Pending drafts/commands/import batches have explicit dispositions and support references; no generic “clear all caches and try again” recovery.

**Migration acceptance:** The dossier contains before/after counts/digests/totals, resolved exceptions, identity map, schema versions, backup/restore evidence and cutover/fence test results. Every unexplained financial/stock/history discrepancy blocks shared cutover.

## 10. File and symbol reference index

Links below are pinned to the deep inspected source SHA. Those files are unchanged at the latest reviewed HEAD except the browser transaction file, whose corrected current link is supplied separately. Symbols and line numbers are navigation aids, not future patch targets; refresh them if implementation starts from a newer commit. Existing migration numbers are historical. Add subsequent migrations according to the repository's actual ordering and never assume that a proposed `022` filename is still available.

| Existing file / pinned anchor | Verified navigation target |
| --- | --- |
| [package.json:6](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/package.json#L6) | Existing script coverage and verification omissions |
| [.github/workflows/ci.yml:27](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/.github/workflows/ci.yml#L27) | Current base-only cloud CI; no desktop shell job |
| [playwright.config.ts:8](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/playwright.config.ts#L8) | Current viewports and shared demo-enabled build |
| [scripts/test-supabase.mjs:40](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/scripts/test-supabase.mjs#L40) | Conditional expansion migrations, suites and concurrency |
| [scripts/audit-ui.mjs:16](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/scripts/audit-ui.mjs#L16) | Disabled-opacity rule and generated inventory |
| [src/runtime/operationManifest.ts:32](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/operationManifest.ts#L32) | Handwritten parity assertions and generic acceptance metadata |
| [src/types/transactions.ts:5](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/types/transactions.ts#L5) | Current staged envelope, transaction states and grants |
| [src/runtime/web/BusinessStore.ts:35](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/BusinessStore.ts#L35) | Separate draft/queue storage; immutable queued commands and device sequence |
| [src/runtime/web/sync.ts:5](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/sync.ts#L5) | Only pending queue entries synchronized; locked retry |
| [src/runtime/web/WebBusinessApp.tsx:93](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebBusinessApp.tsx#L93) | Offline promise, snapshot baselines and early editor closure |
| [src/runtime/web/WebBusinessApp.tsx:111](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebBusinessApp.tsx#L111) | Device-derived departure default and property-labelled inputs |
| [src/runtime/web/WebBusinessApp.tsx:110](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebBusinessApp.tsx#L110) | Basis-point input and quick-product tax default nearby |
| [src/runtime/web/WebCatalogInventory.tsx:60](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebCatalogInventory.tsx#L60) | Local count metadata and volatile selected-item quantity |
| [src/runtime/web/WebCatalogInventory.tsx:68](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebCatalogInventory.tsx#L68) | Single-item count payload; clears session regardless of confirmation |
| [src/runtime/web/WebCatalogInventory.tsx:78](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebCatalogInventory.tsx#L78) | Unresolved-scan disable bypass |
| [src/runtime/web/ActivitySyncCenter.tsx:33](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/ActivitySyncCenter.tsx#L33) | Displays draft/conflict evidence without workflow resume actions |
| [src/runtime/web/workspaceRegistry.ts:28](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/workspaceRegistry.ts#L28) | Staff & devices accessible label |
| [src/runtime/web/workspaceRegistry.ts:34](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/workspaceRegistry.ts#L34) | Some-permission visibility using generic grants |
| [src/runtime/web/session.ts:17](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/session.ts#L17) | Auth actor/device scoped database and sequence reconciliation |
| [src/runtime/RemoteManagerApp.tsx:87](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/RemoteManagerApp.tsx#L87) | Memory clear and global logout call |
| [src/runtime/web/WebAdministrationView.tsx:22](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebAdministrationView.tsx#L22) | Raw CSV domain command; nearby quote-only export |
| [src/runtime/web/WebStaffAdminView.tsx:19](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebStaffAdminView.tsx#L19) | Copied approval token and Auth UUID staff binding |
| [src/runtime/web/WebHospitalityViews.tsx:43](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/runtime/web/WebHospitalityViews.tsx#L43) | Web condition command requiring cloud parity |
| [src/design-system/controls.tsx:6](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/design-system/controls.tsx#L6) | Shared focus/scroll/footer controls; Drawer and input-only combobox nearby |
| [src/native/ActionDialog.tsx:3](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/native/ActionDialog.tsx#L3) | Native wrapper does not forward footer prop |
| [src/utils/businessTime.ts:25](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/utils/businessTime.ts#L25) | Existing IANA wall-clock conversion helper |
| [src/native/NativeRoomsView.tsx:12](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/native/NativeRoomsView.tsx#L12) | Native room setup/reservation workflow and shared-dialog consumers |
| [src/native/NativeInventoryView.tsx:34](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/native/NativeInventoryView.tsx#L34) | Native scanner and reviewed count interactions |
| [src/native/NativeAssetsView.tsx:16](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/native/NativeAssetsView.tsx#L16) | Native asset and maintenance lifecycle interactions |
| [src/native/NativePOSView.tsx:13](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/native/NativePOSView.tsx#L13) | POS interaction and user-facing encoding review |
| [src-tauri/src/store.rs:172](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/store.rs#L172) | Role fallback and grant divergence |
| [src-tauri/src/store.rs:850](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/store.rs#L850) | Hardcoded +3-hour business-time conversion |
| [src-tauri/src/store.rs:1591](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/store.rs#L1591) | Room condition/stay/policy transaction invariants |
| [src-tauri/src/store.rs:1801](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/store.rs#L1801) | Configured property rate precedes payload rate |
| [src-tauri/src/store.rs:3021](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/store.rs#L3021) | Full reviewed count, every active item and audited adjustments |
| [src-tauri/src/tests.rs:5](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/tests.rs#L5) | Shared seeded room type/rate/policy fixtures |
| [src-tauri/src/tests.rs:678](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/tests.rs#L678) | Import assertions affected by seeded setup |
| [src-tauri/src/lib.rs:343](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/lib.rs#L343) | Legacy request polling and synthetic Manager execution |
| [src-tauri/src/printer.rs:95](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src-tauri/src/printer.rs#L95) | Native receipt byte encoding and printer transports |
| [tests/browser/transactions.spec.ts:120](https://github.com/davemusau00/SERVEOS-WEB/blob/703693d29742c537ac918330005420bb307777fa/tests/browser/transactions.spec.ts#L120) | Corrected Staff & devices locator; verified green in CI #28 |
| [supabase/expansion/001_protocol.sql:12](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/expansion/001_protocol.sql#L12) | Immutable request/result storage and Auth actor identity |
| [supabase/expansion/001_protocol.sql:118](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/expansion/001_protocol.sql#L118) | Existing legacy upload fence, not absent |
| [supabase/expansion/004_domain_helpers.sql:28](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/expansion/004_domain_helpers.sql#L28) | Whole JSON document replacement |
| [supabase/expansion/011_inventory_catalog.sql:5](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/expansion/011_inventory_catalog.sql#L5) | Current catalog/inventory cloud handlers; full count absent |
| [supabase/expansion/016_staff_devices_approvals.sql:68](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/expansion/016_staff_devices_approvals.sql#L68) | Canonical cloud roles and approval protections |
| [supabase/expansion/020_admin_operations.sql:9](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/expansion/020_admin_operations.sql#L9) | Stage metadata and status-only apply handler |
| [supabase/expansion/020_admin_operations.sql:19](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/expansion/020_admin_operations.sql#L19) | Partial settings replacement; backup request branch nearby |
| [supabase/expansion/021_room_stay_policy.sql:20](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/expansion/021_room_stay_policy.sql#L20) | Single configured rate and hardcoded-zone checkout validation |
| [supabase/functions/servos-auth-lifecycle/index.ts:10](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/supabase/functions/servos-auth-lifecycle/index.ts#L10) | Existing invitation/reset provider foundation |
| [public/manifest.webmanifest:12](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/public/manifest.webmanifest#L12) | Empty install icon list |
| [src/App.tsx:219](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/src/App.tsx#L219) | Production/demo routing and legacy preview gate |
| [docs/CURRENT_RELEASE_STATE.md:23](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/docs/CURRENT_RELEASE_STATE.md#L23) | Current terminal authority and staged v2 release limits |
| [docs/CONTROLLED_IMPORT_MIGRATION.md:1](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/docs/CONTROLLED_IMPORT_MIGRATION.md#L1) | Existing controlled migration documentation |
| [docs/COMPLETION_LEDGER.md:1](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/docs/COMPLETION_LEDGER.md#L1) | Existing completion ledger to update with evidence |
| [202609270001_reconciliation_manifest.sql:1](https://github.com/davemusau00/SERVEOS-WEB/blob/ccadfca9ee58b21513c24a9e1d3e22b529938294/202609270001_reconciliation_manifest.sql#L1) | Root duplicate migration; canonical copy under supabase/migrations |

### 10.1 Existing adjacent sources to inspect during implementation

The following paths were present in the repository tree; their involvement is a targeted review requirement, not a claim that this revision audited every line:

- Native: `src/native/NativeRoot.tsx`, `NativeBarShell.tsx`, `NativeFrontDeskView.tsx`, `NativeHousekeepingView.tsx`, `NativeFoliosView.tsx`, `NativeImportCenterView.tsx`, `NativeTerminalAcceptancePanel.tsx`, `FriendlyImport.tsx`.
- Web: `src/runtime/web/WebProcurementView.tsx`, `WebFinanceView.tsx`, `WebFinancialControlsView.tsx`, `WebRefundsView.tsx`, `WebMasterDataView.tsx`, `WebLifecycleViews.tsx`, `WebGuidanceViews.tsx`, `WebKDSView.tsx`.
- Tests: `tests/supabase/inventory.sql`, `rooms.sql`, `folios.sql`, `staff-devices.sql`, `financial-controls.sql`, `pos.sql`, `procurement.sql`, `concurrency.mjs`; `tests/browser/web-storage.spec.ts`; `tests/operator-ux-source.test.mjs`; `tests/controlled-import-source.test.mjs`; `tests/import-templates.test.mjs`.
- Templates: `import-templates/business.csv`, `products.csv`, `inventory.csv`, `customers.csv`, `suppliers.csv`, `employees.csv`, `stock_locations.csv`, `outlets.csv`, `room_types.csv`, `rate_plans.csv`, `rooms.csv`, `assets.csv`, `asset_categories.csv`, `hotel_services.csv`.
- Guides/release: `docs/IMPORT_CENTER.md`, `CONTROLLED_IMPORT_MIGRATION.md`, `RBAC_AND_PERMISSIONS.md`, `RELEASE_0.2_ACCEPTANCE.md`, `BAR_PRODUCTION_ACCEPTANCE.md`, `EXPANSION_ACCEPTANCE.md`; guides for rooms, CSV import, offline sync, printer and terminal acceptance.

### 10.2 Proposed additions

**NEW** items named throughout the work packages are design targets. Do not cite them as existing implementation:

- Canonical operation/permission/role contracts, deterministic generator and parity gate.
- Typed workflow draft/recovery model, version dependency resolvers and IndexedDB upgrade.
- Durable Web count sessions, cloud full-count/room-condition/settings forward migrations.
- Additive identity mapping, explicit authority profile/epoch and actual terminal v2 adapter.
- Private import upload manifest, validation/plan/apply/reconciliation processors.
- Hosted backup worker/artifact verification and isolated restore rehearsal.
- Safe CSV serialization and typed export schemas.
- Shared-device purge coordinator and trust/retention UI.
- Approval requests/inbox and trusted staff invitation acceptance binding.
- Complete entity combobox and dialog footer forwarding/consumer migrations.
- Production Playwright build profiles and terminal viewport tests.
- Canonical fresh schema/equivalence tests, PWA icons and isolated preview/domain modules.
- Compact acceptance/closure manifests and release evidence dossier.

## 11. Codex execution prompt and completion ledger

### 11.1 Ready-to-use implementation instruction

```text
Implement CLEAN-ServOS.MD as a coordinated remediation sweep in davemusau00/SERVEOS-WEB.

Start by reading applicable AGENTS.md and the current source/CI. The report's latest
reviewed HEAD is 703693d29742c537ac918330005420bb307777fa, with deep source inspection
at ccadfca9 and its complete one-file follow-up delta. Inspect newer changes and
update the baseline before treating any finding as still present. Browser CI #28
is green; Native still fails ten room-related scenarios.

Create a reviewable working branch. Do not reset production data, replace installed
terminal databases, enable shared v2 authority, deploy, merge or apply production
migrations as part of local implementation. Preserve immutable history, pending
commands, identity, inventory/money conservation and hardware configuration.

Execute WP-01 through WP-30 in dependency order. Freeze the canonical operation,
permission, role and payload contracts before patching dependent workflows. Repair
observed CI errors without weakening tests or room validation. Preserve the existing
cloud legacy-upload fence and complete coordinated authority control.

Add behavioural tests with each domain fix. Shared contracts must be exercised in
Native and PostgreSQL; UI source tests are supplementary. Implement actual import
effects, backup artifacts, recovery and permissions rather than marking requested or
staged work complete. If provider credentials or physical hardware are unavailable,
complete independent work, gate the capability honestly and record the exact blocker.

Do not silently reinterpret old queued commands. Response-loss retry keeps the same
ID/body; conflict correction creates a new reviewed superseding command. Count work
and editor context survive unconfirmed submissions. Existing terminal/cloud data
must be inventoried and rehearsed before any live cutover.

Use the existing shared controls/time helpers. Finish dialog footers, blockers,
searchable selectors and role navigation in both clients. Verify 1024x600, 1280x720,
1366x768 and 390x844 workflows with the real production build flags.

Keep patches reviewable. Move large modules after behaviour is stable. Preserve
migration history and prove fresh-schema/upgrade-path equivalence. Remove stale .bak,
duplicate SQL, mojibake and large nondeterministic tracked audit output.

Maintain a compact completion ledger with package ID, files, commit, test/evidence,
result and blocker. VERIFIED means the documented business acceptance passed.
Do not mark skipped hardware/provider/migration tests as passed.

At the end, run the complete required verification for the candidate SHA. Produce a
release dossier showing source, Native, cloud expansion, desktop shell, production
browser, parity/UI gates, data reconciliation/restore and physical acceptance status.
Report final changes, validation and remaining profile-specific blockers. Make a
concrete release candidate available for review; production cutover is a separate
final action requiring the accepted rehearsal and release decision.
```

### 11.2 Compact implementation ledger template

Store this in `docs/COMPLETION_LEDGER.md` or a linked small structured manifest. Do not copy generated inventories into it.

| Package | Status | Implementation files/commit | Behaviour evidence | Remaining blocker |
| --- | --- | --- | --- | --- |
| WP-01 | OPEN | Browser locator fixed at `703693d`; Native open | #28 browser 22/22; Native 61/71 | Native fixture/policy failures |
| WP-02 | OPEN | — | Full engine CI coverage | — |
| WP-03 | OPEN | — | Production flags/viewport workflows | — |
| WP-04 | OPEN | — | Registry/aliases/parity fixtures | — |
| WP-05 | OPEN | — | Role × permission + navigation | — |
| WP-06 | OPEN | — | Reviewed identity correlation | — |
| WP-07 | OPEN | — | Partial/nested settings preservation | — |
| WP-08 | OPEN | — | Draft/retry/rejection recovery | — |
| WP-09 | OPEN | — | Minimal complete dependency sets | — |
| WP-10 | IN_PROGRESS | Expansion 024 full-location cloud contract and Web failure/session slice verified locally | Durable per-item review across reload, scanner/device acceptance and full browser workflow | — |
| WP-11 | IN_PROGRESS | Native/cloud room policy and `room.condition` parity verified locally | Full move, extension, checkout and cross-runtime time acceptance | — |
| WP-12 | OPEN | — | Cross-runtime business time | — |
| WP-13 | OPEN | — | All-writer fences/terminal v2 | — |
| WP-14 | OPEN | — | Real import effects/reconciliation | — |
| WP-15 | OPEN | — | Private source/digest/compact command | — |
| WP-16 | OPEN | — | Verified artifact + restore | — |
| WP-17 | OPEN | — | Safe typed CSV/string serialization | — |
| WP-18 | OPEN | — | Purge/session/revocation policy | — |
| WP-19 | OPEN | — | Accessible dialogs/selectors/blockers | — |
| WP-20 | OPEN | — | Approval request/consumption scope | — |
| WP-21 | OPEN | — | Invitation acceptance/identity | — |
| WP-22 | OPEN | — | Exact fiscal/unit conversion | — |
| WP-23 | OPEN | — | Scanner + physical receipt/retry | — |
| WP-24 | OPEN | — | Deterministic inventory/real gate | — |
| WP-25 | OPEN | — | Install icons/update/production shell | — |
| WP-26 | OPEN | — | No stale copies/encoding defects | — |
| WP-27 | OPEN | — | Isolated preview/refactor regression | — |
| WP-28 | OPEN | — | Fresh/upgrade schema equivalence | — |
| WP-29 | OPEN | — | Domain parity/concurrency/failure injection | — |
| WP-30 | OPEN | — | Accurate release dossier/required checks | — |

These entries describe work still required at the review snapshot. Partial existing foundations are acknowledged inside each package and are not a reason to mark the full acceptance VERIFIED.

### 11.3 Completion rule

The sweep is complete only when required operations, permissions, payloads, authority profile, business effects and recovery are proven for the selected release. Independent terminal readiness can be reported separately while shared v2 remains staged. A shared deployment is not accepted while a required terminal adapter, identity map, worker, reconciliation, concurrency or hardware gate is still missing.
