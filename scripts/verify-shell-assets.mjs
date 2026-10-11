import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'dist');
const worker=await readFile(path.join(root,'sw.js'),'utf8');
const match=worker.match(/const ASSETS=(\[[^;]+\]);/);
if(!match)throw Error('The service worker precache manifest is unavailable.');
const assets=JSON.parse(match[1]);
for(const asset of assets){
  if(!asset.startsWith('/')||asset.includes('..'))throw Error('Unsafe precache path.');
  if(!(await stat(path.join(root,asset.slice(1)))).isFile())throw Error(`Missing precache asset: ${asset}`);
}
const files=await readdir(path.join(root,'assets'));
const missing=files.filter(file=>!assets.includes('/assets/'+file));
if(missing.length)throw Error(`Runtime assets omitted from precache: ${missing.join(', ')}`);
if(process.argv.includes('--legacy')&&!files.some(file=>file.includes('-legacy-')))throw Error('Legacy runtime chunks are missing.');
console.log(`SHELL_ASSET_COVERAGE=PASS assets=${assets.length} legacy=${files.some(file=>file.includes('-legacy-'))}`);
