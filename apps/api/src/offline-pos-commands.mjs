import {ApiProblem} from './command-kernel.mjs';
import {posCommandRegistry} from './pos-commands.mjs';
import {paymentCommandRegistry} from './payment-commands.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const requirePermission=(actor,permission)=>actor.permissions?.includes('*')||actor.permissions?.includes(permission);
const childCommand=(parent,name,payload,expectedVersions)=>({...parent,name,payload,expectedVersions});
const run=async(registry,name,context)=>{
 const handler=registry.get(name)?.handler;if(!handler)throw new ApiProblem(500,'OFFLINE_SALE_HANDLER_MISSING',`The ${name} transaction handler is unavailable.`);
 return handler(context);
};
const mergeRecords=(...groups)=>{
 const byKey=new Map();for(const record of groups.flat())if(record)byKey.set(`${record.collection}:${record.id}`,record);
 return [...byKey.values()];
};

const executeOfflineCashSale=async({tx,command,actor,at})=>{
 if(!command.offlineGrantId)throw new ApiProblem(403,'OFFLINE_GRANT_REQUIRED','This sale requires a previously issued device offline grant.');
 for(const permission of ['pos.sell','order.fire','payment.record'])if(!requirePermission(actor,permission))throw new ApiProblem(403,'PERMISSION_DENIED','Offline counter sales require sales, fire and payment permissions.');
 const p=command.payload;
 if(!uuid(p.id)||!uuid(p.outletId)||!uuid(p.tillSessionId)||!uuid(p.cashAccountId)||!Array.isArray(p.lines)||p.lines.length<1||p.lines.length>100)throw new ApiProblem(400,'VALIDATION_FAILED','An offline cash sale requires an order, outlet, owned till, cash account and 1 to 100 lines.');
 if(typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>120||!['COUNTER','TAKEAWAY'].includes(p.serviceDestination??'COUNTER'))throw new ApiProblem(400,'VALIDATION_FAILED','Offline sales support a named counter or takeaway order.');
 const lineIds=new Set();for(const line of p.lines){if(!line||typeof line!=='object'||!uuid(line.id)||!uuid(line.productId)||lineIds.has(line.id))throw new ApiProblem(400,'VALIDATION_FAILED','Offline order line IDs and products must be unique valid IDs.');lineIds.add(line.id);}
 const expectedVersions={...command.expectedVersions};
 const orderKey=`orders:${p.id}`;if(expectedVersions[orderKey]!==0)throw new ApiProblem(400,'VALIDATION_FAILED','A new offline sale must include expected order version 0.');
 if(!p.expectedBalanceVersions||typeof p.expectedBalanceVersions!=='object'||Array.isArray(p.expectedBalanceVersions))throw new ApiProblem(400,'VALIDATION_FAILED','Reviewed inventory balance revisions are required for offline fire.');
 const account=await tx.client.query('SELECT method,archived_at AS "archivedAt" FROM payment_accounts WHERE business_id=$1 AND id=$2',[actor.businessId,p.cashAccountId]);
 if(!account.rows[0]||account.rows[0].archivedAt||account.rows[0].method!=='CASH')throw new ApiProblem(409,'OFFLINE_CASH_REQUIRED','Choose an active cash account for this offline sale.');
 const sales=[];
 const create=await run(posCommandRegistry,'order.create',{tx,actor,at,command:childCommand(command,'order.create',{id:p.id,name:p.name.trim(),outletId:p.outletId,serviceDestination:p.serviceDestination??'COUNTER'},expectedVersions)});
 sales.push(create);
 let orderVersion=create.value.version;
 for(const [index,line] of p.lines.entries()){
  const lineExpected={...expectedVersions,[orderKey]:orderVersion};
  const added=await run(posCommandRegistry,'order.addItem',{tx,actor,at,command:childCommand(command,'order.addItem',{orderId:p.id,itemId:line.id,productId:line.productId,quantity:line.quantity,portionId:line.portionId,modifierIds:line.modifierIds,note:line.note,courseName:line.courseName},lineExpected)});
  const storedLine=added.value.data.items.find(item=>item.id===line.id);
  if(['KITCHEN','BAR'].includes(storedLine?.routeTo))throw new ApiProblem(409,'OFFLINE_PREPARATION_UNAVAILABLE','Preparation-routed items require the connected kitchen and bar workflow. Remove them from this offline cash sale.');
  sales.push(added);orderVersion=added.value.version;
 }
 const fired=await run(posCommandRegistry,'order.fire',{tx,actor,at,command:childCommand(command,'order.fire',{orderId:p.id,expectedBalanceVersions:p.expectedBalanceVersions},{...expectedVersions,[orderKey]:orderVersion})});
 sales.push(fired);orderVersion=fired.value.order.version;
 let paid=null;
 if(fired.value.order.data.grandTotalMinor<=0)throw new ApiProblem(409,'OFFLINE_ZERO_TOTAL','Offline cash sale requires a positive payable total.');
 {
  const amountMinor=fired.value.order.data.grandTotalMinor;
  const cashTenderedMinor=p.cashTenderedMinor;
  if(!Number.isSafeInteger(cashTenderedMinor)||cashTenderedMinor<amountMinor)throw new ApiProblem(400,'VALIDATION_FAILED','Cash tendered must cover the full offline sale amount.');
  paid=await run(paymentCommandRegistry,'payment.record',{tx,actor,at,command:childCommand(command,'payment.record',{orderId:p.id,tillSessionId:p.tillSessionId,accountId:p.cashAccountId,amountMinor,cashTenderedMinor},{...expectedVersions,[orderKey]:orderVersion})});
  sales.push(paid);
 }
 const order=paid?.value.order??fired.value.order;
 return {value:{order,paymentIds:paid?.value.paymentIds??[],documentIds:[...new Set([...fired.value.documentIds,...(paid?[paid.value.documentId,paid.value.acknowledgementId]:[]),...(order.data.receiptDocumentId?[order.data.receiptDocumentId]:[])])],synchronization:'API_CONFIRMED_AFTER_RECONNECT'},records:mergeRecords(...sales.map(result=>result.records))};
};

export const offlinePosCommandRegistry=new Map([
 ['order.offlineCashSale',{permission:'pos.sell',offlineRequiredPermissions:['pos.sell','order.fire','payment.record'],offlinePolicy:'GRANTED_ONLY',handler:executeOfflineCashSale}],
]);
