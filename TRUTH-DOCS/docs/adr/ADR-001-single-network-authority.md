# ADR-001 — Single Network Mutation Authority

**Status:** Accepted for reset

## Decision

`serveosapi.davemusau.co.ke` is the only production network mutation authority.

Web and Terminal do not mutate PostgreSQL directly and do not call database RPC dispatchers.

## Reason

Previous architecture allowed legacy upload and V2/direct-database semantics to coexist, producing dual-authority and parity risk.

## Consequences

- all mutations are observable and idempotent;
- one permission/error/command model;
- backend availability becomes important, mitigated by Terminal offline grants;
- old direct-client mutation code must be retired after cutover.
