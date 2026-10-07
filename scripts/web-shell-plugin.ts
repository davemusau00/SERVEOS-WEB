import {createHash} from 'node:crypto';
import type {Plugin} from 'vite';

export function webShellPlugin():Plugin {
  return {name:'servos-offline-shell',apply:'build',enforce:'post',generateBundle(_options,bundle){
    const assets=Object.keys(bundle).filter(file=>/\.(js|css|woff2?|png|svg|ico)$/.test(file)).map(file=>`/${file}`);
    const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,16);
    const source=`const CACHE=${JSON.stringify(`servos-shell-${version}`)};
const ASSETS=${JSON.stringify(['/index.html','/manifest.webmanifest',...assets])};
const ALLOWED=new Set(ASSETS);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// Do not force activation over active tabs. A new worker waits until the current
// client releases it at a safe application boundary.
let activationPending=false;
self.addEventListener('message',event=>{
 if(event.data?.type==='SERVOS_ACTIVATE_UPDATE')event.waitUntil((async()=>{
  if(activationPending)return;activationPending=true;
  try{
   const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   const safe=await Promise.all(clients.map(client=>new Promise(resolve=>{
    const channel=new MessageChannel();
    const finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value)};
    const timer=setTimeout(()=>finish(false),3000);
    channel.port1.onmessage=reply=>finish(reply.data?.safe===true);
    client.postMessage({type:'SERVOS_CHECK_UPDATE_BOUNDARY'},[channel.port2]);
   })));
   if(safe.every(Boolean))await self.skipWaiting();
   else {clients.forEach(client=>client.postMessage({type:'SERVOS_RELEASE_UPDATE_BOUNDARY'}));event.source?.postMessage({type:'SERVOS_UPDATE_DEFERRED'});}
  }catch(error){
   const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   clients.forEach(client=>client.postMessage({type:'SERVOS_RELEASE_UPDATE_BOUNDARY'}));
   event.source?.postMessage({type:'SERVOS_UPDATE_DEFERRED'});
  }finally{activationPending=false}
 })());
});
self.addEventListener('activate',event=>event.waitUntil(self.clients.matchAll({type:'window'}).then(clients=>clients.forEach(client=>client.postMessage({type:'SERVOS_SW_READY',cache:CACHE})))));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.has('Authorization'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).catch(()=>caches.open(CACHE).then(cache=>cache.match('/index.html')).then(response=>response||Response.error())));return;
 }
 if(!ALLOWED.has(url.pathname))return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(req)));
});`;
    this.emitFile({type:'asset',fileName:'sw.js',source});
  }};
}
