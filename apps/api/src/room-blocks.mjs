import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const problem=(status,code,message)=>{throw new ApiProblem(status,code,message);};
const invalid=message=>problem(400,'VALIDATION_FAILED',message);
const permission=actor=>{if(!actor.permissions?.includes('*')&&!actor.permissions?.includes('rooms.manage'))problem(403,'PERMISSION_DENIED','Property manager permission is required for an operating room hold.');};
const reviewed=(command,collection,id,min=0)=>{const version=command.expectedVersions[`${collection}:${id}`];if(!Number.isSafeInteger(version)||version<min)invalid(`Review the current ${collection} version before submitting this hold.`);return version;};
const text=(value,label,max=1000)=>{if(typeof value!=='string'||value.trim().length<3||value.trim().length>max||/[\u0000-\u001f\u007f]/u.test(value))invalid(`${label} must contain 3 to ${max} plain-text characters.`);return value.trim();};
const timestamp=(value,label)=>{if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/u.test(value)||!Number.isFinite(Date.parse(value)))invalid(`${label} must include a valid explicit time-zone offset.`);return new Date(value);};
const roomLock=(tx,businessId,roomId)=>tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`room-booking:${businessId}:${roomId}`]);
const roomColumns=`id,number,room_type_id AS "roomTypeId",capacity,turnaround_minutes AS "turnaroundMinutes",floor,amenities,notes,
 housekeeping_state AS "housekeepingState",maintenance_state AS "maintenanceState",housekeeping_at AS "housekeepingAt",housekeeping_by AS "housekeepingBy",
 housekeeping_assigned_staff_id AS "housekeepingAssignedStaffId",housekeeping_assigned_name AS "housekeepingAssignedName",housekeeping_assigned_at AS "housekeepingAssignedAt",housekeeping_assigned_by AS "housekeepingAssignedBy",
 version,created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`;
export const roomBlockColumns=`id,room_id AS "roomId",work_order_id AS "workOrderId",block_kind AS "blockKind",starts_at AS "startsAt",ends_at AS "endsAt",reason,status,
 source_command_id AS "sourceCommandId",created_by AS "createdBy",created_at AS "createdAt",resolved_by AS "resolvedBy",resolved_at AS "resolvedAt",
 inspection,resolved_command_id AS "resolvedCommandId",version`;
