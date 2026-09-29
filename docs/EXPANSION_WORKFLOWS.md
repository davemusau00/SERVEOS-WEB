# Domain workflow specification

Planned unless completion ledger states otherwise. All mutations inherit command identity, auth, versions, audit and atomic effects from [contracts](EXPANSION_CONTRACTS.md). Capabilities below are target families, not an assertion they exist today.

## Masters/settings

record.save/archive/reactivate: collection manage permission, uniqueness, active references, guarded archives. settings.update: business.configure/tax/system capability, version/effective time, changed-field audit; sensitive policies online only. Same validation in setup/live. Preserve last administrator. Historical snapshots unaffected. MASTER/SETTINGS acceptance includes denial/stale/reload/second user.

## POS/host/production/procurement

- reservation.create/update/cancel/seat and waitlist.add/update/contact/seat: host.manage; date/capacity validation, atomic order/table claim; manual contact evidence. Offline owned table only.
- Existing order mutations plus courses: pos/order capabilities, owned order/table, price/tax/recipe snapshot, deplete once on fire; no automatic stock recreation on refund.
- production.create/post/reverse: inventory.production; DRAFT -> POSTED -> REVERSED. Ingredient consumption, output yield/cost and waste together; offline requires all affected stock rights.
- purchaseOrder.save/submit/cancel/receive, goodsReceipt.return, supplierPayable.match/pay: procurement capabilities; draft-only editing, linked receipt/stock/payable/journal effects. Returns reference original receipt; paid adjustments need credit/reversal. Offline settlements draft pending validation.

## Rooms

rooms.manage masters: types, amenities, capacity, rate plans. Reservation RESERVED -> CHECKED_IN -> CHECKED_OUT or CANCELLED/NO_SHOW. Housekeeping DIRTY -> CLEANING -> INSPECTION -> CLEAN independently of occupancy and AVAILABLE/OUT_OF_ORDER condition.

roomReservation.create/update/cancel/noShow; stay.checkIn/extend/move/checkOut: rooms.operate. Validate guest/capacity, UTC intervals/property timezone, turnaround and overlap. Nightly local arrival/departure, day-use fixed duration/price, extensions explicitly priced. Room move locks both intervals; offline all intervals must be allocated.

folio.postAccommodation/postService/roomCharge/deposit/pay/reverse/transferCredit: folio.manage/payment.record. Immutable minor-unit entries, rate/tax snapshot, unique stay/charge-period for restart catch-up. POS transfers receivable, never cash or duplicate revenue. Deposits liability until allocated; minibar depletes once. Checkout zero balance or approved credit transfer, then dirty room. No generic balance edits. ROOM/MONEY/GL proves conservation.

### Stay and folio implementation contract

One reservation has one stay and one folio; these three collections use the reservation ID as their stable ID. `folio.open` can precede check-in for deposits. Check-in creates missing folios atomically, requires a clean available room, a reached arrival time and no other checked-in occupant. All affected mutable records require baseline versions. Checkout requires all booked accommodation periods posted, a zero receivable balance and no remaining deposit liability, then closes stay/reservation/folio and makes the room dirty. Early departures initially require explicit settlement of the booked amount; cancellation/refund policy is a later dedicated adjustment, never a silent deletion.

`folio.postAccommodation` posts each due nightly period separately (day use is one fixed-duration period), keyed by reservation and period so catch-up/retry with a different command cannot charge twice. A `settleBookedStay` option under folio.manage posts remaining booked periods for early-departure settlement; it does not extend occupancy or change the stored quote. Rate/tax snapshots come from the reservation. Service charges use an active service master and snapshot its price/tax. Tax-inclusive gross is split into net revenue and tax liability; all financial values remain integer minor units.

`folio.deposit` records manually confirmed funds as a liability, not revenue. `folio.applyDeposit` debits that liability and credits guest receivables, bounded by both the unapplied deposit and outstanding balance. `folio.pay` settles receivables directly and cannot overpay; excess funds require a separate deposit. Cash tender/change is explicit; external payment method/account/reference and manual confirmation are mandatory, with normalized reference uniqueness across the business. Provider confirmation is never inferred. `folio.reverse` initially reverses charge entries only, preserves source linkage and requires a reason; refunds and payment reversals require separate payout evidence and cannot be simulated by changing an old payment.

Stays, folios and room intervals honor exclusive device allocations even for online edits. A room move validates both room versions, destination capacity/cleanliness and the remaining occupancy interval; billing start/rate snapshots remain unchanged. The move appends immutable stay history and makes the old room dirty with a turnaround block. Checkout similarly records actual turnaround; any incoming reservation affected by a late departure is listed on that block for resolution, rather than pretending the room is ready.

