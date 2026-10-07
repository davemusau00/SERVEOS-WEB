import {randomUUID} from 'node:crypto';
import {supplierCreditBalanceProjections,supplierCreditApplicationProjections} from './supplier-credit-application-projections.mjs';
import {customerProjections} from './customer-commands.mjs';
import {customerCreditAccountProjections,customerCreditEntryProjections} from './customer-credit-commands.mjs';
import {customerCreditReconciliationProjections,customerCreditDiscrepancyProjections} from './customer-credit-reconciliation-commands.mjs';
import {supplierCreditNoteProjections} from './supplier-credit-commands.mjs';
import {supplierReturnProjections} from './supplier-return-projections.mjs';
import {supplierPaymentProjections} from './supplier-payment-commands.mjs';
import {payableProjections} from './procurement-payables.mjs';
import {goodsReceiptProjections} from './goods-receipt-projections.mjs';
import {purchaseOrderProjections} from './purchase-order-commands.mjs';
import {supplierProjections} from './supplier-commands.mjs';
import {refundProjections} from './refund-commands.mjs';
import {journalProjections} from './financial-journals.mjs';
import {closeDayProjections} from './close-day-commands.mjs';
import {receiptSettingsProjections} from './business-tax.mjs';
import {paymentProjections} from './payment-commands.mjs';
import {paymentAccountProjections} from './payment-accounts.mjs';
import {tillProjections} from './till-commands.mjs';
import {documentProjections} from './business-documents.mjs';
import {orderProjections} from './pos-commands.mjs';
import {staffProjections} from './staff-commands.mjs';
import {deviceProjections} from './device-commands.mjs';
const redactCommandSecrets=value=>Array.isArray(value)?value.map(redactCommandSecrets):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!/(?:password|secret|token|credential|pin)/i.test(key)).map(([key,item])=>[key,redactCommandSecrets(item)])):value;
const receiptProjection = row => {
  const data={...row,receivedAt:row.receivedAt.toISOString()};
  for(const key of ['quantity','baseQuantity','totalCostMinor','unitCostMinor','beforeAverageCostMinor','afterAverageCostMinor','sealedContainers','openQuantity'])data[key]=row[key]===null?null:Number(row[key]);
  return {collection:'inventoryReceipts',id:row.id,version:1,data,archived:false};
};
const receiptColumns = `id,stock_item_id AS "stockItemId",location_id AS "locationId",source_document AS "sourceDocument",purchase_package_snapshot AS "purchasePackage",quantity_received AS quantity,base_quantity AS "baseQuantity",total_cost_minor AS "totalCostMinor",unit_cost_minor AS "unitCostMinor",before_average_cost_minor AS "beforeAverageCostMinor",after_average_cost_minor AS "afterAverageCostMinor",received_sealed_containers AS "sealedContainers",received_open_quantity AS "openQuantity",source_command_id AS "sourceCommandId",received_by AS "receivedBy",received_at AS "receivedAt"`;
const policyProjection = row => ({collection:'inventoryPolicy',id:row.businessId,version:Number(row.version),archived:false,data:{allowDirectReceipts:row.allowDirectReceipts,requireSupplierReference:row.requireSupplierReference,requirePurchaseOrder:row.requirePurchaseOrder,updatedBy:row.updatedBy,updatedAt:row.updatedAt.toISOString()}});
const policyColumns = `business_id AS "businessId",allow_direct_receipts AS "allowDirectReceipts",require_supplier_reference AS "requireSupplierReference",require_purchase_order AS "requirePurchaseOrder",version,updated_by AS "updatedBy",updated_at AS "updatedAt"`;

export class PostgresStore {
  constructor(pool) { this.pool = pool; }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresTransaction(client);
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async commandStatus(businessId, commandId, staffId = null) {
    const {rows} = await this.pool.query(
      'SELECT status, outcome, error, received_at AS "receivedAt", updated_at AS "updatedAt" FROM api_commands WHERE business_id = $1 AND command_id = $2 AND ($3::uuid IS NULL OR staff_id=$3)',
      [businessId, commandId, staffId],
    );
    return rows[0] ?? null;
  }

  async persistCommandReceived({businessId,commandId,name,payloadHash,actor,request,at}){
    return this.transaction(async tx=>{
      await tx.lockCommandKey(businessId,commandId);
      const existing=await tx.getCommand(businessId,commandId);
      if(existing)return existing;
      const {rows}=await tx.client.query(`INSERT INTO api_commands(business_id,command_id,command_name,payload_hash,staff_id,device_id,status,received_at,updated_at,request) VALUES($1,$2,$3,$4,$5,$6,'RECEIVED',$7,$7,$8::jsonb) RETURNING status,outcome,error,payload_hash AS "payloadHash",staff_id AS "staffId",device_id AS "deviceId"`,[businessId,commandId,name,payloadHash,actor.staffId,actor.deviceId,at,JSON.stringify(redactCommandSecrets(request))]);
      return rows[0];
    });
  }

  async setCommandProcessing(businessId,commandId,at){await this.pool.query(`UPDATE api_commands SET status='PROCESSING',updated_at=$3 WHERE business_id=$1 AND command_id=$2 AND status IN ('RECEIVED','PROCESSING')`,[businessId,commandId,at]);}

  async finalizeCommandFailure({businessId,commandId,name,actor,status,error,at}){
    return this.transaction(async tx=>{
      // Terminal failure must serialize with an execution of the same command.
      // A concurrent replay cannot reject a command while its first attempt commits.
      await tx.lockCommandKey(businessId,commandId);
      const {rowCount}=await tx.client.query(`UPDATE api_commands SET status=$3,error=$4::jsonb,outcome=$5::jsonb,updated_at=$6 WHERE business_id=$1 AND command_id=$2 AND status IN ('RECEIVED','PROCESSING')`,[businessId,commandId,status,JSON.stringify(error),JSON.stringify({kind:status,commandId,error}),at]);
      if(rowCount!==1){const saved=await tx.getCommand(businessId,commandId);return saved?.outcome;}
      await tx.insertAudit({businessId,commandId,name,actor,at,eventType:status});
      const saved=await tx.getCommand(businessId,commandId);return saved?.outcome;
    });
  }

  async changesAfter(businessId, after, limit) {
    const {rows} = await this.pool.query(`
      WITH high_water AS MATERIALIZED (
        SELECT COALESCE((SELECT cursor FROM business_change_cursors WHERE business_id = $1),0)::bigint AS cursor
      ), page AS MATERIALIZED (
        SELECT cursor, command_id AS "commandId", change_type AS "changeType", projection, occurred_at AS "occurredAt"
        FROM business_changes WHERE business_id = $1 AND cursor > $2 ORDER BY cursor LIMIT $3
      )
      SELECT page.*, high_water.cursor AS "highWater" FROM high_water
      LEFT JOIN page ON true ORDER BY page.cursor NULLS LAST
    `, [businessId, after, limit + 1]);
    const highWater=Number(rows[0]?.highWater??0);
    const available=rows.filter(row=>row.cursor!==null);
    const hasMore = available.length > limit;
    const changes = available.slice(0, limit).map(row => {
      const projection=typeof row.projection==='string'?JSON.parse(row.projection):row.projection;
      return {...projection,sequence:Number(row.cursor),commandId:row.commandId,occurredAt:row.occurredAt};
    });
    return {cursor:changes.at(-1)?.sequence??after,highWater,hasMore,changes};
  }

  async listCatalogItems(businessId, search = '') {
    const {rows} = await this.pool.query(`
      SELECT id, category_id AS "categoryId", name, sku, base_price_minor AS "basePriceMinor",
             currency, track_inventory AS "trackInventory", version, created_at AS "createdAt"
      FROM catalog_items
      WHERE business_id = $1 AND archived_at IS NULL
        AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR sku ILIKE '%' || $2 || '%')
      ORDER BY name, id
      LIMIT 500
    `, [businessId, search]);
    return rows;
  }

  async customerCreditStatementPage(businessId,customerId,{highWater=null,before=null,limit=100}={}){
    if(highWater===null){const {rows}=await this.pool.query('SELECT COALESCE(max(entry_sequence),0)::text AS cursor FROM customer_credit_entries WHERE business_id=$1 AND customer_id=$2',[businessId,customerId]);highWater=rows[0].cursor;}
    const {rows}=await this.pool.query(`WITH running AS (
      SELECT e.id,e.entry_sequence AS "entrySequence",e.customer_id AS "customerId",c.name AS "customerName",e.kind,e.balance_delta_minor AS "balanceDeltaMinor",e.amount_minor AS "amountMinor",e.order_id AS "orderId",e.due_at AS "dueAt",e.payment_method AS "paymentMethod",e.payment_account_id AS "paymentAccountId",e.payment_account_snapshot AS "paymentAccountSnapshot",e.till_session_id AS "tillSessionId",e.received_at AS "receivedAt",e.reference,e.allocations,e.reverses_entry_id AS "reversesEntryId",e.reason,e.actor_id AS "actorId",e.device_id AS "deviceId",e.source_command_id AS "sourceCommandId",e.occurred_at AS "occurredAt",SUM(e.balance_delta_minor) OVER(ORDER BY e.entry_sequence ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "balanceAfterMinor"
      FROM customer_credit_entries e JOIN business_customers c ON c.business_id=e.business_id AND c.id=e.customer_id
      WHERE e.business_id=$1 AND e.customer_id=$2 AND e.entry_sequence<=$3::bigint
    ) SELECT * FROM running WHERE ($4::bigint IS NULL OR "entrySequence"<$4::bigint) ORDER BY "entrySequence" DESC LIMIT $5`,[businessId,customerId,highWater,before,limit+1]);
    const hasMore=rows.length>limit,items=rows.slice(0,limit).map(row=>({collection:'customerCreditEntries',id:row.id,version:1,archived:false,data:{...row,entrySequence:String(row.entrySequence),balanceDeltaMinor:Number(row.balanceDeltaMinor),amountMinor:Number(row.amountMinor),balanceAfterMinor:Number(row.balanceAfterMinor),dueAt:row.dueAt?.toISOString()??null,receivedAt:row.receivedAt?.toISOString()??null,occurredAt:row.occurredAt.toISOString()}}));
    return {items,hasMore,highWater:String(highWater),before:items.at(-1)?.data.entrySequence??null};
  }

