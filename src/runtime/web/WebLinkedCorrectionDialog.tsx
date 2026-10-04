import React from 'react';
import {LinkedCorrectionDialog} from '../../native/ReceiptCorrectionDialog';
import type {RuntimeSnapshot} from '../../types/runtime';
import type {CommandOutcome} from '../../types/transactions';
import type {BusinessRecord,WebSession} from './session';

export function WebLinkedCorrectionDialog({records,session,record,movement,onClose,command}:{records:BusinessRecord[];session:WebSession;record:BusinessRecord;movement?:boolean;onClose:()=>void;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>}){
  const prefix=`servos-linked-outcome:${session.businessId}:${session.actorId}:`;
  const runtime={snapshot:{records,terminalId:session.businessId,actor:{id:session.actorId}} as RuntimeSnapshot,
    correctionCommandStatus:async(id:string)=>{const status=localStorage.getItem(prefix+id);return status==='CONFIRMED'?'SYNCHRONIZED':status==='REJECTED'||status==='CONFLICT'?status:'PENDING';},
    command:async(operation:string,payload:Record<string,unknown>,_version?:number,id?:string)=>{
      if(!navigator.onLine)throw new Error('Connect before submitting this correction; the review is saved');
      localStorage.setItem(prefix+id,'PENDING');
      const outcome=await command(operation,movement?'movementCorrections':'receiptCorrections',id!,{...payload,reviewCommandId:id});
      localStorage.setItem(prefix+id,outcome.kind);
      if(outcome.kind!=='CONFIRMED')throw new Error('message' in outcome?outcome.message:'Synchronize the original correction in Activity');
    },
  };
  return <LinkedCorrectionDialog runtime={runtime} receipt={{...record.data,id:record.id}} movement={movement} onClose={onClose}/>;
}
