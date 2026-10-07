export interface ApiCommandEnvelope {commandId:string;name:string;payload:Record<string,unknown>;expectedVersions:Record<string,number>;offlineGrantId?:string}
export interface ApiCommandOutcome {kind:'CONFIRMED'|'REJECTED'|'CONFLICT';commandId:string;cursor?:number;result?:unknown;error?:{code:string;message:string;retryable:boolean}}
export interface ApiChangePage {protocolVersion:1;cursor:number;highWater:number;hasMore:boolean;changes:Array<{sequence:number;commandId:string;actorId?:string;deviceId?:string;occurredAt:string;records:Array<{collection:string;id:string;version:number;data:Record<string,unknown>;archived:boolean}>}>}
export interface ApiCatalogItem {id:string;categoryId:string|null;name:string;sku:string|null;basePriceMinor:number;currency:string;trackInventory:boolean;version:number;createdAt:string}
export interface ApiCatalogBootstrap {protocolVersion:number;cursor:number;records:Array<{collection:string;id:string;version:number;data:Record<string,unknown>;archived:boolean}>}
export interface ApiStaffLogin {accessToken:string;sessionId:string;businessId:string;staffId:string;displayName:string;permissions:string[];expiresAt:string;mustChangePassword:boolean}

export class ApiHttpError extends Error {
 constructor(readonly status:number,readonly code:string,message:string,readonly details?:unknown){super(message);this.name='ApiHttpError'}
}
export class ApiOutcomeUnknown extends Error {
 constructor(readonly commandId:string){super('The API response was lost. Check this same command ID before creating another command.');this.name='ApiOutcomeUnknown'}
}

export interface ApiClientOptions {baseUrl:string;accessToken:()=>string|undefined;deviceId:()=>string|undefined;fetcher?:typeof fetch}
export function createServOSApiClient({baseUrl,accessToken,deviceId,fetcher=fetch}:ApiClientOptions){
 const url=new URL(baseUrl);
 if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('ServOS API requires HTTPS');
 const request=async<T>(path:string,init:RequestInit={},requireDevice=true):Promise<T>=>{
  const token=accessToken();if(!token)throw new ApiHttpError(401,'AUTH_REQUIRED','Sign in to ServOS to continue.');
  const headers=new Headers(init.headers);headers.set('authorization',`Bearer ${token}`);if(init.body!==undefined)headers.set('content-type','application/json');
  if(requireDevice){const id=deviceId();if(!id)throw new ApiHttpError(401,'DEVICE_REQUIRED','Enroll this device before continuing.');headers.set('x-serveos-device-id',id)}
  let response:Response;
  try{response=await fetcher(new URL(path,url),{...init,headers,cache:'no-store',signal:init.signal||AbortSignal.timeout(20000)})}
  catch(error){throw error}
  const raw=await response.text();let body:unknown;
  try{body=raw?JSON.parse(raw):{}}catch(error){if(response.ok)throw error;body={}}
  if(!response.ok){const problem=(body as {error?:{code?:string;message?:string;details?:unknown}}).error;throw new ApiHttpError(response.status,problem?.code||'REQUEST_FAILED',problem?.message||'The request could not be completed.',problem?.details)}
  return body as T;
 };
 return {
  async login(loginName:string,password:string):Promise<ApiStaffLogin>{
   const response=await fetcher(new URL('/v1/auth/login',url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({loginName,password}),cache:'no-store',signal:AbortSignal.timeout(20000)});
   const body=await response.json();if(!response.ok){const problem=body?.error;throw new ApiHttpError(response.status,problem?.code||'AUTH_INVALID',problem?.message||'Sign-in failed.')}return body as ApiStaffLogin;
  },
  async initialAdminSetup(input:{businessId:string;staffId:string;businessName:string;displayName:string;loginName:string;password:string},setupSecret:string){
   const response=await fetcher(new URL('/v1/setup/initial-admin',url),{method:'POST',headers:{'content-type':'application/json','x-serveos-setup-secret':setupSecret},body:JSON.stringify(input),cache:'no-store',signal:AbortSignal.timeout(20000)});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw new ApiHttpError(response.status,body?.error?.code||'SETUP_FAILED',body?.error?.message||'Initial setup failed.')}return response.json() as Promise<{created:true}>;
  },
  passwordChange(currentPassword:string,newPassword:string){return request<{changed:boolean}>('/v1/auth/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})},false)},
  authSession(){return request<{businessId:string;staffId:string;displayName:string;permissions:string[];mustChangePassword:boolean}>('/v1/auth/session',{},false)},
  logout(){return request<{revoked:boolean}>('/v1/auth/logout',{method:'POST'},false)},
  async submitCommand(command:ApiCommandEnvelope):Promise<ApiCommandOutcome>{
   try{return await request<ApiCommandOutcome>('/v1/commands',{method:'POST',body:JSON.stringify(command)})}
   catch(error){if(error instanceof ApiHttpError&&error.status<500)throw error;throw new ApiOutcomeUnknown(command.commandId)}
  },
  commandStatus(commandId:string){return request<{commandId:string;status:'RECEIVED'|'PROCESSING'|'CONFIRMED'|'REJECTED'|'CONFLICT';outcome?:ApiCommandOutcome;error?:ApiCommandOutcome['error']}>(`/v1/commands/${encodeURIComponent(commandId)}`)},
  changes(after:number,limit=200){return request<ApiChangePage>(`/v1/sync/changes?after=${encodeURIComponent(after)}&limit=${encodeURIComponent(limit)}`)},
  catalogItems(search=''){return request<{items:ApiCatalogItem[]}>(`/v1/catalog/items?search=${encodeURIComponent(search)}`)},
  bootstrapCatalog(){return request<ApiCatalogBootstrap>('/v1/bootstrap/catalog')},
  enrollmentChallenge(){return request<{challengeId:string;challenge:string;issuedAt:string;expiresAt:string}>('/v1/devices/enrollment-challenges',{method:'POST'},false)},
  enrollDevice(body:{challengeId:string;deviceId:string;publicKey:JsonWebKey;signature:string}){return request<{deviceId:string;businessId:string;createdAt:string}>('/v1/devices/enroll',{method:'POST',body:JSON.stringify(body)},false)},
  issueOfflineGrant(input:{allowedCommands?:string[];maxCommands?:number;durationMinutes?:number}){return request<import('./BusinessStore').OfflineGrantEnvelope>('/v1/offline-grants',{method:'POST',body:JSON.stringify(input)})},
 };
}
