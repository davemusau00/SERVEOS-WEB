import type { RecordVersion } from '../../types/transactions';

type SnapshotRecord = RecordVersion & { data: Record<string, unknown>; archived?: boolean };
const key = (collection: string, id: string) => `${collection}:${id}`;

/** Build the smallest optimistic-concurrency baseline for an operation. */
export function resolveOperationDependencies(operation: string, collection: string, id: string, payload: Record<string, unknown>, records: SnapshotRecord[]): RecordVersion[] {
  const byKey = new Map(records.map(record => [key(record.collection, record.id), record]));
  const dependencies = new Map<string, RecordVersion>();
  const add = (target: string, targetId: unknown) => {
    if (typeof targetId !== 'string' || !targetId.trim()) return;
    const record = byKey.get(key(target, targetId));
    dependencies.set(key(target, targetId), { collection: target, id: targetId, version: record?.version ?? 0 });
  };
  if (operation !== 'floorplan.save') add(collection, id);
  if (operation === 'floorplan.save') {
    add('outlets', payload.outletId);
    const baseline = Array.isArray(payload.baseline) ? payload.baseline : [];
    for (const entry of baseline) if (entry && typeof entry === 'object') add('tables', (entry as Record<string, unknown>).id);
    const tables = Array.isArray(payload.tables) ? payload.tables : [];
    for (const entry of tables) if (entry && typeof entry === 'object') add('tables', (entry as Record<string, unknown>).id);
  }
  if (operation === 'catalog.createWithOpeningStock') {
    // The browser persists generated IDs in the payload so drafts and retries
    // keep the same targets. Server fallbacks are deterministic for native
    // clients that omit those IDs.
    const product = payload.product && typeof payload.product === 'object' ? payload.product as Record<string, unknown> : undefined;
    const stock = payload.stockItem && typeof payload.stockItem === 'object' ? payload.stockItem as Record<string, unknown> : undefined;
    const stockId = typeof stock?.id === 'string' && stock.id.trim() ? stock.id : id;
    add('stockItems', stockId);
    add('stockLocations', payload.locationId);
    if (payload.openingMovementId) add('stockMovements',payload.openingMovementId);
    if (product) {
      add('products', typeof product.id === 'string' && product.id.trim() ? product.id : `${id}:product`);
      if (Array.isArray(product.recipeIngredients)) {
        for (const ingredient of product.recipeIngredients) if (ingredient && typeof ingredient === 'object') add('stockItems', (ingredient as Record<string, unknown>).stockItemId);
      }
      if (Array.isArray(product.outletIds)) for (const outletId of product.outletIds) add('outlets', outletId);
      if (Array.isArray(product.outletIds)) for (const outletId of product.outletIds) add('outlets', outletId);
    }
    const opening = Number(payload.startingQuantity);
    if (Number.isFinite(opening) && opening > 0) add('stockMovements', typeof payload.openingMovementId === 'string'&&payload.openingMovementId.trim()?payload.openingMovementId:`${id}:opening`);
  }
  if (operation === 'credit.reconcile') add('customerCreditAccounts', payload.customerId);
  if (operation === 'product.save') {
    const productData = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : undefined;
    if (Array.isArray(productData?.recipeIngredients)) {
      for (const ingredient of productData.recipeIngredients) {
        if (ingredient && typeof ingredient === 'object') add('stockItems', (ingredient as Record<string, unknown>).stockItemId);
      }
    }
    if (Array.isArray(productData?.outletIds)) for (const outletId of productData.outletIds) add('outlets', outletId);
    if (Array.isArray(productData?.outletIds)) for (const outletId of productData.outletIds) add('outlets', outletId);
  }
  if (operation === 'inventory.produceBatch') {
    add('products', payload.recipeProductId);
    add('stockItems', payload.outputStockItemId);
    const product = typeof payload.recipeProductId === 'string' ? byKey.get(key('products', payload.recipeProductId)) : undefined;
    const ingredients = Array.isArray(product?.data.recipeIngredients) ? product.data.recipeIngredients : [];
    for (const ingredient of ingredients) if (ingredient && typeof ingredient === 'object') add('stockItems', (ingredient as Record<string, unknown>).stockItemId);
    add('stockLocations', payload.locationId);
  }
  if (operation === 'roomStay.settings') add('property', 'property');
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, unknown>;
  for (const [target, targetId] of [
    ['roomTypes', data.roomTypeId], ['customers', data.customerId], ['assetCategories', data.assetCategoryId],
    ['expenseCategories', data.categoryId], ['assets', data.assetId], ['assetWorkOrders', data.workOrderId],
    ['stockItems', data.stockItemId], ['stockLocations', data.locationId], ['rooms', data.roomId],
    ['rooms', payload.roomId], ['customers', payload.customerId], ['folios', payload.folioId],
    ['orders', payload.orderId], ['orders', payload.targetOrderId], ['tables', payload.sourceTableId],
    ['tables', payload.targetTableId], ['ratePlans', payload.ratePlanId],
    ['outlets', payload.outletId], ['products', payload.productId], ['paymentAccounts', payload.accountId],
    ['tillSessions', payload.tillSessionId], ['tillSessions', payload.tillId],
    ['assets', payload.assetId], ['assetWorkOrders', payload.workOrderId],
  ] as Array<[string, unknown]>) add(target, targetId);
  const paymentLines = operation === 'payment.split' && Array.isArray(payload.payments)
    ? payload.payments.filter((line): line is Record<string, unknown> => !!line && typeof line === 'object')
    : [payload];
  for (const line of paymentLines) add('paymentAccounts', line.accountId);
  if (operation.startsWith('payment.') || operation.startsWith('till.')) {
    const openTill = records
      .filter(record => record.collection === 'tillSessions' && !record.archived && record.data.status === 'OPEN')
      .sort((left, right) => String(right.data.openedAt || '').localeCompare(String(left.data.openedAt || '')))[0];
    if (openTill && operation !== 'till.open') add('tillSessions', openTill.id);
  }
  if (operation === 'order.create') add('tables', payload.tableId);
  if (operation === 'inventory.countSelected') {
    add('stockLocations', payload.locationId);
    if (Array.isArray(payload.selectedStockItemIds)) for (const stockId of payload.selectedStockItemIds) add('stockItems', stockId);
  }
  if (operation === 'inventory.reverseMovement') {
    add('stockMovements',payload.movementId);
    const movement=byKey.get(key('stockMovements',String(payload.movementId||'')))?.data;
    const source=movement?.sourceCommandId || movement?.sourceId;
    add('inventoryMovementBaselines',source);
    add('stockItems',movement?.stockItemId);
  }
  if (operation === 'procurement.reverseUnusedReceipt') {
    add('goodsReceipts',payload.goodsReceiptId);
    const receipt=byKey.get(key('goodsReceipts',String(payload.goodsReceiptId||'')))?.data;
    add('purchaseOrders',receipt?.purchaseOrderId);
    add('procurementCorrectionBaselines',payload.goodsReceiptId);
    const baseline=byKey.get(key('procurementCorrectionBaselines',String(payload.goodsReceiptId||'')))?.data;
    if(Array.isArray(baseline?.stockSnapshots))for(const raw of baseline.stockSnapshots)add('stockItems',(raw as Record<string,unknown>).stockItemId);
    if(Array.isArray(baseline?.payables))for(const raw of baseline.payables)add('supplierPayables',(raw as Record<string,unknown>).id);
  }
  if (operation.startsWith('inventory.')) { add('stockItems',payload.stockItemId);add('stockLocations',payload.locationId);add('stockLocations',payload.toLocationId); }
  if (operation === 'inventory.countLocation') {
    add('stockLocations', payload.locationId);
    for (const record of records) if (record.collection === 'stockItems' && !record.archived) add('stockItems', record.id);
  }
  if (operation === 'inventory.produceBatch') {
    add('products', payload.recipeProductId);
    add('stockItems', payload.outputStockItemId);
    add('stockLocations', payload.locationId);
    const recipeId = typeof payload.recipeProductId === 'string' ? payload.recipeProductId : '';
    const recipe = byKey.get(key('products', recipeId))?.data as Record<string, unknown> | undefined;
    if (Array.isArray(recipe?.recipeIngredients)) for (const ingredient of recipe.recipeIngredients) {
      if (ingredient && typeof ingredient === 'object') add('stockItems', (ingredient as Record<string, unknown>).stockItemId);
    }
  }
  if (operation === 'order.create' || operation === 'order.addItem') {
    add('posPolicy', 'policy');
    const product = typeof payload.productId === 'string' ? byKey.get(key('products', payload.productId)) : undefined;
    const productData = product?.data as Record<string, unknown> | undefined;
    const ingredients: unknown[] = Array.isArray(productData?.recipeIngredients) ? productData.recipeIngredients : [];
    for (const ingredient of ingredients) {
      if (ingredient && typeof ingredient === 'object') add('stockItems', (ingredient as Record<string, unknown>).stockItemId);
    }
    if (productData?.inventoryType === 'BATCH') add('stockItems', productData.stockItemId);
    const selectedModifierIds = new Set(Array.isArray(payload.modifierIds) ? payload.modifierIds.filter((value): value is string => typeof value === 'string') : []);
    const modifiers = Array.isArray(productData?.modifiers) ? productData.modifiers : [];
    for (const modifier of modifiers) {
      if (!modifier || typeof modifier !== 'object') continue;
      const entry = modifier as Record<string, unknown>;
      if (!selectedModifierIds.has(String(entry.id || ''))) continue;
      const adjustments = Array.isArray(entry.ingredientAdjustments) ? entry.ingredientAdjustments : [];
      for (const adjustment of adjustments) if (adjustment && typeof adjustment === 'object') add('stockItems', (adjustment as Record<string, unknown>).stockItemId);
    }
  }
  const order = collection === 'orders' ? byKey.get(key('orders', id)) : undefined;
  if (operation === 'payment.refund' || operation === 'payment.reverse') {
    const payment = byKey.get(key('payments', String(payload.paymentId || id)));
    add('orders', payment?.data.orderId);
  }
  if (order && operation.startsWith('payment.') && order.data.tableId) add('tables', order.data.tableId);
  if (order && (operation === 'order.fire' || operation === 'order.void')) {
    add('outlets', order.data.outletId);
    const outlet = typeof order.data.outletId === 'string' ? byKey.get(key('outlets', order.data.outletId)) : undefined;
    add('stockLocations', outlet?.data.defaultStockLocationId);
    const items = Array.isArray(order.data.items) ? order.data.items : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const itemData = item as Record<string, unknown>;
      const ingredients: unknown[] = Array.isArray(itemData.ingredientSnapshot) ? itemData.ingredientSnapshot : [];
      for (const ingredient of ingredients) {
        if (ingredient && typeof ingredient === 'object') add('stockItems', (ingredient as Record<string, unknown>).stockItemId);
      }
    }
  }
  if (operation.startsWith('roomReservation.') || operation.startsWith('stay.') || operation.startsWith('folio.')) {
    const reservationId = String(payload.reservationId || id || '');
    const reservation = reservationId ? byKey.get(key('roomReservations', reservationId)) : undefined;
    add('roomReservations', reservationId);
    if (operation.startsWith('stay.') || payload.stayId) add('stays', payload.stayId || reservationId);
    if (operation.startsWith('folio.') || payload.folioId) add('folios', payload.folioId || reservationId);
    add('rooms', payload.sourceRoomId); add('rooms', payload.roomId || payload.destinationRoomId || payload.targetRoomId);
    add('rooms', reservation?.data.roomId); add('ratePlans', payload.ratePlanId || reservation?.data.ratePlanId);
    add('paymentAccounts', payload.accountId || (payload.payment && typeof payload.payment === 'object' ? (payload.payment as Record<string, unknown>).accountId : undefined));
    add('hotelServices', payload.serviceId);
    add('customers', payload.customerId || reservation?.data.customerId);
  }
  if (operation === 'hospitality.settings.save') add('hospitalitySettings', id);
  if (operation === 'hotelService.save') add('hotelServices', id);
  if (operation.startsWith('maintenance.')) {
    const workOrderId = String(payload.id || id || '');
    add('maintenanceWorkOrders', workOrderId); add('rooms', payload.roomId || workOrderId);
  }
  return [...dependencies.values()].sort((left, right) => left.collection.localeCompare(right.collection) || left.id.localeCompare(right.id));
}
