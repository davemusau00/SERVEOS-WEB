import {createServOSApiClient,type ApiStaffLogin} from './apiClient';
import {enrollWebDeviceWithApi,getOrCreateWebDeviceIdentity,type WebDeviceIdentity} from './deviceIdentity';
import {BusinessStore} from './BusinessStore';
import {loadApiCatalogSnapshot} from './session';
import {createApiCloudTransport,synchronizeStore} from './sync';

export interface ApiAuthenticatedDeviceSession {
  client:ReturnType<typeof createServOSApiClient>;
  identity:WebDeviceIdentity;
  login:ApiStaffLogin;
  profile:{businessId:string;staffId:string;displayName:string;permissions:string[];mustChangePassword:boolean};
  signOut():Promise<void>;
}

/** Complete the API-native web sign-in lifecycle without placing the bearer in persistent web storage. */
export async function signInAndEnrollApiDevice(input:{apiOrigin:string;loginName:string;password:string;newPassword?:string;fetcher?:typeof fetch}):Promise<ApiAuthenticatedDeviceSession>{
  let token:string|undefined,sessionId:string|undefined,device:string|undefined;
  const makeClient=()=>createServOSApiClient({baseUrl:input.apiOrigin,accessToken:()=>token,setAccessToken:value=>{token=value},sessionId:()=>sessionId,deviceId:()=>device,fetcher:input.fetcher});
  const client=makeClient();let login=await client.login(input.loginName,input.password);token=login.accessToken;sessionId=login.sessionId;
  try{
    if(login.mustChangePassword){
      if(!input.newPassword)throw new Error('This account requires a new password. Enter it in the setup field and sign in again.');
      await client.passwordChange(input.password,input.newPassword);login={...login,mustChangePassword:false};
    }
    const profile=await client.authSession();
    if(profile.mustChangePassword)throw new Error('Change the initial password before enrolling this device.');
    if(!profile.permissions.includes('*')&&!profile.permissions.includes('devices.register')&&!profile.permissions.includes('devices.manage'))throw new Error('This staff account needs device registration approval before sign-in can continue.');
    const identity=await getOrCreateWebDeviceIdentity(profile.businessId);device=identity.deviceId;
    await enrollWebDeviceWithApi(input.apiOrigin,token,profile.businessId,profile.staffId,identity);
    return {client,identity,login,profile,signOut:async()=>{
      try{await client.logout()}finally{token=undefined;sessionId=undefined;device=undefined;login.accessToken=''}
    }};
  }catch(error){try{await client.logout().catch(()=>undefined)}finally{token=undefined;sessionId=undefined;device=undefined;login.accessToken=''}throw error}
}

/** Open isolated API-authority IndexedDB and install its records[] catalog projection. */
export async function openApiBusinessStore(session:ApiAuthenticatedDeviceSession){
  const store=await BusinessStore.open(session.profile.businessId,session.identity.deviceId,session.profile.staffId,0,'API');
  try{
    // Recover durable commands before installing a replacement projection.
    // An initialized projection is reused, including an empty zero-cursor catalog.
    if(await store.policyVersion()!=='api-catalog-v2'&&await store.hasPending())await synchronizeStore(store,createApiCloudTransport(session.client));
    await loadApiCatalogSnapshot(store,session.client);return store;
  }catch(error){store.close();throw error}
}
