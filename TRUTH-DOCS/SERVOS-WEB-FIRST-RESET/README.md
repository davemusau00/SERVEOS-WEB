# ServOS Web-First VPS Reset Documentation Pack

**Revision:** 2026-10-06 Web-First Architecture  
**Production PWA:** `https://serveos.davemusau.co.ke`  
**Production API:** `https://serveosapi.davemusau.co.ke`  
**Canonical repository:** `davemusau00/SERVEOS-WEB`  
**Reset branch:** `reset/vps-platform`  
**Preserved baseline tag:** `pre-vps-reset-2026-10-06`

## Final direction

ServOS is now planned as **one installable web/PWA product** hosted entirely on the same VPS as its API.

```text
serveos.davemusau.co.ke
        │
   ServOS PWA
        │
 Service Worker
 IndexedDB
 Offline Outbox
 Local Projection
        │
        │ HTTPS
        ▼
serveosapi.davemusau.co.ke
        │
    ServOS API
        │
    PostgreSQL
```

The VPS API is the only shared network authority. The browser can operate offline only through durable commands and bounded offline grants. There is no whole-database synchronization and no "latest timestamp wins" reconciliation.

The previous two-client target, Native Terminal + Web, is superseded. Existing Tauri/Rust code is retained during migration as behavior/test evidence and as the source for the optional printer hardware bridge.

## Printing decision

A pure browser cannot universally guarantee silent raw ESC/POS access. ServOS therefore supports:

1. **Browser print** for universal fallback.
2. **Dedicated kiosk/default-printer mode** after hardware acceptance.
3. **Optional ServOS Print Bridge** for guaranteed silent Windows RAW/LAN ESC/POS.

The Print Bridge is not a second ServOS app. It contains no catalog, stock, room, payment or sync authority. It only validates and transports signed print jobs to local printers.

Business logo and payment QR now use the same image pipeline. QR is an uploaded PNG and the receipt caption is exactly:

**Scan to Pay via One app**

## Same-VPS deployment

The audited server already runs host Nginx and Docker. The preferred deployment is:

```text
host Nginx
  ├── serveos.davemusau.co.ke
  │     /var/www/serveos/current
  │     static PWA
  │
  └── serveosapi.davemusau.co.ke
        proxy → 127.0.0.1:3101

Docker
  ├── serveos-api
  ├── serveos-worker
  ├── serveos-postgres
  └── serveos-backup
```

The frontend does not need a Node runtime process in production. Nginx serves the built static PWA directly.

## Baseline evidence

Captured reset baseline:

- `npm ci` successful with 0 reported vulnerabilities;
- production build successful;
- 216 JS/source tests passing;
- 106 native Rust/domain tests passing;
- current PWA/service-worker infrastructure exists;
- existing Web offline behavior currently fails closed and must be replaced with the new IndexedDB/outbox design;
- current main JS startup chunk is large and is a performance cleanup target.

## Read first

1. `docs/00-EXECUTIVE-RESET.md`
2. `docs/01-TARGET-ARCHITECTURE.md`
3. `docs/26-WEB-FIRST-PWA-TERMINAL.md`
4. `docs/27-BROWSER-OFFLINE-SYNC-BACKUP.md`
5. `docs/28-SILENT-PRINTING-PRINT-BRIDGE.md`
6. `docs/29-SAME-VPS-PRODUCTION-TOPOLOGY.md`
7. `docs/30-WEB-FIRST-REFACTOR-IMPLEMENTATION-PLAN.md`
8. `docs/31-BASELINE-EVIDENCE-2026-10-06.md`
9. `docs/22-OPERATOR-WORKFLOW-REFINEMENT.md`
10. `docs/23-BUSINESS-DOCUMENT-PRINTING.md`
11. `docs/24-V2-BRANCH-RECONCILIATION.md`
12. `docs/25-REPOSITORY-GAP-REGISTER.md`

## Complete documentation index

