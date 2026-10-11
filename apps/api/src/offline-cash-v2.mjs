import {randomUUID,createPrivateKey,sign,createPublicKey,verify} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {posCommandRegistry,orderProjection} from './pos-commands.mjs';
import {paymentCommandRegistry} from './payment-commands.mjs';
import {enforceCheckoutWhenEnrolled} from './ticket-commands.mjs';
import {calculateLine} from '../../../contracts/pos-math.mjs';
const json=value=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(json).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${json(value[key])}`).join(',')}}`;
const fail=(message,code='OFFLINE_CASH_INVALID',status=400)=>{throw new ApiProblem(status,code,message)};
const has=(actor,name)=>actor.permissions.includes('*')||actor.permissions.includes(name);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const signingKey=()=>{try{const jwk=JSON.parse(process.env.OFFLINE_GRANT_PRIVATE_JWK||'null');if(jwk?.crv!=='P-256'||!jwk.d)throw Error();return createPrivateKey({key:jwk,format:'jwk'});}catch{fail('Offline signing is not configured.','OFFLINE_SIGNING_UNAVAILABLE',503);}};
const issue=async({tx,command,actor,at})=>{
 let cohorts;try{cohorts=JSON.parse(process.env.POS2_OFFLINE_CASH_COHORTS||'[]')}catch{cohorts=[];}
 if(!Array.isArray(cohorts)||!cohorts.some(c=>c.businessId===actor.businessId&&c.staffId===actor.staffId&&c.deviceId===actor.deviceId))fail('This terminal is outside the offline pilot.','OFFLINE_PILOT_DISABLED',403);
 for(const permission of ['pos.sell','order.fire','payment.record'])if(!has(actor,permission))fail('Cashier permissions are required.','PERMISSION_DENIED',403);
 const p=command.payload;
 if(!uuid(p.outletId)||!uuid(p.tillSessionId)||!/^POS[0-9A-Z]{1,12}$/.test(p.deviceLabel)||!Number.isInteger(p.durationMinutes)||p.durationMinutes<30||p.durationMinutes>720)fail('Choose an outlet, open shift, stable terminal label and a 30 to 720 minute validity period.');
 const binding=await tx.client.query('SELECT 1 FROM pos_checkout_terminals WHERE business_id=$1 AND device_id=$2 AND outlet_id=$3',[actor.businessId,actor.deviceId,p.outletId]);if(!binding.rows.length)fail('Enroll this checkout terminal first.','CHECKOUT_REQUIRED',403);
 const till=await tx.client.query("SELECT 1 FROM till_sessions WHERE business_id=$1 AND id=$2 AND device_id=$3 AND operator_id=$4 AND outlet_id=$5 AND status='OPEN' FOR SHARE",[actor.businessId,p.tillSessionId,actor.deviceId,actor.staffId,p.outletId]);if(!till.rows.length)fail('A matching owned open shift is required.','TILL_UNAVAILABLE',409);
 const lease={leaseId:randomUUID(),version:2,businessId:actor.businessId,deviceId:actor.deviceId,staffId:actor.staffId,outletId:p.outletId,tillSessionId:p.tillSessionId,issuedAt:at.toISOString(),expiresAt:new Date(at.getTime()+p.durationMinutes*60000).toISOString(),deviceLabel:p.deviceLabel,permissions:['pos.offlineSale.commitV2','pos.sell','order.fire','payment.record'],keyVersion:process.env.OFFLINE_GRANT_KEY_VERSION||'offline-v2'};
 const signature=sign('sha256',Buffer.from(json(lease)),{key:signingKey(),dsaEncoding:'ieee-p1363'}).toString('base64url'),signed={...lease,signature};
 await tx.client.query('INSERT INTO pos_offline_capabilities(business_id,lease_id,device_id,staff_id,outlet_id,till_session_id,signed_lease,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',[actor.businessId,lease.leaseId,actor.deviceId,actor.staffId,p.outletId,p.tillSessionId,JSON.stringify(signed),at,lease.expiresAt]);
 return {value:signed,records:[]};
};
const finishCapability=async({tx,command,actor,at})=>{
 const p=command.payload;
 if(!uuid(p.tillSessionId)||!Array.isArray(p.saleIds)||p.saleIds.length>10000||p.saleIds.some(id=>!uuid(id))||new Set(p.saleIds).size!==p.saleIds.length)fail('Supply the frozen checkout ledger IDs.');
 const leases=await tx.client.query('SELECT * FROM pos_offline_capabilities WHERE business_id=$1 AND till_session_id=$2 AND device_id=$3 AND staff_id=$4 FOR UPDATE',[actor.businessId,p.tillSessionId,actor.deviceId,actor.staffId]);
 const lease=leases.rows[0];if(!lease)fail('Use the capability issued to this cashier and device.','OFFLINE_CAPABILITY_INVALID',403);
 const evidence=await tx.client.query("SELECT sale_id,status FROM pos_offline_cash_reconciliations WHERE business_id=$1 AND device_id=$2 AND staff_id=$3 AND local_snapshot->>'tillSessionId'=$4",[actor.businessId,actor.deviceId,actor.staffId,lease.till_session_id]);
 if(evidence.rows.length!==p.saleIds.length||evidence.rows.some(row=>row.status!=='SERVER_CONFIRMED'||!p.saleIds.includes(row.sale_id)))fail('Every original locally recorded cash ID must be server confirmed before ending this capability.','OFFLINE_SHIFT_NOT_DRAINED',409);
 await tx.client.query('UPDATE pos_offline_capabilities SET revoked_at=COALESCE(revoked_at,$3) WHERE business_id=$1 AND till_session_id=$2 AND device_id=$4 AND staff_id=$5',[actor.businessId,p.tillSessionId,at,actor.deviceId,actor.staffId]);
 return {value:{tillSessionId:p.tillSessionId,status:'ENDED',confirmedSales:p.saleIds.length},records:[]};
};
const reconciliation=row=>({collection:'offlineCashReconciliations',id:row.sale_id,version:1,archived:false,data:{id:row.sale_id,deviceId:row.device_id,staffId:row.staff_id,reference:row.local_reference,status:row.status,reason:row.reason,orderId:row.server_order_id,documentIds:row.server_document_ids,recordedAt:row.recorded_at.toISOString()}});
export async function offlineCashReconciliationProjections(db,businessId){const {rows}=await db.query('SELECT * FROM pos_offline_cash_reconciliations WHERE business_id=$1 ORDER BY reconciled_at DESC LIMIT 1000',[businessId]);return rows.map(reconciliation);}
const commit=async({tx,command,actor,at})=>{
 const {sale,lease}=command.payload;
 if(Object.keys(command.expectedVersions).length)fail('V2 snapshots must use reconciliation, not legacy optimistic envelopes.');
 if(!sale||!lease||!uuid(sale.id)||command.commandId!==sale.id||!uuid(lease.leaseId)||!Number.isSafeInteger(sale.sequence)||sale.sequence<1||sale.businessId!==actor.businessId||sale.deviceId!==actor.deviceId||sale.staffId!==actor.staffId||sale.currency!=='KES')fail('Sale identity, sequence or currency is invalid.');
 const {rows}=await tx.client.query('SELECT signed_lease,revoked_at FROM pos_offline_capabilities WHERE business_id=$1 AND lease_id=$2 FOR SHARE',[actor.businessId,lease.leaseId]);
 if(!rows.length||rows[0].revoked_at||json(rows[0].signed_lease)!==json(lease)||lease.businessId!==actor.businessId||lease.deviceId!==actor.deviceId||lease.staffId!==actor.staffId||lease.version!==2||lease.outletId!==sale.outletId||lease.tillSessionId!==sale.tillSessionId)fail('The recorded capability is unavailable or belongs to another checkout.','OFFLINE_CAPABILITY_INVALID',403);
 const {signature,...signed}=lease;if(!verify('sha256',Buffer.from(json(signed)),{key:createPublicKey(signingKey()),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')))fail('Capability signature is invalid.','OFFLINE_CAPABILITY_INVALID',403);
 const occurred=Date.parse(sale.occurredAt);if(!Number.isFinite(occurred)||occurred<Date.parse(lease.issuedAt)||occurred>=Date.parse(lease.expiresAt)||occurred>at.getTime()+60000)fail('Sale time is outside the capability validity period.');
 if(typeof sale.reference!=='string'||!sale.reference.startsWith(lease.deviceLabel+'-')||sale.reference.length>80||!sale.input||sale.input.id!==sale.id||sale.input.outletId!==sale.outletId||sale.input.tillSessionId!==sale.tillSessionId||!Array.isArray(sale.lines)||sale.lines.length<1||sale.lines.length>100)fail('Local reference or immutable sale snapshot is invalid.');
 for(const permission of ['pos.sell','order.fire','payment.record'])if(!has(actor,permission))fail('Cash evidence needs manager reconciliation after permission revocation.','PERMISSION_DENIED',403);
 const cashAccount=await tx.client.query("SELECT method FROM payment_accounts WHERE business_id=$1 AND id=$2 AND archived_at IS NULL",[actor.businessId,sale.input.cashAccountId]);if(cashAccount.rows[0]?.method!=='CASH')fail('Offline V2 accepts only physical cash.','OFFLINE_CASH_REQUIRED',403);
 let total=0;for(const line of sale.lines){const computed=calculateLine(line.quantity,line.unitPriceMinor,line.discountBasisPoints,line.comped,line.taxSnapshot);if(Object.keys(computed).some(key=>computed[key]!==line[key]))fail('Local item arithmetic does not match the canonical pricing rules.');total+=computed.lineTotalMinor;}
 if(!Number.isSafeInteger(total)||total<=0||total!==sale.totalMinor||!Number.isSafeInteger(sale.input.cashTenderedMinor)||sale.input.cashTenderedMinor<total||sale.changeMinor!==sale.input.cashTenderedMinor-total)fail('Local cash amounts do not reconcile.');
 await tx.client.query('SAVEPOINT offline_cash_sale');
 let status='SERVER_CONFIRMED',reason=null,orderId=null,documentIds=[],records=[];
 try{
  await enforceCheckoutWhenEnrolled({tx,command:{...command,payload:{outletId:sale.outletId}},actor});
  const baseVersions=sale.input.expectedVersions;if(!baseVersions||typeof baseVersions!=='object'||Array.isArray(baseVersions))fail('Reviewed configuration versions are required.');
  let expected={...baseVersions,['orders:'+sale.id]:0};
  const child=(name,payload)=>({...command,name,payload,expectedVersions:expected});
  await posCommandRegistry.get('order.create').handler({tx,actor,at,command:child('order.create',{id:sale.id,name:sale.reference,outletId:sale.outletId,serviceDestination:sale.input.serviceDestination||'COUNTER'})},{deferEvent:true});
  let order=await orderProjection(tx.client,actor.businessId,sale.id);
  for(const line of sale.lines){
   expected={...baseVersions,['orders:'+sale.id]:order.version};
   await posCommandRegistry.get('order.addItem').handler({tx,actor,at,command:child('order.addItem',{orderId:sale.id,itemId:line.id,productId:line.productId,quantity:line.quantity,portionId:line.portionId,modifierIds:line.modifierIds,note:line.note})},{deferFinish:true});
   order=await orderProjection(tx.client,actor.businessId,sale.id);const stored=order.data.items.find(item=>item.id===line.id);
   if(!stored||stored.unitPriceMinor!==line.unitPriceMinor||stored.productVersion!==line.productVersion||stored.lineTotalMinor!==line.lineTotalMinor||json(stored.taxSnapshot)!==json(line.taxSnapshot))fail('Catalog, option or tax snapshot changed. Review the original cash-received sale.','OFFLINE_SNAPSHOT_CHANGED',409);
  }
  expected={...baseVersions,['orders:'+sale.id]:order.version};
  const fired=await posCommandRegistry.get('order.fire').handler({tx,actor,at,command:child('order.fire',{orderId:sale.id,expectedBalanceVersions:sale.input.expectedBalanceVersions})},{deferEvent:true});
  const consumed=await tx.client.query('SELECT c.stock_item_id,c.location_id,s.base_unit,sum(c.quantity)::text AS quantity FROM pos_stock_consumptions c JOIN stock_items s ON s.business_id=c.business_id AND s.id=c.stock_item_id WHERE c.business_id=$1 AND c.order_id=$2 GROUP BY c.stock_item_id,c.location_id,s.base_unit',[actor.businessId,sale.id]);
  const actual=new Map(consumed.rows.map(row=>[row.stock_item_id+':'+row.location_id+':'+row.base_unit,-BigInt(Number(row.quantity).toFixed(6).replace('.',''))]));
  const claimed=new Map();for(const movement of sale.input.stockMovements||[]){if(!uuid(movement.stockItemId)||!uuid(movement.locationId)||!/^-[0-9]+$/.test(movement.quantityFixed)||typeof movement.unit!=='string')fail('Invalid fixed-point stock evidence.');const key=movement.stockItemId+':'+movement.locationId+':'+movement.unit;claimed.set(key,(claimed.get(key)||0n)+BigInt(movement.quantityFixed));}
  if(actual.size!==claimed.size||[...actual].some(([key,value])=>claimed.get(key)!==value))fail('Provisional stock evidence differs from canonical consumption.','OFFLINE_STOCK_CHANGED',409);
  if(fired.value.order.data.grandTotalMinor!==total)fail('Server order amount differs from the cash-received snapshot.','OFFLINE_AMOUNT_CHANGED',409);
  const tillVersion=await tx.client.query('SELECT version FROM till_sessions WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,sale.tillSessionId]);
  expected={...baseVersions,['orders:'+sale.id]:fired.value.order.version,['tillSessions:'+sale.tillSessionId]:Number(tillVersion.rows[0]?.version)};
  const paid=await paymentCommandRegistry.get('payment.record').handler({tx,actor,at,command:child('payment.record',{orderId:sale.id,tillSessionId:sale.tillSessionId,accountId:sale.input.cashAccountId,amountMinor:total,cashTenderedMinor:sale.input.cashTenderedMinor})});
  orderId=sale.id;documentIds=[...fired.value.documentIds,paid.value.documentId,paid.value.acknowledgementId].filter(Boolean);
  const merged=new Map();for(const record of [...fired.records,...paid.records])merged.set(record.collection+':'+record.id,record);records=[...merged.values()];
 }catch(error){if(!(error instanceof ApiProblem)||error.status!==409)throw error;await tx.client.query('ROLLBACK TO SAVEPOINT offline_cash_sale');status='RECONCILIATION_REQUIRED';reason=error.message;}
 await tx.client.query('RELEASE SAVEPOINT offline_cash_sale');
 const saved=await tx.client.query('INSERT INTO pos_offline_cash_reconciliations(business_id,sale_id,device_id,staff_id,checkout_sequence,local_reference,local_snapshot,status,reason,server_order_id,server_document_ids,source_command_id,recorded_at,reconciled_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13,$14) RETURNING *',[actor.businessId,sale.id,actor.deviceId,actor.staffId,sale.sequence,sale.reference,JSON.stringify(sale),status,reason,orderId,JSON.stringify(documentIds),command.commandId,new Date(occurred),at]);
 const record=reconciliation(saved.rows[0]);return {value:record,records:[...records,record]};
};
export const offlineCashV2Registry=new Map([
 ['pos.offlineCapability.finish',{permission:'pos.sell',offlinePolicy:'ONLINE_ONLY',handler:finishCapability}],
 ['pos.offlineCapability.issue',{permission:'pos.sell',offlinePolicy:'ONLINE_ONLY',handler:issue}],
 ['pos.offlineSale.commitV2',{permission:'pos.sell',offlinePolicy:'ONLINE_ONLY',handler:commit}],
]);
