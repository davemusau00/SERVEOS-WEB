import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {pos2Capabilities} from './pos2-capabilities.mjs';
import {assertUniqueExternalPaymentReference} from './external-payment-references.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const has=(a,p)=>a.permissions.includes('*')||a.permissions.includes(p);
const requireFlag=(a,key)=>{if(!pos2Capabilities(a)[key])throw new ApiProblem(403,'CAPABILITY_DISABLED','This operational feature is not enabled for this session.');};
export const alertKinds=new Set(['ticket.submit','ticket.revise','ticket.approve','ticket.reject','ticket.cancel','order.kds','order.fire','pos.offlineSale.commitV2','pos.offlineCash.resolve','print.report','print.confirm','payment.record','payment.split','mpesaReference.submit','mpesaReference.review']);
async function activeActors(db,businessId){const {rows}=await db.query(`SELECT d.staff_id AS "staffId",d.id AS "deviceId",d.business_id AS "businessId",f.display_name AS "displayName",ARRAY(SELECT permission FROM api_staff_permissions p WHERE p.business_id=d.business_id AND p.staff_id=d.staff_id) AS permissions FROM api_enrolled_devices d JOIN api_staff_profiles f ON f.business_id=d.business_id AND f.staff_id=d.staff_id AND f.active AND NOT f.must_change_password WHERE d.business_id=$1 AND d.revoked_at IS NULL`,[businessId]);return rows;}
export async function addOperationalEvent({tx,actor,command,at},handled){
 if(command.name==='order.kds'&&command.payload.status!=='READY')return;
 if(!tx.client||!alertKinds.has(command.name)||!pos2Capabilities(actor)['operations.inbox'])return;
 const cash=handled.records.find(r=>r.collection==='offlineCashReconciliations');
 const print=handled.records.find(r=>r.collection==='printJobs');
 if(print&&!['DELIVERY_UNCERTAIN','FAILED','CONFIRMED'].includes(print.data.state))return;
 const ticket=handled.records.find(r=>r.collection==='posTickets');
 const order=handled.records.find(r=>r.collection==='orders');
 let row=ticket?.data;
 if(!row&&command.payload.orderId){const q=await tx.client.query('SELECT ticket_id AS id,created_by_staff_id AS "createdByStaffId",outlet_id AS "outletId",ticket_payload AS payload,approval_order_id AS "approvalOrderId" FROM pos_ticket_submissions WHERE business_id=$1 AND approval_order_id=$2 ORDER BY approved_at DESC LIMIT 1',[actor.businessId,command.payload.orderId]);row=q.rows[0];}
 const claim=handled.value?.submission;
 if(claim&&!row){const q=await tx.client.query('SELECT ticket_id AS id,created_by_staff_id AS "createdByStaffId",outlet_id AS "outletId",ticket_payload AS payload,approval_order_id AS "approvalOrderId" FROM pos_ticket_submissions WHERE business_id=$1 AND ticket_id=$2',[actor.businessId,claim.ticketId]);row=q.rows[0];}
 const targetId=cash?.id||print?.id||claim?.id||ticket?.id||order?.id||command.payload.orderId;if(!uuid(targetId))return;
 const targetType=cash?'cashRecovery':print?'print':claim?'reference':ticket?'ticket':'order';
 const outletId=row?.outletId||order?.data.outletId;
 const title=cash?.data.reference||row?.payload?.name||order?.data.name||(print?'Document':'Order');
 const labels={'ticket.submit':'New ticket','ticket.revise':'Ticket updated','ticket.approve':'Ticket approved','ticket.reject':'Ticket rejected','ticket.cancel':'Ticket cancelled','order.kds':'Preparation ready','payment.record':'Payment recorded by server','payment.split':'Payment recorded by server','mpesaReference.submit':'M-Pesa reference awaiting verification','mpesaReference.review':'M-Pesa reference reviewed'};
 const sender=await tx.client.query('SELECT display_name FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[actor.businessId,actor.staffId]);
 const label=cash?(cash.data.status==='RECONCILIATION_REQUIRED'?'Cash needs reconciliation':'Cash confirmed by server'):print?(print.data.state==='CONFIRMED'?'Print confirmed by operator':'Print delivery needs attention'):command.name==='order.fire'?'Preparation requested':command.name==='ticket.approve'&&row?.status==='NEEDS_REVIEW'?'Ticket needs changes':labels[command.name];
 const summary=`${label}: ${title} / ${sender.rows[0]?.display_name||'Staff'}`.slice(0,240);
 // Updating/deciding the task cancels older escalations. Reading never does.
 if(cash||print)await tx.client.query('UPDATE operational_events SET resolved_at=$3 WHERE business_id=$1 AND target_id=$2 AND resolved_at IS NULL',[actor.businessId,targetId,at]);
 if(row?.id&&command.name.startsWith('ticket.'))await tx.client.query(`UPDATE operational_events SET resolved_at=$3 WHERE business_id=$1 AND target_id=$2 AND resolved_at IS NULL`,[actor.businessId,row.id,at]);
 if(claim&&command.name==='mpesaReference.review')await tx.client.query('UPDATE operational_events SET resolved_at=$3 WHERE business_id=$1 AND target_id=$2',[actor.businessId,claim.id,at]);
 if(command.name.startsWith('payment.'))await tx.client.query(`UPDATE mpesa_reference_submissions m SET status='PAID' WHERE m.business_id=$1 AND m.order_id=$2 AND m.status='VERIFIED' AND EXISTS(SELECT 1 FROM order_payments p WHERE p.business_id=m.business_id AND p.order_id=m.order_id AND p.normalized_reference=m.code AND p.amount_minor=m.amount_minor)`,[actor.businessId,command.payload.orderId]);
 if(command.name.startsWith('payment.'))await tx.client.query(`UPDATE operational_events e SET resolved_at=$3 FROM mpesa_reference_submissions m WHERE e.business_id=$1 AND m.business_id=e.business_id AND m.id=e.target_id AND m.order_id=$2 AND m.status='PAID'`,[actor.businessId,command.payload.orderId,at]);
 const {rows:terminals}=await tx.client.query('SELECT device_id FROM pos_checkout_terminals WHERE business_id=$1 AND outlet_id=$2',[actor.businessId,outletId]);
 const authors=new Set([row?.createdByStaffId]);
 if(order?.id){const q=await tx.client.query('SELECT created_by_staff_id FROM pos_ticket_submissions WHERE business_id=$1 AND approval_order_id=$2',[actor.businessId,order.id]);q.rows.forEach(r=>authors.add(r.created_by_staff_id));}
 const actors=await activeActors(tx.client,actor.businessId),recipients=new Map();
 for(const a of actors){if(!pos2Capabilities(a)['operations.inbox'])continue;
  const cashier=a.deviceId===terminals[0]?.device_id&&has(a,'ticket.approve');
  const author=authors.has(a.staffId)&&has(a,'ticket.create');
  const prep=has(a,'kds.view')&&((command.name==='ticket.approve'&&row?.status==='APPROVED')||command.name==='order.fire');
  const operator=a.staffId===actor.staffId&&(cash||print);
  const manager=cash?.data.status==='RECONCILIATION_REQUIRED'&&has(a,'till.override_variance');
  if(cashier||author||prep||operator||manager)recipients.set(a.staffId,{staffId:a.staffId,deviceId:cashier?a.deviceId:null});
 }
 if(!recipients.size)return;
 const eventId=randomUUID();
 await tx.client.query(`INSERT INTO operational_events(business_id,id,command_id,kind,target_type,target_id,outlet_id,summary,created_at,resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[actor.businessId,eventId,command.commandId,command.name,targetType,targetId,outletId??null,summary,at,cash?.data.status==='RECONCILIATION_REQUIRED'||print&&print.data.state!=='CONFIRMED'||['ticket.submit','ticket.revise','mpesaReference.submit'].includes(command.name)?null:at]);
 for(const r of recipients.values())await tx.client.query('INSERT INTO operational_inbox(business_id,event_id,staff_id,device_id) VALUES($1,$2,$3,$4)',[actor.businessId,eventId,r.staffId,r.deviceId]);
 await enqueuePush(tx.client,actor.businessId,eventId);
}
export async function enqueuePush(db,businessId,eventId){await db.query(`INSERT INTO operational_push_deliveries(business_id,event_id,subscription_id) SELECT i.business_id,i.event_id,s.id FROM operational_inbox i JOIN operational_push_subscriptions s ON s.business_id=i.business_id AND s.staff_id=i.staff_id AND (i.device_id IS NULL OR i.device_id=s.device_id) AND s.revoked_at IS NULL WHERE i.business_id=$1 AND i.event_id=$2 ON CONFLICT DO NOTHING`,[businessId,eventId]);}
async function referenceSubmit({tx,actor,command,at}){
 requireFlag(actor,'operations.references');const p=command.payload;
 if(!uuid(p.id)||!uuid(p.ticketId)||typeof p.code!=='string'||!/^[A-Z0-9]{8,20}$/.test(p.code.trim().toUpperCase())||!Number.isSafeInteger(p.amountMinor)||p.amountMinor<=0||typeof p.receivedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(p.receivedAt)||!Number.isFinite(Date.parse(p.receivedAt))||Date.parse(p.receivedAt)>at.getTime()+300000||typeof (p.note??'')!=='string'||(p.note??'').length>500)throw new ApiProblem(400,'VALIDATION_FAILED','Enter an actual transaction code, amount, received time and approved ticket.');
 const {rows}=await tx.client.query('SELECT * FROM pos_ticket_submissions WHERE business_id=$1 AND ticket_id=$2 FOR UPDATE',[actor.businessId,p.ticketId]);const t=rows[0];
 if(!t||t.created_by_staff_id!==actor.staffId||t.status!=='APPROVED'||!t.approval_order_id)throw new ApiProblem(403,'TICKET_OWNER_REQUIRED','Only the ticket author may forward a reference for an approved ticket.');
 const code=p.code.trim().toUpperCase();await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`reference-claim:${actor.businessId}:${code}`]);
 let duplicate=false;try{await assertUniqueExternalPaymentReference(tx,actor.businessId,'MPESA',code);}catch(e){if(e.code!=='PAYMENT_REFERENCE_DUPLICATE')throw e;duplicate=true;}
 const other=await tx.client.query('SELECT 1 FROM mpesa_reference_submissions WHERE business_id=$1 AND code=$2 LIMIT 1',[actor.businessId,code]);duplicate||=Boolean(other.rows.length);
 await tx.client.query(`INSERT INTO mpesa_reference_submissions(business_id,id,order_id,ticket_id,outlet_id,submitted_by,code,amount_minor,received_at,note,status,duplicate,version,source_command_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SUBMITTED',$11,1,$12,$13)`,[actor.businessId,p.id,t.approval_order_id,p.ticketId,t.outlet_id,actor.staffId,code,p.amountMinor,p.receivedAt,p.note??'',duplicate,command.commandId,at]);
 return {value:{submission:{id:p.id,ticketId:p.ticketId,status:'SUBMITTED',duplicate}},records:[]};
}
async function referenceReview({tx,actor,command,at}){
 requireFlag(actor,'operations.references');if(!has(actor,'payment.record'))throw new ApiProblem(403,'PERMISSION_DENIED','Checkout payment authority is required.');const p=command.payload;
 if(!uuid(p.id)||!['VERIFIED','REJECTED'].includes(p.status)||typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.length>500)throw new ApiProblem(400,'VALIDATION_FAILED','Record the verification evidence or rejection reason.');
 const {rows}=await tx.client.query('SELECT * FROM mpesa_reference_submissions WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.id]);const r=rows[0];
 const terminal=await tx.client.query('SELECT 1 FROM pos_checkout_terminals WHERE business_id=$1 AND outlet_id=$2 AND device_id=$3',[actor.businessId,r?.outlet_id,actor.deviceId]);
 if(!r||!terminal.rows.length)throw new ApiProblem(403,'CHECKOUT_DEVICE_REQUIRED','Review references on the enrolled checkout terminal.');
 if(r.status!=='SUBMITTED'||Number(r.version)!==p.version)throw new ApiProblem(409,'REFERENCE_CHANGED','This reference changed. Refresh its current state.');
 if(p.status==='VERIFIED'){if(p.manuallyConfirmed!==true)throw new ApiProblem(400,'VERIFICATION_REQUIRED','Verify actual merchant receipt before confirming.');await assertUniqueExternalPaymentReference(tx,actor.businessId,'MPESA',r.code);
 const other=await tx.client.query("SELECT 1 FROM mpesa_reference_submissions WHERE business_id=$1 AND code=$2 AND id<>$3 AND status IN ('VERIFIED','PAID')",[actor.businessId,r.code,p.id]);if(other.rows.length)throw new ApiProblem(409,'REFERENCE_ALREADY_VERIFIED','Another claim uses this verified reference.');}
 await tx.client.query('UPDATE mpesa_reference_submissions SET status=$3,version=version+1,reviewed_by=$4,reviewed_at=$5,reason=$6 WHERE business_id=$1 AND id=$2',[actor.businessId,p.id,p.status,actor.staffId,at,p.reason.trim()]);
 await tx.client.query('INSERT INTO mpesa_reference_reviews VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.businessId,p.id,command.commandId,actor.staffId,p.status,p.reason.trim(),at]);
 return {value:{submission:{id:p.id,ticketId:r.ticket_id,status:p.status}},records:[]};
}
export const operationalCommandRegistry=new Map([
 ['mpesaReference.submit',{permission:'ticket.create',offlinePolicy:'ONLINE_ONLY',handler:referenceSubmit}],
 ['mpesaReference.review',{permission:'mpesa.record',offlinePolicy:'ONLINE_ONLY',handler:referenceReview}],
]);
export async function operationalInbox(db,actor){
 requireFlag(actor,'operations.inbox');
 if(!['ticket.create','ticket.approve','till.override_variance','kds.view','pos.sell'].some(p=>has(actor,p)))throw new ApiProblem(403,'PERMISSION_DENIED','Your current role cannot read this operational inbox.');
 const {rows}=await db.query(`SELECT e.id,e.kind,e.target_type AS "targetType",e.target_id AS "targetId",e.summary,e.created_at AS "createdAt",e.resolved_at AS "resolvedAt",i.read_at AS "readAt" FROM operational_inbox i JOIN operational_events e ON e.business_id=i.business_id AND e.id=i.event_id WHERE i.business_id=$1 AND i.staff_id=$2 AND (i.device_id IS NULL OR i.device_id=$3) AND (($4 AND i.device_id IS NOT NULL) OR ($5 AND i.device_id IS NULL)) AND (i.device_id IS NULL OR EXISTS(SELECT 1 FROM pos_checkout_terminals t WHERE t.business_id=i.business_id AND t.device_id=$3 AND t.outlet_id=e.outlet_id)) ORDER BY e.created_at DESC,e.id DESC LIMIT 200`,[actor.businessId,actor.staffId,actor.deviceId,has(actor,'ticket.approve'),has(actor,'ticket.create')||has(actor,'till.override_variance')||has(actor,'kds.view')||has(actor,'pos.sell')]);
 const refs=pos2Capabilities(actor)['operations.references']?await db.query(`SELECT m.id,m.ticket_id AS "ticketId",m.order_id AS "orderId",m.code,m.amount_minor AS "amountMinor",m.received_at AS "receivedAt",m.note,m.status,m.duplicate,m.version,m.reason,f.display_name AS "submittedBy",t.ticket_payload->>'name' AS "orderLabel" FROM mpesa_reference_submissions m JOIN pos_ticket_submissions t ON t.business_id=m.business_id AND t.ticket_id=m.ticket_id JOIN api_staff_profiles f ON f.business_id=m.business_id AND f.staff_id=m.submitted_by WHERE m.business_id=$1 AND (m.submitted_by=$2 OR ($4 AND EXISTS(SELECT 1 FROM pos_checkout_terminals c WHERE c.business_id=m.business_id AND c.outlet_id=m.outlet_id AND c.device_id=$3))) ORDER BY m.created_at DESC LIMIT 200`,[actor.businessId,actor.staffId,actor.deviceId,has(actor,'mpesa.record')]):{rows:[]};
 return {items:rows,references:refs.rows,publicKey:pos2Capabilities(actor)['operations.push']?process.env.WEB_PUSH_PUBLIC_KEY??null:null};
}
export async function operationalRoute(db,actor,method,path,input){
 requireFlag(actor,'operations.inbox');
 if(method==='GET'&&path==='/v1/operations/inbox')return operationalInbox(db,actor);
 if(method==='POST'&&path==='/v1/operations/read'){
 if(!uuid(input.id))throw new ApiProblem(400,'VALIDATION_FAILED','Choose an alert.');await db.query('UPDATE operational_inbox SET read_at=COALESCE(read_at,now()) WHERE business_id=$1 AND staff_id=$2 AND event_id=$3 AND (device_id IS NULL OR device_id=$4)',[actor.businessId,actor.staffId,input.id,actor.deviceId]);return {read:true};}
 if(path==='/v1/operations/push'&&method==='DELETE'){await db.query('UPDATE operational_push_subscriptions SET revoked_at=now() WHERE business_id=$1 AND staff_id=$2 AND device_id=$3',[actor.businessId,actor.staffId,actor.deviceId]);return {removed:true};}
 if(path==='/v1/operations/push'&&method==='POST'){
 requireFlag(actor,'operations.push');const s=input.subscription;validatePushSubscription(s);
 await db.query(`INSERT INTO operational_push_subscriptions(id,business_id,staff_id,device_id,session_id,endpoint,subscription) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(endpoint) DO UPDATE SET subscription=EXCLUDED.subscription,session_id=EXCLUDED.session_id,revoked_at=NULL WHERE operational_push_subscriptions.business_id=EXCLUDED.business_id AND operational_push_subscriptions.staff_id=EXCLUDED.staff_id AND operational_push_subscriptions.device_id=EXCLUDED.device_id`,[randomUUID(),actor.businessId,actor.staffId,actor.deviceId,actor.sessionId,s.endpoint,JSON.stringify(s)]);return {registered:true};}
 throw new ApiProblem(404,'NOT_FOUND','Operational route unavailable.');
}
export function validatePushSubscription(s){
 const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];let url;try{url=new URL(s?.endpoint);}catch{}
 if(!url||url.protocol!=='https:'||url.port&&url.port!=='443'||url.username||url.password||!(hosts.includes(url.hostname)||url.hostname.endsWith('.notify.windows.com'))||s.endpoint.length>2048||!s.keys||!['p256dh','auth'].every(k=>typeof s.keys[k]==='string'&&/^[A-Za-z0-9_-]{16,150}$/.test(s.keys[k])))throw new ApiProblem(400,'INVALID_PUSH_SUBSCRIPTION','This browser push subscription is unsupported.');
}
