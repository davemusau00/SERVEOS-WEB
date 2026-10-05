# 26 — Web-First PWA Terminal Architecture

## Status

**Decision:** Adopted for the ServOS reset.

ServOS becomes one primary web application delivered from:

`https://serveos.davemusau.co.ke`

The same application serves counter terminals, reception, kitchen/bar screens, stock/store operations, managers, owners and administrators. Device enrollment, role, business capabilities and viewport determine the workspace that appears.

The API remains separately addressable at:

`https://serveosapi.davemusau.co.ke`

Both are deployed to the same VPS, but remain separate origins and separate security boundaries.

## 1. Why this replaces the Native/Web split

The current codebase has proven that maintaining Native and Web as separate first-class application surfaces creates recurring parity work. Business operations, permissions, dialogs, recovery behavior and terminology can drift even when the backend intent is the same.

The reset therefore changes the client model from:

```text
Native Terminal + Web client
```

to:

```text
One ServOS PWA
    ├── Terminal Mode
    ├── Reception Mode
    ├── Kitchen/Bar Mode
    ├── Store Mode
    ├── Manager Mode
    └── Owner/Admin Mode
```

This does not make the product less capable. It moves resilience from the Tauri/SQLite application boundary into a deliberate browser runtime consisting of a Service Worker, IndexedDB, WebCrypto device identity, a durable command outbox, local projections and recovery exports.

## 2. Runtime topology

```text
                         INTERNET
                            │
                 ┌──────────┴──────────┐
                 │                     │
   serveos.davemusau.co.ke   serveosapi.davemusau.co.ke
                 │                     │
              NGINX                 NGINX
                 │                     │
        static PWA release         API container
                 │                     │
                 │              PostgreSQL authority
                 │                     │
                 └──── HTTPS commands ┘
                        + change feed
```

Installed terminal:

```text
Edge / Chrome installed PWA
        │
        ├── cached application shell
        ├── IndexedDB projections
        ├── durable local commands
        ├── offline grants
        ├── print/document queue
        ├── backup snapshots
        └── optional localhost Print Bridge
```

## 3. Authority rule

The VPS API is the only shared mutation authority.

The PWA is allowed to finalize specific operations offline only where the server previously issued a bounded offline grant. An offline command is not a second database write. It is a durable command waiting for authoritative reconciliation.

Never implement:

- browser table upload;
- whole-state snapshot replacement;
- newest timestamp wins;
- client-side conflict resolution by arbitrary overwrite;
- direct PostgreSQL access from the browser;
- direct Supabase table/RPC mutation from production clients.

## 4. Browser persistence layers

### IndexedDB

Primary local persistence for:

- current business projection;
- products/categories/prices;
- rooms and current room state;
- open orders/tabs;
- tills assigned to the device;
- local command outbox;
- confirmed command results needed for recovery;
- change-feed cursor;
- cached business settings required while offline;
- cached branding/document assets;
- print jobs and document snapshots;
- offline grants;
- device capability records;
- guided-help progress local cache.

### Cache Storage

Service Worker caches immutable/versioned application assets and the minimal application shell required to launch ServOS with no network.

### OPFS / local file support

Use only when it materially helps large local artifacts such as:

- backup bundles;
- diagnostic packages;
- large controlled import staging;
- local document archives.

Do not create a second relational database in OPFS unless browser support and performance measurements prove IndexedDB insufficient.

## 5. Persistent storage request

The PWA should call `navigator.storage.persist()` where supported after enrollment and explain the result.

Expose a device-health indicator:

```text
LOCAL STORAGE
Persistent       Yes
Offline data      182 MB
Pending commands  0
Last backup       Today 15:20
```

If durable persistence is not granted, show an actionable warning to administrators. Do not frighten ordinary cashiers with browser terminology.

## 6. Multi-tab and duplicate-worker protection

One browser profile can open multiple tabs. That must not create two sync engines sending the same command concurrently.

Use:

- Web Locks API where supported;
- BroadcastChannel for tab coordination;
- a single elected sync leader;
- command-level server idempotency regardless of client locking.

Server idempotency remains mandatory because browser locks are optimization, not authority.

## 7. Device enrollment

Each installed PWA is enrolled as a ServOS device.

Suggested device identity:

```text
deviceId
businessId
outletId
workstationType
name
publicKey
createdAt
revokedAt?
lastSeenAt
capabilities
```

On enrollment, use WebCrypto to create a non-exportable device private key where browser support allows it. Register the public key with the API.

If browser site data is deleted, treat that as a lost device credential and require re-enrollment. Do not put reusable device secrets in localStorage.

## 8. Terminal Mode

A device enrolled as a counter terminal gets a deliberately narrow shell.

```text
TODAY | SELL | TABS | ORDERS | STOCK | CLOSE SHIFT
```

Manager/admin screens remain permission gated and can be hidden entirely on the counter device.

## 9. Reception Mode

```text
TODAY | FRONT DESK | ROOMS | GUESTS | HOUSEKEEPING | PAYMENTS
```

Quick walk-in remains a first-class path:

```text
Available Room
  → Check In
  → Guest name
  → nights / checkout
  → pay now or later
  → complete
```

A persistent CRM customer account, deposit or manually opened folio is optional unless property policy requires it.

## 10. Store Mode

```text
TODAY | RECEIVE | COUNT | TRANSFER | WASTE | ITEMS | PURCHASE ORDERS
```

Operators work in physical language. Crates, bottles, packs, kilograms and millilitres are converted to canonical units internally.

## 11. Kitchen / Bar Mode

A PWA on a wall tablet or counter screen receives relevant service-area orders through the API change feed when online and can use local device messaging/queued documents where a configured offline topology permits it.

For first offline release, avoid pretending several disconnected devices can independently coordinate one order queue. Choose an explicit offline authority topology per property.

## 12. App update policy

The Service Worker must never activate a new application version halfway through a payment, count, check-in or other critical workflow.

Use:

```text
new build discovered
    ↓
download in background
    ↓
mark UPDATE_READY
    ↓
wait until safe boundary
    ↓
operator/automatic controlled reload
```

A safe boundary means no critical modal, no unsent active command transition and no locally unresolved payment outcome.

## 13. Bundle-size requirement

The merged baseline builds successfully but reports a main JS chunk above 1 MB before gzip. The web-first reset should reduce cold-start cost through route/domain code splitting.

Targets:

- shell available rapidly on modest business hardware;
- POS route preloaded for Terminal Mode;
- hospitality/procurement/admin chunks loaded on demand;
- large logos and decorative assets optimized before shipping;
- no 1.8 MB app logo in the critical startup path.

## 14. Tauri retirement strategy

Do not delete the Native implementation on day one.

Use it as:

- behavior/reference implementation;
- domain invariant oracle;
- migration source;
- printer code source;
- test evidence.

Retirement sequence:

1. freeze new business features in Tauri;
2. implement new VPS API/domain kernel;
3. implement PWA offline store/outbox;
4. move business operations to API contracts;
5. port acceptance tests;
6. pilot PWA Terminal Mode;
7. extract printer transport into optional Print Bridge;
8. prove offline/recovery/hardware acceptance;
9. retire Tauri business runtime.

## 15. Definition of done

Web-first Terminal is complete only when a business can:

- install the PWA;
- enroll it;
- load after internet loss;
- make an offline-authorized sale;
- close and reopen the PWA without losing that sale;
- reconnect and confirm the same command once;
- print/reprint appropriately;
- export a local recovery backup;
- recover a replacement machine from server bootstrap;
- operate all critical workflows at 1024×600 without clipped controls.
