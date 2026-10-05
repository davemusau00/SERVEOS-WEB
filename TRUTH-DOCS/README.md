# ServOS VPS Reset Documentation Pack

**Target production web:** `https://serveos.davemusau.co.ke`  
**Target production API:** `https://serveosapi.davemusau.co.ke`  
**Canonical repository:** `davemusau00/SERVEOS-WEB`  
**Repository baseline reviewed:** `main` at `dc1af9248d161ca6a874d6f32b8119cd1b7fece0`; active `V2` branch separately reviewed at `48d37769f1d049aa1c776fe8030fc9df8fa836d0` (V2 is 7 commits ahead and 2 behind main)  
**Target:** ServOS 1.0 reset and VPS re-platform

This pack turns the current ServOS codebase into one coherent product and replaces the current distributed database/RPC/snapshot-sync complexity with a simpler rule:

> **The VPS API is the only network authority. The Web app and Terminal are clients of the same API. SQLite is a local Terminal projection and offline survival store, not a second cloud truth.**

The design deliberately keeps the strengths already developed in ServOS: Tauri hardware integration, SQLite durability, Web/PWA reach, rich POS/inventory/hospitality capabilities, auditability, command idempotency, immutable receipts and offline aspirations. It removes the parts that have repeatedly generated complexity: direct client-to-database RPC coupling, competing legacy and V2 authorities, snapshot synchronization, SQL dispatcher chains, duplicated command names, generic-record replacement hazards, UI/backend parity drift and ambiguous offline promises.

## Read these first

1. `docs/00-EXECUTIVE-RESET.md` — product and engineering reset in one document.
2. `docs/01-TARGET-ARCHITECTURE.md` — final runtime topology and authority model.
3. `docs/02-REPOSITORY-REFACTOR.md` — monorepo layout and what is retained/removed.
4. `docs/03-VPS-BACKEND.md` — new backend specification.
5. `docs/05-API-COMMAND-SYNC.md` — command, idempotency and synchronization protocol.
6. `docs/06-TERMINAL-OFFLINE.md` — how Terminal remains resilient without becoming a second truth.
7. `docs/16-PHASED-ROADMAP.md` — build order and exit gates.
8. `docs/22-OPERATOR-WORKFLOW-REFINEMENT.md` — day-to-day operator workflows that must become simpler.
9. `docs/23-BUSINESS-DOCUMENT-PRINTING.md` — PO/GRN/KOT/count/statement thermal printing architecture.
10. `docs/24-V2-BRANCH-RECONCILIATION.md` — exact V2 salvage/discard plan.
11. `docs/25-REPOSITORY-GAP-REGISTER.md` — prioritized cross-repo gap register.

## Documentation index

| File | Purpose |
|---|---|
| `00-EXECUTIVE-RESET.md` | Why the reset exists, non-negotiable decisions and success criteria |
| `01-TARGET-ARCHITECTURE.md` | Web/API/Terminal/PostgreSQL topology and ownership boundaries |
| `02-REPOSITORY-REFACTOR.md` | Codebase consolidation, package boundaries and deletion/archive plan |
| `03-VPS-BACKEND.md` | API technology, modules, workers, deployment and runtime behavior |
| `04-DATABASE-DOMAIN-MODEL.md` | Relational model and domain boundaries |
| `05-API-COMMAND-SYNC.md` | HTTP contract, command envelope, change feed, idempotency, conflicts |
| `06-TERMINAL-OFFLINE.md` | SQLite projection, outbox, bootstrap, offline grants and recovery |
| `07-WEB-UX-RESPONSIVE.md` | Task-first shell, responsive rules, roles and interaction standards |
| `08-HOSPITALITY-ROOMS.md` | Simple walk-in stay plus advanced reservation/folio workflows |
| `09-CATALOG-INVENTORY-PROCUREMENT.md` | Menu/item creation, packaging, POs, receiving and stock UX |
| `10-RECEIPTS-PRINTING-QR.md` | Logo/QR image pipeline and immutable 80mm receipt architecture |
| `11-AUTH-SECURITY-RBAC.md` | Staff identity, sessions, roles, device enrollment and security controls |
| `12-VPS-DEPLOYMENT-RUNBOOK.md` | VPS build, DNS, TLS, Docker, firewall, deployment and rollback |
| `13-CI-CD-OBSERVABILITY-BACKUP.md` | CI gates, logs, metrics, alerting, backup and disaster recovery |
| `14-MIGRATION-CUTOVER.md` | Existing SQLite/Supabase/V2 to the new backend without dual writers |
| `15-TEST-ACCEPTANCE.md` | Functional, cross-runtime, hardware, failure and business acceptance |
| `16-PHASED-ROADMAP.md` | Ordered implementation program with exit conditions |
| `17-CODE-QUALITY-CLEANUP.md` | Cleanup standards, technical debt rules and coding boundaries |
| `18-API-ENDPOINT-CATALOG.md` | Endpoint families and command/query boundaries |
| `19-OPERATIONS-INCIDENT-RUNBOOK.md` | Production incident and recovery procedures |
| `20-CONFIGURATION-ENVIRONMENTS.md` | Production/staging configuration and environment rules |
| `21-CURRENT-REPO-FINDINGS.md` | Current repo/V2 findings and salvage guidance |
| `22-OPERATOR-WORKFLOW-REFINEMENT.md` | PO lifecycle, stock requisitions, handover, hospitality and other workflow refinements |
| `23-BUSINESS-DOCUMENT-PRINTING.md` | Generic 80mm business-document printing including PO/GRN/KOT/count/till/folio |
| `24-V2-BRANCH-RECONCILIATION.md` | Reconcile V2-only inventory/correction/design work before branch retirement |
| `25-REPOSITORY-GAP-REGISTER.md` | P0/P1 product, workflow, printing and repo gaps |
| `adr/` | Architecture decision records locking the reset decisions |
| `../infra/` | Safe example deployment configuration with placeholders only |

