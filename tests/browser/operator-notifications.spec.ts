import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';

const harness=buildSync({stdin:{contents:`
import React from 'react';import{createRoot}from'react-dom/client';import{OperatorNotificationViewport,publishCommandOutcomeNotice,publishOperatorNotice}from'./src/runtime/web/operatorNotifications';
const scope={businessId:'business-test',deviceId:'device-test'};window.notice=(notice)=>publishOperatorNotice({...notice,scope});window.commandNotice=(operation,payload,outcome,canViewStock=true)=>publishCommandOutcomeNotice(operation,payload,outcome,scope,canViewStock);createRoot(document.getElementById('root')).render(React.createElement(OperatorNotificationViewport,{scope}));
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',define:{'process.env.NODE_ENV':'"production"','import.meta.env.VITE_API_OFFLINE_GRANT_PUBLIC_JWK':'null'}}).outputFiles[0].text;

async function mount(page:any){await page.goto('/');await page.waitForFunction(()=>Boolean(document.documentElement.dataset.servosBrowserMode));await page.evaluate(()=>{document.body.innerHTML='<div id="root"></div>';});await page.addScriptTag({content:harness});}

test('notice deduplication is by command and outcome stage; persistent recovery survives toast timeout',async({page})=>{
 await mount(page);
 const notice={id:'fire-1',dedupeKey:'fire-1:conflict',stage:'conflict',severity:'error',title:'Cannot fire: not enough stock for this order',message:'Shortage at Main store.',persistent:true,durationMs:100,action:{label:'Review stock',destination:'stock'}};
 await page.evaluate(notice=>{for(let i=0;i<6;i++)(window as any).notice(notice)},notice);
 await expect(page.getByRole('alert')).toHaveCount(1);await expect(page.getByRole('region',{name:'Needs attention'})).toContainText('Cannot fire');await page.waitForTimeout(180);await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('region',{name:'Needs attention'})).toContainText('Review stock');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('servos:operator-notice-action',{detail:{destination:'stock'}})));
 await page.evaluate(notice=>{for(let i=0;i<6;i++)(window as any).notice(notice)},notice);await expect(page.getByRole('region',{name:'Needs attention'}).getByText('Cannot fire')).toHaveCount(1);
 const next={...notice,stage:'confirmed',severity:'success',title:'Order updated',persistent:false,dedupeKey:'fire-1:confirmed'};await page.evaluate(notice=>(window as any).notice(notice),next);await expect(page.getByRole('region',{name:'Needs attention'})).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'Order updated'})).toHaveCount(1);
});

test('a stock fire conflict maps once to specific recovery and the confirmed retry is a new stage',async({page})=>{
 await mount(page);const rejected={kind:'CONFLICT',commandId:'fire-command-1',message:'Not enough stock to prepare this order.',error:{code:'INSUFFICIENT_STOCK',message:'Not enough stock to prepare this order.',retryable:false,details:{orderId:'order-1'}}};
 await page.evaluate(outcome=>{for(let i=0;i<6;i++)(window as any).commandNotice('order.fire',{orderId:'order-1'},outcome)},rejected);
 await expect(page.getByRole('alert')).toHaveCount(1);await expect(page.getByRole('alert')).toContainText('Cannot fire: not enough stock');await expect(page.getByRole('region',{name:'Needs attention'}).getByRole('button',{name:'Review stock'})).toBeVisible();await expect(page.getByRole('alert')).not.toContainText('stale version');
 await page.evaluate(()=>{const outcome={kind:'CONFIRMED',commandId:'fire-command-2'};(window as any).commandNotice('order.fire',{orderId:'order-1'},outcome)});await expect(page.getByRole('status').filter({hasText:'Items fired'})).toHaveCount(1);await expect(page.getByRole('region',{name:'Needs attention'})).toHaveCount(0);
});

test('a reported M-Pesa reference and uncertain print never claim payment or paper success',async({page})=>{
 await mount(page);await page.evaluate(()=>{(window as any).commandNotice('mpesaReference.submit',{}, {kind:'CONFIRMED',commandId:'reference-1'});(window as any).commandNotice('print.report',{outcome:'DELIVERY_UNCERTAIN'}, {kind:'CONFIRMED',commandId:'print-uncertain-1'});});
 await expect(page.getByRole('status').filter({hasText:'Reference sent for cashier review'})).toContainText('Payment is not confirmed');await expect(page.getByRole('region',{name:'Needs attention'})).toContainText('Printer result uncertain');await expect(page.getByRole('region',{name:'Needs attention'})).not.toContainText('Printed');
});

test('pending cash, unknown outcome and uncertain print use honest stage-specific messages',async({page})=>{
 await mount(page);
 await page.evaluate(()=>{(window as any).notice({id:'cash-1',dedupeKey:'cash-1:local',stage:'local',severity:'warning',title:'Cash recorded on this device. Pending server sync.',persistent:true,scope:{businessId:'business-test',deviceId:'device-test'}});(window as any).notice({id:'fire-2',dedupeKey:'fire-2:unknown',stage:'unknown',severity:'warning',title:'Still checking whether this was saved',message:'Open Activity before trying again.',persistent:true,scope:{businessId:'business-test',deviceId:'device-test'}});(window as any).notice({id:'print-1',dedupeKey:'print-1:uncertain',stage:'unknown',severity:'warning',title:'Printer result uncertain. Check paper before retrying.',persistent:true,scope:{businessId:'business-test',deviceId:'device-test'},action:{label:'Open printer recovery',destination:'printing'}})});
 await expect(page.getByRole('region',{name:'Needs attention'})).toContainText('Pending server sync');await expect(page.getByRole('region',{name:'Needs attention'})).toContainText('Still checking whether this was saved');await expect(page.getByRole('region',{name:'Needs attention'})).toContainText('Printer result uncertain');await expect(page.getByRole('region',{name:'Needs attention'})).not.toContainText('Printed');
});

test('notification stack stays within viewport and does not take focus on compact and mobile layouts',async({page})=>{
 await mount(page);const before=await page.evaluate(()=>document.activeElement?.tagName);
 for(const viewport of [{width:1024,height:600},{width:1280,height:720},{width:768,height:1024},{width:390,height:844}]){await page.setViewportSize(viewport);for(let i=0;i<5;i++)await page.evaluate(i=>(window as any).notice({id:`scan-${i}`,dedupeKey:`scan-${i}`,stage:'pending',severity:'info',title:`Product ${i} added`,durationMs:10000,scope:{businessId:'business-test',deviceId:'device-test'}}),i);await expect(page.getByLabel('New notifications').getByRole('status')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe(before);}
});
