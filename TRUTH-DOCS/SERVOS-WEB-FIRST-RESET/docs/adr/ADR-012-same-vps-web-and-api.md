# ADR-012 — Frontend and API Share the Initial Production VPS

## Status
Accepted — 2026-10-06

## Context
A separate VPS is available and already runs Docker + Nginx. Splitting frontend, API and database across multiple hosting vendors would add deployment/sync complexity without a demonstrated scaling requirement.

## Decision
Host `serveos.davemusau.co.ke` and `serveosapi.davemusau.co.ke` on the same VPS.

Host Nginx serves immutable static PWA releases directly and reverse proxies the API to a loopback-bound Docker container. PostgreSQL and worker remain private Docker services.

At least one encrypted backup copy must leave the VPS.

## Consequences
Deployment is simpler and cheaper, with one operational environment. Resource/noisy-neighbor risk is handled through monitoring and can later trigger separation of database/worker/frontend only when measured.
