import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {pos2Capabilities} from './pos2-capabilities.mjs';
import {enqueuePush} from './operational-alerts.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const inventoryPermissions=['inventory.view','inventory.receive','inventory.transfer','inventory.waste','inventory.count','inventory.adjust'];
const has=(actor,permission)=>actor.permissions?.includes('*')||actor.permissions?.includes(permission);
const cohorts=()=>{try{const value=JSON.parse(process.env.OPERATIONS_STOCK_ALERT_COHORTS||'[]');return Array.isArray(value)?value.filter(row=>row&&uuid(row.businessId)&&uuid(row.staffId)&&uuid(row.deviceId)):[];}catch{return [];}};
export const stockOperationalAlertCapability=actor=>Boolean(actor?.deviceId&&pos2Capabilities(actor)['operations.inbox']&&cohorts().some(row=>row.businessId===actor.businessId&&row.staffId===actor.staffId&&row.deviceId===actor.deviceId));
export const canReceiveStockOperationalAlerts=actor=>stockOperationalAlertCapability(actor)&&pos2Capabilities(actor)['operations.inbox']&&inventoryPermissions.some(permission=>has(actor,permission));
const fail=(status,code,message)=>{throw new ApiProblem(status,code,message);};
const human=(value,fallback)=>typeof value==='string'&&value.trim()&&!/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)?value.trim():fallback;
const iso=value=>value?new Date(value).toISOString():null;
const quantity=value=>{
 if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,6})?$/.test(value.trim()))fail(400,'VALIDATION_FAILED','Use a non-negative base-unit minimum with at most six decimal places.');
 const [whole,fraction='']=value.trim().split('.');return BigInt(whole)*1_000_000n+BigInt(fraction.padEnd(6,'0'));
};
const quantityText=value=>`${value/1_000_000n}.${String(value%1_000_000n).padStart(6,'0')}`;
const compact=value=>String(value).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
const safeVersion=value=>{const version=Number(value);if(!Number.isSafeInteger(version)||version<0)fail(409,'VERSION_REQUIRES_REVIEW','The source revision cannot be displayed safely. Preserve its evidence for review.');return version;};
const policyColumns=`id,stock_item_id AS "stockItemId",location_id AS "locationId",outlet_id AS "outletId",enabled,minimum_quantity::text AS "minimumQuantity",base_unit AS "baseUnit",version,configured_stock_version AS "configuredStockVersion",configured_location_version AS "configuredLocationVersion",updated_by AS "updatedBy",updated_at AS "updatedAt"`;
const episodeColumns=`id,policy_id AS "policyId",policy_version AS "policyVersion",stock_item_id AS "stockItemId",location_id AS "locationId",outlet_id AS "outletId",stock_name AS "stockName",stock_code AS "stockCode",location_name AS "locationName",base_unit AS "baseUnit",minimum_quantity::text AS "minimumQuantity",status,severity,highest_severity AS "highestSeverity",current_condition AS "currentCondition",opened_quantity::text AS "openedQuantity",opened_balance_version::text AS "openedBalanceVersion",opened_source_command_id AS "openedSourceCommandId",opened_at AS "openedAt",current_quantity::text AS "currentQuantity",current_balance_version::text AS "currentBalanceVersion",current_stock_version::text AS "currentStockVersion",last_source_command_id AS "lastSourceCommandId",last_observed_at AS "lastObservedAt",resolved_source_command_id AS "resolvedSourceCommandId",resolved_at AS "resolvedAt",resolved_quantity::text AS "resolvedQuantity",resolved_balance_version::text AS "resolvedBalanceVersion",version`;
const policyRecord=row=>({collection:'stockAlertPolicies',id:row.id,version:safeVersion(row.version),archived:false,data:{...row,version:safeVersion(row.version),configuredStockVersion:safeVersion(row.configuredStockVersion),configuredLocationVersion:safeVersion(row.configuredLocationVersion),updatedAt:iso(row.updatedAt)}});
const episodeRecord=row=>({collection:'stockAlertEpisodes',id:row.id,version:safeVersion(row.version),archived:false,data:{...row,version:safeVersion(row.version),policyVersion:safeVersion(row.policyVersion),openedAt:iso(row.openedAt),lastObservedAt:iso(row.lastObservedAt),resolvedAt:iso(row.resolvedAt),basis:'SERVER_CONFIRMED_ON_HAND',reservedQuantity:null,availableQuantity:null}});
export async function stockAlertPolicyProjections(db,businessId){const {rows}=await db.query(`SELECT ${policyColumns} FROM stock_operational_alert_policies WHERE business_id=$1 ORDER BY location_id,stock_item_id`,[businessId]);return rows.map(policyRecord);}
export async function stockAlertEpisodeProjections(db,businessId){const {rows}=await db.query(`SELECT ${episodeColumns} FROM stock_operational_alert_episodes WHERE business_id=$1 ORDER BY opened_at DESC,id DESC LIMIT 200`,[businessId]);return rows.map(episodeRecord);}

