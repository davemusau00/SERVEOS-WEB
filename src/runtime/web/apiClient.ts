import type {BootstrapManifest,OfflineGrantEnvelope} from './BusinessStore';

export interface ApiCommandEnvelope {commandId:string;name:string;payload:Record<string,unknown>;expectedVersions:Record<string,number>;offlineGrantId?:string}
export interface ApiCommandOutcome {kind:'CONFIRMED'|'REJECTED'|'CONFLICT';commandId:string;cursor?:number;result?:unknown;error?:{code:string;message:string;retryable:boolean}}
export interface ApiChangePage {protocolVersion:1;cursor:number;highWater:number;hasMore:boolean;changes:Array<{sequence:number;commandId:string;actorId?:string;deviceId?:string;occurredAt:string;records:Array<{collection:string;id:string;version:number;data:Record<string,unknown>;archived:boolean}>}>}
export interface ApiCatalogItem {id:string;categoryId:string|null;name:string;sku:string|null;basePriceMinor:number;currency:string;trackInventory:boolean;version:number;createdAt:string}
export interface ApiCatalogBootstrapManifest {protocolVersion:2;snapshotId:string;expiresAt:string;cursor:number;manifest:BootstrapManifest}
export interface ApiCatalogBootstrapPage {protocolVersion:2;snapshotId:string;afterOrdinal:number;nextOrdinal:number;hasMore:boolean;pageIndex:number;sha256:string;records:Array<{collection:string;id:string;version:number;data:Record<string,unknown>;archived:boolean}>}
export interface ApiCustomerCreditStatementPage {protocolVersion:1;customerId:string;items:Array<{collection:string;id:string;version:number;data:Record<string,unknown>;archived:boolean}>;hasMore:boolean;nextCursor:string|null}
export interface ApiStaffLogin {accessToken:string;sessionId:string;businessId:string;staffId:string;displayName:string;permissions:string[];expiresAt:string;mustChangePassword:boolean}
export interface ApiStaffSession {sessionId:string;deviceId:string|null;createdAt:string;expiresAt:string;revokedAt:string|null;current:boolean;deviceRevoked:boolean;expired:boolean}
export interface ApiFinanceSummary {from:string;to:string;timeZone:string;currency:'KES';salesRevenueMinor:number;postedExpensesMinor:number;operatingResultBeforeTaxMinor:number;expensesByTender:{cashMinor:number;externalMinor:number};expensesByCategory:Array<{categoryId:string;name:string;amountMinor:number}>;debtorAging:Record<string,number>;payableAging:Record<string,number>;supplierPayments:{count:number;amountMinor:number}}
export interface ApiImportTemplate {key:string;label:string;headers:string[];required:string[];permission:string;permissions:string[];importable:boolean}
export interface ApiImportRow {rowNumber:number;status:'VALID'|'INVALID';externalId:string|null;normalized:Record<string,string>;errors:string[];warnings:string[]}
export interface ApiImportPlanStep {rowNumber:number;action:'CREATE'|'BLOCKED'|'CONFLICT';status:'PLANNED'|'BLOCKED'|'CONFLICT'|'APPLIED'|'FAILED';operation:string|null;targetCollection:string|null;targetId:string|null;reason:string;error:string|null}
export interface ApiImportPlan {id:string;batchId:string;status:string;createdBy:string;createdAt:string;updatedAt:string;sourceHash:string;summary:{total:number;create:number;noChange:number;blocked:number;conflict:number;applied:number;failed:number};steps:ApiImportPlanStep[];stepsTruncated:boolean}
export interface ApiImportBatch {id:string;templateKey:string;fileName:string;status:string;createdBy:string;createdAt:string;updatedAt:string;rowCount:number;validCount:number;invalidCount:number;sourceHash:string;headers:string[];notes:string;rows?:ApiImportRow[];rowsTruncated?:boolean;plan?:ApiImportPlan}

export class ApiHttpError extends Error {
 constructor(readonly status:number,readonly code:string,message:string,readonly details?:unknown){super(message);this.name='ApiHttpError'}
}
export class ApiOutcomeUnknown extends Error {
 constructor(readonly commandId:string){super('The API response was lost. Check this same command ID before creating another command.');this.name='ApiOutcomeUnknown'}
}

