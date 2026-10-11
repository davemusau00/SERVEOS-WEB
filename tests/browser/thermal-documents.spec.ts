import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';
const harness=buildSync({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {BusinessDocumentRenderer,businessDocumentStyles} from './src/runtime/web/BusinessDocumentRenderer';
import {THERMAL_DOCUMENT_TYPES} from './src/runtime/web/documentPaperProfiles';
window.renderThermal=(type,count)=>{const snapshot={business:{businessName:'Test venue',timeZone:'Africa/Nairobi'},staffId:'11111111-1111-4111-8111-111111111111',orderId:'11111111-1111-4111-8111-111111111111',grandTotalMinor:90000,amountPaidMinor:90000,balanceMinor:0,taxes:{grossMinor:90000},items:Array.from({length:count},(_,i)=>({id:String(i),name:'Long product name '+('wrapped words '.repeat(8)),quantity:1,unitPriceMinor:90000,lineTotalMinor:90000})),payments:[{method:'CASH',amountMinor:90000,cashTenderedMinor:100000,changeMinor:10000}]};window.thermalRoot.render(React.createElement(BusinessDocumentRenderer,{document:{id:'11111111-1111-4111-8111-111111111111',type,documentNumber:'R-000142',layoutVersion:1,hash:'test',issuedAt:'2026-10-11T12:00:00Z',snapshot},attempt:2}));};
document.head.insertAdjacentHTML('beforeend','<style>'+businessDocumentStyles+'</style>');window.thermalTypes=THERMAL_DOCUMENT_TYPES;window.thermalRoot=createRoot(document.getElementById('fixture'));
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
test('every thermal document stays within its 80 mm roll at all tested lengths',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{document.querySelectorAll('style,link[rel=stylesheet]').forEach(el=>el.remove());document.body.innerHTML='<div id="fixture"></div>';});await page.addScriptTag({content:harness});await page.emulateMedia({media:'print'});
 const types=await page.evaluate(()=>(window as any).thermalTypes as string[]);
 for(const type of types)for(const count of [1,15,100]){
  await page.evaluate(({type,count})=>(window as any).renderThermal(type,count),{type,count});
  const sheet=page.locator('.servos-business-document');await expect(sheet).toHaveAttribute('data-document-type',type);await expect(sheet).toContainText('REPRINT');
  const widths=await sheet.evaluate(el=>{const css=getComputedStyle(el);return {width:el.getBoundingClientRect().width,content:el.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),overflow:Array.from(el.querySelectorAll('*')).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className)};});
  expect(widths.width,type).toBeCloseTo(80*96/25.4,0);expect(widths.content,type).toBeLessThanOrEqual(72*96/25.4+1);expect(widths.overflow,type).toEqual([]);
  expect(await sheet.innerText()).not.toMatch(/11111111-1111-4111-8111-111111111111/);
 }
});
