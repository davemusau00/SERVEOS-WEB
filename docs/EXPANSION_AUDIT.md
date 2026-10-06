# Source audit — expansion baseline

Observed 2026-09-26. App selects NativeRoot for Tauri; BrowserRoot offers sample UI and RemoteManagerApp. Native shell covers bar POS, KDS, stock, procurement, catalog, masters, reconciliation/refunds, floorplan, close-day, reports/admin/help. Broader preview is not installed integration.

| Actions | Current path | Gap / acceptance family |
|---|---|---|
| Intake/enrollment/setup/unlock/staff | Rust/SQLite | multi-device membership and data filtering; AUTH |
| POS/fire/transfer/merge/discount/void | native commands | cloud adapter, ownership, full coursing; POS |
| Payments/split/refund/reconcile | native journals/audit/outbox | persist cash/change, global references across devices; MONEY |
| Receipt/print/retry | UI-generated lines; durable raw jobs | authoritative snapshot, clipping, full layout; RECEIPT |
| Catalog/stock/floorplan/masters | versioned native commands | complete archive/reactivate and allocations; MASTER/STOCK |
| PO/GRN/invoice/payment | native transactional source | draft cancellation/returns and deeper acceptance; AP |
| Settings | setup native; live admin narrow; preview save toast only | reusable persisted editors and permissions; SETTINGS |
| Host/waitlist/contact/seating | React component state; simulated SMS | durable lifecycle and real seating; HOST |
| Rooms/folios/cleaning/maintenance | preview context/sample state | complete operational rules and intervals; ROOM |
| Assets | no module; maintenance assetName string | identities/custody/acquisition/repairs; ASSET |
| Batch execute | success toast only | actual consume/yield/cost transaction; BATCH |
| CRM/loyalty/credit | component sample state | append-only movement ledgers; CRM |
| Event scan | accepts input unless containing INVALID | actual ticket identity and one-time admission; EVENT |
| Staff/leave/roster/payroll/advance | preview state; payout explicitly pending | native/cloud lifecycles and configured rules; HR |
| Accounting/fiscal | sample balances and certification branding | posted-ledger statements, truthful manual evidence; GL |
| Reports/analytics/export | sample figures and toast | query-backed reports and real files; REPORT |
| Remote edits | replica reads, limited requests | replace protocol before web transactions; SYNC |
| Backup | consistent local SQLite copy | coordinated restore/fencing; RECOVERY |
| Guest QR | preview | explicitly remains excluded |

Cross-cutting: RuntimeProvider creates fresh IDs on invocation and treats refresh failure like command failure; retries need persistent identity and committed-but-refresh-failed state. Fixed roles need domain capabilities and field-filtered reads. Generic room/event/maintenance records lack domain lifecycle guards. Legacy higher-version snapshot upserts cannot accept independent writers. Keep immutable ledger/audit, deduplication and atomic outbox foundations.

`generated/UI_INTERACTION_INVENTORY.json` locates each control/handler/route and deliberately marks it unverified. This audit maps actions to workflow families, not a claim every modal was exercised. Baseline planning checks: TypeScript and 19 Node tests passed. No new native, live cloud or physical printing evidence. Preserve user barcode/CSV changes and backup files.
