# ADR-009 — Recording Corrections, Supplier Returns and Accounting Adjustments Are Distinct

## Status

Accepted for ServOS reset.

## Context

The V2 branch introduces guarded exact reversals for inventory movements and unused duplicate goods receipts. These are useful but intentionally reject cases where physical goods moved, stock was consumed, or later accounting activity exists.

A real supplier return is a physical event and must not be represented as an exact historical reversal.

## Decision

ServOS models separate business concepts:

1. **Recording correction** — the recorded event was erroneous and exact compensating restoration is still provably safe.
2. **Current balance correction** — physical truth differs from recorded balance; create immutable adjustment evidence.
3. **Supplier return** — goods physically leave the business and may create a supplier credit expectation.
4. **Accounting adjustment** — invoice price, credit note or settled payable requires ledger correction.

These concepts must use different command identities, permissions, audit language and printed documents.

## Consequences

- `procurement.reverseUnusedReceipt` may survive as a narrowly scoped correction concept.
- It may not be used for normal supplier returns.
- Operator UI explains physical and financial effects before confirmation.
- Reporting can distinguish errors from actual return activity.
