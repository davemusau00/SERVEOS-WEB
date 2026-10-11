import {canonicalCashJson} from './offlineCashLedger';
import type {LocalBusinessDocument} from './BusinessStore';
export async function localCashDocuments(sale:Record<string,unknown>):Promise<LocalBusinessDocument[]>{
 const input=sale.input as Record<string,unknown>,lines=sale.lines as Record<string,unknown>[],issuedAt=String(sale.occurredAt),business=input.businessSnapshot||{},documents:LocalBusinessDocument[]=[];
 const create=async(type:string,snapshot:Record<string,unknown>)=>{const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalCashJson(snapshot)))),value=>value.toString(16).padStart(2,'0')).join('');documents.push({id:`${sale.id}:${type}`,type,documentNumber:`${sale.reference}${type==='SALES_RECEIPT'?'':'-'+type}`,layoutVersion:1,issuedAt,hash,snapshot});};
 const common={business,provisional:true,localSaleId:sale.id,orderName:sale.reference,staffId:sale.staffId,deviceId:sale.deviceId,issuedAt};
 await create('SALES_RECEIPT',{...common,items:lines,totalMinor:sale.totalMinor,balanceMinor:0,taxes:{netMinor:lines.reduce((sum,line)=>sum+Number(line.netMinor),0),vatMinor:lines.reduce((sum,line)=>sum+Number(line.vatMinor),0),levyMinor:lines.reduce((sum,line)=>sum+Number(line.levyMinor),0)},payments:[{method:'CASH',amountMinor:sale.totalMinor,cashTenderedMinor:input.cashTenderedMinor,changeMinor:sale.changeMinor,origin:'LOCAL_PHYSICAL_CASH'}]});
 for(const [route,type] of [['KITCHEN','KOT'],['BAR','BOT']]){const items=lines.filter(line=>line.routeTo===route);if(items.length)await create(type,{...common,items,serviceDestination:input.serviceDestination||'COUNTER'});}
 return documents;
}
