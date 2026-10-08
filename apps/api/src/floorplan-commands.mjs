import {ApiProblem} from './command-kernel.mjs';
import {randomUUID} from 'node:crypto';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const problem=(status,code,message)=>{throw new ApiProblem(status,code,message)};
const fail=message=>problem(400,'VALIDATION_FAILED',message);
const permission=(actor,name)=>{if(!actor.permissions?.includes('*')&&!actor.permissions?.includes(name))problem(403,'PERMISSION_DENIED',`The ${name} permission is required.`)};
const advisory=async(tx,key)=>tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
const safeText=(value,min,max,label)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\u0000-\u001f\u007f]/u.test(value))fail(`${label} must contain ${min} to ${max} plain-text characters.`);return value.trim()};
const expected=(command,id)=>{const version=command.expectedVersions[`tables:${id}`];if(!Number.isSafeInteger(version)||version<0)fail('Review the current table version before saving.');return version};
const tableRow=(row,{currentOrderId=null,state=row.state}={})=>({collection:'tables',id:row.id,version:Number(row.version),archived:row.archivedAt!==null,data:{propertyId:row.businessId,outletId:row.outletId,label:row.label,capacity:Number(row.capacity),section:row.section,state,shape:row.shape,posX:Number(row.posX),posY:Number(row.posY),minimumSpend:Number(row.minimumSpendMinor)/100,isJoinable:row.isJoinable,assignedServerId:row.assignedServerId,assignedServerName:row.assignedServerName,currentOrderId}});
const readTable=async(db,businessId,id,lock=false)=>{
 const {rows}=await db.query(`SELECT t.business_id AS "businessId",t.id,t.outlet_id AS "outletId",t.label,t.capacity,t.section,t.state,t.shape,t.pos_x AS "posX",t.pos_y AS "posY",t.minimum_spend_minor AS "minimumSpendMinor",t.is_joinable AS "isJoinable",t.assigned_server_id AS "assignedServerId",t.assigned_server_name AS "assignedServerName",t.version,t.archived_at AS "archivedAt",t.created_at AS "createdAt",t.updated_at AS "updatedAt",active.id AS "currentOrderId" FROM business_floor_tables t LEFT JOIN LATERAL (SELECT o.id FROM pos_orders o WHERE o.business_id=t.business_id AND o.service_destination='TABLE' AND o.service_reference->>'tableId'=t.id::text AND o.state IN ('OPEN','FIRED') ORDER BY o.created_at,o.id LIMIT 1) active ON true WHERE t.business_id=$1 AND t.id=$2 ${lock?'FOR UPDATE OF t':''}`,[businessId,id]);
 return rows[0]??null;
};

export async function floorplanProjections(db,businessId){
 const {rows}=await db.query(`SELECT t.business_id AS "businessId",t.id,t.outlet_id AS "outletId",t.label,t.capacity,t.section,t.state,t.shape,t.pos_x AS "posX",t.pos_y AS "posY",t.minimum_spend_minor AS "minimumSpendMinor",t.is_joinable AS "isJoinable",t.assigned_server_id AS "assignedServerId",t.assigned_server_name AS "assignedServerName",t.version,t.archived_at AS "archivedAt",t.created_at AS "createdAt",t.updated_at AS "updatedAt",NULL::uuid AS "currentOrderId" FROM business_floor_tables t WHERE t.business_id=$1 ORDER BY lower(t.label),t.id`,[businessId]);
 return rows.map(tableRow);
}

