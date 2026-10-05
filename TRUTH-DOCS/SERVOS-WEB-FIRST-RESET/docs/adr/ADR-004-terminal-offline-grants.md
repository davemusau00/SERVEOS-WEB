# ADR-004 — Bounded Offline Device Authority

**Status:** Accepted; superseded in client terminology by ADR-010

## Decision

An enrolled ServOS PWA device may finalize selected operations offline only inside a server-issued and bounded grant.

## Reason

Businesses need local resilience, but unconstrained multi-writer offline state recreates synchronization ambiguity.

## Consequences

- installed web terminals remain useful during outages;
- offline feature set is deliberately scoped;
- grant issuance/reconciliation is a core protocol feature;
- some sensitive actions block offline;
- phase one prefers one offline-authorized device per scarce operational scope.
