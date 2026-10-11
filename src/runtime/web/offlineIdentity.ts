import {verifyCashLease,type OfflineCashLease} from './offlineCashLedger';
export interface LockedOfflineIdentity {version:1;salt:number[];iv:number[];ciphertext:number[];failures:number;lockedUntil:number}
const pinKey=async(pin:string,salt:Uint8Array<ArrayBuffer>)=>{
 if(!/^\d{6,12}$/.test(pin))throw Error('Use a kiosk PIN with 6 to 12 digits.');
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
};
export async function lockOfflineIdentity(pin:string,lease:OfflineCashLease,operatorName:string):Promise<LockedOfflineIdentity>{
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await pinKey(pin,salt);
 // Whitelisted identity only. Access/refresh tokens and passwords are never accepted.
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({lease,operatorName:operatorName.slice(0,160)})));
 return {version:1,salt:[...salt],iv:[...iv],ciphertext:[...new Uint8Array(ciphertext)],failures:0,lockedUntil:0};
}
export async function unlockOfflineIdentity(pin:string,locked:LockedOfflineIdentity,publicKey:JsonWebKey,identity:{businessId:string;deviceId:string;staffId:string}){
 if(locked.version!==1||locked.lockedUntil>Date.now())throw Error('Kiosk PIN is locked. Wait before trying again.');
 const key=await pinKey(pin,new Uint8Array(locked.salt));
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(locked.iv)},key,new Uint8Array(locked.ciphertext));
 const result=JSON.parse(new TextDecoder().decode(bytes)) as {lease:OfflineCashLease;operatorName:string};
 if(!(await verifyCashLease(result.lease,publicKey,identity)))throw Error('Cached checkout authority is expired or invalid. Reconnect to renew it.');
 return result;
}
