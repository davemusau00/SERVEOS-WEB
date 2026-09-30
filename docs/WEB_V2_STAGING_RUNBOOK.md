# Web v2 staging and activation runbook

## Safety boundary

This runbook is for an **isolated non-production Supabase project** only. It does not authorize a production migration or cutover. The installed production terminal currently uses SQLite plus the legacy Supabase uploader; it does not yet have the v2 desktop adapter. Never operate legacy and v2 business writers concurrently for the same business.

Never point this rehearsal at the live business Supabase project or live terminal. Use synthetic records and dedicated test Auth users. Keep the production Vercel variables, Supabase project, local `.env.local`, and terminal database unchanged.

The staged SQL is not in the normal `supabase/migrations/` directory. The repository currently has no checked-in Supabase CLI config or hosted expansion migration runner. `npm run test:cloud -- --expansion` is a disposable Docker/PostgreSQL test, **not** a hosted migration command. Do not run `supabase db push` expecting it to apply `supabase/expansion/*.sql`.

## Activation gates

ServOS production browser access remains on the legacy Remote Manager unless two independent conditions are true:

1. the Vercel build has `VITE_ENABLE_WEB_V2=true`; and
2. the authenticated Supabase `servos_v2_session` response reports `enabled=true`.

The feature flag is a frontend release gate. The database control flag is the server authority gate. Neither one alone is sufficient to activate the transactional web workspace.

Production must keep `VITE_ENABLE_WEB_V2=false` until a separately approved, coordinated cutover is accepted. Staging may set it to `true` only after the staging database and Auth setup are complete. The server-side `servos_v2.control.enabled` value must also be enabled for the transactional workspace to open.

## 1. Local disposable SQL validation

From the repository root, with Docker Desktop running:

```powershell
npm ci
npm run test:cloud -- --expansion
```

The harness starts a uniquely named disposable PostgreSQL container, applies the legacy baseline migrations and expansion migrations in order, executes the SQL acceptance suites (including the booking concurrency test), and stops the container. It does not connect to Supabase. Review the output and require every migration and suite to pass before staging work.

## 2. Create isolated hosted staging

In Supabase, create a **new non-production project** dedicated to this rehearsal. Do not use the production project and do not clone/import live customer or payment data. Keep its project name, URL, database connection string, Auth users, and Vercel Preview environment distinct from production. Enable the Auth sign-in method needed by the test account and configure the exact staging HTTPS Site URL and redirect URLs.

Create one staging owner Auth user and record its Auth UUID. Apply only the SQL statements below to this newly created staging project. Never paste a production UUID or run these statements in the live project.

## 3. Apply SQL to the staging project in order

Use the Supabase SQL editor while positively verifying the staging project name/ref on every session. Run one file at a time, in filename order, and stop at the first error. Save a dated migration log with project ref, filename, start/result, and operator. Do not skip, reorder, combine with production scripts, or rerun an already successful file. The expansion files have explicit transaction blocks; the legacy prerequisites are not uniformly wrapped in transactions. If any legacy statement fails, stop and inspect the resulting staging schema before continuing. On a fresh disposable staging project, prefer recreating the project over attempting an unreviewed partial repair.

### 3a. Legacy prerequisites

Apply these files from `supabase/migrations/` in order:

```text
202609240001_terminal_replica.sql
202609240002_remote_requests.sql
202609240003_request_validation.sql
`supabase/migrations/202609270001_reconciliation_manifest.sql`
```

These provide the legacy tables/functions that staged migration `001_protocol.sql` wraps. This is staging-only. Then provision the test owner in `servos_private.managers` using the Auth UUID from the staging project. For example, replace the placeholder and run only in staging:

```sql
insert into servos_private.managers(user_id, role)
values ('<STAGING_AUTH_USER_UUID>'::uuid, 'owner');
```

Confirm exactly the intended staging owner row exists before continuing. Do not put the UUID or database credentials in frontend environment variables.

### 3b. Staged v2 expansion

Apply every file under `supabase/expansion/` in this exact order:

```text
001_protocol.sql
002_allocations.sql
003_domain_dispatch.sql
004_domain_helpers.sql
005_assets.sql
006_read_permissions.sql
007_rooms.sql
008_folios.sql
009_stays.sql
010_web_session.sql
011_inventory_catalog.sql
012_procurement.sql
013_pos.sql
014_pos_payments.sql
015_refunds_close_day.sql
016_staff_devices_approvals.sql
```

