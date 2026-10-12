import {createHash,randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';

// Evidence preparation uses the current journal architecture. No WIP, revenue,
// expense-recognition or historic backfill policy is silently approved here.
const kinds=['POS_CONSUMPTION','POS_BILL','PHYSICAL_RETURN','VOID_LOSS','WASTE','WASTE_REVERSAL'];
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const has=(actor,...permissions)=>actor.permissions?.includes('*')||permissions.some(permission=>actor.permissions?.includes(permission));
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const conflict=(code,message)=>{throw new ApiProblem(409,code,message)};
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
const hash=value=>createHash('sha256').update(stable(value)).digest('hex');
const iso=value=>value?.toISOString?.()??value??null;
const amount=value=>{if(value===null||value===undefined)return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null};
const text=(value,name,max=500,multiline=false)=>{if(typeof value!=='string'||value.trim().length<3||value.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u:/[\u0000-\u001f\u007f]/u).test(value))fail(`${name} must contain 3 to ${max} characters.`);return value.trim()};
const human=(value,fallback)=>typeof value==='string'&&value.trim()&&!/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(value)?value.trim():fallback;
const record=(collection,id,version,data)=>({collection,id,version,archived:false,data});
const policyColumns='business_id AS id,enabled,recognition_basis AS "recognitionBasis",posting_enabled AS "postingEnabled",version,review_reference AS "reviewReference",updated_by AS "updatedBy",updated_at AS "updatedAt"';
const sourceColumns='id,kind,source_key AS "sourceKey",order_id AS "orderId",line_id AS "lineId",stock_item_id AS "stockItemId",movement_id AS "movementId",document_id AS "documentId",original_source_id AS "originalSourceId",reference,description,amount_minor::text AS "amountMinor",state,coverage,snapshot_hash AS "snapshotHash",policy_version AS "policyVersion",source_command_id AS "sourceCommandId",occurred_at AS "occurredAt",recorded_at AS "recordedAt"';
const reviewColumns='id,cost_source_id AS "sourceId",disposition,reason,accounting_reference AS "accountingReference",proposed_journal AS "proposedJournal",financial_journal_id AS "financialJournalId",source_command_id AS "sourceCommandId",reviewed_by AS "reviewedBy",reviewed_by_name AS "reviewedByName",reviewed_at AS "reviewedAt"';
const projectPolicy=row=>record('historicalCostPolicy',row.id,Number(row.version),{...row,version:Number(row.version),postingEnabled:false,updatedAt:iso(row.updatedAt)});
const projectSource=row=>record('historicalCostSources',row.id,1,{...row,amountMinor:amount(row.amountMinor),policyVersion:Number(row.policyVersion),currency:'KES',postingStatus:'UNPOSTED',occurredAt:iso(row.occurredAt),recordedAt:iso(row.recordedAt)});
const projectReview=row=>record('historicalCostReviews',row.id,1,{...row,reviewedAt:iso(row.reviewedAt)});

