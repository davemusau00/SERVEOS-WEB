# Controlled CSV Migration

Patch 04 turns the Patch 03 staging workspace into a reviewed migration pipeline:

**CSV → stage → validate → dry run → human review → apply through ServOS domain commands → audit/outbox evidence.**

It does not directly write business `records`, `commands`, `audit`, `outbox`, payments, receipts, journals or stock history.

Supported now: business identity, outlets, stock locations, suppliers, customers, products, stock-item masters, and pre-Go-Live opening inventory.

Employees remain blocked because PINs/passwords are not migration data. Room types, rooms and rate plans apply through the native Rooms engine. Hotel services apply through Folios with price/tax snapshots. Asset categories and assets apply through Patch 08 with permanent tags, location/custody rules and lifecycle invariants.

Dry-run decisions are `CREATE`, `UPDATE`, `NO_CHANGE`, `BLOCKED`, or `CONFLICT`. Expected record versions and stable command IDs are stored with the plan. Apply uses the existing versioned ServOS command boundary.

Opening inventory is never applied after Go Live. Existing LIVE weighted-average stock cost is not overwritten by CSV master updates. Operational receiving or a controlled stock count must be used instead.

Successful applications create durable external-ID mappings. Later files resolve dependencies through those mappings. Products can reference `stock_item_external_id`; LIVE outlets can reference `default_stock_location_external_id`.

When Intake is set to CSV, `business.csv` can prefill business identity before enrollment. Owner and administrator authorization remain interactive.
