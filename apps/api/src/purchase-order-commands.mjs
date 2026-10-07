import {randomUUID} from 'node:crypto';
import {documentHash} from './business-documents.mjs';
import {receiptSettings} from './business-tax.mjs';
import {queueDocumentPrint} from './print-commands.mjs';
import {ApiProblem} from './command-kernel.mjs';
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message);};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const baseline=(command,type,id)=>{const value=command.expectedVersions[`${type}:${id}`];if(!Number.isSafeInteger(value)||value<0)fail(`Reviewed ${type} version is required.`);return value;};
const quantity=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1_000_000_000||Math.abs(value*1e6-Math.round(value*1e6))>0.0001)fail('Ordered quantities require positive six-decimal values within supported limits.');return BigInt(value.toFixed(6).replace('.',''));};
const safe=value=>{if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))fail('Purchase order amounts exceed supported limits.');return Number(value);};
const decimal=value=>`${value/1000000n}.${(value%1000000n).toString().padStart(6,'0')}`;
const note=value=>{if(value===undefined||value===null||value==='')return null;if(typeof value!=='string'||value.length>2000||/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value))fail('PO notes must be bounded text without control codes.');return value.trim()||null;};
export async function purchaseOrderProjections(db,businessId){
 const orders=await db.query(`SELECT id,supplier_id AS "supplierId",document_number AS "documentNumber",supplier_snapshot AS "supplierSnapshot",status,approved_by AS "approvedBy",approved_at AS "approvedAt",issued_by AS "issuedBy",issued_at AS "issuedAt",document_id AS "documentId",currency,subtotal_minor AS "subtotalMinor",to_char(expected_delivery_date,'YYYY-MM-DD') AS "expectedDeliveryDate",notes,version,created_by AS "createdBy",created_at AS "createdAt",updated_by AS "updatedBy",updated_at AS "updatedAt" FROM procurement_purchase_orders WHERE business_id=$1 ORDER BY updated_at DESC,id`,[businessId]);
 const lines=await db.query(`SELECT po_id AS "poId",id,line_no AS "lineNo",stock_item_id AS "stockItemId",stock_snapshot AS "stockSnapshot",purchase_package_snapshot AS "purchasePackageSnapshot",quantity_ordered AS "quantityOrdered",base_quantity_ordered AS "baseQuantityOrdered",unit_price_minor AS "unitPriceMinor",line_total_minor AS "lineTotalMinor" FROM procurement_purchase_order_lines WHERE business_id=$1 ORDER BY po_id,line_no`,[businessId]);
 const byPo=new Map();for(const row of lines.rows){const {poId,...line}=row;for(const key of ['quantityOrdered','baseQuantityOrdered','unitPriceMinor','lineTotalMinor'])line[key]=Number(line[key]);const list=byPo.get(poId)||[];list.push(line);byPo.set(poId,list);}
 return orders.rows.map(({id,version,createdAt,updatedAt,...data})=>({collection:'purchaseOrders',id,version:Number(version),archived:false,data:{...data,subtotalMinor:Number(data.subtotalMinor),createdAt:createdAt.toISOString(),updatedAt:updatedAt.toISOString(),approvedAt:data.approvedAt?.toISOString()??null,issuedAt:data.issuedAt?.toISOString()??null,items:byPo.get(id)||[]}}));
}
const saveDraft=async({tx,command,actor,at})=>{
 const p=command.payload;if(!uuid(p.id)||!uuid(p.supplierId)||!Array.isArray(p.items)||p.items.length<1||p.items.length>100)fail('Choose a supplier and 1 to 100 purchase lines.');
 if(p.items.some(line=>!line||typeof line!=='object'||Array.isArray(line)||line.treatment&&line.treatment!=='STOCK'))fail('Expense and asset purchase lines require their dedicated accounting workflow; no draft was changed.');
 const expected=baseline(command,'purchaseOrders',p.id),supplierVersion=baseline(command,'suppliers',p.supplierId);
 const notes=note(p.notes);note(p.reason);if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.length>500)fail('Explain the purchase order change.');
 const delivery=p.expectedDeliveryDate||null;if(delivery&&(typeof delivery!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(delivery)||!Number.isFinite(Date.parse(delivery))||new Date(delivery).toISOString().slice(0,10)!==delivery))fail('Expected delivery date must be a valid calendar date.');
 await tx.lockInventoryCatalog(actor.businessId);
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement:${actor.businessId}`]);
 const existing=await tx.client.query('SELECT status,document_number FROM procurement_purchase_orders WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.id]);
 if(existing.rows[0]&&existing.rows[0].status!=='DRAFT')throw new ApiProblem(409,'PO_NOT_DRAFT','Only a draft purchase order can be edited.');
 const supplier=await tx.client.query('SELECT id,code,name,contact_name AS "contactName",phone,email,address,tax_pin AS "taxPin",payment_terms_days AS "paymentTermsDays",version FROM procurement_suppliers WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE',[actor.businessId,p.supplierId]);
 if(!supplier.rows.length)throw new ApiProblem(409,'SUPPLIER_UNAVAILABLE','Choose an active supplier.');
 if(Number(supplier.rows[0].version)!==supplierVersion)throw new ApiProblem(409,'VERSION_CONFLICT','Supplier changed; review the latest details.');
 const items=[];const stockIds=new Set(),lineIds=new Set();let subtotal=0n;
 for(const [index,line] of p.items.entries()){
  if(!line||typeof line!=='object'||!uuid(line.id)||!uuid(line.stockItemId)||lineIds.has(line.id)||stockIds.has(line.stockItemId))fail('Purchase line and stock identities must be unique valid IDs.');
  lineIds.add(line.id);stockIds.add(line.stockItemId);const ordered=quantity(line.quantityOrdered);
  if(!Number.isSafeInteger(line.unitPriceMinor)||line.unitPriceMinor<0)fail('Purchase unit price must be non-negative minor currency units.');
  const stock=await tx.client.query('SELECT id,name,code,base_unit AS "baseUnit",sealed_container_size AS "sealedContainerSize",version FROM stock_items WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE',[actor.businessId,line.stockItemId]);
  if(!stock.rows.length)throw new ApiProblem(409,'STOCK_ITEM_UNAVAILABLE','Choose active stock items.');
  if(Number(stock.rows[0].version)!==baseline(command,'stockItems',line.stockItemId))throw new ApiProblem(409,'VERSION_CONFLICT','A stock item changed; review purchase quantities/packages again.');
  let pack=null,perUnit=1000000n;
  if(line.purchasePackageId){if(!uuid(line.purchasePackageId))fail('Invalid purchase package identity.');const found=await tx.client.query('SELECT id,name,base_quantity AS "baseQuantity",unit_cost_minor AS "unitCostMinor",barcode FROM stock_purchase_packages WHERE business_id=$1 AND stock_item_id=$2 AND id=$3',[actor.businessId,line.stockItemId,line.purchasePackageId]);if(!found.rows.length)throw new ApiProblem(409,'PACKAGE_UNAVAILABLE','Selected purchase package no longer belongs to this stock item.');pack=found.rows[0];perUnit=quantity(Number(pack.baseQuantity));if(ordered%1000000n!==0n)fail('Purchase packages require a whole package count.');pack={...pack,baseQuantity:Number(pack.baseQuantity),unitCostMinor:Number(pack.unitCostMinor)};}
  const base=ordered*perUnit;if(base%1000000n!==0n||base/1000000n>1000000000000000n)fail('Base quantity exceeds stock precision/range.');
  const total=(ordered*BigInt(line.unitPriceMinor)+500000n)/1000000n;subtotal+=total;safe(subtotal);
  items.push({id:line.id,lineNo:index+1,stockItemId:line.stockItemId,stockSnapshot:{...stock.rows[0],version:Number(stock.rows[0].version),sealedContainerSize:stock.rows[0].sealedContainerSize===null?null:Number(stock.rows[0].sealedContainerSize)},purchasePackageSnapshot:pack,quantityOrdered:decimal(ordered),baseQuantityOrdered:decimal(base/1000000n),unitPriceMinor:line.unitPriceMinor,lineTotalMinor:safe(total)});
 }
 const version=await tx.bumpEntityVersion(actor.businessId,'purchaseOrders',p.id,expected);const number=existing.rows[0]?.document_number||`PO-${p.id}`;
 const supplierSnapshot={...supplier.rows[0],version:Number(supplier.rows[0].version)};
 await tx.client.query(`INSERT INTO procurement_purchase_orders(business_id,id,supplier_id,document_number,supplier_snapshot,subtotal_minor,expected_delivery_date,notes,version,created_by,created_at,updated_by,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$10,$11) ON CONFLICT(business_id,id) DO UPDATE SET supplier_id=EXCLUDED.supplier_id,supplier_snapshot=EXCLUDED.supplier_snapshot,subtotal_minor=EXCLUDED.subtotal_minor,expected_delivery_date=EXCLUDED.expected_delivery_date,notes=EXCLUDED.notes,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,p.id,p.supplierId,number,JSON.stringify(supplierSnapshot),safe(subtotal),delivery,notes,version,actor.staffId,at]);
 await tx.client.query('DELETE FROM procurement_purchase_order_lines WHERE business_id=$1 AND po_id=$2',[actor.businessId,p.id]);
 for(const line of items)await tx.client.query(`INSERT INTO procurement_purchase_order_lines(business_id,po_id,id,line_no,stock_item_id,stock_snapshot,purchase_package_snapshot,quantity_ordered,base_quantity_ordered,unit_price_minor,line_total_minor) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,[actor.businessId,p.id,line.id,line.lineNo,line.stockItemId,JSON.stringify(line.stockSnapshot),JSON.stringify(line.purchasePackageSnapshot),line.quantityOrdered,line.baseQuantityOrdered,line.unitPriceMinor,line.lineTotalMinor]);
 const value=(await purchaseOrderProjections(tx.client,actor.businessId)).find(row=>row.id===p.id);return {value,records:[value]};
};
const transition=action=>async({tx,command,actor,at})=>{
 const p=command.payload;if(!uuid(p.id)||typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.length>500)fail('Purchase order and review reason are required.');
 const reason=note(p.reason),expected=baseline(command,'purchaseOrders',p.id);
 await tx.lockInventoryCatalog(actor.businessId);
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement:${actor.businessId}`]);
 const {rows}=await tx.client.query('SELECT status FROM procurement_purchase_orders WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.id]);
 if(!rows.length||rows[0].status!==(action==='approve'?'DRAFT':'APPROVED'))throw new ApiProblem(409,'PO_STATE_CONFLICT','Review the current purchase order status before this transition.');
 const po=(await purchaseOrderProjections(tx.client,actor.businessId)).find(row=>row.id===p.id);
 if(action==='approve'){
  const supplier=await tx.client.query('SELECT version FROM procurement_suppliers WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE',[actor.businessId,po.data.supplierId]);
  if(!supplier.rows.length||Number(supplier.rows[0].version)!==Number(po.data.supplierSnapshot.version))throw new ApiProblem(409,'SUPPLIER_CHANGED','Reopen and save the draft using current supplier details before approval.');
  for(const item of po.data.items){const current=await tx.client.query('SELECT version FROM stock_items WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE',[actor.businessId,item.stockItemId]);if(!current.rows.length||Number(current.rows[0].version)!==item.stockSnapshot.version)throw new ApiProblem(409,'STOCK_ITEM_CHANGED','Reopen and save the draft using current stock/package details before approval.');}
 }
 const version=await tx.bumpEntityVersion(actor.businessId,'purchaseOrders',p.id,expected);const records=[];
 if(action==='approve')await tx.client.query("UPDATE procurement_purchase_orders SET status='APPROVED',approved_by=$3,approved_at=$4,version=$5,updated_by=$3,updated_at=$4 WHERE business_id=$1 AND id=$2",[actor.businessId,p.id,actor.staffId,at,version]);
 else{
  const documentId=randomUUID(),business=await receiptSettings(tx.client,actor.businessId);
  if(!business?.businessName)throw new ApiProblem(409,'BUSINESS_IDENTITY_REQUIRED','Configure the business identity before issuing purchase documents.');
  const snapshot={schemaVersion:1,business,supplier:po.data.supplierSnapshot,purchaseOrderId:p.id,documentNumber:po.data.documentNumber,currency:po.data.currency,items:po.data.items,subtotalMinor:po.data.subtotalMinor,expectedDeliveryDate:po.data.expectedDeliveryDate,notes:po.data.notes,approvedBy:po.data.approvedBy,approvedAt:po.data.approvedAt,issuedBy:actor.staffId,issuedAt:at.toISOString()};
  const hash=documentHash(snapshot);
  await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'PURCHASE_ORDER',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,documentId,po.data.documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
  await tx.client.query("UPDATE procurement_purchase_orders SET status='ISSUED',issued_by=$3,issued_at=$4,document_id=$5,version=$6,updated_by=$3,updated_at=$4 WHERE business_id=$1 AND id=$2",[actor.businessId,p.id,actor.staffId,at,documentId,version]);
  records.push({collection:'businessDocuments',id:documentId,version:1,archived:false,data:{id:documentId,type:'PURCHASE_ORDER',documentNumber:po.data.documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},await queueDocumentPrint(tx,{businessId:actor.businessId,documentId,printerRole:'OFFICE',staffId:actor.staffId,at}));
 }
 await tx.client.query('INSERT INTO procurement_purchase_order_events(business_id,po_id,id,po_version,event_type,reason,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[actor.businessId,p.id,randomUUID(),version,command.name,reason,command.commandId,actor.staffId,actor.deviceId,at]);
 const value=(await purchaseOrderProjections(tx.client,actor.businessId)).find(row=>row.id===p.id);return {value,records:[value,...records]};
};
export const purchaseOrderCommandRegistry=new Map([['procurement.saveDraft',{permission:'procurement.manage',offlinePolicy:'ONLINE_ONLY',handler:saveDraft}],...['approve','issue'].map(action=>[`procurement.${action}`,{permission:'procurement.manage',offlinePolicy:'ONLINE_ONLY',handler:transition(action)}])]);