  async catalogProjection(businessId, db=this.pool) {
    const [productsResult,stockResult,locationsResult,outletsResult] = await Promise.all([
      db.query(`SELECT p.id,p.name,p.code,p.price_minor AS "priceMinor",p.category,p.route_to AS "routeTo",p.stock_item_id AS "stockItemId",p.barcode,p.favorite,p.tax_class_id AS "taxClassId",p.inventory_type AS "inventoryType",p.recipe_yield AS "recipeYield",p.portion_volume AS "portionVolume",p.selling_mode AS "sellingMode",p.portions,p.modifiers,p.outlet_ids AS "outletIds",p.version FROM products p WHERE p.business_id=$1 AND p.archived_at IS NULL ORDER BY p.name,p.id`,[businessId]),
      db.query(`SELECT s.id,s.name,s.code,s.base_unit AS "baseUnit",s.barcode,s.barcode_aliases AS "barcodeAliases",s.scan_unit_quantity AS "scanUnitQuantity",s.reorder_level AS "reorderLevel",s.average_unit_cost_minor AS "averageUnitCostMinor",s.sealed_container_size AS "sealedContainerSize",s.version,COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'baseQuantity',p.base_quantity,'unitCostMinor',p.unit_cost_minor,'barcode',p.barcode) ORDER BY p.sort_order) FILTER (WHERE p.id IS NOT NULL),'[]'::jsonb) AS "purchasePackages",COALESCE((SELECT jsonb_object_agg(b.location_id::text,b.quantity) FROM inventory_location_balances b WHERE b.business_id=s.business_id AND b.stock_item_id=s.id),'{}'::jsonb) AS "currentStock",COALESCE((SELECT jsonb_object_agg(b.location_id::text,b.version) FROM inventory_location_balances b WHERE b.business_id=s.business_id AND b.stock_item_id=s.id),'{}'::jsonb) AS "balanceVersions",COALESCE((SELECT jsonb_object_agg(b.location_id::text,jsonb_build_object('sealedContainers',b.sealed_containers,'openQuantity',b.open_quantity)) FROM inventory_location_balances b WHERE b.business_id=s.business_id AND b.stock_item_id=s.id AND b.sealed_containers IS NOT NULL),'{}'::jsonb) AS "sealedOpenStock" FROM stock_items s LEFT JOIN stock_purchase_packages p ON p.business_id=s.business_id AND p.stock_item_id=s.id WHERE s.business_id=$1 AND s.archived_at IS NULL GROUP BY s.business_id,s.id ORDER BY s.name,s.id`,[businessId]),
      db.query(`SELECT id,name,code,location_type AS type,version FROM stock_locations WHERE business_id=$1 AND archived_at IS NULL ORDER BY name,id`,[businessId]),
      db.query(`SELECT id,name,default_stock_location_id AS "defaultStockLocationId",version,archived_at AS "archivedAt" FROM business_outlets WHERE business_id=$1 ORDER BY name,id`,[businessId]),
    ]);
    const recipes = await db.query(`SELECT product_id AS "productId",stock_item_id AS "stockItemId",quantity,unit FROM product_recipe_ingredients WHERE business_id=$1 ORDER BY product_id,stock_item_id`,[businessId]);
    const ingredientsByProduct = new Map();
    for(const ingredient of recipes.rows){const list=ingredientsByProduct.get(ingredient.productId)||[];list.push({...ingredient,quantity:Number(ingredient.quantity)});ingredientsByProduct.set(ingredient.productId,list);}
    const countResult=await db.query(`SELECT c.id,c.scope,c.location_id AS "locationId",l.name AS "locationName",c.selected_stock_item_ids AS "selectedStockItemIds",c.item_count AS "itemCount",c.matches,c.short,c.over,c.reason,c.source_command_id AS "sourceCommandId",c.created_by AS "createdBy",c.created_at AS "createdAt",COALESCE(jsonb_agg(jsonb_build_object('stockItemId',r.stock_item_id,'name',r.stock_item_name_snapshot,'baseUnit',r.base_unit_snapshot,'identitySnapshotAvailable',(r.stock_item_name_snapshot IS NOT NULL),'expectedQuantity',r.expected_quantity,'countedQuantity',r.counted_quantity,'variance',r.variance,'countedSealedContainers',r.counted_sealed_containers,'countedOpenQuantity',r.counted_open_quantity,'measurementMethod',r.measurement_method,'consumptionProductIds',r.consumption_product_ids) ORDER BY r.stock_item_id) FILTER(WHERE r.stock_item_id IS NOT NULL),'[]'::jsonb) AS rows FROM inventory_stock_counts c JOIN stock_locations l ON l.business_id=c.business_id AND l.id=c.location_id LEFT JOIN inventory_stock_count_rows r ON r.business_id=c.business_id AND r.count_id=c.id WHERE c.business_id=$1 GROUP BY c.business_id,c.id,l.name ORDER BY c.created_at DESC,c.id LIMIT 1000`,[businessId]);
    const movementResult=await db.query(`SELECT m.id,m.stock_item_id AS "stockItemId",s.name AS "stockItemName",s.base_unit AS "baseUnit",m.location_id AS "locationId",l.name AS "locationName",m.quantity_delta AS "quantityDelta",m.movement_type AS "movementType",m.reason,m.movement_type AS "reasonCode",m.source_command_id AS "sourceId",m.staff_id AS "actorUserId",m.occurred_at AS "occurredAt",(SELECT jsonb_build_object('before',e.before_state,'after',e.after_state,'baseUnit',e.base_unit,'unitCostMinor',e.average_unit_cost_minor,'containerSize',e.sealed_container_size) FROM inventory_movement_states e WHERE e.business_id=m.business_id AND e.movement_id=m.id) AS "restorationEvidence" FROM inventory_movements m JOIN stock_items s ON s.business_id=m.business_id AND s.id=m.stock_item_id JOIN stock_locations l ON l.business_id=m.business_id AND l.id=m.location_id WHERE m.business_id=$1 ORDER BY m.occurred_at DESC,m.id DESC LIMIT 1000`,[businessId]);
    const adjustmentResult=await db.query(`SELECT a.id,a.stock_item_id AS "stockItemId",s.name AS "stockItemName",a.location_id AS "locationId",l.name AS "locationName",a.before_quantity AS "beforeQuantity",a.after_quantity AS "afterQuantity",a.variance,a.before_sealed_containers AS "beforeSealedContainers",a.before_open_quantity AS "beforeOpenQuantity",a.after_sealed_containers AS "afterSealedContainers",a.after_open_quantity AS "afterOpenQuantity",a.reason,a.source_command_id AS "sourceCommandId",a.created_by AS "createdBy",a.created_at AS "createdAt" FROM inventory_stock_adjustments a JOIN stock_items s ON s.business_id=a.business_id AND s.id=a.stock_item_id JOIN stock_locations l ON l.business_id=a.business_id AND l.id=a.location_id WHERE a.business_id=$1 ORDER BY a.created_at DESC,a.id LIMIT 1000`,[businessId]);
    const batchResult=await db.query(`SELECT id,product_id AS "productId",output_stock_item_id AS "outputStockItemId",location_id AS "locationId",batch_count AS "batchCount",output_quantity AS "outputQuantity",ingredient_usage AS "ingredientUsage",total_cost_minor AS "totalCostMinor",reason,source_command_id AS "sourceCommandId",created_by AS "createdBy",created_at AS "createdAt" FROM inventory_batch_preparations WHERE business_id=$1 ORDER BY created_at DESC,id LIMIT 1000`,[businessId]);
    const reversals=await db.query(`SELECT reversal_command_id AS id,original_command_id AS "originalCommandId",original_movement_id AS "movementId",movement_ids AS "movementIds",reversal_command_id AS "sourceCommandId",reason,staff_id AS "createdBy",occurred_at AS "createdAt" FROM inventory_reversals WHERE business_id=$1 ORDER BY occurred_at DESC,reversal_command_id LIMIT 1000`,[businessId]);
    const receipts=await db.query(`SELECT ${receiptColumns} FROM inventory_receipts WHERE business_id=$1 ORDER BY received_at DESC,id LIMIT 1000`,[businessId]);
    const policies=await db.query(`SELECT ${policyColumns} FROM business_inventory_policy WHERE business_id=$1`,[businessId]);
    const orders=await orderProjections(db,businessId);
    const documents=await documentProjections(db,businessId);
    const tills=await tillProjections(db,businessId);
    const paymentAccounts=await paymentAccountProjections(db,businessId);
    const payments=await paymentProjections(db,businessId);
    const settings=await receiptSettingsProjections(db,businessId);
    const refunds=await refundProjections(db,businessId);
    const journals=await journalProjections(db,businessId);
    const closeDays=await closeDayProjections(db,businessId);
    const suppliers=await supplierProjections(db,businessId);
    const purchaseOrders=await purchaseOrderProjections(db,businessId);
    const goodsReceipts=await goodsReceiptProjections(db,businessId);
    const supplierPayables=await payableProjections(db,businessId);
    const supplierPayments=await supplierPaymentProjections(db,businessId);
    const supplierReturns=await supplierReturnProjections(db,businessId);
    const supplierCreditNotes=await supplierCreditNoteProjections(db,businessId);
    const supplierCredits=await supplierCreditBalanceProjections(db,businessId);
    const supplierCreditApplications=await supplierCreditApplicationProjections(db,businessId);
    const customers=await customerProjections(db,businessId);
    const customerCreditAccounts=await customerCreditAccountProjections(db,businessId);
    const customerCreditEntries=await customerCreditEntryProjections(db,businessId);
    const customerCreditReconciliations=await customerCreditReconciliationProjections(db,businessId);
    const customerCreditDiscrepancies=await customerCreditDiscrepancyProjections(db,businessId);
    return [
      ...customers,
      ...customerCreditAccounts,
      ...customerCreditEntries,
      ...customerCreditReconciliations,
      ...customerCreditDiscrepancies,
      ...suppliers,
      ...purchaseOrders,
      ...goodsReceipts,
      ...supplierPayables,
      ...supplierPayments,
      ...supplierReturns,
      ...supplierCreditNotes,
      ...supplierCredits,
      ...supplierCreditApplications,
      ...orders,
      ...documents,
      ...tills,
      ...paymentAccounts,
      ...payments,
      ...settings,
      ...refunds,
      ...journals,
      ...closeDays,
      ...receipts.rows.map(receiptProjection),
      ...policies.rows.map(policyProjection),
      ...reversals.rows.map(row=>({collection:'movementCorrections',id:row.id,version:1,data:{...row,createdAt:row.createdAt.toISOString()},archived:false})),
      ...productsResult.rows.map(row=>({collection:'products',id:row.id,version:Number(row.version),data:{...row,priceMinor:Number(row.priceMinor),recipeIngredients:ingredientsByProduct.get(row.id)||[]},archived:false})),
      ...stockResult.rows.map(row=>({collection:'stockItems',id:row.id,version:Number(row.version),data:{...row,scanUnitQuantity:Number(row.scanUnitQuantity),reorderLevel:Number(row.reorderLevel),averageUnitCostMinor:Number(row.averageUnitCostMinor),sealedContainerSize:row.sealedContainerSize===null?null:Number(row.sealedContainerSize),currentStock:row.currentStock,purchasePackages:row.purchasePackages.map(pack=>({...pack,baseQuantity:Number(pack.baseQuantity),unitCostMinor:Number(pack.unitCostMinor)}))},archived:false})),
      ...locationsResult.rows.map(row=>({collection:'stockLocations',id:row.id,version:Number(row.version),data:{name:row.name,code:row.code,type:row.type},archived:false})),
      ...outletsResult.rows.map(row=>({collection:'outlets',id:row.id,version:Number(row.version),data:{name:row.name,defaultStockLocationId:row.defaultStockLocationId},archived:row.archivedAt!==null})),
      ...countResult.rows.map(row=>({collection:'stockCounts',id:row.id,version:1,data:{scope:row.scope,locationId:row.locationId,locationName:row.locationName,selectedStockItemIds:row.selectedStockItemIds,itemCount:row.itemCount,matches:row.matches,short:row.short,over:row.over,reason:row.reason,status:'COMMITTED',sourceCommandId:row.sourceCommandId,createdBy:row.createdBy,createdAt:row.createdAt,rows:row.rows},archived:false})),
      ...movementResult.rows.map(row=>({collection:'stockMovements',id:row.id,version:1,data:{...row,occurredAt:row.occurredAt.toISOString(),quantityDelta:Number(row.quantityDelta)},archived:false})),
      ...adjustmentResult.rows.map(row=>({collection:'inventoryAdjustments',id:row.id,version:1,data:{...row,beforeQuantity:Number(row.beforeQuantity),afterQuantity:Number(row.afterQuantity),variance:Number(row.variance)},archived:false})),
      ...batchResult.rows.map(row=>({collection:'inventoryBatchPreparations',id:row.id,version:1,data:{...row,batchCount:Number(row.batchCount),outputQuantity:Number(row.outputQuantity),totalCostMinor:Number(row.totalCostMinor)},archived:false})),
    ];
  }

