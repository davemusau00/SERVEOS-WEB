import {createServOSApiClient,type ApiStaffLogin} from './apiClient';
import {createStaffScopedApiWebDeviceIdentity,enrollWebDeviceWithApi,findApiWebDeviceIdentity,getOrCreateApiWebDeviceIdentity,rememberApiWebDeviceIdentity,WebDeviceEnrollmentError,WebDeviceIdentityUnavailableError,type WebDeviceIdentity} from './deviceIdentity';
import {BusinessStore} from './BusinessStore';
import {apiAuthorizationPolicyVersion,loadApiCatalogSnapshot} from './session';
import {createApiTransport,synchronizeStore} from './sync';
import {ApiHttpError} from './apiClient';

const sessionStorageKey=(apiOrigin:string)=>`servos-api-session:${new URL(apiOrigin).origin}`;
const sessionIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const savedSessionId=(apiOrigin:string)=>{try{const value=localStorage.getItem(sessionStorageKey(apiOrigin));return value&&sessionIdPattern.test(value)?value:undefined}catch{return undefined}};
const saveSessionId=(apiOrigin:string,sessionId:string)=>{try{localStorage.setItem(sessionStorageKey(apiOrigin),sessionId)}catch{/* The bearer and refresh credential remain memory/cookie only. */}};
const clearSessionId=(apiOrigin:string,expected?:string)=>{try{const key=sessionStorageKey(apiOrigin);if(!expected||localStorage.getItem(key)===expected)localStorage.removeItem(key)}catch{/* Storage may be unavailable; the server session remains revocable. */}};
export const hasSavedApiSession=(apiOrigin?:string)=>Boolean(apiOrigin&&savedSessionId(apiOrigin));

type ApiLoginInfo=Omit<ApiStaffLogin,'accessToken'>;
type ApiSessionProfile={businessId:string;staffId:string;deviceId:string;displayName:string;permissions:string[];mustChangePassword:boolean};
const sessionResult=(client:ReturnType<typeof createServOSApiClient>,identity:WebDeviceIdentity,login:ApiLoginInfo,profile:ApiSessionProfile,apiOrigin:string,tokenState:{token:string|undefined;sessionId:string|undefined;device:string|undefined}):ApiAuthenticatedDeviceSession=>({client,identity,login,profile,signOut:async()=>{
 try{await client.logout()}finally{clearSessionId(apiOrigin,tokenState.sessionId);tokenState.token=undefined;tokenState.sessionId=undefined;tokenState.device=undefined}
}});

export interface ApiAuthenticatedDeviceSession {
  client:ReturnType<typeof createServOSApiClient>;
  identity:WebDeviceIdentity;
  login:ApiLoginInfo;
  profile:ApiSessionProfile;
  signOut():Promise<void>;
}

/** Complete the API-native web sign-in lifecycle without placing the bearer in persistent web storage. */
export async function signInAndEnrollApiDevice(input:{apiOrigin:string;loginName:string;password:string;newPassword?:string;fetcher?:typeof fetch}):Promise<ApiAuthenticatedDeviceSession>{
  const state:{token:string|undefined;sessionId:string|undefined;device:string|undefined}={token:undefined,sessionId:undefined,device:undefined};
  const client=createServOSApiClient({baseUrl:input.apiOrigin,accessToken:()=>state.token,setAccessToken:value=>{state.token=value},sessionId:()=>state.sessionId,deviceId:()=>state.device,fetcher:input.fetcher});
  const response=await client.login(input.loginName,input.password);state.token=response.accessToken;state.sessionId=response.sessionId;saveSessionId(input.apiOrigin,state.sessionId);
  try{
    let mustChangePassword=response.mustChangePassword;
    if(mustChangePassword){
      if(!input.newPassword)throw new Error('This account requires a new password. Enter it in the setup field and sign in again.');
      await client.passwordChange(input.password,input.newPassword);mustChangePassword=false;
    }
    const profile=await client.authSession();
    if(profile.mustChangePassword)throw new Error('Change the initial password before enrolling this device.');
    if(!profile.permissions.includes('*')&&!profile.permissions.includes('devices.register')&&!profile.permissions.includes('devices.manage'))throw new Error('This staff account needs device registration approval before sign-in can continue.');
    const enrollmentToken=state.token;if(!enrollmentToken)throw new Error('The API sign-in token is unavailable. Sign in again.');
    let identity=await getOrCreateApiWebDeviceIdentity(profile.businessId,profile.staffId);state.device=identity.deviceId;
    try{await enrollWebDeviceWithApi(input.apiOrigin,enrollmentToken,profile.businessId,profile.staffId,identity)}
    catch(error){
      if(!(error instanceof WebDeviceEnrollmentError)||error.code!=='DEVICE_ID_OWNED_BY_ANOTHER_STAFF')throw error;
      identity=await createStaffScopedApiWebDeviceIdentity(profile.businessId,profile.staffId);state.device=identity.deviceId;
      await enrollWebDeviceWithApi(input.apiOrigin,enrollmentToken,profile.businessId,profile.staffId,identity);
    }
    await rememberApiWebDeviceIdentity(profile.businessId,profile.staffId,identity);
    const login:ApiLoginInfo={sessionId:response.sessionId,businessId:response.businessId,staffId:response.staffId,displayName:response.displayName,permissions:response.permissions,expiresAt:response.expiresAt,mustChangePassword};
    return sessionResult(client,identity,login,{...profile,deviceId:identity.deviceId},input.apiOrigin,state);
  }catch(error){try{await client.logout().catch(()=>undefined)}finally{clearSessionId(input.apiOrigin,state.sessionId);state.token=undefined;state.sessionId=undefined;state.device=undefined}throw error}
}