`stay.extend` selects an active rate plan for the current room type and a positive number of rate units. Its payload includes the exact quoted payment amount and normal manual-payment evidence. It validates the extra interval including turnaround, then posts the extension charge and its payment atomically; rejected/duplicate payment references leave the original departure and folio untouched. Original accommodation-period keys never change: extensions have their own immutable rate/interval/payment records and are paid at acceptance, so restart catch-up cannot charge them again. Rate, payment-account, reservation, stay, folio and room baselines are required. Total stay length remains bounded to 366 days.

This contract is staged for online transactions; offline acceptance remains disabled until signed grants and shared adapter fixtures are implemented. Credit transfers, POS receivable transfers, cloud receipt documents and refund settlement remain explicit integration tasks until their own commands and tests land.

## Assets/maintenance

asset.save/archive/reactivate: assets.manage, unique tag, category/location/supplier/acquisition references. asset.assign/return/transfer/inspect/lose/retire/dispose: assets.operate, versioned custody and immutable event/reason; offline requires ownership. No depreciation.

maintenance.report/assign/start/complete/cancel: maintenance.manage; REPORTED -> ASSIGNED -> IN_PROGRESS -> COMPLETED. Shared room/asset references, stock-part movements and cost links. Release room block explicitly after inspection, never clear occupied guest. Acquisition receives stock OR asset, not both. ASSET/STOCK verifies repeated parts/acquisitions.

### Staged command details

The command envelope remains mandatory. `asset.save` uses payload `{id,data}` with required name, tag, assetCategoryId, purchaseCostMinor and roomId or locationId. Metadata saves cannot move an existing asset. Assignment uses custodianId; transfer uses roomId/locationId; inspection uses condition and optional nextInspectionAt. Lifecycle actions require a reason. Each action requires the asset baseline version and adds immutable history. Active assets cannot be archived, and archiving/reactivation never resets retirement/disposal status.

`maintenance.complete` requires the work-order baseline plus a baseline for every consumed stock item. Payload includes resolution, parts `[{stockItemId,locationId,quantity}]`, serviceCostMinor and, when nonzero, supplierId/invoiceReference. Repeated stock IDs are rejected; callers combine their quantities first. Parts debit maintenance expense and credit inventory; external service invoices debit maintenance expense and credit accounts payable. Payments are a separate future supplier-settlement command. No browser directly calls allocation consumption or journal helpers.

`room.save` uses `{id,data}` with number, roomTypeId, capacity and turnaroundMinutes. `ratePlan.save` snapshots KES priceMinor, taxBasisPoints and NIGHTLY or DAY_USE mode; day use additionally requires durationMinutes. `roomReservation.create/update` uses roomId, ratePlanId, customerId, guests, startsAt and endsAt. Reserved quotes are tax-inclusive; subsequent stay posting must use that snapshot. Existing active room constraints cannot change while bookings or allocations depend on them.

`room.block` identifies roomId, startsAt/endsAt, reason and optional maintenanceOrderId. `room.unblock` requires inspection text and completed/cancelled linked maintenance. Blocks and bookings share a turnaround-aware availability check. Cancel/noShow require a reason; no-show cannot precede arrival. Housekeeping follows the ordered inspection workflow independently from occupancy. These staged handlers accept online validation only; signed offline finalization is deliberately unsupported until grants and adapter conformance are implemented.

## CRM/events/staff

- customer.save/archive, loyaltyRule.save, loyalty.earn/redeem/reverse, credit.limit/charge/settle: crm/credit permissions; source-linked immutable points/credit ledger, refunds reverse earnings, offline redemption limited to reserved budgets.
- event.save/publish/cancel, ticket.sell/refund/admit, promoter.save, commission.accrue/pay/reverse: event manage/admit permissions, capacity, actual ticket identity, one admission; offline assigned tickets only. Commissions derive eligible settled sales; payouts manual evidence.
- employee.save/deactivate, shift.save/clockIn/clockOut, leave.request/approve/reject/cancel, advance.request/approve/pay, payroll.generate/approve/pay/reverse: HR/payroll permissions. Preserve employee/login linkage, roster/leave conflict guards, payroll effective-rule snapshots with no sample statutory defaults. Approved runs immutable; manual payout/reference. Attendance may queue under grant; payroll approval/payment online.

## Accounting/reports/control

account.save/archive, journal.saveDraft/post/reverse, expense.record/reverse: accounting manage/post; balanced minor units, active accounts, immutable posted history. Manual fiscal records do not imply submission/certification. Statements derive posted entries.

alert.acknowledge/resolve and approval.request/decide: target/action/version bound, single-use approval and initiator/approver attribution. REPORT queries real sales/occupancy/yield/stock/credit/assets/payroll by permission/date/timezone/business day. CSV creates bytes and escapes formulas; printable export uses selected real data.

All views require search/filter, paginated history, details/source links, empty/loading/error states. No hard deletion of money/stock/audit/folio/custody. Unreferenced masters archive/reactivate after uniqueness checks. Guest QR remains sample only; hardware actions local or explicit registered agent.
