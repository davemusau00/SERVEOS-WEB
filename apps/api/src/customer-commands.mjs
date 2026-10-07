import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const field=(value,label,max,{required=false}={})=>{
 if(typeof value!=='string'||value.trim().length>max||required&&!value.trim()||/[\u0000-\u001f\u007f]/u.test(value))fail(`${label} is invalid or too long.`);
 return value.trim();
};
const baseline=(command,id)=>{
 const version=command.expectedVersions[`customers:${id}`];
 if(!Number.isSafeInteger(version)||version<0)fail('Review the current customer version before saving.');
 return version;
};
const columns=`id,name,phone,email,notes,version,created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",updated_at AS "updatedAt",archived_at AS "archivedAt"`;
const projection=row=>({collection:'customers',id:row.id,version:Number(row.version),archived:row.archivedAt!==null,data:{name:row.name,phone:row.phone,email:row.email,notes:row.notes,createdBy:row.createdBy,updatedBy:row.updatedBy,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),archivedAt:row.archivedAt?.toISOString()??null}});

export async function customerProjections(db,businessId){
 const {rows}=await db.query(`SELECT ${columns} FROM business_customers WHERE business_id=$1 ORDER BY lower(name),id`,[businessId]);
 return rows.map(projection);
}

const save=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('customers.manage'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer management permission is required.');
 const p=command.payload,d=p.data;
 if(!uuid(p.id)||!d||typeof d!=='object'||Array.isArray(d))fail('Customer details are malformed.');
 const reason=field(p.reason,'Change reason',500,{required:true});if(reason.length<3)fail('Enter a change reason of at least 3 characters.');
 const name=field(d.name,'Customer name',160,{required:true}),phone=field(d.phone??'','Phone',40),email=field(d.email??'','Email',254),notes=field(d.notes??'','Notes',1000);
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid customer email address.');
 const expected=baseline(command,p.id);
 const version=await tx.bumpEntityVersion(actor.businessId,'customers',p.id,expected);
 const {rows:existing}=await tx.client.query(`SELECT archived_at AS "archivedAt",created_by AS "createdBy",created_at AS "createdAt" FROM business_customers WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.id]);
 if(expected===0&&existing.length)throw new ApiProblem(409,'VERSION_CONFLICT','This customer already exists. Refresh the customer list.');
 if(expected>0&&!existing.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','This customer is no longer available. Refresh the customer list.');
 if(existing[0]?.archivedAt)throw new ApiProblem(409,'CUSTOMER_ARCHIVED','Archived customers cannot be edited.');
 if(expected===0){
  await tx.client.query(`INSERT INTO business_customers(business_id,id,name,phone,email,notes,version,created_by,updated_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$9)`,[actor.businessId,p.id,name,phone,email,notes,version,actor.staffId,at]);
 }else{
  await tx.client.query(`UPDATE business_customers SET name=$3,phone=$4,email=$5,notes=$6,version=$7,updated_by=$8,updated_at=$9 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.id,name,phone,email,notes,version,actor.staffId,at]);
 }
 const {rows}=await tx.client.query(`SELECT ${columns} FROM business_customers WHERE business_id=$1 AND id=$2`,[actor.businessId,p.id]);
 const value=projection(rows[0]);
 await tx.client.query(`INSERT INTO business_customer_events(business_id,id,customer_id,version,event_type,reason,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,'SAVED',$5,$6,$7,$8,$9)`,[actor.businessId,randomUUID(),p.id,version,reason,command.commandId,actor.staffId,actor.deviceId,at]);
 return {value,records:[value]};
};

export const customerCommandRegistry=new Map([['customer.save',{permission:'customers.manage',offlinePolicy:'ONLINE_ONLY',handler:save}]]);
