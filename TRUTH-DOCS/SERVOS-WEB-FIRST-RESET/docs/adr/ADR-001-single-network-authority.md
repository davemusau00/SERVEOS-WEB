# ADR-001 — Single Network Mutation Authority

**Status:** Accepted for reset; terminology updated by ADR-010

## Decision

`serveosapi.davemusau.co.ke` is the only production shared mutation authority.

The ServOS PWA does not mutate PostgreSQL directly and does not call database RPC dispatchers. Offline work is represented as bounded local commands that later reconcile through this same API.

## Reason

Previous architecture allowed legacy upload and V2/direct-database semantics to coexist, producing dual-authority and parity risk.

## Consequences

- all shared mutations are observable and idempotent;
- one permission/error/command model;
- backend availability is mitigated by bounded PWA offline grants;
- old direct-client mutation code is retired after cutover.
