# 20 — Configuration and Environment Strategy

## 1. Environments

At minimum:

- local development;
- CI ephemeral;
- staging;
- production.

Each has an independent PostgreSQL database and independent secrets.

## 2. Production URLs

```text
WEB_ORIGIN=https://serveos.davemusau.co.ke
API_ORIGIN=https://serveosapi.davemusau.co.ke
```

## 3. Staging URLs

Recommended:

```text
https://serveos-staging.davemusau.co.ke
https://serveosapi-staging.davemusau.co.ke
```

or another clearly separate pair.

## 4. Configuration categories

### API

```text
NODE_ENV
PORT
DATABASE_URL
WEB_ORIGIN
API_ORIGIN
LOG_LEVEL
```

### Auth

```text
ACCESS_TOKEN_PRIVATE_KEY / signing key material
REFRESH_TOKEN_SECRET/pepper as architecture selects
SESSION_TTL
REFRESH_TTL
```

### SMTP

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
```

### Backup

```text
BACKUP_DESTINATION
BACKUP_ACCESS_KEY
BACKUP_SECRET
BACKUP_RETENTION
```

### Observability

```text
ERROR_TRACKING_DSN optional
METRICS_ENABLED
```

## 5. Client configuration

Web gets only public configuration:

```text
VITE_API_URL=https://serveosapi.davemusau.co.ke
VITE_APP_ENV=production
VITE_PROTOCOL_VERSION=...
```

Never ship server/database secrets in Vite variables.

Terminal gets:

- API base URL;
- protocol/client version;
- public verification keys if offline grants are signed asymmetrically.

Device secrets are created/enrolled and stored in OS credential storage, not compiled into installer.

## 6. Startup validation

API config is parsed by a schema at startup.

Missing/invalid required configuration fails fast with a clear operator log.

## 7. Feature flags

Flags are centralized, typed and audited where business-affecting.

Avoid environment-only flags for per-business capabilities.

Business capability/config belongs in database.

Environment flags are for rollout/infrastructure behavior such as:

```text
ENABLE_NEW_SYNC_PROTOCOL
ENABLE_EXPERIMENTAL_REPORT
```

and should be removed after rollout.

## 8. Secret rotation

Document rotation for:

- DB password;
- auth signing keys;
- SMTP;
- backup credentials;
- device trust keys.

Key rotation should permit an overlap window for verifying tokens/grants signed by the previous key when necessary.

## Web-first production origins

Production:

```text
WEB_ORIGIN=https://serveos.davemusau.co.ke
API_ORIGIN=https://serveosapi.davemusau.co.ke
```

Both origins are hosted on the same VPS but remain separate browser security origins. API CORS must explicitly allow the Web origin. PWA build-time values contain only public configuration. Database/session/SMTP/backup secrets remain server-only.

The optional local Print Bridge endpoint is device-local and paired; its address/port is not a cloud authority and must not be exposed publicly.

