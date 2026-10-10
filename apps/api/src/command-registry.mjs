import {supplierCreditApplicationCommandRegistry} from './supplier-credit-application-commands.mjs';
import {supplierCreditCommandRegistry} from './supplier-credit-commands.mjs';
import {customerCommandRegistry} from './customer-commands.mjs';
import {customerCreditCommandRegistry} from './customer-credit-commands.mjs';
import {customerCreditReconciliationCommandRegistry} from './customer-credit-reconciliation-commands.mjs';
import {managerApprovalCommandRegistry} from './manager-approvals.mjs';
import {staffCommandRegistry} from './staff-commands.mjs';
import {deviceCommandRegistry} from './device-commands.mjs';
import {supplierReturnCommandRegistry} from './supplier-return-commands.mjs';
import {supplierPaymentCommandRegistry} from './supplier-payment-commands.mjs';
import {supplierInvoiceCommandRegistry} from './supplier-invoice-commands.mjs';
import {goodsReceiptCommandRegistry} from './goods-receipt-commands.mjs';
import {purchaseOrderCommandRegistry} from './purchase-order-commands.mjs';
import {supplierCommandRegistry} from './supplier-commands.mjs';
import {refundCommandRegistry} from './refund-commands.mjs';
import {closeDayCommandRegistry} from './close-day-commands.mjs';
import {outletCommandRegistry} from './outlet-commands.mjs';
import {printCommandRegistry} from './print-commands.mjs';
import {businessTaxCommandRegistry} from './business-tax.mjs';
import {businessSetupCommandRegistry} from './business-setup.mjs';
import {paymentCommandRegistry} from './payment-commands.mjs';
import {paymentAccountCommandRegistry} from './payment-accounts.mjs';
import {tillCommandRegistry} from './till-commands.mjs';
import {posCommandRegistry} from './pos-commands.mjs';
import {offlinePosCommandRegistry} from './offline-pos-commands.mjs';
import {roomCommandRegistry} from './room-commands.mjs';
import {hospitalityCommandRegistry,hospitalityWalkInHandler} from './hospitality-commands.mjs';
import {financeAssetCommandRegistry} from './finance-asset-commands.mjs';
import {catalogCommandRegistry} from './catalog-commands.mjs';
import {floorplanCommandRegistry} from './floorplan-commands.mjs';

export function createApiCommandRegistry() {
  const groups = [
    catalogCommandRegistry, customerCommandRegistry, customerCreditCommandRegistry,
    customerCreditReconciliationCommandRegistry, staffCommandRegistry, deviceCommandRegistry,
    managerApprovalCommandRegistry, supplierCommandRegistry, purchaseOrderCommandRegistry,
    goodsReceiptCommandRegistry, supplierInvoiceCommandRegistry, supplierPaymentCommandRegistry,
    supplierReturnCommandRegistry, supplierCreditCommandRegistry, supplierCreditApplicationCommandRegistry,
    posCommandRegistry, offlinePosCommandRegistry, floorplanCommandRegistry, roomCommandRegistry,
    hospitalityCommandRegistry, financeAssetCommandRegistry, tillCommandRegistry,
    paymentAccountCommandRegistry, paymentCommandRegistry, businessTaxCommandRegistry,
    businessSetupCommandRegistry,
    printCommandRegistry, outletCommandRegistry, refundCommandRegistry, closeDayCommandRegistry,
  ];
  const registry = new Map();
  const overrides = [];
  for (const group of groups) {
    for (const [name, definition] of group) {
      if (registry.has(name)) overrides.push(name);
      registry.set(name, definition);
    }
  }

  const walkIn = registry.get('roomReservation.walkIn');
  const baseWalkIn = roomCommandRegistry.get('roomReservation.walkIn');
  if (walkIn && baseWalkIn) registry.set('roomReservation.walkIn', {
    ...baseWalkIn,
    handler: hospitalityWalkInHandler(baseWalkIn.handler),
  });
  const expectedOverrides = ['stay.checkIn'];
  if (JSON.stringify(overrides) !== JSON.stringify(expectedOverrides)) {
    throw new Error(`API command registry overrides changed: ${JSON.stringify(overrides)}`);
  }
  return registry;
}
