import {ApiProblem} from './command-kernel.mjs';

const permitted=(actor,...permissions)=>actor.permissions?.includes('*')||permissions.some(permission=>actor.permissions?.includes(permission));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid=()=>{throw new ApiProblem(400,'VALIDATION_FAILED','Refresh the booking history with a valid page cursor.');};
function decodeCursor(encoded,kinds=['EVENT','FOLIO','ROOM_EVENT']){
 if(!encoded)return null;
 if(typeof encoded!=='string'||encoded.length>600||!/^[A-Za-z0-9_-]+$/.test(encoded))invalid();
 try{
  const cursor=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(cursor.v!==1||typeof cursor.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)||!Number.isFinite(Date.parse(cursor.at))||!kinds.includes(cursor.kind)||!uuid.test(cursor.id))invalid();
  return cursor;
 }catch(error){if(error instanceof ApiProblem)throw error;invalid();}
}

/** Read-only, business-scoped live timeline. Cursor paging never changes a booking. */
export async function reservationHistory(db,actor,reservationId,{cursor,limit=50}={}){
 if(!permitted(actor,'rooms.operate','rooms.manage','rooms.guests.view','folio.view','folio.manage','audit.view'))throw new ApiProblem(403,'PERMISSION_DENIED','Booking history is not available for this account.');
 if(!uuid.test(reservationId)||!Number.isSafeInteger(limit)||limit<1||limit>100)invalid();
 const reservation=await db.query('SELECT id,reservation_number AS "reservationNumber",created_at AS "createdAt",status FROM business_room_reservations WHERE business_id=$1 AND id=$2',[actor.businessId,reservationId]);
 if(!reservation.rows.length)throw new ApiProblem(404,'RESERVATION_NOT_FOUND','This booking is unavailable.');
 const after=decodeCursor(cursor),financial=permitted(actor,'folio.view','folio.manage','accounting.view','audit.view');
 const rows=await db.query(`WITH timeline AS (
   SELECT e.id,'EVENT'::text AS kind,e.occurred_at AS happened_at,e.event_type AS title,
     COALESCE(e.event_data->>'reason',e.event_data->>'resolution',e.event_data->>'description','') AS note,
     NULL::bigint AS amount_minor,e.staff_id,e.source_command_id,e.room_id
   FROM business_stay_events e WHERE e.business_id=$1 AND (e.reservation_id=$2 OR e.stay_id=$2)
   UNION ALL
   SELECT e.id,'ROOM_EVENT'::text,e.occurred_at,e.event_type,
     COALESCE(e.event_data->>'reason',e.event_data->>'description',''),NULL::bigint,e.staff_id,e.command_id,e.room_id
   FROM business_room_events e WHERE e.business_id=$1 AND e.reservation_id=$2
   UNION ALL
   SELECT f.id,'FOLIO'::text,f.posted_at,f.kind,
     COALESCE(f.details->>'description',f.details->>'reason',f.source_type),f.amount_minor,f.staff_id,f.source_command_id,NULL::uuid
   FROM business_folio_entries f WHERE f.business_id=$1 AND f.folio_id=$2 AND $3::boolean
 ) SELECT t.id,t.kind,t.title,t.note,t.amount_minor AS "amountMinor",s.display_name AS "staffName",r.number AS "roomNumber",
     t.source_command_id AS "sourceCommandId",to_char(t.happened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt"
   FROM timeline t LEFT JOIN api_staff_profiles s ON s.business_id=$1 AND s.staff_id=t.staff_id
   LEFT JOIN business_rooms r ON r.business_id=$1 AND r.id=t.room_id
   WHERE ($4::timestamptz IS NULL OR (t.happened_at,t.kind,t.id)<($4::timestamptz,$5::text,$6::uuid))
   ORDER BY t.happened_at DESC,t.kind DESC,t.id DESC LIMIT $7`,[actor.businessId,reservationId,financial,after?.at??null,after?.kind??null,after?.id??null,limit+1]);
 const more=rows.rows.length>limit,items=rows.rows.slice(0,limit).map(row=>{
  const value={...row,amountMinor:row.amountMinor===null?null:Number(row.amountMinor)};
  if(!permitted(actor,'audit.view'))delete value.sourceCommandId;
  return value;
 });
 const last=items.at(-1),nextCursor=more&&last?Buffer.from(JSON.stringify({v:1,at:last.occurredAt,kind:last.kind,id:last.id}),'utf8').toString('base64url'):null;
 return {reservationId,reservationNumber:reservation.rows[0].reservationNumber??null,createdAt:reservation.rows[0].createdAt,status:reservation.rows[0].status,generatedAt:new Date().toISOString(),financialEntriesIncluded:financial,items,nextCursor,hasMore:more};
}

