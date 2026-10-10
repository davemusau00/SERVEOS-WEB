import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const requirePermission=(actor,permission)=>{if(!actor.permissions?.includes('*')&&!actor.permissions?.includes(permission))throw new ApiProblem(403,'PERMISSION_DENIED',`Staff ${permission} permission is required.`)};
const expected=(command,collection,id,min=0)=>{const value=command.expectedVersions[`${collection}:${id}`];if(!Number.isSafeInteger(value)||value<min)fail(`Reviewed ${collection} version is required.`);return value;};
const text=(value,label,{min=1,max=160}={})=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\u0000-\u001f\u007f]/u.test(value))fail(`${label} must contain ${min} to ${max} plain-text characters.`);return value.trim()};
const positiveInteger=(value,label,{min=1,max=1000}={})=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail(`${label} must be a whole number from ${min} to ${max}.`);return value};
const parsedDate=value=>typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/u.test(value)&&Number.isFinite(Date.parse(value))?new Date(value):null;
const localDayNumber=value=>{const [year,month,day]=String(value).split('-').map(Number);return Math.floor(Date.UTC(year,month-1,day)/86400000)};
const advisoryRoomLock=(tx,businessId,roomId)=>tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`room-booking:${businessId}:${roomId}`]);
const typeColumns=`id,code,name,max_guests AS "maxGuests",version,created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`;
const roomColumns=`id,number,room_type_id AS "roomTypeId",capacity,turnaround_minutes AS "turnaroundMinutes",floor,amenities,notes,housekeeping_state AS "housekeepingState",maintenance_state AS "maintenanceState",housekeeping_at AS "housekeepingAt",housekeeping_by AS "housekeepingBy",version,created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`;
const rateColumns=`id,name,room_type_id AS "roomTypeId",mode,price_minor AS "priceMinor",currency,tax_basis_points AS "taxBasisPoints",duration_minutes AS "durationMinutes",notes,version,created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`;
const reservationColumns=`id,room_id AS "roomId",rate_plan_id AS "ratePlanId",customer_id AS "customerId",guests,stay_type AS "stayType",starts_at AS "startsAt",ends_at AS "endsAt",blocked_until AS "blockedUntil",occupancy_starts_at AS "occupancyStartsAt",turnaround_minutes AS "turnaroundMinutes",status,rate_snapshot AS "rateSnapshot",units,quoted_amount_minor AS "quotedAmountMinor",checked_in_at AS "checkedInAt",checked_out_at AS "checkedOutAt",cancelled_at AS "cancelledAt",cancellation_reason AS "cancellationReason",version,created_by AS "createdBy",device_id AS "deviceId",created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`;
const record=(collection,row)=>{
 const {version,archivedAt,...data}=row;
 for(const key of ['maxGuests','capacity','turnaroundMinutes','priceMinor','taxBasisPoints','durationMinutes','guests','units','quotedAmountMinor'])if(data[key]!==undefined&&data[key]!==null)data[key]=Number(data[key]);
 for(const key of ['createdAt','updatedAt','housekeepingAt','startsAt','endsAt','blockedUntil','occupancyStartsAt','checkedInAt','checkedOutAt','cancelledAt'])if(data[key] instanceof Date)data[key]=data[key].toISOString();
 return {collection,id:row.id,version:Number(version),archived:archivedAt!==null,data:{...data,version:Number(version)}};
};

export async function roomProjections(db,businessId){
 const [types,rooms,rates,reservations]=await Promise.all([
  db.query(`SELECT ${typeColumns} FROM business_room_types WHERE business_id=$1 ORDER BY name,id`,[businessId]),
  db.query(`SELECT ${roomColumns} FROM business_rooms WHERE business_id=$1 ORDER BY number,id`,[businessId]),
  db.query(`SELECT ${rateColumns} FROM business_room_rate_plans WHERE business_id=$1 ORDER BY name,id`,[businessId]),
  db.query(`SELECT ${reservationColumns} FROM business_room_reservations WHERE business_id=$1 AND archived_at IS NULL ORDER BY starts_at DESC,id LIMIT 1000`,[businessId]),
 ]);
 return [...types.rows.map(row=>record('roomTypes',row)),...rooms.rows.map(row=>record('rooms',row)),...rates.rows.map(row=>record('ratePlans',row)),...reservations.rows.map(row=>record('roomReservations',row))];
}

