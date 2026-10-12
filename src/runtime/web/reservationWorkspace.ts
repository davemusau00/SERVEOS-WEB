import {addBusinessDays,businessDate,formatBusinessDateTime} from '../../utils/businessTime';
import type {BusinessRecord} from './session';

const uuidPattern=/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
export const operationalText=(value:unknown,fallback:string)=>typeof value==='string'&&value.trim()&&!uuidPattern.test(value)?value.trim():fallback;
export const reservationStateLabel=(state:unknown)=>({RESERVED:'Reserved',CHECKED_IN:'In house',CHECKED_OUT:'Checked out',CANCELLED:'Cancelled',NO_SHOW:'No-show'}[String(state)]||'Needs review');
export function localReservationDate(value:unknown,timeZone:string){
 try{return businessDate(String(value||''),timeZone)}catch{return ''}
}
export function localReservationTime(value:unknown,timeZone:string){
 try{return formatBusinessDateTime(String(value||''),timeZone)}catch{return 'Date unavailable'}
}
/** Display labels never replace the canonical reservation UUID or an issued document number. */
export function reservationDisplayReference(reservation:BusinessRecord,documents:BusinessRecord[],room?:BusinessRecord,timeZone='Africa/Nairobi'){
 const supplied=operationalText(reservation.data.reservationNumber||reservation.data.bookingReference,'');
 if(supplied)return supplied;
 const issued=documents.filter(record=>record.data.type==='RESERVATION_CONFIRMATION').find(record=>{
  const snapshot=record.data.snapshot as {reservation?:{id?:unknown};reservationId?:unknown}|undefined;
  return snapshot?.reservation?.id===reservation.id||snapshot?.reservationId===reservation.id;
 });
 const documentNumber=operationalText(issued?.data.documentNumber,'');
 if(documentNumber)return documentNumber;
 return `Booking · Room ${operationalText(room?.data.number,'unavailable')} · ${localReservationDate(reservation.data.startsAt,timeZone)||'date unavailable'}`;
}
export function calendarDays(start:string,count=7){return Array.from({length:count},(_,offset)=>addBusinessDays(start,offset))}
export function reservationOverlapsBusinessDate(reservation:BusinessRecord,date:string,timeZone:string){
 const start=localReservationDate(reservation.data.startsAt,timeZone),end=localReservationDate(reservation.data.blockedUntil||reservation.data.endsAt,timeZone);
 if(!start||!end)return false;
 // A day stay and checkout/turnaround still occupy part of their last business day.
 return start<=date&&date<=end;
}