Migration `001_protocol.sql` copies legacy manager membership into v2 and replaces the staging project's `public.servos_upload` implementation with a v2-aware legacy-writer fence. This is a material protocol change even though the new v2 control starts disabled. It is acceptable only in this isolated staging project; do not use it to experiment on production. Keep `servos_v2.control.enabled=false` until all migrations are applied and the checks below pass.

Do not seed production business records into v2. The owner Auth user is initially a v2 member through the legacy manager backfill. Migration 016 adds staff/device administration but does not provide Auth invitation, password recovery, or a desktop terminal adapter.

## 4. Configure Vercel Preview only

Create/use a separate Vercel Preview project or Preview environment. Set its variables to the **staging** values:

```text
VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<staging-publishable-key>
VITE_ENABLE_DEMO=false
VITE_ENABLE_WEB_V2=true
VITE_ENABLE_WEB_OFFLINE=false
```

Only the URL and publishable key belong in Vite/Vercel frontend variables. Never use a service-role/secret key or database URL there. Production must remain:

```text
VITE_ENABLE_DEMO=false
VITE_ENABLE_WEB_V2=false
VITE_ENABLE_WEB_OFFLINE=false
```

Deploy a Preview build, verify the deployed build is labelled/configured for staging, and test sign-in with the staging owner. Do not promote it to production.

## 5. Staging checks and server enablement

Before setting the database gate, confirm:

- every legacy and expansion migration completed in order;
- the v2 control is still disabled, and no staging client is trading;
- the staging owner can authenticate and has the expected v2 membership/permissions;
- v2 functions are callable only through their intended authenticated grants; anonymous access is denied;
- disposable local SQL acceptance passed, including device registration, authorized snapshot, replay/conflict, revocation, domain, and change-feed checks;
- the Vercel Preview has only staging variables and no demo data mode;
- production variables, Supabase project, terminal data, and legacy sync remain unchanged.

Only after those pre-enable checks, enable `servos_v2.control.enabled` using an SQL-editor action in the **staging project only**. Record who enabled it, when, and why. Example, to be run only after verifying the Supabase dashboard project ref is the isolated staging project:

```sql
update servos_v2.control
set enabled = true
where singleton and enabled = false;

select enabled from servos_v2.control where singleton;
```

Confirm exactly one row changed and the verification query returns `true`. This gate is needed for the hosted session/snapshot APIs and transactional web acceptance. Then verify `servos_v2_session` returns `enabled=true` and run the hosted staging acceptance with synthetic records and two staging devices/users, including permissions, stable command replay, changed-payload rejection, conflicts, device revocation, POS/payment/refund, inventory/procurement, rooms/folios, staff/devices, and close-day. Do not use real trading data. If any hosted check fails, turn the staging gate back off, stop the Preview test, and preserve logs for diagnosis; do not attempt to repair by editing production or deleting records.

To disable the **staging** gate after testing, verify the project ref again and run:

```sql
update servos_v2.control
set enabled = false
where singleton and enabled = true;

select enabled from servos_v2.control where singleton;
```

Confirm the query returns `false`. This SQL is not a production rollback procedure.

The physical terminal cannot yet join this v2 rehearsal as a v2 writer: the native desktop adapter and signed offline grants/cutover tooling remain open work. Continue physical terminal testing on the existing production protocol or a separately cloned, fenced test installation; never connect a cloned production terminal identity to live sync.

## 6. Rollback and cleanup

For a staging-only problem, first disable the staging server control, then disable the Preview frontend flag or remove/disable the Preview deployment. Preserve SQL logs and test records for diagnosis. Do not drop schemas/tables or reverse migrations as an improvised cleanup; recreate the disposable staging project only if it contains no data that must be retained, after recording the test evidence.

Before any v2 command has synchronized, a future production rollback may be possible only under a rehearsed checkpoint procedure. After v2 writes exist, simply turning off the flag and resuming a legacy writer is unsafe; use coordinated recovery/forward repair with old devices fenced. Production cutover requires its own approved runbook, a native v2 adapter, backups, drained legacy outbox, import/reconciliation evidence, device grants, and physical acceptance.
