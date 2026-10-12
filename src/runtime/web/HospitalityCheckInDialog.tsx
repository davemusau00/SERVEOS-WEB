import React,{useRef,useState} from 'react';
import {Dialog,FormField} from '../../design-system/controls';
import {ds} from '../../design-system/tokens';
import {parseMoneyToMinor} from '../../utils/fiscal';
import type {CommandOutcome} from '../../types/transactions';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {QueuedCommand} from './BusinessStore';

const money=(minor:number)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(minor/100);
const active=(records:BusinessRecord[],collection:string)=>records.filter(r=>r.collection===collection&&!r.archived);
const safeName=(value:unknown,fallback:string)=>typeof value==='string'&&value.trim()&&!/[0-9a-f]{8}-[0-9a-f-]{27}/i.test(value)?value:fallback;

/** Display quote only. The server rechecks the snapshot, folio and drawer together. */
export function remainingCheckInCash(records:BusinessRecord[],reservation:BusinessRecord){
 const folio=active(records,'folios').find(r=>r.id===reservation.id);
 const snapshot=reservation.data.rateSnapshot as Record<string,unknown>|undefined;
 const units=Number(reservation.data.units),price=Number(snapshot?.priceMinor);
 if(!Number.isSafeInteger(units)||units<1||!Number.isSafeInteger(price)||price<0)throw Error('The booked accommodation quote needs review.');
 const posted=new Set(active(records,'folioEntries').filter(r=>r.data.folioId===reservation.id&&['ACCOMMODATION','EXTENSION'].includes(String(r.data.sourceType))).map(r=>Number(r.data.period??(r.data.details as Record<string,unknown>|undefined)?.period)));
 const unposted=Array.from({length:units},(_,period)=>period).filter(period=>!posted.has(period)).length;
 const total=BigInt(Number(folio?.data.balanceMinor||0))+BigInt(unposted)*BigInt(price);
 if(total<0n||total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('The guest balance needs review before check-in.');
 return Number(total);
}

export function HospitalityCheckInDialog({reservation,records,session,deviceId,queue,disabled,command,onClose,onActivity}:{reservation:BusinessRecord;records:BusinessRecord[];session:WebSession;deviceId:string;queue:QueuedCommand[];disabled:boolean;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;onClose:()=>void;onActivity?:()=>void}){
 const current=active(records,'roomReservations').find(r=>r.id===reservation.id)||reservation;
 const upfront=(current.data.rateSnapshot as Record<string,unknown>|undefined)?.cashUpfrontRequired===true;
 const room=active(records,'rooms').find(r=>r.id===current.data.roomId),guest=active(records,'customers').find(r=>r.id===current.data.customerId);
 const folio=active(records,'folios').find(r=>r.id===current.id),stay=active(records,'stays').find(r=>r.id===current.id);
 const accounts=active(records,'paymentAccounts').filter(r=>r.data.method==='CASH'&&r.data.currency==='KES');
 const till=active(records,'tillSessions').find(r=>r.data.status==='OPEN'&&r.data.operatorId===session.actorId&&r.data.deviceId===deviceId);
 const [accountId,setAccountId]=useState(accounts[0]?.id||''),[cash,setCash]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[held,setHeld]=useState(false);
 const inFlight=useRef(false),submitted=useRef(false);
 const account=accounts.find(r=>r.id===accountId);
 const pending=queue.find(r=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(r.state)&&r.command.operation==='stay.checkIn'&&r.command.payload.id===current.id);
 let due=0,tender:number|null=null,blocker='';
 try{due=upfront?remainingCheckInCash(records,current):0;tender=cash?parseMoneyToMinor(cash):null;}catch(error){blocker=error instanceof Error?error.message:'Review the guest quote.';}
 if(!blocker&&current.data.status!=='RESERVED')blocker='This guest is already checked in or the booking changed. Review its current state.';
 if(!blocker&&(!room||room.data.housekeepingState!=='READY'||room.data.maintenanceState!=='AVAILABLE'))blocker='The room must be ready and in service.';
 if(!blocker&&upfront&&due>0&&(!allowed(session,'payment.record')||session.capabilities?.['operations.checkout']!==true))blocker='Use the enrolled cashier terminal with payment permission to receive accommodation cash.';
 if(!blocker&&upfront&&due>0&&!till)blocker='Open your cashier shift before receiving accommodation cash.';
 if(!blocker&&upfront&&due>0&&!account)blocker='Choose an active KES cash account.';
 if(!blocker&&Number(folio?.data.depositMinor||0)>0&&upfront)blocker='An existing deposit requires review in Guest Accounts.';
 const confirm=async(event:React.FormEvent)=>{
  event.preventDefault();if(disabled||busy||inFlight.current||submitted.current||held||pending||blocker)return;
  if(upfront&&due>0&&(tender===null||tender<due)){setNotice('Cash received must cover the full remaining accommodation amount.');return;}
  inFlight.current=true;submitted.current=true;setBusy(true);setNotice('');
  try{
   const reviewed=[current,...(room?[room]:[]),{collection:'folios',id:current.id,version:folio?.version||0},{collection:'stays',id:current.id,version:stay?.version||0},...(upfront&&due>0&&account&&till?[account,till]:[])].map(r=>({collection:r.collection,id:r.id,version:r.version}));
   const result=await command('stay.checkIn','stays',current.id,{id:current.id,...(upfront&&due>0?{payment:{accountId,amountMinor:due,cashTenderedMinor:tender,tillSessionId:till?.id}}:{}),expectedVersions:reviewed});
   if(result.kind==='CONFIRMED'){onClose();return;}
   setHeld(result.kind==='PENDING'||result.kind==='OUTCOME_UNKNOWN');
   if(result.kind==='REJECTED'||result.kind==='CONFLICT'||result.kind==='BLOCKED'||result.kind==='DRAFT_SAVED')submitted.current=false;
   setNotice('message'in result?result.message:result.kind==='DRAFT_SAVED'?'Check-in was saved as a draft. The room and payment are not confirmed.':'Check-in is awaiting the original server outcome. Do not take this cash or submit again.');
  }catch{setHeld(true);setNotice('The check-in outcome needs recovery. Inspect the original command in Activity before receiving more cash.');}
  finally{inFlight.current=false;setBusy(false);}
 };
 return <Dialog title={upfront?'Cash upfront and check in':'Check in guest'} onClose={()=>{if(!busy)onClose();}}><form onSubmit={event=>void confirm(event)} className="space-y-4" data-guide-anchor="hospitality.check-in">
  <p className="text-sm">{safeName(guest?.data.name,'Guest')} · Room {safeName(room?.data.number,'Not available')}</p>
  {upfront?<><p className="rounded-xl border border-slate-700 p-3 text-sm">Remaining booked accommodation <strong className="block text-xl">{money(due)}</strong>{due===0?'Existing cash evidence will be checked. Do not receive the same money again.':'Cash settlement and room check-in are committed together after the server validates the booking and your drawer.'}</p>{due>0&&<><FormField label="Cash account"><select className={ds.input} value={accountId} disabled={busy||held||Boolean(pending)} onChange={event=>setAccountId(event.target.value)}><option value="">Choose account</option>{accounts.map(r=><option key={r.id} value={r.id}>{safeName(r.data.name,'Cash account')}</option>)}</select></FormField><FormField label="Cash received (KES)" hint="Count the physical cash before confirming."><input className={ds.input} inputMode="decimal" value={cash} disabled={busy||held||Boolean(pending)} onChange={event=>setCash(event.target.value)} autoComplete="off"/></FormField><p>Change <strong>{money(tender===null?0:Math.max(0,tender-due))}</strong></p></>}</>:<p className="text-sm text-slate-400">This booking retains its existing folio workflow. Payment is recorded separately in Guest Accounts.</p>}
  {(blocker||notice||pending)&&<p role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm">{pending?'The original check-in command is still awaiting confirmation. Use Activity to recover it.':notice||blocker}</p>}
  {(held||pending)&&onActivity&&<button className={ds.button} type="button" onClick={onActivity}>Open Activity and recover</button>}
  <button className={ds.buttonPrimary} aria-busy={busy} disabled={disabled||busy||held||Boolean(pending)||Boolean(blocker)||upfront&&due>0&&(tender===null||tender<due)}>{busy?'Awaiting server…':upfront&&due>0?`Receive ${money(due)} and check in`:'Confirm check-in'}</button>
 </form></Dialog>;
}