async function savePolicy({tx,actor,command,at}){
 if(!stockOperationalAlertCapability(actor)||!pos2Capabilities(actor)['operations.inbox'])fail(403,'CAPABILITY_DISABLED','Stock alert policy review is not enabled for this staff and enrolled device.');
 if(!has(actor,'business.configure'))fail(403,'PERMISSION_DENIED','Business configuration permission is required to review location thresholds.');
 const enrolled=await tx.client.query(`SELECT 1 FROM api_enrolled_devices d JOIN api_staff_profiles f ON f.business_id=d.business_id AND f.staff_id=d.staff_id WHERE d.business_id=$1 AND d.id=$2 AND d.staff_id=$3 AND d.revoked_at IS NULL AND f.active AND NOT f.must_change_password FOR SHARE OF d,f`,[actor.businessId,actor.deviceId,actor.staffId]);
 if(!enrolled.rows.length)fail(403,'DEVICE_ENROLLMENT_REQUIRED','Review stock alert settings with an active staff profile and enrolled device.');
 const p=command.payload,reason=typeof p.reason==='string'?p.reason.trim():'';
 if(!uuid(p.id)||!uuid(p.stockItemId)||!uuid(p.locationId)||(p.outletId!==null&&!uuid(p.outletId))||typeof p.enabled!=='boolean'||reason.length<3||reason.length>500)fail(400,'VALIDATION_FAILED','Review a saved stock item, location, optional outlet, explicit minimum and change reason.');
 const minimum=quantityText(quantity(p.minimumQuantity));
 const expected=(collection,id)=>{const version=command.expectedVersions[`${collection}:${id}`];if(!Number.isSafeInteger(version)||version<0)fail(400,'VALIDATION_FAILED','Review the current policy, stock item, location and outlet revisions before saving.');return version;};
 const baseline=expected('stockAlertPolicies',p.id);await tx.lockInventoryCatalog(actor.businessId);
 const stock=(await tx.client.query('SELECT id,name,code,base_unit,version,archived_at FROM stock_items WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.stockItemId])).rows[0];
 const location=(await tx.client.query('SELECT id,name,version,archived_at FROM stock_locations WHERE business_id=$1 AND id=$2 FOR SHARE',[actor.businessId,p.locationId])).rows[0];
 if(!stock||stock.archived_at||!location||location.archived_at)fail(409,'STOCK_POLICY_SOURCE_CHANGED','Choose active stock and location records before reviewing their alert policy.');
 if(safeVersion(stock.version)!==expected('stockItems',p.stockItemId)||safeVersion(location.version)!==expected('stockLocations',p.locationId))fail(409,'VERSION_CONFLICT','The stock item or location changed. Review its current base units and minimum.');
 if(p.outletId){const outlet=(await tx.client.query('SELECT default_stock_location_id,version,archived_at FROM business_outlets WHERE business_id=$1 AND id=$2 FOR SHARE',[actor.businessId,p.outletId])).rows[0];if(!outlet||outlet.archived_at||outlet.default_stock_location_id!==p.locationId||safeVersion(outlet.version)!==expected('outlets',p.outletId))fail(409,'STOCK_POLICY_OUTLET_CHANGED','The reviewed outlet must use this location as its current default stock location.');}
 const {rows}=await tx.client.query(`SELECT ${policyColumns} FROM stock_operational_alert_policies WHERE business_id=$1 AND (id=$2 OR (stock_item_id=$3 AND location_id=$4)) FOR UPDATE`,[actor.businessId,p.id,p.stockItemId,p.locationId]);const before=rows[0];
 if(rows.length>1||before&&(before.id!==p.id||before.stockItemId!==p.stockItemId||before.locationId!==p.locationId))fail(409,'POLICY_IDENTITY_CHANGED','Reuse the original policy for this stock item and location. Its identity cannot be reassigned.');
 if(safeVersion(before?.version??0)!==baseline)fail(409,'VERSION_CONFLICT','This location alert policy changed. Review the latest settings.');
 const version=await tx.bumpEntityVersion(actor.businessId,'stockAlertPolicies',p.id,baseline);
 await tx.client.query(`INSERT INTO stock_operational_alert_policies(business_id,id,stock_item_id,location_id,outlet_id,enabled,minimum_quantity,base_unit,version,configured_stock_version,configured_location_version,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(business_id,id) DO UPDATE SET outlet_id=EXCLUDED.outlet_id,enabled=EXCLUDED.enabled,minimum_quantity=EXCLUDED.minimum_quantity,base_unit=EXCLUDED.base_unit,version=EXCLUDED.version,configured_stock_version=EXCLUDED.configured_stock_version,configured_location_version=EXCLUDED.configured_location_version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,p.id,p.stockItemId,p.locationId,p.outletId,p.enabled,minimum,stock.base_unit,version,stock.version,location.version,actor.staffId,at]);
 const after=(await tx.client.query(`SELECT ${policyColumns} FROM stock_operational_alert_policies WHERE business_id=$1 AND id=$2`,[actor.businessId,p.id])).rows[0];
 await tx.client.query('INSERT INTO stock_operational_alert_policy_events(business_id,source_command_id,policy_id,before_policy,after_policy,reason,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)',[actor.businessId,command.commandId,p.id,before?JSON.stringify(before):null,JSON.stringify(after),reason,actor.staffId,actor.deviceId,at]);
 const record=policyRecord(after);return {value:{policy:record.data,existingAlertsRemainUntilCanonicalReplenishment:true},records:[record]};
}
export const stockOperationalAlertCommandRegistry=new Map([['stockAlertPolicy.save',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:savePolicy}]]);

async function enrolledRecipients(db,businessId){
 const {rows}=await db.query(`SELECT d.staff_id AS "staffId",d.id AS "deviceId",d.business_id AS "businessId",ARRAY(SELECT permission FROM api_staff_permissions p WHERE p.business_id=d.business_id AND p.staff_id=d.staff_id) AS permissions FROM api_enrolled_devices d JOIN api_staff_profiles f ON f.business_id=d.business_id AND f.staff_id=d.staff_id AND f.active AND NOT f.must_change_password WHERE d.business_id=$1 AND d.revoked_at IS NULL ORDER BY d.staff_id,d.id`,[businessId]);
 const recipients=new Map();for(const actor of rows)if(canReceiveStockOperationalAlerts(actor)&&!recipients.has(actor.staffId))recipients.set(actor.staffId,actor);return [...recipients.values()];
}
const transitionEvidence=(row,movement)=>({basis:'SERVER_CONFIRMED_ON_HAND',stockItemId:row.stock_item_id,locationId:row.location_id,baseUnit:row.base_unit,quantity:row.quantity,balanceVersion:String(row.balance_version),stockVersion:String(row.stock_version),movementIds:movement?.movementIds||[],positiveCanonicalMovement:movement?.positiveChange===true,reservedQuantity:null,availableQuantity:null});
async function transitionEvent(context,episode,row,kind,movement,recipients){
 const {tx,actor,command,at}=context;
 const existing=await tx.client.query('SELECT 1 FROM stock_operational_alert_transitions WHERE business_id=$1 AND episode_id=$2 AND kind=$3',[actor.businessId,episode.id,kind]);if(existing.rows.length)return;
 const eventId=randomUUID(),label=kind==='OUT'?'Out of stock':'Low stock';
 const name=human(episode.stockName,'Stock item').slice(0,65),code=human(episode.stockCode,'').slice(0,24),place=human(episode.locationName,'Stock location').slice(0,45),unit=human(episode.baseUnit,'base units').slice(0,20);
 const summary=`${label}: ${name}${code?` (${code})`:''} / ${place}: ${compact(row.quantity)} ${unit}; minimum ${compact(episode.minimumQuantity)} ${unit}. Server-confirmed on hand.`.slice(0,240);
 await tx.client.query(`INSERT INTO operational_events(business_id,id,command_id,kind,target_type,target_id,outlet_id,summary,created_at) VALUES($1,$2,$3,$4,'stock',$5,$6,$7,$8)`,[actor.businessId,eventId,command.commandId,kind==='OUT'?'stock.out':'stock.low',episode.id,episode.outletId,summary,at]);
 for(const recipient of recipients)await tx.client.query('INSERT INTO operational_inbox(business_id,event_id,staff_id,device_id) VALUES($1,$2,$3,$4)',[actor.businessId,eventId,recipient.staffId,recipient.deviceId]);
 await tx.client.query('INSERT INTO stock_operational_alert_transitions(business_id,episode_id,kind,source_command_id,event_id,quantity,balance_version,movement_ids,evidence,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)',[actor.businessId,episode.id,kind,command.commandId,eventId,row.quantity,row.balance_version,movement?.movementIds||[],JSON.stringify(transitionEvidence(row,movement)),at]);
 await enqueuePush(tx.client,actor.businessId,eventId);
}

/** Run after the canonical handler, inside its existing transaction and inventory lock. */
export async function captureStockOperationalAlerts(context,handled){
 const {tx,actor,command,at}=context,records=handled.records||[];
 if(!tx.client||command.name!=='stockAlertPolicy.save'&&!records.some(row=>row.collection==='stockItems'||row.collection==='stockMovements'))return handled;
 await tx.lockInventoryCatalog(actor.businessId);
 const movements=await tx.client.query(`SELECT stock_item_id AS "stockItemId",location_id AS "locationId",array_agg(id ORDER BY id) AS "movementIds",sum(quantity_delta)>0 AS "positiveChange" FROM inventory_movements WHERE business_id=$1 AND source_command_id=$2 GROUP BY stock_item_id,location_id ORDER BY stock_item_id,location_id`,[actor.businessId,command.commandId]);
 const byPair=new Map(movements.rows.map(row=>[`${row.stockItemId}:${row.locationId}`,row]));
 const stockIds=[...new Set([...movements.rows.map(row=>row.stockItemId),...records.filter(row=>row.collection==='stockItems').map(row=>row.id)])];
 const policyId=command.name==='stockAlertPolicy.save'?command.payload.id:null;
 if(!stockIds.length&&!policyId)return handled;
 const pairs=await tx.client.query(`SELECT p.id AS policy_id,p.version AS policy_version,p.enabled,p.minimum_quantity::text AS policy_minimum,p.base_unit AS policy_base_unit,p.outlet_id,
  s.id AS stock_item_id,s.name AS stock_name,s.code AS stock_code,s.base_unit,s.version AS stock_version,s.archived_at AS stock_archived,
  l.id AS location_id,l.name AS location_name,l.archived_at AS location_archived,
  b.quantity::text,b.version AS balance_version,
  (p.outlet_id IS NULL OR (o.archived_at IS NULL AND o.id IS NOT NULL AND o.default_stock_location_id=p.location_id)) AS outlet_matches
  FROM stock_operational_alert_policies p JOIN stock_items s ON s.business_id=p.business_id AND s.id=p.stock_item_id JOIN stock_locations l ON l.business_id=p.business_id AND l.id=p.location_id
  LEFT JOIN inventory_location_balances b ON b.business_id=p.business_id AND b.stock_item_id=p.stock_item_id AND b.location_id=p.location_id
  LEFT JOIN business_outlets o ON o.business_id=p.business_id AND o.id=p.outlet_id
  WHERE p.business_id=$1 AND (p.stock_item_id=ANY($2::uuid[]) OR p.id=$3) AND (p.enabled OR EXISTS(SELECT 1 FROM stock_operational_alert_episodes e WHERE e.business_id=p.business_id AND e.stock_item_id=p.stock_item_id AND e.location_id=p.location_id AND e.status='OPEN')) ORDER BY p.stock_item_id,p.location_id`,[actor.businessId,stockIds,policyId]);
 const projected=[];let recipients=null;
 for(const row of pairs.rows){
  const movement=byPair.get(`${row.stock_item_id}:${row.location_id}`),explicitReview=policyId===row.policy_id;
  const found=await tx.client.query(`SELECT ${episodeColumns} FROM stock_operational_alert_episodes WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3 AND status='OPEN' FOR UPDATE`,[actor.businessId,row.stock_item_id,row.location_id]);let episode=found.rows[0];
  // Missing balance evidence is not an inferred zero. Policy changes never resolve an episode.
  if(row.quantity===null||row.balance_version===null)continue;
  const amount=quantity(row.quantity);
  if(episode){
   if(episode.lastSourceCommandId===command.commandId)continue;
   const unitMatches=episode.baseUnit===row.base_unit;
   const threshold=quantity(episode.minimumQuantity),newerBalance=BigInt(row.balance_version)>BigInt(episode.currentBalanceVersion);
   const recovered=unitMatches&&movement?.positiveChange===true&&newerBalance&&amount>threshold&&amount>quantity(episode.currentQuantity);
   const condition=!unitMatches?'EVIDENCE_REQUIRED':amount===0n?'OUT':amount<=threshold?'LOW':'ABOVE_THRESHOLD';
   const severity=condition==='OUT'?'OUT':condition==='LOW'?'LOW':episode.severity,highest=condition==='OUT'?'OUT':episode.highestSeverity;
   const version=await tx.bumpEntityVersion(actor.businessId,'stockAlertEpisodes',episode.id,safeVersion(episode.version));
   await tx.client.query(`UPDATE stock_operational_alert_episodes SET status=$3,severity=$4,highest_severity=$5,current_condition=$6,current_quantity=$7,current_balance_version=$8,current_stock_version=$9,last_source_command_id=$10,last_observed_at=$11,version=$12,
    resolved_source_command_id=CASE WHEN $3='RESOLVED' THEN $10 ELSE resolved_source_command_id END,resolved_at=CASE WHEN $3='RESOLVED' THEN $11 ELSE resolved_at END,resolved_quantity=CASE WHEN $3='RESOLVED' THEN $7 ELSE resolved_quantity END,resolved_balance_version=CASE WHEN $3='RESOLVED' THEN $8 ELSE resolved_balance_version END WHERE business_id=$1 AND id=$2`,[actor.businessId,episode.id,recovered?'RESOLVED':'OPEN',severity,highest,condition,row.quantity,row.balance_version,row.stock_version,command.commandId,at,version]);
   if(recovered){
    await tx.client.query(`INSERT INTO stock_operational_alert_transitions(business_id,episode_id,kind,source_command_id,quantity,balance_version,movement_ids,evidence,occurred_at) VALUES($1,$2,'RESOLVED',$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT DO NOTHING`,[actor.businessId,episode.id,command.commandId,row.quantity,row.balance_version,movement.movementIds,JSON.stringify(transitionEvidence(row,movement)),at]);
    await tx.client.query("UPDATE operational_events SET resolved_at=$3 WHERE business_id=$1 AND target_type='stock' AND target_id=$2 AND resolved_at IS NULL",[actor.businessId,episode.id,at]);
    await tx.client.query("UPDATE operational_push_deliveries d SET status='CANCELLED' FROM operational_events e WHERE e.business_id=$1 AND e.target_type='stock' AND e.target_id=$2 AND d.business_id=e.business_id AND d.event_id=e.id AND d.status='QUEUED'",[actor.businessId,episode.id]);
   }else if(condition==='OUT'&&row.enabled&&row.outlet_matches&&!row.stock_archived&&!row.location_archived&&movement){
    recipients??=await enrolledRecipients(tx.client,actor.businessId);
    // Observing zero while creation is disabled must not consume the eventual
    // OUT notification. Its durable transition, not highest observed severity,
    // is the dedupe evidence when the authorized cohort is available again.
    if(recipients.length)await transitionEvent(context,episode,row,'OUT',movement,recipients);
   }
  }else{
   if(!row.enabled||!row.outlet_matches||row.stock_archived||row.location_archived||row.base_unit!==row.policy_base_unit||!movement&&!explicitReview||amount>quantity(row.policy_minimum))continue;
   recipients??=await enrolledRecipients(tx.client,actor.businessId);if(!recipients.length)continue;
   const id=randomUUID(),severity=amount===0n?'OUT':'LOW',version=await tx.bumpEntityVersion(actor.businessId,'stockAlertEpisodes',id,0);
   await tx.client.query(`INSERT INTO stock_operational_alert_episodes(business_id,id,policy_id,policy_version,stock_item_id,location_id,outlet_id,stock_name,stock_code,location_name,base_unit,minimum_quantity,status,severity,highest_severity,current_condition,opened_quantity,opened_balance_version,opened_source_command_id,opened_at,current_quantity,current_balance_version,current_stock_version,last_source_command_id,last_observed_at,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'OPEN',$13,$13,$13,$14,$15,$16,$17,$14,$15,$18,$16,$17,$19)`,[actor.businessId,id,row.policy_id,row.policy_version,row.stock_item_id,row.location_id,row.outlet_id,row.stock_name,row.stock_code,row.location_name,row.base_unit,row.policy_minimum,severity,row.quantity,row.balance_version,command.commandId,at,row.stock_version,version]);
   episode={id,outletId:row.outlet_id,stockName:row.stock_name,stockCode:row.stock_code,locationName:row.location_name,baseUnit:row.base_unit,minimumQuantity:row.policy_minimum};
   await transitionEvent(context,episode,row,severity,movement,recipients);
  }
  const current=(await tx.client.query(`SELECT ${episodeColumns} FROM stock_operational_alert_episodes WHERE business_id=$1 AND id=$2`,[actor.businessId,episode.id])).rows[0];if(current)projected.push(episodeRecord(current));
 }
 return projected.length?{...handled,records:[...records,...projected]}:handled;
}

async function evidenceSnapshot(db,actor,id){
 if(!uuid(id))fail(400,'VALIDATION_FAILED','Choose a stock alert.');
 if(!canReceiveStockOperationalAlerts(actor))fail(403,'PERMISSION_DENIED','This enrolled staff and device cannot read stock alerts.');
 const permission=await db.query(`SELECT 1 FROM operational_events e JOIN operational_inbox i ON i.business_id=e.business_id AND i.event_id=e.id JOIN api_enrolled_devices d ON d.business_id=i.business_id AND d.id=i.device_id AND d.staff_id=i.staff_id AND d.revoked_at IS NULL JOIN api_staff_profiles f ON f.business_id=d.business_id AND f.staff_id=d.staff_id AND f.active AND NOT f.must_change_password WHERE e.business_id=$1 AND e.target_type='stock' AND e.target_id=$2 AND i.staff_id=$3 AND i.device_id=$4 LIMIT 1`,[actor.businessId,id,actor.staffId,actor.deviceId]);
 if(!permission.rows.length)fail(404,'RESOURCE_NOT_FOUND','This stock alert is not routed to the current enrolled staff and device.');
 const row=(await db.query(`SELECT ${episodeColumns} FROM stock_operational_alert_episodes WHERE business_id=$1 AND id=$2`,[actor.businessId,id])).rows[0];if(!row)fail(404,'RESOURCE_NOT_FOUND','The original stock alert evidence is unavailable.');
 const current=(await db.query(`SELECT b.quantity::text,b.version::text AS "balanceVersion",s.base_unit AS "baseUnit",s.name AS "stockName",s.code AS "stockCode",l.name AS "locationName",s.archived_at IS NOT NULL OR l.archived_at IS NOT NULL AS archived FROM stock_items s JOIN stock_locations l ON l.business_id=s.business_id AND l.id=$3 LEFT JOIN inventory_location_balances b ON b.business_id=s.business_id AND b.stock_item_id=s.id AND b.location_id=l.id WHERE s.business_id=$1 AND s.id=$2`,[actor.businessId,row.stockItemId,row.locationId])).rows[0];
 const {rows:events}=await db.query(`SELECT e.id,e.kind,e.created_at AS "createdAt",e.resolved_at AS "resolvedAt",i.read_at AS "readAt" FROM operational_events e JOIN operational_inbox i ON i.business_id=e.business_id AND i.event_id=e.id WHERE e.business_id=$1 AND e.target_type='stock' AND e.target_id=$2 AND i.staff_id=$3 AND i.device_id=$4 ORDER BY e.created_at,e.id`,[actor.businessId,id,actor.staffId,actor.deviceId]);
 const {rows:transitions}=await db.query(`SELECT kind,source_command_id AS "sourceCommandId",event_id AS "eventId",quantity::text,balance_version::text AS "balanceVersion",movement_ids AS "movementIds",evidence,occurred_at AS "occurredAt" FROM stock_operational_alert_transitions WHERE business_id=$1 AND episode_id=$2 ORDER BY occurred_at,kind`,[actor.businessId,id]);
 return {episode:episodeRecord(row).data,canonical:{basis:'SERVER_CONFIRMED_ON_HAND',quantity:current?.quantity??null,balanceVersion:current?.balanceVersion??null,baseUnit:current?.baseUnit??null,stockName:human(current?.stockName,'Stock item'),stockCode:human(current?.stockCode,''),locationName:human(current?.locationName,'Stock location'),archived:current?.archived??null,unitMatches:current?.baseUnit===row.baseUnit,reservedQuantity:null,availableQuantity:null},events:events.map(event=>({...event,createdAt:iso(event.createdAt),resolvedAt:iso(event.resolvedAt),readAt:iso(event.readAt)})),transitions:transitions.map(transition=>({...transition,occurredAt:iso(transition.occurredAt)})),generatedAt:new Date().toISOString()};
}

/** The episode, current canonical balance and movement evidence share one snapshot. */
export async function stockOperationalAlertEvidence(pool,actor,id){
 if(!uuid(id))fail(400,'VALIDATION_FAILED','Choose a stock alert.');
 if(!canReceiveStockOperationalAlerts(actor))fail(403,'PERMISSION_DENIED','This enrolled staff and device cannot read stock alerts.');
 const db=await pool.connect();
 try{await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await evidenceSnapshot(db,actor,id);await db.query('COMMIT');return result;}
 catch(error){await db.query('ROLLBACK');throw error;}
 finally{db.release();}
}
