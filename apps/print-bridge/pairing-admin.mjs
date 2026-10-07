#!/usr/bin/env node
// Local administrator tool. Pairing is never accepted through the HTTPS service.
import {createHash,createPublicKey,randomUUID} from 'node:crypto';
import {closeSync,fsyncSync,lstatSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function exactHttpsOrigin(value,label){
 if(typeof value!=='string')throw new Error(`${label} must be an HTTPS origin.`);
 let parsed;try{parsed=new URL(value);}catch{throw new Error(`${label} must be an HTTPS origin.`);}
 if(parsed.protocol!=='https:'||parsed.origin!==value||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error(`${label} must be an exact HTTPS origin without credentials, path, query or fragment.`);
 return value;
}
function verifyPublicKey(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['kty','crv','x','y','ext','key_ops','alg'].includes(key))||value.kty!=='EC'||value.crv!=='P-256'||typeof value.x!=='string'||typeof value.y!=='string'||'d'in value||value.ext!==undefined&&typeof value.ext!=='boolean'||value.alg!==undefined&&value.alg!=='ES256'||value.key_ops!==undefined&&(!Array.isArray(value.key_ops)||value.key_ops.length!==1||value.key_ops[0]!=='verify'))throw new Error('Pairing requires only a public P-256 verification key.');
 try{createPublicKey({key:value,format:'jwk'});}catch{throw new Error('The pairing public key is not a valid P-256 point.');}
 return JSON.parse(JSON.stringify(value));
}
function publicKeyFingerprint(value){
 const key=createPublicKey({key:value,format:'jwk'}),der=key.export({type:'spki',format:'der'});
 return createHash('sha256').update(der).digest('hex');
}
function readBoundedJson(path,limit,label){
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw new Error(`${label} must be a regular file smaller than ${limit} bytes.`);
 return JSON.parse(readFileSync(path,'utf8'));
}
function readConfig(path){
 if(!isAbsolute(path))throw new Error('Use an absolute installer-owned configuration path.');
 const config=readBoundedJson(path,256*1024,'Bridge configuration');
 if(!config||config.schemaVersion!==1||!uuid(config.bridgeId)||!uuid(config.businessId)||!Array.isArray(config.devices)||config.devices.length>100)throw new Error('Bridge configuration identity, schema or device list is invalid.');
 exactHttpsOrigin(config.apiOrigin,'API origin');
 const seen=new Set();
 for(const device of config.devices){
  if(!device||!uuid(device.deviceId)||seen.has(device.deviceId)||typeof device.revoked!=='boolean'||typeof device.approvedAt!=='string'||!Number.isFinite(Date.parse(device.approvedAt))||typeof device.approvalReason!=='string'||device.approvalReason.trim().length<3||device.approvalReason.trim().length>500)throw new Error('Bridge configuration contains invalid or repeated device approval evidence.');
  seen.add(device.deviceId);exactHttpsOrigin(device.origin,'Paired PWA origin');verifyPublicKey(device.publicKey);
  if(device.revoked&&(!Number.isFinite(Date.parse(device.revokedAt))||typeof device.revocationReason!=='string'||device.revocationReason.trim().length<3||device.revocationReason.trim().length>500))throw new Error('Revoked devices require a recorded time and reason.');
  if(!device.revoked&&(device.revokedAt!=null||device.revocationReason!=null))throw new Error('Active pairings cannot contain revocation metadata.');
 }
 return config;
}
async function promptLine(rl,label){return (await rl.question(label)).trim();}
async function confirm(rl,phrase){return await promptLine(rl,`Type ${phrase} to continue: `)===phrase;}
function atomicReplace(path,config){
 const target=join(dirname(path),`.${basename(path)}.${randomUUID()}.tmp`);
 let fd;
 try{
  fd=openSync(target,'wx',0o600);writeFileSync(fd,`${JSON.stringify(config,null,2)}\n`,'utf8');fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(target,path);
 }catch(error){if(fd!==undefined)try{closeSync(fd);}catch{}try{unlinkSync(target);}catch{}throw error;}
}
async function main(){
 const [action,configPath,input]=process.argv.slice(2);
 if(!['approve','revoke'].includes(action)||!configPath||!input){
  throw new Error('Usage: node apps/print-bridge/pairing-admin.mjs approve <absolute-config-path> <device-request.json>\n   or: node apps/print-bridge/pairing-admin.mjs revoke <absolute-config-path> <device-uuid>');
 }
 const config=readConfig(configPath),rl=createInterface({input:stdin,output:stdout});
 try{
  if(action==='approve'){
   if(!isAbsolute(input))throw new Error('Use an absolute path for the saved PWA identity file.');
   const request=readBoundedJson(input,16*1024,'PWA identity');
   if(!request||Object.keys(request).some(key=>!['businessId','deviceId','origin','publicKey'].includes(key))||request.businessId!==config.businessId||!uuid(request.deviceId))throw new Error('PWA identity does not match this bridge business or has unsupported fields.');
   exactHttpsOrigin(request.origin,'PWA origin');const publicKey=verifyPublicKey(request.publicKey);
   if(config.devices.some(device=>device.deviceId===request.deviceId))throw new Error('This device already has pairing history. Re-approval requires a new approved pairing identity.');
   if(config.devices.length>=100)throw new Error('Bridge pairing limit reached.');
   stdout.write(`\nBridge: ${config.bridgeId}\nBusiness: ${config.businessId}\nDevice: ${request.deviceId}\nPWA origin: ${request.origin}\nPublic key SHA-256: ${publicKeyFingerprint(publicKey)}\n\nCompare this device ID and public key with the authenticated ServOS device record before approval.\n`);
   if(!await confirm(rl,`APPROVE ${request.deviceId}`)){stdout.write('Approval cancelled.\n');return;}
   const reason=await promptLine(rl,'Approval reason (3-500 characters): ');if(reason.length<3||reason.length>500||/[\u0000-\u001f\u007f]/.test(reason))throw new Error('Approval reason must contain 3 to 500 printable characters.');
   config.devices.push({deviceId:request.deviceId,origin:request.origin,publicKey,approvedAt:new Date().toISOString(),approvalReason:reason,revoked:false,revokedAt:null,revocationReason:null});
  }else{
   if(!uuid(input))throw new Error('Device identity must be a canonical UUID.');
   const device=config.devices.find(row=>row.deviceId===input);if(!device)throw new Error('No pairing exists for that device.');if(device.revoked)throw new Error('This device pairing is already revoked.');
   stdout.write(`\nBridge: ${config.bridgeId}\nBusiness: ${config.businessId}\nDevice: ${device.deviceId}\nPWA origin: ${device.origin}\n`);
   if(!await confirm(rl,`REVOKE ${device.deviceId}`)){stdout.write('Revocation cancelled.\n');return;}
   const reason=await promptLine(rl,'Revocation reason (3-500 characters): ');if(reason.length<3||reason.length>500||/[\u0000-\u001f\u007f]/.test(reason))throw new Error('Revocation reason must contain 3 to 500 printable characters.');
   device.revoked=true;device.revokedAt=new Date().toISOString();device.revocationReason=reason;
  }
  atomicReplace(configPath,config);stdout.write(`Trusted bridge configuration updated for ${action}. The worker reloads this file before each request.\n`);
 }finally{rl.close();}
}
main().catch(error=>{stdout.write(`${error instanceof Error?error.message:'Pairing administration failed.'}\n`);process.exitCode=1;});