const result=async(tx,actor,collection,table,columns,id)=>{
 const {rows}=await tx.client.query(`SELECT ${columns} FROM ${table} WHERE business_id=$1 AND id=$2`,[actor.businessId,id]);
 if(!rows[0])throw new ApiProblem(500,'ROOM_PROJECTION_MISSING','The saved hospitality record could not be projected.');
 return {value:record(collection,rows[0]),records:[record(collection,rows[0])]};
};
const entityEvent=async(tx,{actor,command,at,entityType,entityId,version,eventType,eventData={},roomId=null,reservationId=null})=>{
 await tx.client.query(`INSERT INTO business_room_events(business_id,id,reservation_id,room_id,entity_type,entity_id,entity_version,event_type,event_data,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,[actor.businessId,randomUUID(),reservationId,roomId,entityType,entityId,version,eventType,JSON.stringify(eventData),command.commandId,actor.staffId,actor.deviceId,at]);
};

const saveRoomType=async({tx,command,actor,at})=>{
 requirePermission(actor,'roomTypes.manage');const p=command.payload,d=p.data||{};if(!uuid(p.id))fail('Choose a room type.');
 const name=text(d.name,'Room type name',{max:100}),code=text(d.code||name.toUpperCase().replace(/[^A-Z0-9]+/g,'-'),'Room type code',{max:40}).toUpperCase(),maxGuests=positiveInteger(d.maxGuests??1,'Room capacity',{max:1000});
 const baseline=expected(command,'roomTypes',p.id),current=await tx.client.query(`SELECT version,archived_at AS "archivedAt" FROM business_room_types WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.id]);
 if(current.rows[0]?.archivedAt)throw new ApiProblem(409,'RESOURCE_CONFLICT','Restore this room type before editing it.');
 if((current.rows[0]?Number(current.rows[0].version):0)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','This room type changed. Refresh it before saving.');
 const oversizedRooms=await tx.client.query('SELECT 1 FROM business_rooms WHERE business_id=$1 AND room_type_id=$2 AND archived_at IS NULL AND capacity>$3 LIMIT 1',[actor.businessId,p.id,maxGuests]);if(oversizedRooms.rows.length)throw new ApiProblem(409,'ROOM_CAPACITY_CONFLICT','Reduce the capacity of linked rooms before lowering this room type guest limit.');
 const duplicate=await tx.client.query('SELECT id FROM business_room_types WHERE business_id=$1 AND lower(code)=lower($2) AND id<>$3 AND archived_at IS NULL',[actor.businessId,code,p.id]);if(duplicate.rows.length)throw new ApiProblem(409,'DUPLICATE_REFERENCE','An active room type already uses this code.');
 const version=await tx.bumpEntityVersion(actor.businessId,'roomTypes',p.id,baseline);
 await tx.client.query(`INSERT INTO business_room_types(business_id,id,code,name,max_guests,version,created_by,updated_by,created_at,updated_at,archived_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$8,NULL) ON CONFLICT(business_id,id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,max_guests=EXCLUDED.max_guests,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,p.id,code,name,maxGuests,version,actor.staffId,at]);
 await entityEvent(tx,{actor,command,at,entityType:'ROOM_TYPE',entityId:p.id,version,eventType:'SAVE',eventData:{code,name,maxGuests}});
 return result(tx,actor,'roomTypes','business_room_types',typeColumns,p.id);
};

const saveRoom=async({tx,command,actor,at})=>{
 requirePermission(actor,'rooms.manage');const p=command.payload,d=p.data||{};if(!uuid(p.id)||!uuid(d.roomTypeId))fail('Choose a room and room type.');
 const number=text(d.number,'Room number',{max:40}),capacity=positiveInteger(Number(d.capacity),'Room capacity',{max:1000}),turnaround=positiveInteger(Number(d.turnaroundMinutes??30),'Turnaround minutes',{min:0,max:10080});
 const floor=text(d.floor??'','Floor',{min:0,max:80}),notes=text(d.notes??'','Room notes',{min:0,max:1000});
 const amenities=Array.isArray(d.amenities)?[...new Set(d.amenities.map(value=>text(value,'Amenity',{max:80})))]:[];if(amenities.length>30)fail('A room can have at most 30 amenities.');
 const type=await tx.client.query(`SELECT max_guests AS "maxGuests",version FROM business_room_types WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,d.roomTypeId]);
 if(!type.rows[0])throw new ApiProblem(409,'RESOURCE_CONFLICT','Choose an active room type.');
 if(expected(command,'roomTypes',d.roomTypeId)!==Number(type.rows[0].version))throw new ApiProblem(409,'VERSION_CONFLICT','The selected room type changed. Refresh before saving.');
 if(capacity>Number(type.rows[0].maxGuests))fail('Room capacity cannot exceed its room type capacity.');
 await advisoryRoomLock(tx,actor.businessId,p.id);
 const baseline=expected(command,'rooms',p.id),current=await tx.client.query(`SELECT room_type_id AS "roomTypeId",capacity,turnaround_minutes AS "turnaroundMinutes",version,archived_at AS "archivedAt" FROM business_rooms WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.id]);
 if(current.rows[0]?.archivedAt)throw new ApiProblem(409,'RESOURCE_CONFLICT','Restore this room before editing it.');
 if((current.rows[0]?Number(current.rows[0].version):0)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','This room changed. Refresh before saving.');
 if(current.rows[0]&&(current.rows[0].roomTypeId!==d.roomTypeId||Number(current.rows[0].capacity)!==capacity||Number(current.rows[0].turnaroundMinutes)!==turnaround)){
  const active=await tx.client.query(`SELECT 1 FROM business_room_reservations WHERE business_id=$1 AND room_id=$2 AND archived_at IS NULL AND status IN ('RESERVED','CHECKED_IN') LIMIT 1`,[actor.businessId,p.id]);
  if(active.rows.length)throw new ApiProblem(409,'ACTIVE_RESERVATIONS_BLOCK_ROOM_CHANGE','Resolve active reservations before changing room type, capacity or turnaround.');
 }
 const duplicate=await tx.client.query('SELECT id FROM business_rooms WHERE business_id=$1 AND lower(number)=lower($2) AND id<>$3 AND archived_at IS NULL',[actor.businessId,number,p.id]);if(duplicate.rows.length)throw new ApiProblem(409,'DUPLICATE_REFERENCE','An active room already uses this number.');
 const version=await tx.bumpEntityVersion(actor.businessId,'rooms',p.id,baseline);
 await tx.client.query(`INSERT INTO business_rooms(business_id,id,number,room_type_id,capacity,turnaround_minutes,floor,amenities,notes,version,created_by,updated_by,created_at,updated_at,archived_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$11,$12,$12,NULL) ON CONFLICT(business_id,id) DO UPDATE SET number=EXCLUDED.number,room_type_id=EXCLUDED.room_type_id,capacity=EXCLUDED.capacity,turnaround_minutes=EXCLUDED.turnaround_minutes,floor=EXCLUDED.floor,amenities=EXCLUDED.amenities,notes=EXCLUDED.notes,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,p.id,number,d.roomTypeId,capacity,turnaround,floor,JSON.stringify(amenities),notes,version,actor.staffId,at]);
 await entityEvent(tx,{actor,command,at,entityType:'ROOM',entityId:p.id,roomId:p.id,version,eventType:'SAVE',eventData:{number,roomTypeId:d.roomTypeId,capacity}});
 return result(tx,actor,'rooms','business_rooms',roomColumns,p.id);
};

