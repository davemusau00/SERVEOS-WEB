# 00 — ServOS Executive Reset

## 1. Why this reset exists

ServOS has accumulated enough functionality to look broad and mature while still behaving inconsistently at the boundaries that matter most: mutation authority, synchronization, permissions, recovery and operator flow.

The reset therefore does **not** begin by adding features. It begins by reducing the number of architectural truths and making the product understandable.

### Existing strengths to preserve

- Mature local Terminal concepts: POS, tills, printer/scanner integration, SQLite durability and recovery.
- Strong inventory ideas: physical packaging, portioned drinks, recipes, counts, receiving and immutable movements.
- Strong hospitality direction: rooms, reservations, Front Desk, housekeeping and folios.
- Web/PWA reach and management surfaces.
- Existing V2 ideas around command IDs, versions, audit, idempotency and cutover evidence.
- Receipt immutability and reprint history.
- Guided help and role-based workspaces.

### Existing failure patterns to eliminate

- Legacy upload and V2 authority coexisting.
- Terminal and Web using different operation names for the same business action.
- SQL migration chains acting as a growing application dispatcher.
- Direct client coupling to hosted-database RPCs.
- Generic JSON record updates capable of clobbering unrelated fields.
- Web screens presenting actions whose backend semantics are missing or different.
- Offline Web messaging implying synchronization that is not actually guaranteed.
- Large monolithic screens accumulating local UI primitives and special cases.
- Feature-first navigation exposing irrelevant modules to ordinary staff.
- Separate QR raster logic despite a working receipt-logo image pipeline.

## 2. The reset decisions

### Decision A — One product trunk

`davemusau00/SERVEOS-WEB` becomes the canonical repository. Historical repositories become read-only references.

### Decision B — One network authority

The new API at:

`https://serveosapi.davemusau.co.ke`

is the only production network mutation authority.

No production browser code calls PostgreSQL directly.
No production Terminal code uploads arbitrary table/record snapshots.
No alternate cloud writer exists beside the API.

### Decision C — Web and Terminal remain first-class

The Web UI at:

`https://serveos.davemusau.co.ke`

is not a replacement for Terminal.

Terminal continues to own:

- printer/scanner hardware;
- local SQLite durability;
- full-screen counter operation;
- controlled offline capability;
- local recovery.

Web continues to own:

- remote reach;
- additional workstations;
- owner/manager use;
- administration;
- cloud-first workflows.

### Decision D — SQLite becomes a projection, not a second cloud

After cutover, the terminal database contains a locally queryable projection of cloud truth plus terminal-only device state, queued commands and offline grant state.

When online, commands are committed by the API.
When offline, only explicitly authorized command categories can be locally finalized.

### Decision E — No snapshot synchronization

Synchronization consists of:

1. explicit commands going up;
2. ordered change records coming down;
3. a bootstrap snapshot only when initializing/recovering a client.

There is no recurring whole-database upload.

### Decision F — Business logic moves out of the SQL dispatcher chain

PostgreSQL remains responsible for:

- transactions;
- constraints;
- uniqueness;
- foreign keys;
- indexes;
- immutable/audit protections;
- atomic data persistence.

The API/domain layer becomes responsible for:

- permission decisions;
- command routing;
- domain validation;
- orchestration;
- lifecycle rules;
- package conversion;
- hospitality state machines;
- application errors;
- API contracts.

### Decision G — Modular monolith before microservices

The first VPS backend is one deployable API and one worker using one PostgreSQL database.

Modules are separated in code, not by network boundaries.

This avoids replacing one form of complexity with another.

## 3. Product reset principle

> **The operator sees the business. ServOS sees the machinery.**

Examples:

- Operator says "5 crates of Coke arrived." ServOS calculates canonical units and cost.
- Receptionist says "Check John into Room 6 for one night." ServOS creates the internal stay/folio structure.
- Cashier says "M-Pesa, KES 2,450." ServOS creates payment, audit and receipt evidence.
- Manager says "Correct this count to 39 cans." ServOS records an immutable correction movement.

## 4. Business profiles

A single engine supports multiple business shapes through capabilities:

- Restaurant / Cafe
- Bar / Lounge / Club
- Hotel / Guest House
- Resort
- Restaurant + Hotel
- Retail / Counter Sales
- Custom

Profiles configure navigation, default settings, terminology and readiness requirements. They do not create incompatible codebases.

## 5. Product maturity gate

ServOS 1.0 is not defined by module count. It is defined by complete business journeys.

A release must prove at minimum:

- open till → sell → pay → print → refund where authorized → close till;
- create item → receive stock → count → transfer/waste → reconcile;
- create PO → approve → partial/full receive → invoice/pay supplier;
- quick room check-in → optional payment → stay → checkout;
- advanced reservation/deposit/folio path where enabled;
- network loss → Terminal continuity inside policy;
- response loss → original command status recovery;
- printer failure → transaction survives and receipt reprints;
- restart → no transaction duplication;
- Web and Terminal converge after reconnect;
- backup → restore → client re-bootstrap.

## 6. The specific anti-goals

The reset must not turn into:

- a rewrite of everything at once;
- a microservice project;
- a new generic ERP framework;
- a migration that enables old and new writers simultaneously;
- a cosmetic redesign over unchanged protocol problems;
- a requirement that every browser work offline;
- business logic hidden in ever-growing SQL stored procedures;
- more dashboards while critical workflows still have recovery gaps.

## 7. Release strategy

The new backend is built beside current production capability in an isolated environment.

The sequence is:

```text
stabilize current main
      ↓
create shared contracts
      ↓
stand up VPS staging backend
      ↓
implement domain modules
      ↓
connect Web
      ↓
connect Terminal online
      ↓
implement bounded Terminal offline
      ↓
migration rehearsal
      ↓
full business acceptance
      ↓
production cutover
      ↓
old stack read-only
```

No live data is moved until the new stack passes the migration, reconciliation and failure suites.

## 8. ServOS 1.0 product promise

A useful target statement for every design review:

> A business should be able to operate ServOS without understanding how ServOS is built.

And a useful engineering test:

> If the same business action has different semantics in Web, Terminal and API, the feature is not finished.
