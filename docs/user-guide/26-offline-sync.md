# Offline work and recovery

Section: Operations
Roles: Cashier, Waiter, Admin, Manager, Staff
Permission: help.view
Screen: help
Keywords: offline, cash, kiosk PIN, sync, queued, unknown outcome, recovery

## Overview

Offline cash is available only on the specifically enrolled checkout terminal in an authorized pilot. An administrator must provision its catalogue, open shift, signed capability and kiosk PIN while online. A new browser must sign in online first. Legacy installations retain their existing authorized behavior until their cohort is enabled.

A locally recorded cash sale means cash was physically received and its evidence was saved on this terminal. It remains provisional for central reporting until the server confirms reconciliation. Waiter devices can save personal drafts during an outage; a draft has not reached the cashier.

## Procedure

1. While online, open the enrolled cashier shift and provision its offline capability under **Offline checkout security** using a private kiosk PIN. Check its expiry and device support.
2. Use the same product search, current bill and Pay action during an outage. Review the exact total, physically receive cash, enter tendered cash and check change.
3. Continue only after **recorded locally** is shown. A storage or authorization failure is a hard failure; preserve any physical cash already received and ask the manager to reconcile it before claiming the sale was saved.
4. After restarting this provisioned browser, choose **Unlock provisioned offline checkout** and enter its kiosk PIN. Preserve the browser profile and local data.
5. On reconnect, review **Local cash activity and recovery** and Activity. Sync reuses the original IDs. Review exceptions without repeating their payment.
6. Before shift close, select **Stop offline creation / end capability**, synchronize all local sales and resolve exceptions. Retry ending the capability only after every original cash record is server confirmed. Expiry alone does not prove the ledger is drained.

## What ServOS handles

Each local cash commit stores its immutable sale, cash entry, provisional stock, slip evidence, checkout sequence and replay envelope atomically. Server reconciliation checks identity, authorization, canonical prices and inventory. A conflict retains the original cash evidence for review. Independent outcomes can recover without inventing settlement or automatically printing a second receipt.

## Common mistakes and correction

Do not clear storage, reinstall the browser, switch browser profiles or activate a pending update to remove queued financial work. A private recovery export contains business evidence; keep it in authorized storage and give it only to the manager responsible for recovery. Do not label an offline customer-claimed M-Pesa reference as verified payment. Refunds, room charges and credit remain online-only. Another phone or browser is not a substitute offline cashier.
