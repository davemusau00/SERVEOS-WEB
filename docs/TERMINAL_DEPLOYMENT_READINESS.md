# Existing-terminal deployment readiness — 3 October 2026

Target: a separate Windows 10 PC with an existing operational ServOS installation. Preserve its data and enrollment. `FINAL-SPRINT-FIXES.MD` supersedes the earlier fresh-install and Native-only deployment assumptions. This record describes preparation; production migration and activation require a separately authorized commissioning window.

## Requirement evidence

| Final fixes / deployment requirement | Implementation and evidence | Remaining acceptance |
|---|---|---|
| Phase 0: locked baseline | Locked npm install completed; the two original source failures were Windows line-ending sensitivity and a brittle offline assertion. SVG integrity now uses documented LF canonicalization; offline command rejection is exercised behaviorally. | Freeze the final passing commit and complete the clean package gate. |
| Phase 1: persistent authority | SQLite schema 15 persists forward-only authority. Native mutations/sync are fenced during preparation and shared mode; cloud preparation freezes legacy uploads and keeps v2 execution disabled. Authenticated server evidence replaces caller-only readiness at the native transition boundary. | Actual terminal logout, expiry, failed sync and restart during cutover. |
| Phase 2: deterministic bootstrap | Known legacy configuration/history and archived IDs/versions are retained. Unknown source collections block bootstrap. Complete manifest membership, canonical record hashes, replay, atomic mismatch rejection and post-import drift checks are implemented. Resources, financial indexes and document counters rebuild without payment/stock/journal command replay. Counters retain source gaps and advance beyond archived documents; historical receipt numbers/branding remain intact. Synthetic Rust SQLite export is imported into disposable PostgreSQL. | Restore and rehearse the actual checkpoint; review every source collection and historical data shape. |
| Phase 3: native baseline | Paged snapshot installation is atomic. SQLite computes a content digest; authenticated server attestation checks identity, policy, cursor, count, content and unresolved work. Shared activation requires COMMITTED plus matching current baseline evidence. | Real Auth/project pairing and actual native installation evidence. |
| Phase 4: mutation parity | Generated operation ledger inventories 90 operations, with 84 shared Native business mutations and 2 device-local exclusions in the static gate. Disposable domain/transaction tests cover representative engines and financial effects. | Static inventory is not proof of all payloads on migrated historical records. Validate every supported operation against the actual checkpoint before commissioning. |
| Phases 5–6: shared activation / legacy retirement | Server/native gates require explicit authority and preserve superseded outbox history. Shared mode refuses legacy fallback. Recovery instructions require coordinated restore/replay or forward repair after shared writes. | No production authority was activated. Terminal/Web real-project convergence remains pending. |
| Phase 7: receipt source | Immutable selected receipts, integer-money formatting, customer/business copy separation, logo/QR placement and feed/cut byte-stream checks exist. Browser tests verify immutable receipt branding and print copies. | Raw and browser evidence cannot certify physical paper. |
| Phase 8: physical acceptance | Packaged doctor, upgrade runbook and acceptance worksheet identify the target checks. | XP-80T logo/readability/feed/cutter, physical official QR scan, scanner, complete shift/close-day/restart and replacement restore. |

## Verification captured during preparation

- `npm ci`, TypeScript, frontend build, contract generation/check and source suite: passed; source tests **207/207**.
- Windows MSVC locked native domain suite: **94/94** passed; Windows Tauri desktop library suite **94/94** passed; locked desktop compilation passed.
- Disposable base PostgreSQL suite and canonical v2 migration/domain suite passed. Exact cross-runtime manifest/page imports preserve fractional stock, money, credit/M-Pesa indexes and archived history. PostgreSQL snapshot → Rust SQLite installation → authenticated server attestation passed, including tampered-baseline rejection, refusal before commit and shared activation after matching evidence. Final package-gate results must be recorded alongside the produced release.
- Production browser matrix: **52/52** passed across POS, AIO, laptop and mobile layouts with demo disabled and isolated disposable PostgreSQL transport. This is local browser evidence, not hosted Supabase Auth or physical native acceptance.
- Preview browser matrix: **34/34** passed after correcting wizard/navigation/format selectors and allowing bounded asynchronous refund confirmation. Release packaging must fail if any required check fails.

## External evidence still required

Actual terminal checkpoint SQLite backup and Production Health export have not been supplied. Installed version/schema, printer/scanner configuration, Windows servicing status, real project migration/Auth state and physical acceptance are unverified. Keep transactional Web disabled until authorized terminal/server commissioning passes. Do not reset the existing business or repeat Intake to bypass these gates.

Use `SHARED_V2_CUTOVER_RUNBOOK.md`, `EXISTING_TERMINAL_UPGRADE.md` and `RELEASE_0.2_ACCEPTANCE.md` for rehearsal and commissioning. The release manifest must record pending hosted and physical acceptance and actual signing status.
