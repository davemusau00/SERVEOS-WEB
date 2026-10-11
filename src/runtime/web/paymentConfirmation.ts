import type {BusinessRecord} from './session';
import type {QueuedCommand} from './BusinessStore';

/** Confirmation requires this command's payment evidence and a matching order projection. */
export function paymentProjectionConfirmed(entry:QueuedCommand,records:BusinessRecord[]):boolean{
 if(entry.state!=='SYNCHRONIZED')return false;
 const orderId=entry.command.payload.orderId;
 const order=records.find(row=>row.collection==='orders'&&row.id===orderId);
 if(!order)return false;
 const payments=records.filter(row=>row.collection==='payments'&&row.data.orderId===orderId&&!row.archived);
 const own=payments.filter(row=>row.data.sourceCommandId===entry.id);
 const inputs=entry.command.operation==='payment.split'?entry.command.payload.payments:[entry.command.payload];
 if(!Array.isArray(inputs)||inputs.length===0||own.length!==inputs.length)return false;
 const expected=inputs.reduce((sum,input)=>sum+Number((input as Record<string,unknown>).amountMinor),0);
 const actual=own.reduce((sum,row)=>sum+Number(row.data.amountMinor),0);
 const projected=payments.reduce((sum,row)=>sum+Number(row.data.amountMinor),0);
 return Number.isSafeInteger(expected)&&expected>0&&expected===actual&&Number.isSafeInteger(projected)&&projected===Number(order.data.amountPaidMinor);
}
