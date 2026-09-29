# Gap analysis and roadmap

> The bar-only expansion restriction below is historical. The user accepted [desktop/Vercel expansion](EXPANSION_PLAN.md), documented before code. Existing acceptance gaps still apply; new modules do not become complete through planning.

## Current priority: prove the bar vertical slice

The codebase now contains the required bar-first source path. Development should avoid expanding hotel, HR, events or guest-ordering domains until the bar passes packaged-device acceptance.

### Release-critical gaps

1. Execute the native test suite after adapting it to the no-demo setup model.
2. Complete frontend install/build/Playwright on a networked development machine.
3. Run cloud protocol tests against the disposable PostgreSQL harness and then an isolated Supabase rehearsal project.
4. Perform the full fresh-install → close-day acceptance script offline/restart/reconnect.
5. Verify backup restore and terminal fencing before relying on recovery operationally.
6. Verify actual receipt printer/cash drawer adapters separately; the UI must never simulate hardware success.

## After bar deployment verification

Expand in dependency order:

**Restaurant service → Procurement/AP → Production/batches → Accounting hardening → CRM → Host/reservations → Events/nightlife → Hotel PMS → HR/payroll → Guest ordering.**

Each new domain must reuse the same native capabilities, command deduplication, audit/outbox, reversal discipline and documentation Definition of Done.
