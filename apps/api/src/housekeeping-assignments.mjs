import {ApiProblem} from './command-kernel.mjs';

export async function housekeepingAssignees(db,actor){
 if(!actor.permissions?.includes('*')&&!actor.permissions?.includes('rooms.manage'))throw new ApiProblem(403,'PERMISSION_DENIED','Room assignment requires property manager permission.');
 const {rows}=await db.query(`SELECT s.staff_id AS id,s.display_name AS name,COALESCE(v.version,0)::text AS version
  FROM api_staff_profiles s LEFT JOIN business_entity_versions v ON v.business_id=s.business_id AND v.entity_type='employees' AND v.entity_id=s.staff_id
  WHERE s.business_id=$1 AND s.active AND EXISTS(SELECT 1 FROM api_staff_permissions p WHERE p.business_id=s.business_id AND p.staff_id=s.staff_id AND p.permission IN ('*','rooms.operate'))
  ORDER BY lower(s.display_name),s.staff_id`,[actor.businessId]);
 return {items:rows.map(row=>({...row,version:Number(row.version)})),generatedAt:new Date().toISOString()};
}
