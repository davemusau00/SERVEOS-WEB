import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';
const harness=buildSync({stdin:{contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CashierWorkspace} from './src/runtime/web/pos2/CashierWorkspace';
const records=[{collection:'outlets',id:'outlet',version:1,data:{name:'Test outlet',defaultStockLocationId:'stock'}},{collection:'stockLocations',id:'stock',version:1,data:{}},{collection:'businessSettings',id:'business',version:1,data:{vatRateBasisPoints:1600,levyRateBasisPoints:0}},{collection:'tillSessions',id:'till',version:1,data:{status:'OPEN',operatorId:'staff',deviceId:'device',outletId:'outlet'}},...Array.from({length:73},(_,index)=>({collection:'products',id:'product-'+index,version:1,data:{name:index===0?'Coffee':'Product '+index,priceMinor:90000,taxClassId:'A_16',category:'Drinks'}}))];
window.__pos2Calls=[];
function App(){const [snapshot,setSnapshot]=useState(records);return React.createElement(CashierWorkspace,{records:snapshot,session:{businessId:'business',actorId:'staff',permissions:['pos.sell','payment.record','order.fire'],enabled:true,policyVersion:'test'},deviceId:'device',queue:[],disabled:false,readRecords:async()=>records,onMore:()=>window.__more=true,command:async(operation,collection,id,payload)=>{window.__pos2Calls.push({operation,payload});let order=records.find(row=>row.collection==='orders'&&row.id===id);if(operation==='order.quickAdd'){order={collection:'orders',id,version:1,data:{name:'Counter sale',outletId:'outlet',stockLocationId:'stock',state:'OPEN',items:[{id:payload.itemId,productId:payload.productId,name:'Coffee',quantity:1,unitPriceMinor:90000,lineTotalMinor:90000,state:'DRAFT'}],grandTotalMinor:90000,amountPaidMinor:0}};records.push(order);}else if(operation==='order.updateItem'){order.data.items[0].quantity=payload.quantity;order.data.items[0].lineTotalMinor=payload.quantity*90000;order.data.grandTotalMinor=payload.quantity*90000;order.version++;}setSnapshot([...records]);return {kind:'CONFIRMED',commandId:crypto.randomUUID()};}});}
createRoot(document.getElementById('root')).render(React.createElement(App));
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;

test('cashier searches 73 products and consecutive taps increment one line without an editor',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{document.body.innerHTML='<div id="root"></div>';});await page.addScriptTag({content:harness});
 await expect(page.getByRole('button',{name:/^Product \d/})).toHaveCount(72);
 await page.getByLabel('Search products').fill('Coffee');
 await page.getByRole('button',{name:/Coffee/}).click();
 await page.getByRole('button',{name:/Coffee/}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByLabel('Current bill')).toContainText('2 \u00d7');
 const calls=await page.evaluate(()=>(window as any).__pos2Calls);
 expect(calls).toEqual([]);
 await expect(page.getByLabel('Current bill')).toContainText('KES 1,800.00');
 await expect(page.getByRole('button',{name:/Pay KES/})).toBeVisible();
 await page.getByRole('button',{name:'More / Shift / Activity'}).click();
 expect(await page.evaluate(()=>(window as any).__more)).toBe(true);
});
