import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';

export async function preparationSettingsProjections(db,businessId){
 const {rows}=await db.query(`SELECT overdue_minutes AS "overdueMinutes",version,updated_by AS "updatedBy",updated_at AS "updatedAt"
  FROM business_preparation_settings WHERE business_id=$1`,[businessId]);
 return rows.map(row=>({collection:'preparationSettings',id:businessId,version:Number(row.version),archived:false,
  data:{...row,version:Number(row.version),updatedAt:row.updatedAt.toISOString()}}));
}
const save=async({tx,actor,command,at})=>{
 const p=command.payload,minutes=p.overdueMinutes,reason=typeof p.reason==='string'?p.reason.trim():'';
 if(!minutes||typeof minutes!=='object'||Array.isArray(minutes)||Object.keys(minutes).length!==3
  ||['BAR','KITCHEN','ROOMS'].some(station=>!Number.isInteger(minutes[station])||minutes[station]<1||minutes[station]>240)
  ||reason.length<3||reason.length>500)throw new ApiProblem(400,'VALIDATION_FAILED','Provide reviewed station thresholds between 1 and 240 minutes and a change reason.');
 const baseline=command.expectedVersions[`preparationSettings:${actor.businessId}`];
 if(!Number.isSafeInteger(baseline)||baseline<0)throw new ApiProblem(400,'VALIDATION_FAILED','Review the current preparation settings before saving.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`preparation-settings:${actor.businessId}`]);
 const current=await tx.client.query('SELECT overdue_minutes,version FROM business_preparation_settings WHERE business_id=$1 FOR UPDATE',[actor.businessId]);
 if(Number(current.rows[0]?.version??0)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','Preparation settings changed. Review the latest thresholds.');
 const version=await tx.bumpEntityVersion(actor.businessId,'preparationSettings',actor.businessId,baseline);
 await tx.client.query(`INSERT INTO business_preparation_settings(business_id,overdue_minutes,version,updated_by,updated_at) VALUES($1,$2::jsonb,$3,$4,$5)
  ON CONFLICT(business_id) DO UPDATE SET overdue_minutes=EXCLUDED.overdue_minutes,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,JSON.stringify(minutes),version,actor.staffId,at]);
 await tx.client.query(`INSERT INTO business_preparation_settings_events(business_id,id,source_command_id,before_minutes,after_minutes,reason,staff_id,device_id,occurred_at)
  VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)`,[actor.businessId,randomUUID(),command.commandId,current.rows[0]?JSON.stringify(current.rows[0].overdue_minutes):null,JSON.stringify(minutes),reason,actor.staffId,actor.deviceId,at]);
 const value=(await preparationSettingsProjections(tx.client,actor.businessId))[0];return {value,records:[value]};
};
export const preparationSettingsCommandRegistry=new Map([
 ['preparation.settings.save',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:save}],
]);
