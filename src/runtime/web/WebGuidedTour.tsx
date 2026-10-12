import React,{useEffect,useRef,useState} from 'react';
import {BookOpen,RotateCcw,SkipForward,X} from 'lucide-react';
import {GUIDES,type GuideDefinition,type GuideStep} from '../../guidance/core';
import type {WebGuidanceProgress} from './session';
import {useGuideTarget,visibleGuideTarget} from './webGuidanceTargets';

type CommittedOperation={id:string;operation:string;payload?:Record<string,unknown>};
type Props={localProgress?:boolean;guideId?:string;permissions?:readonly string[];availableWorkspaces?:readonly string[];committedOperation?:CommittedOperation|null;onClose:()=>void;progress?:WebGuidanceProgress;onProgress?:(progress:WebGuidanceProgress)=>void;onNavigate?:(tab:string)=>void;onOpenHelp?:(query?:string)=>void;onOperation?:(operation:string)=>void};
const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40';
const primary=`${button} border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-300`;
const canUse=(permissions:readonly string[],required:readonly string[]=[])=>required.every(permission=>permissions.includes('*')||permissions.includes(permission));
const destination=(step:GuideStep|undefined)=>step?.webTab||({pos:'POS',inventory:'Inventory',procurement:'Procurement'} as Record<string,string>)[step?.route?.screen||''];
function matchesPayload(value:unknown,step:GuideStep):boolean {
 if(!step.successPayloadFields?.length&&!step.successPayloadEquals)return true;
 if(!value||typeof value!=='object')return false;
 if(Array.isArray(value))return value.some(item=>matchesPayload(item,step));
 const record=value as Record<string,unknown>;
 if((step.successPayloadFields||[]).every(field=>Boolean(record[field]))&&Object.entries(step.successPayloadEquals||{}).every(([field,expected])=>record[field]===expected))return true;
 return Object.values(record).some(item=>matchesPayload(item,step));
}
function savedState(guide:GuideDefinition,progress:WebGuidanceProgress|undefined){
 const valid=progress?.guideVersion===guide.version&&progress.guideId===guide.id;
 const completed=valid?guide.steps.filter(step=>progress?.completedStepIds.includes(step.id)).map(step=>step.id):[];
 const index=valid&&progress?.state==='COMPLETED'&&completed.length===guide.steps.length?guide.steps.length:valid&&progress?.currentStepId?guide.steps.findIndex(step=>step.id===progress.currentStepId):0;
 return {index:index>=0?index:0,completed};
}

export function WebGuidedTour(props:Props){
 const guide=GUIDES.find(item=>item.id===(props.guideId||'servos.core'));
 // Unknown guide IDs must not silently open a different training task.
 if(!guide)return <div role="dialog" aria-label="Guide unavailable" className="fixed inset-x-4 bottom-24 z-[60] rounded-xl border border-slate-600 bg-slate-900 p-5 text-white"><p>This guide is no longer available. Return to Help to choose a current guide.</p><button className={`${button} mt-3`} onClick={props.onClose}>Close</button></div>;
 return <GuidedTask key={`${guide.id}:${guide.version}`} {...props} guide={guide}/>;
}