const projection=(collection,row)=>{
 const {archivedAt,...data}=row;
 for(const [key,value] of Object.entries(data))if(value instanceof Date)data[key]=value.toISOString();
 for(const key of ['version','capacity','turnaroundMinutes'])if(data[key]!==undefined&&data[key]!==null)data[key]=Number(data[key]);
 // A linked real work order proves maintenance origin; NULL without it remains unknown.
 if(collection==='roomBlocks'&&!data.blockKind&&data.workOrderId)data.blockKind='MAINTENANCE';
 return {collection,id:row.id,version:Number(row.version),archived:Boolean(archivedAt),data};
};
export async function roomBlockProjections(db,businessId){
 const {rows}=await db.query(`SELECT ${roomBlockColumns} FROM business_room_blocks WHERE business_id=$1 ORDER BY created_at,id`,[businessId]);
 return rows.map(row=>projection('roomBlocks',row));
}
const lockReviewedRoom=async(tx,actor,command,roomId)=>{
 const version=reviewed(command,'rooms',roomId,1);
 await roomLock(tx,actor.businessId,roomId);
 const {rows}=await tx.client.query(`SELECT ${roomColumns} FROM business_rooms WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE`,[actor.businessId,roomId]);
 const room=rows[0];if(!room)problem(404,'ROOM_NOT_FOUND','The reviewed room is unavailable in this business.');
 if(Number(room.version)!==version)problem(409,'VERSION_CONFLICT','Room state changed. Review the current room and hold before submitting.');
 return room;
};
const bumpRoom=async(tx,actor,at,room)=>{
 const version=await tx.bumpEntityVersion(actor.businessId,'rooms',room.id,Number(room.version));
 const {rows}=await tx.client.query(`UPDATE business_rooms SET version=$3,updated_by=$4,updated_at=$5 WHERE business_id=$1 AND id=$2 RETURNING ${roomColumns}`,[actor.businessId,room.id,version,actor.staffId,at]);
 return projection('rooms',rows[0]);
};
const audit=async({tx,actor,command,at},room,block,eventType,note)=>{
 const eventData={reason:note,holdId:block.id,blockKind:'OPERATING',blockVersion:block.version,startsAt:block.data.startsAt,endsAt:block.data.endsAt,
  from:eventType==='HOLD_OPEN'?'NO_OPERATING_HOLD':'ACTIVE',to:eventType==='HOLD_OPEN'?'ACTIVE':'RESOLVED',
  housekeepingState:room.data.housekeepingState,maintenanceState:room.data.maintenanceState};
 await tx.client.query(`INSERT INTO business_room_events(business_id,id,room_id,entity_type,entity_id,entity_version,event_type,event_data,command_id,staff_id,device_id,occurred_at)
  VALUES($1,$2,$3,'ROOM',$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),room.id,room.version,eventType,JSON.stringify(eventData),command.commandId,actor.staffId,actor.deviceId,at]);
};

/** Operating holds use the canonical room interval lock, never a repair workflow. */
const blockRoom=async context=>{
 const {tx,actor,command,at}=context;permission(actor);const p=command.payload;
 if(!uuid(p.id)||!uuid(p.roomId))invalid('Choose a new operating hold and an existing room.');
 if(reviewed(command,'roomBlocks',p.id)!==0)invalid('An operating hold must start with a new reviewed identity.');
 const reason=text(p.reason,'Operating hold reason'),startsAt=timestamp(p.startsAt,'Hold start'),endsAt=timestamp(p.endsAt,'Hold end');
 const year=366*24*60*60_000;
 if(endsAt<=startsAt||endsAt<=at||endsAt-startsAt>year||startsAt.getTime()<at.getTime()-5*60_000||startsAt.getTime()>at.getTime()+year)invalid('Choose a current or future hold of at most 366 days, with an end after its start. Refresh a start time more than five minutes old.');
 const room=await lockReviewedRoom(tx,actor,command,p.roomId);
 const exists=await tx.client.query('SELECT 1 FROM business_room_blocks WHERE business_id=$1 AND id=$2',[actor.businessId,p.id]);
 if(exists.rows.length)problem(409,'ROOM_HOLD_ALREADY_EXISTS','This hold identity is already recorded. Recover its original command instead of creating it again.');
 if(room.maintenanceState!=='AVAILABLE')problem(409,'ROOM_REPAIR_REVIEW_REQUIRED','This room is out of service. Review its maintenance work before adding an operating hold.');
 const repairs=await tx.client.query("SELECT 1 FROM business_maintenance_work_orders WHERE business_id=$1 AND room_id=$2 AND status='OPEN' LIMIT 1",[actor.businessId,room.id]);
 if(repairs.rows.length)problem(409,'ROOM_REPAIR_REVIEW_REQUIRED','This room has an open repair. Keep maintenance and operating holds separate.');
 const bookings=await tx.client.query(`SELECT 1 FROM business_room_reservations WHERE business_id=$1 AND room_id=$2 AND archived_at IS NULL
  AND status IN ('RESERVED','CHECKED_IN') AND starts_at<$4 AND blocked_until>$3 LIMIT 1`,[actor.businessId,room.id,startsAt,endsAt]);
 if(bookings.rows.length)problem(409,'ROOM_HOLD_BOOKING_OVERLAP','A booking, active stay or turnaround overlaps these hold dates. Relocate or resolve the booking first.');
 const holds=await tx.client.query(`SELECT 1 FROM business_room_blocks WHERE business_id=$1 AND room_id=$2 AND status='ACTIVE'
  AND starts_at<$4 AND (ends_at IS NULL OR ends_at>$3) LIMIT 1`,[actor.businessId,room.id,startsAt,endsAt]);
 if(holds.rows.length)problem(409,'ROOM_HOLD_OVERLAP','An active room hold or maintenance block overlaps these dates. Review the original block.');
 // A physically present overdue guest may outlast the booked interval.
 const occupied=await tx.client.query(`SELECT 1 FROM business_stays s JOIN business_room_reservations r ON r.business_id=s.business_id AND r.id=s.reservation_id
  WHERE s.business_id=$1 AND s.room_id=$2 AND s.status='CHECKED_IN' AND (r.status<>'CHECKED_IN' OR $3::timestamptz<=$4::timestamptz OR r.blocked_until<=$4::timestamptz) LIMIT 1`,[actor.businessId,room.id,startsAt,at]);
 if(occupied.rows.length)problem(409,'ROOM_OCCUPIED','A guest remains checked in. Review the actual departure before placing this operating hold.');
 const version=await tx.bumpEntityVersion(actor.businessId,'roomBlocks',p.id,0);
 const {rows}=await tx.client.query(`INSERT INTO business_room_blocks(business_id,id,room_id,block_kind,starts_at,ends_at,reason,status,source_command_id,created_by,created_at,version)
  VALUES($1,$2,$3,'OPERATING',$4,$5,$6,'ACTIVE',$7,$8,$9,$10) RETURNING ${roomBlockColumns}`,[actor.businessId,p.id,room.id,startsAt,endsAt,reason,command.commandId,actor.staffId,at,version]);
 const block=projection('roomBlocks',rows[0]),updatedRoom=await bumpRoom(tx,actor,at,room);
 await audit(context,updatedRoom,block,'HOLD_OPEN',reason);
 return {value:block,records:[block,updatedRoom]};
};

/** Release only a reviewed operating hold, retaining its original planned dates. */
const unblockRoom=async context=>{
 const {tx,actor,command,at}=context;permission(actor);const p=command.payload;
 if(!uuid(p.id)||!uuid(p.roomId))invalid('Choose the original operating hold and its room.');
 const version=reviewed(command,'roomBlocks',p.id,1),inspection=text(p.inspection,'Inspection and release note');
 const room=await lockReviewedRoom(tx,actor,command,p.roomId);
 const found=await tx.client.query(`SELECT ${roomBlockColumns} FROM business_room_blocks WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.id]),block=found.rows[0];
 if(!block||block.roomId!==room.id)problem(404,'ROOM_HOLD_NOT_FOUND','The reviewed hold does not belong to this room and business.');
 const linked=await tx.client.query('SELECT 1 FROM business_maintenance_work_orders WHERE business_id=$1 AND block_id=$2 LIMIT 1',[actor.businessId,block.id]);
 if(block.blockKind!=='OPERATING'||block.workOrderId||linked.rows.length)problem(409,'MAINTENANCE_RELEASE_REQUIRED','This block is maintenance-linked or has no operating-hold classification. Resolve its real maintenance evidence; generic release cannot return the room to service.');
 if(block.status!=='ACTIVE')problem(409,'ROOM_HOLD_NOT_ACTIVE','The original hold is already resolved. Review its recorded release instead of repeating it.');
 if(Number(block.version)!==version)problem(409,'VERSION_CONFLICT','The operating hold changed. Refresh its current status before releasing it.');
 const next=await tx.bumpEntityVersion(actor.businessId,'roomBlocks',block.id,version);
 const {rows}=await tx.client.query(`UPDATE business_room_blocks SET status='RESOLVED',inspection=$3,resolved_by=$4,resolved_at=$5,resolved_command_id=$6,version=$7
  WHERE business_id=$1 AND id=$2 RETURNING ${roomBlockColumns}`,[actor.businessId,block.id,inspection,actor.staffId,at,command.commandId,next]);
 const updatedBlock=projection('roomBlocks',rows[0]),updatedRoom=await bumpRoom(tx,actor,at,room);
 await audit(context,updatedRoom,updatedBlock,'HOLD_RELEASE',inspection);
 return {value:updatedBlock,records:[updatedBlock,updatedRoom]};
};

export const roomBlockCommandRegistry=new Map([
 ['room.block',{permission:'rooms.manage',offlinePolicy:'ONLINE_ONLY',handler:blockRoom}],
 ['room.unblock',{permission:'rooms.manage',offlinePolicy:'ONLINE_ONLY',handler:unblockRoom}],
]);
