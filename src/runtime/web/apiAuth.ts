import {createServOSApiClient,type ApiStaffLogin} from './apiClient';
import {enrollWebDeviceWithApi,getOrCreateWebDeviceIdentity,type WebDeviceIdentity} from './deviceIdentity';
import {BusinessStore} from './BusinessStore';
import {loadApiCatalogSnapshot} from './session';

export interface ApiAuthenticatedDeviceSession {
  client:ReturnType<typeof createServOSApiClient>;
  identity:WebDeviceIdentity;
  login:ApiStaffLogin;
  profile:{businessId:string;staffId:string;displayName:string;permissions:string[];mustChangePassword:boolean};
  signOut():Promise<void>;
}

/** Complete the API-native web sign-in lifecycle without placing the bearer in persistent web storage. */
export async function signInAndEnrollApiDevice(input:{apiOrigin:string;loginName:string;password:string;newPassword?:string;fetcher?:typeof fetch}):Promise<ApiAuthenticatedDeviceSession>{
  let token:string|undefined;let device:string|undefined;
  const makeClient=()=>createServOSApiClient({baseUrl:input.apiOrigin,accessToken:()=>token,deviceId:()=>device,fetcher:input.fetcher});
  const client=makeClient();let login=await client.login(input.loginName,input.password);token=login.accessToken;
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
    return {client,identity,login,profile,signOut:async()=>{await client.logout();token=undefined;device=undefined}};
  }catch(error){await client.logout().catch(()=>undefined);token=undefined;device=undefined;throw error}
}

/** Open isolated API-authority IndexedDB and install its records[] catalog projection. */
export async function openApiBusinessStore(session:ApiAuthenticatedDeviceSession){
  const store=await BusinessStore.open(session.profile.businessId,session.identity.deviceId,session.profile.staffId,0,'API');
  try{await loadApiCatalogSnapshot(store,session.client);return store}catch(error){store.close();throw error}
}
