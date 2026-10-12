/** Shared booking quote only. Settlement and availability remain server commands. */
export function quoteReservation({rate,policy={},roomTypeId,stayType,startsAt,endsAt}) {
 const start=new Date(startsAt),end=new Date(endsAt);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new RangeError('Departure must be after a valid arrival.');
 if(!['NIGHTLY','DAY'].includes(stayType))throw new RangeError('Choose a nightly or day stay.');
 if(!rate||rate.roomTypeId!==roomTypeId||rate.currency!=='KES')throw new RangeError('Choose a current KES rate for this room type.');
 const price=Number(rate.priceMinor),tax=Number(rate.taxBasisPoints);
 if(!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(tax)||tax<0||tax>10000)throw new RangeError('The configured price or tax snapshot is invalid.');
 const standard=policy.standardRoomRateEnabled===true;
 if(standard&&(rate.id!==policy.roomStayRatePlanId||roomTypeId!==policy.roomStayRoomTypeId||rate.mode!=='NIGHTLY'))throw new RangeError('Use the property standard room rate; receptionist rate overrides are not allowed.');
 if(!standard&&rate.mode!==(stayType==='DAY'?'DAY_USE':'NIGHTLY'))throw new RangeError('The selected rate does not match the stay type.');
 const format=new Intl.DateTimeFormat('en-GB',{timeZone:policy.timeZone||'Africa/Nairobi',calendar:'iso8601',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const local=date=>{const p=Object.fromEntries(format.formatToParts(date).map(part=>[part.type,part.value]));return {day:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};};
 const a=local(start),b=local(end);let units;
 if(stayType==='NIGHTLY'){
  units=(Date.parse(`${b.day}T00:00:00Z`)-Date.parse(`${a.day}T00:00:00Z`))/86400000;
  if(b.time!==(policy.nightlyCheckoutTime||'10:00')||units<1)throw new RangeError(`Nightly departure must use the property checkout time ${policy.nightlyCheckoutTime||'10:00'}.`);
 }else{
  if(a.day!==b.day||b.time>(policy.dayStayCutoffTime||'18:00'))throw new RangeError(`Day stays must end on the arrival date by ${policy.dayStayCutoffTime||'18:00'}.`);
  const minutes=Number(rate.durationMinutes);
  if(!standard&&(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440))throw new RangeError('The day-use billing duration is unavailable.');
  units=standard?1:Math.ceil((end.getTime()-start.getTime())/(minutes*60000));
 }
 if(!Number.isSafeInteger(units)||units<1||units>366)throw new RangeError('Bookings support one to 366 billing periods.');
 const total=BigInt(price)*BigInt(units);
 if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('The quoted amount exceeds the supported money range.');
 return {units,totalMinor:Number(total),currency:'KES',standardRoomRate:standard,
  rateSnapshot:{id:rate.id,name:rate.name,roomTypeId:rate.roomTypeId,mode:rate.mode,priceMinor:price,currency:'KES',taxBasisPoints:tax,durationMinutes:rate.durationMinutes===null||rate.durationMinutes===undefined?null:Number(rate.durationMinutes),quotedUnits:units,quotedAmountMinor:Number(total),standardRoomRate:standard,stayType}};
}