export function createServOSInitialSetupClient(baseUrl:string,fetcher:typeof fetch=fetch){
 const url=new URL(baseUrl);
 if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('ServOS API requires HTTPS');
 return {
  async status():Promise<{available:boolean}>{
   const response=await fetcher(new URL('/v1/setup/status',url),{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
   const body=await response.json().catch(()=>({}));
   if(!response.ok||typeof body?.available!=='boolean')throw new ApiHttpError(response.status||503,body?.error?.code||'SETUP_STATUS_UNAVAILABLE',body?.error?.message||'Initial setup availability could not be checked.');
   return body as {available:boolean};
  },
  async createInitialAdmin(input:{businessId:string;staffId:string;businessName:string;displayName:string;loginName:string;password:string},setupSecret:string):Promise<{created:true}>{
   const response=await fetcher(new URL('/v1/setup/initial-admin',url),{method:'POST',headers:{'content-type':'application/json','x-serveos-setup-secret':setupSecret},body:JSON.stringify(input),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new ApiHttpError(response.status,body?.error?.code||'SETUP_FAILED',body?.error?.message||'Initial setup failed.');
   return body as {created:true};
  },
 };
}

export interface ApiClientOptions {baseUrl:string;accessToken:()=>string|undefined;setAccessToken:(token:string)=>void;sessionId:()=>string|undefined;deviceId:()=>string|undefined;fetcher?:typeof fetch}
export function createServOSApiClient({baseUrl,accessToken,setAccessToken,sessionId,deviceId,fetcher=fetch}:ApiClientOptions){
 const url=new URL(baseUrl);
 if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('ServOS API requires HTTPS');
 let refreshInFlight:Promise<void>|undefined;
 const refreshAccessToken=async()=>{
  const rotate=async()=>{const currentSessionId=sessionId();if(!currentSessionId)throw new ApiHttpError(401,'AUTH_REQUIRED','Sign in to ServOS to continue.');const response=await fetcher(new URL(`/v1/auth/sessions/${encodeURIComponent(currentSessionId)}/refresh`,url),{method:'POST',credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000)});const raw=await response.text();let body:{accessToken?:string;sessionId?:string;error?:{code?:string;message?:string}}={};try{body=raw?JSON.parse(raw):{}}catch{if(response.ok)throw new Error('The refresh response was invalid.')}if(!response.ok||typeof body.accessToken!=='string')throw new ApiHttpError(response.status||401,body.error?.code||'REFRESH_FAILED',body.error?.message||'Your sign-in session ended. Sign in again.');if(body.sessionId!==currentSessionId)throw new ApiHttpError(401,'REFRESH_SESSION_MISMATCH','This browser session changed. Sign in again.');setAccessToken(body.accessToken)};
  if(typeof navigator==='undefined'||!navigator.locks)throw new ApiHttpError(401,'AUTH_REFRESH_COORDINATION_UNAVAILABLE','This browser cannot safely renew the sign-in session. Sign in again from a supported browser.');
  if(!refreshInFlight)refreshInFlight=navigator.locks.request('serveos-api-refresh',rotate).finally(()=>{refreshInFlight=undefined});await refreshInFlight;
 };
 const request=async<T>(path:string,init:RequestInit={},requireDevice=true):Promise<T>=>{
  const token=accessToken();if(!token)throw new ApiHttpError(401,'AUTH_REQUIRED','Sign in to ServOS to continue.');
  const headers=new Headers(init.headers);headers.set('authorization',`Bearer ${token}`);if(init.body!==undefined)headers.set('content-type','application/json');
  if(requireDevice){const id=deviceId();if(!id)throw new ApiHttpError(401,'DEVICE_REQUIRED','Enroll this device before continuing.');headers.set('x-serveos-device-id',id)}
  let response:Response;
  const send=()=>fetcher(new URL(path,url),{...init,headers,credentials:'include',cache:'no-store',signal:init.signal||AbortSignal.timeout(20000)});
  try{response=await send();if(response.status===401&&!path.endsWith('/refresh')&&path!=='/v1/auth/login'){await refreshAccessToken();const current=accessToken();if(!current)throw new ApiHttpError(401,'AUTH_REQUIRED','Sign in to ServOS to continue.');headers.set('authorization',`Bearer ${current}`);response=await send()}}
  catch(error){throw error}
  const raw=await response.text();let body:unknown;
  try{body=raw?JSON.parse(raw):{}}catch(error){if(response.ok)throw error;body={}}
  if(!response.ok){const problem=(body as {error?:{code?:string;message?:string;details?:unknown}}).error;throw new ApiHttpError(response.status,problem?.code||'REQUEST_FAILED',problem?.message||'The request could not be completed.',problem?.details)}
  return body as T;
 };
 return {
  async login(loginName:string,password:string):Promise<ApiStaffLogin>{
   const response=await fetcher(new URL('/v1/auth/login',url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({loginName,password}),credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000)});
   const body=await response.json();if(!response.ok){const problem=body?.error;throw new ApiHttpError(response.status,problem?.code||'AUTH_INVALID',problem?.message||'Sign-in failed.')}return body as ApiStaffLogin;
  },
  async initialAdminSetup(input:{businessId:string;staffId:string;businessName:string;displayName:string;loginName:string;password:string},setupSecret:string){
   const response=await fetcher(new URL('/v1/setup/initial-admin',url),{method:'POST',headers:{'content-type':'application/json','x-serveos-setup-secret':setupSecret},body:JSON.stringify(input),cache:'no-store',signal:AbortSignal.timeout(20000)});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw new ApiHttpError(response.status,body?.error?.code||'SETUP_FAILED',body?.error?.message||'Initial setup failed.')}return response.json() as Promise<{created:true}>;
  },
  passwordChange(currentPassword:string,newPassword:string){return request<{changed:boolean}>('/v1/auth/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})},false)},
  authSession(){return request<{businessId:string;staffId:string;deviceId:string|null;displayName:string;permissions:string[];mustChangePassword:boolean}>('/v1/auth/session',{},false)},
  staffSessions(){return request<{sessions:ApiStaffSession[]}>('/v1/auth/sessions',{},false)},
  revokeStaffSession(sessionId:string){return request<{revoked:boolean}>(`/v1/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,{method:'POST'},false)},
  logout(){return request<{revoked:boolean}>('/v1/auth/logout',{method:'POST'},false)},
  restoreAccessToken(){return refreshAccessToken()},
  async submitCommand(command:ApiCommandEnvelope):Promise<ApiCommandOutcome>{
   try{return await request<ApiCommandOutcome>('/v1/commands',{method:'POST',body:JSON.stringify(command)})}
   catch(error){if(error instanceof ApiHttpError&&error.status<500)throw error;throw new ApiOutcomeUnknown(command.commandId)}
  },
  commandStatus(commandId:string){return request<{commandId:string;status:'RECEIVED'|'PROCESSING'|'CONFIRMED'|'REJECTED'|'CONFLICT';outcome?:ApiCommandOutcome;error?:ApiCommandOutcome['error']}>(`/v1/commands/${encodeURIComponent(commandId)}`)},
  async watchChanges(after:number,onChange:()=>void,signal:AbortSignal){
   let token=accessToken();const device=deviceId();if(!token||!device)throw new ApiHttpError(401,'AUTH_REQUIRED','Sign in and enroll this device before watching changes.');
   const streamUrl=new URL(`/v1/sync/stream?after=${encodeURIComponent(after)}`,url),stream=()=>fetcher(streamUrl,{headers:{authorization:`Bearer ${token}`,'x-serveos-device-id':device,accept:'text/event-stream'},credentials:'include',cache:'no-store',signal});let response=await stream();if(response.status===401){await refreshAccessToken();token=accessToken()||'';if(!token)throw new ApiHttpError(401,'AUTH_REQUIRED','Sign in and enroll this device before watching changes.');response=await stream()}
   if(!response.ok)throw new ApiHttpError(response.status,'STREAM_UNAVAILABLE','Change notifications are unavailable.');
   if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('Invalid change notification stream');
   const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
   try{while(!signal.aborted){const {value,done}=await reader.read();if(done)return;buffer+=decoder.decode(value,{stream:true});if(buffer.length>65536)throw new Error('Change notification frame exceeds limit');
    let match:RegExpExecArray|null;while((match=/\r?\n\r?\n/.exec(buffer))){const frame=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);if(frame.split(/\r?\n/).some(line=>line==='event: changes'))onChange();}
   }}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock()}
  },
  changes(after:number,limit=200){return request<ApiChangePage>(`/v1/sync/changes?after=${encodeURIComponent(after)}&limit=${encodeURIComponent(limit)}`)},
  catalogItems(search=''){return request<{items:ApiCatalogItem[]}>(`/v1/catalog/items?search=${encodeURIComponent(search)}`)},
  customerCreditStatement(customerId:string,cursor?:string,limit=100){const query=new URLSearchParams({limit:String(limit)});if(cursor)query.set('cursor',cursor);return request<ApiCustomerCreditStatementPage>(`/v1/customer-credit/accounts/${encodeURIComponent(customerId)}/statement?${query}`)},
  financeSummary(from:string,to:string){const query=new URLSearchParams({from,to});return request<ApiFinanceSummary>(`/v1/finance/summary?${query}`)},
  roomAvailability(startsAt:string,endsAt:string,guests:number){const query=new URLSearchParams({startsAt,endsAt,guests:String(guests)});return request<{rooms:Array<{id:string;number:string;roomTypeId:string;capacity:number;housekeepingState:string;maintenanceState:string}>}>(`/v1/hospitality/availability?${query}`)},
  bootstrapCatalog(snapshotId?:string){return request<ApiCatalogBootstrapManifest>(snapshotId?`/v1/bootstrap/catalog/${encodeURIComponent(snapshotId)}`:'/v1/bootstrap/catalog')},
  bootstrapCatalogPage(snapshotId:string,after:number){return request<ApiCatalogBootstrapPage>(`/v1/bootstrap/catalog/${encodeURIComponent(snapshotId)}/pages?after=${encodeURIComponent(after)}`)},
  enrollmentChallenge(){return request<{challengeId:string;challenge:string;issuedAt:string;expiresAt:string}>('/v1/devices/enrollment-challenges',{method:'POST'},false)},
  enrollDevice(body:{challengeId:string;deviceId:string;publicKey:JsonWebKey;signature:string}){return request<{deviceId:string;businessId:string;createdAt:string}>('/v1/devices/enroll',{method:'POST',body:JSON.stringify(body)},false)},
  issueOfflineGrant(input:{allowedCommands?:string[];maxCommands?:number;durationMinutes?:number}){return request<OfflineGrantEnvelope>('/v1/offline-grants',{method:'POST',body:JSON.stringify(input)})},
  importTemplates(){return request<{templates:ApiImportTemplate[];limits:{maxBytes:number;maxRows:number;previewRows:number};excluded:Array<{key:string;reason:string}>}>('/v1/import/templates')},
  importBatches(){return request<{batches:ApiImportBatch[]}>('/v1/import/batches')},
  importBatch(batchId:string){return request<{batch:ApiImportBatch;plan?:ApiImportPlan}>(`/v1/import/batches/${encodeURIComponent(batchId)}`)},
  stageImport(input:{id:string;templateKey:string;fileName:string;csvText:string}){return request<{batch:ApiImportBatch}>('/v1/import/batches',{method:'POST',body:JSON.stringify(input)})},
  planImport(batchId:string){return request<{plan:ApiImportPlan}>(`/v1/import/batches/${encodeURIComponent(batchId)}/plan`,{method:'POST',body:'{}'})},
  importPlan(planId:string){return request<{plan:ApiImportPlan}>(`/v1/import/plans/${encodeURIComponent(planId)}`)},
  applyImport(planId:string){return request<{plan:ApiImportPlan}>(`/v1/import/plans/${encodeURIComponent(planId)}/apply`,{method:'POST',body:'{}'})},
  cancelImport(batchId:string,reason:string){return request<{cancelled:boolean;batchId:string;status:string}>(`/v1/import/batches/${encodeURIComponent(batchId)}/cancel`,{method:'POST',body:JSON.stringify({reason})})},
 };
}
