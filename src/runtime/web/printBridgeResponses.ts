export interface BridgeDelivery {
 jobId:string;envelopeHash:string;state:'QUEUED'|'SENDING'|'SENT_TO_SPOOLER'|'DELIVERY_UNCERTAIN'|'FAILED'|'CANCELLED';
 revision:number;attempt:number;detail:string;
}
export type BridgeResponse=
 |{state:'RECORDED';delivery:BridgeDelivery}
 |{state:'STATUS';delivery:BridgeDelivery|null}
 |{state:'NOT_FOUND'}
 |{state:'COMPLETED';response:BridgeResponse}
 |{state:'RECONCILIATION_REQUIRED';attempt:{localJobId:string;delivery:BridgeDelivery|null}|null;mayReplay:false;code?:'SUBMISSION_NOT_CONFIRMED'}
 |{state:'REFUSED';code:'API_REVIEW_REQUIRED';message:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid bridge response.');return value as Record<string,unknown>;}
function keys(value:Record<string,unknown>,allowed:string[]){if(Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('Unexpected bridge response field.');}
function delivery(value:unknown):void{
 const row=object(value);keys(row,['jobId','envelopeHash','state','revision','attempt','detail']);
 if(typeof row.jobId!=='string'||!uuid.test(row.jobId)||typeof row.envelopeHash!=='string'||!/^[0-9a-f]{64}$/.test(row.envelopeHash)||
 !['QUEUED','SENDING','SENT_TO_SPOOLER','DELIVERY_UNCERTAIN','FAILED','CANCELLED'].includes(String(row.state))||
 !Number.isSafeInteger(row.revision)||Number(row.revision)<1||!Number.isSafeInteger(row.attempt)||Number(row.attempt)<0||
 typeof row.detail!=='string'||row.detail.length>2000||/[\u0000-\u001f\u007f]/.test(row.detail))throw new Error('Invalid bridge delivery evidence.');
}
export function parseBridgeResponse(value:unknown,depth=0):BridgeResponse{
 if(depth>4)throw new Error('Bridge recovery nesting exceeds supported bounds.');
 const row=object(value);
 switch(row.state){
 case 'RECORDED':keys(row,['state','delivery']);delivery(row.delivery);break;
 case 'STATUS':keys(row,['state','delivery']);if(row.delivery!==null)delivery(row.delivery);break;
 case 'NOT_FOUND':keys(row,['state']);break;
 case 'COMPLETED':keys(row,['state','response']);parseBridgeResponse(row.response,depth+1);break;
 case 'REFUSED':keys(row,['state','code','message']);if(row.code!=='API_REVIEW_REQUIRED'||typeof row.message!=='string'||row.message.length>1000)throw new Error('Invalid bridge refusal.');break;
 case 'RECONCILIATION_REQUIRED':
  keys(row,['state','attempt','mayReplay','code']);
  if(row.mayReplay!==false||(row.code!==undefined&&row.code!=='SUBMISSION_NOT_CONFIRMED'))throw new Error('Invalid bridge recovery policy.');
  if(row.attempt!==null){const attempt=object(row.attempt);keys(attempt,['localJobId','delivery']);if(typeof attempt.localJobId!=='string'||!uuid.test(attempt.localJobId))throw new Error('Invalid local attempt.');if(attempt.delivery!==null)delivery(attempt.delivery);}
  break;
 default:throw new Error('Unsupported bridge response state.');
 }
 return value as BridgeResponse;
}
