import type {ApiAuthenticatedDeviceSession} from './apiAuth';
import type {BusinessRecord} from './session';
import type {CommandOutcome} from '../../types/transactions';
import {sendBridgeAction,retainBridgeObservation,type BridgeRequestEvidence} from './printBridgeTransport';
/** Matches Rust UUID v5 namespace/job + domain/attempt; identity only, never a signature. */
async function localAttemptId(jobId:string,attempt:number):Promise<string>{
 const hex=jobId.replace(/-/g,'');if(!/^[0-9a-f]{32}$/.test(hex))throw new Error('Invalid original job identity.');
 const namespace=Uint8Array.from(hex.match(/../g)!,byte=>parseInt(byte,16));
 const name=new TextEncoder().encode(`SERVOS_PRINT_ATTEMPT_V1:${attempt}`),bytes=new Uint8Array(namespace.length+name.length);
 bytes.set(namespace);bytes.set(name,namespace.length);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-1',bytes)).slice(0,16);digest[6]=(digest[6]&15)|80;digest[8]=(digest[8]&63)|128;
 const value=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
export async function reconcileBridgeDelivery(input:{auth:ApiAuthenticatedDeviceSession;evidence:BridgeRequestEvidence;readRecords:()=>Promise<BusinessRecord[]>;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>}):Promise<CommandOutcome>{
 const {auth,evidence,readRecords,command}=input;
 if(evidence.action!=='SUBMIT'||!evidence.apiJobId||!Number.isSafeInteger(evidence.apiAttempt)||Number(evidence.apiAttempt)<1||!Number.isSafeInteger(evidence.claimedJobRevision)||evidence.businessId!==auth.profile.businessId||evidence.deviceId!==auth.identity.deviceId)throw new Error('Original submission lacks matching attempt evidence. Preserve it and review the shared job manually.');
 const expectedId=await localAttemptId(evidence.apiJobId,evidence.apiAttempt!);
 const result=await sendBridgeAction({bridgeId:evidence.bridgeId,businessId:evidence.businessId,origin:evidence.bridgeOrigin},auth.identity,{action:'STATUS',jobId:expectedId});
 await retainBridgeObservation(evidence.requestId,result.requestId);
 if(result.response?.state!=='STATUS'||!result.response.delivery||result.response.delivery.jobId!==expectedId)throw new Error('No matching current local delivery evidence. Nothing was reported.');
 const delivery=result.response.delivery;
 const knownNoOutput=delivery.state==='FAILED';
 if(!knownNoOutput&&!['SENT_TO_SPOOLER','DELIVERY_UNCERTAIN'].includes(delivery.state))throw new Error('Local transport has no reportable terminal outcome. Review before retrying.');
 const job=(await readRecords()).find(row=>row.collection==='printJobs'&&row.id===evidence.apiJobId);
 if(!job||job.version!==evidence.claimedJobRevision||job.data.attempt!==evidence.apiAttempt||job.data.state!=='SENDING'||job.data.claimedBy!==auth.profile.staffId||job.data.claimedDeviceId!==auth.identity.deviceId)throw new Error('The API attempt changed or is already reported. Synchronize and review its current state.');
 return command('print.report','printJobs',job.id,{jobId:job.id,outcome:delivery.state,
  ...(knownNoOutput?{transportStarted:false}:delivery.state==='SENT_TO_SPOOLER'?{transportStarted:true}:{}),reason:`Recovered bridge request ${evidence.requestId}: ${knownNoOutput?'known pre-output failure':delivery.state==='SENT_TO_SPOOLER'?'spooler accepted output; paper delivery is unconfirmed':'paper delivery requires operator confirmation'}.`,
  expectedVersions:[{collection:'printJobs',id:job.id,version:job.version}]});
}
