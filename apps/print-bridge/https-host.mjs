// Local HTTPS adapter. No business credentials, raw print endpoint or automatic replay.
import {createServer} from 'node:https';
import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
function required(name){const value=process.env[name];if(!value)throw new Error(`Missing ${name}`);return value;}
function file(name){const value=required(name);if(!isAbsolute(value))throw new Error(`${name} must be absolute`);return value;}
const origin=new URL(required('PRINT_BRIDGE_HTTPS_ORIGIN'));
if(origin.protocol!=='https:'||origin.origin!==process.env.PRINT_BRIDGE_HTTPS_ORIGIN||!['localhost','127.0.0.1'].includes(origin.hostname)||origin.username||origin.password)throw new Error('Bridge HTTPS origin must be exact localhost or 127.0.0.1 origin');
const port=Number(origin.port||443);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use a dedicated unprivileged bridge port');
const tls={key:readFileSync(file('PRINT_BRIDGE_TLS_KEY')),cert:readFileSync(file('PRINT_BRIDGE_TLS_CERT')),minVersion:'TLSv1.2'};
const worker=spawn(file('PRINT_BRIDGE_WORKER'),[file('PRINT_BRIDGE_CONFIG'),file('PRINT_BRIDGE_JOURNAL')],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
let terminal=false,pending=null,buffer=Buffer.alloc(0),tail=Promise.resolve(),admitted=0,shuttingDown=false;
function failWorker(){
 if(terminal)return;terminal=true;
 if(pending){pending.reject(new Error('Worker outcome unresolved'));pending=null;}
 worker.kill();
 if(!shuttingDown)server.close(()=>{process.exitCode=1;});
}
worker.on('error',failWorker);worker.on('exit',failWorker);
worker.stdin.on('error',failWorker);worker.stdout.on('error',failWorker);
worker.stderr.on('data',()=>{}); // Do not forward printer/configuration details to HTTP or logs.
worker.stdout.on('data',chunk=>{
 buffer=Buffer.concat([buffer,chunk]);if(buffer.length>512*1024){failWorker();return;}
 let newline;
 while((newline=buffer.indexOf(10))!==-1){
  const line=buffer.subarray(0,newline);buffer=buffer.subarray(newline+1);
  try{
   const reply=JSON.parse(line.toString('utf8'));
   if(!pending||reply.messageId!==pending.id||typeof reply.ok!=='boolean')throw new Error('Invalid worker framing');
   const waiting=pending;pending=null;waiting.resolve(reply);
  }catch{failWorker();return;}
 }
});
function call(operation){
 if(terminal||pending)return Promise.reject(new Error('Worker unavailable'));
 const id=randomUUID(),wire=JSON.stringify({messageId:id,operation})+'\n';
 if(Buffer.byteLength(wire)>8*1024*1024)return Promise.reject(new Error('Worker message exceeds bounds'));
 return new Promise((resolve,reject)=>{
  pending={id,resolve,reject};
  worker.stdin.write(wire,error=>{if(error)failWorker();});
 });
}
let controlBuffer=Buffer.alloc(0),shutdownTimer;
function shutdown(){
 if(shuttingDown)return;shuttingDown=true;
 // Stop accepting work, let admitted request handlers finish, then stop the private worker.
 server.close(()=>{clearTimeout(shutdownTimer);failWorker();process.exitCode=0;});
 shutdownTimer=setTimeout(()=>{failWorker();server.closeAllConnections();process.exitCode=1;},30000);
}
process.stdin.on('data',chunk=>{
 controlBuffer=Buffer.concat([controlBuffer,chunk]);
 if(controlBuffer.length>128){shutdown();return;}
 let newline;
 while((newline=controlBuffer.indexOf(10))!==-1){
  const line=controlBuffer.subarray(0,newline).toString('utf8');controlBuffer=controlBuffer.subarray(newline+1);
  if(line==='SERVOS_PRINT_BRIDGE_SHUTDOWN')shutdown();else shutdown();
 }
});
process.stdin.on('end',shutdown);
function singleHeader(req,name){
 const count=req.rawHeaders.filter((_,index)=>index%2===0&&req.rawHeaders[index].toLowerCase()===name).length;
 return count===1&&typeof req.headers[name]==='string'?req.headers[name]:null;
}
function reply(res,status,body,approvedOrigin){
 if(res.destroyed||res.writableEnded)return;
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin, Access-Control-Request-Private-Network'};
 if(approvedOrigin)headers['access-control-allow-origin']=approvedOrigin;
 res.writeHead(status,headers);res.end(JSON.stringify(body));
}
async function readBody(req){
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024)throw new Error('Request too large');chunks.push(chunk);}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
const server=createServer(tls,async(req,res)=>{
 const requestOrigin=singleHeader(req,'origin');
 if(singleHeader(req,'host')!==origin.host||!requestOrigin||req.url!=='/v1/requests'||!['OPTIONS','POST'].includes(req.method)||req.headers.authorization||req.headers.cookie){reply(res,403,{code:'BRIDGE_REQUEST_REFUSED'});req.resume();return;}
 if(terminal||admitted>=8){reply(res,503,{code:'BRIDGE_BUSY_OR_UNAVAILABLE'});req.resume();return;}
 if(req.method==='POST'&&(singleHeader(req,'content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||req.headers['content-encoding'])){reply(res,415,{code:'JSON_REQUIRED'});req.resume();return;}
 if(req.method==='OPTIONS'&&(req.headers['access-control-request-method']!=='POST'||String(req.headers['access-control-request-headers']||'').split(',').some(header=>header.trim().toLowerCase()!=='content-type'))){reply(res,403,{code:'PREFLIGHT_REFUSED'});req.resume();return;}
 admitted++;
 try{
  const signed=req.method==='POST'?await readBody(req):null;
  // Serial queue remains held until worker completion, even if HTTP client disconnects.
  const execute=async()=>{
   const check=await call({operation:'PREFLIGHT',httpOrigin:requestOrigin});
   if(!check.ok||check.body?.permitted!==true){reply(res,403,{code:'ORIGIN_NOT_APPROVED'});return;}
   if(req.method==='OPTIONS'){
    if(res.destroyed)return;
    res.writeHead(204,{'access-control-allow-origin':requestOrigin,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type',
     ...(req.headers['access-control-request-private-network']==='true'?{'access-control-allow-private-network':'true'}:{}),
     'vary':'Origin, Access-Control-Request-Private-Network','cache-control':'no-store'});res.end();return;
   }
   if(res.destroyed)return; // No dispatch for work abandoned while queued.
   const result=await call({operation:'DISPATCH',httpOrigin:requestOrigin,request:signed});
   reply(res,result.ok?200:409,result.ok?result.body:{code:'BRIDGE_REQUEST_REFUSED_OR_UNRESOLVED'},requestOrigin);
  };
  const task=tail.then(execute);tail=task.catch(()=>{});await task;
 }catch{reply(res,503,{code:'BRIDGE_OUTCOME_UNRESOLVED'});}
 finally{admitted--;}
});
server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=3000;server.maxHeadersCount=40;
server.setTimeout(30000,socket=>socket.destroy());
server.on('error',()=>{failWorker();process.exitCode=1;server.close();});
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
// Always loopback: browser TLS trust and explicit local approval are required.
server.listen(port,'127.0.0.1');