const saveRate=async({tx,command,actor,at})=>{
 requirePermission(actor,'rooms.manage');const p=command.payload,d=p.data||{};if(!uuid(p.id)||!uuid(d.roomTypeId))fail('Choose a rate and room type.');
 const name=text(d.name,'Rate name',{max:100}),mode=d.mode??'NIGHTLY';if(!['NIGHTLY','DAY_USE'].includes(mode))fail('Choose nightly or day-use pricing.');
 const price=Number(d.priceMinor);if(!Number.isSafeInteger(price)||price<0||price>Number.MAX_SAFE_INTEGER)fail('Rate price must be a non-negative supported amount.');
 const taxBasisPoints=Number(d.taxBasisPoints??0);if(!Number.isSafeInteger(taxBasisPoints)||taxBasisPoints<0||taxBasisPoints>10000)fail('Rate tax must be from zero to 100 percent.');
 const duration=mode==='DAY_USE'?positiveInteger(Number(d.durationMinutes),'Day-use duration',{max:1440}):null,notes=text(d.notes??'','Rate notes',{min:0,max:1000});
 const type=await tx.client.query(`SELECT version FROM business_room_types WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,d.roomTypeId]);if(!type.rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','Choose an active room type.');
 if(expected(command,'roomTypes',d.roomTypeId)!==Number(type.rows[0].version))throw new ApiProblem(409,'VERSION_CONFLICT','Room type changed. Refresh before saving the rate.');
 const baseline=expected(command,'ratePlans',p.id),current=await tx.client.query(`SELECT version,archived_at AS "archivedAt" FROM business_room_rate_plans WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.id]);
 if(current.rows[0]?.archivedAt)throw new ApiProblem(409,'RESOURCE_CONFLICT','Restore this rate plan before editing it.');
 if((current.rows[0]?Number(current.rows[0].version):0)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','This rate plan changed. Refresh before saving.');
 const duplicate=await tx.client.query('SELECT id FROM business_room_rate_plans WHERE business_id=$1 AND room_type_id=$2 AND lower(name)=lower($3) AND id<>$4 AND archived_at IS NULL',[actor.businessId,d.roomTypeId,name,p.id]);if(duplicate.rows.length)throw new ApiProblem(409,'DUPLICATE_REFERENCE','An active rate with this name already exists for the room type.');
 const version=await tx.bumpEntityVersion(actor.businessId,'ratePlans',p.id,baseline);
 await tx.client.query(`INSERT INTO business_room_rate_plans(business_id,id,name,room_type_id,mode,price_minor,currency,tax_basis_points,duration_minutes,notes,version,created_by,updated_by,created_at,updated_at,archived_at) VALUES($1,$2,$3,$4,$5,$6,'KES',$7,$8,$9,$10,$11,$11,$12,$12,NULL) ON CONFLICT(business_id,id) DO UPDATE SET name=EXCLUDED.name,room_type_id=EXCLUDED.room_type_id,mode=EXCLUDED.mode,price_minor=EXCLUDED.price_minor,tax_basis_points=EXCLUDED.tax_basis_points,duration_minutes=EXCLUDED.duration_minutes,notes=EXCLUDED.notes,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,p.id,name,d.roomTypeId,mode,price,taxBasisPoints,duration,notes,version,actor.staffId,at]);
 await entityEvent(tx,{actor,command,at,entityType:'RATE_PLAN',entityId:p.id,version,eventType:'SAVE',eventData:{name,roomTypeId:d.roomTypeId,mode,priceMinor:price}});
 return result(tx,actor,'ratePlans','business_room_rate_plans',rateColumns,p.id);
};

const reservationCreate=({walkIn=false}={})=>async({tx,command,actor,at})=>{
 requirePermission(actor,'rooms.operate');const p=command.payload;
 if(!uuid(p.id)||!uuid(p.roomId)||!uuid(p.ratePlanId)||!uuid(p.customerId))fail('A reservation ID, room, rate and named guest are required.');
 const startsAt=parsedDate(p.startsAt),endsAt=parsedDate(p.endsAt);if(!startsAt||!endsAt||endsAt<=startsAt)fail('Arrival and departure must be valid ordered local times with timezone offsets.');
 const guests=positiveInteger(p.guests,'Guest count',{max:1000}),stayType=p.stayType??'NIGHTLY';if(!['NIGHTLY','DAY'].includes(stayType))fail('Choose nightly or day-use stay.');
 if(walkIn&&startsAt>new Date(at.getTime()+5*60_000))fail('A walk-in arrival cannot begin in the future.');
 const expectedRoom=expected(command,'rooms',p.roomId,1),expectedRate=expected(command,'ratePlans',p.ratePlanId,1),expectedCustomer=expected(command,'customers',p.customerId,1);expected(command,'roomReservations',p.id);
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`hospitality-policy:${actor.businessId}`]);await advisoryRoomLock(tx,actor.businessId,p.roomId);
 const roomResult=await tx.client.query(`SELECT ${roomColumns} FROM business_rooms WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE`,[actor.businessId,p.roomId]);const room=roomResult.rows[0];
 if(!room)throw new ApiProblem(409,'ROOM_UNAVAILABLE','This room is missing or archived.');if(Number(room.version)!==expectedRoom)throw new ApiProblem(409,'VERSION_CONFLICT','Room state changed. Refresh availability before confirming.');
 if(room.housekeepingState!=='READY'||room.maintenanceState!=='AVAILABLE')throw new ApiProblem(409,'ROOM_UNAVAILABLE','The room must be inspected, ready and in service before it can be booked.');
 if(guests>Number(room.capacity))throw new ApiProblem(409,'ROOM_CAPACITY_EXCEEDED','Guest count exceeds this room capacity.');
 const rateResult=await tx.client.query(`SELECT ${rateColumns} FROM business_room_rate_plans WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,p.ratePlanId]);const rate=rateResult.rows[0];
 if(!rate||rate.roomTypeId!==room.roomTypeId)throw new ApiProblem(409,'RATE_ROOM_TYPE_MISMATCH','The selected rate is not active for this room type.');if(Number(rate.version)!==expectedRate)throw new ApiProblem(409,'VERSION_CONFLICT','The selected rate changed. Review the current price.');
 if((stayType==='NIGHTLY'&&rate.mode!=='NIGHTLY')||(stayType==='DAY'&&rate.mode!=='DAY_USE'))throw new ApiProblem(409,'RATE_STAY_TYPE_MISMATCH','The selected rate does not match the requested stay type.');
 const guest=await tx.client.query(`SELECT name,version FROM business_customers WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,p.customerId]);if(!guest.rows[0])throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected guest is missing or archived.');if(Number(guest.rows[0].version)!==expectedCustomer)throw new ApiProblem(409,'VERSION_CONFLICT','Guest details changed. Review the selected profile.');
 const settingsResult=await tx.client.query(`SELECT time_zone AS "timeZone",to_char(nightly_checkout_time,'HH24:MI') AS "nightlyCheckoutTime",to_char(day_stay_cutoff_time,'HH24:MI') AS "dayStayCutoffTime" FROM business_hospitality_settings WHERE business_id=$1`,[actor.businessId]);const settings=settingsResult.rows[0]??{timeZone:'Africa/Nairobi',nightlyCheckoutTime:'10:00',dayStayCutoffTime:'18:00'};
 const localTimes=await tx.client.query(`SELECT to_char($1::timestamptz AT TIME ZONE $3,'YYYY-MM-DD') AS "startDay",to_char($2::timestamptz AT TIME ZONE $3,'YYYY-MM-DD') AS "endDay",to_char($2::timestamptz AT TIME ZONE $3,'HH24:MI') AS "endTime"`,[startsAt,endsAt,settings.timeZone]);const local=localTimes.rows[0],span=endsAt.getTime()-startsAt.getTime(),duration=rate.durationMinutes===null?null:Number(rate.durationMinutes);let units;
 if(stayType==='NIGHTLY'){
  units=localDayNumber(local.endDay)-localDayNumber(local.startDay);
  if(local.endTime!==settings.nightlyCheckoutTime||units<1||units>366)fail(`Nightly departure must use the property checkout time ${settings.nightlyCheckoutTime}, within 366 nights.`);
 }else{
  if(local.startDay!==local.endDay||local.endTime>settings.dayStayCutoffTime)fail(`Day-use departure must be the same property-local date and no later than ${settings.dayStayCutoffTime}.`);
  units=Math.max(1,Math.ceil(span/(duration*60000)));
 }
 if(!Number.isSafeInteger(units)||units>366)fail('Stay duration exceeds supported billing periods.');const quotedBig=BigInt(units)*BigInt(rate.priceMinor);if(quotedBig>BigInt(Number.MAX_SAFE_INTEGER))fail('Quoted stay price exceeds the supported amount.');
 const turnaround=Number(room.turnaroundMinutes),blockedUntil=new Date(endsAt.getTime()+turnaround*60000);
 const overlaps=await tx.client.query(`SELECT id FROM business_room_reservations WHERE business_id=$1 AND room_id=$2 AND archived_at IS NULL AND status IN ('RESERVED','CHECKED_IN') AND starts_at<$4 AND blocked_until>$3 LIMIT 1 FOR UPDATE`,[actor.businessId,p.roomId,startsAt,blockedUntil]);
 if(overlaps.rows.length)throw new ApiProblem(409,'ROOM_UNAVAILABLE','Another reservation or occupied stay overlaps this room and its turnaround window.');
 const maintenance=await tx.client.query(`SELECT 1 FROM business_room_blocks WHERE business_id=$1 AND room_id=$2 AND status='ACTIVE' AND starts_at<$4 AND (ends_at IS NULL OR ends_at>$3) LIMIT 1`,[actor.businessId,p.roomId,startsAt,blockedUntil]);if(maintenance.rows.length)throw new ApiProblem(409,'ROOM_MAINTENANCE_BLOCK','This room has an active maintenance block during the selected dates.');
 const version=await tx.bumpEntityVersion(actor.businessId,'roomReservations',p.id,0),status=walkIn?'CHECKED_IN':'RESERVED';
 const rateSnapshot={id:rate.id,name:rate.name,roomTypeId:rate.roomTypeId,mode:rate.mode,priceMinor:Number(rate.priceMinor),currency:rate.currency,taxBasisPoints:Number(rate.taxBasisPoints),durationMinutes:rate.durationMinutes===null?null:Number(rate.durationMinutes),quotedUnits:units,quotedAmountMinor:Number(quotedBig)};
 await tx.client.query(`INSERT INTO business_room_reservations(business_id,id,room_id,rate_plan_id,customer_id,guests,stay_type,starts_at,ends_at,blocked_until,turnaround_minutes,status,rate_snapshot,units,quoted_amount_minor,checked_in_at,version,created_by,device_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$20)`,[actor.businessId,p.id,p.roomId,p.ratePlanId,p.customerId,guests,stayType,startsAt,endsAt,blockedUntil,turnaround,status,JSON.stringify(rateSnapshot),units,Number(quotedBig),walkIn?at:null,version,actor.staffId,actor.deviceId,at]);
 await entityEvent(tx,{actor,command,at,entityType:'RESERVATION',entityId:p.id,reservationId:p.id,roomId:p.roomId,version,eventType:walkIn?'WALK_IN':'RESERVE',eventData:{roomId:p.roomId,customerId:p.customerId,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),blockedUntil:blockedUntil.toISOString(),quotedAmountMinor:Number(quotedBig)}});
 return result(tx,actor,'roomReservations','business_room_reservations',reservationColumns,p.id);
};

const reservationTransition=action=>async({tx,command,actor,at})=>{
 requirePermission(actor,action==='checkIn'?'rooms.operate':'rooms.manage');const p=command.payload;if(!uuid(p.id))fail('Choose a reservation.');
 const baseline=expected(command,'roomReservations',p.id,1),found=await tx.client.query(`SELECT ${reservationColumns} FROM business_room_reservations WHERE business_id=$1 AND id=$2 AND archived_at IS NULL`,[actor.businessId,p.id]);if(!found.rows[0])throw new ApiProblem(409,'RESOURCE_CONFLICT','This reservation is missing or archived.');
 const reservation=found.rows[0];await advisoryRoomLock(tx,actor.businessId,reservation.roomId);
 const locked=await tx.client.query(`SELECT ${reservationColumns} FROM business_room_reservations WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.id]);const current=locked.rows[0];
 if(Number(current.version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','This reservation changed. Refresh before continuing.');
 let status,eventType,checkedInAt=current.checkedInAt,cancelledAt=null,reason=null;
 if(action==='cancel'){
  if(current.status!=='RESERVED')throw new ApiProblem(409,'RESERVATION_NOT_CANCELLABLE','Only an unoccupied reservation can be cancelled.');
  reason=text(p.reason,'Cancellation reason',{min:3,max:500});status='CANCELLED';cancelledAt=at;eventType='CANCEL';
 }else if(action==='noShow'){
  if(current.status!=='RESERVED'||current.endsAt>at)throw new ApiProblem(409,'RESERVATION_NOT_NO_SHOW','Only a reserved stay whose departure time has passed can be marked no-show.');status='NO_SHOW';eventType='NO_SHOW';
 }else{
  if(current.status!=='RESERVED'||current.startsAt>new Date(at.getTime()+5*60_000))throw new ApiProblem(409,'RESERVATION_NOT_READY_TO_CHECK_IN','This reservation is not ready for check-in.');
  const room=await tx.client.query(`SELECT housekeeping_state AS "housekeepingState",maintenance_state AS "maintenanceState" FROM business_rooms WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE`,[actor.businessId,current.roomId]);
  if(!room.rows[0]||room.rows[0].housekeepingState!=='READY'||room.rows[0].maintenanceState!=='AVAILABLE')throw new ApiProblem(409,'ROOM_UNAVAILABLE','The room must be ready and in service at check-in.');
  status='CHECKED_IN';checkedInAt=at;eventType='CHECK_IN';
 }
 const version=await tx.bumpEntityVersion(actor.businessId,'roomReservations',p.id,baseline);
 await tx.client.query(`UPDATE business_room_reservations SET status=$3,checked_in_at=$4,cancelled_at=$5,cancellation_reason=$6,version=$7,updated_at=$8 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.id,status,checkedInAt,cancelledAt,reason,version,at]);
 await entityEvent(tx,{actor,command,at,entityType:'RESERVATION',entityId:p.id,reservationId:p.id,roomId:current.roomId,version,eventType,eventData:{status,...(reason?{reason}:{})}});
 return result(tx,actor,'roomReservations','business_room_reservations',reservationColumns,p.id);
};

const housekeeping=async({tx,command,actor,at})=>{
 requirePermission(actor,'rooms.operate');const p=command.payload,id=p.id;if(!uuid(id))fail('Choose a room.');
 const baseline=expected(command,'rooms',id,1);await advisoryRoomLock(tx,actor.businessId,id);
 const found=await tx.client.query(`SELECT ${roomColumns} FROM business_rooms WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE`,[actor.businessId,id]);const room=found.rows[0];if(!room)throw new ApiProblem(409,'ROOM_UNAVAILABLE','This room is missing or archived.');if(Number(room.version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','Room state changed. Refresh before updating housekeeping.');
 const active=await tx.client.query(`SELECT 1 FROM business_room_reservations WHERE business_id=$1 AND room_id=$2 AND archived_at IS NULL AND status='CHECKED_IN' LIMIT 1`,[actor.businessId,id]);if(active.rows.length)throw new ApiProblem(409,'ROOM_OCCUPIED','An occupied room cannot be marked dirty, cleaned or ready.');
 const transitions={DIRTY:['CLEANING'],CLEANING:['INSPECTED'],INSPECTED:['READY','DIRTY'],READY:['DIRTY'],OUT_OF_SERVICE:[]};const state=p.state;if(!transitions[room.housekeepingState]?.includes(state))throw new ApiProblem(409,'INVALID_HOUSEKEEPING_TRANSITION','Use DIRTY to CLEANING to INSPECTED to READY; inspection may return a room to DIRTY.');
 const version=await tx.bumpEntityVersion(actor.businessId,'rooms',id,baseline);
 await tx.client.query('UPDATE business_rooms SET housekeeping_state=$3,housekeeping_at=$4,housekeeping_by=$5,version=$6,updated_by=$5,updated_at=$4 WHERE business_id=$1 AND id=$2',[actor.businessId,id,state,at,actor.staffId,version]);
 await entityEvent(tx,{actor,command,at,entityType:'ROOM',entityId:id,roomId:id,version,eventType:'HOUSEKEEPING',eventData:{from:room.housekeepingState,to:state}});
 return result(tx,actor,'rooms','business_rooms',roomColumns,id);
};

export const roomCommandRegistry=new Map([
 ['roomType.save',{permission:'roomTypes.manage',offlinePolicy:'ONLINE_ONLY',handler:saveRoomType}],
 ['room.save',{permission:'rooms.manage',offlinePolicy:'ONLINE_ONLY',handler:saveRoom}],
 ['ratePlan.save',{permission:'rooms.manage',offlinePolicy:'ONLINE_ONLY',handler:saveRate}],
 ['roomReservation.create',{permission:'rooms.operate',offlinePolicy:'ONLINE_ONLY',handler:reservationCreate()}],
 ['roomReservation.walkIn',{permission:'rooms.operate',offlinePolicy:'ONLINE_ONLY',handler:reservationCreate({walkIn:true})}],
 ['roomReservation.cancel',{permission:'rooms.operate',offlinePolicy:'ONLINE_ONLY',handler:reservationTransition('cancel')}],
 ['roomReservation.noShow',{permission:'rooms.manage',offlinePolicy:'ONLINE_ONLY',handler:reservationTransition('noShow')}],
 ['stay.checkIn',{permission:'rooms.operate',offlinePolicy:'ONLINE_ONLY',handler:reservationTransition('checkIn')}],
 ['room.housekeeping',{permission:'rooms.operate',offlinePolicy:'ONLINE_ONLY',handler:housekeeping}],
]);
