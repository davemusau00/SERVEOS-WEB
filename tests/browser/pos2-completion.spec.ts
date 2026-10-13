import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';

const harness=buildSync({stdin:{contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {CommandResolutionCard} from './src/runtime/web/CommandResolutionCard';
import {ProcurementWorkflowTabs} from './src/runtime/web/ProcurementWorkflowTabs';
import {visibleWorkspaces} from './src/runtime/web/workspaceRegistry';
const sections=[{id:'orders',label:'Purchase orders',content:React.createElement('p',null,'Order workflow panel')},{id:'receiving',label:'Receive deliveries',content:React.createElement('p',null,'Receiving workflow panel')},{id:'suppliers',label:'Suppliers',content:React.createElement('p',null,'Supplier workflow panel')}];
const records=[{collection:'orders',id:'order-1',version:3,data:{state:'OPEN',items:[{id:'line-1',state:'DRAFT'}]}},{collection:'stockLocations',id:'location-1',version:1,data:{name:'Main store'}}];
const adminSession={businessId:'business',actorId:'admin',enabled:true,permissions:['business.configure','staff.view','devices.manage'],policyVersion:'1'};
function App(){return React.createElement('main',{className:'space-y-6 p-4'},React.createElement(CommandResolutionCard,{error:{code:'INSUFFICIENT_STOCK',message:'Stock changed; review the shortage.',retryable:false,details:{orderId:'order-1',stockItemId:'stock-1',stockItemName:'Coffee beans',stockLocationId:'location-1',required:25,available:4,shortfall:21,unit:'kg',affectedLines:[{lineId:'line-1',productName:'Filter coffee',required:25,unit:'kg'}]}},commandId:'original-command',records,canViewStock:true,canReceive:false,canCount:true,canEditHeld:true}),React.createElement(CommandResolutionCard,{error:{code:'DATABASE_UNAVAILABLE',message:'SQLSTATE 23503: relation businesses does not exist',retryable:true},commandId:'technical-command',records,canViewStock:false,canReceive:false,canCount:false,canEditHeld:false}),React.createElement(ProcurementWorkflowTabs,{sections}),React.createElement('nav',null,visibleWorkspaces(adminSession).map(item=>React.createElement('button',{key:item.id},item.label))));}
createRoot(document.getElementById('root')).render(React.createElement(App));
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',define:{'process.env.NODE_ENV':'"production"','import.meta.env.VITE_API_OFFLINE_GRANT_PUBLIC_JWK':'null'}}).outputFiles[0].text;

test('stock recovery explains confirmed order state and only shows authorized actions',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>Boolean(document.documentElement.dataset.servosBrowserMode));await page.evaluate(()=>{document.body.innerHTML='<div id="root"></div>';});await page.addScriptTag({content:harness});
 const card=page.getByRole('region',{name:'Command resolution'}).first();
 await expect(card).toContainText('Not enough stock');await expect(card).toContainText('Required 25 kg · available 4 kg · short by 21 kg');await expect(card).toContainText('The order is still OPEN and the affected item remains held.');
 await expect(card.getByRole('button',{name:'View stock'})).toBeVisible();await expect(card.getByRole('button',{name:'Correct stock count'})).toBeVisible();await expect(card.getByRole('button',{name:'Edit held item'})).toBeVisible();await expect(card.getByRole('button',{name:'Receive delivery'})).toHaveCount(0);
 const technicalCard=page.getByRole('region',{name:'Command resolution'}).nth(1);
 await expect(technicalCard.locator(':scope > div > p').first()).toHaveText('ServOS could not safely confirm this action. Synchronize Activity, verify the affected record, then refresh before deciding whether to retry.');
 await page.evaluate(()=>window.addEventListener('servos:recovery-action',event=>{(window as any).__recovery=(event as CustomEvent).detail;}));await card.getByRole('button',{name:'Edit held item'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__recovery?.orderId)).toBe('order-1');
 for(const viewport of [{width:1280,height:720},{width:1024,height:600},{width:768,height:1024},{width:390,height:844}]){await page.setViewportSize(viewport);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);await expect(page.getByRole('tablist',{name:'Procurement workflow sections'})).toBeVisible();}
});

test('Procurement workflow tabs switch task panels and accept recovery navigation',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>Boolean(document.documentElement.dataset.servosBrowserMode));await page.evaluate(()=>{document.body.innerHTML='<div id="root"></div>';});await page.addScriptTag({content:harness});
 await expect(page.getByRole('tabpanel')).toContainText('Order workflow panel');await page.getByRole('tab',{name:'Suppliers'}).click();await expect(page.getByRole('tabpanel')).toContainText('Supplier workflow panel');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('servos:procurement-tab',{detail:{id:'receiving'}})));await expect(page.getByRole('tab',{name:'Receive deliveries'})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('tabpanel')).toContainText('Receiving workflow panel');
});

test('legacy one-sale offline panel is not reachable from current POS routes',()=>{
 const routes=readFileSync('src/runtime/web/WebApiPosView.tsx','utf8')+readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
 expect(routes).not.toContain('WebApiOfflinePosPanel');
});

test('business configurators can discover Settings and device managers get an explicit access workspace',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>Boolean(document.documentElement.dataset.servosBrowserMode));await page.evaluate(()=>{document.body.innerHTML='<div id="root"></div>';});await page.addScriptTag({content:harness});
 await expect(page.getByRole('button',{name:'Settings'})).toBeVisible();await expect(page.getByRole('button',{name:'Staff, devices & access'})).toBeVisible();
 const registry=readFileSync('src/runtime/web/WebStaffAdminView.tsx','utf8');expect(registry).toContain('id="devices-access"');
});
