import type {ApiAuthenticatedDeviceSession} from './apiAuth';
import type {BusinessRecord} from './session';
import type {CommandOutcome} from '../../types/transactions';
import type {ApiBridgeAuthorization,BridgeAction,BridgeDocument,BridgePrinterRole} from './printBridgeActions';
import {sendBridgeAction,type ApprovedBridge,type BridgeRequestEvidence} from './printBridgeTransport';
type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid API print claim result.');return value as Record<string,unknown>;}
function canonical(value:unknown):string{
 if(value===null||typeof value!=='object'){const encoded=JSON.stringify(value);if(encoded===undefined)throw new Error('Unsupported immutable document value.');return encoded;}
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 const fields=value as Record<string,unknown>;return `{${Object.keys(fields).sort().map(key=>`${JSON.stringify(key)}:${canonical(fields[key])}`).join(',')}}`;
}
export type BridgeSubmissionResult=
 |{kind:'CLAIM_UNRESOLVED';outcome:CommandOutcome}
 |{kind:'BRIDGE_RESPONSE';evidence:BridgeRequestEvidence;report?:CommandOutcome};
/** Uses the normal persisted command/outbox path. Never issues a second claim after response loss. */
export async function submitDocumentToBridge(input:{auth:ApiAuthenticatedDeviceSession;bridge:ApprovedBridge;job:BusinessRecord;document:BusinessRecord;command:Command;readRecords:()=>Promise<BusinessRecord[]>}):Promise<BridgeSubmissionResult>{
 const {auth,bridge,job,document,command,readRecords}=input;
 if(bridge.businessId!==auth.profile.businessId||job.collection!=='printJobs'||document.collection!=='businessDocuments'||job.data.documentId!==document.id||job.data.state!=='QUEUED')throw new Error('Review the current queued job and issued document before bridge printing.');
 // Current renderer acceptance is intentionally explicit; refuse before claiming unsupported layouts.
 if(document.data.layoutVersion!==1||!['SUPPLIER_RETURN_NOTE','SUPPLIER_PAYMENT_VOUCHER','GOODS_RECEIPT','PURCHASE_ORDER','CLOSE_DAY_REPORT','SALES_RECEIPT','PAYMENT_ACKNOWLEDGEMENT','REFUND_RECEIPT','KOT','BOT','KOT_CANCEL','BOT_CANCEL','ORDER_VOID_NOTICE','CUSTOMER_CREDIT_INVOICE','CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT','CUSTOMER_CREDIT_WRITE_OFF_NOTICE','CUSTOMER_CREDIT_REVERSAL_NOTICE'].includes(String(document.data.type)))throw new Error('This document requires browser printing until its bridge layout is supported.');
 const outcome=await command('print.claim','printJobs',job.id,{jobId:job.id,bridgeId:bridge.bridgeId,expectedVersions:[{collection:'printJobs',id:job.id,version:job.version}]});
 if(outcome.kind!=='CONFIRMED')return {kind:'CLAIM_UNRESOLVED',outcome};
 // Attestation is deliberately absent from shared feed. Retrieve the original command outcome.
 const saved=await auth.client.commandStatus(outcome.commandId);
 if(saved.status!=='CONFIRMED'||saved.outcome?.kind!=='CONFIRMED'||saved.outcome.commandId!==outcome.commandId)throw new Error(`Recover original print claim ${outcome.commandId}; no bridge request was sent.`);
 const result=object(saved.outcome.result),token=object(result.bridgeAuthorization);
 if(result.id!==job.id||result.collection!=='printJobs'||result.version!==job.version+1||typeof token.keyId!=='string'||typeof token.payloadJson!=='string'||typeof token.signature!=='string')throw new Error('Original API claim authorization is unavailable. Review the saved claim without reprinting.');
 const current=(await readRecords()).find(row=>row.collection==='printJobs'&&row.id===job.id);
 if(!current||current.version!==result.version||current.data.state!=='SENDING'||current.data.claimedBy!==auth.profile.staffId||current.data.claimedDeviceId!==auth.identity.deviceId)throw new Error('Synchronize the original claim before reviewing bridge delivery. Nothing was submitted to the bridge.');
 const canonicalSnapshot=canonical(document.data.snapshot);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalSnapshot))),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(hash!==document.data.hash)throw new Error('Immutable document hash does not match. No bridge request was sent.');
 const bridgeDocument:BridgeDocument={id:document.id,documentType:document.data.type as BridgeDocument['documentType'],documentNumber:String(document.data.documentNumber),layoutVersion:1,hash,canonicalSnapshot};
 const copies=current.data.copies??1;if(copies!==1&&copies!==2)throw new Error('Unsupported print copy count.');
 const action:BridgeAction={action:'SUBMIT',jobId:job.id,claimedJobRevision:current.version,printerRole:current.data.printerRole as BridgePrinterRole,copies,document:bridgeDocument,authorization:token as unknown as ApiBridgeAuthorization};
 const evidence=await sendBridgeAction(bridge,auth.identity,action);
 // Even successful local transport remains uncertain on the shared business authority.
 // Missing/refused/recovery responses leave SENDING intact for explicit reconciliation.
 if(evidence.response?.state==='RECORDED'){
  const delivery=evidence.response.delivery;
  if(['FAILED','SENT_TO_SPOOLER','DELIVERY_UNCERTAIN'].includes(delivery.state)){
   const knownNoOutput=delivery.state==='FAILED';
   const report=await command('print.report','printJobs',job.id,{jobId:job.id,
    outcome:delivery.state,...(knownNoOutput?{transportStarted:false}:delivery.state==='SENT_TO_SPOOLER'?{transportStarted:true}:{}),
    reason:knownNoOutput?'Bridge recorded failure before output; review before a new attempt.':delivery.state==='SENT_TO_SPOOLER'?'Bridge transport accepted output; physical paper delivery remains unconfirmed.':'Bridge transport may have produced output; operator confirmation is required.',
    expectedVersions:[{collection:'printJobs',id:job.id,version:current.version}]});
   return {kind:'BRIDGE_RESPONSE',evidence,report};
  }
 }
 return {kind:'BRIDGE_RESPONSE',evidence};
}
