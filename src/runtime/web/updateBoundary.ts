import type {BusinessStore} from './BusinessStore';
export async function safeCashUpdateBoundary(store:BusinessStore|undefined,busy:()=>boolean):Promise<boolean>{
 if(!store||busy())return false;
 try{const [pending,printing]=await Promise.all([store.hasPending(),store.hasUnresolvedPrintDelivery()]);return !pending&&!printing&&!busy();}catch{return false;}
}
