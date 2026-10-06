export interface WebDeviceIdentity {deviceId:string;publicKey:JsonWebKey;privateKey:CryptoKey;createdAt:string}

const openRegistry=()=>new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open('servos-pwa-device-identity',1);
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('devices'))request.result.createObjectStore('devices',{keyPath:'businessId'})};
 request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)};
 request.onerror=()=>reject(request.error||new Error('Could not open secure device identity storage'));
});

const readIdentity=(db:IDBDatabase,businessId:string)=>new Promise<WebDeviceIdentity|undefined>((resolve,reject)=>{
 const request=db.transaction('devices','readonly').objectStore('devices').get(businessId);
 request.onsuccess=()=>resolve(request.result?.identity as WebDeviceIdentity|undefined);
 request.onerror=()=>reject(request.error||new Error('Could not read device identity'));
});

async function createIdentity(deviceId:string):Promise<WebDeviceIdentity>{
 const generated=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']) as CryptoKeyPair;
 const publicKey=await crypto.subtle.exportKey('jwk',generated.publicKey);
 const privatePkcs8=await crypto.subtle.exportKey('pkcs8',generated.privateKey);
 const privateKey=await crypto.subtle.importKey('pkcs8',privatePkcs8,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 new Uint8Array(privatePkcs8).fill(0);
 return {deviceId,publicKey,privateKey,createdAt:new Date().toISOString()};
}

/** Store a per-business device key in IndexedDB; private material is non-exportable after creation. */
export async function getOrCreateWebDeviceIdentity(businessId:string,preferredDeviceId?:string):Promise<WebDeviceIdentity>{
 if(!businessId)throw new Error('Business identity is required');
 if(!globalThis.isSecureContext||!crypto?.subtle)throw new Error('Secure browser context with WebCrypto is required for device enrollment');
 const db=await openRegistry();
 try{
  const saved=await readIdentity(db,businessId);if(saved)return saved;
  const candidate=await createIdentity(preferredDeviceId||crypto.randomUUID());
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('devices','readwrite');
   tx.objectStore('devices').add({businessId,identity:candidate});
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('Could not save device identity'));tx.onerror=()=>{};
  }).catch(async error=>{
   const winner=await readIdentity(db,businessId);if(!winner)throw error;
  });
  return (await readIdentity(db,businessId))!;
 }finally{db.close()}
}
