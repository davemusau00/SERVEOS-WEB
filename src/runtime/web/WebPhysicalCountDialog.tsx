import React, { useMemo, useState } from 'react';
import { PhysicalCountDialog } from '../../native/BottleCountDialog';
import type { InventoryCountDraft } from '../RuntimeProvider';
import type { RuntimeSnapshot } from '../../types/runtime';
import type { CommandOutcome } from '../../types/transactions';
import type { BusinessRecord, WebSession } from './session';

export function WebPhysicalCountDialog({ records, session, scope, locationId, command, onClose }: {
  records:BusinessRecord[];session:WebSession;scope:'FULL'|'SELECTED';locationId:string;
  command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;onClose:()=>void;
}) {
  const [error,setError]=useState('');
  const key=(location:string)=>`servos-web-physical-count:${session.businessId}:${session.actorId}:${location}`;
  const snapshot={records} as RuntimeSnapshot;
  const runtime={snapshot,
    inventoryCountDraft:async(location:string)=>{
      const draft=JSON.parse(localStorage.getItem(key(location))||'null') as InventoryCountDraft|null;
      const commandId=draft?.pendingCommand?.id;
      if(commandId&&records.some(record=>record.collection==='stockCounts'&&!record.archived&&record.data.sourceCommandId===commandId)){
        localStorage.removeItem(key(location));localStorage.removeItem(`${key(location)}:outcome`);
        return null;
      }
      return draft;
    },
    saveInventoryCountDraft:async(location:string,draft:InventoryCountDraft)=>{localStorage.setItem(key(location),JSON.stringify(draft));return draft;},
    clearInventoryCountDraft:async(location:string)=>{
      const draft=JSON.parse(localStorage.getItem(key(location))||'null') as InventoryCountDraft|null;
      if(draft?.pendingCommand){const outcome=localStorage.getItem(`${key(location)}:outcome`);if(!['CONFIRMED','REJECTED','CONFLICT','BLOCKED'].includes(outcome||''))throw new Error('Synchronize the original command before discarding this review');}
      localStorage.removeItem(key(location));localStorage.removeItem(`${key(location)}:outcome`);
    },
  };
  const active=useMemo(()=>records.filter(record=>!record.archived),[records]);
  return <><PhysicalCountDialog runtime={runtime} stocks={active.filter(record=>record.collection==='stockItems').map(record=>({...record.data,id:record.id}))} products={active.filter(record=>record.collection==='products').map(record=>({...record.data,id:record.id}))} locations={active.filter(record=>record.collection==='stockLocations').map(record=>({...record.data,id:record.id}))} initialScope={scope} initialLocationId={locationId} onClose={onClose} onCommit={async(operation,payload,id)=>{
    if(!navigator.onLine)throw new Error('Connect before submitting; this physical draft is saved on the browser');
    const location=String(payload.locationId);
    localStorage.setItem(`${key(location)}:outcome`,'PENDING');
    const outcome=await command(operation,'stockCounts',id,{...payload,reviewCommandId:id});
    localStorage.setItem(`${key(location)}:outcome`,outcome.kind);
    if(outcome.kind!=='CONFIRMED'){const message='message' in outcome?outcome.message:'Synchronize the saved command in Activity';setError(message);throw new Error(message);}
    await runtime.clearInventoryCountDraft(location);onClose();
  }}/>{error&&<p role="status" className="text-sm text-amber-200">{error}</p>}</>;
}
