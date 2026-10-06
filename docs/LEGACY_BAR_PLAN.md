# Accepted implementation plan — bar-first v2

> Superseded target: the accepted desktop/Vercel expansion is documented in [Expansion implementation plan](EXPANSION_PLAN.md). The historical bar implementation below describes the existing runtime, not the new multi-writer architecture.

## Product journey

**Install → Intake Wizard → Owner Enrollment → Business Setup Wizard → Go-Live Check → Staff Unlock → Open Till → Operate Bar → Reconcile → Close Day → Backup/Sync → Reports → Help when needed**

## Locked architecture

- one business;
- one physical premises/property;
- one authoritative installed terminal;
- SQLite is the local operational authority;
- Supabase is the ordered remote replica/request plane, not a dependency for local trading;
- no SaaS tenant switching and no multi-terminal writer design;
- M-Pesa remains manually confirmed and manager-reconciled; no Daraja in this release;
- browser demo surfaces never count as production implementation evidence.

## Phase completion

Phases 0–15 are now represented in source for the bar-focused vertical slice. Phase 16 is the mandatory packaged-device acceptance gate. See [COMPLETION_LEDGER.md](COMPLETION_LEDGER.md) for evidence status rather than interpreting source presence as completion.

## Transaction invariants

- business records, ledger effects, audit and outbox commit atomically;
- command replay is idempotent;
- price, tax, portion, modifier and recipe inputs are snapshotted onto order items;
- stock depletes once at firing;
- refunding money does not silently recreate consumed stock;
- protected actions identify initiator and approving manager;
- M-Pesa account/code allocation is unique and bounded;
- till close refuses unresolved open tabs;
- Go Live is enforced in Rust, not merely hidden in React;
- sync success is never claimed before server acknowledgement.

## Definition of Done

A user-visible/domain completion updates current release state, coverage matrix, changelog, completion ledger, affected workflow/user guide, data dictionary for persistence changes, RBAC documentation for permission changes, deployment runbook for operational changes, test evidence and UI inventory.
