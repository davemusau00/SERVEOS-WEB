import {randomUUID,scrypt as scryptCallback,randomBytes} from 'node:crypto';
import {promisify} from 'node:util';
import {ApiProblem} from './command-kernel.mjs';
import {deviceProjections} from './device-commands.mjs';
import permissionContract from '../../../contracts/permissions.json' with {type:'json'};
import roleContract from '../../../contracts/roles.json' with {type:'json'};

const scrypt=promisify(scryptCallback);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const all=permissionContract.staffAssignable;
const rolePermissions=Object.fromEntries(Object.entries(roleContract.roles).flatMap(([role,definition])=>{
 if(role==='Admin')return [];
 if(definition.mode==='explicit')return [[role,definition.permissions||[]]];
 if(definition.mode==='allExcept')return [[role,all.filter(permission=>!(definition.permissions||[]).includes(permission))]];
 if(definition.mode==='all')return [[role,all]];
 throw new Error(`Unsupported staff role permission mode: ${role}`);
}));
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const cleanText=(value,min,max,label)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\u0000-\u001f\u007f]/u.test(value))fail(`${label} must contain ${min} to ${max} plain-text characters.`);return value.trim()};
const requirePermission=(actor,p)=>{if(!actor.permissions.includes('*')&&!actor.permissions.includes(p))throw new ApiProblem(403,'PERMISSION_DENIED',`Staff ${p.split('.').at(-1)} permission is required.`)};
const lockStaffAdministration=async(tx,businessId)=>tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`staff-administration:${businessId}`]);
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
 // Serialize changes across Admin rows so concurrent demotions cannot both pass the last-Admin check.
 await lockStaffAdministration(tx,actor.businessId);
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
 // Use the same per-business lock as staff.update before reading the Admin set.
 await lockStaffAdministration(tx,actor.businessId);
 const prior=await staffRecord(tx.client,actor.businessId,p.staffId,true);if(!prior||prior.archived)throw new ApiProblem(409,'STAFF_UNAVAILABLE','This staff profile is already inactive or unavailable.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>300)fail('Enter a deactivation reason.');
 if(prior.data.role==='Admin'){const count=await tx.client.query("SELECT count(*)::int AS count FROM api_staff_profiles WHERE business_id=$1 AND role='Admin' AND active AND staff_id<>$2",[actor.businessId,p.staffId]);if(count.rows[0].count===0)throw new ApiProblem(409,'LAST_ADMIN','Keep at least one active Admin account.');}
 const version=await tx.bumpEntityVersion(actor.businessId,'employees',p.staffId,expected);await tx.client.query('UPDATE api_staff_profiles SET active=false,updated_at=$3 WHERE business_id=$1 AND staff_id=$2',[actor.businessId,p.staffId,at]);
 const devices=await tx.client.query('SELECT id FROM api_enrolled_devices WHERE business_id=$1 AND staff_id=$2 AND revoked_at IS NULL FOR UPDATE',[actor.businessId,p.staffId]);
  const deviceVersions=new Map();for(const device of devices.rows){const current=await tx.client.query("SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type='enrolledDevices' AND entity_id=$2",[actor.businessId,device.id]);deviceVersions.set(device.id,await tx.bumpEntityVersion(actor.businessId,'enrolledDevices',device.id,Number(current.rows[0]?.version??1)));}
 await tx.client.query('UPDATE api_staff_sessions SET revoked_at=$3 WHERE business_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[actor.businessId,p.staffId,at]);await tx.client.query('UPDATE api_refresh_families SET revoked_at=$3 WHERE business_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[actor.businessId,p.staffId,at]);await tx.client.query('UPDATE api_enrolled_devices SET revoked_at=$3 WHERE business_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[actor.businessId,p.staffId,at]);
 const value={...prior,id:p.staffId,version,archived:true,data:{...prior.data,active:false,updatedAt:at.toISOString()}},reason=p.reason.trim();
 await tx.client.query(`INSERT INTO api_staff_events(business_id,id,staff_id,staff_version,event_type,before_state,after_state,reason,command_id,actor_staff_id,occurred_at) VALUES($1,$2,$3,$4,'DEACTIVATED',$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),p.staffId,version,JSON.stringify(prior.data),JSON.stringify(value.data),reason,command.commandId,actor.staffId,at]);
  const deviceRecords=(await deviceProjections(tx.client,actor.businessId)).filter(device=>devices.rows.some(row=>row.id===device.id));
  for(const deviceRecord of deviceRecords){const version=deviceVersions.get(deviceRecord.id);await tx.client.query(`INSERT INTO api_device_events(business_id,id,device_id,device_version,event_type,before_state,after_state,reason,command_id,actor_staff_id,occurred_at) VALUES($1,$2,$3,$4,'REVOKED',$5::jsonb,$6::jsonb,'Staff deactivated',$7,$8,$9)`,[actor.businessId,randomUUID(),deviceRecord.id,version,JSON.stringify({staffId:p.staffId,active:true}),JSON.stringify(deviceRecord.data),command.commandId,actor.staffId,at]);}
 return {value,records:[value,...deviceRecords]};
};
export const staffCommandRegistry=new Map([['staff.create',{permission:'staff.create',offlinePolicy:'ONLINE_ONLY',handler:create}],['staff.update',{permission:'staff.update',offlinePolicy:'ONLINE_ONLY',handler:update}],['staff.deactivate',{permission:'staff.deactivate',offlinePolicy:'ONLINE_ONLY',handler:deactivate}]]);
