# ADR-004 — Bounded Terminal Offline Authority

**Status:** Accepted direction

## Decision

Terminal may finalize transactions offline only inside a server-issued, signed and bounded grant.

Web remains online-authoritative for ServOS 1.0.

## Reason

Businesses need local resilience, but unconstrained multi-writer offline state recreates synchronization ambiguity.

## Consequences

- Terminal remains useful during outages;
- offline feature set is deliberately scoped;
- grant issuance/reconciliation becomes a core protocol feature;
- some sensitive actions block offline.
