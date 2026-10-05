# ADR-008 — One Business Document Model and One Terminal Print Spooler

## Status

Accepted for ServOS reset.

## Context

Current native printing is receipt-specific while operators also need Purchase Orders, GRNs, count sheets, cash-up reports, statements, folios, KOT/BOT tickets and work orders on the same 80mm hardware.

Allowing each module to emit printer bytes would duplicate formatting, retry and audit logic.

## Decision

All printable operational artifacts are represented as typed, versioned `BusinessDocument` snapshots and printed through one generic durable Terminal `PrintJob` queue.

Domain modules produce document data. Renderers produce bounded printer output. Transport sends the bytes.

The printer transport layer does not know procurement/accounting semantics.

## Consequences

- Current `receipt_print_jobs` is migrated/generalized rather than duplicated.
- Receipt behavior remains supported as one document family.
- Reprint/audit/uncertain-delivery semantics are common.
- PO/GRN/KOT/count/statement printing can be added without new printer transports.
- Physical printer acceptance remains mandatory per document family.