/** Resume with the session-scoped HttpOnly cookie; only its non-secret ID is persisted by the PWA. */
export async function resumeApiDeviceSession(input:{apiOrigin:string;fetcher?:typeof fetch}):Promise<ApiAuthenticatedDeviceSession|null>{
 const sessionId=savedSessionId(input.apiOrigin);if(!sessionId)return null;
 const state:{token:string|undefined;sessionId:string|undefined;device:string|undefined}={token:undefined,sessionId,device:undefined};
 const client=createServOSApiClient({baseUrl:input.apiOrigin,accessToken:()=>state.token,setAccessToken:value=>{state.token=value},sessionId:()=>state.sessionId,deviceId:()=>state.device,fetcher:input.fetcher});
 try{
  await client.restoreAccessToken();
  const profile=await client.authSession();
  if(profile.mustChangePassword)throw new ApiHttpError(403,'PASSWORD_CHANGE_REQUIRED','Sign in and complete the required password change.');
  if(!profile.deviceId)throw new ApiHttpError(401,'DEVICE_REQUIRED','This API session is not bound to an enrolled device. Sign in again to enroll this browser.');
  const identity=await findApiWebDeviceIdentity(profile.businessId,profile.staffId,profile.deviceId);state.device=identity.deviceId;
  const login:ApiLoginInfo={sessionId,businessId:profile.businessId,staffId:profile.staffId,displayName:profile.displayName,permissions:profile.permissions,expiresAt:'',mustChangePassword:false};
  return sessionResult(client,identity,login,{...profile,deviceId:identity.deviceId},input.apiOrigin,state);
 }catch(error){
  if(error instanceof ApiHttpError&&[401,403].includes(error.status))clearSessionId(input.apiOrigin,sessionId);
  if(error instanceof WebDeviceIdentityUnavailableError){await client.logout().catch(()=>undefined);clearSessionId(input.apiOrigin,sessionId)}
  if(error instanceof ApiHttpError&&['DEVICE_REQUIRED','PASSWORD_CHANGE_REQUIRED'].includes(error.code))await client.logout().catch(()=>undefined);
  state.token=undefined;state.device=undefined;
  throw error;
 }
}

/** Open isolated API-authority IndexedDB and install its verified catalog projection. */
export async function openApiBusinessStore(session:ApiAuthenticatedDeviceSession){
  const store=await BusinessStore.open(session.profile.businessId,session.identity.deviceId,session.profile.staffId,0);
  try{
    const policyVersion=await apiAuthorizationPolicyVersion(session.profile.permissions);
    // Recover durable commands before installing a replacement projection.
    // An initialized projection is reused, including an empty zero-cursor catalog.
    if(await store.policyVersion()!==policyVersion&&await store.hasPending())await synchronizeStore(store,createApiTransport(session.client));
    await loadApiCatalogSnapshot(store,session.client,policyVersion);return store;
  }catch(error){store.close();throw error}
}
