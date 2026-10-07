import type {BridgeAction} from './printBridgeActions';
import type {WebDeviceIdentity} from './deviceIdentity';
export interface SignedBridgeRequest {
 bridgeId:string;businessId:string;deviceId:string;origin:string;requestId:string;
 issuedAtUnix:number;expiresAtUnix:number;payloadJson:string;signature:string;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Pairing, typed action validation and local HTTPS transport are separate boundaries. */
export async function signPrintBridgeRequest(identity:WebDeviceIdentity,bridgeId:string,businessId:string,payload:BridgeAction):Promise<SignedBridgeRequest>{
 const origin=window.location.origin;
 if(!globalThis.isSecureContext||!origin.startsWith('https://'))throw new Error('Print Bridge signing requires a trusted HTTPS PWA origin.');
 if(![bridgeId,businessId,identity.deviceId].every(id=>uuid.test(id)))throw new Error('Bridge, business and device IDs must be canonical UUIDs.');
 const payloadJson=JSON.stringify(payload),encoder=new TextEncoder();
 if(!payloadJson||encoder.encode(payloadJson).byteLength>1024*1024)throw new Error('Print Bridge payload exceeds 1 MiB.');
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode(payloadJson));
 const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 const requestId=crypto.randomUUID(),issuedAtUnix=Math.floor(Date.now()/1000),expiresAtUnix=issuedAtUnix+60;
 const message=['SERVOS_PRINT_BRIDGE_V1',bridgeId,businessId,identity.deviceId,origin,requestId,String(issuedAtUnix),String(expiresAtUnix),hash].join('\n');
 const bytes=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.privateKey,encoder.encode(message));
 const signature=btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 return {bridgeId,businessId,deviceId:identity.deviceId,origin,requestId,issuedAtUnix,expiresAtUnix,payloadJson,signature};
}
