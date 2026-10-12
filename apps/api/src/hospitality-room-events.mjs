import {randomUUID} from 'node:crypto';

/** Audit the canonical maintenance outcome; never change room or payment state. */
export async function captureMaintenanceRoomEvent({tx,actor,command,at},handled){
 const types={'maintenance.open':'MAINTENANCE_OPEN','maintenance.resolve':'MAINTENANCE_RESOLVED','maintenance.returnToService':'RETURN_TO_SERVICE'};
 const eventType=types[command.name];if(!eventType)return;
 const room=handled.records?.find(record=>record.collection==='rooms');if(!room)return;
 const p=command.payload;
 const eventData={reason:p.reason||p.resolution||p.fault||'',title:p.title||handled.value?.data?.title||'',
  ...(command.name==='maintenance.returnToService'?{from:'OUT_OF_SERVICE',to:'DIRTY',fromServiceability:'OUT_OF_SERVICE',toServiceability:'AVAILABLE'}:
   {workOrderId:handled.value?.id||p.id,toServiceability:room.data.maintenanceState,to:room.data.housekeepingState})};
 await tx.client.query(`INSERT INTO business_room_events(business_id,id,room_id,entity_type,entity_id,entity_version,event_type,event_data,command_id,staff_id,device_id,occurred_at)
  VALUES($1,$2,$3,'ROOM',$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),room.id,room.version,eventType,JSON.stringify(eventData),command.commandId,actor.staffId,actor.deviceId,at]);
}
