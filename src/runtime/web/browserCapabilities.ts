export type BrowserSupport = {mode:'Full'|'Online only'|'Unsupported'; missing:string[]};

/** Feature probes never grant cashier authority or promise disk durability. */
export async function inspectBrowserCapabilities():Promise<BrowserSupport>{
 const missing:string[]=[];
 if(!window.isSecureContext)missing.push('Secure connection');
 if(!globalThis.crypto?.subtle)missing.push('Secure cryptography');
 else try{await crypto.subtle.digest('SHA-256',new Uint8Array([1]));}catch{missing.push('Secure cryptography');}
 try{
  const name=`servos-capability-${Date.now()}-${Math.random()}`;
  await new Promise<void>((resolve,reject)=>{
   const request=indexedDB.open(name,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('probe');
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(new Error('Storage blocked'));
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('probe','readwrite'),store=tx.objectStore('probe');
    store.put('saved','key');const read=store.get('key');
    read.onsuccess=()=>{if(read.result!=='saved')tx.abort();};
    tx.oncomplete=()=>{db.close();const deletion=indexedDB.deleteDatabase(name);deletion.onsuccess=()=>resolve();deletion.onerror=()=>reject(deletion.error);deletion.onblocked=()=>reject(new Error('Storage blocked'));};
    tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};
   };
  });
 }catch{missing.push('Local transaction storage');}
 try{new Intl.DateTimeFormat('en-KE',{timeZone:'Africa/Nairobi'}).format(new Date());}catch{missing.push('Local date formatting');}
 if(!('serviceWorker' in navigator)||!('caches' in window))missing.push('Offline application support');
 if(!('locks' in navigator))missing.push('Exclusive checkout locking');
 if(!('print' in window))missing.push('Browser printing');
 const unsupported=missing.some(value=>['Secure connection','Secure cryptography','Local transaction storage','Local date formatting'].includes(value));
 return {mode:unsupported?'Unsupported':missing.length?'Online only':'Full',missing};
}
