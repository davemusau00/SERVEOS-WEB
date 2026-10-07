# 11 — Authentication, Security, RBAC and Device Trust

## 1. Security model

The API is the enforcement boundary.

Hiding a button is usability, not authorization.

Every mutation verifies:

- authenticated principal;
- active staff membership;
- business scope;
- permission;
- device trust where required;
- manager approval where required;
- command/version/offline policy.

## 2. Identities

Separate concepts:

```text
User identity
Staff record
Business membership
Role(s)
Device
Session
```

This avoids forcing every local staff member to have a cloud login while still supporting secure remote access.

## 3. Web authentication

Recommended pattern:

- username/email/phone identity as product policy determines;
- password hashed with a modern memory-hard password hash;
- short-lived access token;
- rotating refresh token in Secure, HttpOnly cookie;
- access token kept in memory where practical;
- exact-origin CORS;
- CSRF defense for cookie-authenticated mutation paths;
- session/device listing and revoke.

Do not store long-lived refresh tokens in `localStorage`.

Current API source uses 15-minute opaque bearer access tokens and an HttpOnly, SameSite refresh cookie scoped to one session ID and its refresh route. Refresh tokens are stored as hashes, rotate on use, and belong to a fixed 90-day session family. Reuse after the 30-second response-loss/concurrency window revokes the family. The PWA holds access tokens in memory and coordinates refresh through Web Locks. These source behaviors remain unverified until the migration, API and browser gates pass.

## 4. Terminal authentication

Online:

- enrolled device identity;
- operator signs in;
- refresh credential stored in OS keyring/credential store;
- API access token short lived.

Offline:

- local PIN may unlock a previously provisioned staff identity;
- local PIN does not manufacture server authority;
- command capability remains constrained by active offline grant and cached permission policy.

## 5. Device enrollment

Suggested flow:

```text
Admin logs in online
   ↓
Settings → Devices → Enroll Terminal
   ↓
server creates one-time enrollment challenge
   ↓
Terminal exchanges challenge
   ↓
device keypair/secret registered
   ↓
server returns device identity
   ↓
challenge expires permanently
```

Device can later be:

- renamed;
- scoped to outlet;
- suspended;
- revoked;
- replaced.

## 6. Roles

Canonical roles:

- Admin
- Manager
- Cashier
- Server/Waiter
- Chef/Kitchen
- Storekeeper
- Receptionist
- Housekeeper
- Accountant
- Custom

Role names are convenience presets over permissions.

## 7. Permissions

Examples:

```text
pos.sell
pos.discount
pos.comp
pos.refund
payment.record
payment.reconcile
inventory.view
inventory.receive
inventory.count
inventory.transfer
inventory.waste
inventory.correct_quantity
procurement.create
procurement.approve
procurement.receive
procurement.pay_supplier
hospitality.view
hospitality.check_in
hospitality.check_out
hospitality.move
hospitality.manage_rates
housekeeping.update
credit.charge
credit.settle
staff.manage
settings.manage
backup.request
reports.view
```

One permission string everywhere.

## 8. Workspace visibility

Navigation uses primary-purpose permissions.

Do not use generic `records.view` or `business.view` to admit users into operational workspaces.

Examples:

```text
POS → pos.sell
Stock → inventory.view/receive/count based on screen
Administration → settings.manage/staff.manage/import permission
```

## 9. Manager approvals

Sensitive action can request approval in-app.

Manager authenticates/approves within the dialog.

Approval is bound to:

- initiator;
- action;
- target;
- amount/threshold where applicable;
- expiry;
- single use.

No manual token copy/paste.

## 10. Secrets

Never commit:

- DB passwords;
- JWT secrets;
- SMTP passwords;
- device secrets;
- production test credentials;
- service-role keys.

Production secrets live in server secret environment/files readable only by root/deployment service.

Repository contains `.env.example` placeholders only.

## 11. TLS and network

Public ports:

```text
22   SSH, preferably restricted
80   redirect/ACME only
443  HTTPS
```

PostgreSQL is not exposed publicly.

Internal Docker network carries database traffic.

Admin database tools should be reached through SSH tunnel/VPN, not open Internet ports.

## 12. SSH hardening

- key authentication;
- disable password SSH where operationally possible;
- disable direct root login after bootstrap;
- named sudo deployment/admin user;
- firewall allow list where practical;
- automatic security updates or a documented patch cadence;
- fail2ban/rate controls as appropriate.

## 13. API hardening

- request body size limits;
- rate limiting on login/recovery/enrollment;
- structured validation;
- no stack traces in production responses;
- parameterized SQL only;
- security headers;
- exact CORS origin list;
- upload MIME/signature checks;
- CSV formula-injection neutralization on exports;
- log redaction.

## 14. Business isolation

Every domain query is business-scoped.

Tests deliberately attempt cross-business IDs and require `NOT_FOUND` or `PERMISSION_DENIED` without disclosing data.

Do not trust `businessId` from command payload without checking it against session membership.

## 15. Audit

Sensitive actions record:

- actor;
- effective role/permission;
- device;
- IP/session metadata where appropriate;
- approval;
- reason;
- target;
- before/after summary;
- command ID.

## 16. Password and account recovery

Recovery tokens:

- random/high entropy;
- one time;
- short lived;
- hashed at rest if stored;
- invalidate prior recovery tokens on use;
- audit recovery.

## 17. Security release gate

Before production:

- dependency audit;
- secret scan;
- authorization tests;
- cross-business isolation tests;
- login rate-limit test;
- session revoke test;
- device revoke test;
- offline grant signature/expiry tests;
- upload validation test;
- backup encryption/access review;
- no database public exposure;
- TLS grade/manual verification.

## Refresh rotation response-loss behavior

Migration 061 links every consumed refresh token to one successor. The API derives that successor from the presented parent token and its stored successor ID, then stores only the successor hash. A retry within the 30-second recovery window returns the same successor and issues a fresh access token; it cannot create a second child. Reuse after the recovery window revokes the refresh family and staff session. This is source behavior only until migrations 060-061 and the refresh concurrency/replay acceptance suite pass.
