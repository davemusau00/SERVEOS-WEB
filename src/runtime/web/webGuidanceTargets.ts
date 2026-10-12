import {useEffect,useState} from 'react';
import type {GuideStep} from '../../guidance/core';

export type GuideTarget = {state:'WAITING'|'FOUND'|'MISSING'|'NONE';element:HTMLElement|null;rect:{top:number;left:number;width:number;height:number}|null};
const empty:GuideTarget={state:'NONE',element:null,rect:null};

export function visibleGuideTarget(element:HTMLElement):boolean {
 if(!element.isConnected||element.closest('[hidden],[inert],[aria-hidden="true"]')||!element.getClientRects().length)return false;
 const style=window.getComputedStyle(element);
 return style.visibility!=='hidden'&&style.display!=='none';
}

export function findGuideTarget(anchors:readonly string[]):HTMLElement|null {
 const candidates=Array.from(document.querySelectorAll<HTMLElement>('[data-guide-anchor]'));
 // Prefer the step's primary anchor. Hidden, preserved workspaces must never win lookup.
 for(const anchor of anchors){const found=candidates.find(element=>element.dataset.guideAnchor?.split(/\s+/).includes(anchor)&&visibleGuideTarget(element));if(found)return found;}
 return null;
}

/** Observe lazy loading and changing layouts without polling every hidden workspace. */
export function useGuideTarget(step:GuideStep|undefined,retry:number,enabled:boolean):GuideTarget {
 const [target,setTarget]=useState<GuideTarget>(empty);
 useEffect(()=>{
  if(!enabled||!step?.target){setTarget(empty);return;}
  const anchors=[step.target,...step.alternateTargets||[]];
  let active=true,frame=0,expired=false,scrolled:HTMLElement|null=null;
  const locate=()=>{
   frame=0;if(!active)return;
   const element=findGuideTarget(anchors);
   if(element&&element!==scrolled){scrolled=element;element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});}
   const bounds=element?.getBoundingClientRect();
   const rect=bounds?{top:bounds.top,left:bounds.left,width:bounds.width,height:bounds.height}:null;
   const state=element?'FOUND':expired?'MISSING':'WAITING';
   setTarget(current=>current.element===element&&current.state===state&&JSON.stringify(current.rect)===JSON.stringify(rect)?current:{state,element,rect});
  };
  const schedule=()=>{if(active&&!frame)frame=window.requestAnimationFrame(locate);};
  setTarget({state:'WAITING',element:null,rect:null});locate();
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-guide-anchor','class','style','hidden','inert','aria-hidden']});
  const timer=window.setTimeout(()=>{expired=true;schedule();},8000);
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
  window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  return()=>{active=false;observer.disconnect();window.clearTimeout(timer);if(frame)window.cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);};
 },[step,retry,enabled]);
 return target;
}
