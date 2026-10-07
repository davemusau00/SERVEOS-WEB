# ServOS Print Bridge foundation

This contains the bridge library, private stdio worker, localhost HTTPS adapter, Windows SCM wrapper source, Windows install/uninstall script and local pairing administration tool. The Windows service package is source-only: it has not been built, installed, or accepted on target hardware. The bridge has no ServOS API credentials, PostgreSQL access or business mutation code.

## Local delivery journal

SQLite stores exact immutable signed-envelope bytes, their SHA-256 hash, state/revision/attempt and append-only transition events. Canonical job UUIDs prevent alternate textual forms creating duplicate identities. Re-enqueue with identical bytes returns the existing state; different bytes under that ID are refused.

WAL and FULL synchronous commits protect the boundary before physical transport. `begin_send` must commit before any socket/spooler write. Transport success is SENT_TO_SPOOLER and does not prove paper delivery. Connection/write uncertainty is DELIVERY_UNCERTAIN. FAILED is reserved for failures where no transport output could have occurred.

Open the writer through `BridgeSession::open`. It holds an OS-backed exclusive lock beside the canonical journal path before schema initialization or recovery. A second writer fails immediately; lock-file existence alone never proves a process is live. Process exit releases the actual lock. Startup converts interrupted SENDING attempts to DELIVERY_UNCERTAIN and records events. Keep the session alive for the entire writer lifetime. Never delete its lock file to force recovery. Use the installer-owned journal location; hard-link aliases and attacker-controlled directories are unsupported.

SENDING cannot be cancelled or retried. QUEUED/FAILED can be cancelled. Retrying SENT_TO_SPOOLER/DELIVERY_UNCERTAIN requires operator reason and explicit possible-duplicate acknowledgement. Revision checks reject stale or repeated transition requests. Status lookup recovers lost transition responses without resending.

## Service boundary and authority

The source service path is worker -> authenticated dispatcher -> local SQLite session/attempt journal -> configured printer transport. The Node HTTPS host privately owns the worker process. The Windows SCM wrapper starts exactly one host and sends it a private shutdown token; it does not restart a failed host or replay a print request. A stop drains accepted HTTP work for up to 30 seconds, then terminates the host; interrupted sends are recovered as `DELIVERY_UNCERTAIN`. Journal acceptance alone is not signature validation or permission to print. Never expose `enqueue` or the low-level transport as an unauthenticated HTTP API.

PWA/API reconciliation must distinguish local acceptance, transport acceptance and physical delivery. API print claims/revisions remain authoritative for shared print workflow; local outcomes cannot modify orders, payments, stock or documents.

`install-windows.ps1` provisions the service under `NT AUTHORITY\LocalService`, installs the Node 22 runtime and bridge binaries, and restricts pairing/TLS/journal data to LocalService, SYSTEM and Administrators. It deliberately registers the service for manual start. `-Uninstall` removes only the matching SCM registration and preserves the pairing, TLS key and journal. The TLS certificate must already be trusted by target browsers and match the localhost origin; the script does not install a root certificate or start the service.

Compilation, dependency resolution and tests are deferred to the sprint verification phase. The service scripts have not been executed. No service, TLS, printer, physical hardware or installation acceptance is claimed.


## Signed request foundation

`auth` verifies WebCrypto ECDSA P-256/SHA-256 signatures in P1363 format against a public key from approved local pairing state. Request pairing identities and exact HTTPS Origin must match. The signed domain is `SERVOS_PRINT_BRIDGE_V1`, followed by bridge/business/device/origin/request IDs, issue/expiry seconds and SHA-256 of exact UTF-8 payload bytes, separated by newlines. Payloads are bounded to 1 MiB, validity to 120 seconds, and future clock skew to 30 seconds. Browser signing uses the existing non-exportable enrolled-device private key; no private key is transferred to the bridge.

`VerifiedRequest` proves signature/binding only. Typed action validation, canonical document hash validation, durable request-ID replay handling and shared API claim authorization still run before submission. The installer-owned configuration loader, local approval/revocation CLI and HTTPS Origin checks provide the pairing source boundary. They are source-reviewed only; no installed-service security acceptance is claimed.


## Durable request replay protection

Journal schema 2 retains signed request fingerprints independently of delivery jobs. `begin_request` returns `Accepted` exactly once for a request ID; only that result permits initial execution. An exact replay returns the original serialized response or an explicit unresolved state. Reusing the ID with different signed content is refused. Completed responses are immutable and cannot be deleted through normal journal operations.

A crash after acceptance may leave RECEIVED without a response. The dispatcher returns a scoped recovery decision from original job/attempt evidence; it never executes the action again just because the response is missing. A missing attempt remains a reconciliation case, not permission to resubmit. `complete_request` preserves completed responses before returning them to the PWA.

Request validity still applies before accepting an envelope. After expiry, obtain a newly signed status request naming the old request ID; `request_status` restricts lookup to the same bridge/business/device. The HTTP service must validate that typed status payload before calling this boundary. This permits recovery without extending an expired mutation request or leaking another device's outcomes.


