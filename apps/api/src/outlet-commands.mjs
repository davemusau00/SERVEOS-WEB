import {ApiProblem} from './command-kernel.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const save=async({tx,command,actor,at})=>{
 const p=command.payload,d=p.data;
 if(!uuid(p.id)||!d||typeof d!=='object'||Array.isArray(d)||!uuid(d.defaultStockLocationId)||typeof d.archived!=='boolean')fail('Choose an outlet, storage place and explicit outlet status.');
 if(typeof d.name!=='string'||!d.name.trim()||d.name.trim().length>120)fail('Outlet name must contain 1 to 120 characters.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>500)fail('Explain the outlet configuration change.');
 const baseline=command.expectedVersions[`outlets:${p.id}`],locationVersion=command.expectedVersions[`stockLocations:${d.defaultStockLocationId}`];
 if(!Number.isSafeInteger(baseline)||baseline<0||!Number.isSafeInteger(locationVersion)||locationVersion<1)fail('Reviewed outlet and storage-place versions are required.');
 // Order opening and till-policy changes use this same business boundary.
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`till-policy:${actor.businessId}`]);
 const current=await tx.client.query('SELECT default_stock_location_id AS "locationId",version FROM business_outlets WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.id]);
 const location=await tx.client.query('SELECT version FROM stock_locations WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE',[actor.businessId,d.defaultStockLocationId]);
 if(!location.rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','Choose an active storage place.');
 if(Number(location.rows[0].version)!==locationVersion)throw new ApiProblem(409,'VERSION_CONFLICT','The storage place changed. Review it again.');
 if(current.rows.length&&(d.archived||current.rows[0].locationId!==d.defaultStockLocationId)){
  const orders=await tx.client.query(`SELECT 1 FROM pos_orders WHERE business_id=$1 AND outlet_id=$2 AND state NOT IN ('COMPLETED','VOIDED','MERGED') LIMIT 1`,[actor.businessId,p.id]);
  const tills=await tx.client.query(`SELECT 1 FROM till_sessions WHERE business_id=$1 AND outlet_id=$2 AND status<>'CLOSED' LIMIT 1`,[actor.businessId,p.id]);
  if(orders.rows.length||tills.rows.length)throw new ApiProblem(409,'OUTLET_IN_USE','Resolve this outlet’s open orders and tills before changing its storage place or archiving it.');
 }
 const version=await tx.bumpEntityVersion(actor.businessId,'outlets',p.id,baseline);
 await tx.client.query(`INSERT INTO business_outlets(business_id,id,name,default_stock_location_id,version,archived_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(business_id,id) DO UPDATE SET name=EXCLUDED.name,default_stock_location_id=EXCLUDED.default_stock_location_id,version=EXCLUDED.version,archived_at=EXCLUDED.archived_at`,[actor.businessId,p.id,d.name.trim(),d.defaultStockLocationId,version,d.archived?at:null]);
 const value={collection:'outlets',id:p.id,version,archived:d.archived,data:{name:d.name.trim(),defaultStockLocationId:d.defaultStockLocationId}};return {value,records:[value]};
};
export const outletCommandRegistry=new Map([['outlet.save',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:save}]]);
