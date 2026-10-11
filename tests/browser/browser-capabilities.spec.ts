import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';
const harness=buildSync({stdin:{contents:`import {inspectBrowserCapabilities} from './src/runtime/web/browserCapabilities';window.inspectSupport=inspectBrowserCapabilities;`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text;
test('capability probe completes storage and cryptography checks without granting transaction rights',async({page})=>{
 await page.goto('/');await page.addScriptTag({content:harness});
 const result=await page.evaluate(()=>(window as any).inspectSupport());expect(result).toEqual({mode:'Full',missing:[]});
 await page.evaluate(()=>Object.defineProperty(window,'indexedDB',{value:{open(){throw Error('Quota exceeded');}},configurable:true}));
 const failed=await page.evaluate(()=>(window as any).inspectSupport());expect(failed.mode).toBe('Unsupported');expect(failed.missing).toContain('Local transaction storage');
});
test('JavaScript disabled keeps readable upgrade and record-preservation guidance',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto(baseURL!);
 await expect(page.getByText(/Please update Chrome or Edge/)).toBeVisible();await expect(page.getByText(/Keep this browser profile/)).toBeVisible();await context.close();
});
