# ADR-008 — One Business Document Model and One Device Print Subsystem

## Status

Accepted; printing transport updated by ADR-011.

## Context

Current native printing is receipt-specific while operators also need Purchase Orders, GRNs, count sheets, cash-up reports, statements, folios, KOT/BOT tickets and work orders on 80mm hardware.

Allowing each module to invent printer output would duplicate formatting, retry and audit logic.

## Decision

All printable operational artifacts are typed, versioned `BusinessDocument` snapshots.

The PWA provides the universal HTML/CSS print path. Dedicated terminals may use the optional ServOS Print Bridge for durable raw ESC/POS spooling and Windows RAW/LAN transport.

Domain modules produce document data. Renderers produce bounded output. Hardware transport never owns procurement/accounting semantics.

## Consequences

- current `receipt_print_jobs` behavior is generalized rather than duplicated;
- receipt behavior remains one document family;
- reprint/audit/uncertain-delivery semantics are shared;
- PO/GRN/KOT/count/statement printing can be added without new business-specific printer transports;
- physical printer acceptance remains mandatory.
