import {operationalCommandRegistry,addOperationalEvent} from './operational-alerts.mjs';
import {captureMaintenanceRoomEvent} from './hospitality-room-events.mjs';
import {stockOperationalAlertCommandRegistry,captureStockOperationalAlerts} from './stock-operational-alerts.mjs';
import {accountingPeriodCommandRegistry,acquireAccountingPeriodLock} from './accounting-periods.mjs';
import {historicalCostCommandRegistry,captureHistoricalCosts} from './historical-cost-reviews.mjs';
import {preparationSettingsCommandRegistry} from './preparation-settings.mjs';
import {roomBlockCommandRegistry} from './room-blocks.mjs';
import {offlineCashV2Registry} from './offline-cash-v2.mjs';
import {supplierCreditApplicationCommandRegistry} from './supplier-credit-application-commands.mjs';
import {ticketCommandRegistry,enforceCheckoutWhenEnrolled} from './ticket-commands.mjs';
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
    operationalCommandRegistry, stockOperationalAlertCommandRegistry, ticketCommandRegistry, accountingPeriodCommandRegistry, historicalCostCommandRegistry, preparationSettingsCommandRegistry, roomBlockCommandRegistry,
    catalogCommandRegistry, customerCommandRegistry, customerCreditCommandRegistry,
    customerCreditReconciliationCommandRegistry, staffCommandRegistry, deviceCommandRegistry,
    managerApprovalCommandRegistry, supplierCommandRegistry, purchaseOrderCommandRegistry,
    goodsReceiptCommandRegistry, supplierInvoiceCommandRegistry, supplierPaymentCommandRegistry,
    supplierReturnCommandRegistry, supplierCreditCommandRegistry, supplierCreditApplicationCommandRegistry,
    posCommandRegistry, offlinePosCommandRegistry, floorplanCommandRegistry, roomCommandRegistry,
    offlineCashV2Registry, hospitalityCommandRegistry, financeAssetCommandRegistry, tillCommandRegistry,
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
  for(const name of ['order.create','order.quickAdd','order.addItem','order.updateItem','order.removeItem','order.fire','payment.record','payment.split','till.open','till.close','till.cashMovement']){
    const definition=registry.get(name);if(!definition)continue;
    registry.set(name,{...definition,handler:async context=>{await enforceCheckoutWhenEnrolled(context);return definition.handler(context);}});
  }
  for(const [name,definition] of registry)registry.set(name,{...definition,handler:async context=>{const handled=await captureStockOperationalAlerts(context,await captureHistoricalCosts(context,await definition.handler(context)));await captureMaintenanceRoomEvent(context,handled);await addOperationalEvent(context,handled);return handled;}});
  // Shared access preserves concurrent business commands while a review obtains
  // an exclusive snapshot boundary. Period handlers take only their own period
  // resource locks and never upgrade a shared lock to exclusive.
  for(const [name,definition] of registry){
    if(name.startsWith('accountingPeriod.'))continue;
    registry.set(name,{...definition,handler:async context=>{await acquireAccountingPeriodLock(context.tx.client,context.actor.businessId);return definition.handler(context);}});
  }
  return registry;
}
