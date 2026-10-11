import {calculateLine} from '../../../contracts/pos-math.mjs';
export type LocalCashState='RECORDED_LOCALLY'|'QUEUED'|'SYNCING'|'SERVER_CONFIRMED'|'OUTCOME_UNKNOWN'|'RECONCILIATION_REQUIRED';
export interface OfflineCashLease {
 leaseId:string;version:2;businessId:string;deviceId:string;staffId:string;outletId:string;tillSessionId:string;
 issuedAt:string;expiresAt:string;deviceLabel:string;permissions:string[];keyVersion:string;signature:string;
}
export interface LocalCashLine {id:string;productId:string;name:string;quantity:number;unitPriceMinor:number;discountBasisPoints:number;comped:boolean;taxSnapshot:{vatRateBasisPoints:number;levyRateBasisPoints:number};[key:string]:unknown}
export interface LocalCashInput {id:string;outletId:string;tillSessionId:string;cashAccountId:string;cashTenderedMinor:number;lines:LocalCashLine[];stockMovements:Array<{id:string;stockItemId:string;locationId:string;quantityFixed:string;unit:string}>;[key:string]:unknown}
export const canonicalCashJson=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(canonicalCashJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonicalCashJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
export async function verifyCashLease(lease:OfflineCashLease,publicKey:JsonWebKey,identity:{businessId:string;deviceId:string;staffId:string},now=Date.now()):Promise<boolean>{
 if(lease.version!==2||lease.businessId!==identity.businessId||lease.deviceId!==identity.deviceId||lease.staffId!==identity.staffId||!Number.isFinite(Date.parse(lease.issuedAt))||!Number.isFinite(Date.parse(lease.expiresAt))||Date.parse(lease.issuedAt)>now||Date.parse(lease.expiresAt)<=now||Date.parse(lease.expiresAt)-Date.parse(lease.issuedAt)>12*60*60*1000||!lease.permissions?.includes('pos.offlineSale.commitV2')||!/^POS[0-9A-Z]{1,12}$/.test(lease.deviceLabel)||publicKey.d)return false;
 try{
  const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const {signature,...signed}=lease,bytes=Uint8Array.from(atob(signature.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes,new TextEncoder().encode(canonicalCashJson(signed)));
 }catch{return false;}
}
export function priceLocalCash(input:LocalCashInput){
 const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
 if(![input.id,input.outletId,input.tillSessionId,input.cashAccountId].every(uuid)||input.lines.some(line=>!uuid(line.id)||!uuid(line.productId)))throw Error('Stable sale, account and product UUIDs are required.');
 if(!input.lines.length||input.lines.length>100||new Set(input.lines.map(line=>line.id)).size!==input.lines.length)throw Error('Sale requires 1 to 100 distinct lines.');
 const lines=input.lines.map(line=>({...line,...calculateLine(line.quantity,line.unitPriceMinor,line.discountBasisPoints,line.comped,line.taxSnapshot)}));
 const totalMinor=lines.reduce((sum,line)=>sum+line.lineTotalMinor,0);
 if(!Number.isSafeInteger(totalMinor)||totalMinor<=0||!Number.isSafeInteger(input.cashTenderedMinor)||input.cashTenderedMinor<totalMinor)throw Error('Cash tendered must cover the exact sale total.');
 for(const movement of input.stockMovements)if(!/^-?\d+$/.test(movement.quantityFixed)||BigInt(movement.quantityFixed)>0n||!movement.unit)throw Error('Provisional stock movements require negative fixed-point quantities and explicit units.');
 return {lines,totalMinor,changeMinor:input.cashTenderedMinor-totalMinor};
}
