import {ApiProblem} from './command-kernel.mjs';

export const catalogCommandRegistry = new Map([
  ['catalog.item.create', {
    permission: 'catalog.manage',
    offlinePolicy: 'ONLINE_ONLY',
    handler: async ({tx, command, actor, at}) => {
      const {itemId, name, sku = null, categoryId = null, basePriceMinor, currency = 'KES', trackInventory = false} = command.payload;
      if (typeof itemId !== 'string' || typeof name !== 'string' || !name.trim() || name.trim().length > 160) {
        throw new ApiProblem(400, 'VALIDATION_FAILED', 'Provide a valid item ID and name (up to 160 characters).');
      }
      if (!Number.isSafeInteger(basePriceMinor) || basePriceMinor < 0) {
        throw new ApiProblem(400, 'VALIDATION_FAILED', 'basePriceMinor must be a non-negative integer.');
      }
      if (sku !== null && (typeof sku !== 'string' || !sku.trim() || sku.length > 80)) {
        throw new ApiProblem(400, 'VALIDATION_FAILED', 'SKU must be blank or contain up to 80 characters.');
      }
      if (categoryId !== null && typeof categoryId !== 'string') {
        throw new ApiProblem(400, 'VALIDATION_FAILED', 'categoryId must be a UUID or null.');
      }
      if (!/^[A-Z]{3}$/.test(currency)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'currency must be a three-letter uppercase code.');
      if (typeof trackInventory !== 'boolean') throw new ApiProblem(400, 'VALIDATION_FAILED', 'trackInventory must be a boolean.');
      const expected = command.expectedVersions[`catalog_items:${itemId}`];
      if (expected !== 0) throw new ApiProblem(400, 'VALIDATION_FAILED', 'A new item command must include expected version 0 for its item ID.');
      if (sku && await tx.findCatalogSku(actor.businessId, sku)) {
        throw new ApiProblem(409, 'DUPLICATE_REFERENCE', 'That SKU is already assigned to an active item.');
      }
      const version = await tx.bumpEntityVersion(actor.businessId, 'catalog_items', itemId, 0);
      const item = {
        businessId: actor.businessId,
        staffId: actor.staffId,
        id: itemId,
        categoryId,
        name: name.trim(),
        sku: sku?.trim() || null,
        basePriceMinor,
        currency,
        trackInventory,
        version,
        createdAt: at.toISOString(),
      };
      await tx.insertCatalogItem(item);
      return item;
    },
  }],
]);
