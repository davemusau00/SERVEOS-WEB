import React from 'react';
import { Dialog } from '../design-system/controls';
export function ActionDialog({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
  return <Dialog title={title} onClose={onClose}>{children}</Dialog>;
}
