import {ApiProblem} from './command-kernel.mjs';
const columns=`id,name,code,method,currency,reference_required AS "referenceRequired",mpesa_mode AS "mpesaMode",mpesa_number AS "mpesaNumber",mpesa_account_reference AS "mpesaAccountReference",version,archived_at AS "archivedAt",updated_by AS "updatedBy",updated_at AS "updatedAt"`;
const projection=row=>{const {version,archivedAt,...data}=row;return {collection:'paymentAccounts',id:row.id,version:Number(version),archived:archivedAt!==null,data:{...data,updatedAt:row.updatedAt.toISOString()}};};
const invalid=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)invalid(`${label} must contain 1 to ${max} characters.`);return value.trim();};
export async function paymentAccountProjections(db,businessId){const {rows}=await db.query(`SELECT ${columns} FROM payment_accounts WHERE business_id=$1 ORDER BY name,id`,[businessId]);return rows.map(projection);}

const save=async({tx,command,actor,at})=>{
 const p=command.payload,d=p.data;
 if(typeof p.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id)||!d||typeof d!=='object'||Array.isArray(d))invalid('Payment account data is malformed.');
 const baseline=command.expectedVersions[`paymentAccounts:${p.id}`];if(!Number.isSafeInteger(baseline)||baseline<0)invalid('Reviewed payment account version is required.');
 text(p.reason,'Configuration reason',500);
 const name=text(d.name,'Account name',120),code=text(d.code,'Account code',40).toUpperCase();
 if(!['CASH','MPESA','CARD','BANK'].includes(d.method))invalid('Choose a supported tender method.');
 if(d.currency!==undefined&&d.currency!=='KES')invalid('Payment account currency must be KES.');
 if(typeof d.referenceRequired!=='boolean'||typeof d.archived!=='boolean')invalid('Reference policy and account status must be explicit.');
 if(d.method==='CASH'&&d.referenceRequired)invalid('Cash accounts cannot require external references.');
 let mode=null,number=null,accountReference=null;
 if(d.method==='MPESA'){
  if(!['TILL','PAYBILL'].includes(d.mpesaMode))invalid('Choose M-Pesa till or paybill.');
  mode=d.mpesaMode;number=text(d.mpesaNumber,'M-Pesa number',10);if(!/^\d{5,10}$/.test(number))invalid('Enter a valid M-Pesa till/paybill number.');
  if(mode==='PAYBILL')accountReference=text(d.mpesaAccountReference,'Paybill account reference',100);
 }else if(d.mpesaMode||d.mpesaNumber||d.mpesaAccountReference)invalid('M-Pesa configuration belongs only to an M-Pesa account.');
 const existing=await tx.client.query('SELECT method,version FROM payment_accounts WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.id]);
 if(existing.rows.length&&existing.rows[0].method!==d.method)throw new ApiProblem(409,'TENDER_METHOD_IMMUTABLE','Create a separate payment account for a different tender method.');
 const version=await tx.bumpEntityVersion(actor.businessId,'paymentAccounts',p.id,baseline);
 const {rows}=await tx.client.query(`INSERT INTO payment_accounts(business_id,id,name,code,method,currency,reference_required,mpesa_mode,mpesa_number,mpesa_account_reference,version,archived_at,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,'KES',$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(business_id,id) DO UPDATE SET name=EXCLUDED.name,code=EXCLUDED.code,reference_required=EXCLUDED.reference_required,mpesa_mode=EXCLUDED.mpesa_mode,mpesa_number=EXCLUDED.mpesa_number,mpesa_account_reference=EXCLUDED.mpesa_account_reference,version=EXCLUDED.version,archived_at=EXCLUDED.archived_at,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING ${columns}`,[actor.businessId,p.id,name,code,d.method,d.referenceRequired,mode,number,accountReference,version,d.archived?at:null,actor.staffId,at]);
 const value=projection(rows[0]);return {value,records:[value]};
};
export const paymentAccountCommandRegistry=new Map([['paymentAccount.save',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:save}]]);
