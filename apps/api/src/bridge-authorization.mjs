import {PRINT_PERMISSIONS} from './print-permissions.mjs';
import {visibleRecord} from './projection-access.mjs';
import {createPrivateKey,createPublicKey,createHash,sign,verify} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
/** Sign only inside the authoritative print.claim transaction. Never send the key to clients. */
export function authorizeBridgeClaim({actor,command,job,document,bridgeId,at}){
 const raw=process.env.PRINT_BRIDGE_PRIVATE_JWK,keyId=process.env.PRINT_BRIDGE_KEY_VERSION;
 if(!raw||!keyId)throw new ApiProblem(503,'BRIDGE_SIGNING_UNAVAILABLE','API Print Bridge signing is not configured. Use browser printing.');
 let key;
 try{const jwk=JSON.parse(raw);if(jwk.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.d!=='string')throw new Error();key=createPrivateKey({key:jwk,format:'jwk'});}catch{throw new ApiProblem(503,'BRIDGE_SIGNING_UNAVAILABLE','API Print Bridge signing configuration is invalid.');}
 if(!/^[A-Za-z0-9._-]{1,80}$/.test(keyId))throw new ApiProblem(503,'BRIDGE_SIGNING_UNAVAILABLE','API Print Bridge key version is invalid.');
 const issuedAtUnix=Math.floor(at.getTime()/1000);
 const payloadJson=JSON.stringify({protocolVersion:1,businessId:actor.businessId,deviceId:actor.deviceId,staffId:actor.staffId,bridgeId,jobId:job.id,jobVersion:Number(job.version),attempt:Number(job.attempt),documentId:job.documentId,documentType:document.type,documentNumber:document.documentNumber,layoutVersion:document.layoutVersion,documentHash:document.hash,printerRole:job.printerRole,copies:job.copies,commandId:command.commandId,issuedAtUnix,expiresAtUnix:issuedAtUnix+120});
 const signature=sign('sha256',Buffer.from(`SERVOS_API_PRINT_CLAIM_V1\n${keyId}\n${payloadJson}`),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return {keyId,payloadJson,signature};
}


/** Read-only capability check: it cannot renew, reclaim, retry or report a print job. */
export async function checkBridgeClaim(pool,token,at=new Date()){
 const denied=()=>{throw new ApiProblem(401,'INVALID_BRIDGE_CLAIM','A valid unexpired API bridge claim is required.');};
 if(!token||typeof token!=='object'||Array.isArray(token)||Object.keys(token).sort().join(',')!=='keyId,payloadJson,signature'||typeof token.payloadJson!=='string'||token.payloadJson.length>8192||typeof token.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(token.signature))denied();
 let key;
 try{key=createPrivateKey({key:JSON.parse(process.env.PRINT_BRIDGE_PRIVATE_JWK||''),format:'jwk'});}catch{throw new ApiProblem(503,'BRIDGE_SIGNING_UNAVAILABLE','API Print Bridge signing is not configured.');}
 if(token.keyId!==process.env.PRINT_BRIDGE_KEY_VERSION||!verify('sha256',Buffer.from(`SERVOS_API_PRINT_CLAIM_V1\n${token.keyId}\n${token.payloadJson}`),{key:createPublicKey(key),dsaEncoding:'ieee-p1363'},Buffer.from(token.signature,'base64url')))denied();
 let claim;try{claim=JSON.parse(token.payloadJson);}catch{denied();}
 const now=Math.floor(at.getTime()/1000);
 if(claim?.protocolVersion!==1||!Number.isSafeInteger(claim.issuedAtUnix)||!Number.isSafeInteger(claim.expiresAtUnix)||claim.issuedAtUnix>now+30||claim.expiresAtUnix<=now||claim.expiresAtUnix-claim.issuedAtUnix>120)denied();
 const {rows}=await pool.query(`SELECT COALESCE((SELECT array_agg(p.permission) FROM api_staff_permissions p WHERE p.business_id=j.business_id AND p.staff_id=j.claimed_by),'{}'::text[]) AS permissions,j.state,j.version,j.attempt,j.claimed_by AS "staffId",j.claimed_device_id AS "deviceId",j.document_id AS "documentId",j.printer_role AS "printerRole",j.copies,d.document_type AS "documentType",d.document_number AS "documentNumber",d.layout_version AS "layoutVersion",d.snapshot_hash AS "documentHash",s.active AS "staffActive",e.revoked_at AS "deviceRevokedAt",CASE WHEN d.document_type IN ('KOT','BOT') THEN EXISTS(SELECT 1 FROM pos_orders o WHERE o.business_id=j.business_id AND o.id::text=(d.snapshot->>'orderId') AND o.state<>'VOIDED') ELSE true END AS "orderActive" FROM document_print_jobs j JOIN business_documents d ON d.business_id=j.business_id AND d.id=j.document_id JOIN api_staff_profiles s ON s.business_id=j.business_id AND s.staff_id=j.claimed_by JOIN api_enrolled_devices e ON e.business_id=j.business_id AND e.id=j.claimed_device_id AND e.staff_id=j.claimed_by WHERE j.business_id=$1 AND j.id=$2`,[claim.businessId,claim.jobId]);
 const job=rows[0];
 const permissions=job?.permissions??[];
 const permitted=(permissions.includes('*')||PRINT_PERMISSIONS.some(permission=>permissions.includes(permission)))&&Boolean(job&&visibleRecord({staffId:claim.staffId,permissions},{collection:'businessDocuments',data:{type:job.documentType}}));
 const active=Boolean(permitted&&job&&job.state==='SENDING'&&Number(job.version)===claim.jobVersion&&Number(job.attempt)===claim.attempt&&job.staffId===claim.staffId&&job.deviceId===claim.deviceId&&job.documentId===claim.documentId&&job.printerRole===claim.printerRole&&job.copies===claim.copies&&job.documentType===claim.documentType&&job.documentNumber===claim.documentNumber&&job.layoutVersion===claim.layoutVersion&&job.documentHash===claim.documentHash&&job.staffActive&&job.deviceRevokedAt===null&&job.orderActive);
 const payloadJson=JSON.stringify({protocolVersion:1,claimHash:createHash('sha256').update(token.payloadJson).digest('hex'),active,checkedAtUnix:now,expiresAtUnix:Math.min(now+5,claim.expiresAtUnix)});
 const signature=sign('sha256',Buffer.from(`SERVOS_API_PRINT_CHECK_V1\n${token.keyId}\n${payloadJson}`),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return {keyId:token.keyId,payloadJson,signature};
}
