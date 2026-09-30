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
  add(collection, id);
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, unknown>;
  for (const [target, targetId] of [
    ['roomTypes', data.roomTypeId], ['customers', data.customerId], ['assetCategories', data.assetCategoryId],
    ['stockItems', data.stockItemId], ['stockLocations', data.locationId], ['rooms', data.roomId],
    ['rooms', payload.roomId], ['customers', payload.customerId], ['folios', payload.folioId],
    ['orders', payload.orderId], ['orders', payload.targetOrderId], ['tables', payload.sourceTableId],
    ['tables', payload.targetTableId], ['ratePlans', payload.ratePlanId],
    ['outlets', payload.outletId], ['products', payload.productId], ['paymentAccounts', payload.accountId],
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
  if (operation === 'order.create' || operation === 'order.addItem') {
    add('posPolicy', 'policy');
    const product = typeof payload.productId === 'string' ? byKey.get(key('products', payload.productId)) : undefined;
    const productData = product?.data as Record<string, unknown> | undefined;
    const ingredients = Array.isArray(productData?.recipeIngredients) ? productData.recipeIngredients : [];
    for (const ingredient of ingredients) {
      if (ingredient && typeof ingredient === 'object') add('stockItems', (ingredient as Record<string, unknown>).stockItemId);
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
      const ingredients = Array.isArray((item as Record<string, unknown>).ingredientSnapshot) ? (item as Record<string, unknown>).ingredientSnapshot : [];
      for (const ingredient of ingredients) {
        if (ingredient && typeof ingredient === 'object') add('stockItems', (ingredient as Record<string, unknown>).stockItemId);
      }
    }
  }
  if (operation.startsWith('roomReservation.') || operation.startsWith('stay.') || operation.startsWith('folio.')) {
    const reservationId = String(payload.reservationId || (operation.startsWith('roomReservation.') ? id : ''));
    const reservation = reservationId ? byKey.get(key('roomReservations', reservationId)) : undefined;
    add('roomReservations', reservationId); add('stays', payload.stayId || (operation.startsWith('stay.') ? id : reservationId));
    add('folios', payload.folioId || reservationId || (operation.startsWith('folio.') ? id : ''));
    add('rooms', payload.sourceRoomId); add('rooms', payload.destinationRoomId || payload.targetRoomId);
    add('rooms', reservation?.data.roomId); add('ratePlans', reservation?.data.ratePlanId); add('property', 'property');
  }
  return [...dependencies.values()].sort((left, right) => left.collection.localeCompare(right.collection) || left.id.localeCompare(right.id));
}
