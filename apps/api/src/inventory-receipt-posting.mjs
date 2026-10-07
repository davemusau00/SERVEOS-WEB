import {ApiProblem} from './command-kernel.mjs';
import {randomUUID} from 'node:crypto';
import {weightedCostRate} from './inventory-costs.mjs';

/** Shared transaction primitive, not a command or permission boundary.
 * Caller holds inventory catalog lock, validates domain/source policy and reviewed versions,
 * and passes an active stock/location, reviewed balance and frozen purchase-unit quantities.
 * Every write uses the caller transaction; any later GRN failure rolls back the stock posting.
 */
export async function postInventoryReceipt({tx,command,actor,at,stockItemId,locationId,stock,before,quantity,baseQuantity,totalCostMinor,pack,sourceKey,sourceDocument,physical={},sourceLineId=null}){
 const p=physical,reference=sourceDocument.reference;
 if(typeof reference!=='string'||!reference.trim()||reference.length>160||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(baseQuantity)||baseQuantity<=0||baseQuantity>1e9||!Number.isSafeInteger(totalCostMinor)||totalCostMinor<0)throw new ApiProblem(400,'VALIDATION_FAILED','Receipt posting inputs are invalid.');
 let sealed=null,open=null,nextSealed=null,nextOpen=null;
 if(stock.sealedContainerSize!==null){
  const size=stock.sealedContainerSize;sealed=p.sealedContainers;open=p.openQuantity;
  if(stock.baseUnit!=='ml'||!Number.isSafeInteger(sealed)||sealed<0||typeof open!=='number'||!Number.isFinite(open)||open<0||open>=size||Math.abs(sealed*size+open-baseQuantity)>0.000001)throw new ApiProblem(400,'VALIDATION_FAILED','Receipt quantity must reconcile to whole sealed bottles and open liquid below one bottle.');
  if(before.quantity>0&&(before.sealedContainers===null||before.openQuantity===null))throw new ApiProblem(409,'PHYSICAL_STATE_REQUIRED','Record a physical bottle count before receiving into this balance.');
  nextSealed=(before.sealedContainers??0)+sealed;nextOpen=Number(((before.openQuantity??0)+open).toFixed(6));
  if(!Number.isSafeInteger(nextSealed)||nextOpen>=size)throw new ApiProblem(409,'RESOURCE_CONFLICT','Receiving would exceed the supported open-bottle state.');
 }else if(p.sealedContainers!==undefined||p.openQuantity!==undefined)throw new ApiProblem(400,'VALIDATION_FAILED','Sealed/open quantities require configured bottle stock.');
 const afterQuantity=Number((before.quantity+baseQuantity).toFixed(6));if(afterQuantity>1_000_000_000)throw new ApiProblem(400,'VALIDATION_FAILED','Resulting stock balance exceeds the quantity limit.');
 const averageCost=weightedCostRate(await tx.totalStockQuantity(actor.businessId,stockItemId),stock.averageUnitCostMinor,baseQuantity,totalCostMinor);
 const unitCostMinor=weightedCostRate(0,0,baseQuantity,totalCostMinor),id=randomUUID();
 await tx.insertInventoryReceipt({businessId:actor.businessId,id,stockItemId,locationId,sourceKey,sourceDocument,pack,quantity,baseQuantity,totalCostMinor,unitCostMinor,beforeCost:stock.averageUnitCostMinor,afterCost:averageCost,sealed,open,commandId:command.commandId,staffId:actor.staffId,at,sourceLineId});
 await tx.setInventoryBalance({businessId:actor.businessId,stockItemId,locationId,quantity:afterQuantity,sealedContainers:nextSealed,openQuantity:nextOpen});
 const version=await tx.bumpEntityVersion(actor.businessId,'stockItems',stockItemId,stock.version);await tx.updateStockCostAndVersion(actor.businessId,stockItemId,averageCost,version);
 const movementId=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id:movementId,stockItemId,locationId,quantityDelta:baseQuantity,movementType:'RECEIPT',reason:reference,commandId:command.commandId,staffId:actor.staffId,at});
 return {receipt:await tx.inventoryReceiptProjection(actor.businessId,id),stockItem:await tx.stockRecordProjection(actor.businessId,stockItemId),stockMovement:await tx.inventoryMovementProjection(actor.businessId,movementId)};
}
