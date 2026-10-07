import {ApiProblem} from './command-kernel.mjs';
import {randomUUID} from 'node:crypto';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const projection=row=>({collection:'enrolledDevices',id:row.id,version:Number(row.version??1),archived:Boolean(row.revokedAt),data:{staffId:row.staffId,staffName:row.staffName,active:!row.revokedAt,createdAt:row.createdAt.toISOString(),revokedAt:row.revokedAt?.toISOString()??null,name:`ServOS API device ${row.id}`,class:'BROWSER',lastSequence:0,lastSeenAt:null,protocolVersion:1}});
export async function deviceProjections(db,businessId){const {rows}=await db.query(`SELECT d.id,d.staff_id AS "staffId",f.display_name AS "staffName",d.created_at AS "createdAt",d.revoked_at AS "revokedAt",COALESCE(v.version,1) AS version FROM api_enrolled_devices d JOIN api_staff_profiles f ON f.business_id=d.business_id AND f.staff_id=d.staff_id LEFT JOIN business_entity_versions v ON v.business_id=d.business_id AND v.entity_type='enrolledDevices' AND v.entity_id=d.id::text WHERE d.business_id=$1 ORDER BY d.created_at DESC,d.id`,[businessId]);return rows.map(projection)}
const revoke=async({tx,command,actor,at})=>{
 const p=command.payload,id=p.deviceId||p.id;if(!uuid(id)||p.id&&p.id!==id)throw new ApiProblem(400,'VALIDATION_FAILED','Choose an enrolled device.');
 if(actor.deviceId===id)throw new ApiProblem(409,'ACTIVE_DEVICE_SELF_REVOCATION','Use another trusted device to revoke this browser.');
 const expected=command.expectedVersions[`enrolledDevices:${id}`];if(!Number.isSafeInteger(expected)||expected<1)throw new ApiProblem(400,'VALIDATION_FAILED','Review the current device version.');
 const {rows}=await tx.client.query(`SELECT id,staff_id AS "staffId",created_at AS "createdAt",revoked_at AS "revokedAt" FROM api_enrolled_devices WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,id]);const prior=rows[0];if(!prior||prior.revokedAt)throw new ApiProblem(409,'DEVICE_UNAVAILABLE','This device is already revoked or unavailable.');
 const reason=typeof p.reason==='string'?p.reason.trim():'';if(reason.length<3||reason.length>300)throw new ApiProblem(400,'VALIDATION_FAILED','Enter a device revocation reason.');
 const version=await tx.bumpEntityVersion(actor.businessId,'enrolledDevices',id,expected);await tx.client.query('UPDATE api_enrolled_devices SET revoked_at=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,id,at]);await tx.client.query('UPDATE api_staff_sessions SET revoked_at=$3 WHERE business_id=$1 AND device_id=$2 AND revoked_at IS NULL',[actor.businessId,id,at]);
 const staff=await tx.client.query('SELECT display_name AS "staffName" FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[actor.businessId,prior.staffId]);const value=projection({...prior,revokedAt:at,staffName:staff.rows[0]?.staffName,version});
 return {value,records:[value]};
};
export const deviceCommandRegistry=new Map([['device.revoke',{permission:'devices.manage',offlinePolicy:'ONLINE_ONLY',handler:revoke}]]);
