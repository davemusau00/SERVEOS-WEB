# ADR-005 — Relational Operational Domain Model

**Status:** Accepted for new backend

## Decision

Primary business truth uses explicit relational tables rather than a generic collection/id/JSON record store.

JSONB remains for flexible metadata, commands, audit and immutable document snapshots where appropriate.

## Reason

The generic record model made partial replacement and cross-domain invariants difficult to reason about.

## Consequences

- more explicit migrations;
- better constraints/indexing/query clarity;
- legacy data needs transformation during migration;
- domain code becomes easier to test.
