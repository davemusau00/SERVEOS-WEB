import {useEffect,useRef,type RefObject} from 'react';

export function useModalFocus(dialog:RefObject<HTMLElement|null>,open:boolean,onEscape:()=>void,returnFocus:RefObject<HTMLElement|null>){
 const escape=useRef(onEscape);escape.current=onEscape;
 useEffect(()=>{
  const element=dialog.current;if(!open||!element)return;
  const controls=()=>Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(control=>control.getClientRects().length);
  if(!element.contains(document.activeElement))controls()[0]?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();escape.current();return;}
   if(event.key!=='Tab')return;
   const available=controls(),first=available[0],last=available.at(-1);
   if(!first){event.preventDefault();return;}
   if(event.shiftKey&&(document.activeElement===first||!element.contains(document.activeElement))){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!element.contains(document.activeElement))){event.preventDefault();first.focus();}
  };
  element.addEventListener('keydown',keydown);
  return()=>{element.removeEventListener('keydown',keydown);if(returnFocus.current?.isConnected)returnFocus.current.focus();};
 },[dialog,open,returnFocus]);
}
