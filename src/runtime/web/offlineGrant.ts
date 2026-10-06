import type {OfflineGrantEnvelope} from './BusinessStore';
import type {createServOSApiClient} from './apiClient';
import type {BusinessStore} from './BusinessStore';

const stableJson=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).filter(key=>key!=='signature').sort().map(key=>`${JSON.stringify(key)}:${stableJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
const fromBase64Url=(encoded:string)=>{
 const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/');const padded=normalized+'='.repeat((4-normalized.length%4)%4);
 return Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
};

/** Verify a server-signed bounded grant before it is persisted to the local device store. */
export async function verifyOfflineGrantSignature(grant:OfflineGrantEnvelope,trustedKeys:Record<string,JsonWebKey>):Promise<boolean>{
 const keyData=trustedKeys[grant.keyVersion];if(!keyData||!grant.signature)return false;
 if(!Number.isSafeInteger(grant.policyVersion)||grant.policyVersion<1||!Array.isArray(grant.allowedCommands)||!grant.allowedCommands.length||new Set(grant.allowedCommands).size!==grant.allowedCommands.length)return false;
 try{
  const key=await crypto.subtle.importKey('jwk',keyData,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,fromBase64Url(grant.signature),new TextEncoder().encode(stableJson(grant)));
 }catch{return false}
}

/** Acquire a short-lived API grant and persist it only after checking its server signature. */
export async function acquireOfflineGrant(client:ReturnType<typeof createServOSApiClient>,store:BusinessStore,trustedKeys:Record<string,JsonWebKey>,input:{allowedCommands?:string[];maxCommands?:number;durationMinutes?:number}={}){
 const grant=await client.issueOfflineGrant(input);
 await store.saveVerifiedOfflineGrant(grant,item=>verifyOfflineGrantSignature(item,trustedKeys));
 return grant;
}
