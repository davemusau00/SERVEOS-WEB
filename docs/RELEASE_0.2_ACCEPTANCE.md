# ServOS 0.2.0 Release Acceptance

This worksheet is the final acceptance record for the installed **ServOS 0.2.0** terminal. Source/browser/native verification does not replace target-device acceptance.

## Release identity

```text
Git commit:
Version:                 0.2.0
Application identifier:  ke.servos.business
SQLite schema:           15
Release folder:
Installer:
Installer SHA-256:
Windows version/build:
Terminal hardware:
Scanner:
Receipt printer:
Tested by:
Date:
```

## Gate A — release package

- [ ] Packaging tree was clean.
- [ ] Release manifest commit matches source.
- [ ] Package/Cargo/Tauri versions equal 0.2.0.
- [ ] Identifier is `ke.servos.business`.
- [ ] Installer SHA-256 matches.
- [ ] `ExistingEnrollmentPreserved` is true.
- [ ] Manifest reports SQLite schema 15.
- [ ] No database, PIN, service-role key or `.env.local` is packaged.

## Gate B — existing-terminal migration

- [ ] Pre-upgrade checkpoint backup created.
- [ ] Pre-upgrade Production Health audit exported.
- [ ] Same Windows user and application data preserved.
- [ ] Intake not repeated.
- [ ] Terminal ID and device enrollment preserved.
- [ ] Installation stage remains LIVE.
- [ ] Database opens at schema 15.
- [ ] SQLite quick_check healthy.
- [ ] Business record counts reconcile.
- [ ] Pending outbox preserved.
- [ ] Existing scanner draft preserved where applicable.
- [ ] Post-upgrade Production Health audit exported.

## Gate C — physical Simple Operations

### Stock count
- [ ] Known barcode repeated scans.
- [ ] `scanUnitQuantity` applied.
- [ ] Unknown barcode causes no stock mutation.
- [ ] Pause/restart/resume draft.
- [ ] Review causes no mutation.
- [ ] Confirm once creates one committed count.

### Receive Delivery
- [ ] Approved-PO receipt.
- [ ] Known barcode and scan conversion.
- [ ] Unknown barcode requires explicit selection.
- [ ] Review causes no mutation.
- [ ] Confirm produces GRN/stock/payable/journal.
- [ ] Authorized ad-hoc delivery.
- [ ] Separate-manager over-receive approval.

### POS / printer
- [ ] Normal sale and payment.
- [ ] Customer and business receipt copies.
- [ ] 80 mm width/legibility/cut verified.
- [ ] No accidental duplicate receipt.

### Rooms / property
- [ ] Add room with existing type.
- [ ] Add room while creating type/default rate.
- [ ] Small bulk-room range.
- [ ] Conflict blocks whole batch.
- [ ] Add property by name/location.
- [ ] Report Problem reaches maintenance workflow.

### Friendly import
- [ ] Paste Excel tab-delimited rows.
- [ ] `001` remains `001`.
- [ ] Auto and manual mapping.
- [ ] Validate/stage/dry-run.
- [ ] No mutation before reviewed Apply.
- [ ] Cancel a test batch.

## Gate D — authority, offline/restart and recovery

- [ ] Offline launch preserves the persisted authority and approved cached access policy.
- [ ] Count draft survives restart.
- [ ] A transaction follows the selected authority; offline or expired shared sessions never fall back to legacy writing.
- [ ] Unsafe close is blocked if local work cannot flush.
- [ ] Reconnect/sync state is sane.
- [ ] Interrupted snapshot/import stays incomplete; changed replay/hash and unrelated server records block cutover.
- [ ] Native baseline identity, counts, content hash, policy and cursor match the authenticated server.
- [ ] New order/receipt numbers advance past preserved source counters and archived documents; historical numbers and branding remain unchanged.
- [ ] Server requires committed cutover and native evidence before shared activation; native requires server shared evidence.
- [ ] Terminal/Web transactions converge with matching stock, money, receipt and audit effects.
- [ ] Full shift, close day and restart pass on the upgraded terminal.
- [ ] Replacement-terminal checkpoint restore/replay passes without re-enabling a legacy writer.
- [ ] After shared writes, recovery uses coordinated restore/replay or forward repair.
- [ ] XP-80T customer/business copies have readable money/logo, correct feed and cutter behavior.
- [ ] The supplied official QR physically scans from customer paper and is absent from the business copy.

## Release decision

```text
[ ] ACCEPTED FOR PRODUCTION
[ ] REJECTED — remediation required
```

Notes:

```text


```

`PhysicalAcceptance` remains pending until this worksheet is actually completed on the target terminal.

## Gate E — customer tabs and credit

- [ ] Named tab preserves customer identity.
- [ ] Existing open tab can be linked before settlement.
- [ ] Active credit account charges the exact remaining sale balance.
- [ ] Credit sale closes the POS order without increasing cash/M-Pesa/card received.
- [ ] Credit limit/hold safeguards work.
- [ ] Cash account settlement increases expected drawer but remains separate from cash sales.
- [ ] M-Pesa account settlement appears in normal M-Pesa reconciliation.
- [ ] Partial settlement and FIFO allocation preserve exact customer balance.
- [ ] Customer statement reconciliation records a matching immutable snapshot.
- [ ] A mismatch creates a discrepancy without mutating the balance.
- [ ] Customer with active credit/debt cannot be archived.
- [ ] Close-day report includes credit sales, collections and A/R outstanding.
- [ ] Credit sale receipt shows Customer Account separately from Paid tender.

## Print queue cancellation candidate acceptance

- [ ] Verified checkpoint backup and isolated installed-upgrade rehearsal, retaining identity and history.
- [ ] Admin cancels one obsolete job and a reviewed batch; transport error/payload/profile/history preserved.
- [ ] Cashier and Manager requests denied; sending/sent/cancelled jobs rejected.
- [ ] Stale state/update-time selection rejects the entire batch and requires refreshed review.
- [ ] Cancellation audit and cancelled state persist after restart; no further retry permitted.
- [ ] Business Admin refreshed unresolved count excludes cancelled rows and counts beyond displayed 50.
- [ ] Current receipt and history reprint physically observed with working profile.
- [ ] Active till closed normally and all existing physical acceptance requirements completed.

These installed-terminal checks remain pending until actual evidence is entered. No production upgrade, migration or authority activation is implied by this candidate.