  async catalogBootstrap(businessId){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const {rows}=await client.query('SELECT cursor FROM business_change_cursors WHERE business_id=$1',[businessId]);
      const records=await this.catalogProjection(businessId,client);
      records.push(...await staffProjections(client,businessId));
      records.push(...await deviceProjections(client,businessId));
      await client.query('COMMIT');return {cursor:Number(rows[0]?.cursor??0),records};
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }

  async createCatalogBootstrapSnapshot({snapshotId,businessId,staffId,deviceId,sessionId,authorizationHash,manifest,records,createdAt,expiresAt}){
    return this.transaction(async tx=>{
      await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`api-bootstrap:${businessId}:${sessionId}`]);
      await tx.client.query('DELETE FROM api_business_bootstrap_snapshots WHERE expires_at<=$1',[createdAt]);
      await tx.client.query(`DELETE FROM api_business_bootstrap_snapshots WHERE snapshot_id IN (SELECT snapshot_id FROM api_business_bootstrap_snapshots WHERE business_id=$1 AND session_id=$2 ORDER BY created_at DESC,snapshot_id OFFSET 3)`,[businessId,sessionId]);
      await tx.client.query(`INSERT INTO api_business_bootstrap_snapshots(snapshot_id,business_id,staff_id,device_id,session_id,authorization_hash,schema_version,high_water_cursor,record_count,manifest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,[snapshotId,businessId,staffId,deviceId,sessionId,authorizationHash,manifest.schemaVersion,manifest.highWaterCursor,manifest.recordCount,JSON.stringify(manifest),createdAt,expiresAt]);
      for(let offset=0;offset<records.length;offset+=500){
        const batch=records.slice(offset,offset+500).map((projection,index)=>({ordinal:offset+index,collection:projection.collection,recordId:projection.id,projection}));
        await tx.client.query(`INSERT INTO api_business_bootstrap_snapshot_records(snapshot_id,ordinal,collection,record_id,projection) SELECT $1,(item->>'ordinal')::integer,item->>'collection',item->>'recordId',item->'projection' FROM jsonb_array_elements($2::jsonb) AS item`,[snapshotId,JSON.stringify(batch)]);
      }
      return {snapshotId,recordCount:records.length};
    });
  }

  async catalogBootstrapPage({snapshotId,businessId,staffId,deviceId,sessionId,authorizationHash,after,at}){
    const {rows:metadataRows}=await this.pool.query(`SELECT manifest,expires_at AS "expiresAt" FROM api_business_bootstrap_snapshots WHERE snapshot_id=$1 AND business_id=$2 AND staff_id=$3 AND device_id=$4 AND session_id=$5 AND authorization_hash=$6`,[snapshotId,businessId,staffId,deviceId,sessionId,authorizationHash]);
    const metadata=metadataRows[0];if(!metadata||metadata.expiresAt<=at)return null;
    const manifest=typeof metadata.manifest==='string'?JSON.parse(metadata.manifest):metadata.manifest;
    if(!Number.isSafeInteger(after)||after<0||after>=manifest.recordCount||after%manifest.pageSize!==0)return null;
    const pageIndex=after/manifest.pageSize,{rows}=await this.pool.query(`SELECT ordinal,projection FROM api_business_bootstrap_snapshot_records WHERE snapshot_id=$1 AND ordinal >= $2 AND ordinal < $3 ORDER BY ordinal`,[snapshotId,after,Math.min(after+manifest.pageSize,manifest.recordCount)]);
    const records=rows.map(row=>typeof row.projection==='string'?JSON.parse(row.projection):row.projection),nextOrdinal=after+records.length;
    if(records.length!==Math.min(manifest.pageSize,manifest.recordCount-after))throw new Error('Stored API bootstrap page is incomplete.');
    return {snapshotId,afterOrdinal:after,nextOrdinal,hasMore:nextOrdinal<manifest.recordCount,pageIndex,sha256:manifest.pageHashes[pageIndex],records};
  }

  async authenticateSession(tokenHash, deviceId, now = new Date()) {
    const {rows} = await this.pool.query(`
      SELECT s.business_id AS "businessId", s.staff_id AS "staffId", d.id AS "deviceId",
             COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
      FROM api_staff_sessions s
      JOIN api_access_tokens a ON a.session_id=s.id AND a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>$3
      JOIN api_enrolled_devices d ON d.business_id = s.business_id AND d.staff_id = s.staff_id AND d.id = $2
      LEFT JOIN api_staff_permissions p ON p.business_id = s.business_id AND p.staff_id = s.staff_id
      JOIN api_staff_profiles f ON f.business_id=s.business_id AND f.staff_id=s.staff_id AND f.active AND NOT f.must_change_password
      WHERE s.revoked_at IS NULL AND s.expires_at > $3 AND s.device_id=d.id
        AND d.revoked_at IS NULL
      GROUP BY s.business_id, s.staff_id, d.id
    `, [tokenHash, deviceId, now]);
    return rows[0] ?? null;
  }

  async authenticateStaffSession(tokenHash, now = new Date()) {
    const {rows} = await this.pool.query(`
      SELECT s.business_id AS "businessId", s.staff_id AS "staffId",s.id AS "sessionId",d.id AS "deviceId",f.must_change_password AS "mustChangePassword",
             COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
      FROM api_staff_sessions s
      JOIN api_access_tokens a ON a.session_id=s.id AND a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>$2
      JOIN api_staff_profiles f ON f.business_id=s.business_id AND f.staff_id=s.staff_id AND f.active
      LEFT JOIN api_enrolled_devices d ON d.business_id=s.business_id AND d.id=s.device_id AND d.revoked_at IS NULL
      LEFT JOIN api_staff_permissions p ON p.business_id = s.business_id AND p.staff_id = s.staff_id
      WHERE s.revoked_at IS NULL AND s.expires_at > $2
      GROUP BY s.business_id, s.staff_id,s.id,d.id,f.must_change_password
    `, [tokenHash, now]);
    return rows[0] ?? null;
  }

  async ownSessions({businessId,staffId,currentSessionId,at=new Date()}) {
    const {rows}=await this.pool.query(`SELECT s.id AS "sessionId",s.device_id AS "deviceId",s.created_at AS "createdAt",s.expires_at AS "expiresAt",s.revoked_at AS "revokedAt",(s.id=$3) AS current,(d.revoked_at IS NOT NULL) AS "deviceRevoked" FROM api_staff_sessions s LEFT JOIN api_enrolled_devices d ON d.business_id=s.business_id AND d.id=s.device_id WHERE s.business_id=$1 AND s.staff_id=$2 ORDER BY s.created_at DESC,s.id DESC LIMIT 100`,[businessId,staffId,currentSessionId]);
    return rows.map(row=>({...row,createdAt:row.createdAt.toISOString(),expiresAt:row.expiresAt.toISOString(),revokedAt:row.revokedAt?.toISOString()??null,expired:row.expiresAt<=at}));
  }

  async rotateRefreshToken({expectedSessionId,tokenHash,nextRefreshTokenId,nextRefreshTokenHash,nextRefreshExpiresAt,nextAccessTokenId,nextAccessTokenHash,nextAccessExpiresAt,at}){
    return this.transaction(async tx=>{
      const {rows:located}=await tx.client.query('SELECT t.id AS "tokenId",t.family_id AS "familyId",f.session_id AS "sessionId" FROM api_refresh_tokens t JOIN api_refresh_families f ON f.id=t.family_id WHERE t.token_hash=$1 AND f.session_id=$2',[tokenHash,expectedSessionId]);
      const location=located[0];if(!location)return {kind:'INVALID'};
      const {rows:sessions}=await tx.client.query('SELECT id AS "sessionId",revoked_at AS "sessionRevokedAt",device_id AS "deviceId",business_id AS "businessId",staff_id AS "staffId" FROM api_staff_sessions WHERE id=$1 FOR UPDATE',[location.sessionId]);
      const {rows:families}=await tx.client.query('SELECT id AS "familyId",expires_at AS "familyExpiresAt",revoked_at AS "familyRevokedAt" FROM api_refresh_families WHERE id=$1 FOR UPDATE',[location.familyId]);
      const {rows:tokens}=await tx.client.query('SELECT id AS "tokenId",used_at AS "usedAt",rotated_to_token_id AS "rotatedToTokenId",revoked_at AS "tokenRevokedAt",expires_at AS "tokenExpiresAt" FROM api_refresh_tokens WHERE id=$1 FOR UPDATE',[location.tokenId]);
      const session=sessions[0],family=families[0],token=tokens[0];if(!session||!family||!token)return {kind:'INVALID'};
      const {rows:profiles}=await tx.client.query('SELECT active AS "staffActive",must_change_password AS "mustChangePassword",display_name AS "displayName" FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[session.businessId,session.staffId]);
      const {rows:devices}=session.deviceId?await tx.client.query('SELECT revoked_at AS "deviceRevokedAt" FROM api_enrolled_devices WHERE business_id=$1 AND id=$2',[session.businessId,session.deviceId]):{rows:[{deviceRevokedAt:null}]};
      const row={...token,...family,...session,...profiles[0],...(devices[0]||{})};
      const retryWindow=row.usedAt&&at.getTime()>=row.usedAt.getTime()&&at.getTime()-row.usedAt.getTime()<=30_000;
      if(row.usedAt&&!retryWindow&&!row.familyRevokedAt&&!row.sessionRevokedAt){
        await tx.client.query('UPDATE api_refresh_families SET revoked_at=$2 WHERE id=$1 AND revoked_at IS NULL',[row.familyId,at]);
        await tx.client.query('UPDATE api_staff_sessions SET revoked_at=$2 WHERE id=$1 AND revoked_at IS NULL',[row.sessionId,at]);
        const commandId=randomUUID();await tx.client.query(`INSERT INTO api_session_events(business_id,id,session_id,staff_id,event_type,before_state,after_state,command_id,actor_staff_id,actor_device_id,occurred_at) VALUES($1,$2,$3,$4,'REVOKED',$5::jsonb,$6::jsonb,$7,$4,NULL,$8)`,[row.businessId,randomUUID(),row.sessionId,row.staffId,JSON.stringify({revokedAt:null,cause:'REFRESH_TOKEN_REPLAY'}),JSON.stringify({revokedAt:at.toISOString(),cause:'REFRESH_TOKEN_REPLAY'}),commandId,at]);
        return {kind:'REPLAY'};
      }
      if((row.usedAt&&!retryWindow)||row.tokenRevokedAt||row.familyRevokedAt||row.sessionRevokedAt||row.tokenExpiresAt<=at||row.familyExpiresAt<=at||!row.staffActive||row.deviceRevokedAt)return {kind:'INVALID'};
      const accessExpiry=new Date(Math.min(nextAccessExpiresAt.getTime(),row.familyExpiresAt.getTime()));let refreshTokenId=nextRefreshTokenId,refreshExpiry=new Date(Math.min(nextRefreshExpiresAt.getTime(),row.familyExpiresAt.getTime()));
      if(row.usedAt){
        if(!row.rotatedToTokenId)return {kind:'INVALID'};
        const {rows:successors}=await tx.client.query('SELECT id AS "tokenId",expires_at AS "tokenExpiresAt",revoked_at AS "tokenRevokedAt" FROM api_refresh_tokens WHERE id=$1 AND family_id=$2 FOR UPDATE',[row.rotatedToTokenId,row.familyId]);
        const successor=successors[0];if(!successor||successor.tokenRevokedAt||successor.tokenExpiresAt<=at)return {kind:'INVALID'};
        refreshTokenId=successor.tokenId;refreshExpiry=successor.tokenExpiresAt;
      }else{
        await tx.client.query('INSERT INTO api_refresh_tokens(id,family_id,token_hash,issued_at,expires_at) VALUES($1,$2,$3,$4,$5)',[nextRefreshTokenId,row.familyId,nextRefreshTokenHash,at,refreshExpiry]);
        await tx.client.query('UPDATE api_refresh_tokens SET used_at=$2,rotated_to_token_id=$3 WHERE id=$1 AND used_at IS NULL',[row.tokenId,at,nextRefreshTokenId]);
      }
      await tx.client.query('INSERT INTO api_access_tokens(id,business_id,staff_id,session_id,token_hash,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[nextAccessTokenId,row.businessId,row.staffId,row.sessionId,nextAccessTokenHash,at,accessExpiry]);
      const {rows:permissionRows}=await tx.client.query('SELECT permission FROM api_staff_permissions WHERE business_id=$1 AND staff_id=$2 ORDER BY permission',[row.businessId,row.staffId]);
      return {kind:row.usedAt?'RETRIED':'ROTATED',refreshTokenId,sessionId:row.sessionId,businessId:row.businessId,staffId:row.staffId,displayName:row.displayName,permissions:permissionRows.map(item=>item.permission),mustChangePassword:row.mustChangePassword,accessExpiresAt:accessExpiry,refreshExpiresAt:refreshExpiry};
    });
  }

  async revokeOwnSession({businessId,staffId,sessionId,currentSessionId,actorDeviceId,at}) {
    return this.transaction(async tx=>{
      const {rows}=await tx.client.query('SELECT id,device_id AS "deviceId",created_at AS "createdAt",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM api_staff_sessions WHERE business_id=$1 AND staff_id=$2 AND id=$3 FOR UPDATE',[businessId,staffId,sessionId]);
      const prior=rows[0];if(!prior)return false;
      if(sessionId===currentSessionId){const error=new Error('Use Sign out to end the current session.');error.status=409;error.code='CURRENT_SESSION_REVOKE';throw error;}
      if(prior.revokedAt)return true;
      await tx.client.query('UPDATE api_staff_sessions SET revoked_at=$4 WHERE business_id=$1 AND staff_id=$2 AND id=$3 AND revoked_at IS NULL',[businessId,staffId,sessionId,at]);
      await tx.client.query('UPDATE api_refresh_families SET revoked_at=$2 WHERE session_id=$1 AND revoked_at IS NULL',[sessionId,at]);
      const commandId=randomUUID();await tx.client.query(`INSERT INTO api_session_events(business_id,id,session_id,staff_id,event_type,before_state,after_state,command_id,actor_staff_id,actor_device_id,occurred_at) VALUES($1,$2,$3,$4,'REVOKED',$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,[businessId,randomUUID(),sessionId,staffId,JSON.stringify({revokedAt:null,deviceId:prior.deviceId}),JSON.stringify({revokedAt:at.toISOString(),deviceId:prior.deviceId}),commandId,staffId,actorDeviceId,at]);
      return true;
    });
  }

  async authenticatePassword({loginName,password,at,verifyPassword,sessionId,accessTokenId,accessTokenHash,accessExpiresAt,refreshFamilyId,refreshTokenId,refreshTokenHash,refreshExpiresAt,sessionExpiresAt}) {
    return this.transaction(async tx=>{
      const {rows}=await tx.client.query(`SELECT business_id AS "businessId",staff_id AS "staffId",display_name AS "displayName",credential_hash AS "credentialHash",failed_login_count AS "failedLoginCount",locked_until AS "lockedUntil",must_change_password AS "mustChangePassword" FROM api_staff_profiles WHERE lower(login_name)=lower($1) AND active FOR UPDATE`,[loginName]);
      const staff=rows[0];
      // Do equivalent work for unknown usernames to reduce account enumeration timing differences.
      const valid=staff&&!staff.lockedUntil&&await verifyPassword(password,staff.credentialHash);
      if(!valid){
        if(staff){const failures=Number(staff.failedLoginCount)+1;await tx.client.query('UPDATE api_staff_profiles SET failed_login_count=$3,locked_until=$4,updated_at=$5 WHERE business_id=$1 AND staff_id=$2',[staff.businessId,staff.staffId,failures,failures>=5?new Date(at.getTime()+15*60_000):null,at]);}
        return null;
      }
      await tx.client.query('UPDATE api_staff_profiles SET failed_login_count=0,locked_until=NULL,updated_at=$3 WHERE business_id=$1 AND staff_id=$2',[staff.businessId,staff.staffId,at]);
      await tx.client.query('INSERT INTO api_staff_sessions(id,business_id,staff_id,token_hash,created_at,expires_at,device_id) VALUES($1,$2,$3,$4,$5,$6,NULL)',[sessionId,staff.businessId,staff.staffId,accessTokenHash,at,sessionExpiresAt]);
      await tx.client.query('INSERT INTO api_access_tokens(id,business_id,staff_id,session_id,token_hash,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[accessTokenId,staff.businessId,staff.staffId,sessionId,accessTokenHash,at,accessExpiresAt]);
      await tx.client.query('INSERT INTO api_refresh_families(id,business_id,staff_id,session_id,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[refreshFamilyId,staff.businessId,staff.staffId,sessionId,at,sessionExpiresAt]);
      await tx.client.query('INSERT INTO api_refresh_tokens(id,family_id,token_hash,issued_at,expires_at) VALUES($1,$2,$3,$4,$5)',[refreshTokenId,refreshFamilyId,refreshTokenHash,at,refreshExpiresAt]);
      const {rows:permissions}=await tx.client.query('SELECT permission FROM api_staff_permissions WHERE business_id=$1 AND staff_id=$2 ORDER BY permission',[staff.businessId,staff.staffId]);
      return {sessionId,businessId:staff.businessId,staffId:staff.staffId,displayName:staff.displayName,permissions:permissions.map(row=>row.permission),expiresAt:accessExpiresAt.toISOString(),mustChangePassword:staff.mustChangePassword};
    });
  }

  async checkLoginThrottle(bucketHashes,at){
    const {rows}=await this.pool.query('SELECT bucket_hash FROM api_auth_attempts WHERE bucket_hash=ANY($1::char(64)[]) AND blocked_until>$2',[bucketHashes,at]);return rows.length===0;
  }
  async recordLoginFailure(bucketHashes,at){
    await this.transaction(async tx=>{for(const bucketHash of bucketHashes){await tx.client.query(`INSERT INTO api_auth_attempts(bucket_hash,attempt_count,window_started_at,blocked_until) VALUES($1,1,$2,NULL) ON CONFLICT(bucket_hash) DO UPDATE SET attempt_count=CASE WHEN api_auth_attempts.window_started_at<$2-interval '15 minutes' THEN 1 ELSE api_auth_attempts.attempt_count+1 END,window_started_at=CASE WHEN api_auth_attempts.window_started_at<$2-interval '15 minutes' THEN $2 ELSE api_auth_attempts.window_started_at END,blocked_until=CASE WHEN (CASE WHEN api_auth_attempts.window_started_at<$2-interval '15 minutes' THEN 1 ELSE api_auth_attempts.attempt_count+1 END)>=20 THEN $2+interval '15 minutes' ELSE NULL END`,[bucketHash,at]);}});
  }
  async clearLoginFailures(bucketHashes){await this.pool.query('DELETE FROM api_auth_attempts WHERE bucket_hash=ANY($1::char(64)[])',[bucketHashes]);}

  async issueOfflineGrant({grantId,businessId,deviceId,staffId,allowedCommands,maxCommands,issuedAt,expiresAt,policyVersion,keyVersion,signature,scope}){
    await this.transaction(async tx=>{
      await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`offline-grant:${businessId}:${deviceId}:${staffId}`]);
      const {rows}=await tx.client.query('SELECT count(*)::int AS count FROM offline_grants WHERE business_id=$1 AND device_id=$2 AND staff_id=$3 AND issued_at>$4',[businessId,deviceId,staffId,new Date(issuedAt.getTime()-60*60_000)]);
      if(rows[0].count>=6){const error=new Error('Too many offline grants were issued for this device.');error.status=429;error.code='RATE_LIMITED';throw error}
      await tx.client.query(`INSERT INTO offline_grants(id,business_id,device_id,staff_id,allowed_commands,max_commands,issued_at,expires_at,policy_version,key_version,signature,scope)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,[grantId,businessId,deviceId,staffId,allowedCommands,maxCommands,issuedAt,expiresAt,policyVersion,keyVersion,signature,JSON.stringify(scope)]);
    });
  }

  async createInitialAdmin({setupSecretHash,expectedSetupSecretHash,businessId,businessName,staffId,loginName,displayName,credentialHash,permissions,at}) {
    if(setupSecretHash!==expectedSetupSecretHash)return false;
    return this.transaction(async tx=>{
      await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['serveos:initial-admin']);
      const {rows}=await tx.client.query('SELECT count(*)::int AS count FROM api_staff_profiles');
      if(rows[0].count!==0)return false;
      await tx.client.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,businessName]);
      await tx.client.query('INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password,created_at,updated_at) VALUES($1,$2,$3,$4,\'Admin\',$5,true,$6,$6)',[businessId,staffId,loginName,displayName,credentialHash,at]);
      for(const permission of permissions)await tx.client.query('INSERT INTO api_staff_permissions(business_id,staff_id,permission) VALUES($1,$2,$3)',[businessId,staffId,permission]);
      await tx.client.query("INSERT INTO business_entity_versions(business_id,entity_type,entity_id,version) VALUES($1,'employees',$2,1)",[businessId,staffId]);
      return true;
    });
  }

  async initialSetupComplete(){
    const {rows}=await this.pool.query("SELECT to_regclass('public.api_staff_profiles') IS NOT NULL AS schema_ready");
    if(!rows[0]?.schema_ready)return false;
    const result=await this.pool.query('SELECT EXISTS(SELECT 1 FROM api_staff_profiles) AS complete');return result.rows[0]?.complete===true;
  }

  async changePassword({businessId,staffId,currentSessionId,actorDeviceId,currentHash,newHash,at}) {
    return this.transaction(async tx=>{
      const {rows:changed}=await tx.client.query('UPDATE api_staff_profiles SET credential_hash=$4,must_change_password=false,failed_login_count=0,locked_until=NULL,updated_at=$5 WHERE business_id=$1 AND staff_id=$2 AND credential_hash=$3 RETURNING staff_id',[businessId,staffId,currentHash,newHash,at]);
      if(!changed.length)return false;
      const {rows:sessions}=await tx.client.query('SELECT id,device_id AS "deviceId" FROM api_staff_sessions WHERE business_id=$1 AND staff_id=$2 AND id<>$3 AND revoked_at IS NULL FOR UPDATE',[businessId,staffId,currentSessionId]);
      if(!sessions.length)return true;
      await tx.client.query('UPDATE api_staff_sessions SET revoked_at=$4 WHERE business_id=$1 AND staff_id=$2 AND id<>$3 AND revoked_at IS NULL',[businessId,staffId,currentSessionId,at]);
      const revokedSessionIds=sessions.map(session=>session.id);await tx.client.query('UPDATE api_refresh_families SET revoked_at=$2 WHERE session_id=ANY($1::uuid[]) AND revoked_at IS NULL',[revokedSessionIds,at]);
      for(const session of sessions){const commandId=randomUUID();await tx.client.query(`INSERT INTO api_session_events(business_id,id,session_id,staff_id,event_type,before_state,after_state,command_id,actor_staff_id,actor_device_id,occurred_at) VALUES($1,$2,$3,$4,'REVOKED',$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,[businessId,randomUUID(),session.id,staffId,JSON.stringify({revokedAt:null,deviceId:session.deviceId}),JSON.stringify({revokedAt:at.toISOString(),deviceId:session.deviceId,cause:'PASSWORD_CHANGED'}),commandId,staffId,actorDeviceId||null,at]);}
      return true;
    });
  }

  async staffCredential(businessId,staffId){
    const {rows}=await this.pool.query('SELECT display_name AS "displayName",credential_hash AS "credentialHash",must_change_password AS "mustChangePassword" FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2 AND active',[businessId,staffId]);return rows[0]??null;
  }

  async revokeSession(tokenHash,at=new Date()) {
    return this.transaction(async tx=>{
      const {rows}=await tx.client.query('SELECT s.id,s.business_id AS "businessId",s.staff_id AS "staffId",s.device_id AS "deviceId",s.revoked_at AS "revokedAt" FROM api_staff_sessions s WHERE s.token_hash=$1 OR s.id IN (SELECT session_id FROM api_access_tokens WHERE token_hash=$1) FOR UPDATE',[tokenHash]);
      if(!rows.length)return {revoked:false};
      const sessionIds=rows.map(row=>row.id);await tx.client.query('UPDATE api_staff_sessions SET revoked_at=$2 WHERE id=ANY($1::uuid[]) AND revoked_at IS NULL',[sessionIds,at]);await tx.client.query('UPDATE api_refresh_families SET revoked_at=$2 WHERE session_id=ANY($1::uuid[]) AND revoked_at IS NULL',[sessionIds,at]);
      for(const session of rows)if(!session.revokedAt){const commandId=randomUUID();await tx.client.query(`INSERT INTO api_session_events(business_id,id,session_id,staff_id,event_type,before_state,after_state,command_id,actor_staff_id,actor_device_id,occurred_at) VALUES($1,$2,$3,$4,'REVOKED',$5::jsonb,$6::jsonb,$7,$4,$8,$9)`,[session.businessId,randomUUID(),session.id,session.staffId,JSON.stringify({revokedAt:null}),JSON.stringify({revokedAt:at.toISOString(),cause:'LOGOUT'}),commandId,session.deviceId,at]);}
      return {revoked:true,sessionId:rows[0].id};
    });
  }

  async issueDeviceEnrollmentChallenge({challengeId, challenge, businessId, staffId, issuedAt, expiresAt}) {
    const {rows: recent} = await this.pool.query(`
      SELECT count(*)::int AS count FROM api_device_enrollment_challenges
      WHERE business_id = $1 AND staff_id = $2 AND issued_at > $3
    `, [businessId, staffId, new Date(issuedAt.getTime() - 60 * 60_000)]);
    if (recent[0].count >= 10) {
      const error = new Error('Too many device enrollment challenges were requested.');
      error.status = 429;
      error.code = 'RATE_LIMITED';
      throw error;
    }
    await this.pool.query(`
      INSERT INTO api_device_enrollment_challenges (id, challenge, business_id, staff_id, issued_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [challengeId, challenge, businessId, staffId, issuedAt, expiresAt]);
    return {challengeId, challenge, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString()};
  }

  async deviceEnrollmentChallenge(challengeId, businessId, staffId) {
    const {rows} = await this.pool.query(`
      SELECT id AS "challengeId", challenge, business_id AS "businessId", staff_id AS "staffId",
             expires_at AS "expiresAt", consumed_at AS "consumedAt"
      FROM api_device_enrollment_challenges
      WHERE id = $1 AND business_id = $2 AND staff_id = $3
    `, [challengeId, businessId, staffId]);
    return rows[0] ?? null;
  }

  async enrollDevice({challengeId, businessId, staffId, deviceId, publicKey, sessionId, at}) {
    return this.transaction(async tx => {
      const {rows} = await tx.client.query(`
        SELECT challenge, expires_at AS "expiresAt", consumed_at AS "consumedAt"
        FROM api_device_enrollment_challenges
        WHERE id = $1 AND business_id = $2 AND staff_id = $3
        FOR UPDATE
      `, [challengeId, businessId, staffId]);
      const challenge = rows[0];
      if (!challenge || challenge.consumedAt || new Date(challenge.expiresAt) <= at) {
        const error = new Error('Enrollment challenge is expired or already used.');
        error.status = 409;
        error.code = 'ENROLLMENT_CHALLENGE_INVALID';
        throw error;
      }
      const staff=await tx.client.query('SELECT active FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2 FOR SHARE',[businessId,staffId]);
      if(!staff.rows[0]?.active){const error=new Error('An active API staff profile is required to enroll a device.');error.status=403;error.code='STAFF_INACTIVE';throw error;}
      const {rows:deviceRows}=await tx.client.query(`
        INSERT INTO api_enrolled_devices (id, business_id, staff_id, public_key, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (business_id,id) DO NOTHING
        RETURNING id
      `, [deviceId, businessId, staffId, JSON.stringify(publicKey), at]);
      const created=deviceRows.length===1;
      if(!created){const existing=await tx.client.query('SELECT id FROM api_enrolled_devices WHERE business_id=$1 AND id=$2 AND staff_id=$3 AND public_key=$4::jsonb AND revoked_at IS NULL FOR UPDATE',[businessId,deviceId,staffId,JSON.stringify(publicKey)]);if(!existing.rows.length){const error=new Error('This device ID is already enrolled to another identity or has been revoked.');error.status=409;error.code='DEVICE_ID_UNAVAILABLE';throw error;}}
      const {rowCount}=await tx.client.query('UPDATE api_staff_sessions SET device_id=$2 WHERE id=$1 AND business_id=$3 AND staff_id=$4 AND device_id IS NULL AND revoked_at IS NULL AND expires_at>$5',[sessionId,deviceId,businessId,staffId,at]);
      if(rowCount!==1){const error=new Error('The API session could not be bound to this device.');error.status=409;error.code='SESSION_BINDING_FAILED';throw error;}
      await tx.client.query('UPDATE api_device_enrollment_challenges SET consumed_at = $2 WHERE id = $1', [challengeId, at]);
      if(created){
        await tx.client.query("INSERT INTO business_entity_versions(business_id,entity_type,entity_id,version) VALUES($1,'enrolledDevices',$2,1) ON CONFLICT(business_id,entity_type,entity_id) DO NOTHING",[businessId,deviceId]);
        const [record]=await deviceProjections(tx.client,businessId).then(records=>records.filter(item=>item.id===deviceId));
        if(!record)throw new Error('Newly enrolled device projection could not be created.');
        const commandId=randomUUID(),cursor=await tx.nextChangeCursor(businessId),occurredAt=at.toISOString();
        await tx.client.query(`INSERT INTO api_device_events(business_id,id,device_id,device_version,event_type,before_state,after_state,reason,command_id,actor_staff_id,occurred_at) VALUES($1,$2,$3,1,'ENROLLED',NULL,$4::jsonb,'Device enrolled by its authenticated staff member',$5,$6,$7)`,[businessId,randomUUID(),deviceId,JSON.stringify(record.data),commandId,staffId,at]);
        await tx.insertAudit({businessId,commandId,name:'DEVICE_ENROLLED',actor:{staffId,deviceId},at});
        await tx.insertChange({businessId,cursor,commandId,name:'device.enroll',result:{sequence:cursor,commandId,actorId:staffId,deviceId,occurredAt,records:[record]},at});
      }
      return {id: deviceId, businessId, staffId, publicKey, createdAt: at.toISOString()};
    });
  }
}

class PostgresTransaction {
  constructor(client) { this.client = client; this.balanceChanges = new Map(); }

  async getCommand(businessId, commandId) {
    const {rows} = await this.client.query(
      'SELECT payload_hash AS "payloadHash",staff_id AS "staffId",device_id AS "deviceId",status,outcome,error FROM api_commands WHERE business_id = $1 AND command_id = $2 FOR UPDATE',
      [businessId, commandId],
    );
    return rows[0] ?? null;
  }

  async lockCommandKey(businessId, commandId) {
    await this.client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${businessId}:${commandId}`],
    );
  }

  async lockInventoryCatalog(businessId) {
    await this.client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`inventory-catalog:${businessId}`],
    );
  }

  async assertExpectedVersions(businessId, expectedVersions) {
    for (const [key, expected] of Object.entries(expectedVersions).sort(([a], [b]) => a.localeCompare(b))) {
      const separator = key.indexOf(':');
      if (separator <= 0 || separator === key.length - 1 || !Number.isSafeInteger(expected) || expected < 0) {
        const error = new Error(`Invalid expected version entry: ${key}`);
        error.status = 400;
        error.code = 'VALIDATION_FAILED';
        throw error;
      }
      const entityType = key.slice(0, separator);
      const entityId = key.slice(separator + 1);
      await this.client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`entity:${businessId}:${entityType}:${entityId}`],
      );
      const {rows} = await this.client.query(
        'SELECT version FROM business_entity_versions WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3 FOR UPDATE',
        [businessId, entityType, entityId],
      );
      const actual = rows.length ? Number(rows[0].version) : 0;
      if (actual !== expected) {
        const error = new Error('A resource changed after this workflow was reviewed. Refresh it and try again.');
        error.status = 409;
        error.code = 'VERSION_CONFLICT';
        error.details = {entityType, entityId, expectedVersion: expected, currentVersion: actual};
        throw error;
      }
    }
  }

  async bumpEntityVersion(businessId, entityType, entityId, expectedVersion) {
    await this.client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`entity:${businessId}:${entityType}:${entityId}`],
    );
    const {rows} = await this.client.query(
      'SELECT version FROM business_entity_versions WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3 FOR UPDATE',
      [businessId, entityType, entityId],
    );
    const current = rows.length ? Number(rows[0].version) : 0;
    if (expectedVersion !== undefined && current !== expectedVersion) {
      const error = new Error('A resource changed after this workflow was reviewed. Refresh it and try again.');
      error.status = 409;
      error.code = 'VERSION_CONFLICT';
      error.details = {entityType, entityId, expectedVersion, currentVersion: current};
      throw error;
    }
    const next = current + 1;
    await this.client.query(`
      INSERT INTO business_entity_versions (business_id, entity_type, entity_id, version)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (business_id, entity_type, entity_id) DO UPDATE SET version = EXCLUDED.version
    `, [businessId, entityType, entityId, next]);
    return next;
  }

  async insertCatalogItem(item) {
    await this.client.query(`
      INSERT INTO catalog_items
        (business_id, id, category_id, name, sku, base_price_minor, currency, track_inventory, version, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
    `, [item.businessId, item.id, item.categoryId, item.name, item.sku, item.basePriceMinor, item.currency, item.trackInventory, item.version, item.staffId]);
  }

  async requireStockLocation(businessId, locationId) {
    const {rows} = await this.client.query(
      'SELECT 1 FROM stock_locations WHERE business_id = $1 AND id = $2 AND archived_at IS NULL FOR SHARE',
      [businessId, locationId],
    );
    return rows.length > 0;
  }

  async saveStockLocation({businessId,id,name,code,type,version}){
    await this.client.query(`INSERT INTO stock_locations(business_id,id,name,code,location_type,version) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(business_id,id) DO UPDATE SET name=EXCLUDED.name,code=EXCLUDED.code,location_type=EXCLUDED.location_type,version=EXCLUDED.version,archived_at=NULL`,[businessId,id,name,code,type,version]);
  }

  async stockBalance(businessId,stockItemId,locationId){
    const {rows}=await this.client.query('SELECT version,quantity,sealed_containers AS "sealedContainers",open_quantity AS "openQuantity" FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3 FOR UPDATE',[businessId,stockItemId,locationId]);const row=rows[0];return {version:Number(row?.version??0),quantity:Number(row?.quantity??0),sealedContainers:row?.sealedContainers===null||row?.sealedContainers===undefined?null:Number(row.sealedContainers),openQuantity:row?.openQuantity===null||row?.openQuantity===undefined?null:Number(row.openQuantity)};
  }

  async activeStockItemIds(businessId){const {rows}=await this.client.query('SELECT id FROM stock_items WHERE business_id=$1 AND archived_at IS NULL ORDER BY id',[businessId]);return rows.map(row=>row.id);}

  async stockItemDetails(businessId,stockItemId){const {rows}=await this.client.query('SELECT id,name,base_unit AS "baseUnit",sealed_container_size AS "sealedContainerSize",average_unit_cost_minor AS "averageUnitCostMinor",version FROM stock_items WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',[businessId,stockItemId]);if(!rows.length){const error=new Error('Stock item is missing or archived.');error.status=409;error.code='RESOURCE_CONFLICT';throw error}const row=rows[0];return {...row,sealedContainerSize:row.sealedContainerSize===null?null:Number(row.sealedContainerSize),averageUnitCostMinor:Number(row.averageUnitCostMinor),version:Number(row.version)};}

  async batchRecipeDetails(businessId,productId){const {rows}=await this.client.query(`SELECT id,name,inventory_type AS "inventoryType",stock_item_id AS "stockItemId",recipe_yield AS "recipeYield",version FROM products WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE`,[businessId,productId]);if(!rows.length){const error=new Error('Batch recipe is missing or archived.');error.status=409;error.code='RESOURCE_CONFLICT';throw error}const recipe=await this.client.query(`SELECT stock_item_id AS "stockItemId",quantity,unit FROM product_recipe_ingredients WHERE business_id=$1 AND product_id=$2 ORDER BY stock_item_id`,[businessId,productId]);const row=rows[0];return {...row,recipeYield:row.recipeYield===null?null:Number(row.recipeYield),version:Number(row.version),ingredients:recipe.rows.map(item=>({...item,quantity:Number(item.quantity)}))};}

  async totalStockQuantity(businessId,stockItemId){const {rows}=await this.client.query('SELECT COALESCE(sum(quantity),0) AS quantity FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2',[businessId,stockItemId]);return Number(rows[0].quantity);}
  async inventoryPolicy(businessId){
    const {rows}=await this.client.query(`SELECT ${policyColumns} FROM business_inventory_policy WHERE business_id=$1 FOR SHARE`,[businessId]);
    return rows[0]??{version:0,allowDirectReceipts:false,requireSupplierReference:true,requirePurchaseOrder:true};
  }
  async saveInventoryPolicy({businessId,allowDirectReceipts,requireSupplierReference,requirePurchaseOrder,version,staffId,at}){
    await this.client.query(`INSERT INTO business_inventory_policy(business_id,allow_direct_receipts,require_supplier_reference,require_purchase_order,version,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(business_id) DO UPDATE SET allow_direct_receipts=EXCLUDED.allow_direct_receipts,require_supplier_reference=EXCLUDED.require_supplier_reference,require_purchase_order=EXCLUDED.require_purchase_order,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[businessId,allowDirectReceipts,requireSupplierReference,requirePurchaseOrder,version,staffId,at]);
  }
  async insertInventoryReceipt({businessId,id,stockItemId,locationId,sourceKey,sourceDocument,pack,quantity,baseQuantity,totalCostMinor,unitCostMinor,beforeCost,afterCost,sealed,open,commandId,staffId,at,sourceLineId=null}){
    await this.client.query(`INSERT INTO inventory_receipts(business_id,id,stock_item_id,location_id,source_key,source_document,purchase_package_id,purchase_package_snapshot,quantity_received,base_quantity,total_cost_minor,unit_cost_minor,before_average_cost_minor,after_average_cost_minor,received_sealed_containers,received_open_quantity,source_command_id,received_by,received_at,source_line_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,[businessId,id,stockItemId,locationId,sourceKey,JSON.stringify(sourceDocument),pack?.id??null,pack?JSON.stringify(pack):null,quantity,baseQuantity,totalCostMinor,unitCostMinor,beforeCost,afterCost,sealed,open,commandId,staffId,at,sourceLineId]);
  }
  async inventoryReceiptProjection(businessId,id){
    const {rows}=await this.client.query(`SELECT ${receiptColumns} FROM inventory_receipts WHERE business_id=$1 AND id=$2`,[businessId,id]);
    return rows[0]?receiptProjection(rows[0]):null;
  }
  async updateStockCostAndVersion(businessId,stockItemId,averageUnitCostMinor,version){await this.client.query('UPDATE stock_items SET average_unit_cost_minor=$3,version=$4,updated_at=now() WHERE business_id=$1 AND id=$2',[businessId,stockItemId,averageUnitCostMinor,version]);}
  async insertBatchPreparation({businessId,id,productId,outputStockItemId,locationId,batchCount,outputQuantity,ingredientUsage,totalCostMinor,reason,commandId,staffId,at}){await this.client.query(`INSERT INTO inventory_batch_preparations(business_id,id,product_id,output_stock_item_id,location_id,batch_count,output_quantity,ingredient_usage,total_cost_minor,reason,source_command_id,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)`,[businessId,id,productId,outputStockItemId,locationId,batchCount,outputQuantity,JSON.stringify(ingredientUsage),totalCostMinor,reason,commandId,staffId,at]);}

  async productConsumptionIds(businessId,stockItemId){const {rows}=await this.client.query(`SELECT DISTINCT p.id FROM products p LEFT JOIN product_recipe_ingredients i ON i.business_id=p.business_id AND i.product_id=p.id WHERE p.business_id=$1 AND p.archived_at IS NULL AND (p.stock_item_id=$2 OR i.stock_item_id=$2 OR EXISTS(SELECT 1 FROM product_modifier_stock_refs m WHERE m.business_id=p.business_id AND m.product_id=p.id AND m.stock_item_id=$2)) ORDER BY p.id`,[businessId,stockItemId]);return rows.map(row=>row.id);}

  async stockRecordProjection(businessId,stockItemId){const {rows}=await this.client.query(`SELECT s.id,s.name,s.code,s.base_unit AS "baseUnit",s.barcode,s.barcode_aliases AS "barcodeAliases",s.scan_unit_quantity AS "scanUnitQuantity",s.reorder_level AS "reorderLevel",s.average_unit_cost_minor AS "averageUnitCostMinor",s.sealed_container_size AS "sealedContainerSize",s.version,COALESCE((SELECT jsonb_object_agg(b.location_id::text,b.quantity) FROM inventory_location_balances b WHERE b.business_id=s.business_id AND b.stock_item_id=s.id),'{}'::jsonb) AS "currentStock",COALESCE((SELECT jsonb_object_agg(b.location_id::text,b.version) FROM inventory_location_balances b WHERE b.business_id=s.business_id AND b.stock_item_id=s.id),'{}'::jsonb) AS "balanceVersions",COALESCE((SELECT jsonb_object_agg(b.location_id::text,jsonb_build_object('sealedContainers',b.sealed_containers,'openQuantity',b.open_quantity)) FROM inventory_location_balances b WHERE b.business_id=s.business_id AND b.stock_item_id=s.id AND b.sealed_containers IS NOT NULL),'{}'::jsonb) AS "sealedOpenStock",COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'baseQuantity',p.base_quantity,'unitCostMinor',p.unit_cost_minor,'barcode',p.barcode) ORDER BY p.sort_order) FROM stock_purchase_packages p WHERE p.business_id=s.business_id AND p.stock_item_id=s.id),'[]'::jsonb) AS "purchasePackages" FROM stock_items s WHERE s.business_id=$1 AND s.id=$2 AND s.archived_at IS NULL`,[businessId,stockItemId]);const row=rows[0];if(!row)return null;return {collection:'stockItems',id:row.id,version:Number(row.version),data:{...row,scanUnitQuantity:Number(row.scanUnitQuantity),reorderLevel:Number(row.reorderLevel),averageUnitCostMinor:Number(row.averageUnitCostMinor),sealedContainerSize:row.sealedContainerSize===null?null:Number(row.sealedContainerSize),purchasePackages:row.purchasePackages.map(pack=>({...pack,baseQuantity:Number(pack.baseQuantity),unitCostMinor:Number(pack.unitCostMinor)}))},archived:false};}

  async inventoryMovementProjection(businessId,movementId){const {rows}=await this.client.query(`SELECT m.id,m.stock_item_id AS "stockItemId",s.name AS "stockItemName",s.base_unit AS "baseUnit",m.location_id AS "locationId",l.name AS "locationName",m.quantity_delta AS "quantityDelta",m.movement_type AS "movementType",m.reason,m.movement_type AS "reasonCode",m.source_command_id AS "sourceId",m.staff_id AS "actorUserId",m.occurred_at AS "occurredAt",(SELECT jsonb_build_object('before',e.before_state,'after',e.after_state,'baseUnit',e.base_unit,'unitCostMinor',e.average_unit_cost_minor,'containerSize',e.sealed_container_size) FROM inventory_movement_states e WHERE e.business_id=m.business_id AND e.movement_id=m.id) AS "restorationEvidence" FROM inventory_movements m JOIN stock_items s ON s.business_id=m.business_id AND s.id=m.stock_item_id JOIN stock_locations l ON l.business_id=m.business_id AND l.id=m.location_id WHERE m.business_id=$1 AND m.id=$2`,[businessId,movementId]);const row=rows[0];return row?{collection:'stockMovements',id:row.id,version:1,data:{...row,occurredAt:row.occurredAt.toISOString(),quantityDelta:Number(row.quantityDelta)},archived:false}:null;}

  async applyInventoryDelta({businessId,stockItemId,locationId,quantityDelta}){
    const {rowCount}=await this.client.query(`INSERT INTO inventory_location_balances(business_id,stock_item_id,location_id,quantity,version) VALUES($1,$2,$3,$4,1) ON CONFLICT(business_id,stock_item_id,location_id) DO UPDATE SET quantity=inventory_location_balances.quantity+EXCLUDED.quantity,version=inventory_location_balances.version+1 WHERE inventory_location_balances.quantity+EXCLUDED.quantity>=0`,[businessId,stockItemId,locationId,quantityDelta]);
    if(rowCount!==1){const error=new Error('The count would create a negative stock balance. Refresh stock and review the count.');error.status=409;error.code='RESOURCE_CONFLICT';throw error}
  }

  async setInventoryBalance({businessId,stockItemId,locationId,quantity,sealedContainers=null,openQuantity=null}){
    const key=`${businessId}:${stockItemId}:${locationId}`;
    const before=this.balanceChanges.get(key)?.before || await this.stockBalance(businessId,stockItemId,locationId);
    await this.client.query(`INSERT INTO inventory_location_balances(business_id,stock_item_id,location_id,quantity,version,sealed_containers,open_quantity) VALUES($1,$2,$3,$4,1,$5,$6) ON CONFLICT(business_id,stock_item_id,location_id) DO UPDATE SET quantity=EXCLUDED.quantity,version=inventory_location_balances.version+1,sealed_containers=EXCLUDED.sealed_containers,open_quantity=EXCLUDED.open_quantity`,[businessId,stockItemId,locationId,quantity,sealedContainers,openQuantity]);
    this.balanceChanges.set(key,{before,after:await this.stockBalance(businessId,stockItemId,locationId)});
  }

  async updateStockItemVersion(businessId,stockItemId,version){await this.client.query('UPDATE stock_items SET version=$3,updated_at=now() WHERE business_id=$1 AND id=$2',[businessId,stockItemId,version]);}

  async insertInventoryMovement({businessId,id,stockItemId,locationId,quantityDelta,movementType='COUNT_ADJUSTMENT',reason,commandId,staffId,at}){
    await this.client.query(`INSERT INTO inventory_movements(business_id,id,stock_item_id,location_id,quantity_delta,movement_type,reason,source_command_id,staff_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[businessId,id,stockItemId,locationId,quantityDelta,movementType,reason,commandId,staffId,at]);
    const states=this.balanceChanges.get(`${businessId}:${stockItemId}:${locationId}`);
    if(states)await this.client.query(`INSERT INTO inventory_movement_states(business_id,movement_id,before_state,after_state,base_unit,average_unit_cost_minor,sealed_container_size) SELECT $1,$2,$3::jsonb,$4::jsonb,base_unit,average_unit_cost_minor,sealed_container_size FROM stock_items WHERE business_id=$1 AND id=$5`,[businessId,id,JSON.stringify(states.before),JSON.stringify(states.after),stockItemId]);
  }

  async reversalSource(businessId,movementId){
    const {rows}=await this.client.query('SELECT source_command_id FROM inventory_movements WHERE business_id=$1 AND id=$2',[businessId,movementId]);
    if(!rows.length)return null;const originalCommandId=rows[0].source_command_id;
    await this.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`inventory-reversal:${businessId}:${originalCommandId}`]);
    const reversal=await this.client.query('SELECT reversal_command_id FROM inventory_reversals WHERE business_id=$1 AND original_command_id=$2',[businessId,originalCommandId]);
    const movements=await this.client.query(`SELECT m.id,m.stock_item_id AS "stockItemId",m.location_id AS "locationId",m.quantity_delta AS "quantityDelta",m.movement_type AS "movementType",s.before_state AS "before",s.after_state AS "after",s.base_unit AS "baseUnit",s.average_unit_cost_minor AS "unitCost",s.sealed_container_size AS "containerSize" FROM inventory_movements m LEFT JOIN inventory_movement_states s ON s.business_id=m.business_id AND s.movement_id=m.id WHERE m.business_id=$1 AND m.source_command_id=$2 ORDER BY m.stock_item_id,m.location_id FOR UPDATE OF m`,[businessId,originalCommandId]);
    return {originalCommandId,reversed:reversal.rows.length>0,movements:movements.rows};
  }

  async insertInventoryReversal({businessId,originalCommandId,movementId,movementIds,commandId,reason,staffId,at}){
    await this.client.query('INSERT INTO inventory_reversals(business_id,original_command_id,original_movement_id,movement_ids,reversal_command_id,reason,staff_id,occurred_at) VALUES($1,$2,$3,$4::uuid[],$5,$6,$7,$8)',[businessId,originalCommandId,movementId,movementIds,commandId,reason,staffId,at]);
  }

  async insertStockCount({businessId,id,scope,locationId,selectedStockItemIds,rows,matches,short,over,reason,commandId,staffId,at}){
    await this.client.query(`INSERT INTO inventory_stock_counts(business_id,id,scope,location_id,selected_stock_item_ids,item_count,matches,short,over,reason,source_command_id,created_by,created_at) VALUES($1,$2,$3,$4,$5::uuid[],$6,$7,$8,$9,$10,$11,$12,$13)`,[businessId,id,scope,locationId,selectedStockItemIds,rows.length,matches,short,over,reason,commandId,staffId,at]);
    for(const row of rows)await this.client.query(`INSERT INTO inventory_stock_count_rows(business_id,count_id,stock_item_id,expected_quantity,counted_quantity,variance,counted_sealed_containers,counted_open_quantity,measurement_method,consumption_product_ids,stock_item_name_snapshot,base_unit_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[],$11,$12)`,[businessId,id,row.stockItemId,row.expectedQuantity,row.countedQuantity,row.variance,row.countedSealedContainers,row.countedOpenQuantity,row.measurementMethod,row.consumptionProductIds,row.name,row.baseUnit]);
  }

  async insertStockAdjustment({businessId,id,stockItemId,locationId,beforeQuantity,afterQuantity,beforeSealedContainers=null,beforeOpenQuantity=null,afterSealedContainers=null,afterOpenQuantity=null,reason,commandId,staffId,at}){
    await this.client.query(`INSERT INTO inventory_stock_adjustments(business_id,id,stock_item_id,location_id,before_quantity,after_quantity,variance,before_sealed_containers,before_open_quantity,after_sealed_containers,after_open_quantity,reason,source_command_id,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[businessId,id,stockItemId,locationId,beforeQuantity,afterQuantity,Number((afterQuantity-beforeQuantity).toFixed(6)),beforeSealedContainers,beforeOpenQuantity,afterSealedContainers,afterOpenQuantity,reason,commandId,staffId,at]);
  }

  async findBusinessCode(table, businessId, code, exceptId = null) {
    if (!['products', 'stock_items'].includes(table)) throw new Error('Unsupported code lookup table.');
    const {rows} = await this.client.query(
      `SELECT id FROM ${table} WHERE business_id = $1 AND lower(code) = lower($2) AND archived_at IS NULL AND ($3::uuid IS NULL OR id <> $3) LIMIT 1`,
      [businessId, code, exceptId],
    );
    return rows[0] ?? null;
  }

  async findBusinessBarcode(table, businessId, barcode, exceptId = null) {
    if (!['products', 'stock_items'].includes(table)) throw new Error('Unsupported barcode lookup table.');
    const {rows} = await this.client.query(
      `SELECT id FROM ${table} WHERE business_id = $1 AND lower(barcode) = lower($2) AND archived_at IS NULL AND ($3::uuid IS NULL OR id <> $3) LIMIT 1`,
      [businessId, barcode, exceptId],
    );
    return rows[0] ?? null;
  }

  async findStockBarcode(businessId, barcode, exceptStockId = null) {
    const {rows} = await this.client.query(`
      SELECT id FROM stock_items WHERE business_id=$1 AND (lower(barcode)=lower($2) OR lower(code)=lower($2) OR lower($2)=ANY(barcode_aliases)) AND archived_at IS NULL AND ($3::uuid IS NULL OR id<>$3)
      UNION ALL
      SELECT stock_item_id AS id FROM stock_purchase_packages WHERE business_id=$1 AND lower(barcode)=lower($2) AND ($3::uuid IS NULL OR stock_item_id<>$3)
      LIMIT 1
    `, [businessId,barcode,exceptStockId]);
    return rows[0] ?? null;
  }

  async requireStockItems(businessId, ids) {
    if (!ids.length) return true;
    const {rows} = await this.client.query(
      'SELECT id FROM stock_items WHERE business_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL FOR SHARE',
      [businessId, ids],
    );
    return rows.length === new Set(ids).size;
  }

  async requireOutlets(businessId, ids) {
    if(!ids.length)return true;
    const {rows}=await this.client.query('SELECT id FROM business_outlets WHERE business_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL FOR SHARE',[businessId,ids]);
    return rows.length===new Set(ids).size;
  }

  async saveStockItem(item) {
    await this.client.query(`
      INSERT INTO stock_items (business_id,id,name,code,base_unit,barcode,barcode_aliases,scan_unit_quantity,reorder_level,average_unit_cost_minor,sealed_container_size,version,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      ON CONFLICT (business_id,id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code, base_unit=EXCLUDED.base_unit,
        barcode=EXCLUDED.barcode, barcode_aliases=EXCLUDED.barcode_aliases, scan_unit_quantity=EXCLUDED.scan_unit_quantity,
        reorder_level=EXCLUDED.reorder_level, average_unit_cost_minor=EXCLUDED.average_unit_cost_minor,
        sealed_container_size=EXCLUDED.sealed_container_size, version=EXCLUDED.version, updated_by=EXCLUDED.updated_by, updated_at=now()
    `, [item.businessId,item.id,item.name,item.code,item.baseUnit,item.barcode,item.barcodeAliases,item.scanUnitQuantity,item.reorderLevel,item.averageUnitCostMinor,item.sealedContainerSize,item.version,item.staffId]);
    await this.client.query('DELETE FROM stock_purchase_packages WHERE business_id=$1 AND stock_item_id=$2', [item.businessId,item.id]);
    for (const [index, pack] of item.purchasePackages.entries()) await this.client.query(`
      INSERT INTO stock_purchase_packages (business_id,stock_item_id,id,name,base_quantity,unit_cost_minor,barcode,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [item.businessId,item.id,pack.id,pack.name,pack.baseQuantity ?? pack.quantity,pack.unitCostMinor,pack.barcode,index]);
  }

  async saveProduct(product) {
    await this.client.query(`
      INSERT INTO products (business_id,id,name,code,price_minor,category,route_to,stock_item_id,barcode,favorite,tax_class_id,recipe,inventory_type,recipe_yield,portion_volume,selling_mode,portions,outlet_ids,version,created_by,updated_by,modifiers)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::uuid[],$19,$20,$20,$21::jsonb)
      ON CONFLICT (business_id,id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code, price_minor=EXCLUDED.price_minor,
        category=EXCLUDED.category, route_to=EXCLUDED.route_to, stock_item_id=EXCLUDED.stock_item_id, barcode=EXCLUDED.barcode,
        favorite=EXCLUDED.favorite,tax_class_id=EXCLUDED.tax_class_id,recipe=EXCLUDED.recipe,inventory_type=EXCLUDED.inventory_type,recipe_yield=EXCLUDED.recipe_yield,
        portion_volume=EXCLUDED.portion_volume,selling_mode=EXCLUDED.selling_mode,portions=EXCLUDED.portions,modifiers=EXCLUDED.modifiers,outlet_ids=EXCLUDED.outlet_ids,version=EXCLUDED.version,
        updated_by=EXCLUDED.updated_by,updated_at=now()
    `, [product.businessId,product.id,product.name,product.code,product.priceMinor,product.category,product.routeTo,product.stockItemId,product.barcode,product.favorite,product.taxClassId,product.recipe,product.inventoryType,product.recipeYield,product.portionVolume,product.sellingMode,JSON.stringify(product.portions),product.outletIds,product.version,product.staffId,JSON.stringify(product.modifiers??[])]);
    await this.client.query('DELETE FROM product_recipe_ingredients WHERE business_id=$1 AND product_id=$2', [product.businessId,product.id]);
    for (const ingredient of product.recipeIngredients) await this.client.query(`
      INSERT INTO product_recipe_ingredients (business_id,product_id,stock_item_id,quantity,unit) VALUES ($1,$2,$3,$4,$5)
    `, [product.businessId,product.id,ingredient.stockItemId,ingredient.quantity,ingredient.unit]);
    await this.client.query('DELETE FROM product_modifier_stock_refs WHERE business_id=$1 AND product_id=$2',[product.businessId,product.id]);
    for(const stockId of new Set((product.modifiers??[]).flatMap(row=>row.ingredientAdjustments.map(item=>item.stockItemId))))await this.client.query('INSERT INTO product_modifier_stock_refs(business_id,product_id,stock_item_id) VALUES($1,$2,$3)',[product.businessId,product.id,stockId]);
    await this.client.query('DELETE FROM product_outlets WHERE business_id=$1 AND product_id=$2',[product.businessId,product.id]);
    for(const outletId of product.outletIds)await this.client.query('INSERT INTO product_outlets (business_id,product_id,outlet_id) VALUES ($1,$2,$3)',[product.businessId,product.id,outletId]);
  }

  async createOpeningStockMovement({businessId, id, stockItemId, locationId, quantity, commandId, staffId, at}) {
    await this.client.query(`
      INSERT INTO inventory_movements (business_id,id,stock_item_id,location_id,quantity_delta,movement_type,reason,source_command_id,staff_id,occurred_at)
      VALUES ($1,$2,$3,$4,$5,'OPENING_BALANCE','Opening balance',$6,$7,$8)
    `, [businessId,id,stockItemId,locationId,quantity,commandId,staffId,at]);
  }

  async upsertInventoryBalance({businessId,stockItemId,locationId,quantityDelta}) {
    await this.client.query(`
      INSERT INTO inventory_location_balances (business_id,stock_item_id,location_id,quantity,version)
      VALUES ($1,$2,$3,$4,1)
      ON CONFLICT (business_id,stock_item_id,location_id) DO UPDATE SET quantity=inventory_location_balances.quantity+EXCLUDED.quantity,version=inventory_location_balances.version+1
    `,[businessId,stockItemId,locationId,quantityDelta]);
  }

  async findCatalogSku(businessId, sku) {
    const {rows} = await this.client.query(
      'SELECT id FROM catalog_items WHERE business_id = $1 AND lower(sku) = lower($2) AND archived_at IS NULL',
      [businessId, sku],
    );
    return rows[0] ?? null;
  }

  async requireCatalogCategory(businessId, categoryId) {
    const {rows} = await this.client.query(
      'SELECT 1 FROM catalog_categories WHERE business_id = $1 AND id = $2 AND archived_at IS NULL FOR SHARE',
      [businessId, categoryId],
    );
    return rows.length > 0;
  }

  async consumeOfflineGrant({grantId, businessId, deviceId, staffId, commandName, commandId, at}) {
    const {rows} = await this.client.query(`
      UPDATE offline_grants
      SET used_commands = used_commands + 1
      WHERE id = $1 AND business_id = $2 AND device_id = $3 AND staff_id = $4
        AND policy_version = 1 AND revoked_at IS NULL AND expires_at > $5
        AND used_commands < max_commands AND $6 = ANY(allowed_commands)
      RETURNING id
    `, [grantId, businessId, deviceId, staffId, at, commandName]);
    if (!rows.length) {
      const error = new Error('Offline grant is invalid, expired, exhausted, or does not permit this command.');
      error.status = 403;
      error.code = 'OFFLINE_GRANT_INVALID';
      throw error;
    }
    await this.client.query(
      'INSERT INTO offline_grant_commands (grant_id, command_id) VALUES ($1, $2)',
      [grantId, commandId],
    );
  }

  async nextChangeCursor(businessId) {
    const {rows} = await this.client.query(`
      INSERT INTO business_change_cursors (business_id, cursor)
      VALUES ($1, 1)
      ON CONFLICT (business_id) DO UPDATE SET cursor = business_change_cursors.cursor + 1
      RETURNING cursor
    `, [businessId]);
    return Number(rows[0].cursor);
  }

  async updateCommandOutcome({businessId,commandId,payloadHash,outcome,at}) {
    const {rowCount}=await this.client.query(`UPDATE api_commands SET status='CONFIRMED',outcome=$3::jsonb,error=NULL,committed_at=$4,updated_at=$4 WHERE business_id=$1 AND command_id=$2 AND status='PROCESSING' AND payload_hash=$5`,[businessId,commandId,JSON.stringify(outcome),at,payloadHash]);
    if(rowCount!==1)throw new Error('Command lifecycle changed before confirmation.');
  }

  async insertAudit({businessId, commandId, name, actor, at,eventType='COMMAND'}) {
    await this.client.query(`
      INSERT INTO business_audit_events (business_id, command_id, event_type, staff_id, device_id, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [businessId, commandId, eventType==='COMMAND'?name:eventType, actor.staffId, actor.deviceId, at]);
  }

  async insertChange({businessId, cursor, commandId, name, result, at}) {
    await this.client.query(`
      INSERT INTO business_changes (business_id, cursor, command_id, change_type, projection, occurred_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    `, [businessId, cursor, commandId, name, JSON.stringify(result), at]);
  }
}
