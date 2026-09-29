# Accepted desktop and Vercel expansion — 2026-09-26

Status: documented target; source and acceptance tracked separately. Supersedes the bar-only/single-writer target, not a claim that existing installations have migrated.

## Scope

One business/property, multiple registered desktop/browser devices. Supabase/PostgreSQL shared transaction authority. Tauri/SQLite and Vercel/IndexedDB offline finalization only against device-reserved resources. Guest QR remains preview. External payments, payroll, notifications and payouts remain manually evidenced. Assets exclude depreciation. Preserve existing barcode/CSV work.

Receipts: 80mm, customer/business copies, standard aligned format, no ETR/eTIMS wording, immutable footer: Built By Davemusau.co.ke / info@davemusau.co.ke / 0746157440. Rooms: full nightly/day-use stays and folios. Assets: register, custody, maintenance and acquisition. Complete all existing staff-facing modules and settings, no additional modules.

## Documentation gate before code

Read together: [audit](EXPANSION_AUDIT.md), [contracts](EXPANSION_CONTRACTS.md), [workflows](EXPANSION_WORKFLOWS.md), [receipts](RECEIPT_SPEC.md), [acceptance](EXPANSION_ACCEPTANCE.md), [architecture](SYSTEM_ARCHITECTURE.md), [deployment](DEPLOYMENT_RUNBOOK.md).

Every mutation family identifies permission, state transition, effects and offline restrictions. Every shared resource identifies concurrency/allocation. Static UI inventory locates individual controls but is not proof they work. Untested actions remain explicit acceptance gaps. Current implementation and planned behavior must be distinguished.

## Sequence and evidence

| Phase | Deliverable | Dependency | Completion evidence |
|---|---|---|---|
| 0 | Documentation, source audit and baseline | none | links/checks, action inventory and evidence limits |
| 1 | Persisted receipts and rendering | 0 | native snapshot/reprint, browser layout; physical output separately |
| 2 | Cloud command protocol, identity and migrations | 0 | PostgreSQL auth/atomicity/replay and legacy cutover rehearsal |
| 3 | Desktop/web adapters, storage, grants and sync | 2 | two-device disconnect/restart/reconnect |
| 4 | Settings, permissions and master CRUD | 2-3 | denied/stale writes, reload, second user |
| 5 | Rooms and folios | 4 | overlap, deposit, move, charge and checkout tests |
| 6 | Assets and maintenance | 4-5 | custody, parts, acquisition and history |
| 7 | Existing modules | 4 | restaurant/host, production/procurement, CRM/events, HR/payroll, GL/reports in order |
| 8 | Vercel staging, migration, recovery, device acceptance | 1-7 | isolated cloud and packaged-device rehearsal |

Receipts can ship on the legacy runtime. Never enable browser writes against the snapshot uploader. Actual production publication is a separate release step; source preparation does not imply deployment.

## Completion definition

Persistence, backend authorization, validation, conflicts, atomic effects, replay, failure feedback, offline eligibility, restart, second-user visibility, report parity and audit linkage. Update release state, coverage, RBAC, dictionary, guides and evidence per slice. Distinguish implemented, locally verified, cloud verified and physical-device verified. A successful slice does not complete the expansion.

Historical context: [Legacy bar plan](LEGACY_BAR_PLAN.md). Its single-writer target is superseded; current runtime remains legacy until cutover.