## Core rules

- `serveosapi.davemusau.co.ke` is the only production mutation authority.
- `serveos.davemusau.co.ke` never talks directly to PostgreSQL.
- Terminal never uploads arbitrary snapshots.
- Every mutation has a stable command ID and is idempotent.
- Every changed business entity has a monotonic version.
- Every committed command creates audit evidence and a change-feed cursor.
- Response loss is resolved by checking the original command ID, never by creating a second command.
- Web is online-authoritative. Offline Web work is explicitly a draft until submitted.
- Terminal may finalize offline only inside a signed, bounded offline grant.
- Business logic belongs in the backend/domain layer. PostgreSQL enforces constraints and transactions; it does not become a 40-migration command dispatcher.
- Ordinary operators see business language, not canonical units, command IDs or database vocabulary.
- A feature is not complete until Web, Terminal, API contract, permissions, audit and acceptance tests agree on what it means.
- Operational documents use one typed Business Document model and one generic Terminal print spooler; procurement modules never emit ESC/POS directly.
- PO/GRN/count/cash-up/statement printing is part of operational completeness, not cosmetic export polish.

## Proposed production services

```text
Internet
   │
   ├── https://serveos.davemusau.co.ke
   │        └── ServOS Web / PWA
   │
   └── https://serveosapi.davemusau.co.ke
            └── Reverse proxy
                 └── ServOS API
                      ├── PostgreSQL
                      ├── background worker
                      ├── command processor
                      ├── change feed / SSE
                      └── audit / jobs

Physical business terminal
   ├── Tauri/React
   ├── SQLite local projection
   ├── printer/scanner
   └── HTTPS → serveosapi.davemusau.co.ke
```

## Recommended backend shape

A **modular monolith**, not microservices:

- TypeScript API service using Fastify or an equivalent small, high-performance HTTP framework.
- PostgreSQL as durable central authority.
- A typed SQL layer such as Kysely/Drizzle, chosen once and pinned.
- Shared Zod/JSON-schema contracts exported to Web and Terminal UI code.
- PostgreSQL-backed worker queue initially, avoiding Redis unless a measured need appears.
- Server-Sent Events for live invalidation/change notifications; cursor polling remains the recovery path.
- Docker Compose on the VPS.
- Caddy or Nginx as reverse proxy and TLS terminator.

Exact library versions should be pinned only after the implementation branch is created and CI verifies them. The architecture does not depend on a particular minor release.

## Migration principle

The old system is not synchronized into the new system continuously.

Instead:

```text
Existing authority
   ↓
freeze / checkpoint
   ↓
export canonical migration manifest
   ↓
validate + dry run
   ↓
import into new PostgreSQL schema
   ↓
reconcile control totals
   ↓
bootstrap each Terminal from the new API
   ↓
fence old cloud writers
   ↓
activate new API
```

The old Supabase/V2 database remains read-only evidence until rollback expiry, then it can be archived.

## Definition of success

ServOS 1.0 is successful when a new hospitality business can be configured quickly, staff can use their own role without seeing irrelevant ERP machinery, a full shift can survive network/printer/browser failures, Terminal and Web converge on the same business truth, and a developer is not needed to explain ordinary workflows.
