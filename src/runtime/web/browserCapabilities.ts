export type BrowserSupport = {mode:'Full'|'Online only'|'Unsupported'; missing:string[]};
export function modernBrowserBaseline(agent:string):boolean{
 if(/\bwv\b|MSIE|Trident\//.test(agent))return false;
 const edge=agent.match(/Edg\/(\d+)/),chrome=agent.match(/Chrome\/(\d+)/),firefox=agent.match(/Firefox\/(\d+)/),safari=agent.match(/Version\/(\d+)\.(\d+).*Safari\//);
 if(edge)return Number(edge[1])>=111;if(chrome)return Number(chrome[1])>=111;if(firefox)return Number(firefox[1])>=114;
 return Boolean(safari&&(Number(safari[1])>16||Number(safari[1])===16&&Number(safari[2])>=4));
}

/** Feature probes never grant cashier authority or promise disk durability. */
export async function inspectBrowserCapabilities():Promise<BrowserSupport>{
 const missing:string[]=[];
 if(!window.isSecureContext)missing.push('Secure connection');
 if(!globalThis.crypto?.subtle)missing.push('Secure cryptography');
 else try{
  await crypto.subtle.digest('SHA-256',new Uint8Array([1]));
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']),bytes=new Uint8Array([1]);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,bytes);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,signature,bytes))throw Error();
  if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}});
 }catch{missing.push('Secure cryptography');}
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
 if(typeof CSS==='undefined'||!CSS.supports('color','oklch(50% 0.1 120)'))missing.push('Modern display support');
 if(!modernBrowserBaseline(navigator.userAgent))missing.push('Browser version needs online-only acceptance');
 const unsupported=missing.some(value=>['Secure connection','Secure cryptography','Local transaction storage','Local date formatting'].includes(value));
 return {mode:unsupported?'Unsupported':missing.length?'Online only':'Full',missing};
}
