# Expansion implementation handoff — 2026-09-26

## Implemented and checked

Documentation was written first. Native sale payments now capture immutable receipt documents atomically; cash/change/header/items are retained. POS offers receipt history/reprint, full 80mm copies, print portal and hard-coded attribution without fiscal disclaimer text. Identity updates are atomic/versioned; live Admin settings edit tax/message/payment/printer/till policy. Printer validation runs in the native backend. Successful command commit is no longer reported as failure merely because reload failed.

Vercel config and authenticated production entry are prepared. Sample UI requires explicit demo config. The optional service worker caches build assets only. Staged v2 master command protocol, change feed, replay/conflict/audit/fencing and private allocation primitives passed disposable PostgreSQL tests. IndexedDB queue/sync passed browser restart, response-loss, cursor rollback and tombstone tests.

## Exact next implementation boundaries

Latest verified continuation: migrations 008-009 and `tests/supabase/folios.sql` passed the disposable expansion suite, including exact ledger conservation and rollback of a paid extension on duplicate payment reference. TypeScript/docs checks passed. The real two-connection booking race still passed. Prior native/browser/build results remain earlier evidence; they were not rerun for this SQL-only continuation.

1. Continue cloud domain validation and cutover tooling. Staged migrations 003-009 add dedicated dispatch, immutable business ledgers, Assets/maintenance, permission-filtered change feed, room/rate/reservations and stay/folio transactions. Keep enabled=false and legacy production behavior until migration acceptance. Sales, credit transfers, POS-to-folio transfers and refund/payout operations still reject as unsupported.
2. Implement signed device/operator grants, issuance, handover/recovery and resource proofs. Current allocation helpers are private database primitives; they must run inside real domain transactions. Do not expose direct resource consumption to browsers. Device registration currently binds one auth owner, not shared multi-operator terminals.
3. Connect web/desktop v2 adapters and read projections to authenticated views. BusinessStore is a staged durable master-edit queue; it does not apply offline business effects, issue grants, or unlock offline users. Account/device recovery and sensitive local storage protection remain pending.
4. Complete folio refund/credit/POS transfers and cloud receipt snapshots, Assets acquisition linkage, and authenticated UI/adapters for both workspaces. Staged stays now include check-in/out, moves and paid extensions. Folios include idempotent accommodation periods, service charges, deposit liabilities/application, manual external or cash payment, and linked unpaid charge reversal. Checkout checks complete accommodation posting and zero balance/deposit. Current source and SQL tests are not complete operational modules. Tests live in tests/supabase/rooms.sql, assets.sql and folios.sql. Hotel service/payment-account CRUD and configured accounting mappings remain integration dependencies; test fixtures do not constitute those features.
5. Add full settings/capability policy profiles, exports, actual two-device failure testing and Vercel/Supabase isolated staging. No production deployment has occurred.

## Known receipt follow-ups

Physical packaged XP-80T paper/cut/retry acceptance remains. Historical payments without receipt documents stay unavailable for snapshot reprint rather than using current identity. Refund/folio receipt document types and cloud receipt generation belong to their domain integration. ESC/POS ASCII substitution remains deterministic; non-ASCII printer glyph support is not added.

## Verification commands

`npm run lint`, `npm test` (19), native and desktop tests (31 each, overlapping source), browser tests (12), docs checks (33 guides), build, UI inventory (1,901), and `node scripts/test-supabase.mjs --expansion`.

Tests do not establish live sync or physical printing. The explicit demo bundle retains a size warning; the final production bundle was below the warning threshold and its authenticated entry was smoke-tested. Preserve existing barcode/CSV functionality and backup artifacts. External commits appeared during the session; no reset/revert or branch rewrite was performed.

## 2026-09-27 staged POS settlement, refund and close-day continuation

Migrations 014–015 implement online POS payment, split tender, manual external payment evidence, till open/cash movement/close, partial refunds, full reversals, immutable receipts, balanced journals and an immutable close-day snapshot. Web POS now has payment/refund views, and Finance exposes cash movement, till close and report generation. Migration 015 records `NO_AUTOMATIC_RESTOCK`; settlement and refunds never repeat stock depletion.

Evidence from the current source: `npm run verify` passed (70 Node tests, 16 desktop/mobile browser cases, 55 Rust domain tests, UI inventory and docs checks). The PostgreSQL harness passed migrations 001–015, all staged SQL acceptance suites and the independent two-connection room booking race. Browser-backed PostgreSQL cases cover two-operator visibility/replay, cash settlement, receipt history, partial refund and close-day UI. `VITE_ENABLE_WEB_V2` remains false by default, and no live project or terminal was changed.

Remaining 11E work includes ROOM_CHARGE, hosted M-Pesa reconciliation/discrepancy workflows, and a complete close-day report for voids, inventory exceptions, reconciliation and verified sync health. The staged close report marks provider reconciliation `NOT_CONFIGURED` and sync health `NOT_VERIFIED_BY_CLOSE_DAY`; those fields are explicit limits, not success claims. The web implementation does not establish production multi-device authority.

Next: finish staff/canonical permission profiles and device administration (10B/11F), then the desktop v2 adapter and deterministic migration/rollback rehearsal (12A). Keep signed offline grants, production cutover and physical terminal acceptance gated on their own evidence. Preserve one authoritative writer at a time.

## 2026-09-27 staff and device administration continuation

Migration 016 now adds Auth-bound staff profiles, native-name canonical permission profiles, role ceilings, outlet/service-area assignments, optimistic profile updates, Admin-preservation checks, device inventory/revocation, and scoped five-minute single-use approvals. Over-receipt receiving consumes its approval in the same transaction and records the approver ID on the GRN. Web adds Staff/Devices screens through the existing authenticated snapshot and command queue. Staff IDs bind to existing Auth users; invitation, credential creation/reset and recovery still require Supabase Auth flows. Approval tokens are command payloads until accepted, so sensitive local storage protection remains open. The feature is staged/default-off.

Disposable SQL acceptance now covers staff role provisioning, unauthorized role escalation, canonical permissions, approval action/target/initiator/expiry/replay checks, device listing/revocation and rejection of a revoked device command. Current-tree lint, Node and SQL tests passed for this slice; run the full `npm run verify` before using broader suite evidence. No hosted migration, Auth invitation flow or production enablement occurred.

Remaining 10B/11F work includes Supabase Auth invitation/password-reset/session/re-auth UX, richer custom permission editing and reports/audit UI. Continue with the 12A desktop v2 adapter and deterministic migration/rollback rehearsal while completing remaining 11E report/reconciliation gaps; signed offline grants, cutover and physical terminal acceptance remain separate gates.
