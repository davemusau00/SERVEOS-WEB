# Bar production acceptance

Record commit, OS/device, operator, date and evidence for every run.

## Fresh installation

- Intake Wizard survives restart before enrollment.
- Owner enrollment succeeds against the isolated/rehearsal project.
- No fake outlet, store, catalog or transaction is inserted by enrollment.
- Business Setup resumes after restart.
- Tax, payments, service areas, stock locations, real catalog, opening stock, staff access and till policy complete.
- Go Live refuses incomplete configuration and succeeds only after required evidence exists.
- Complete the required local-backup setup gate before Go Live.
- Confirm every service area has a valid default stock location before Go Live.

## Full shift

1. Unlock as operator and open the till.
2. Create a counter quick tab, a customer-linked named tab and a table order.
3. Sell bottle/unit product, spirit single/double and cocktail with modifier.
4. Change pre-fire quantity, duplicate a line, fire the round and use Repeat last round.
5. Fire and advance items through PREPARING → READY → SERVED.
6. Transfer and merge a table order with manager approval where required.
7. Declare waste and transfer stock between locations.
8. Receive stock with cost/supplier/evidence and confirm weighted-average cost.
9. Record cash, manual M-Pesa, external-card and split payments.
10. Apply discount and comp with approval/audit attribution.
11. Void fired items with explicit disposition.
12. Refund a payment and verify ingredients do not automatically return to stock.
13. Reconcile M-Pesa against statement evidence.
14. Perform a physical stock count.
15. Record paid-in/paid-out cash movement.
16. Confirm till close refuses open tabs.
17. Enter a blind count of cash on hand; variance requires manager approval and reason. No physical cash drawer is part of this installation.
18. Generate close-day report and verify sales/tax/tenders/adjustments/COGS/waste/margin/staff/system totals.
19. Create local backup.

## Failure/recovery

- Disconnect internet and continue trading.
- Restart application and confirm committed orders/payments/stock/till state remains.
- Reconnect; ensure ordered outbox upload does not duplicate effects.
- Replay the same command ID and confirm idempotency.
- Exercise stale record versions and manager-approval wrong target/second-use rejection.
- Restore a backup to a rehearsal replacement installation and fence the replaced terminal before syncing.

Only after all applicable checks pass may the bar slice be marked **deployment verified**.
