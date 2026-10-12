import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {pos2Capabilities} from '../apps/api/src/pos2-capabilities.mjs';
import {validatePushSubscription} from '../apps/api/src/operational-alerts.mjs';

test('operational capabilities default off and never grant financial permissions',()=>{
 const actor={businessId:'b',staffId:'s',deviceId:'d',permissions:['ticket.create']};
 for(const name of ['operations.inbox','operations.references','operations.push'])assert.equal(pos2Capabilities(actor)[name],false);
});
test('push subscription endpoints reject local, credential-bearing and unrelated hosts',()=>{
 const subscription=endpoint=>({endpoint,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}});
 for(const endpoint of ['http://fcm.googleapis.com/push','https://127.0.0.1/push','https://fcm.googleapis.com.evil.invalid/push','https://user:password@fcm.googleapis.com/push','https://fcm.googleapis.com:8443/push'])assert.throws(()=>validatePushSubscription(subscription(endpoint)));
 for(const endpoint of ['https://fcm.googleapis.com/push','https://updates.push.services.mozilla.com/push','https://web.push.apple.com/push','https://wns2.notify.windows.com/push'])assert.doesNotThrow(()=>validatePushSubscription(subscription(endpoint)));
});
test('service worker shows generic push and opens an authenticated inbox without financial actions',async()=>{
 const code=transformSync(readFileSync('scripts/web-shell-plugin.ts','utf8'),{loader:'ts',format:'esm'}).code;
 const {webShellPlugin}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 let source;webShellPlugin().generateBundle.call({emitFile:asset=>{source=asset.source;}},{},{'print-assets.js':{},'app.js':{}});
 const handlers={},shown=[],messages=[];let focused=0,opened=0;
 const self={location:{origin:'https://serveos.example'},addEventListener:(name,handler)=>{handlers[name]=handler;},registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>[{url:'https://serveos.example/',focus:async()=>{focused++;},postMessage:data=>messages.push(data)}],openWindow:async()=>{opened++;}}};
 vm.runInNewContext(source,{self,URL,Set,MessageChannel,setTimeout,clearTimeout});
 const eventId='123e4567-e89b-42d3-a456-426614174000';let pending;
 handlers.push({data:{json:()=>({eventId,body:'QAZ1234567 customer KES 900'})},waitUntil:p=>pending=p});await pending;
 assert.equal(shown.length,1);assert.equal(shown[0].body,'Open ServOS to review an operational update.');assert.equal(shown[0].icon,'/icons/servos-192.svg');assert.ok(!JSON.stringify(shown).includes('QAZ1234567'));
 handlers.push({data:{json:()=>({eventId:'unsafe'})},waitUntil:p=>pending=p});await pending;assert.equal(shown.length,1);
 handlers.notificationclick({notification:{data:{eventId},close(){}},waitUntil:p=>pending=p});await pending;assert.equal(focused,1);assert.equal(opened,0);assert.equal(messages[0].type,'SERVOS_OPEN_ALERT');
 self.clients.matchAll=async()=>[];self.clients.openWindow=async path=>{assert.equal(path,'/#/?alert='+eventId);opened++;};handlers.notificationclick({notification:{data:{eventId},close(){}},waitUntil:p=>pending=p});await pending;assert.equal(opened,1);
});
