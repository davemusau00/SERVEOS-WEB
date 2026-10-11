import {readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const directory=new URL('../migrations/',import.meta.url);
export const migrationManifest=()=>readdirSync(directory).filter(name=>/^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort().map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL(name,directory))).digest('hex')}));
export function validateMigrationManifest(applied,expected=migrationManifest()){
 const byName=new Map(applied.map(row=>[row.name,row.sha256]));
 const missing=expected.filter(row=>!byName.has(row.name)).map(row=>row.name);
 const mismatched=expected.filter(row=>byName.has(row.name)&&byName.get(row.name)!==row.sha256).map(row=>row.name);
 return {ready:missing.length===0&&mismatched.length===0,expected:expected.length,applied:applied.length,missing,mismatched};
}