const save=async({tx,command,actor,at})=>{
 permission(actor,'floorplan.manage');
 const {outletId,baseline,tables}=command.payload;
 if(!uuid(outletId)||!Array.isArray(baseline)||baseline.length>500||!Array.isArray(tables)||tables.length>500)fail('Choose an outlet and provide a floorplan of at most 500 tables.');
 await advisory(tx,`floorplan:${actor.businessId}:${outletId}`);
 const outlet=await tx.client.query('SELECT id FROM business_outlets WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',[actor.businessId,outletId]);
 if(!outlet.rows.length)problem(409,'RESOURCE_CONFLICT','The selected outlet is no longer active.');
 const current=await tx.client.query(`SELECT t.id,t.version,t.state,t.label,t.capacity,t.section,t.shape,t.pos_x AS "posX",t.pos_y AS "posY",t.minimum_spend_minor AS "minimumSpendMinor",t.is_joinable AS "isJoinable",t.assigned_server_id AS "assignedServerId",active.id AS "currentOrderId" FROM business_floor_tables t LEFT JOIN LATERAL (SELECT o.id FROM pos_orders o WHERE o.business_id=t.business_id AND o.service_destination='TABLE' AND o.service_reference->>'tableId'=t.id::text AND o.state IN ('OPEN','FIRED') ORDER BY o.created_at,o.id LIMIT 1) active ON true WHERE t.business_id=$1 AND t.outlet_id=$2 AND t.archived_at IS NULL ORDER BY t.id FOR UPDATE OF t`,[actor.businessId,outletId]);
 const baselineMap=new Map();
 for(const item of baseline){if(!item||!uuid(item.id)||!Number.isSafeInteger(item.version)||item.version<1||baselineMap.has(item.id))fail('The reviewed floorplan baseline is invalid.');baselineMap.set(item.id,item.version)}
 if(current.rows.length!==baselineMap.size||current.rows.some(row=>baselineMap.get(row.id)!==Number(row.version)))problem(409,'VERSION_CONFLICT','Another operator changed this floorplan. Reload it before saving.');
 const currentById=new Map(current.rows.map(row=>[row.id,row]));
 const seen=new Set(),normalized=[];
 for(const item of tables){
  if(!item||!uuid(item.id)||seen.has(item.id))fail('Each table needs a unique valid identity.');seen.add(item.id);
  const label=safeText(item.label,1,80,'Table label'),section=safeText(item.section,1,60,'Table section');
  const capacity=Number(item.capacity),posX=Number(item.posX),posY=Number(item.posY),minimumSpend=Number(item.minimumSpend),minimumSpendMinor=Math.round(minimumSpend*100);
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>1000||!Number.isFinite(posX)||posX<0||posX>100||!Number.isFinite(posY)||posY<0||posY>100||!Number.isFinite(minimumSpend)||minimumSpend<0||!Number.isSafeInteger(minimumSpendMinor)||minimumSpendMinor>Number.MAX_SAFE_INTEGER)fail('Table capacity, position or minimum spend is outside the supported range.');
  const shape=item.shape??'SQUARE';if(!['SQUARE','RECTANGLE','ROUND','BAR_TOP'].includes(shape))fail('Choose a supported table shape.');
  if(typeof item.isJoinable!=='boolean')fail('Table joinability must be explicit.');
  const assignedServerId=item.assignedServerId||null;if(assignedServerId!==null&&!uuid(assignedServerId))fail('Choose a valid assigned server.');
  normalized.push({id:item.id,label,section,capacity,posX,posY,minimumSpendMinor,shape,isJoinable:item.isJoinable,assignedServerId});
 }
 const names=normalized.map(item=>item.label.toLocaleLowerCase());if(names.some((name,index)=>names.indexOf(name)!==index))fail('Table labels must be unique within the outlet.');
 for(const item of normalized)if(item.assignedServerId){const staff=await tx.client.query('SELECT display_name FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2 AND active FOR SHARE',[actor.businessId,item.assignedServerId]);if(!staff.rows.length)problem(409,'RESOURCE_CONFLICT','An assigned server is no longer active.');item.assignedServerName=staff.rows[0].display_name}else item.assignedServerName='Unassigned';
 const removed=[...currentById.keys()].filter(id=>!seen.has(id));
 if(removed.length){const busy=await tx.client.query(`SELECT service_reference->>'tableId' AS id FROM pos_orders WHERE business_id=$1 AND service_destination='TABLE' AND state IN ('OPEN','FIRED') AND service_reference->>'tableId'=ANY($2::text[]) FOR UPDATE`,[actor.businessId,removed]);if(busy.rows.length)problem(409,'TABLE_HAS_ACTIVE_ORDER','Transfer, complete or void the active table order before removing its table.')}
 for(const item of normalized){
  const old=currentById.get(item.id);
  if(!old){if(baselineMap.has(item.id))problem(409,'VERSION_CONFLICT','A table changed while this layout was being reviewed.');const version=await tx.bumpEntityVersion(actor.businessId,'tables',item.id,0);await tx.client.query(`INSERT INTO business_floor_tables(business_id,id,outlet_id,label,capacity,section,state,shape,pos_x,pos_y,minimum_spend_minor,is_joinable,assigned_server_id,assigned_server_name,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'AVAILABLE',$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,[actor.businessId,item.id,outletId,item.label,item.capacity,item.section,item.shape,item.posX,item.posY,item.minimumSpendMinor,item.isJoinable,item.assignedServerId,item.assignedServerName,version,at]);continue}
  if(Number(old.version)!==baselineMap.get(item.id))problem(409,'VERSION_CONFLICT','A table changed while this layout was being reviewed.');
  if(old.currentOrderId&&(old.label!==item.label||Number(old.capacity)!==item.capacity||old.section!==item.section||old.shape!==item.shape||Number(old.posX)!==item.posX||Number(old.posY)!==item.posY||Number(old.minimumSpendMinor)!==item.minimumSpendMinor||Boolean(old.isJoinable)!==item.isJoinable||old.assignedServerId!==item.assignedServerId))problem(409,'TABLE_HAS_ACTIVE_ORDER','Table layout settings are locked while an active order owns the table.');
  const version=await tx.bumpEntityVersion(actor.businessId,'tables',item.id,Number(old.version));
  await tx.client.query(`UPDATE business_floor_tables SET label=$4,capacity=$5,section=$6,shape=$7,pos_x=$8,pos_y=$9,minimum_spend_minor=$10,is_joinable=$11,assigned_server_id=$12,assigned_server_name=$13,version=$14,updated_at=$15 WHERE business_id=$1 AND outlet_id=$2 AND id=$3`,[actor.businessId,outletId,item.id,item.label,item.capacity,item.section,item.shape,item.posX,item.posY,item.minimumSpendMinor,item.isJoinable,item.assignedServerId,item.assignedServerName,version,at]);
 }
 for(const id of removed){const old=currentById.get(id),version=await tx.bumpEntityVersion(actor.businessId,'tables',id,Number(old.version));await tx.client.query('UPDATE business_floor_tables SET archived_at=$4,version=$5,updated_at=$4 WHERE business_id=$1 AND outlet_id=$2 AND id=$3',[actor.businessId,outletId,id,at,version]);}
 const records=(await floorplanProjections(tx.client,actor.businessId)).filter(record=>record.data.outletId===outletId&&[...seen,...removed].includes(record.id));
 return {value:{outletId,tableCount:normalized.length},records};
};

const ready=async({tx,command,actor,at})=>{
 permission(actor,'pos.manage_table');
 const {tableId}=command.payload;if(!uuid(tableId))fail('Choose a valid cleaning table.');
 const baseline=command.expectedVersions[`tables:${tableId}`];if(!Number.isSafeInteger(baseline)||baseline<1)fail('Review the current table version before marking it ready.');
 const table=await readTable(tx.client,actor.businessId,tableId,true);if(!table||table.archivedAt)problem(409,'RESOURCE_CONFLICT','The selected table is no longer active.');
 if(Number(table.version)!==baseline)problem(409,'VERSION_CONFLICT','The table changed. Review its current state.');
 if(table.currentOrderId)problem(409,'TABLE_HAS_ACTIVE_ORDER','An active order still owns this table.');
 if(table.state!=='CLEANING')problem(409,'TABLE_NOT_CLEANING','Only a table in cleaning can be marked ready.');
 const version=await tx.bumpEntityVersion(actor.businessId,'tables',tableId,baseline);
 await tx.client.query(`UPDATE business_floor_tables SET state='AVAILABLE',version=$3,updated_at=$4 WHERE business_id=$1 AND id=$2`,[actor.businessId,tableId,version,at]);
 return {value:{tableId,state:'AVAILABLE'},records:[tableRow(await readTable(tx.client,actor.businessId,tableId))]};
};

export const floorplanCommandRegistry=new Map([
 ['floorplan.save',{permission:'floorplan.manage',offlinePolicy:'ONLINE_ONLY',handler:save}],
 ['table.ready',{permission:'pos.manage_table',offlinePolicy:'ONLINE_ONLY',handler:ready}],
]);
