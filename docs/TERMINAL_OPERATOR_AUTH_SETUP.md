# Terminal operator identity and setup

This guide configures individual business accounts on an installed ServOS terminal. The local SQLite terminal remains the operational writer. This setup does not enable Web v2 business writes, offline v2 authority, or production cutover.

## Before you begin

- Use a staging Supabase project for the first setup and testing.
- Keep the project URL and publishable key in the terminal build configuration as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never use a service-role key in the app or terminal.
- Apply the approved expansion migrations through `034_sealed_location_counts.sql` to the target staging project when preparing the current v2 source slice. These migrations are source only until your normal reviewed migration process applies them.
- Confirm each operator already has a local ServOS staff record with a stable, unique Staff ID. The v2 `staff_profiles.staff_id` must match that ID exactly.
- During first enrollment, the initial local Administrator's stable ID is `auth:<Auth UUID>`, matching the staged owner-profile backfill. For every other operator, bind the Auth user to the exact stable Staff ID from the terminal's staff record; do not guess or use an email/name as the ID.
- Confirm the business membership and operator permissions are active. Permissions are resolved from the authenticated server session and role profile, not from a terminal role selector.
- The native source now contains SQLite schema 14 for separate v2 device sequence/feed state, an empty command outbox, and an isolated shadow-record replica. The feed-page applier does not update legacy operational records. This is dormant protocol storage, not a v2 writer; the migration has not been applied to a packaged terminal by this guide.
- After staging has applied migration 029, an authorized operator can install or refresh the v2 shadow baseline and pull its change feed from the terminal's reconciliation panel. Snapshot and feed RPCs are read-only; snapshot replacement refuses to run while any v2 command awaits acknowledgement. Confirm the reported record count/cursor and separately reconcile the migration; do not enable v2 from this step.
- If the server's staged v2 control is enabled after all required gates, the terminal routes authenticated online commands to `servos_v2_execute` and reads from the isolated v2 replica. A pending legacy outbox blocks this route; an uncertain v2 response remains queued for idempotent replay. Operators using local-PIN-only offline mode remain on the legacy path only while v2 is disabled. Do not enable shared v2 authority until the full operation parity and cutover checklist passes.

## Invite and bind operators

