import React from 'react';
import { Dialog } from '../design-system/controls';
export function ActionDialog({title,children,onClose,footer,busy=false}:{title:string;children:React.ReactNode;onClose:()=>void;footer?:React.ReactNode;busy?:boolean}){
  const dismiss=()=>{if(!busy)onClose()};
  return <Dialog title={title} onClose={dismiss} footer={footer}>{children}</Dialog>;
}