## Typed action boundary

`ValidatedAction::parse` requires a verified signed request and refuses unknown actions/fields. Submit carries immutable document identity/type/number/layout, exact snapshot bytes/hash, printer role, bounded copies and API claim revision. It does not accept raw ESC/POS, arbitrary text lines, printer addresses or Windows queue names. Status, original-request status, reviewed retry and cancellation use bounded IDs/revisions/reasons.

Snapshot hash validation proves byte integrity against the supplied hash; it does not prove API issuance. The future dispatcher must verify the authoritative API document/claim and apply strict document-type schemas before rendering. It must route roles through local approved configuration. Labels and future procurement documents are not executable until their document schemas/renderers are added. No typed action currently sends to a printer.


## Approved local printer roles

`ConfiguredPrinters` parses schema-versioned installer-owned local JSON and exposes immutable role-to-profile lookup. Requests cannot supply or override routes. TCP routes default to port 9100 and retain native private-network restrictions. Windows RAW requires an actual Windows bridge and a bounded local queue name; network queue paths are refused by the retained profile validator. Width, raster and feed/cut bounds use the native validation path.

`printers.example.json` contains illustrative LAN addresses only; install-time configuration must name the actual accepted printers. A Windows destination has the form `{"transport":"WINDOWS_RAW","queue":"Actual local printer queue"}`. Unconfigured roles fail explicitly with browser fallback guidance. No automatic discovery, destination probing or physical printing occurs when parsing configuration.

Routing is only one prerequisite: the future dispatcher still needs authoritative claim/document verification and a supported document renderer before it may send a job. Installer file ACLs, approved configuration changes and hardware acceptance remain outstanding.


## Preparation document renderer

The initial strict renderer supports immutable KOT/BOT layout version 1 on their matching KITCHEN/BAR roles. It validates document line identities, fired/station evidence, bounded quantities, portion/modifier/course/round/note snapshots and original issue time. It formats Nairobi-local issue time and includes the original order/outlet/staff references. No current catalog, stock or price lookup occurs; no inventory action runs while rendering.

Output uses the standalone bounded ESC/POS pipeline. Tickets do not carry payment QR images. Invalid/unsupported historical snapshots fail explicitly for browser fallback; they are not silently repaired. Cancellation notices, receipts/refunds and close-day reports still need dedicated strict bridge renderers. Authoritative API claim/document verification remains required before any prepared output can be sent.


The renderer dispatcher also supports KOT_CANCEL/BOT_CANCEL on matching stations and ORDER_VOID_NOTICE on OFFICE. These preserve original cancelled-line evidence, reason, stock disposition/restoration/correction flags, original amount, original options/notes and unresolved earlier-ticket warnings. They prominently stop preparation/service and explicitly do not claim a refund. Contradictory disposition evidence or station mismatches refuse rendering; no stock-return decision is recomputed by the bridge.


## API claim attestation verification

SUBMIT requires the API authorization returned by a bridge-bound `print.claim`. `ApiAuthority` verifies the API's separate P-256 key pinned by version in trusted local configuration. It checks the API signature domain, validity window, original command/attempt and every submitted job/document/role/copy field against the signed claims and paired browser request. The validated action is fingerprint-bound to that device request. Successful verification returns an opaque `AuthorizedSubmit` value.

The API private JWK remains server-only. Do not trust request-provided API public keys or discover a replacement pin from an untrusted endpoint. Provision pins and rotate them through approved installer configuration.

An attestation proves issuance at claim time, not continuing claim ownership. The future dispatcher must recheck live claim/revocation state and expiry immediately before transport (or implement an explicitly accepted lease policy). This is especially relevant to voided orders and reviewed retries. No transport is enabled until that boundary is implemented.


### Trusted pairing configuration (source only)

`ApprovedConfiguration` loads bounded UTF-8 installer-owned JSON. Schema version 1 requires
`bridgeId`, `businessId`, exact HTTPS `apiOrigin`, `apiKeyId`, public P-256 `apiPublicKey`,
`printerConfigurationJson` (the exact printer configuration JSON as a string), and `devices`.
Each approved device requires `deviceId`, exact HTTPS PWA `origin`, public P-256 `publicKey`,
RFC3339 `approvedAt`, bounded `approvalReason`, and explicit boolean `revoked`. Revoked devices
also require RFC3339 `revokedAt` and a bounded `revocationReason`; active devices must omit both.
Private JWK fields are rejected. Duplicate device identities are rejected, including revoked entries.
An empty devices array is allowed and grants no access. Keep revoked entries as approval evidence.

