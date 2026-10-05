# ADR-002 — No Recurring Snapshot Synchronization

**Status:** Accepted for reset; terminology updated by ADR-010

## Decision

The ServOS PWA synchronizes explicit commands upward and ordered change records downward.

Whole-state snapshots are used only for bootstrap/recovery/migration, never recurring reconciliation.

## Reason

Snapshot upload makes conflict ownership ambiguous and obscures which business action produced state.

## Consequences

- every change has causal command/audit evidence;
- response loss is recoverable by command ID;
- IndexedDB projection can be rebuilt;
- migration tooling imports old data once rather than maintaining bidirectional peers.
