# ServOS Print Bridge foundation

This contains a library and private stdio worker; it is not yet an exposed HTTPS service or installed bridge. It has no ServOS API credentials, PostgreSQL access or business mutation code.

## Local delivery journal

SQLite stores exact immutable signed-envelope bytes, their SHA-256 hash, state/revision/attempt and append-only transition events. Canonical job UUIDs prevent alternate textual forms creating duplicate identities. Re-enqueue with identical bytes returns the existing state; different bytes under that ID are refused.

WAL and FULL synchronous commits protect the boundary before physical transport. `begin_send` must commit before any socket/spooler write. Transport success is SENT_TO_SPOOLER and does not prove paper delivery. Connection/write uncertainty is DELIVERY_UNCERTAIN. FAILED is reserved for failures where no transport output could have occurred.

Open the writer through `BridgeSession::open`. It holds an OS-backed exclusive lock beside the canonical journal path before schema initialization or recovery. A second writer fails immediately; lock-file existence alone never proves a process is live. Process exit releases the actual lock. Startup converts interrupted SENDING attempts to DELIVERY_UNCERTAIN and records events. Keep the session alive for the entire writer lifetime. Never delete its lock file to force recovery. Use the installer-owned journal location; hard-link aliases and attacker-controlled directories are unsupported.

SENDING cannot be cancelled or retried. QUEUED/FAILED can be cancelled. Retrying SENT_TO_SPOOLER/DELIVERY_UNCERTAIN requires operator reason and explicit possible-duplicate acknowledgement. Revision checks reject stale or repeated transition requests. Status lookup recovers lost transition responses without resending.

## Required service boundary still outstanding

The future service must implement trusted localhost HTTPS, strict origin/pairing, enrolled-device signature validation, typed canonical document validation and hash verification, local configured printer-role routing and durable transport orchestration. The library provides journal writer locking; the future installed service must consistently use that session boundary. Journal acceptance alone is not signature validation or permission to print. Never expose `enqueue` or the low-level transport as an unauthenticated HTTP API. Protect journal files with installer-managed local permissions; envelope history can contain business documents.

PWA/API reconciliation must distinguish local acceptance, transport acceptance and physical delivery. API print claims/revisions remain authoritative for shared print workflow; local outcomes cannot modify orders, payments, stock or documents.

Compilation, dependency resolution and tests are deferred to the sprint verification phase. No physical printer or installation acceptance is claimed.


## Signed request foundation

`auth` verifies WebCrypto ECDSA P-256/SHA-256 signatures in P1363 format against a public key from approved local pairing state. Request pairing identities and exact HTTPS Origin must match. The signed domain is `SERVOS_PRINT_BRIDGE_V1`, followed by bridge/business/device/origin/request IDs, issue/expiry seconds and SHA-256 of exact UTF-8 payload bytes, separated by newlines. Payloads are bounded to 1 MiB, validity to 120 seconds, and future clock skew to 30 seconds. Browser signing uses the existing non-exportable enrolled-device private key; no private key is transferred to the bridge.

`VerifiedRequest` proves signature/binding only. Typed action validation, canonical document hash validation, durable request-ID replay handling and shared API claim authorization must still run before any operation. Pairing persistence, operator approval/revocation and HTTP Origin handling are not yet implemented. Do not construct approved pairing state from request-provided keys or treat this module as a complete service authentication flow.


## Durable request replay protection

Journal schema 2 retains signed request fingerprints independently of delivery jobs. `begin_request` returns `Accepted` exactly once for a request ID; only that result permits initial execution. An exact replay returns the original serialized response or an explicit unresolved state. Reusing the ID with different signed content is refused. Completed responses are immutable and cannot be deleted through normal journal operations.

A crash after acceptance may leave RECEIVED without a response. The service must reconcile the typed operation against its original job/attempt evidence; it must not execute it again merely because the response is missing. Action/journal orchestration and that reconciliation remain outstanding. `complete_request` preserves the result before returning it to the PWA.

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
RFC3339 `approvedAt`, bounded `approvalReason`, and explicit boolean `revoked`.
Private JWK fields are rejected. Duplicate device identities are rejected, including revoked entries.
An empty devices array is allowed and grants no access. Keep revoked entries as approval evidence.

Provision this file locally with installer/service-account ACLs. No browser request may create,
replace or approve it. Keys must be independently verified against enrolled API/PWA identities;
merely receiving a public key from a browser is insufficient approval. The future HTTPS host must
reload the trusted configuration before each dispatch, fail closed on invalid/revoked configuration,
and serialize access to the exclusive BridgeSession. `permits_origin` is preflight policy only.
An in-flight transport cannot be recalled by configuration revocation; reconcile its delivery state.
No listener, installer, local approval UI or automatic configuration watcher is activated by this module.


### Private worker entry point (source only)

The Rust binary takes approved configuration and persistent journal paths as its two arguments.
It holds one BridgeSession for its lifetime and accepts serial newline-delimited JSON on stdin:
`{"messageId":"<canonical UUID>","operation":{"operation":"PREFLIGHT","httpOrigin":"https://pwa.example"}}`
or an inner `DISPATCH` operation with `httpOrigin` and signed `request`. Responses echo the
messageId and contain `ok` plus application `body`, or a generic refusal/unresolved code.
Configuration is reloaded for every message. Invalid/revoked configuration never falls back to a
previous loaded pairing. Malformed, oversized or truncated framing terminates the worker rather
than attempting to guess message boundaries. Stdout is reserved for protocol responses.

The future HTTPS host must own this child process, use private pipes, correlate responses,
serialize requests, bound queued work and fail closed after worker exit. It must never automatically
restart and resend an in-flight request. A worker interruption during transport requires journal
recovery and an original-request status query. No worker execution or compilation has run yet.
