import {ApiProblem} from './command-kernel.mjs';
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message);};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const field=(value,label,max,required=false,multiline=false)=>{
 if(value===undefined||value===null||value===''){if(required)fail(`${label} is required.`);return null;}
 if(typeof value!=='string'||value.trim().length>max||[...value].some(character=>{const n=character.codePointAt(0);return (n<32||n===127)&&!(multiline&&(character==='\n'||character==='\r'));}))fail(`${label} is invalid or exceeds ${max} characters.`);
 const normalized=value.trim().replace(/\r\n/g,'\n');if(normalized.includes('\r'))fail(`${label} contains unsupported line endings.`);
 if(!normalized){if(required)fail(`${label} is required.`);return null;}return normalized;
};
const columns=`id,code,name,contact_name AS "contactName",phone,email,address,tax_pin AS "taxPin",payment_terms_days AS "paymentTermsDays",notes,version,archived_at AS "archivedAt",created_by AS "createdBy",created_at AS "createdAt",updated_by AS "updatedBy",updated_at AS "updatedAt"`;
export const supplierProjection=({id,version,archivedAt,createdAt,updatedAt,...data})=>({collection:'suppliers',id,version:Number(version),archived:archivedAt!==null,data:{...data,createdAt:createdAt.toISOString(),updatedAt:updatedAt.toISOString()}});
export async function supplierProjections(db,businessId){const {rows}=await db.query(`SELECT ${columns} FROM procurement_suppliers WHERE business_id=$1 ORDER BY lower(name),id`,[businessId]);return rows.map(supplierProjection);}
const save=async({tx,command,actor,at})=>{
 const p=command.payload,d=p.data;if(!uuid(p.id)||!d||typeof d!=='object'||Array.isArray(d))fail('Supplier identity and details are required.');
 const allowed=['code','name','contactName','phone','email','address','taxPin','paymentTermsDays','notes'];
 if(Object.keys(p).some(key=>!['id','data','reason'].includes(key))||Object.keys(d).some(key=>!allowed.includes(key)))fail('Unsupported supplier fields. Archive requires its dedicated reviewed workflow.');
 field(p.reason,'Change reason',500,true);
 const baseline=command.expectedVersions[`suppliers:${p.id}`];if(!Number.isSafeInteger(baseline)||baseline<0)fail('Reviewed supplier version is required.');
 const code=field(d.code,'Supplier code',80,true),name=field(d.name,'Supplier name',160,true),contact=field(d.contactName,'Contact name',160),phone=field(d.phone,'Phone',80),email=field(d.email,'Email',254),address=field(d.address,'Address',2000,false,true),taxPin=field(d.taxPin,'Tax PIN',80),notes=field(d.notes,'Notes',2000,false,true);
 const terms=d.paymentTermsDays??0;if(!Number.isInteger(terms)||terms<0||terms>365)fail('Payment terms must be 0 to 365 days.');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid supplier email address.');
 // All future PO/payable transitions and supplier archive must share this business boundary.
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement:${actor.businessId}`]);
 const current=await tx.client.query('SELECT archived_at FROM procurement_suppliers WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.id]);
 if(current.rows[0]?.archived_at)throw new ApiProblem(409,'SUPPLIER_ARCHIVED','Restore this supplier through its reviewed workflow before editing.');
 const duplicate=await tx.client.query('SELECT 1 FROM procurement_suppliers WHERE business_id=$1 AND lower(code)=lower($2) AND id<>$3 AND archived_at IS NULL',[actor.businessId,code,p.id]);
 if(duplicate.rows.length)throw new ApiProblem(409,'DUPLICATE_REFERENCE','That supplier code is already assigned.');
 const version=await tx.bumpEntityVersion(actor.businessId,'suppliers',p.id,baseline);
 const {rows}=await tx.client.query(`INSERT INTO procurement_suppliers(business_id,id,code,name,contact_name,phone,email,address,tax_pin,payment_terms_days,notes,version,created_by,created_at,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$13,$14) ON CONFLICT(business_id,id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,email=EXCLUDED.email,address=EXCLUDED.address,tax_pin=EXCLUDED.tax_pin,payment_terms_days=EXCLUDED.payment_terms_days,notes=EXCLUDED.notes,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING ${columns}`,[actor.businessId,p.id,code,name,contact,phone,email,address,taxPin,terms,notes,version,actor.staffId,at]);
 const value=supplierProjection(rows[0]);return {value,records:[value]};
};
export const supplierCommandRegistry=new Map([['supplier.save',{permission:'procurement.manage',permissionAny:['procurement.manage','suppliers.manage'],offlinePolicy:'ONLINE_ONLY',handler:save}]]);
