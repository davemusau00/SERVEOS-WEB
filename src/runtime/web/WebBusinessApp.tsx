import {exportBridgeRecoveryEvidence} from './printBridgeTransport';
import {WebBridgeSettings} from './WebBridgeSettings';
import {WebBridgeRecovery} from './WebBridgeRecovery';
import {WebApiRefundsView} from './WebApiRefundsView';
import {WebApiPosView} from './WebApiPosView';
import {WebApiSettings} from './WebApiSettings';
import {WebDocumentQueue} from './WebDocumentQueue';
import {WebApiJournalLedger} from './WebApiJournalLedger';
import {WebApiCloseDayReports} from './WebApiCloseDayReports';
import React,{useEffect,useRef,useState} from 'react';
import {Activity,BedDouble,Boxes,CheckCircle2,ChevronRight,ClipboardCheck,CreditCard,HelpCircle,Home,LockKeyhole,LogIn,Martini,PackageSearch,RefreshCw,Settings,ShieldCheck,Truck,Users,WalletCards,Wifi,WifiOff} from 'lucide-react';
import {BusinessStore,redactSensitiveData,type QueuedCommand,type WorkflowDraft,type WorkflowDraftField} from './BusinessStore';
import {resolveOperationDependencies} from './dependencies';
import {captureCountRecovery} from './countRecovery';
import {WebStorageDiagnostics} from './WebStorageDiagnostics';
import {startAutomaticSync,subscribeSyncUpdates,synchronizeStore} from './sync';
import {allowed,loadAuthorizedSnapshot,openWebDevice,type BusinessRecord,type Rpc,type WebGuidanceProgress,type WebSession} from './session';
import {createApiCloudTransport} from './sync';
import type {ApiAuthenticatedDeviceSession} from './apiAuth';
import {ApiHttpError} from './apiClient';
import type {CommandOutcome} from '../../types/transactions';

const WebCatalogView=React.lazy(()=>import('./WebCatalogInventory').then(module=>({default:module.WebCatalogView})));
const WebInventoryView=React.lazy(()=>import('./WebCatalogInventory').then(module=>({default:module.WebInventoryView})));
const WebProcurementView=React.lazy(()=>import('./WebProcurementView').then(module=>({default:module.WebProcurementView})));
const WebPosView=React.lazy(()=>import('./WebPosView').then(module=>({default:module.WebPosView})));
const WebFinanceView=React.lazy(()=>import('./WebFinanceView').then(module=>({default:module.WebFinanceView})));
const WebStaffAdminView=React.lazy(()=>import('./WebStaffAdminView').then(module=>({default:module.WebStaffAdminView})));
const WebAdministrationView=React.lazy(()=>import('./WebAdministrationView').then(module=>({default:module.WebAdministrationView})));
const WebKDSView=React.lazy(()=>import('./WebKDSView').then(module=>({default:module.WebKDSView})));
const WebRefundsView=React.lazy(()=>import('./WebRefundsView').then(module=>({default:module.WebRefundsView})));
const WebFinancialControlsView=React.lazy(()=>import('./WebFinancialControlsView').then(module=>({default:module.WebFinancialControlsView})));
const WebMasterDataView=React.lazy(()=>import('./WebMasterDataView').then(module=>({default:module.WebMasterDataView})));
const WebGuidedTour=React.lazy(()=>import('./WebGuidanceViews').then(module=>({default:module.WebGuidedTour})));
const WebHelpView=React.lazy(()=>import('./WebGuidanceViews').then(module=>({default:module.WebHelpView})));
const WebStartHere=React.lazy(()=>import('./WebGuidanceViews').then(module=>({default:module.WebStartHere})));
const WebLifecycleView=React.lazy(()=>import('./WebLifecycleViews').then(module=>({default:module.WebLifecycleView})));
const WebStaffWelcome=React.lazy(()=>import('./WebLifecycleViews').then(module=>({default:module.WebStaffWelcome})));
const WebFrontDeskView=React.lazy(()=>import('./WebHospitalityViews').then(module=>({default:module.WebFrontDeskView})));
const WebGuestAccountsView=React.lazy(()=>import('./WebHospitalityViews').then(module=>({default:module.WebGuestAccountsView})));
const WebHousekeepingView=React.lazy(()=>import('./WebHospitalityViews').then(module=>({default:module.WebHousekeepingView})));
const WebMaintenanceView=React.lazy(()=>import('./WebMaintenanceView').then(module=>({default:module.WebMaintenanceView})));
const WebFloorplanView=React.lazy(()=>import('./WebFloorplanView').then(module=>({default:module.WebFloorplanView})));
import {ActivitySyncCenter} from './ActivitySyncCenter';
import {ContextHelpDrawer} from './ContextHelpDrawer';
import {ConnectivityBadge,Notice,PageHeader,StatusBadge} from '../../design-system/components';
import {ds} from '../../design-system/tokens';
import {businessDateTimeAfterBusinessDays,businessDateTimeInput,businessDateTimeToUtc} from '../../utils/businessTime';
import {parseMoneyToMinor,parsePercentToBasisPoints} from '../../utils/fiscal.js';
import {canSeeWorkspace,visibleWorkspaces,workspaceById,workspaceGroups} from './workspaceRegistry';
import {GUIDES} from '../../guidance/core';
import {Dialog,SearchCombobox} from '../../design-system/controls';
import {operatorError} from './operatorError';
type Values=Record<string,string>;
type Field={key:string;label:string;type?:'text'|'number'|'money'|'datetime-local'|'select';options?:Array<{value:string;label:string}>;value?:string;optional?:boolean};
type Editor={title:string;operation:string;collection:string;id:string;fields:Field[];payload:(values:Values)=>Record<string,unknown>;draftId?:string;supersedes?:string;policyVersion?:string};
const input='w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white';
const button='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40';
const primaryButton='inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40';
const label=(r:BusinessRecord)=>String(r.data.name||r.data.number||r.data.tag||r.id);
const money=(value:unknown)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(Number(value||0)/100);
const minor=(value:string)=>parseMoneyToMinor(value);
const middleDot='\u00B7';
type WorkspaceTab='Home'|'POS'|'KDS'|'Catalog'|'Inventory'|'Procurement'|'Front Desk'|'Guest Accounts'|'Housekeeping'|'Rooms'|'Maintenance'|'Floorplan'|'Assets'|'Master Data'|'Refunds'|'Finance Controls'|'Settings'|'Finance'|'Staff'|'Administration'|'Activity'|'Help';
const apiWorkspaces=(session:WebSession):WorkspaceTab[]=>['Home',...(['pos.sell','kds.view','kds.update','order.fire','order.kds','order.void','order.discount','order.comp','order.compItem','payment.record','till.open','till.close','till.view','till.override_variance'].some(permission=>allowed(session,permission))?['POS' as const]:[]),'Catalog','Inventory',...(['order.refund','payment.reverse'].some(permission=>allowed(session,permission))?['Refunds' as const]:[]),'Activity','Help',...(allowed(session,'business.configure')?['Settings' as const]:[])];
const canSeeTab=(session:WebSession,tab:WorkspaceTab,apiAuthority=false)=>apiAuthority?apiWorkspaces(session).includes(tab):canSeeWorkspace(session,workspaceById(tab));

