# 18 — API Endpoint Catalog

This catalog records the API surface. The Auth routes below are present in source; forgotten-password/reset and administrative cross-staff session management remain future work.

## 1. Health

```text
GET /health/live
GET /health/ready
```

`live` proves the process responds.
`ready` proves required database/schema dependencies are usable.

## 2. Session/Auth

```text
POST /v1/auth/login
POST /v1/auth/logout
POST /v1/auth/password
GET  /v1/auth/session
GET  /v1/auth/sessions
POST /v1/auth/sessions/:id/revoke
POST /v1/auth/sessions/:id/refresh
```

Login returns a short-lived in-memory bearer and sets the refresh cookie. Refresh requires the configured PWA `Origin`; own-session listing and revocation are scoped to the authenticated staff identity. The active current session is ended through logout, not the other-session revoke route.

## 3. Device enrollment

```text
POST /v1/devices/enrollment-challenges
POST /v1/devices/enroll
GET  /v1/devices
PATCH /v1/devices/:id
POST /v1/devices/:id/revoke
POST /v1/devices/:id/bootstrap
```

## 4. Commands

```text
POST /v1/commands
GET  /v1/commands/:id
```

All transactional business mutations flow through this interface.

## 5. Sync

```text
GET /v1/sync/changes?after=<cursor>&limit=<n>
GET /v1/sync/stream
GET /v1/sync/status
```

Possible admin/device diagnostics:

```text
GET /v1/devices/:id/sync-status
```

## 6. Offline grants

```text
POST /v1/offline-grants/issue
POST /v1/offline-grants/renew
POST /v1/offline-grants/:id/revoke
GET  /v1/offline-grants/current
```

Issuance is restricted and policy-driven.

## 7. Bootstrap and recovery

```text
GET /v1/bootstrap/catalog
GET /v1/bootstrap/catalog/:snapshotId
GET /v1/bootstrap/catalog/:snapshotId/pages?after=:ordinal
```

The API creates a ten-minute, permission-filtered repeatable-read snapshot tied to the authenticated staff session, device and current permission set. The manifest carries protocol/schema versions, a high-water cursor, collection counts, fixed page boundaries, page hashes and a hash of the manifest. Snapshot lookup and page reads recheck the same identity and permission hash.

The API PWA resumes matching snapshots after reload, verifies each received and locally staged page, and activates the projection in one IndexedDB transaction only after all pages and counts match. Unresolved command IDs block activation. This is source implementation only: migration 062, API/PostgreSQL behavior, reload recovery, large snapshots and atomic activation have not been executed or verified.

## 8. Business/settings reads

```text
GET /v1/business
GET /v1/business/capabilities
GET /v1/settings
GET /v1/locations
GET /v1/service-areas
```

Mutations remain commands such as `business.updateIdentity`, `settings.updateReceipt`, etc.

## 9. Catalog queries

```text
GET /v1/catalog/items
GET /v1/catalog/items/:id
GET /v1/catalog/families
GET /v1/catalog/barcodes/:barcode
GET /v1/catalog/categories
```

Suggested filters:

- search;
- category;
- active;
- sellable;
- stocked;
- outlet/service area.

## 10. Inventory queries

```text
GET /v1/inventory/stock
GET /v1/inventory/stock/:stockItemId
GET /v1/inventory/locations/:locationId/stock
GET /v1/inventory/movements
GET /v1/inventory/count-sessions/:id
GET /v1/inventory/alerts
```

## 11. POS queries

```text
GET /v1/pos/menu
GET /v1/orders
GET /v1/orders/:id
GET /v1/tills
GET /v1/tills/current
GET /v1/receipts
GET /v1/receipts/:id
```

## 12. Payments/finance reads

```text
GET /v1/payments
GET /v1/mpesa/transactions
GET /v1/mpesa/reconciliation
GET /v1/credit/accounts
GET /v1/credit/accounts/:id/statement
```

## 13. Procurement

```text
GET /v1/suppliers
GET /v1/suppliers/:id
GET /v1/procurement/purchase-orders
GET /v1/procurement/purchase-orders/:id
GET /v1/procurement/goods-receipts
GET /v1/procurement/invoices
GET /v1/procurement/payables
```

## 13. Hospitality

```text
GET /v1/hospitality/front-desk
GET /v1/hospitality/rooms
GET /v1/hospitality/rooms/:id
GET /v1/hospitality/availability
GET /v1/hospitality/reservations
GET /v1/hospitality/stays
GET /v1/hospitality/stays/:id
GET /v1/hospitality/stays/:id/bill
GET /v1/hospitality/housekeeping
```

## 14. Staff/RBAC

```text
GET /v1/staff
GET /v1/staff/:id
GET /v1/roles
GET /v1/permissions
GET /v1/approvals
```

## 15. Reports

```text
GET /v1/reports/daily-sales
GET /v1/reports/till-close
GET /v1/reports/stock
GET /v1/reports/procurement
GET /v1/reports/occupancy
GET /v1/reports/credit
```

Long-running exports may return a job ID.

## 16. Activity/audit

```text
GET /v1/activity
GET /v1/audit
GET /v1/audit/:id
```

Ordinary roles receive a limited operational activity feed; audit detail requires permission.

## 17. Imports

```text
POST /v1/imports
GET  /v1/imports/:id
GET  /v1/imports/:id/errors
```

Mapping/dry-run/apply can be modeled with dedicated commands tied to import ID so mutation stays auditable.

## 18. Branding assets

```text
POST /v1/branding/logo
POST /v1/branding/payment-qr
GET  /v1/branding
GET  /v1/branding/assets/:id
```

Uploads validate bytes server-side. Payment QR accepts PNG according to product contract.

## 19. OpenAPI

Generate an OpenAPI document in CI.

Production API docs should either:

- require admin/developer authorization; or
- be disabled publicly while the JSON artifact remains downloadable from release artifacts.

## 20. Pagination

Cursor/keyset pagination preferred for large operational tables.

Avoid expensive `OFFSET` pagination for movement/audit histories at scale.

## 21. Filtering

Every filter is explicitly allow-listed and typed.

Do not expose generic arbitrary SQL-like filtering from the browser.

## 22. Request metadata

Clients send:

```text
X-ServOS-Client-Version
X-ServOS-Protocol-Version
X-ServOS-Device-ID where applicable
X-Request-ID optional
```

Server returns request ID for support correlation.
