# ADR-002 — No Recurring Snapshot Synchronization

**Status:** Accepted for reset

## Decision

Terminal synchronizes using explicit commands upward and ordered change feed downward.

Whole-database snapshots are used only for bootstrap/recovery/migration, never recurring reconciliation.

## Reason

Snapshot upload makes conflict ownership ambiguous and obscures which business action produced state.

## Consequences

- every change has causal command/audit evidence;
- response loss is recoverable by command ID;
- local projection can be rebuilt;
- migration tooling must explicitly import old data once.