function GuidedTask({guide,localProgress=false,permissions=[],availableWorkspaces,committedOperation,onClose,progress,onProgress,onNavigate,onOpenHelp}:Props&{guide:GuideDefinition}){
 const [state,setState]=useState(()=>savedState(guide,progress));
 const [retry,setRetry]=useState(0);const [summary,setSummary]=useState(false);
 const current=guide.steps[state.index];const complete=state.completed.length===guide.steps.length;
 const callbacks=useRef({onClose,onProgress,onNavigate,onOpenHelp});callbacks.current={onClose,onProgress,onNavigate,onOpenHelp};
 const stateRef=useRef(state);stateRef.current=state;
 const interacted=useRef(false);const adopted=useRef(Boolean(progress));const seenCommit=useRef(committedOperation?.id);
 const dialog=useRef<HTMLElement>(null);const heading=useRef<HTMLHeadingElement>(null);const originalFocus=useRef<HTMLElement|null>(null);
 const allowed=canUse(permissions,guide.permissions)&&canUse(permissions,current?.permissions);
 const tab=destination(current);const workspaceAllowed=!tab||!availableWorkspaces||availableWorkspaces.includes(tab);
 const target=useGuideTarget(current,retry,allowed&&workspaceAllowed&&!summary);
 const versionChanged=Boolean(progress&&progress.guideVersion!==guide.version);

 const persist=(next:typeof state,finished=false)=>{
  callbacks.current.onProgress?.({guideId:guide.id,guideVersion:guide.version,state:finished?'COMPLETED':'IN_PROGRESS',currentStepId:finished?null:guide.steps[next.index]?.id||guide.steps.find(step=>!next.completed.includes(step.id))?.id||null,completedStepIds:next.completed});
 };
 useEffect(()=>{
  // An asynchronously loaded checkpoint may be adopted once, before any user action.
  // A delayed save response must never send the operator back to an earlier step.
  if(progress&&!adopted.current&&!interacted.current){adopted.current=true;const next=savedState(guide,progress);stateRef.current=next;setState(next);}
 },[guide,progress]);
 useEffect(()=>{
  originalFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  return()=>{const element=originalFocus.current;if(element&&visibleGuideTarget(element))element.focus({preventScroll:true});};
 },[]);
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[state.index,summary]);
 useEffect(()=>{
  if(allowed&&workspaceAllowed&&tab&&!summary)callbacks.current.onNavigate?.(tab);
  // Navigation callbacks are often inline in the shell. Identity changes must not navigate again.
 },[guide.id,state.index,allowed,workspaceAllowed,tab,summary]);
 useEffect(()=>{
  const escape=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||event.defaultPrevented)return;
   const owner=event.target instanceof HTMLElement?event.target.closest('[role="dialog"],dialog'):null;
   if(owner&&owner!==dialog.current)return;
   event.preventDefault();callbacks.current.onClose();
  };
  window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
 },[]);

 const advance=(committed=false,skip=false)=>{
  const before=stateRef.current,step=guide.steps[before.index];if(!step||!skip&&(!allowed||!workspaceAllowed))return;
  if(!skip&&step.successOperations?.length&&!committed)return;
  interacted.current=true;
  const completed=!skip&&!before.completed.includes(step.id)?[...before.completed,step.id]:before.completed;
  const next={index:Math.min(before.index+1,guide.steps.length),completed};stateRef.current=next;setState(next);
  const finished=completed.length===guide.steps.length;
  if(next.index===guide.steps.length){setSummary(true);persist({...next,index:guide.steps.findIndex(item=>!completed.includes(item.id))},finished);}else persist(next);
 };
 useEffect(()=>{
  if(!committedOperation||seenCommit.current===committedOperation.id)return;
  seenCommit.current=committedOperation.id;
  if(!summary&&allowed&&workspaceAllowed&&current?.successOperations?.includes(committedOperation.operation)&&matchesPayload(committedOperation.payload,current))advance(true);
 },[committedOperation,current,summary,allowed,workspaceAllowed]);
 const moveBack=()=>{interacted.current=true;const next={...stateRef.current,index:Math.max(0,stateRef.current.index-1)};stateRef.current=next;setState(next);setSummary(false);persist(next);};
 const restart=()=>{interacted.current=true;const next={index:0,completed:[]};stateRef.current=next;setState(next);setSummary(false);setRetry(value=>value+1);persist(next);};
 const reviewSkipped=()=>{const index=guide.steps.findIndex(step=>!stateRef.current.completed.includes(step.id));const next={...stateRef.current,index:Math.max(0,index)};stateRef.current=next;setState(next);setSummary(false);persist(next);};
 const retryTarget=()=>{if(allowed&&workspaceAllowed&&tab)callbacks.current.onNavigate?.(tab);setRetry(value=>value+1);};
 const openHelp=()=>{if(callbacks.current.onOpenHelp)callbacks.current.onOpenHelp(guide.id);else{callbacks.current.onNavigate?.('Help');callbacks.current.onClose();}};
 const missing=target.state==='MISSING';
 // Dock above the phone's application navigation. Move to the top when the target is low.
 const topDock=Boolean(target.rect&&target.rect.top>window.innerHeight*.5&&window.innerWidth<768);
 const skipped=guide.steps.filter(step=>!state.completed.includes(step.id));
 return <div className="pointer-events-none fixed inset-0 z-[60]">
  {target.rect&&target.state==='FOUND'&&!summary&&<div aria-hidden="true" className="fixed rounded-lg border-2 border-amber-300 shadow-[0_0_0_3px_rgba(15,23,42,.75)]" style={{top:Math.max(0,target.rect.top-3),left:Math.max(0,target.rect.left-3),width:target.rect.width+6,height:target.rect.height+6}}/>}
  <section ref={dialog} role="dialog" aria-modal="false" aria-labelledby="servos-guide-heading" aria-describedby="servos-guide-description" className="pointer-events-auto fixed right-4 w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-amber-500/50 bg-slate-900 p-4 text-white shadow-2xl sm:p-5" style={{...(topDock?{top:'calc(1rem + env(safe-area-inset-top))'}:{bottom:'calc(5.5rem + env(safe-area-inset-bottom))'}),maxHeight:'calc(100dvh - 8rem - env(safe-area-inset-bottom))'}} onKeyDown={event=>{
   if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
   if(event.key==='ArrowLeft'){event.preventDefault();moveBack();}
   if(event.key==='ArrowRight'&&target.state!=='WAITING'&&target.state!=='MISSING'&&!current?.successOperations?.length&&!summary){event.preventDefault();advance();}
  }}>
   <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-amber-300">{guide.title}</p><button type="button" className={button} aria-label="Close guide and keep progress" onClick={onClose}><X className="h-4 w-4"/></button></div>
   <h2 ref={heading} tabIndex={-1} id="servos-guide-heading" className="mt-3 text-lg font-bold outline-none">{summary||!current?(complete?'Guide complete':'Steps left to review'):current.title}</h2>
   <div id="servos-guide-description">
    {summary||!current?<><p className="mt-2 text-sm text-slate-300">{complete?'Every guide step has been completed.':`${skipped.length} step${skipped.length===1?' was':'s were'} skipped or remain unconfirmed. They are not marked complete.`} {localProgress?'Progress is saved on this browser for this staff account.':'Progress is saved for this staff account.'}</p>{!complete&&<ul className="mt-3 space-y-1 text-sm text-slate-300">{skipped.map(step=><li key={step.id}>{step.title}</li>)}</ul>}</>:<><p className="mt-1 text-xs text-slate-400">Step {state.index+1} of {guide.steps.length} · {state.completed.length} completed</p><p className="mt-3 text-sm leading-6 text-slate-300">{current.description}</p>{current.successOperations?.length&&<p className="mt-3 rounded-lg border border-slate-700 p-3 text-xs leading-5 text-slate-300">Practice uses the real workspace. This guide opens controls but never submits a transaction. Only a confirmed server result completes this step; pending or uncertain results do not.</p>}</>}
   </div>
   {versionChanged&&<p className="mt-3 text-xs text-slate-300">This guide has changed. Earlier-version completion does not mark the current steps complete. Review this version before finishing.</p>}
   {(!allowed||!workspaceAllowed)&&<p role="status" className="mt-3 rounded-lg border border-amber-500/40 p-3 text-sm text-amber-100">This task is unavailable with your current access or device. Ask an authorized manager for help. The guide does not grant additional permissions.</p>}
   {!summary&&allowed&&workspaceAllowed&&(target.state==='WAITING'||missing)&&<div role="status" className="mt-3 rounded-lg border border-amber-500/40 p-3 text-sm text-amber-100">{missing?'This step is not available on your screen. The control may be hidden by your current context, or the workspace may still be loading. Retry or skip it and return later.':'Waiting for the workspace control to load. You can retry, open Help or skip this step.'}</div>}
   <div className="mt-4 flex flex-wrap gap-2">
    {summary||!current?<><button className={primary} onClick={complete?onClose:reviewSkipped}>{complete?'Done':'Review remaining steps'}</button><button className={button} onClick={restart}><RotateCcw className="h-4 w-4"/>Restart</button></>:<>
     <button className={button} disabled={state.index===0} onClick={moveBack}>Back</button>
     {allowed&&workspaceAllowed&&(missing||target.state==='WAITING')&&<button className={button} onClick={retryTarget}>Retry target</button>}
     <button className={button} onClick={()=>advance(false,true)}><SkipForward className="h-4 w-4"/>Skip step</button>
     {current.successOperations?.length?<button className={primary} disabled={!allowed||!workspaceAllowed} onClick={retryTarget}>Open practice</button>:<button className={primary} disabled={!allowed||!workspaceAllowed||missing||target.state==='WAITING'} onClick={()=>advance()}>{state.index===guide.steps.length-1?'Finish':'Next'}</button>}
    </>}
    <button className={button} onClick={openHelp}><BookOpen className="h-4 w-4"/>Open Help</button>
   </div>
  </section>
 </div>;
}
