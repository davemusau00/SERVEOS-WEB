import type {BusinessRecord} from './session';

export type PrepStation='BAR'|'KITCHEN'|'ROOMS';
export type PrepState='FIRED'|'PREPARING'|'READY';
export const prepStates:PrepState[]=['FIRED','PREPARING','READY'];
export const prepStations:PrepStation[]=['BAR','KITCHEN','ROOMS'];
export const prepLabel:Record<PrepState,string>={FIRED:'New',PREPARING:'Preparing',READY:'Ready'};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const uuid=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export const humanText=(value:unknown)=>typeof value==='string'&&!uuid.test(value)?value.trim():'';
export interface PrepLine {
 order:BusinessRecord; id:string; name:string; quantity:number; station:PrepStation; status:PrepState;
 reference:string; location:string; note:string; choices:string[]; course:string; waiter:string;
 firedAt:number|null; updatedAt:number|null; problems:string[];
}
export interface PrepIssue {key:string;order:BusinessRecord;reference:string;message:string}
export function kdsBoard(records:BusinessRecord[]):{lines:PrepLine[];issues:PrepIssue[]}{
 const lines:PrepLine[]=[],issues:PrepIssue[]=[];
 const documents=records.filter(r=>r.collection==='businessDocuments'&&!r.archived&&['KOT','BOT'].includes(String(r.data.type)));
 for(const order of records.filter(r=>r.collection==='orders'&&!r.archived&&r.data.state!=='VOIDED')){
  const d=order.data,items=Array.isArray(d.items)?d.items:[];
  const baseReference=humanText(d.orderNumber)||humanText(d.name)||humanText(d.tabName)||'Order reference unavailable';
  if(!Array.isArray(d.items)){issues.push({key:order.id,order,reference:baseReference,message:'Item snapshot is missing. Refresh this order before preparing it.'});continue;}
  for(const raw of items){
   const item=object(raw),snapshot=object(item.productSnapshot);
   if(item.state==='VOIDED'||item.state==='DRAFT'||item.preparationStatus==='SERVED'||item.courseStatus==='SERVED')continue;
   if(item.state!=='FIRED'&&item.stockFired!==true)continue;
   const id=typeof item.id==='string'?item.id:'',route=String(snapshot.routeTo||item.routeTo||'').toUpperCase();
   const state=String(item.preparationStatus||item.courseStatus||'').toUpperCase();
   if(!id||!prepStations.includes(route as PrepStation)||!prepStates.includes(state as PrepState)){
    issues.push({key:`${order.id}:${id||issues.length}`,order,reference:baseReference,message:'Preparation item has incomplete routing or state. Refresh and ask a supervisor to review it.'});continue;
   }
   const station=route as PrepStation;
   const document=documents.find(doc=>{
    const s=object(doc.data.snapshot);
    return s.orderId===order.id&&doc.data.type===(station==='BAR'?'BOT':'KOT')&&Array.isArray(s.items)&&s.items.some(line=>object(line).id===id);
   });
   const reference=humanText(document?.data.documentNumber)||baseReference;
   const problems:string[]=[],name=humanText(snapshot.name)||humanText(item.name)||humanText(item.productName);
   if(!name)problems.push('Product name is missing from the issued snapshot. Ask a supervisor to identify the item.');
   const quantity=Number(item.quantity);if(!Number.isFinite(quantity)||quantity<=0)problems.push('Preparation quantity is missing or invalid.');
   const firedAt=typeof item.firedAt==='string'?Date.parse(item.firedAt):NaN;
   if(!Number.isFinite(firedAt))problems.push('Preparation start time is unavailable.');
   const portion=humanText(object(item.portionSnapshot).name);
   const modifiers=Array.isArray(item.modifierSnapshots)?item.modifierSnapshots.map(m=>humanText(object(m).name)).filter(Boolean):[];
   const waiterId=typeof d.createdByStaffId==='string'?d.createdByStaffId:typeof d.staffId==='string'?d.staffId:'';
   const staff=records.find(r=>r.collection==='staff'&&r.id===waiterId);
   lines.push({order,id,name:name||'Name unavailable',quantity,station,status:state as PrepState,reference,
    location:humanText(d.serviceReference)||humanText(d.tableName)||humanText(d.tabName)||(d.serviceDestination==='TAKEAWAY'?'Takeaway':humanText(d.name)||'Counter'),
    note:humanText(item.notes)||humanText(item.note),choices:[portion,...modifiers].filter(Boolean),course:humanText(item.courseName),
    waiter:humanText(d.waiterName)||humanText(staff?.data.displayName)||humanText(staff?.data.name),
    firedAt:Number.isFinite(firedAt)?firedAt:null,updatedAt:typeof item.preparationUpdatedAt==='string'&&Number.isFinite(Date.parse(item.preparationUpdatedAt))?Date.parse(item.preparationUpdatedAt):null,problems});
  }
 }
 lines.sort((a,b)=>(a.firedAt??Infinity)-(b.firedAt??Infinity)||a.reference.localeCompare(b.reference));
 return {lines,issues};
}
