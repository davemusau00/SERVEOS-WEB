import {printColumns,printProjection} from './print-commands.mjs';
import {createHash} from 'node:crypto';

const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
export const documentHash=snapshot=>createHash('sha256').update(canonical(snapshot)).digest('hex');

export async function documentProjections(db,businessId){
 const {rows}=await db.query(`SELECT id,document_type AS type,document_number AS "documentNumber",layout_version AS "layoutVersion",snapshot_hash AS hash,snapshot,issued_at AS "issuedAt" FROM business_documents WHERE business_id=$1 ORDER BY issued_at DESC,id LIMIT 1000`,[businessId]);
 const documents=rows.map(row=>({collection:'businessDocuments',id:row.id,version:1,archived:false,data:{...row,issuedAt:row.issuedAt.toISOString()}}));
 const jobs=await db.query(`SELECT ${printColumns} FROM document_print_jobs WHERE business_id=$1 ORDER BY requested_at DESC,id LIMIT 1000`,[businessId]);
 return [...documents,...jobs.rows.map(printProjection)];
}