export function WebBusinessApp({initialSession,rpc,onSignOut,apiAuth,apiStore}:{initialSession:WebSession;rpc:Rpc;onSignOut:()=>void;apiAuth?:ApiAuthenticatedDeviceSession;apiStore?:BusinessStore}){
 const [session,setSession]=useState(initialSession);const [records,setRecords]=useState<BusinessRecord[]>([]);const [queue,setQueue]=useState<QueuedCommand[]>([]);
 const [drafts,setDrafts]=useState<WorkflowDraft[]>([]);
 const initialTab=()=>{const raw=decodeURIComponent(window.location.hash.replace(/^#\/?/,'').split('/')[0]||'Home');return apiAuth?(apiWorkspaces(initialSession).includes(raw as WorkspaceTab)?raw as WorkspaceTab:'Catalog'):visibleWorkspaces(initialSession).some(workspace=>workspace.id===raw)?raw as WorkspaceTab:'Home'};
 const [tab,setWorkspaceTab]=useState<WorkspaceTab>(initialTab);const [helpQuery,setHelpQuery]=useState('');const [helpDrawerOpen,setHelpDrawerOpen]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [syncing,setSyncing]=useState(false);const [online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine);const [updateReady,setUpdateReady]=useState(false);const [tourOpen,setTourOpen]=useState(false);const [tourGuideId,setTourGuideId]=useState('servos.core');const [committedOperation,setCommittedOperation]=useState<{id:string;operation:string}|null>(null);const [guidance,setGuidance]=useState<WebGuidanceProgress[]>([]);const [lifecycleRefresh,setLifecycleRefresh]=useState(0);
 const [editor,setEditor]=useState<Editor|null>(null);const [values,setValues]=useState<Values>({});
 const store=useRef<BusinessStore|null>(apiStore||null);const committedCommands=useRef(new Set<string>());const submitInFlight=useRef(false);const rpcRef=useRef(rpc);rpcRef.current=rpc;const sessionRef=useRef(session);sessionRef.current=session;const apiTransport=useRef(apiAuth?createApiCloudTransport(apiAuth.client):null);
 const syncRef=useRef<()=>Promise<void>>(async()=>{});
 const updateHold=useRef(false);
 useEffect(()=>{
  const closed=()=>{setReady(false);setError('Browser storage was closed or upgraded in another tab. Reopen this workspace before continuing. Do not clear browser data.');};
  window.addEventListener('servos:storage-closed',closed);
  return()=>window.removeEventListener('servos:storage-closed',closed);
 },[]);
 const exportRecovery=async()=>{
  try{
   if(!store.current)throw new Error('The business workspace is not open.');
   const current=store.current;
   const evidence=await current.recoveryEvidence();
   const countDrafts=captureCountRecovery(current.scope,current.actorId);
   const printBridge=apiAuth?await exportBridgeRecoveryEvidence(current.scope,apiAuth.identity):undefined;
   const exportData={indexedDB:evidence,countDrafts,printBridge};
   const url=URL.createObjectURL(new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download=`servos-recovery-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
   document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){setError(operatorError(error))}
 };
 const setTab=(next:WorkspaceTab)=>{
  if(updateHold.current)return;
  if(!workspaceById(next)||!canSeeTab(session,next,!!apiAuth)){
   setNotice('This workspace is not available for your current session.');
   window.history.replaceState(null,'',`#/${encodeURIComponent(tab)}`);
   return;
  }
  setWorkspaceTab(next);
 };
 const updateBoundaryGeneration=useRef(0);
 const updateBoundaryWorker=useRef<ServiceWorker|null>(null);
 const activeSyncCycles=useRef(0);
 useEffect(()=>{
  if(!apiAuth||!apiStore)return;
  let stopped=false;let controller:AbortController|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
  const connect=async()=>{
   if(stopped||controller||!navigator.onLine||document.visibilityState!=='visible')return;
   controller=new AbortController();const signal=controller.signal;
   try{await apiAuth.client.watchChanges(await apiStore.cursor(),()=>{
    if(!stopped&&!updateHold.current&&activeSyncCycles.current===0)void syncRef.current().catch(error=>{if(!stopped)setError(operatorError(error))});
   },signal)}catch{/* Periodic ordered pulls remain active when notifications fail. */}
   finally{controller=undefined;if(!stopped)timer=setTimeout(()=>void connect(),5000)}
  };
  const resume=()=>{if(timer)clearTimeout(timer);if(!navigator.onLine||document.visibilityState!=='visible')controller?.abort();else void connect()};
  window.addEventListener('online',resume);window.addEventListener('offline',resume);document.addEventListener('visibilitychange',resume);void connect();
  return()=>{stopped=true;if(timer)clearTimeout(timer);controller?.abort();window.removeEventListener('online',resume);window.removeEventListener('offline',resume);document.removeEventListener('visibilitychange',resume)};
 },[apiAuth,apiStore]);
 const refresh=async()=>{if(!store.current)return;const [r,q,d]=await Promise.all([store.current.records(),store.current.queue(),store.current.drafts()]);const displayQueue=q.map(entry=>({...entry,command:{...entry.command,payload:redactSensitiveData(entry.command.payload) as Record<string,unknown>},result:entry.result?redactSensitiveData(entry.result) as NonNullable<QueuedCommand['result']>:undefined}));setRecords(r);setQueue(displayQueue);setDrafts(d)};
  useEffect(()=>{
  let stopped=false;let needsSnapshot=true;let automatic:ReturnType<typeof startAutomaticSync>|undefined;let opened:BusinessStore|undefined;
  const run=async()=>{
    if(updateHold.current)return;
    activeSyncCycles.current++;
    try{
    if(apiAuth&&apiStore){
      if(!opened){opened=apiStore;store.current=apiStore;}
      if(stopped)return;
      const profile=await apiAuth.client.authSession();
      if(profile.businessId!==opened.scope||profile.staffId!==opened.actorId||profile.mustChangePassword)throw new ApiHttpError(401,'AUTH_REQUIRED','Sign in again before continuing in this workspace.');
      if(stopped)return;
      const latest={...sessionRef.current,permissions:profile.permissions};sessionRef.current=latest;setSession(latest);
      await synchronizeStore(opened,apiTransport.current!);
      await refresh();if(!stopped){setReady(true);setError('')};return;
    }
    let latest:WebSession;try{latest=await rpcRef.current('rpc/servos_v2_session',{})}catch(error){if([401,403].includes((error as {status?:number}).status||0)){setReady(false);setRecords([])}throw error}
    if(latest.businessId!==initialSession.businessId||latest.actorId!==initialSession.actorId){setReady(false);setRecords([]);throw new Error('This workspace is no longer enabled for this session. Sign in again.')}
    sessionRef.current=latest;if(!stopped)setSession(latest);
    if(latest.lifecycleStage&&latest.lifecycleStage!=='LIVE'){
      setReady(false);setRecords([]);return;
    }
    if(!latest.enabled){setReady(false);setRecords([]);throw new Error('This workspace is not enabled for this session. Sign in again.')}
    if(!opened||stopped)return;
   if(needsSnapshot||latest.policyVersion!==await opened.policyVersion()){
    setReady(false);setRecords([]);await navigator.locks.request(`servos-v2-sync:${opened.scope}:${opened.deviceId}:${opened.actorId}`,()=>loadAuthorizedSnapshot(opened!,rpcRef.current,latest));needsSnapshot=false;
   }
   await synchronizeStore(opened,{execute:command=>rpcRef.current('rpc/servos_v2_execute',{command}),pull:cursor=>rpcRef.current('rpc/servos_v2_pull',{after_sequence:cursor,page_size:100})});
   if(!stopped){const currentQueue=await opened.queue();const synchronized=currentQueue.filter(entry=>entry.state==='SYNCHRONIZED');const currentDrafts=await opened.drafts();for(const entry of synchronized){for(const draft of currentDrafts)if(draft.supersedes===entry.id)await opened.discardDraft(draft.id)}const countKey=`servos-web-count:${latest.businessId}:${latest.actorId}`;for(const entry of synchronized){if(entry.command.operation==='inventory.countLocation'&&entry.command.payload.sessionId===countKey){localStorage.removeItem(countKey);localStorage.removeItem(`${countKey}:unknown`)}if(!committedCommands.current.has(entry.id)){committedCommands.current.add(entry.id);setCommittedOperation({id:entry.id,operation:entry.command.operation})}}await refresh();setReady(true);setError('')}
    }catch(error){
      if(apiAuth&&error instanceof ApiHttpError&&(error.status===401||error.status===403)&&!stopped){setReady(false);setRecords([]);}
      throw error;
    }finally{activeSyncCycles.current--;}
  };
  syncRef.current=run;
  void(async()=>{try{
   if(apiAuth&&apiStore){opened=apiStore;store.current=apiStore;await run();automatic=startAutomaticSync(run,e=>{if(!stopped)setError(operatorError(e))});return}
   const latest=await rpcRef.current('rpc/servos_v2_session',{}) as WebSession;
   if(latest.lifecycleStage&&latest.lifecycleStage!=='LIVE'){await run();return}
   opened=await openWebDevice(initialSession,rpcRef.current);if(stopped){opened.close();return}store.current=opened;for(const entry of await opened.queue())if(entry.state==='SYNCHRONIZED')committedCommands.current.add(entry.id);
   automatic=startAutomaticSync(run,e=>{if(!stopped){setError(operatorError(e));if((e as {status?:number}).status===403){setReady(false);setRecords([])}}});
  }catch(e){if(!stopped)setError(operatorError(e))}})();
  return()=>{stopped=true;automatic?.stop();opened?.close();store.current=null};
 },[initialSession.businessId,initialSession.actorId,lifecycleRefresh,apiAuth,apiStore]);
 useEffect(()=>{
  if(!apiStore)return;
  let stopped=false;
  const unsubscribe=subscribeSyncUpdates(apiStore.scope,apiStore.deviceId,apiStore.actorId,update=>{
   if(update.type!=='SYNC_FINISHED'||stopped)return;
   void Promise.all([apiStore.records(),apiStore.queue(),apiStore.drafts()]).then(([nextRecords,nextQueue,nextDrafts])=>{
    if(stopped)return;
    setRecords(nextRecords);setQueue(nextQueue.map(entry=>({...entry,command:{...entry.command,payload:redactSensitiveData(entry.command.payload) as Record<string,unknown>},result:entry.result?redactSensitiveData(entry.result) as NonNullable<QueuedCommand['result']>:undefined})));setDrafts(nextDrafts);
   }).catch(error=>{if(!stopped)setError(operatorError(error))});
  },apiStore.commandAuthority);
  return()=>{stopped=true;unsubscribe()};
 },[apiStore]);
  const syncNow=async()=>{setSyncing(true);try{await syncRef.current()}catch(error){const message=operatorError(error);setError(message);throw new Error(message)}finally{setSyncing(false)}};
  useEffect(()=>{const handleOnline=()=>setOnline(true);const handleOffline=()=>setOnline(false);window.addEventListener('online',handleOnline);window.addEventListener('offline',handleOffline);return()=>{window.removeEventListener('online',handleOnline);window.removeEventListener('offline',handleOffline)}},[]);
  useEffect(()=>{const handleUpdate=()=>setUpdateReady(true);window.addEventListener('servos:sw-update-ready',handleUpdate);return()=>window.removeEventListener('servos:sw-update-ready',handleUpdate)},[]);
  useEffect(()=>{const handleHash=()=>{const raw=decodeURIComponent(window.location.hash.replace(/^#\/?/,'').split('/')[0]||'Home') as WorkspaceTab;if(visibleWorkspaces(session).some(workspace=>workspace.id===raw))setTab(raw)};window.addEventListener('hashchange',handleHash);return()=>window.removeEventListener('hashchange',handleHash)},[session]);
  useEffect(()=>{const navigate=(event:Event)=>{const next=(event as CustomEvent<{tab?:string}>).detail?.tab as WorkspaceTab|undefined;if(next&&visibleWorkspaces(session).some(workspace=>workspace.id===next))setTab(next)};window.addEventListener('servos:web-navigate',navigate);return()=>window.removeEventListener('servos:web-navigate',navigate)},[session]);
  useEffect(()=>{const nextHash=`#/${encodeURIComponent(tab)}`;if(window.location.hash!==nextHash)window.history.replaceState(null,'',nextHash)},[tab]);
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  let stopped=false;
  const inspectWaiting=()=>{void navigator.serviceWorker.getRegistration().then(registration=>{
   if(stopped)return;
   if(registration?.waiting)setUpdateReady(true);
   const activeWorker=registration?.active;
   if(updateHold.current&&activeWorker&&activeWorker===updateBoundaryWorker.current&&activeWorker.state==='activated'&&!registration?.waiting)window.location.reload();
  }).catch(error=>{if(!stopped)setError(operatorError(error))})};
  inspectWaiting();
  const visible=()=>{if(document.visibilityState==='visible')inspectWaiting()};
  document.addEventListener('visibilitychange',visible);
  const handleMessage=(event:MessageEvent)=>{
   if(event.data?.type==='SERVOS_RELEASE_UPDATE_BOUNDARY'){
    if(updateBoundaryWorker.current&&event.source!==updateBoundaryWorker.current)return;
    updateBoundaryGeneration.current++;updateHold.current=false;updateBoundaryWorker.current=null;document.getElementById('root')?.removeAttribute('inert');return
   }
   if(event.data?.type==='SERVOS_SW_READY'&&updateHold.current&&event.source===updateBoundaryWorker.current){window.location.reload();return}
   if(event.data?.type==='SERVOS_UPDATE_DEFERRED'){setNotice('Another ServOS tab is busy or unavailable. Finish its work or close it, then retry the update.');return}
   if(event.data?.type!=='SERVOS_CHECK_UPDATE_BOUNDARY'||!event.ports[0])return;
   if(updateHold.current&&event.source!==updateBoundaryWorker.current){event.ports[0].postMessage({safe:false});event.ports[0].close();return}
   const generation=++updateBoundaryGeneration.current;
   updateBoundaryWorker.current=event.source as ServiceWorker;
   const port=event.ports[0];
   const busyNow=()=>busy||syncing||activeSyncCycles.current>0||submitInFlight.current||!!editor||!!document.querySelector('[role="dialog"],dialog[open]');
   void(async()=>{
    let safe=false;
    try{const current=store.current;if(current&&!busyNow()){const [pending,printing]=await Promise.all([current.hasPending(),current.hasUnresolvedPrintDelivery()]);safe=!pending&&!printing&&!busyNow()}}
    catch{safe=false}
    safe=safe&&!stopped&&generation===updateBoundaryGeneration.current;
    if(safe){updateHold.current=true;document.getElementById('root')?.setAttribute('inert','');}
    port.postMessage({safe});port.close();
   })();
  };
  navigator.serviceWorker.addEventListener('message',handleMessage);
  return()=>{stopped=true;document.removeEventListener('visibilitychange',visible);navigator.serviceWorker.removeEventListener('message',handleMessage)};
 },[busy,syncing,editor]);
  const activateUpdate=async()=>{
   if(busy||syncing||submitInFlight.current)return;
   if(editor||document.querySelector('[role="dialog"],dialog[open]')){setNotice('Finish or close the current form before updating ServOS.');return}
   const currentStore=store.current;
   if(!currentStore){setNotice('Wait for the business workspace to open before updating ServOS.');return}
   try{
    const [pending,printing]=await Promise.all([currentStore.hasPending(),currentStore.hasUnresolvedPrintDelivery()]);
    if(pending){setNotice('Synchronize pending actions and resolve unknown outcomes in Activity before updating ServOS.');return}
    if(printing){setNotice('Resolve the active or uncertain print delivery before updating ServOS.');return}
    if(busy||syncing||submitInFlight.current||editor||document.querySelector('[role="dialog"],dialog[open]'))return;
    const registration=await navigator.serviceWorker?.getRegistration();const worker=registration?.waiting;
    if(!worker){window.location.reload();return}
    worker.postMessage({type:'SERVOS_ACTIVATE_UPDATE'});
   }catch(error){setError(operatorError(error))}
  };
 useEffect(()=>{let active=true;void (apiAuth&&apiStore?apiStore.guidanceProgress():rpcRef.current('rpc/servos_v2_guidance_progress',{})).then(rows=>{if(active)setGuidance(Array.isArray(rows)?rows:[])}).catch(()=>undefined);return()=>{active=false}},[session.businessId,session.actorId,apiAuth,apiStore]);
 const saveGuidance=async(next:WebGuidanceProgress)=>{setGuidance(rows=>[next,...rows.filter(row=>row.guideId!==next.guideId)]);try{const saved=await (apiAuth&&apiStore?apiStore.saveGuidanceProgress(next):rpcRef.current('rpc/servos_v2_guidance_save',{progress:next}));setGuidance(rows=>[saved,...rows.filter(row=>row.guideId!==saved.guideId)]);setNotice('')}catch{setNotice(apiAuth?'Guide progress could not be saved on this browser.':'Guide progress could not be saved to your account. It may not resume on another device; ask an Admin to check Web guidance setup.')}};
 const startTour=(guideId='servos.core')=>{const guide=GUIDES.find(item=>item.id===guideId);if(!guide||(guide.permissions||[]).some(permission=>!session.permissions.includes('*')&&!session.permissions.includes(permission))){setNotice('Your account is not allowed to open this guide. Ask an Admin to review your assigned work.');return}setTourGuideId(guide.id);setTourOpen(true)};
 const active=(collection:string)=>records.filter(r=>r.collection===collection&&!r.archived);
 const organizationData=active('organization')[0]?.data||{};
 const businessEmblem=typeof (organizationData.branding as Record<string,unknown>|undefined)?.appEmblemDataUrl==='string'?String((organizationData.branding as Record<string,unknown>).appEmblemDataUrl):'';
 const property=active('property')[0];
 const allNightlyRates=active('ratePlans').filter(record=>record.data.mode==='NIGHTLY');
 const [roomStay,setRoomStay]=useState({roomTypeId:'',ratePlanId:'',nightlyCheckoutTime:'10:00',dayStayCutoffTime:'18:00'});
 useEffect(()=>{
  const roomTypeId=String(property?.data.roomStayRoomTypeId||active('roomTypes')[0]?.id||'');
  const configuredRate=allNightlyRates.find(record=>record.id===String(property?.data.roomStayRatePlanId||'')&&String(record.data.roomTypeId||'')===roomTypeId);
  const defaults={roomTypeId,ratePlanId:configuredRate?.id||allNightlyRates.find(record=>String(record.data.roomTypeId||'')===roomTypeId)?.id||'',nightlyCheckoutTime:String(property?.data.nightlyCheckoutTime||'10:00'),dayStayCutoffTime:String(property?.data.dayStayCutoffTime||'18:00')};
  if(roomStay.roomTypeId&&roomStay.ratePlanId)return;
  setRoomStay(current=>({...current,roomTypeId:current.roomTypeId||defaults.roomTypeId,ratePlanId:current.ratePlanId||defaults.ratePlanId}));
 },[records,roomStay.roomTypeId,roomStay.ratePlanId]);
 const nightlyRates=allNightlyRates.filter(record=>!roomStay.roomTypeId||String(record.data.roomTypeId||'')===roomStay.roomTypeId);
 useEffect(()=>{if(roomStay.ratePlanId&&!nightlyRates.some(record=>record.id===roomStay.ratePlanId))setRoomStay(current=>({...current,ratePlanId:''}))},[roomStay.roomTypeId,roomStay.ratePlanId,allNightlyRates.length]);
 const propertyTimeZone=String(session.propertyContext?.timeZone||active('property')[0]?.data.timezone||'Africa/Nairobi');
 const find=(collection:string,id:string)=>records.find(r=>r.collection===collection&&r.id===id);
 const choices=(collection:string)=>active(collection).map(r=>({value:r.id,label:label(r)}));
 const select=(key:string,title:string,collection:string):Field=>({key,label:title,type:'select',options:choices(collection)});
 const open=(next:Editor)=>{setEditor(next);setValues(Object.fromEntries(next.fields.map(f=>[f.key,f.value??''])));setError('')};
 const submit=async(operation:string,collection:string,id:string,payload:Record<string,unknown>):Promise<CommandOutcome>=>{
  if(updateHold.current)return {kind:'BLOCKED',message:'ServOS is preparing an update. Wait for this workspace to restart.'};
  const apiCatalogCommand=['product.save','stockItem.save','stockLocation.save','catalog.createWithOpeningStock'].includes(operation);const apiCountCommand=['inventory.countLocation','inventory.countSelected'].includes(operation);const apiInventoryCommand=['inventory.transfer','inventory.waste','inventory.adjust','inventory.produceBatch','inventory.reverseMovement','inventory.receive','inventory.policy.save'].includes(operation);
  const apiPrintCommand=['print.claim','print.report','print.confirm','print.retry','print.cancel'].includes(operation);
  const apiCloseDayCommand=operation==='closeDay.generate';
  if(apiAuth&&apiCloseDayCommand&&!navigator.onLine)return {kind:'BLOCKED',message:'Connect before issuing an immutable close-day report.'};
  const apiRefundCommand=['payment.refund','payment.reverse'].includes(operation);
  if(apiAuth&&apiRefundCommand&&!navigator.onLine)return {kind:'BLOCKED',message:'Connect before recording returned funds.'};
  const apiPaymentCommand=['payment.record','payment.split'].includes(operation);
  if(apiAuth&&apiPaymentCommand&&!navigator.onLine)return {kind:'BLOCKED',message:'Connect before recording received payment.'};
  const apiTillCommand=['till.open','till.cashMovement','till.close','till.reviewVariance'].includes(operation);
  if(apiAuth&&apiTillCommand&&!navigator.onLine)return {kind:'BLOCKED',message:'Connect before submitting a till action.'};
  const apiPosCommand=['order.create','order.addItem','order.updateItem','order.removeItem','order.repeatRound','order.fire','order.kds','order.void','order.discount','order.comp','order.compItem'].includes(operation);
  if(apiAuth&&apiPosCommand&&!navigator.onLine)return {kind:'BLOCKED',message:'Connect before submitting an order action.'};
  const apiSettingsCommand=['business.settings.save','till.policy.save','paymentAccount.save','outlet.save'].includes(operation);
  if(apiAuth&&apiSettingsCommand&&!navigator.onLine)return {kind:'BLOCKED',message:'Connect before changing shared business settings.'};
  if(apiAuth&&apiPrintCommand&&!navigator.onLine)return {kind:'BLOCKED',message:'Connect before claiming or changing a shared print job.'};
  if(apiAuth&&!apiCatalogCommand&&!apiCountCommand&&!apiInventoryCommand&&!apiPrintCommand&&!apiSettingsCommand&&!apiPosCommand&&!apiTillCommand&&!apiPaymentCommand&&!apiRefundCommand&&!apiCloseDayCommand)return {kind:'BLOCKED',message:`${operation} has not migrated to the ServOS API. No command was submitted.`};
  const requiredApiPermission=apiCloseDayCommand?'reports.view':apiRefundCommand?(operation==='payment.refund'?'order.refund':'payment.reverse'):apiPaymentCommand?operation:apiTillCommand?(operation==='till.reviewVariance'?'till.override_variance':operation):apiPosCommand?(operation==='order.kds'?'kds.update':operation==='order.compItem'?'order.comp':['order.fire','order.kds','order.void','order.discount','order.comp','order.compItem'].includes(operation)?operation:'pos.sell'):apiSettingsCommand?'business.configure':operation==='inventory.policy.save'?'business.configure':apiCountCommand?'inventory.count':['inventory.produceBatch','inventory.reverseMovement'].includes(operation)?'inventory.adjust':apiInventoryCommand?operation:'catalog.manage';
  if(apiAuth&&!(apiPrintCommand?['pos.sell','payment.record','order.refund','payment.reverse','order.void','order.discount','order.comp','kds.view','kds.update','system.configure','reports.view','accounting.view','audit.view'].some(permission=>allowed(session,permission)):allowed(session,requiredApiPermission)))return {kind:'BLOCKED',message:`Your API staff account cannot perform ${operation}.`};
  if(!store.current||!ready)return {kind:'BLOCKED',message:'The business workspace is not ready. Reconnect and try again.'};
  if(submitInFlight.current)return {kind:'BLOCKED',message:'Another business action is being submitted. Wait for its outcome before continuing.'};
  submitInFlight.current=true;setBusy(true);setError('');setNotice('');let activeCommandId='';
  try{
    const unresolvedCommand=(await store.current.queue()).find(item=>item.state==='OUTCOME_UNKNOWN');
    if(unresolvedCommand&&unresolvedCommand.id!==payload.reviewCommandId){const message='A previous action still has an unknown outcome. Synchronize it to check the original command before starting another action.';setError(message);return {kind:'BLOCKED',message}}
    if(editor?.supersedes){const predecessor=(await store.current.queue()).find(item=>item.id===editor.supersedes);if(predecessor?.state==='PENDING_SYNC'||predecessor?.state==='OUTCOME_UNKNOWN'){const message='ServOS is still checking the original command. Synchronize it before submitting a replacement.';setError(message);return {kind:'BLOCKED',message}}if(predecessor?.state==='SYNCHRONIZED'){const message='The original command was confirmed. Its replacement was not submitted.';setEditor(null);setError(message);return {kind:'BLOCKED',message}}}
    if(operation==='roomStay.settings'){
      const roomTypeId=String(payload.roomTypeId||'');
      const ratePlanId=String(payload.ratePlanId||'');
      const rate=allNightlyRates.find(record=>record.id===ratePlanId);
      if(!roomTypeId||!rate||String(rate.data.roomTypeId||'')!==roomTypeId){const message='Choose a NIGHTLY rate belonging to the selected room type before saving room-stay policy.';setError(message);return {kind:'BLOCKED',message}}
    }
    if(!apiAuth&&(operation==='inventory.reverseMovement'||operation==='inventory.countSelected'||operation==='procurement.reverseUnusedReceipt'||payload.disposition||payload.expectedVersions||(payload.data as Record<string,unknown>|undefined)?.sellingMode||(payload.product as Record<string,unknown>|undefined)?.sellingMode)){
      const capabilities=await rpcRef.current('rpc/servos_v2_inventory_capabilities',{});
      if(capabilities?.bottleInventoryVersion!==1)return {kind:'BLOCKED',message:'Apply the compatible bottle inventory migration before using this workflow.'};
    }
      const dependencies=resolveOperationDependencies(operation,collection,id,payload,records);
    const pinned=new Map((Array.isArray(payload.expectedVersions)?[]:dependencies).map(version=>[`${version.collection}:${version.id}`,version]));
    if(Array.isArray(payload.expectedVersions))for(const entry of payload.expectedVersions){if(!entry||typeof entry.collection!=='string'||typeof entry.id!=='string'||!Number.isSafeInteger(entry.version)||entry.version<0)throw new Error('Invalid reviewed baseline');pinned.set(`${entry.collection}:${entry.id}`,entry)}
    const baselines=[...pinned.values()];
    const draftId=editor?.draftId||crypto.randomUUID();
    const draftFields=editor?.fields.map(field=>({...field,value:values[field.key]||''})) as WorkflowDraftField[]|undefined;
    const retainForReview=async(validationSummary:string[],supersedes?:string,closeEditor=true)=>{await store.current?.saveDraft({id:draftId,operation,collection,targetId:id,editorKind:editor?.title||operation,inputValues:editor?values:{},fields:draftFields,supersedes:supersedes||editor?.supersedes,payload,expectedVersions:baselines,policyVersion:await store.current?.policyVersion(),validationSummary,requiresReview:true});await refresh();if(closeEditor)setEditor(null)};
    const currentPolicyVersion=await store.current.policyVersion();
    if(editor?.draftId&&editor.policyVersion&&currentPolicyVersion!==editor.policyVersion){const message='Business policy changed. The workflow was retained for review and no command was queued.';await retainForReview(['Business policy changed while this workflow was saved. Review the current authorization and submit again.']);setError(message);return {kind:'BLOCKED',message}}
    if(!navigator.onLine&&!await store.current.hasOfflineAuthorization(operation)){await store.current.saveDraft({id:draftId,operation,collection,targetId:id,editorKind:editor?.title||operation,inputValues:editor?values:{},fields:draftFields,supersedes:editor?.supersedes,payload,expectedVersions:baselines,policyVersion:await store.current.policyVersion(),validationSummary:[],requiresReview:/payment|refund|credit|approval/i.test(operation)});setNotice('Draft saved on this browser. Review and submit when online.');await refresh();setEditor(null);return {kind:'DRAFT_SAVED',draftId}}
    const offlineSubmission=!navigator.onLine;
    const command=await store.current.enqueue(operation,payload,baselines,editor?.supersedes,typeof payload.reviewCommandId==='string'?payload.reviewCommandId:undefined);activeCommandId=command.id;setNotice('Saved on this browser; waiting to sync.');await refresh();
   if(offlineSubmission){setNotice('Saved under this device’s bounded offline grant. It will be checked by the API when the connection returns.');await refresh();setEditor(null);return {kind:'PENDING',commandId:command.id}}
   try{await syncRef.current()}catch(e){
    const current=(await store.current.queue()).find(q=>q.id===command.id);
    if(current?.state==='SYNCHRONIZED'){if(editor?.draftId)await store.current.discardDraft(editor.draftId);setEditor(null);setNotice('Saved and confirmed. The shared view is refreshing; do not submit again.');return {kind:'CONFIRMED',commandId:command.id}}
    const safeError=operatorError(e);await retainForReview([safeError],command.id,false);setEditor(currentEditor=>currentEditor?{...currentEditor,supersedes:command.id}:currentEditor);
    const resultMessage=current?.result?.error?.message;
    const message=current?.state==='OUTCOME_UNKNOWN'?'The outcome is unknown. The original command is saved for outcome checking; synchronize it before creating another action.':resultMessage?operatorError(resultMessage):safeError||'This action is still queued. Synchronize before creating another action.';
    setError(message);if(current?.state==='CONFLICT')return {kind:'CONFLICT',commandId:command.id,message};if(current?.state==='REJECTED')return {kind:'REJECTED',commandId:command.id,message};return current?.state==='OUTCOME_UNKNOWN'?{kind:'OUTCOME_UNKNOWN',commandId:command.id,message}:{kind:'PENDING',commandId:command.id}
   }
   const current=(await store.current.queue()).find(q=>q.id===command.id);const result=current?.result;
   if(result?.status==='SYNCHRONIZED'){if(editor?.draftId)await store.current.discardDraft(editor.draftId);setEditor(null);setNotice('Saved and synchronized.');return {kind:'CONFIRMED',commandId:command.id}}
   const message=result?.error?.message||'This change needs review. See Saved changes in Activity.';await retainForReview([message],command.id,false);setEditor(currentEditor=>currentEditor?{...currentEditor,supersedes:command.id}:currentEditor);setNotice('');setError(message);
   if(result?.status==='CONFLICT')return {kind:'CONFLICT',commandId:command.id,message};
   if(result?.status==='REJECTED')return {kind:'REJECTED',commandId:command.id,message};
   return {kind:'PENDING',commandId:command.id}
  }catch(e){const message=operatorError(e);setError(message);return activeCommandId?{kind:'OUTCOME_UNKNOWN',commandId:activeCommandId,message}:{kind:'BLOCKED',message}}finally{submitInFlight.current=false;setBusy(false)}
 };
 const reviewDraft=(draft:WorkflowDraft)=>{if(draft.supersedes){const original=queue.find(item=>item.id===draft.supersedes);if(original?.state==='PENDING_SYNC'||original?.state==='OUTCOME_UNKNOWN'){setError('ServOS is still checking the original command. Synchronize it before reviewing or submitting a replacement.');return}if(original?.state==='SYNCHRONIZED'){void store.current?.discardDraft(draft.id).then(refresh);setError('The original command was confirmed. Its duplicate review draft was removed.');return}}if(!draft.fields){setError('This saved workflow has no reopenable form fields. Review its evidence and start a new workflow.');return}open({title:draft.editorKind,operation:draft.operation,collection:draft.collection,id:draft.targetId,fields:draft.fields as Field[],draftId:draft.id,supersedes:draft.supersedes,policyVersion:draft.policyVersion,payload:next=>({...draft.payload,...next})})};
 const action=(title:string,operation:string,collection:string,id:string,fields:Field[]=[],extra:Record<string,unknown>={})=>open({title,operation,collection,id,fields,payload:v=>({id,...extra,...v})});
 const master=(collection:string,title:string,fields:Field[])=>{const id=crypto.randomUUID();open({title,operation:'record.save',collection,id,fields,payload:v=>({id,collection,data:{...v,...(collection==='roomTypes'?{maxGuests:Number(v.maxGuests)}:{}),...(collection==='suppliers'?{paymentTermsDays:Number(v.paymentTermsDays)}:{})}})})};
 const editRoom=(room?:BusinessRecord)=>{const id=room?.id||crypto.randomUUID();const fields:Field[]=[{key:'number',label:'Room number'},select('roomTypeId','Room type','roomTypes'),{key:'capacity',label:'Guest capacity',type:'number'},{key:'turnaroundMinutes',label:'Turnaround minutes',type:'number'}];open({title:room?'Edit room':'Add room',operation:'room.save',collection:'rooms',id,fields:fields.map(f=>({...f,value:String(room?.data[f.key]??(f.key==='turnaroundMinutes'?30:''))})),payload:v=>({id,data:{...v,capacity:Number(v.capacity),turnaroundMinutes:Number(v.turnaroundMinutes)}})})};
  const addRate=()=>{const id=crypto.randomUUID();open({title:'Add room stay rate',operation:'ratePlan.save',collection:'ratePlans',id,fields:[{key:'name',label:'Rate name'},select('roomTypeId','Room type','roomTypes'),{key:'mode',label:'Stay type',type:'select',options:[{value:'NIGHTLY',label:'Nightly'}],value:'NIGHTLY'},{key:'price',label:'Rate (KES, tax included)',type:'money'},{key:'taxRatePct',label:'Tax rate (%)',type:'number',value:'0'}],payload:v=>({id,data:{name:v.name,roomTypeId:v.roomTypeId,mode:'NIGHTLY',priceMinor:minor(v.price),taxBasisPoints:parsePercentToBasisPoints(v.taxRatePct),currency:'KES'}})})};
 const reserve=(room:BusinessRecord)=>{const id=crypto.randomUUID();const property=active('property')[0]?.data||{};const checkout=String(session.propertyContext?.nightlyCheckoutTime||property.nightlyCheckoutTime||'10:00');const cutoff=String(session.propertyContext?.dayStayCutoffTime||property.dayStayCutoffTime||'18:00');const arrival=new Date();arrival.setMinutes(0,0,0);const departure=businessDateTimeAfterBusinessDays(arrival,1,checkout,propertyTimeZone);open({title:`Reserve room ${label(room)}`,operation:'roomReservation.create',collection:'roomReservations',id,fields:[select('customerId','Guest','customers'),{key:'stayType',label:'Stay type',type:'select',options:[{value:'NIGHTLY',label:`Nightly · checkout ${checkout}`},{value:'DAY',label:`Day stay · cutoff ${cutoff}`}],value:'NIGHTLY'},{key:'guests',label:'Guests',type:'number',value:'1'},{key:'startsAt',label:`Arrival (${propertyTimeZone})`,type:'datetime-local',value:businessDateTimeInput(arrival,propertyTimeZone)},{key:'endsAt',label:`Departure (${propertyTimeZone})`,type:'datetime-local',value:businessDateTimeInput(departure,propertyTimeZone)}],payload:v=>({id,roomId:room.id,customerId:v.customerId,stayType:v.stayType,guests:Number(v.guests),startsAt:v.startsAt,endsAt:v.endsAt})})};
 const editAsset=(asset?:BusinessRecord)=>{const id=asset?.id||crypto.randomUUID();const fields:Field[]=[{key:'name',label:'Asset name'},{key:'tag',label:'Unique asset tag'},select('assetCategoryId','Category','assetCategories'),{...select('roomId','Room','rooms'),optional:true},{...select('locationId','Stock location','stockLocations'),optional:true},{key:'serialNumber',label:'Serial number',optional:true},{key:'purchaseCostMinor',label:'Acquisition cost (KES)',type:'money'}];open({title:asset?'Edit asset':'Add asset',operation:'asset.save',collection:'assets',id,fields:fields.map(f=>({...f,value:f.key==='purchaseCostMinor'?String(Number(asset?.data.purchaseCostMinor||0)/100):String(asset?.data[f.key]??'')})),payload:v=>({id,data:{...v,purchaseCostMinor:minor(v.purchaseCostMinor)}})})};
 const payment=(booking:BusinessRecord,deposit:boolean)=>open({title:deposit?'Record deposit':'Settle folio',operation:deposit?'folio.deposit':'folio.pay',collection:'folios',id:booking.id,fields:[select('accountId','Payment account','paymentAccounts'),{key:'amount',label:'Amount received (KES)',type:'money'},{key:'cashTendered',label:'Cash tendered (cash only)',type:'money',optional:true},{key:'reference',label:'External reference (non-cash)',optional:true},{key:'confirmation',label:'External payment confirmation',type:'select',optional:true,options:[{value:'confirmed',label:'I have manually verified receipt of funds'}]}],payload:v=>({id:booking.id,accountId:v.accountId,amountMinor:minor(v.amount),...(v.cashTendered?{cashTenderedMinor:minor(v.cashTendered)}:{}),reference:v.reference,manuallyConfirmed:v.confirmation==='confirmed'})});
  const quickProduct=()=>{const id=crypto.randomUUID();open({title:'Add item or menu product',operation:'product.save',collection:'products',id,fields:[{key:'name',label:'Item name'},{key:'code',label:'Item code / SKU'},{key:'price',label:'Selling price (KES)',type:'money'},{key:'category',label:'Category',value:'GENERAL'},{key:'routeTo',label:'Service area',type:'select',options:[{value:'BAR',label:'Bar'},{value:'KITCHEN',label:'Kitchen'},{value:'ROOMS',label:'Rooms'}],value:'BAR'},{key:'taxClassId',label:'Tax class',type:'select',options:[{value:'A_16',label:'Standard · 16%'},{value:'B_0',label:'Zero-rated · 0%'},{value:'C_EXEMPT',label:'Exempt'}]}],payload:v=>({id,data:{name:v.name,code:v.code,priceMinor:minor(v.price),category:v.category,routeTo:v.routeTo,taxClassId:v.taxClassId}})})};
  const quickAdd=(id:string)=>{if(apiAuth&&id!=='product'){setNotice('This workflow is not yet available in the API workspace.');return}if(id==='product')quickProduct();if(id==='room')editRoom();if(id==='asset')editAsset();if(id==='guest')master('customers','Add guest',[{key:'name',label:'Guest name'},{key:'phone',label:'Phone',optional:true},{key:'email',label:'Email',optional:true}]);if(id==='supplier')master('suppliers','Add supplier',[{key:'name',label:'Supplier name'},{key:'code',label:'Supplier code',optional:true},{key:'phone',label:'Phone',optional:true},{key:'email',label:'Email',optional:true}])};
 const pendingCount=queue.filter(q=>q.state==='PENDING_SYNC'||q.state==='OUTCOME_UNKNOWN').length;const unknownCount=queue.filter(q=>q.state==='OUTCOME_UNKNOWN').length;const pending=pendingCount>0;const conflictCount=queue.filter(q=>q.state==='CONFLICT'||q.state==='REJECTED').length;const disabled=busy||!ready;
  const tabs=apiAuth?apiWorkspaces(session):visibleWorkspaces(session).map(workspace=>workspace.id).filter(t=>canSeeTab(session,t as WorkspaceTab)) as WorkspaceTab[];
  const headerStatus=unknownCount?`${unknownCount} action${unknownCount===1?'':'s'} awaiting outcome confirmation`:pending?`${pendingCount} change${pendingCount===1?'':'s'} waiting to sync`:ready?'All changes synchronized':'Connecting to your business records';
 const currentWorkspace=workspaceById(tab);
  const renderNavigation=(mobile=false)=><nav aria-label="Business workspace" className={mobile?'flex gap-2 overflow-x-auto border-t border-slate-800 bg-slate-900 p-2 md:hidden':'flex-1 space-y-5 overflow-auto p-3'}>{mobile?tabs.map(t=><button key={t} aria-current={tab===t?'page':undefined} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${tab===t?'bg-amber-400 text-slate-950':'text-slate-300 hover:bg-slate-800'}`} onClick={()=>setTab(t)}>{workspaceById(t).label}</button>):(apiAuth?[{group:'Business',items:tabs.map(id=>workspaceById(id))}]:workspaceGroups(session)).map(group=><section key={group.group}><h2 className="mb-2 px-3 text-[10px] font-black uppercase tracking-[.18em] text-slate-500">{group.group}</h2><div className="space-y-1">{group.items.map(item=>{const Icon=item.icon;return <button key={item.id} aria-current={tab===item.id?'page':undefined} data-guide-anchor={`navigation.${String(item.id).toLowerCase().replace(/ /g,'-')}`} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${tab===item.id?'bg-amber-400 font-bold text-slate-950 shadow-lg shadow-amber-950/20':'text-slate-300 hover:bg-slate-800 hover:text-white'}`} onClick={()=>setTab(item.id)}><Icon className="h-4 w-4 shrink-0"/><span className="flex-1">{item.label}</span>{tab===item.id&&<ChevronRight className="h-4 w-4"/>}</button>})}</div></section>)}</nav>;
 return <div className="flex h-screen min-h-[600px] overflow-hidden bg-slate-950 text-slate-100">
  <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 md:flex"><div className="border-b border-slate-800 p-4">{businessEmblem?<img src={businessEmblem} alt="Business emblem" className="h-12 max-w-full rounded bg-white object-contain p-1"/>:<div className="text-xs font-black tracking-[.25em] text-amber-400">SERVOS</div>}<div className="mt-1 font-bold">Remote Operations</div><div className="mt-1 truncate text-xs text-slate-500">Authorized business workspace</div></div>{renderNavigation()}<div className="border-t border-slate-800 p-3"><div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4 text-amber-300"/>Authenticated session</div><p className="mt-1 truncate pl-6 text-xs text-slate-500">{session.actorId}</p></div></aside>
  <div className="flex min-w-0 flex-1 flex-col"><header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 sm:px-6"><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[.2em] text-amber-400 md:hidden">SERVOS WEB</div><h1 className="truncate text-lg font-bold sm:text-xl">{currentWorkspace.label}</h1><div data-guide-anchor="web.status shell.status" className="mt-1 flex items-center gap-2 text-xs text-slate-400"><span className={`inline-flex h-2 w-2 rounded-full ${online?'bg-emerald-400':'bg-amber-400'}`}/>{online?'Online':'Offline · saved changes only'}<span className="text-slate-700">·</span><span>{headerStatus}</span></div></div><div className="flex items-center gap-2"><button data-guide-anchor="web.sync" aria-label="Synchronize" disabled={!ready||busy||syncing} className={button} onClick={()=>void syncNow().catch(e=>setError(String(e)))}><RefreshCw className={`h-4 w-4 ${busy||syncing?'animate-spin':''}`}/><span className="hidden sm:inline">{syncing?'Synchronizing…':'Synchronize'}</span></button><button data-guide-anchor="web.help-button shell.help" aria-label="Open contextual help" className={button} onClick={()=>setHelpDrawerOpen(true)}><HelpCircle className="h-4 w-4"/><span className="hidden sm:inline">Help</span></button><button data-guide-anchor="shell.lock" className={button} onClick={onSignOut}>Sign out</button></div></header>
  {renderNavigation(true)}<main className="min-h-0 flex-1 overflow-auto"><div className="mx-auto max-w-[1700px] p-4 sm:p-6"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><PageHeader eyebrow={tab==='POS'?'OPERATIONS':'BUSINESS WORKSPACE'} title={currentWorkspace.label} description={currentWorkspace.description} actions={<><ConnectivityBadge online={online} pending={pendingCount} syncing={syncing} conflicts={conflictCount}/>{pending&&<button className={ds.button} data-guide-anchor="shell.sync" disabled={syncing} onClick={()=>void syncNow().catch(e=>setError(String(e)))}>{syncing?'Synchronizing…':'Synchronize'}</button>}</>}/></div>
  <div className="mb-4 flex flex-wrap items-center gap-2"><StatusBadge tone={ready?'success':'warning'}>{ready?'Workspace ready':headerStatus}</StatusBadge>{apiAuth&&<StatusBadge tone="success">API authority</StatusBadge>}{conflictCount>0&&<StatusBadge tone="danger">{conflictCount} item{conflictCount===1?'':'s'} need review</StatusBadge>}</div>
  {updateReady&&<div className="mb-4"><Notice tone="info"><div className="flex flex-wrap items-center justify-between gap-3"><span><b>ServOS update ready.</b> Finish the current task before restarting this browser.</span><button type="button" className={ds.primaryButton} disabled={busy||syncing} onClick={()=>void activateUpdate()}>Restart and update</button></div></Notice></div>}
  {error&&<Notice tone="danger">{error}</Notice>}{notice&&<div className="mt-3"><Notice tone="success">{notice}</Notice></div>}
  <React.Suspense fallback={<section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><div className="flex items-start gap-3"><RefreshCw className="h-5 w-5 animate-spin text-amber-300"/><div><h2 className="font-bold">Opening workspace</h2><p className="mt-1 text-sm text-slate-400">Loading the tools for this workspace…</p></div></div></section>}>
  {session.lifecycleStage&&session.lifecycleStage!=='LIVE'?<WebLifecycleView session={session} rpc={rpcRef.current} onUpdated={next=>{setSession(next);setLifecycleRefresh(value=>value+1)}}/>:<>{ready&&<WebStaffWelcome session={session} onDismiss={()=>undefined} onStartTour={()=>setTourOpen(true)}/>} {!ready&&<section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><div className="flex items-start gap-3"><Wifi className="mt-1 h-5 w-5 text-amber-300"/><div><h2 className="font-bold">Preparing your workspace</h2><p className="mt-1 text-sm text-slate-400">Online sign-in, device registration, and an authorized business snapshot are required before operations can begin.</p></div></div></section>}</>}
  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 shadow-xl shadow-black/10 sm:p-5">
  {ready&&tab==='Home'&&<WebStartHere apiAuthority={!!apiAuth} permissions={session.permissions} onNavigate={next=>setTab(next as WorkspaceTab)} onQuickAdd={quickAdd} onOpenHelp={query=>{const guideIds:Record<string,string>={'Getting around ServOS':'servos.core','Make your first sale':'pos.first-sale','Count stock':'stock.count','Receive a delivery':'stock.receive'};setHelpQuery(guideIds[query||'']||query||'');setTab('Help')}} onStartTour={()=>{setTourGuideId('servos.core');setTourOpen(true)}}/>}
  {ready&&tab==='Help'&&<WebHelpView initialQuery={helpQuery} permissions={session.permissions} progress={guidance} onStartTour={startTour} onRestartGuide={guideId=>void saveGuidance({guideId,guideVersion:1,state:'IN_PROGRESS',currentStepId:null,completedStepIds:[]})}/>}
 {ready&&tab==='POS'&&apiAuth&&store.current&&<WebApiPosView apiAuth={apiAuth} records={records} queue={queue} session={session} deviceId={store.current.deviceId} readRecords={async()=>await store.current?.records()||[]} disabled={disabled||queue.some(entry=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state)&&['order.create','order.addItem','order.updateItem','order.removeItem','order.repeatRound','order.fire','order.kds','order.void','order.discount','order.comp','order.compItem','till.open','till.cashMovement','till.close','till.reviewVariance','payment.record','payment.split','payment.refund','payment.reverse'].includes(entry.command.operation))} command={submit}/>}
 {ready&&tab==='POS'&&!apiAuth&&<WebPosView records={records} session={session} disabled={disabled} command={submit}/>}
  {ready&&tab==='KDS'&&<WebKDSView records={records} session={session} disabled={disabled} command={submit} onRefresh={syncNow}/>}
 {ready&&tab==='Catalog'&&<WebCatalogView records={records} session={session} disabled={disabled} command={submit}/>}
 {ready&&tab==='Inventory'&&<WebInventoryView records={records} session={session} disabled={disabled} command={submit} apiAuthority={Boolean(apiAuth)}/>}
 {ready&&tab==='Procurement'&&<WebProcurementView records={records} session={session} disabled={disabled} command={submit}/>}
 {ready&&tab==='Front Desk'&&<WebFrontDeskView records={records} session={session} disabled={disabled} command={submit}/>}
 {ready&&tab==='Guest Accounts'&&<WebGuestAccountsView records={records} session={session} disabled={disabled} command={submit}/>}
 {ready&&tab==='Housekeeping'&&<WebHousekeepingView records={records} session={session} disabled={disabled} command={submit}/>}
 {ready&&tab==='Maintenance'&&<WebMaintenanceView records={records} session={session} disabled={disabled} command={submit}/>}
 {ready&&tab==='Floorplan'&&<WebFloorplanView records={records} session={session} disabled={disabled} command={submit}/>}
  {ready&&tab==='Rooms'&&<section className="space-y-5"><div className="flex flex-wrap gap-2">{allowed(session,'rooms.manage')&&<><button disabled={disabled||!active('roomTypes').length} className={primaryButton} onClick={()=>editRoom()}><BedDouble className="h-4 w-4"/>Add room</button><button disabled={disabled||!active('roomTypes').length} className={button} onClick={addRate}>Add rate</button></>}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{active('rooms').map(room=><article key={room.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 transition hover:border-amber-500/40"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Room {label(room)}</h2><p className="mt-1 text-sm text-slate-400">Capacity {String(room.data.capacity)} &#183; {String(room.data.turnaroundMinutes)} min turnaround</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-emerald-200">{String(room.data.housekeepingState||'CLEAN')}</span></div><p className="mt-2 text-xs text-slate-500">{String(room.data.maintenanceState||'AVAILABLE')}</p><div className="mt-4 flex flex-wrap gap-2">{allowed(session,'rooms.manage')&&<button className={button} disabled={disabled} onClick={()=>editRoom(room)}>Edit</button>}{allowed(session,'rooms.operate')&&<button className={primaryButton} disabled={disabled} onClick={()=>reserve(room)}>Reserve / walk-in</button>}{allowed(session,'rooms.manage')&&<button className={button} disabled={disabled} onClick={()=>action('Update housekeeping','room.housekeeping','rooms',room.id,[{key:'state',label:'Next housekeeping state',type:'select',options:['DIRTY','CLEANING','INSPECTION','CLEAN'].map(value=>({value,label:value}))}])}>Housekeeping</button>}</div></article>)}</div>{active('rooms').length===0&&<section className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-12 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-800 text-amber-300"><BedDouble className="h-7 w-7"/></span><h2 className="mt-4 text-lg font-bold">Set up your first room</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">Start with a room type and rate plan, then add rooms. Reservations and stays will appear here once created.</p><div className="mt-5 flex flex-wrap justify-center gap-2">{allowed(session,'roomTypes.manage')&&<button className={primaryButton} onClick={()=>setTab('Settings')}>Set up room types</button>}</div></section>}
   <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><BedDouble className="h-5 w-5 text-amber-300"/>Reservations and stays</h2>{active('roomReservations').map(booking=>{const folio=find('folios',booking.id);return <article key={booking.id} className="mb-3 rounded-xl border border-slate-800 bg-slate-900 p-4"><h3 className="font-bold">{label(find('customers',String(booking.data.customerId))||booking)} &#183; Room {String(find('rooms',String(booking.data.roomId))?.data.number||booking.data.roomId)}</h3><p className="mt-1 text-sm text-slate-400">{String(booking.data.status)} &#183; {new Date(String(booking.data.startsAt)).toLocaleString()} – {new Date(String(booking.data.endsAt)).toLocaleString()}</p>{folio&&<p className="mt-2 text-sm">Balance {money(folio.data.balanceMinor)} &#183; Unapplied deposit {money(folio.data.depositMinor)}</p>}<div className="mt-3 flex flex-wrap gap-2">
    {booking.data.status==='RESERVED'&&allowed(session,'rooms.operate')&&<><button disabled={disabled} className={button} onClick={()=>action('Check in','stay.checkIn','stays',booking.id)}>Check in</button><button disabled={disabled} className={button} onClick={()=>action('Cancel reservation','roomReservation.cancel','roomReservations',booking.id,[{key:'reason',label:'Cancellation reason'}])}>Cancel</button></>}
    {!folio&&allowed(session,'folio.manage')&&booking.data.status==='RESERVED'&&<button disabled={disabled} className={button} onClick={()=>action('Open folio for deposits','folio.open','folios',booking.id)}>Open folio</button>}
    {folio?.data.status==='OPEN'&&allowed(session,'folio.manage')&&<><button disabled={disabled} className={button} onClick={()=>payment(booking,true)}>Deposit</button><button disabled={disabled} className={button} onClick={()=>payment(booking,false)}>Payment</button><button disabled={disabled} className={button} onClick={()=>open({title:'Apply deposit',operation:'folio.applyDeposit',collection:'folios',id:booking.id,fields:[{key:'amount',label:'Amount to apply (KES)',type:'money'}],payload:v=>({id:booking.id,amountMinor:minor(v.amount)})})}>Apply deposit</button>{booking.data.status==='CHECKED_IN'&&<button disabled={disabled} className={button} onClick={()=>action('Post all booked accommodation for settlement','folio.postAccommodation','folios',booking.id,[],{settleBookedStay:true})}>Post accommodation</button>}</>}
    {booking.data.status==='CHECKED_IN'&&allowed(session,'rooms.operate')&&<><button disabled={disabled} className={button} onClick={()=>action('Move guest','stay.move','stays',booking.id,[select('roomId','Destination room','rooms'),{key:'reason',label:'Move reason'}])}>Move room</button><button disabled={disabled} className={button} onClick={()=>action('Check out after settlement','stay.checkOut','stays',booking.id)}>Check out</button></>}
   </div></article>})}
  </section></section>}
  {ready&&tab==='Assets'&&<section className="space-y-4">{allowed(session,'assets.manage')&&<button disabled={disabled} className={button} onClick={()=>editAsset()}>Add asset</button>}{active('assets').map(asset=><article key={asset.id} className="rounded-xl border border-slate-700 p-4"><h2 className="font-bold">{label(asset)} &#183; {String(asset.data.tag)}</h2><p>{String(asset.data.status)} &#183; {String(asset.data.condition)} &#183; Custodian: {String(find('employees',String(asset.data.custodianId))?.data.name||'Unassigned')}</p><div className="mt-3 flex flex-wrap gap-2">{allowed(session,'assets.manage')&&<button disabled={disabled} className={button} onClick={()=>editAsset(asset)}>Edit</button>}{allowed(session,'assets.operate')&&<><button disabled={disabled} className={button} onClick={()=>action('Assign asset','asset.assign','assets',asset.id,[select('custodianId','Custodian','employees'),{key:'reason',label:'Assignment reason'}])}>Assign</button><button disabled={disabled} className={button} onClick={()=>action('Return asset','asset.return','assets',asset.id,[{key:'reason',label:'Return reason'}])}>Return</button><button disabled={disabled} className={button} onClick={()=>action('Transfer asset','asset.transfer','assets',asset.id,[{...select('roomId','Destination room','rooms'),optional:true},{...select('locationId','Destination location','stockLocations'),optional:true},{key:'reason',label:'Transfer reason'}])}>Transfer</button><button disabled={disabled} className={button} onClick={()=>action('Inspect asset','asset.inspect','assets',asset.id,[{key:'condition',label:'Condition',type:'select',options:['GOOD','FAIR','POOR','BROKEN'].map(value=>({value,label:value}))},{key:'reason',label:'Inspection notes'}])}>Inspect</button></>}</div></article>)}{active('assets').length===0&&<p>No assets yet. Add a category in Settings and assign each asset to a room or stock location.</p>}</section>}
 {ready&&tab==='Settings'&&apiAuth&&allowed(session,'business.configure')&&<WebBridgeSettings key={`${session.businessId}:${apiAuth.identity.deviceId}`} businessId={session.businessId} identity={apiAuth.identity} disabled={disabled}/>}
 {ready&&tab==='Settings'&&apiAuth&&allowed(session,'business.configure')&&<WebBridgeRecovery key={`${session.businessId}:${apiAuth.identity.deviceId}`} businessId={session.businessId} identity={apiAuth.identity} disabled={disabled||queue.some(entry=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state)&&entry.command.operation.startsWith('print.'))} reporting={{auth:apiAuth,command:submit,readRecords:async()=>await store.current?.records()||[]}}/>}
 {ready&&tab==='Settings'&&apiAuth&&allowed(session,'business.configure')&&<WebApiSettings records={records} session={session} disabled={disabled||queue.some(entry=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state)&&['business.settings.save','till.policy.save','paymentAccount.save','outlet.save'].includes(entry.command.operation))} command={submit}/>}
 {ready&&tab==='Settings'&&!apiAuth&&<section className="space-y-4"><h2 className="text-xl font-bold">Business master records</h2><div className="flex flex-wrap gap-2">{allowed(session,'customers.manage')&&<button disabled={disabled} className={button} onClick={()=>master('customers','Add guest',[{key:'name',label:'Guest name'},{key:'phone',label:'Phone',optional:true},{key:'email',label:'Email',optional:true}])}>Add guest</button>}{allowed(session,'roomTypes.manage')&&<button disabled={disabled} className={button} onClick={()=>master('roomTypes','Add room type',[{key:'name',label:'Room type'},{key:'maxGuests',label:'Maximum guests',type:'number'}])}>Add room type</button>}{allowed(session,'assetCategories.manage')&&<button disabled={disabled} className={button} onClick={()=>master('assetCategories','Add asset category',[{key:'name',label:'Category name'}])}>Add asset category</button>}</div><section className="rounded-xl border border-slate-700 bg-slate-950/50 p-4"><h3 className="font-semibold">Room-stay policy</h3><p className="mt-1 text-sm text-slate-400">Choose the NIGHTLY rate used by reservations. Save this before creating a room reservation.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Room type<select className={input} value={roomStay.roomTypeId} onChange={event=>setRoomStay({...roomStay,roomTypeId:event.target.value})}><option value="">Select room type…</option>{active('roomTypes').map(record=><option key={record.id} value={record.id}>Room type: {label(record)}</option>)}</select></label><label className="text-sm">Nightly rate<select className={input} value={roomStay.ratePlanId} onChange={event=>setRoomStay({...roomStay,ratePlanId:event.target.value})}><option value="">Select nightly rate…</option>{nightlyRates.map(record=><option key={record.id} value={record.id}>Nightly rate: {label(record)} {middleDot} {money(record.data.priceMinor)}</option>)}</select></label><label className="text-sm">Nightly checkout<input className={input} type="time" value={roomStay.nightlyCheckoutTime} onChange={event=>setRoomStay({...roomStay,nightlyCheckoutTime:event.target.value})}/></label><label className="text-sm">Day-stay cutoff<input className={input} type="time" value={roomStay.dayStayCutoffTime} onChange={event=>setRoomStay({...roomStay,dayStayCutoffTime:event.target.value})}/></label></div><button disabled={disabled||!allowed(session,'business.configure')||!roomStay.roomTypeId||!roomStay.ratePlanId} className={`${button} mt-3`} onClick={()=>void submit('roomStay.settings','property','property',{...roomStay})}>Save room-stay policy</button>{!allowed(session,'business.configure')&&<p className="mt-2 text-xs text-amber-200">An Admin with business configuration access must save this policy.</p>}</section>{['customers','roomTypes','ratePlans','assetCategories','paymentAccounts','hotelServices'].map(collection=><div key={collection}><h3 className="font-semibold">{collection}</h3><ul className="space-y-1">{active(collection).map(r=><li key={r.id}>{label(r)}{r.data.priceMinor!==undefined?` ${middleDot} ${money(r.data.priceMinor)}`:''}</li>)}</ul></div>)}</section>}
  {ready&&tab==='Activity'&&<>{apiAuth&&<WebBridgeRecovery key={`${session.businessId}:${apiAuth.identity.deviceId}`} businessId={session.businessId} identity={apiAuth.identity} disabled={disabled||queue.some(entry=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state)&&entry.command.operation.startsWith('print.'))} reporting={{auth:apiAuth,command:submit,readRecords:async()=>await store.current?.records()||[]}}/>}{apiAuth&&['reports.view','accounting.view','audit.view'].some(permission=>allowed(session,permission))&&<WebApiCloseDayReports records={records} session={session} queue={queue} disabled={disabled||queue.some(entry=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state)&&entry.command.operation==='closeDay.generate')} command={submit}/>}{apiAuth&&store.current&&<WebDocumentQueue apiAuth={apiAuth} records={records} actorId={session.actorId} deviceId={store.current.deviceId} disabled={disabled} command={submit} queue={queue} readRecords={async()=>await store.current?.records()||[]}/>}{apiAuth&&['accounting.view','audit.view','reports.view'].some(permission=>allowed(session,permission))&&<WebApiJournalLedger records={records}/>}
<ActivitySyncCenter queue={queue} drafts={drafts} online={online} syncing={syncing} onSync={syncNow} onReviewDraft={reviewDraft} onExportRecovery={exportRecovery}/>{store.current&&<WebStorageDiagnostics store={store.current} refreshKey={queue.map(entry=>`${entry.id}:${entry.state}`).join('|')}/>}</>}
   {ready&&tab==='Finance Controls'&&<WebFinancialControlsView records={records} session={session} disabled={disabled} command={submit}/>}
   {ready&&tab==='Finance'&&(allowed(session,'reports.view')||allowed(session,'till.view'))&&<WebFinanceView records={records} session={session} disabled={disabled} command={submit}/>}
   {ready&&tab==='Staff'&&(allowed(session,'staff.view')||allowed(session,'devices.manage'))&&<WebStaffAdminView records={records} session={session} disabled={disabled} command={submit} rpc={rpcRef.current} currentDeviceId={localStorage.getItem(`servos-device:${session.businessId}:${session.actorId}`)||''}/>}
  {ready&&tab==='Administration'&&<WebAdministrationView records={records} session={session} disabled={disabled} command={submit} rpc={rpcRef.current}/>}
  {editor&&<Dialog title={editor.title} onClose={()=>{if(!busy)setEditor(null)}} footer={<><button type="submit" form="workflow-editor-form" disabled={busy} className={`${button} bg-amber-400 text-slate-950`}>{busy?'Saving…':'Confirm'}</button><button type="button" className={button} disabled={busy} onClick={()=>setEditor(null)}>Cancel</button></>}><form id="workflow-editor-form" className="space-y-4" onSubmit={e=>{e.preventDefault();try{const normalized={...values};for(const field of editor.fields)if(field.type==='datetime-local')normalized[field.key]=businessDateTimeToUtc(values[field.key]||'',propertyTimeZone);void submit(editor.operation,editor.collection,editor.id,editor.payload(normalized))}catch(error){setError(String(error))}}}>{editor.fields.length===0&&<p>Review the details, then choose Confirm. Your access and the latest business information are checked before saving.</p>}{editor.fields.map(f=><label key={f.key} className="block">{f.label}{f.type==='select'?<SearchCombobox options={[{id:'',label:f.optional?'No selection':'Select…'},...(f.options||[]).map(option=>({id:option.value,label:option.label}))]} value={values[f.key]||''} onValueChange={value=>setValues(v=>({...v,[f.key]:value}))} disabled={busy}/>:<input required={!f.optional} data-business-timezone={f.type==='datetime-local'?propertyTimeZone:undefined} className={input} type={f.type==='money'?'number':f.type||'text'} min={f.type==='number'||f.type==='money'?0:undefined} step={f.type==='money'?'0.01':f.type==='number'?'1':undefined} value={values[f.key]||''} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}/>}</label>)}</form></Dialog>}
  {ready&&tab==='Master Data'&&<WebMasterDataView records={records} session={session} disabled={disabled} command={submit}/>}
   {ready&&tab==='Refunds'&&apiAuth&&store.current&&<WebApiRefundsView records={records} session={session} deviceId={store.current.deviceId} queue={queue} disabled={disabled||queue.some(entry=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state)&&(entry.command.operation.startsWith('payment.')||entry.command.operation.startsWith('till.')||entry.command.operation.startsWith('order.')))} command={submit}/>}
   {ready&&tab==='Refunds'&&!apiAuth&&<WebRefundsView records={records} session={session} disabled={disabled} command={submit}/>}
  </div></React.Suspense>
   </div></main></div>{helpDrawerOpen&&<ContextHelpDrawer open workspace={tab} online={online} permissions={session.permissions} onClose={()=>setHelpDrawerOpen(false)} onOpenHelp={query=>{setHelpQuery(query);setTab('Help')}}/>}{tourOpen&&<WebGuidedTour localProgress={!!apiAuth} guideId={tourGuideId} committedOperation={committedOperation} progress={guidance.find(row=>row.guideId===tourGuideId)} onProgress={saveGuidance} onNavigate={next=>setTab(next as WorkspaceTab)} onOperation={operation=>setTab(operation.startsWith('inventory.')?'Inventory':operation.startsWith('procurement.')||operation.startsWith('purchaseOrder.')?'Procurement':'POS')} onClose={()=>{setTourOpen(false);setTourGuideId('servos.core')}}/>}</div>;
}
