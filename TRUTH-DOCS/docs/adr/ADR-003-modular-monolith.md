# ADR-003 — Modular Monolith Backend

**Status:** Accepted for reset

## Decision

Deploy one API service, one worker and one PostgreSQL database with internal domain modules.

## Reason

Current problem is excess boundaries and drift, not insufficient services. Microservices would multiply contracts, deployments and failure modes.

## Consequences

- transactions across POS/inventory/finance are straightforward;
- deployment stays understandable;
- modules still have code boundaries;
- services may split later only with measured need.