1. In Supabase Auth (or the organization's approved invitation console), invite every operator using an individual work email. The existing ServOS Staff workspace binds Auth users; it does not create Auth accounts or send invitations.
2. Have the operator accept the invitation and set their password. Supabase Auth owns password recovery; ServOS never asks an Admin to collect an operator password.
3. In ServOS Staff, choose “Bind invited Auth user” and enter the invited user's Auth UUID, the existing terminal Staff ID, display name, and approved role. Assign outlet/service-area scope through the established staff profile workflow. Do not substitute an email, name, or newly generated ID for the stable Staff ID.
4. Verify that the Auth UUID maps to exactly one active server staff profile and that its `staff_id` exactly equals the local Staff ID. Confirm active business membership and least-privilege role permissions.
5. Give the operator their own credentials privately. They must sign in as themselves on the terminal; never keep a shared cashier Auth session active.

## Pair a terminal once

1. Enroll the terminal using the existing owner enrollment process. The terminal keeps its device ID and legacy device credential separate from operator accounts. Do this once per installation, not once per operator.
2. Commission the staged v2 pairing while signed in with an active Admin account authorized for `devices.register`. The current native first-online-login path performs this registration as part of identity initialization, so the first Auth operator on a fresh terminal must be that authorized Admin. Do not use a cashier/Server account for first pairing or grant it `devices.register` just to bypass commissioning.
3. Confirm the registered `DESKTOP` device ID matches the enrolled terminal ID. After this one-time Admin commissioning sign out, subsequent operator sessions reuse the paired device; they do not register a new device per operator.
4. Keep the terminal paired-device metadata intact during normal operator changes. Admins may inspect or revoke paired devices in Staff/Devices. Revocation should stop staged access; it does not erase local business records.
5. The pairing owner is registration metadata only. Each operator authenticates separately; active business membership, the active device, and server-side operation permissions govern staged command acceptance.

## Sign in, switch, and sign out

- Online sign-in: unlock/select the matching local staff record and sign in with that operator's individual Supabase Auth email/password. The terminal validates the Auth session against the stable server Staff ID before enabling online identity. Never share an operator account. The local PIN remains the legacy/offline unlock credential; it is not the online server identity.
- Operator switch: sign out/lock, then select the next staff record and authenticate with that operator's own Auth credentials. Sign-out always clears the active local session even if draft flushing or OS-vault cleanup reports an error; resolve the displayed recovery message before another online sign-in. Do not share one account between cashiers or attribute work through a device identity.
- The access token and server-resolved operator permissions stay in process memory. The refresh token is stored via the operating system credential vault (Windows Credential Manager, macOS Keychain, or Linux Secret Service); it is never written to SQLite business tables or browser storage. The terminal checks for expiry while active and on resume, rotates the refresh token, and revalidates the staff/device identity before continuing. Signing out removes the active credential and clears the active local session. If the OS vault is unavailable, online sign-in fails closed.
- Password reset uses the existing Auth recovery flow. A lost/reinstalled terminal must be paired and verified again by an Admin; do not copy credential-vault contents or device credentials between terminals.

## First-use runbook

1. Build/configure the terminal with the staging project URL and publishable key, then complete existing terminal enrollment and verify that its terminal ID is stable after restart.
2. Sign in with an active Admin account authorized for `devices.register` to commission the staged DESKTOP pairing. Confirm the device ID matches the enrolled terminal. Pairing is a one-time device operation, not an operator credential.
3. Sign out, then sign in with each operator's own invited account. Confirm each Auth UUID resolves to that operator's matching local/server Staff ID, and that the same paired device ID is retained while actor and permissions change. Test a denied operation with a role that lacks its grant.
4. Restart the terminal and confirm refresh-token renewal uses OS secure storage. Sign out and verify the active operator session is cleared. Do not inspect, export, or copy vault contents.
5. Disconnect the server and verify local-PIN access uses only the existing SQLite/legacy path. Reconnect and reconcile that work before any v2 trial.
6. Only in staging, after the reviewed expansion set through `034_sealed_location_counts.sql` is applied, verify `servos_v2_terminal_identity` and `servos_v2_session` return the same `policyVersion`. Install the read-only shadow baseline, change an operator grant, and verify the old baseline is hidden until refreshed.
7. Keep `servos_v2.control.enabled` false. Pairing and identity checks do not authorize v2 writes. Record source, disposable SQL, native, packaged-terminal, hosted, and hardware evidence separately.

If a v2 identity/snapshot RPC returns an error, stop v2 use and leave the control disabled. Confirm which reviewed expansion migrations are actually applied to the target project and that the configured URL/key point to that project; do not try to fix a hosted 404 by embedding a service-role key or by manually modifying production grants.

## Deployment and RPC recovery

- If an authenticated `rpc/servos_v2_guidance_progress` request returns 404, first verify the Web app's configured Supabase project URL, then verify that reviewed expansion migration `017_web_lifecycle_guidance.sql` was applied to that same project. It defines the public RPC wrapper and grants execution to `authenticated`; the browser must not receive direct table access as a workaround. If the migration is absent, schedule it through the reviewed staging-to-hosted migration process, then retry with a real operator session. Do not use a service-role key in the client.
- If the browser reports a dynamically imported module failure, `NS_ERROR_CORRUPTED_CONTENT`, or a missing `/assets/*.js` chunk after a release, reload once to fetch the current HTML and asset graph. If the issue persists, verify that the active Vercel deployment contains every asset referenced by its own `index.html` and that the domain points wholly at that deployment. Redeploy the complete build artifact; do not upload only selected chunks or redirect missing JavaScript assets to `index.html`.
- A Vercel page that has remained open across a release may still hold the previous JavaScript runtime even when a fresh tab works. Record the failing asset URL, current entry asset URL, deployment ID, and timestamp before clearing site data or changing caches. Treat recovery as unverified until both a fresh session and an already-open tab recover without missing chunks.
- These recovery steps diagnose deployment state; they do not establish that a production deploy or hosted migration has been performed. Record source, staging, hosted, and browser evidence separately.

## Offline operation and v2 boundary

If the business server is unavailable, leave both online credential fields blank and use the local PIN option. This opens the existing SQLite/legacy terminal session only. Pending legacy synchronization remains on its established device-credential path; no v2 command is authorized or queued as an offline grant. Reconnect and use the established sync/reconciliation screens when service returns.

The v2 expansion control remains disabled by default. Do not enable it because operator sign-in or device pairing succeeded. Separate acceptance is still required for command/outbox translation, optimistic versions/read sets, durable acknowledgements, change-feed reconciliation, rollback/fencing, multi-client concurrency, migration control totals, backup/restore, smoke transactions, and cutover. No production enablement is described by this guide.

## Setup verification checklist

- [ ] Each invited Auth UUID is bound to one active stable Staff ID.
- [ ] Each operator's local Staff ID matches the server profile Staff ID.
- [ ] A terminal was registered once and subsequent operators resolve through the same device ID.
- [ ] An inactive or unbound Auth user is denied; a revoked terminal is denied.
- [ ] A user lacking an operation permission is rejected even when signed in on a paired terminal.
- [ ] The terminal identity RPC returns the same permission-policy fingerprint as the authenticated session RPC; after a grant change, the prior shadow view fails closed until its authorized snapshot is refreshed.
- [ ] Switching operators clears the old local session and activates only the newly authenticated identity.
- [ ] Refresh credentials are absent from SQLite and reside in OS credential storage only.
- [ ] Offline local-PIN use still follows the legacy path; v2 remains disabled.
- [ ] Disposable SQL, native, browser, and packaged-terminal evidence is recorded separately before any staged rollout.
