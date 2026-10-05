# 00 — ServOS Executive Reset

## 1. Product decision

ServOS will be rebuilt as **one web-first hospitality/business operating system** delivered as an installable PWA from:

`https://serveos.davemusau.co.ke`

Its authoritative backend is:

`https://serveosapi.davemusau.co.ke`

Both are hosted on the same VPS behind Nginx. PostgreSQL is private to the API/worker network. The browser never talks directly to PostgreSQL or legacy Supabase RPCs.

The PWA is not merely an owner dashboard. It is the counter terminal, reception terminal, stock workstation, kitchen/bar screen, manager console and owner interface. It changes its shell according to device enrollment, role, business capabilities and screen size.

## 2. Why the reset exists

The merged codebase is broad and comparatively well tested, but previous development accumulated too many competing boundaries:

- Native and Web UI parity;
- SQLite and cloud authority modes;
- legacy upload and V2 command/cutover paths;
- direct database/RPC coupling;
- receipt-specific hardware assumptions;
- module-first operator journeys;
- complex setup paths for ordinary physical business tasks.

The reset does not discard domain knowledge. It reduces the number of architectural truths.

## 3. What the baseline proves

The merged reset branch builds and its captured baseline passes:

- 216 JavaScript/source tests;
- 106 native Rust/domain tests;
- production Vite build;
- command-parity generation;
- inventory, procurement, hospitality, receipts, audit, outbox and recovery tests.

This is valuable behavioral evidence. The refactor should port and preserve invariants rather than starting from a blank product.

## 4. Non-negotiable architecture decisions

### A. One product trunk

Canonical repository: `davemusau00/SERVEOS-WEB`.

Working reset branch: `reset/vps-platform`.

Historical repositories are references, not parallel products.

### B. One shared network authority

Only `serveosapi.davemusau.co.ke` can authoritatively commit shared business mutations.

No direct browser database writes.
No whole-state upload.
No dual-writer cutover mode in final production.

### C. One primary client

The PWA at `serveos.davemusau.co.ke` is the application.

Tauri becomes a migration/reference implementation and is retired after web-first acceptance.

### D. Offline is command authority, not database merging

The browser stores local projections and commands in IndexedDB. Offline-authorized actions are commands issued under bounded server grants. On reconnect, the same command IDs are confirmed or rejected by the API.

### E. Hardware is a capability, not the app architecture

Barcode scanners work as normal keyboard-wedge devices where possible.

Printing has three supported levels:

1. browser print;
2. controlled kiosk/default-printer deployment;
3. optional ServOS Print Bridge for guaranteed silent raw ESC/POS.

The Print Bridge contains no ServOS business database or sync engine.

### F. Same VPS, separate boundaries

The frontend is served as static PWA assets from Nginx. The API runs in Docker bound to loopback. PostgreSQL and worker stay on a private Docker network.

### G. Backups leave the VPS

The application, API and database may share one VPS initially. At least one encrypted backup copy must be off-VPS.

## 5. Product reset principles

### Operators see tasks

Not tables, modules or canonical units.

Primary vocabulary:

- Sell;
- Add Item;
- Order Stock;
- Receive Delivery;
- Count Stock;
- Transfer;
- Waste;
- Check In;
- Take Payment;
- Check Out;
- Close Till.

### ServOS stores technical truth behind physical language

A storekeeper enters crates/bottles/kilograms. A receptionist enters guest/stay facts. A cashier enters payment facts. ServOS derives canonical units, folio records, journals and audit evidence.

### Simple by default, advanced when needed

A hotel walk-in does not require a CRM account or deposit unless property policy requires one. A menu item does not require a recipe unless ingredient tracking is enabled. A purchase order does not require accounting classification unless the user chooses an advanced line type.

## 6. Target navigation

```text
TODAY

SELL
  POS
  Tabs / Tables
  Kitchen

STOCK
  Receive
  Count
  Transfer
  Waste
  Items
  Purchase Orders

HOTEL
  Front Desk
  Rooms
  Housekeeping

MONEY
  Tills
  M-Pesa
  Credit
  Suppliers

MANAGE
  Reports
  Staff
  Assets
  Settings

HELP
```

Everything is role/capability filtered.

## 7. Critical workflows for ServOS 1.0

- open/close till;
- POS cash/M-Pesa/card/split payment;
- tabs/tables;
- menu/item creation;
- physical inventory receiving/counting/transfers/waste;
- purchase orders and GRNs;
- supplier invoices/payments;
- simple walk-in room check-in/pay/checkout;
- advanced reservation/deposit/folio when enabled;
- housekeeping and room readiness;
- customer credit;
- receipt/PO/GRN/count/cash-up printing;
- offline survival and reconnect;
- backup/restore;
- audited corrections.

## 8. Receipt/QR rule

Business logo prints at the top.

Payment QR is always an uploaded PNG and is processed using the same generic image/raster implementation as the business logo.

Exact caption:

**Scan to Pay via One app**

No QR module detection/reconstruction exists in the new implementation.

## 9. Release definition

ServOS 1.0 is ready when ordinary employees can complete a full operating day without developer intervention and the system survives:

- internet failure;
- browser restart;
- machine restart;
- lost API response;
- printer failure;
- stale-version conflict;
- backup/restore;
- device replacement.

The final product rule remains:

> **The operator sees the business. ServOS sees the machinery.**
