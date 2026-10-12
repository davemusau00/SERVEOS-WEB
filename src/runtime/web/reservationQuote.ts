import {quoteReservation,type ReservationPolicy,type ReservationRate} from '../../../contracts/reservation-quote.mjs';
import type {BusinessRecord,WebSession} from './session';
export function reservationPolicy(records:BusinessRecord[],session:WebSession):ReservationPolicy {
 const d=records.find(r=>r.collection==='hospitalitySettings'&&!r.archived)?.data;
 return {timeZone:String(d?.timeZone||session.propertyContext?.timeZone||'Africa/Nairobi'),
  nightlyCheckoutTime:String(d?.nightlyCheckoutTime||session.propertyContext?.nightlyCheckoutTime||'10:00'),
  dayStayCutoffTime:String(d?.dayStayCutoffTime||session.propertyContext?.dayStayCutoffTime||'18:00'),
  roomStayRoomTypeId:typeof d?.roomStayRoomTypeId==='string'?d.roomStayRoomTypeId:session.propertyContext?.roomTypeId,
  roomStayRatePlanId:typeof d?.roomStayRatePlanId==='string'?d.roomStayRatePlanId:session.propertyContext?.ratePlanId,
  cashUpfrontRequired:d?.cashUpfrontRequired===true,standardRoomRateEnabled:d?.standardRoomRateEnabled===true};
}
export function quoteRoomBooking(rate:BusinessRecord|undefined,room:BusinessRecord|undefined,policy:ReservationPolicy,stayType:'NIGHTLY'|'DAY',startsAt:string,endsAt:string){
 if(!room||!rate)throw new RangeError('Choose an available room and configured rate.');
 return quoteReservation({rate:{...rate.data,id:rate.id} as unknown as ReservationRate,roomTypeId:String(room.data.roomTypeId),policy,stayType,startsAt,endsAt});
}
