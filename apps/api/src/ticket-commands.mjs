import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {posCommandRegistry,orderProjection} from './pos-commands.mjs';
import {pos2Capabilities} from './pos2-capabilities.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=(message,code='VALIDATION_FAILED',status=400)=>{throw new ApiProblem(status,code,message)};
const has=(actor,permission)=>actor.permissions.includes('*')||actor.permissions.includes(permission);
const columns='ticket_id AS id,outlet_id AS "outletId",table_id AS "tableId",created_by_staff_id AS "createdByStaffId",source_device_id AS "sourceDeviceId",status,revision,ticket_payload AS payload,created_at AS "createdAt",submitted_at AS "submittedAt",approved_by_staff_id AS "approvedByStaffId",approved_at AS "approvedAt",approval_order_id AS "approvalOrderId",reason,source_command_id AS "sourceCommandId"';
const projection=row=>({collection:'posTickets',id:row.id,version:Number(row.revision),archived:false,data:{...row,revision:Number(row.revision),createdAt:row.createdAt.toISOString(),submittedAt:row.submittedAt.toISOString(),approvedAt:row.approvedAt?.toISOString()??null}});
export async function ticketProjections(db,businessId){const {rows}=await db.query(`SELECT ${columns} FROM pos_ticket_submissions WHERE business_id=$1 ORDER BY submitted_at DESC,ticket_id LIMIT 1000`,[businessId]);return rows.map(projection);}
const load=async(tx,actor,id)=>{if(!uuid(id))fail('Choose a valid ticket.');const {rows}=await tx.client.query(`SELECT ${columns} FROM pos_ticket_submissions WHERE business_id=$1 AND ticket_id=$2 FOR UPDATE`,[actor.businessId,id]);if(!rows[0])fail('This ticket is unavailable.','TICKET_UNAVAILABLE',404);return rows[0];};
const result=async(tx,actor,id,extra=[])=>{const ticket=projection(await load(tx,actor,id));return {value:ticket,records:[ticket,...extra]};};
async function validateProposal(tx,actor,p){
 if(!actor.deviceId||!uuid(p.outletId)||p.tableId&&!uuid(p.tableId)||!Array.isArray(p.lines)||p.lines.length<1||p.lines.length>100)fail('A proposal requires an enrolled source device, outlet and 1 to 100 lines.');
 if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120)fail('Enter a short table or order name.');
 const outlet=await tx.client.query('SELECT 1 FROM business_outlets WHERE business_id=$1 AND id=$2 AND archived_at IS NULL',[actor.businessId,p.outletId]);if(!outlet.rows.length)fail('Choose an active outlet.');
 if(p.tableId){const table=await tx.client.query('SELECT 1 FROM business_floor_tables WHERE business_id=$1 AND id=$2 AND outlet_id=$3 AND archived_at IS NULL',[actor.businessId,p.tableId,p.outletId]);if(!table.rows.length)fail('The table does not belong to this outlet.');}
 const ids=new Set();
 for(const line of p.lines){
  if(!line||!uuid(line.id)||ids.has(line.id)||!uuid(line.productId)||!Number.isFinite(line.quantity)||line.quantity<=0||line.quantity>1000000||!Number.isSafeInteger(line.productVersion)||line.productVersion<1||!Number.isSafeInteger(line.unitPriceMinor)||line.unitPriceMinor<0)fail('Every line requires a unique ID, product/version, positive quantity and reviewed unit price.');
  ids.add(line.id);
  if(line.note!==undefined&&(typeof line.note!=='string'||line.note.length>500)||line.modifierIds!==undefined&&(!Array.isArray(line.modifierIds)||line.modifierIds.some(id=>typeof id!=='string'||!id.trim()||id.length>100)))fail('Invalid preparation notes or modifiers.');
  const product=await tx.client.query('SELECT 1 FROM products p WHERE p.business_id=$1 AND p.id=$2 AND p.archived_at IS NULL AND (NOT EXISTS(SELECT 1 FROM product_outlets o WHERE o.business_id=p.business_id AND o.product_id=p.id) OR EXISTS(SELECT 1 FROM product_outlets o WHERE o.business_id=p.business_id AND o.product_id=p.id AND o.outlet_id=$3))',[actor.businessId,line.productId,p.outletId]);if(!product.rows.length)fail('A proposal product is unavailable in this outlet.');
 }
 return {name:p.name.trim(),lines:p.lines};
}
async function submit({tx,actor,command,at}){
 const p=command.payload;if(!uuid(p.ticketId))fail('A stable ticket ID is required.');
 if(command.expectedVersions[`posTickets:${p.ticketId}`]!==0)fail('A new ticket requires revision zero.');
 const payload=await validateProposal(tx,actor,p);
 const revision=await tx.bumpEntityVersion(actor.businessId,'posTickets',p.ticketId,0);
 await tx.client.query(`INSERT INTO pos_ticket_submissions(business_id,ticket_id,outlet_id,table_id,created_by_staff_id,source_device_id,status,revision,ticket_payload,created_at,submitted_at,source_command_id) VALUES($1,$2,$3,$4,$5,$6,'SUBMITTED',$7,$8::jsonb,$9,$9,$10)`,[actor.businessId,p.ticketId,p.outletId,p.tableId??null,actor.staffId,actor.deviceId,revision,JSON.stringify(payload),at,command.commandId]);return result(tx,actor,p.ticketId);
}
async function pending(tx,actor,command){
 const row=await load(tx,actor,command.payload.ticketId);
 if(!['SUBMITTED','NEEDS_REVIEW'].includes(row.status))fail('This ticket has already been decided.','TICKET_ALREADY_DECIDED',409);
 if(command.expectedVersions[`posTickets:${row.id}`]!==Number(row.revision))fail('The ticket changed. Review the latest revision.','VERSION_CONFLICT',409);return row;
}
async function revise({tx,actor,command,at}){
 const row=await pending(tx,actor,command);
 if(row.createdByStaffId!==actor.staffId&&!has(actor,'ticket.approve'))fail('Only the author or authorized cashier may revise a pending ticket.','PERMISSION_DENIED',403);
 const p={...command.payload,outletId:row.outletId,tableId:row.tableId},payload=await validateProposal(tx,actor,p);
 const revision=await tx.bumpEntityVersion(actor.businessId,'posTickets',row.id,Number(row.revision));
 await tx.client.query("UPDATE pos_ticket_submissions SET ticket_payload=$3::jsonb,revision=$4,status='SUBMITTED',submitted_at=$5,reason=NULL,source_command_id=$6 WHERE business_id=$1 AND ticket_id=$2",[actor.businessId,row.id,JSON.stringify(payload),revision,at,command.commandId]);return result(tx,actor,row.id);
}
async function checkout(tx,actor,outletId){
 const {rows}=await tx.client.query('SELECT device_id FROM pos_checkout_terminals WHERE business_id=$1 AND outlet_id=$2 FOR SHARE',[actor.businessId,outletId]);
 if(!rows[0]||rows[0].device_id!==actor.deviceId)fail('This action requires the enrolled checkout terminal.','CHECKOUT_DEVICE_REQUIRED',403);
}
export async function enforceCheckoutWhenEnrolled({tx,actor,command}){
 // Legacy businesses remain unchanged until explicit checkout enrollment.
 if(!tx.client)return;
 const {rows}=await tx.client.query('SELECT device_id,outlet_id FROM pos_checkout_terminals WHERE business_id=$1 FOR SHARE',[actor.businessId]);
 if(!rows[0])return;
 if(rows[0].device_id!==actor.deviceId)fail('Settlement, till and preparation require the enrolled checkout terminal.','CHECKOUT_DEVICE_REQUIRED',403);
 const p=command.payload;
 if(p.outletId&&p.outletId!==rows[0].outlet_id)fail('This terminal belongs to a different checkout outlet.','CHECKOUT_OUTLET_REQUIRED',403);
 if(p.orderId){const order=await tx.client.query('SELECT outlet_id FROM pos_orders WHERE business_id=$1 AND id=$2',[actor.businessId,p.orderId]);if(order.rows[0]&&order.rows[0].outlet_id!==rows[0].outlet_id)fail('This order belongs to a different checkout outlet.','CHECKOUT_OUTLET_REQUIRED',403);}
}
async function decide({tx,actor,command,at},status){
 const row=await pending(tx,actor,command);
 if(status==='CANCELLED'){if(row.createdByStaffId!==actor.staffId)fail('Only the author can cancel this proposal.','PERMISSION_DENIED',403);}
 else await checkout(tx,actor,row.outletId);
 const reason=command.payload.reason;if(typeof reason!=='string'||reason.trim().length<3||reason.length>500)fail('Enter a reason for the ticket decision.');
 const revision=await tx.bumpEntityVersion(actor.businessId,'posTickets',row.id,Number(row.revision));
 await tx.client.query('UPDATE pos_ticket_submissions SET status=$3,revision=$4,reason=$5,source_command_id=$6 WHERE business_id=$1 AND ticket_id=$2',[actor.businessId,row.id,status,revision,reason.trim(),command.commandId]);return result(tx,actor,row.id);
}
async function approve({tx,actor,command,at}){
 const row=await pending(tx,actor,command);await checkout(tx,actor,row.outletId);
 for(const permission of ['pos.sell','order.fire'])if(!has(actor,permission))fail('Approval requires checkout sales and preparation authority.','PERMISSION_DENIED',403);
 const p=command.payload,proposal=row.payload;
 if(!uuid(p.orderId)||!p.expectedBalanceVersions||typeof p.expectedBalanceVersions!=='object')fail('Approval requires a stable order ID and reviewed inventory revisions.');
 const context=(name,payload,expectedVersions)=>({tx,actor,at,command:{...command,name,payload,expectedVersions}});
 await tx.client.query('SAVEPOINT ticket_approval');
 try{
 const merged=new Map();const keep=handled=>{for(const record of handled.records)merged.set(`${record.collection}:${record.id}`,record);return handled.value;};
 let order=await orderProjection(tx.client,actor.businessId,p.orderId);
  if(order){if(order.data.outletId!==row.outletId||order.data.tableId!==row.tableId)fail('The existing check must belong to the same outlet and table.');if(command.expectedVersions[`orders:${p.orderId}`]!==order.version)fail('Review the existing order revision.','VERSION_CONFLICT',409);}
 else order=keep(await posCommandRegistry.get('order.create').handler(context('order.create',{id:p.orderId,outletId:row.outletId,name:proposal.name,serviceDestination:row.tableId?'TABLE':'COUNTER',...(row.tableId?{tableId:row.tableId}:{})},command.expectedVersions),{deferEvent:true}));
 for(const line of proposal.lines){
  await posCommandRegistry.get('order.addItem').handler(context('order.addItem',{orderId:p.orderId,itemId:line.id,productId:line.productId,quantity:line.quantity,portionId:line.portionId,modifierIds:line.modifierIds,note:line.note},{...command.expectedVersions,[`orders:${p.orderId}`]:order.version}),{deferFinish:true});
  order=await orderProjection(tx.client,actor.businessId,p.orderId);
  const stored=order.data.items.find(item=>item.id===line.id);
  if(stored.productVersion!==line.productVersion||stored.unitPriceMinor!==line.unitPriceMinor){
   fail('Product options or prices changed. Revise the proposal before approval.','TICKET_NEEDS_REVIEW',409);
  }
 }
 const staff=await tx.client.query('SELECT display_name FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[actor.businessId,row.createdByStaffId]);
 const fired=await posCommandRegistry.get('order.fire').handler({...context('order.fire',{orderId:p.orderId,itemIds:proposal.lines.map(line=>line.id),expectedBalanceVersions:p.expectedBalanceVersions},{...command.expectedVersions,[`orders:${p.orderId}`]:order.version}),approvedTicket:{ticketId:row.id,revision:Number(row.revision),waiterName:staff.rows[0]?.display_name||'Waiter'}});keep(fired);
 const revision=await tx.bumpEntityVersion(actor.businessId,'posTickets',row.id,Number(row.revision));
 await tx.client.query("UPDATE pos_ticket_submissions SET status='APPROVED',revision=$3,approved_by_staff_id=$4,approved_at=$5,approval_order_id=$6,source_command_id=$7 WHERE business_id=$1 AND ticket_id=$2",[actor.businessId,row.id,revision,actor.staffId,at,p.orderId,command.commandId]);await tx.client.query('RELEASE SAVEPOINT ticket_approval');return result(tx,actor,row.id,[...merged.values()]);
 }catch(error){
  if(!(error instanceof ApiProblem)||error.status!==409)throw error;
  await tx.client.query('ROLLBACK TO SAVEPOINT ticket_approval');
  const revision=await tx.bumpEntityVersion(actor.businessId,'posTickets',row.id,Number(row.revision));
  await tx.client.query("UPDATE pos_ticket_submissions SET status='NEEDS_REVIEW',revision=$3,reason=$4,source_command_id=$5 WHERE business_id=$1 AND ticket_id=$2",[actor.businessId,row.id,revision,error.message,command.commandId]);
  return result(tx,actor,row.id);
 }
}
async function enroll({tx,actor,command,at}){
 const p=command.payload;if(!uuid(p.outletId)||!uuid(p.deviceId))fail('Choose the checkout outlet and enrolled device.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`pos-checkout:${actor.businessId}`]);
 const device=await tx.client.query('SELECT 1 FROM api_enrolled_devices WHERE business_id=$1 AND id=$2 AND revoked_at IS NULL',[actor.businessId,p.deviceId]);if(!device.rows.length)fail('Choose an active enrolled device.');
 const outlet=await tx.client.query('SELECT 1 FROM business_outlets WHERE business_id=$1 AND id=$2 AND archived_at IS NULL',[actor.businessId,p.outletId]);if(!outlet.rows.length)fail('Choose an active outlet.');
 const existing=await tx.client.query('SELECT device_id,outlet_id FROM pos_checkout_terminals WHERE business_id=$1 FOR UPDATE',[actor.businessId]);
 if(existing.rows[0]&&(existing.rows[0].device_id!==p.deviceId||existing.rows[0].outlet_id!==p.outletId))fail('An existing checkout must be reconciled before a separately approved handoff.','CHECKOUT_HANDOFF_REQUIRED',409);
 await tx.client.query('INSERT INTO pos_checkout_terminals(business_id,outlet_id,device_id,enrolled_by,enrolled_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(business_id) DO NOTHING',[actor.businessId,p.outletId,p.deviceId,actor.staffId,at]);
 return {value:{outletId:p.outletId,deviceId:p.deviceId},records:[]};
}
export const ticketCommandRegistry=new Map([
 ['ticket.submit',{permission:'ticket.create',offlinePolicy:'ONLINE_ONLY',handler:submit}],
 ['ticket.revise',{permission:'ticket.create',permissionAny:['ticket.approve'],offlinePolicy:'ONLINE_ONLY',handler:revise}],
 ['ticket.cancel',{permission:'ticket.create',offlinePolicy:'ONLINE_ONLY',handler:context=>decide(context,'CANCELLED')}],
 ['ticket.reject',{permission:'ticket.reject',offlinePolicy:'ONLINE_ONLY',handler:context=>decide(context,'REJECTED')}],
 ['ticket.approve',{permission:'ticket.approve',offlinePolicy:'ONLINE_ONLY',handler:approve}],
 ['pos.checkoutEnroll',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:enroll}],
]);
for(const [name,definition] of ticketCommandRegistry)ticketCommandRegistry.set(name,{...definition,handler:async context=>{
 if(!pos2Capabilities(context.actor)['pos2.waiterTickets'])fail('Ticket workflows are not enabled for this business, staff and device cohort.','FEATURE_DISABLED',403);
 return definition.handler(context);
}});
