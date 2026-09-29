import {createHash} from 'node:crypto';
import type {Plugin} from 'vite';

export function webShellPlugin():Plugin {
  return {name:'servos-offline-shell',apply:'build',enforce:'post',generateBundle(_options,bundle){
    const assets=Object.keys(bundle).filter(file=>/\.(js|css|woff2?|png|svg|ico)$/.test(file)).map(file=>`/${file}`);
    const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,16);
    const source=`const CACHE=${JSON.stringify(`servos-shell-${version}`)};
const ASSETS=${JSON.stringify(['/index.html',...assets])};
const ALLOWED=new Set(ASSETS);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// Do not force activation over active tabs or delete old caches with pending work.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
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
