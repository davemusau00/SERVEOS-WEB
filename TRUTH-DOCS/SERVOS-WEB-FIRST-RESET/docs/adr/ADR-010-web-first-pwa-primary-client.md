# ADR-010 — Web-First PWA Is the Primary ServOS Client

## Status
Accepted — 2026-10-06

## Context
ServOS currently carries parallel Native/Tauri and Web surfaces. This creates command, permission, UX and deployment parity work. The merged baseline already contains a PWA shell, Web operational surfaces and strong domain tests.

## Decision
The installable PWA at `serveos.davemusau.co.ke` becomes the primary ServOS client for counter, reception, store, kitchen/bar, manager and owner use.

Tauri is frozen as a business-feature target and retained temporarily as migration/test/reference evidence.

Offline resilience moves to IndexedDB + Service Worker + durable command outbox + bounded offline grants.

## Consequences
Positive:
- one UI/runtime;
- one responsive design system;
- simpler Android/Windows deployment;
- fewer parity bugs;
- updates delivered centrally;
- easier support.

Costs:
- browser offline persistence must be engineered deliberately;
- silent raw hardware printing needs a separate solution;
- existing native behavior must be ported/tested before retirement.
