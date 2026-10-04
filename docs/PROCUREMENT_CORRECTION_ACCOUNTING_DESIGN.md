# Procurement corrections — accounting design for approval

Status: DRAFT FOR ACCOUNTING REVIEW. No approval has been recorded. Consumed, matched, paid, price-change and supplier-return handlers remain disabled. These proposed examples establish conservation requirements, not authority to post financial corrections.

## Required immutable evidence

Capture the original receipt and line IDs, package-to-canonical conversion, accepted canonical quantity, total invoice value in minor units, original currency, stock/cost before receipt, resulting stock/cost/version, PO fulfilment before/after, payable versions and original journal links. New receipts capture a separate immutable baseline. An older receipt without this evidence cannot use exact reversal.

Remaining-versus-consumed evidence must come from immutable movements and cost snapshots at sale/waste/transfer/production time. Current balance alone cannot prove which receipt was consumed in pooled weighted-average stock. The proposed policy treats receipt-specific allocation as unavailable unless supported by an audited allocation ledger; finance must approve a pooled price-variance method or commission that ledger before enabling consumed cases. No UI arithmetic supplies missing evidence.

## State matrix

| Mistake/state | Proposed correction | Inventory/COGS | PO/payable/payment | Gate |
|---|---|---|---|---|
| Exact unused duplicate; no later stock/cost/PO activity; unmatched unpaid payable | Entire compensating reversal | Restore captured quantities, physical state and average cost; reverse original inventory receipt journal | Restore PO fulfilment; zero and mark original payable REVERSED; retain receipt | Implemented with strict evidence checks; financial pilot pending |
| Duplicate with later stock movement or cost change | Current physical correction plus accounting investigation | No snapshot rewind over later activity | No automatic payable cancellation | Consumed design approval |
| Wrong accepted quantity, remaining stock | Signed quantity/value correction limited to remaining correctable quantity | Inventory value follows approved receipt-cost allocation | Adjust PO fulfilled quantity, payable or supplier credit | Quantity/cost allocation approval |
| Wrong price, remaining and consumed stock | Correct value only; no physical quantity change | Allocate remaining share to inventory and consumed share to COGS, or approved pooled variance method | Adjust unpaid payable; settled difference becomes supplier credit/additional liability | Cost-allocation approval |
| Supplier return | Physical return ledger plus supplier credit document | Remove returned stock using supported carrying cost; separate credit-price difference | Preserve historical receipt/PO; credit payable/receivable per approved policy | Return/credit policy approval |
| Invoice matched but unpaid | Linked invoice credit/debit note and payable correction | Supported inventory/COGS allocation | Do not rewrite matched invoice; maintain open amount and reconciliation | Document/accounting approval |
| Settled payable | Preserve actual payment; create/reallocate approved supplier credit | Supported inventory/COGS allocation | A real payment remains real; never delete or imply cash recovery | Paid-case approval |
| Payment entry wrong, external payment did not occur | Separate audited payment-entry reversal with evidence | No automatic stock return | Reverse erroneous cash/payable entry only; retain original | Treasury approval |
| Actual external payment occurred | Supplier refund/credit evidence workflow | No stock effect unless separate return | Record payout/refund only after external confirmation | Treasury approval |
| Original period closed | Post in current permitted open period with original-period link | Finance decides prior-period adjustment versus current COGS/variance | Preserve original posting dates and settlements | Closed-period policy approval |

## Proposed posting accounts and worked examples

All amounts below are integer KES minor units. The executable test `tests/procurement-accounting-design.test.mjs` checks equal debits/credits and value allocations. Account labels are proposed roles to map to the business chart of accounts; they are not new production account definitions.

1. **Unused duplicate:** erroneous receipt adds 12 bottles at KES 1,000 each (1,200,000 minor units). Reverse Dr goods-received-not-invoiced 1,200,000 / Cr inventory 1,200,000. Restore the recorded pre-receipt state. Actual payment remains zero. No quantity is physically returned.
2. **Wrong price:** 12 bottles invoiced KES 1,000 but agreed KES 900; eight remain and four are consumed. Proposed credit Dr supplier liability 120,000 / Cr inventory 80,000 / Cr COGS 40,000. Quantity stays unchanged. This allocation requires supported consumption evidence and finance approval; pooled balances do not establish it.
3. **Settled wrong-price receipt:** preserve the actual KES 12,000 payment. Proposed Dr supplier-credit receivable 120,000 / Cr inventory 80,000 / Cr COGS 40,000. A later documented cash refund Dr bank / Cr supplier-credit receivable is a separate operation with confirmed external evidence.
4. **Supplier return:** two remaining bottles at supported KES 900 carrying cost. Proposed Dr supplier-credit receivable 180,000 / Cr inventory 180,000; physical quantity decreases by two. Credit-price differences use the approved price-variance account and do not alter quantities or invent a payout.
5. **Erroneous payment entry:** a KES 12,000 payment recorded but demonstrably not sent. Proposed Dr bank 1,200,000 / Cr supplier liability 1,200,000 against the original payment entry. This cannot be used when the payment actually occurred.

Rounding: preserve invoice totals; allocate using exact canonical quantities and precision, round final money amounts once, and allocate any residual minor unit to a deterministic final line. Per-ml unit cost must not be prematurely rounded to whole minor units.

## Approval and implementation contract

Finance must sign off the allocation method, chart-of-account mapping, supplier-credit treatment, tax handling, PO fulfilment/return policy, closed-period date rules and evidence requirements. Proposed permissions separate preparation (`procurement.manage`), accounting posting (`procurement.pay` plus finance authority), treasury confirmation and independent approval for consumed/settled/closed-period cases. Approval thresholds and staff roles remain to be configured and approved; existing role names do not substitute for signoff.

After approval, add operation names, capabilities, native/shared dispatch, dependencies, generated contracts and behavioral tests together. A correction must return linked receipt, stock, PO, payable/credit and journal records atomically, preserve originals, enforce remaining correctable quantities/value and retain one immutable retry outcome. Tax and pooled-cost ambiguities must reject before any write. Approval must be attached to this design before any gated handler is enabled.