Provision this file locally with installer/service-account ACLs. No browser request may create,
replace or approve it. `pairing-admin.mjs approve` accepts the public identity JSON shown in PWA
Bridge Settings, displays the device/origin/key fingerprint, requires independent operator comparison
against the authenticated ServOS device record, then requires a typed approval phrase and reason.
`pairing-admin.mjs revoke` requires a typed device-specific revocation phrase and reason; it retains
the original pairing and records revocation time/reason. Both commands atomically replace the local
configuration and must be run by an authorized local administrator against the installer-protected
configuration path. Neither command is available over HTTPS. The worker reloads the trusted
configuration before every request and fails closed on invalid/revoked configuration. `permits_origin`
is preflight policy only. An in-flight transport cannot be recalled by configuration revocation;
reconcile its delivery state. This source does not install or activate a managed service.

Commands:

```text
node apps/print-bridge/pairing-admin.mjs approve <absolute-config-path> <absolute-device-request.json>
node apps/print-bridge/pairing-admin.mjs revoke <absolute-config-path> <device-uuid>
```


### Private worker entry point (source only)

The Rust binary takes approved configuration and persistent journal paths as its two arguments.
It holds one BridgeSession for its lifetime and accepts serial newline-delimited JSON on stdin:
`{"messageId":"<canonical UUID>","operation":{"operation":"PREFLIGHT","httpOrigin":"https://pwa.example"}}`
or an inner `DISPATCH` operation with `httpOrigin` and signed `request`. Responses echo the
messageId and contain `ok` plus application `body`, or a generic refusal/unresolved code.
Configuration is reloaded for every message. Invalid/revoked configuration never falls back to a
previous loaded pairing. Malformed, oversized or truncated framing terminates the worker rather
than attempting to guess message boundaries. Stdout is reserved for protocol responses.

The HTTPS host owns this child process over private pipes, correlates responses, serializes requests,
bounds queued work and fails closed after worker exit. It never automatically restarts or resends an
in-flight request. A worker interruption during transport requires journal recovery and an
original-request status query. Host and worker execution/compilation remain deferred.


### Local HTTPS host (source only, not started)

`https-host.mjs` uses Node HTTPS and privately spawns the Rust worker. Provision absolute paths in
`PRINT_BRIDGE_WORKER`, `PRINT_BRIDGE_CONFIG`, `PRINT_BRIDGE_JOURNAL`, `PRINT_BRIDGE_TLS_KEY`,
and `PRINT_BRIDGE_TLS_CERT`; set `PRINT_BRIDGE_HTTPS_ORIGIN` to an exact trusted
`https://localhost:<port>` or `https://127.0.0.1:<port>` origin on a dedicated port >=1024.
The host binds IPv4 loopback only. TLS certificate name/chain must be accepted by target browsers;
no certificate bypass or HTTP fallback is implemented. Installer must protect TLS private key,
configuration, journal and executable directories with service-account ACLs.

The only route is `/v1/requests` (POST and CORS OPTIONS). Exact Host, locally approved Origin,
JSON content type, bounded body and current worker pairing policy are required. Browser credentials
are refused. Private-network preflight is allowed only for an approved origin. Up to eight requests
are admitted; worker operations remain serial even after HTTP response loss. Worker exit is terminal
for this host instance: no restart/replay occurs. Restart requires deliberate service recovery, with
original request identity retained by the PWA. Shutdown during output can leave uncertain delivery.
The Windows wrapper records bounded service lifecycle codes in `service-events.log` without capturing request/document contents. The host accepts a private shutdown token over the parent-owned stdin pipe, stops accepting new requests, drains current handlers and then closes the worker. If drain exceeds 30 seconds, the wrapper forces host termination; a print in flight is reconciled from the journal as uncertain. The host does not bind a LAN interface or restart the worker.

The Windows wrapper and install/uninstall script have not been built or executed. No service, TLS/browser acceptance or printer validation has run; installation remains pending.

#### Windows packaging inputs

Prepare an approved configuration from `approved-config.example.json`, the locally trusted TLS certificate/key pair, the Node.js 22 Windows distribution, and the Windows release bundle containing both bridge executables plus `https-host.mjs`. Keep the API private key out of this package; configuration contains only the pinned API public key. The service is installed manually and does not start as part of installation.

```powershell
.\apps\print-bridge\install-windows.ps1 `
  -BundlePath C:\releases\servos-print-bridge `
  -NodeDistributionPath C:\releases\node-v22-win-x64 `
  -ApprovedConfigPath C:\secure\approved-config.json `
  -TlsPrivateKeyPath C:\secure\localhost.key `
  -TlsCertificatePath C:\secure\localhost.crt `
  -BridgeOrigin https://localhost:9443
```

The installation script registers `ServOSPrintBridge` as a manual-start `LocalService` dependent on Windows Print Spooler. After checking printer ACLs, certificate trust/SAN, API public-key pin and pairing, an administrator may start it with `Start-Service ServOSPrintBridge`. Run the same script with `-Uninstall` to unregister only the matching service; persistent pairing, certificate and SQLite attempt evidence remain on disk. The release workflow does not yet package these inputs or produce a signed installer, and this procedure has not been run.
