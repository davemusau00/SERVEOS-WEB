# Expansion acceptance matrix

Planned cases; executed evidence belongs in TEST_EVIDENCE. Static controls and source scans do not prove workflow acceptance.

| Family | Cases |
|---|---|
| AUTH | denied fields/commands, expired session/grant, device registration/revocation, last admin |
| MASTER/SETTINGS | CRUD/reactivate, referenced archive denial, duplicate/stale write, reload/second user, prospective rules |
| RECEIPT | snapshot/reprint/header mutation, partial/split/cash/tax, exact footer, 80mm clipping and actual cutter |
| POS/HOST | courses/fire/ownership, atomic seating, manual contact, discounts/void/refund and restart |
| STOCK/BATCH | allocation exhaustion, once-only depletion, yield/waste/cost, negative stock and rollback |
| AP | partial/rejected/over receipt approval, mismatch, return, duplicate invoice/payment, balanced journal |
| ROOM | nightly/day-use overlap/turnaround, extension/move/block, deposit, catch-up once, checkout/cleaning |
| ASSET | tag/custodian/room, ownership, parts, no double acquisition, disposal/history |
| CRM/EVENT | points reversal/credit budget, actual ticket/duplicate admission/capacity, commission evidence |
| HR/GL | attendance/leave/roster conflict, payroll version/period/payment, balanced entries and reversals |
| REPORT | real date/timezone-filtered data, restricted fields, actual CSV/formula escaping and print |
| SYNC | simultaneous commands, lost response, duplicate/changed replay, ordering, atomic cursor/tombstones |
| OFFLINE | two disconnected allocated devices; unallocated draft; expiry/quarantine; convergence |
| WEB | IndexedDB atomicity/failure, multitab queue, service-worker upgrade, reload and closed-browser limits |
| RECOVERY | backup/restore/fencing, counts/balances/outbox, browser eviction and lost grants |
| RELEASE | isolated Vercel preview/auth/deep links, old-client rejection, fresh install/upgrade/hardware |

Layers: unit/domain fixtures; real SQLite/PostgreSQL transaction tests; UI/adapters; real two-device outages; isolated cloud and packaged/physical acceptance. No multi-writer activation while legacy upload is enabled, constraints fail, cutover totals differ, secrets appear in assets or upgrade can lose queued data. Preserve current business data and uncommitted user work.