export function historicalCostCapability(actor,raw=process.env.ACCOUNTING_COST_REVIEW_COHORTS){
 if(!has(actor,'accounting.view','accounting.manage','reports.view'))return false;
 let cohorts;try{cohorts=JSON.parse(raw||'[]')}catch{return false}
 return Boolean(actor.deviceId&&Array.isArray(cohorts)&&cohorts.some(row=>row?.businessId===actor.businessId&&row.staffId===actor.staffId&&row.deviceId===actor.deviceId));
}
const read=async(pool,work)=>{const db=await pool.connect();try{await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");const result=await work(db);await db.query('COMMIT');return result}catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}};
export async function historicalCostProjections(db,businessId){
 const policy=await db.query(`SELECT ${policyColumns} FROM business_cost_review_policy WHERE business_id=$1`,[businessId]);
 const sources=await db.query(`SELECT ${sourceColumns} FROM business_historical_cost_sources WHERE business_id=$1 ORDER BY occurred_at DESC,id DESC LIMIT 50`,[businessId]);
 const reviews=await db.query(`SELECT ${reviewColumns} FROM business_historical_cost_reviews WHERE business_id=$1 ORDER BY reviewed_at DESC,id DESC LIMIT 50`,[businessId]);
 return [...policy.rows.map(projectPolicy),...sources.rows.map(projectSource),...reviews.rows.map(projectReview)];
}
export async function historicalCostState(pool,businessId,{kind='ALL',before=null,limit=50}={}){
 if(kind!=='ALL'&&!kinds.includes(kind)||!Number.isInteger(limit)||limit<1||limit>100)fail('Choose a supported cost-source type and page size.');
 let cursor=null;if(before){try{cursor=JSON.parse(Buffer.from(before,'base64url').toString('utf8'))}catch{fail('The cost-source page cursor is invalid.')}if(!uuid(cursor?.id)||typeof cursor?.at!=='string'||!Number.isFinite(Date.parse(cursor.at))||cursor.kind!==kind)fail('The cost-source page cursor does not match this filter.');}
 return read(pool,async db=>{
  const policy=await db.query(`SELECT ${policyColumns} FROM business_cost_review_policy WHERE business_id=$1`,[businessId]);
  const sources=await db.query(`SELECT ${sourceColumns} FROM business_historical_cost_sources WHERE business_id=$1 AND ($2='ALL' OR kind=$2) AND ($3::timestamptz IS NULL OR (occurred_at,id)<($3::timestamptz,$4::uuid)) ORDER BY occurred_at DESC,id DESC LIMIT $5`,[businessId,kind,cursor?.at??null,cursor?.id??null,limit+1]);
  const counts=await db.query(`SELECT count(*)::text AS total,count(*) FILTER(WHERE state='RECONCILIATION_REQUIRED')::text AS exceptions,statement_timestamp() AS generated_at FROM business_historical_cost_sources WHERE business_id=$1 AND ($2='ALL' OR kind=$2)`,[businessId,kind]);
  const items=sources.rows.slice(0,limit).map(projectSource),last=items.at(-1),hasMore=sources.rows.length>limit;
  return {policy:policy.rows[0]?projectPolicy(policy.rows[0]):null,items,kind,hasMore,nextCursor:hasMore?Buffer.from(JSON.stringify({at:last.data.occurredAt,id:last.id,kind})).toString('base64url'):null,total:Number(counts.rows[0].total),exceptions:Number(counts.rows[0].exceptions),generatedAt:iso(counts.rows[0].generated_at),postingEnabled:false,recognitionBasis:'UNAPPROVED'};
 });
}
export async function historicalCostSource(pool,businessId,sourceId){
 if(!uuid(sourceId))fail('Choose a valid historical cost source.');
 return read(pool,async db=>{
  const source=await db.query(`SELECT ${sourceColumns},source_snapshot AS "sourceSnapshot" FROM business_historical_cost_sources WHERE business_id=$1 AND id=$2`,[businessId,sourceId]);
  if(!source.rows[0])throw new ApiProblem(404,'RESOURCE_NOT_FOUND','The cost evidence is unavailable.');
  const row=source.rows[0];if(hash(row.sourceSnapshot)!==row.snapshotHash.trim())conflict('COST_SNAPSHOT_INTEGRITY_REQUIRED','The cost snapshot does not match its immutable hash. Preserve it for accounting investigation.');
  const reviews=await db.query(`SELECT ${reviewColumns} FROM business_historical_cost_reviews WHERE business_id=$1 AND cost_source_id=$2 ORDER BY reviewed_at DESC,id DESC LIMIT 50`,[businessId,sourceId]);
  const counts=await db.query('SELECT count(*)::text AS count FROM business_historical_cost_reviews WHERE business_id=$1 AND cost_source_id=$2',[businessId,sourceId]);
  return {source:projectSource(row),reviews:reviews.rows.map(projectReview),totalReviews:Number(counts.rows[0].count),postingEnabled:false};
 });
}

async function saveSource(context,policy,source){
 const {tx,actor,command,at}=context,coverage=[...(source.coverage??[])];
 const offlineCommand=['pos.offlineSale.commitV2','order.offlineCashSale'].includes(command.name);
 if(offlineCommand)coverage.push('This cost was valued by canonical fire during server reconciliation. A frozen local sale-time unit-cost snapshot has not been verified; do not certify it as the original offline sale cost.');
 if(source.amountMinor===null||source.amountMinor===undefined)coverage.push('Source cost is unavailable; it must not be treated as zero.');
 const state=coverage.length?'RECONCILIATION_REQUIRED':'EVIDENCE_RECORDED',snapshot={snapshotVersion:1,kind:source.kind,sourceKey:source.sourceKey,amountMinor:source.amountMinor??null,coverage,evidence:{...source.evidence,...(offlineCommand?{valuationTiming:'SERVER_RECONCILIATION',localSaleOccurredAt:command.payload.sale?.occurredAt??null}:{})}};
 const id=randomUUID(),params=[actor.businessId,id,source.kind,source.sourceKey,source.orderId??null,source.lineId??null,source.stockItemId??null,source.movementId??null,source.documentId??null,source.originalSourceId??null,human(source.reference,'Cost evidence'),source.description,source.amountMinor??null,state,JSON.stringify(coverage),JSON.stringify(snapshot),hash(snapshot),Number(policy.version),command.commandId,source.occurredAt,at];
 const {rows}=await tx.client.query(`INSERT INTO business_historical_cost_sources(business_id,id,kind,source_key,order_id,line_id,stock_item_id,movement_id,document_id,original_source_id,reference,description,amount_minor,state,coverage,source_snapshot,snapshot_hash,policy_version,source_command_id,occurred_at,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,$20,$21) ON CONFLICT(business_id,kind,source_key) DO NOTHING RETURNING ${sourceColumns}`,params);
 if(!rows[0])return null;
 // The command kernel must see the immutable source at version 1 before an
 // accountant can submit its reviewed-version key in a later command.
 await tx.bumpEntityVersion(actor.businessId,'historicalCostSources',id,0);
 return projectSource(rows[0]);
}

// Called once after the existing canonical handler, in its same transaction.
// This writes evidence only. It never repeats stock, payment or receipt commands.
export async function captureHistoricalCosts(context,handled){
 const relevant=handled.records.some(row=>row.collection==='stockMovements'||row.collection==='businessDocuments'&&['SALES_RECEIPT','CUSTOMER_CREDIT_INVOICE'].includes(row.data.type)||row.collection==='orders'&&row.data.state==='VOIDED');
 if(!relevant)return handled;
 const {tx,actor,command,at}=context,db=tx.client;
 const policyResult=await db.query(`SELECT ${policyColumns} FROM business_cost_review_policy WHERE business_id=$1`,[actor.businessId]),policy=policyResult.rows[0];
 if(!policy?.enabled)return handled;
 const added=[],append=async source=>{const row=await saveSource(context,policy,source);if(row)added.push(row)};
 const consumptions=await db.query(`SELECT c.order_id AS "orderId",c.line_id AS "lineId",c.stock_item_id AS "stockItemId",c.location_id AS "locationId",c.movement_id AS "movementId",c.quantity::text,c.unit_cost_minor::text AS "unitCostMinor",c.cost_minor::text AS "costMinor",round(c.quantity*c.unit_cost_minor)::text AS "calculatedCostMinor",c.physical_snapshot AS "physicalSnapshot",m.occurred_at AS "occurredAt",m.quantity_delta::text AS "movementQuantity",s.average_unit_cost_minor::text AS "movementUnitCostMinor",s.before_state AS "before",s.after_state AS "after",s.base_unit AS "baseUnit",(c.unit_cost_minor=s.average_unit_cost_minor) AS "originalRateMatches",(-m.quantity_delta=sum(c.quantity) OVER(PARTITION BY c.business_id,c.movement_id)) AS "movementQuantityMatches",o.name AS reference,l.product_snapshot->>'name' AS "itemName" FROM pos_stock_consumptions c JOIN inventory_movements m ON m.business_id=c.business_id AND m.id=c.movement_id JOIN pos_orders o ON o.business_id=c.business_id AND o.id=c.order_id JOIN pos_order_lines l ON l.business_id=c.business_id AND l.order_id=c.order_id AND l.id=c.line_id LEFT JOIN inventory_movement_states s ON s.business_id=m.business_id AND s.movement_id=m.id WHERE c.business_id=$1 AND c.command_id=$2 ORDER BY c.order_id,c.line_id,c.stock_item_id`,[actor.businessId,command.commandId]);
 for(const row of consumptions.rows){
  const value=amount(row.costMinor),coverage=[];
  if(value===null||row.costMinor!==row.calculatedCostMinor)coverage.push('Original consumption quantity and cost do not reconcile.');
  if(!row.before||!row.after||row.movementUnitCostMinor===null)coverage.push('Original movement-state valuation evidence is missing.');
  if(row.originalRateMatches!==true||row.movementQuantityMatches!==true)coverage.push('Original consumption rate or grouped physical quantity does not match its inventory movement evidence.');
  if(Number(row.unitCostMinor)===0)coverage.push('Zero original cost requires accountant review; it is not assumed to be complete.');
  await append({kind:'POS_CONSUMPTION',sourceKey:`${row.orderId}:${row.lineId}:${row.stockItemId}`,orderId:row.orderId,lineId:row.lineId,stockItemId:row.stockItemId,movementId:row.movementId,reference:row.reference,description:human(row.itemName,'Prepared item')+' - original inventory consumption',amountMinor:value,occurredAt:row.occurredAt,coverage,evidence:{...row,occurredAt:iso(row.occurredAt),costRecognition:'UNAPPROVED',quantityAndRate:'ORIGINAL_FIXED_POINT_STRINGS'}});
 }
 const bills=await db.query(`SELECT id,document_type AS type,document_number AS reference,snapshot_hash AS "documentHash",snapshot,issued_at AS "occurredAt" FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type IN ('SALES_RECEIPT','CUSTOMER_CREDIT_INVOICE') ORDER BY issued_at,id`,[actor.businessId,command.commandId]);
 for(const bill of bills.rows){
  const orderId=bill.snapshot.orderId;if(!uuid(orderId))continue;
  const items=Array.isArray(bill.snapshot.items)?bill.snapshot.items.filter(item=>item.state!=='VOIDED'):[],lineIds=items.map(item=>item.id).filter(uuid),coverage=[];
  if(!lineIds.length||lineIds.length!==items.length||new Set(lineIds).size!==lineIds.length)coverage.push('The issued bill item identities require reconciliation.');
  const costs=await db.query(`SELECT c.line_id AS "lineId",c.stock_item_id AS "stockItemId",c.movement_id AS "movementId",c.quantity::text,c.unit_cost_minor::text AS "unitCostMinor",c.cost_minor::text AS "costMinor",l.product_snapshot->>'name' AS "itemName",e.id AS "evidenceId",e.state AS "evidenceState" FROM pos_stock_consumptions c JOIN pos_order_lines l ON l.business_id=c.business_id AND l.order_id=c.order_id AND l.id=c.line_id LEFT JOIN business_historical_cost_sources e ON e.business_id=c.business_id AND e.kind='POS_CONSUMPTION' AND e.source_key=c.order_id::text||':'||c.line_id::text||':'||c.stock_item_id::text WHERE c.business_id=$1 AND c.order_id=$2 AND c.line_id=ANY($3::uuid[]) ORDER BY c.line_id,c.stock_item_id`,[actor.businessId,orderId,lineIds]);
  const recipes=await db.query(`SELECT l.id,l.product_snapshot->'ingredientSnapshot' AS ingredients FROM pos_order_lines l WHERE l.business_id=$1 AND l.order_id=$2 AND l.id=ANY($3::uuid[])`,[actor.businessId,orderId,lineIds]);
  for(const line of recipes.rows){if(!Array.isArray(line.ingredients)){coverage.push('The original line recipe snapshot is missing.');continue}for(const ingredient of line.ingredients)if(!costs.rows.some(cost=>cost.lineId===line.id&&cost.stockItemId===ingredient.stockItemId))coverage.push('A billed ingredient has no original cost consumption.');}
  if(costs.rows.some(cost=>!cost.evidenceId||cost.evidenceState!=='EVIDENCE_RECORDED'))coverage.push('Some consumption predates cost-evidence activation or still requires reconciliation; it is not automatically backfilled.');
  const prior=await db.query(`SELECT 1 FROM business_documents WHERE business_id=$1 AND document_type IN ('SALES_RECEIPT','CUSTOMER_CREDIT_INVOICE') AND snapshot->>'orderId'=$2 AND (issued_at,id)<($3,$4) LIMIT 1`,[actor.businessId,orderId,bill.occurredAt,bill.id]);
  if(prior.rows.length)coverage.push('An earlier bill exists for this order. Reissuing a bill must not recognise the same costs again.');
  const total=costs.rows.reduce((sum,row)=>sum+BigInt(row.costMinor),0n),value=amount(total.toString());if(value===null)coverage.push('Billed cost exceeds supported minor-unit amounts.');
  await append({kind:'POS_BILL',sourceKey:bill.id,orderId,documentId:bill.id,reference:bill.reference,description:bill.type==='CUSTOMER_CREDIT_INVOICE'?'Issued customer-account bill costing':'Issued settled or zero-value bill costing',amountMinor:value,occurredAt:bill.occurredAt,coverage:[...new Set(coverage)],evidence:{documentId:bill.id,documentReference:bill.reference,documentHash:bill.documentHash,documentType:bill.type,issuedAt:iso(bill.occurredAt),orderId,lineIds,consumptions:costs.rows,costRecognition:'UNAPPROVED'}});
 }
 const returns=await db.query(`SELECT r.order_id AS "orderId",r.line_id AS "lineId",r.stock_item_id AS "stockItemId",r.original_movement_id AS "originalMovementId",r.return_movement_id AS "movementId",r.quantity::text,r.cost_minor::text AS "costMinor",r.evidence,c.quantity::text AS "originalQuantity",c.unit_cost_minor::text AS "originalUnitCostMinor",c.cost_minor::text AS "originalCostMinor",e.id AS "originalSourceId",e.state AS "originalState",m.occurred_at AS "occurredAt",o.name AS reference FROM pos_void_stock_returns r JOIN pos_stock_consumptions c ON c.business_id=r.business_id AND c.order_id=r.order_id AND c.line_id=r.line_id AND c.stock_item_id=r.stock_item_id JOIN inventory_movements m ON m.business_id=r.business_id AND m.id=r.return_movement_id JOIN pos_orders o ON o.business_id=r.business_id AND o.id=r.order_id LEFT JOIN business_historical_cost_sources e ON e.business_id=r.business_id AND e.kind='POS_CONSUMPTION' AND e.source_key=r.order_id::text||':'||r.line_id::text||':'||r.stock_item_id::text WHERE r.business_id=$1 AND r.command_id=$2`,[actor.businessId,command.commandId]);
 for(const row of returns.rows){const coverage=[];if(row.costMinor!==row.originalCostMinor||row.quantity!==row.originalQuantity||row.evidence.confirmedUnopenedReturned!==true)coverage.push('Physical return does not exactly match original quantity, cost and unopened-stock evidence.');if(!row.originalSourceId||row.originalState!=='EVIDENCE_RECORDED')coverage.push('Original cost evidence is absent or unresolved; an original financial cost posting cannot be presumed.');await append({kind:'PHYSICAL_RETURN',sourceKey:`${row.orderId}:${row.lineId}:${row.stockItemId}`,orderId:row.orderId,lineId:row.lineId,stockItemId:row.stockItemId,movementId:row.movementId,originalSourceId:row.originalSourceId,reference:row.reference,description:'Confirmed unopened physical return at original consumption cost',amountMinor:amount(row.costMinor),occurredAt:row.occurredAt,coverage,evidence:{...row,occurredAt:iso(row.occurredAt),costReversal:'ORIGINAL_JOURNAL_CLASSIFICATION_REQUIRED'}})}
 const voids=handled.records.filter(row=>row.collection==='orders'&&row.data.state==='VOIDED');
 for(const order of voids){
  const loss=await db.query(`SELECT c.line_id AS "lineId",c.stock_item_id AS "stockItemId",c.cost_minor::text AS "originalCostMinor",COALESCE(r.cost_minor,0)::text AS "returnedCostMinor",c.unit_cost_minor::text AS "originalUnitCostMinor",c.quantity::text,e.id AS "evidenceId",e.state AS "evidenceState" FROM pos_stock_consumptions c LEFT JOIN pos_void_stock_returns r ON r.business_id=c.business_id AND r.order_id=c.order_id AND r.line_id=c.line_id AND r.stock_item_id=c.stock_item_id LEFT JOIN business_historical_cost_sources e ON e.business_id=c.business_id AND e.kind='POS_CONSUMPTION' AND e.source_key=c.order_id::text||':'||c.line_id::text||':'||c.stock_item_id::text WHERE c.business_id=$1 AND c.order_id=$2`,[actor.businessId,order.id]);
  const total=loss.rows.reduce((sum,row)=>sum+BigInt(row.originalCostMinor)-BigInt(row.returnedCostMinor),0n);if(total===0n)continue;
  const coverage=[];if(loss.rows.some(row=>!row.evidenceId||row.evidenceState!=='EVIDENCE_RECORDED'))coverage.push('Some original consumption is outside enabled cost evidence or needs review.');
  const prior=await db.query(`SELECT 1 FROM business_documents WHERE business_id=$1 AND snapshot->>'orderId'=$2 AND document_type IN ('SALES_RECEIPT','CUSTOMER_CREDIT_INVOICE') LIMIT 1`,[actor.businessId,order.id]);if(prior.rows.length)coverage.push('The voided order previously had a bill. Classification and earlier cost postings require explicit review.');
  await append({kind:'VOID_LOSS',sourceKey:order.id,orderId:order.id,reference:order.data.name,description:'Voided prepared inventory without a confirmed physical return',amountMinor:amount(total.toString()),occurredAt:order.data.voidedAt||at,coverage,evidence:{orderId:order.id,disposition:order.data.voidDisposition,consumptions:loss.rows,costRecognition:'UNAPPROVED'}});
 }
 const waste=await db.query(`SELECT m.id AS "movementId",m.stock_item_id AS "stockItemId",m.location_id AS "locationId",m.quantity_delta::text AS quantity,m.reason,m.occurred_at AS "occurredAt",s.base_unit AS "baseUnit",s.average_unit_cost_minor::text AS "unitCostMinor",round(abs(m.quantity_delta)*s.average_unit_cost_minor)::text AS "costMinor",s.before_state AS "before",s.after_state AS "after" FROM inventory_movements m LEFT JOIN inventory_movement_states s ON s.business_id=m.business_id AND s.movement_id=m.id WHERE m.business_id=$1 AND m.source_command_id=$2 AND m.movement_type='WASTE'`,[actor.businessId,command.commandId]);
 for(const row of waste.rows){const coverage=[];if(row.costMinor===null||!row.before||!row.after)coverage.push('Original waste valuation or restoration evidence is missing.');if(Number(row.unitCostMinor)===0)coverage.push('Zero original waste cost requires review.');await append({kind:'WASTE',sourceKey:row.movementId,stockItemId:row.stockItemId,movementId:row.movementId,reference:'Stock waste',description:row.reason,amountMinor:amount(row.costMinor),occurredAt:row.occurredAt,coverage,evidence:{...row,occurredAt:iso(row.occurredAt),costRecognition:'UNAPPROVED'}})}
 const reversals=await db.query(`SELECT r.original_movement_id AS "originalMovementId",r.reversal_command_id AS "reversalCommandId",r.reason,r.occurred_at AS "occurredAt",e.id AS "originalSourceId",e.amount_minor::text AS "costMinor",e.state AS "originalState",s.average_unit_cost_minor::text AS "originalUnitCostMinor",m.quantity_delta::text AS "originalQuantity",m.stock_item_id AS "stockItemId" FROM inventory_reversals r JOIN inventory_movements m ON m.business_id=r.business_id AND m.id=r.original_movement_id AND m.movement_type='WASTE' LEFT JOIN business_historical_cost_sources e ON e.business_id=m.business_id AND e.kind='WASTE' AND e.source_key=m.id::text LEFT JOIN inventory_movement_states s ON s.business_id=m.business_id AND s.movement_id=m.id WHERE r.business_id=$1 AND r.reversal_command_id=$2`,[actor.businessId,command.commandId]);
 for(const row of reversals.rows){const coverage=[];if(!row.originalSourceId||row.originalState!=='EVIDENCE_RECORDED')coverage.push('No reconciled original waste cost source is available; reversing a financial expense cannot be presumed.');await append({kind:'WASTE_REVERSAL',sourceKey:row.reversalCommandId,stockItemId:row.stockItemId,movementId:row.originalMovementId,originalSourceId:row.originalSourceId,reference:'Stock waste correction',description:row.reason,amountMinor:amount(row.costMinor),occurredAt:row.occurredAt,coverage,evidence:{...row,occurredAt:iso(row.occurredAt),costReversal:'ORIGINAL_JOURNAL_CLASSIFICATION_REQUIRED'}})}
 return {...handled,records:[...handled.records,...added]};
}

async function requireManager(context){if(!has(context.actor,'accounting.manage'))throw new ApiProblem(403,'PERMISSION_DENIED','Accounting management permission is required.');if(!historicalCostCapability(context.actor))throw new ApiProblem(403,'COST_REVIEW_PILOT_DISABLED','This staff/device is outside the historical-cost review cohort.');}
const savePolicy=async context=>{
 await requireManager(context);const {tx,actor,command,at}=context,p=command.payload;
 if(p.id!==actor.businessId||typeof p.enabled!=='boolean')fail('Choose this business and an explicit cost-evidence policy.');
 if(p.postingEnabled===true||p.recognitionBasis&&p.recognitionBasis!=='UNAPPROVED')conflict('COST_POSTING_UNAVAILABLE','Posting cannot be activated until the accountant-selected recognition basis, chart and source-path coverage are implemented and accepted.');
 const expected=command.expectedVersions[`historicalCostPolicy:${p.id}`];if(!Number.isSafeInteger(expected)||expected<0||Object.keys(command.expectedVersions).length!==1)fail('Review exactly the current cost-evidence policy version.');
 const notes=text(p.reason,'Policy reason',500,true),reference=text(p.reviewReference,'Accounting review reference',160);
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`cost-review-policy:${actor.businessId}`]);
 const current=await tx.client.query('SELECT version FROM business_cost_review_policy WHERE business_id=$1',[actor.businessId]);if(Number(current.rows[0]?.version??0)!==expected)conflict('VERSION_CONFLICT','Cost policy changed. Refresh before saving.');
 const version=await tx.bumpEntityVersion(actor.businessId,'historicalCostPolicy',p.id,expected),updated=await tx.client.query(`INSERT INTO business_cost_review_policy(business_id,enabled,version,review_reference,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(business_id) DO UPDATE SET enabled=EXCLUDED.enabled,version=EXCLUDED.version,review_reference=EXCLUDED.review_reference,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING ${policyColumns}`,[actor.businessId,p.enabled,version,`${reference} - ${notes}`.slice(0,660),actor.staffId,at]);
 const value=projectPolicy(updated.rows[0]);return {value,records:[value]};
};
const reviewCost=async context=>{
 await requireManager(context);const {tx,actor,command,at}=context,p=command.payload;
 if(!uuid(p.id)||!uuid(p.sourceId)||command.expectedVersions[`historicalCostReviews:${p.id}`]!==0||command.expectedVersions[`historicalCostSources:${p.sourceId}`]!==1||Object.keys(command.expectedVersions).length!==2)fail('Choose an immutable cost source and a new review identity.');
 const notes=text(p.reason,'Review reason',500,true),reference=text(p.accountingReference,'Accounting review reference',160);
 if(!['EVIDENCE_REVIEWED','RECONCILIATION_REQUIRED'].includes(p.disposition))fail('Choose an evidence-review outcome.');
 const loaded=await tx.client.query(`SELECT ${sourceColumns},source_snapshot AS "sourceSnapshot" FROM business_historical_cost_sources WHERE business_id=$1 AND id=$2`,[actor.businessId,p.sourceId]),source=loaded.rows[0];if(!source)throw new ApiProblem(404,'RESOURCE_NOT_FOUND','The original cost source is unavailable.');
 if(hash(source.sourceSnapshot)!==source.snapshotHash.trim())conflict('COST_SNAPSHOT_INTEGRITY_REQUIRED','The original cost evidence does not match its immutable hash.');
 if(source.state==='RECONCILIATION_REQUIRED'&&p.disposition!=='RECONCILIATION_REQUIRED')fail('This immutable source has outstanding coverage issues. Record the reconciliation requirement; a review cannot rewrite or resolve its original evidence.');
 const value=amount(source.amountMinor),positive=value!==null&&value>0,expense={POS_BILL:'EXPENSE_POS_COGS',VOID_LOSS:'EXPENSE_VOID_CONSUMPTION',WASTE:'EXPENSE_STOCK_WASTE'}[source.kind];
 const lines=positive&&expense?[{accountCode:expense,debitMinor:value,creditMinor:0},{accountCode:'ASSET_INVENTORY',debitMinor:0,creditMinor:value}]:[];
 const proposedJournal={proposalVersion:1,postingStatus:'UNAVAILABLE',recognitionBasis:'UNAPPROVED',sourceHash:source.snapshotHash,currency:'KES',amountMinor:value,lines,balanced:lines.length===2,requirements:['Accountant-selected recognition basis and chart approval.','Complete bill, customer-credit, room-charge, zero-value, void and return paths.','Original-source posting link before any financial reversal.','Source reconciliation and posting-period protection.'],note:source.kind==='POS_CONSUMPTION'?'Preparation consumption is evidence, not automatically a cost-of-sales expense. Do not also recognise it from a bill.':['PHYSICAL_RETURN','WASTE_REVERSAL'].includes(source.kind)?'Physical restoration is documented. Reverse only a verified original journal using its exact account classification.':'These balanced legs are a proposal. No financial journal, cash entry or stock movement is posted.'};
 const names=await tx.client.query('SELECT display_name FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[actor.businessId,actor.staffId]);
 await tx.bumpEntityVersion(actor.businessId,'historicalCostReviews',p.id,0);
 const {rows}=await tx.client.query(`INSERT INTO business_historical_cost_reviews(business_id,id,cost_source_id,disposition,reason,accounting_reference,proposed_journal,source_command_id,reviewed_by,reviewed_by_name,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11) RETURNING ${reviewColumns}`,[actor.businessId,p.id,p.sourceId,p.disposition,notes,reference,JSON.stringify(proposedJournal),command.commandId,actor.staffId,names.rows[0]?.display_name||'Authorised accountant',at]);
 const review=projectReview(rows[0]);return {value:review,records:[review]};
};
export const historicalCostCommandRegistry=new Map([
 ['accountingCost.policy.save',{permission:'accounting.manage',offlinePolicy:'ONLINE_ONLY',handler:savePolicy}],
 ['accountingCost.review',{permission:'accounting.manage',offlinePolicy:'ONLINE_ONLY',handler:reviewCost}],
]);
