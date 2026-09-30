# Terminal operator identity and setup

This guide configures individual business accounts on an installed ServOS terminal. The local SQLite terminal remains the operational writer. This setup does not enable Web v2 business writes, offline v2 authority, or production cutover.

## Before you begin

- Use a staging Supabase project for the first setup and testing.
- Keep the project URL and publishable key in the terminal build configuration as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never use a service-role key in the app or terminal.
- Apply the approved expansion migrations through `028_terminal_operator_identity.sql` to the target staging project. This migration is source only until your normal reviewed migration process applies it.
- Confirm each operator already has a local ServOS staff record with a stable, unique Staff ID. The v2 `staff_profiles.staff_id` must match that ID exactly.
- During first enrollment, the initial local Administrator's stable ID is `auth:<Auth UUID>`, matching the staged owner-profile backfill. For every other operator, bind the Auth user to the exact stable Staff ID from the terminal's staff record; do not guess or use an email/name as the ID.
- Confirm the business membership and operator permissions are active. Permissions are resolved from the authenticated server session and role profile, not from a terminal role selector.

## Invite and bind operators

1. Sign in to Web Administration as an authorized Admin and open Auth invitation/recovery.
2. Invite each operator using their own work email. The email link and password lifecycle belong to Supabase Auth; ServOS does not collect or store passwords.
3. Have the operator accept the invitation and set their password.
4. In Staff, bind that existing Auth user to the operator's existing stable Staff ID and assign the approved role/outlet/service areas. Do not create a second local staff identity to work around a mismatch.
5. Verify the active profile maps the Auth UUID to the expected stable Staff ID. The terminal checks that mapping at sign-in and rejects a different account.

## Pair a terminal once

1. Enroll the terminal using the existing owner enrollment process. The terminal keeps its device ID and legacy device credential separate from operator accounts.
2. On the first online operator sign-in, the terminal registers its terminal ID as a staged `DESKTOP` device once. Subsequent operator sessions reuse that paired device ID; they do not register a new device per operator.
3. Keep the terminal paired-device metadata intact during normal operator changes. Admins may inspect or revoke paired devices in Staff/Devices. Revocation should stop staged access; it does not erase local business records.
4. The pairing owner is registration metadata only. Each operator authenticates separately; active business membership, the active device, and server-side operation permissions govern staged command acceptance.

## Sign in, switch, and sign out

- Online sign-in: choose the local Staff ID, enter the local PIN, then enter the matching Supabase email/password. The terminal validates the Auth session against the server profile before unlocking.
- Operator switch: sign out/lock, then select the next staff record and authenticate with that operator's own Auth credentials. Do not share one account between cashiers or attribute work through a device identity.
- The access token stays in process memory. The refresh token is stored via the operating system credential vault (Windows Credential Manager, macOS Keychain, or Linux Secret Service); it is never written to SQLite business tables or browser storage. Signing out removes the active credential and clears the active local session. If the OS vault is unavailable, online sign-in fails closed. Automatic refresh-token rotation is not yet implemented; sign in again after the current Auth access expires.
- Password reset uses the existing Auth recovery flow. A lost/reinstalled terminal must be paired and verified again by an Admin; do not copy credential-vault contents or device credentials between terminals.

## Offline operation and v2 boundary

If the business server is unavailable, leave both online credential fields blank and use the local PIN option. This opens the existing SQLite/legacy terminal session only. Pending legacy synchronization remains on its established device-credential path; no v2 command is authorized or queued as an offline grant. Reconnect and use the established sync/reconciliation screens when service returns.

The v2 expansion control remains disabled by default. Do not enable it because operator sign-in or device pairing succeeded. Separate acceptance is still required for command/outbox translation, optimistic versions/read sets, durable acknowledgements, change-feed reconciliation, rollback/fencing, multi-client concurrency, migration control totals, backup/restore, smoke transactions, and cutover. No production enablement is described by this guide.

## Setup verification checklist

- [ ] Each invited Auth UUID is bound to one active stable Staff ID.
- [ ] Each operator's local Staff ID matches the server profile Staff ID.
- [ ] A terminal was registered once and subsequent operators resolve through the same device ID.
- [ ] An inactive or unbound Auth user is denied; a revoked terminal is denied.
- [ ] A user lacking an operation permission is rejected even when signed in on a paired terminal.
- [ ] Switching operators clears the old local session and activates only the newly authenticated identity.
- [ ] Refresh credentials are absent from SQLite and reside in OS credential storage only.
- [ ] Offline local-PIN use still follows the legacy path; v2 remains disabled.
- [ ] Disposable SQL, native, browser, and packaged-terminal evidence is recorded separately before any staged rollout.