/** Operational room history includes captured legacy work-order timestamps, not invented events. */
export async function roomHistory(db,actor,roomId,{cursor,limit=50}={}){
 if(!permitted(actor,'rooms.view','rooms.operate','rooms.manage','maintenance.view','maintenance.manage','audit.view'))throw new ApiProblem(403,'PERMISSION_DENIED','Room history is unavailable for this account.');
 if(!uuid.test(roomId)||!Number.isSafeInteger(limit)||limit<1||limit>100)invalid();
 const room=await db.query('SELECT id,number,created_at AS "createdAt" FROM business_rooms WHERE business_id=$1 AND id=$2',[actor.businessId,roomId]);
 if(!room.rows.length)throw new ApiProblem(404,'ROOM_NOT_FOUND','This room is unavailable.');
 const after=decodeCursor(cursor,['ROOM_EVENT','STAY_EVENT','MAINTENANCE_OPEN','MAINTENANCE_RESOLVED']);
 const result=await db.query(`WITH timeline AS (
  SELECT e.id,'ROOM_EVENT'::text AS kind,e.occurred_at AS happened_at,e.event_type AS title,
   COALESCE(e.event_data->>'reason',e.event_data->>'description',e.event_data->>'title','') AS note,
   e.event_data->>'from' AS from_state,e.event_data->>'to' AS to_state,
   CASE WHEN e.event_type='HOUSEKEEPING_ASSIGNMENT' THEN COALESCE(e.event_data->>'toName','Unassigned') END AS assigned_name,
   e.staff_id,e.command_id AS source_command_id,e.reservation_id
  FROM business_room_events e WHERE e.business_id=$1 AND (e.room_id=$2 OR e.entity_type='ROOM' AND e.entity_id=$2)
  UNION ALL
  SELECT e.id,'STAY_EVENT',e.occurred_at,e.event_type,COALESCE(e.event_data->>'reason',e.event_data->>'description',''),
   NULL::text,NULL::text,NULL::text,e.staff_id,e.source_command_id,e.reservation_id
  FROM business_stay_events e WHERE e.business_id=$1 AND (e.room_id=$2 OR e.event_type='ROOM_MOVE' AND e.event_data->>'fromRoomId'=$2::text)
  UNION ALL
  SELECT w.id,'MAINTENANCE_OPEN',w.opened_at,'MAINTENANCE_OPEN_CAPTURED',w.title||': '||w.fault,
   NULL::text,NULL::text,NULL::text,w.opened_by,b.source_command_id,NULL::uuid
  FROM business_maintenance_work_orders w LEFT JOIN business_room_blocks b ON b.business_id=w.business_id AND b.id=w.block_id
  WHERE w.business_id=$1 AND w.room_id=$2 AND NOT EXISTS(SELECT 1 FROM business_room_events e WHERE e.business_id=w.business_id
   AND e.event_type='MAINTENANCE_OPEN' AND e.event_data->>'workOrderId'=w.id::text)
  UNION ALL
  SELECT w.id,'MAINTENANCE_RESOLVED',w.resolved_at,'MAINTENANCE_RESOLVED_CAPTURED',COALESCE(w.resolution,''),
   NULL::text,NULL::text,NULL::text,w.resolved_by,NULL::uuid,NULL::uuid
  FROM business_maintenance_work_orders w WHERE w.business_id=$1 AND w.room_id=$2 AND w.resolved_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM business_room_events e WHERE e.business_id=w.business_id
   AND e.event_type='MAINTENANCE_RESOLVED' AND e.event_data->>'workOrderId'=w.id::text)
 ) SELECT t.id,t.kind,t.title,t.note,t.from_state AS "fromState",t.to_state AS "toState",t.assigned_name AS "assignedName",
  s.display_name AS "staffName",x.reservation_number AS "reservationNumber",t.source_command_id AS "sourceCommandId",
  to_char(t.happened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt"
 FROM timeline t LEFT JOIN api_staff_profiles s ON s.business_id=$1 AND s.staff_id=t.staff_id
 LEFT JOIN business_room_reservations x ON x.business_id=$1 AND x.id=t.reservation_id
 WHERE ($3::timestamptz IS NULL OR (t.happened_at,t.kind,t.id)<($3::timestamptz,$4::text,$5::uuid))
 ORDER BY t.happened_at DESC,t.kind DESC,t.id DESC LIMIT $6`,[actor.businessId,roomId,after?.at??null,after?.kind??null,after?.id??null,limit+1]);
 const hasMore=result.rows.length>limit,items=result.rows.slice(0,limit).map(row=>{const value={...row};if(!permitted(actor,'audit.view'))delete value.sourceCommandId;return value;});
 const last=items.at(-1),nextCursor=hasMore&&last?Buffer.from(JSON.stringify({v:1,at:last.occurredAt,kind:last.kind,id:last.id}),'utf8').toString('base64url'):null;
 return {roomId,roomNumber:room.rows[0].number,createdAt:room.rows[0].createdAt,generatedAt:new Date().toISOString(),items,nextCursor,hasMore,
  coverageNote:'Recorded room/stay events and retained maintenance timestamps. Older unrecorded transitions are unavailable; this is not a reconstructed historical occupancy ledger.'};
}