| File | Purpose |
|---|---|
| `00-EXECUTIVE-RESET.md` | Final product/engineering decisions |
| `01-TARGET-ARCHITECTURE.md` | Web-first topology and authority boundaries |
| `02-REPOSITORY-REFACTOR.md` | Repository/package consolidation |
| `03-VPS-BACKEND.md` | New API/backend specification |
| `04-DATABASE-DOMAIN-MODEL.md` | Relational domain model |
| `05-API-COMMAND-SYNC.md` | Command/idempotency/change-feed protocol |
| `06-TERMINAL-OFFLINE.md` | Compatibility filename containing new PWA offline model |
| `07-WEB-UX-RESPONSIVE.md` | Task-first responsive operator UX |
| `08-HOSPITALITY-ROOMS.md` | Simple and advanced hospitality flows |
| `09-CATALOG-INVENTORY-PROCUREMENT.md` | Item/inventory/purchasing design |
| `10-RECEIPTS-PRINTING-QR.md` | Web-first receipts/logo/QR printing |
| `11-AUTH-SECURITY-RBAC.md` | Identity/RBAC/device security |
| `12-VPS-DEPLOYMENT-RUNBOOK.md` | Same-VPS deployment runbook |
| `13-CI-CD-OBSERVABILITY-BACKUP.md` | Release evidence, monitoring, backup |
| `14-MIGRATION-CUTOVER.md` | One-time migration/cutover without dual writers |
| `15-TEST-ACCEPTANCE.md` | PWA/API/offline/hardware acceptance matrix |
| `16-PHASED-ROADMAP.md` | Updated web-first implementation order |
| `17-CODE-QUALITY-CLEANUP.md` | Refactor/quality boundaries |
| `18-API-ENDPOINT-CATALOG.md` | API endpoint families |
| `19-OPERATIONS-INCIDENT-RUNBOOK.md` | Incident/recovery procedures |
| `20-CONFIGURATION-ENVIRONMENTS.md` | Environment/origin configuration |
| `21-CURRENT-REPO-FINDINGS.md` | Current codebase findings and updated baseline |
| `22-OPERATOR-WORKFLOW-REFINEMENT.md` | Day-to-day operator workflow redesign |
| `23-BUSINESS-DOCUMENT-PRINTING.md` | PO/GRN/KOT/count/statement document architecture |
| `24-V2-BRANCH-RECONCILIATION.md` | V2 salvage/discard plan |
| `25-REPOSITORY-GAP-REGISTER.md` | Prioritized gap register |
| `26-WEB-FIRST-PWA-TERMINAL.md` | Primary web-terminal runtime design |
| `27-BROWSER-OFFLINE-SYNC-BACKUP.md` | IndexedDB sync/recovery/backup design |
| `28-SILENT-PRINTING-PRINT-BRIDGE.md` | Concrete silent ESC/POS solution |
| `29-SAME-VPS-PRODUCTION-TOPOLOGY.md` | Frontend + API + DB on current VPS |
| `30-WEB-FIRST-REFACTOR-IMPLEMENTATION-PLAN.md` | Detailed refactor execution plan |
| `31-BASELINE-EVIDENCE-2026-10-06.md` | Preserved build/test/VPS evidence |
| `adr/` | Locked architecture decisions |
| `../infra/` | Safe deployment examples |

## Core rules

- One PWA, one API, one shared business truth.
- `serveosapi.davemusau.co.ke` is the only shared mutation authority.
- `serveos.davemusau.co.ke` never talks directly to PostgreSQL.
- IndexedDB stores projections and commands, not a competing cloud truth.
- Every mutation has a stable command ID and is idempotent.
- Lost responses resolve using the original command ID.
- Offline finalization requires explicit bounded authority.
- Service Worker updates occur only at safe application boundaries.
- No durable business workflow relies on `localStorage`.
- PWA device identity uses secure browser primitives where supported.
- Printing is a BusinessDocument capability, not a receipt-only subsystem.
- Print Bridge is optional hardware transport, never business authority.
- Backups include an off-VPS copy.
- Simple workflows remain the default; advanced hospitality/accounting remains available.
- 1024×600 is a first-class acceptance viewport.

## Patch usage

This pack is designed to live under:

`TRUTH-DOCS/SERVOS-WEB-FIRST-RESET/`

inside the local repository during the refactor. The supplied patch ZIP includes a PowerShell apply script that backs up any existing copy before installing this revision.
