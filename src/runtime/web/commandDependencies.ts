import type {RecordVersion} from '../../types/transactions';

// Shared catalogue/configuration reads do not serialize unrelated transactions.
const sharedReads=new Set(['products','paymentAccounts','outlets','businessSettings','tillPolicies']);
export function commandsShareAggregate(left:RecordVersion[],right:RecordVersion[]):boolean{
 const keys=new Set(left.filter(row=>!sharedReads.has(row.collection)).map(row=>`${row.collection}:${row.id}`));
 // Without an aggregate baseline we cannot safely establish independence.
 if(keys.size===0||!right.some(row=>!sharedReads.has(row.collection)))return true;
 return right.some(row=>!sharedReads.has(row.collection)&&keys.has(`${row.collection}:${row.id}`));
}
