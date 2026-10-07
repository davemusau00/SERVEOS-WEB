import {randomUUID,scrypt as scryptCallback,randomBytes} from 'node:crypto';
import {promisify} from 'node:util';
import {ApiProblem} from './command-kernel.mjs';

const scrypt=promisify(scryptCallback);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const all=['business.view','business.configure','business.tax.configure','catalog.view','catalog.manage','inventory.view','inventory.count','inventory.adjust','devices.register','devices.manage','records.view','staff.view','staff.create','staff.update','staff.deactivate','staff.reset_pin','staff.change_role','pos.sell','pos.open_tab','order.fire','order.void','order.discount','order.comp','payment.record','payment.split','payment.reverse','order.refund','payments.view','till.view','till.open','till.close','till.cashMovement','till.override_variance','procurement.view','procurement.manage','procurement.receive','procurement.pay','procurement.over_receive','customers.manage','credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off','credit.override_limit','accounting.view','reports.view','audit.view','kds.view','kds.update','rooms.view','rooms.manage','rooms.operate','rooms.guests.view','folio.view','folio.manage','folio.reverse','folio.room_charge','assets.view','assets.manage','assets.operate','maintenance.view','maintenance.manage','system.configure','data.import.view','data.import.stage','data.import.execute','backup.create','backup.restore','help.view'];
const rolePermissions={
 Manager:all.filter(p=>!['business.configure','business.tax.configure','staff.change_role','staff.deactivate','staff.create','data.import.execute','backup.restore','system.configure','devices.manage','order.discount','order.comp','order.void','payment.reverse','till.override_variance','procurement.over_receive','credit.write_off','credit.override_limit'].includes(p)),
 Cashier:['business.view','staff.view','pos.sell','pos.open_tab','order.fire','payment.record','payment.split','till.open','till.close','till.cashMovement','credit.view','credit.charge','catalog.view','inventory.view','procurement.view','procurement.receive','kds.view','kds.update','help.view','records.view','devices.register'],
 Server:['business.view','staff.view','pos.sell','pos.open_tab','order.fire','payment.record','credit.view','credit.charge','catalog.view','kds.view','kds.update','help.view','records.view','devices.register'],
 Chef:['business.view','kds.view','kds.update','help.view','records.view','devices.register'],
 Housekeeper:['business.view','rooms.view','rooms.operate','help.view','records.view','devices.register'],
 Accountant:['business.view','accounting.view','reports.view','payments.view','audit.view','credit.view','credit.settle','credit.reconcile','credit.write_off','procurement.view','procurement.pay','help.view','records.view','devices.register'],
 Custom:['business.view','records.view','help.view','devices.register'],
};
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const cleanText=(value,min,max,label)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\u0000-\u001f\u007f]/u.test(value))fail(`${label} must contain ${min} to ${max} plain-text characters.`);return value.trim()};
const requirePermission=(actor,p)=>{if(!actor.permissions.includes('*')&&!actor.permissions.includes(p))throw new ApiProblem(403,'PERMISSION_DENIED',`Staff ${p.split('.').at(-1)} permission is required.`)};
const credentialHash=async password=>{const salt=randomBytes(16),derived=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`};
const assignedPermissions=(role,extras,actor)=>{
 if(role==='Admin')throw new ApiProblem(403,'ADMIN_ROLE_RESERVED','The Admin role is reserved for initial setup and cannot be assigned here.');
 const base=rolePermissions[role];if(!base)fail('Choose a supported staff role.');
 const additions=extras??[];if(!Array.isArray(additions)||additions.length>all.length||additions.some(p=>typeof p!=='string'||!all.includes(p)))fail('Custom permissions contain an unsupported grant.');
 const effective=[...new Set([...base,...additions,'devices.register','records.view'])].sort();
 if(role!=='Custom'&&additions.some(p=>!base.includes(p)))throw new ApiProblem(403,'PERMISSION_CEILING','This role cannot be granted permissions outside its template.');
 if(!actor.permissions.includes('*')&&effective.some(p=>!actor.permissions.includes(p)))throw new ApiProblem(403,'PERMISSION_CEILING','You cannot grant permissions that your own account does not have.');
 return effective;
};
const projection=(row,permissions,version)=>({collection:'employees',id:row.staffId,version,archived:!row.active,data:{staffId:row.staffId,name:row.displayName,loginName:row.loginName,role:row.role,active:row.active,permissions,createdAt:row.createdAt?.toISOString?.()??row.createdAt,updatedAt:row.updatedAt?.toISOString?.()??row.updatedAt}});
async function staffRecord(db,businessId,staffId,lock=false){const result=await db.query(`SELECT staff_id AS "staffId",login_name AS "loginName",display_name AS "displayName",role,active,created_at AS "createdAt",updated_at AS "updatedAt" FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2${lock?' FOR UPDATE':''}`,[businessId,staffId]);if(!result.rows.length)return null;const perms=await db.query('SELECT permission FROM api_staff_permissions WHERE business_id=$1 AND staff_id=$2 ORDER BY permission',[businessId,staffId]);const versions=await db.query("SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type='employees' AND entity_id=$2",[businessId,staffId]);return projection(result.rows[0],perms.rows.map(row=>row.permission),Number(versions.rows[0]?.version??1));}
export async function staffProjections(db,businessId){const {rows}=await db.query('SELECT staff_id AS "staffId" FROM api_staff_profiles WHERE business_id=$1 ORDER BY lower(display_name),staff_id',[businessId]);const records=[];for(const row of rows)records.push(await staffRecord(db,businessId,row.staffId));return records;}

const create=async({tx,command,actor,at})=>{
 requirePermission(actor,'staff.create');const p=command.payload;if(!uuid(p.id)||p.staffId!==undefined&&p.staffId!==p.id)fail('Use a new stable staff UUID.');
 const loginName=cleanText(p.loginName,3,120,'Login name'),displayName=cleanText(p.displayName,1,160,'Staff name'),role=cleanText(p.role,1,40,'Role');
 if(typeof p.initialPassword!=='string'||p.initialPassword.length<12||p.initialPassword.length>1024)fail('Set an initial password of at least 12 characters.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>300)fail('Enter a staff-creation reason.');
 const expected=command.expectedVersions[`employees:${p.id}`];if(expected!==0)fail('A new staff profile must be reviewed at version zero.');
 const permissions=assignedPermissions(role,p.permissions,actor),hash=await credentialHash(p.initialPassword);
 await tx.bumpEntityVersion(actor.businessId,'employees',p.id,0);
 await tx.client.query(`INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,true,$7,$7)`,[actor.businessId,p.id,loginName,displayName,role,hash,at]);
 for(const permission of permissions)await tx.client.query('INSERT INTO api_staff_permissions(business_id,staff_id,permission) VALUES($1,$2,$3)',[actor.businessId,p.id,permission]);
 const value=await staffRecord(tx.client,actor.businessId,p.id),reason=p.reason.trim();
 await tx.client.query(`INSERT INTO api_staff_events(business_id,id,staff_id,staff_version,event_type,before_state,after_state,reason,command_id,actor_staff_id,occurred_at) VALUES($1,$2,$3,$4,'CREATED',NULL,$5::jsonb,$6,$7,$8,$9)`,[actor.businessId,randomUUID(),p.id,value.version,JSON.stringify(value.data),reason,command.commandId,actor.staffId,at]);
 return {value,records:[value]};
};
const update=async({tx,command,actor,at})=>{
 requirePermission(actor,'staff.update');const p=command.payload;if(!uuid(p.staffId)||p.id!==p.staffId)fail('Choose a staff profile.');
 const expected=command.expectedVersions[`employees:${p.staffId}`];if(!Number.isSafeInteger(expected)||expected<1)fail('Review the current staff profile revision.');
 const prior=await staffRecord(tx.client,actor.businessId,p.staffId,true);if(!prior||prior.archived)throw new ApiProblem(409,'STAFF_UNAVAILABLE','This staff profile is no longer active.');
 const name=cleanText(p.displayName,1,160,'Staff name'),role=cleanText(p.role,1,40,'Role');
 if(role!==prior.data.role)requirePermission(actor,'staff.change_role');
 if(prior.data.role==='Admin'&&role!=='Admin'){const count=await tx.client.query("SELECT count(*)::int AS count FROM api_staff_profiles WHERE business_id=$1 AND role='Admin' AND active AND staff_id<>$2",[actor.businessId,p.staffId]);if(count.rows[0].count===0)throw new ApiProblem(409,'LAST_ADMIN','Keep at least one active Admin account.');}
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>300)fail('Enter a staff-change reason.');
 const permissions=role==='Admin'&&prior.data.role==='Admin'?['*']:assignedPermissions(role,p.permissions,actor);const next=await tx.bumpEntityVersion(actor.businessId,'employees',p.staffId,expected);
 await tx.client.query('UPDATE api_staff_profiles SET display_name=$3,role=$4,updated_at=$5 WHERE business_id=$1 AND staff_id=$2',[actor.businessId,p.staffId,name,role,at]);
 await tx.client.query('DELETE FROM api_staff_permissions WHERE business_id=$1 AND staff_id=$2',[actor.businessId,p.staffId]);for(const permission of permissions)await tx.client.query('INSERT INTO api_staff_permissions(business_id,staff_id,permission) VALUES($1,$2,$3)',[actor.businessId,p.staffId,permission]);
 const value=await staffRecord(tx.client,actor.businessId,p.staffId),reason=p.reason.trim();
 await tx.client.query(`INSERT INTO api_staff_events(business_id,id,staff_id,staff_version,event_type,before_state,after_state,reason,command_id,actor_staff_id,occurred_at) VALUES($1,$2,$3,$4,'UPDATED',$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),p.staffId,next,JSON.stringify(prior.data),JSON.stringify(value.data),reason,command.commandId,actor.staffId,at]);
 return {value,records:[value]};
};
const deactivate=async({tx,command,actor,at})=>{
 requirePermission(actor,'staff.deactivate');const p=command.payload;if(!uuid(p.staffId)||p.id!==p.staffId||p.staffId===actor.staffId)fail('Choose a different staff profile to deactivate.');
 const expected=command.expectedVersions[`employees:${p.staffId}`];if(!Number.isSafeInteger(expected)||expected<1)fail('Review the current staff profile revision.');
 const prior=await staffRecord(tx.client,actor.businessId,p.staffId,true);if(!prior||prior.archived)throw new ApiProblem(409,'STAFF_UNAVAILABLE','This staff profile is already inactive or unavailable.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>300)fail('Enter a deactivation reason.');
 if(prior.data.role==='Admin'){const count=await tx.client.query("SELECT count(*)::int AS count FROM api_staff_profiles WHERE business_id=$1 AND role='Admin' AND active AND staff_id<>$2",[actor.businessId,p.staffId]);if(count.rows[0].count===0)throw new ApiProblem(409,'LAST_ADMIN','Keep at least one active Admin account.');}
 const version=await tx.bumpEntityVersion(actor.businessId,'employees',p.staffId,expected);await tx.client.query('UPDATE api_staff_profiles SET active=false,updated_at=$3 WHERE business_id=$1 AND staff_id=$2',[actor.businessId,p.staffId,at]);
 await tx.client.query('UPDATE api_staff_sessions SET revoked_at=$3 WHERE business_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[actor.businessId,p.staffId,at]);await tx.client.query('UPDATE api_enrolled_devices SET revoked_at=$3 WHERE business_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[actor.businessId,p.staffId,at]);
 const value={...prior,id:p.staffId,version,archived:true,data:{...prior.data,active:false,updatedAt:at.toISOString()}},reason=p.reason.trim();
 await tx.client.query(`INSERT INTO api_staff_events(business_id,id,staff_id,staff_version,event_type,before_state,after_state,reason,command_id,actor_staff_id,occurred_at) VALUES($1,$2,$3,$4,'DEACTIVATED',$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),p.staffId,version,JSON.stringify(prior.data),JSON.stringify(value.data),reason,command.commandId,actor.staffId,at]);
 return {value,records:[value]};
};
export const staffCommandRegistry=new Map([['staff.create',{permission:'staff.create',offlinePolicy:'ONLINE_ONLY',handler:create}],['staff.update',{permission:'staff.update',offlinePolicy:'ONLINE_ONLY',handler:update}],['staff.deactivate',{permission:'staff.deactivate',offlinePolicy:'ONLINE_ONLY',handler:deactivate}]]);
