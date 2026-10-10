import {ApiProblem} from './command-kernel.mjs';

/**
 * Authoritative reporting layer. Every report reads the complete, tenant-scoped
 * PostgreSQL record for the selected period — never the browser's recently
 * loaded projection. Recognized sales anchor on immutable issued receipts;
 * collections anchor on recorded payments; the two are reported separately.
 * All queries run in one REPEATABLE READ read-only transaction so aggregates
 * and detail rows can never contradict each other.
 */

const requireReportAccess=actor=>{if(!actor.permissions?.includes('*')&&!actor.permissions?.includes('reports.view'))throw new ApiProblem(403,'PERMISSION_DENIED','The reports.view permission is required to read business reports.');};

const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)throw new ApiProblem(400,'VALIDATION_FAILED','Report dates must use the YYYY-MM-DD format.');return value};
const zone=value=>{if(value===undefined||value===null)return 'Africa/Nairobi';if(typeof value!=='string'||value.length>100)throw new ApiProblem(400,'VALIDATION_FAILED','The report time zone is invalid.');try{new Intl.DateTimeFormat('en',{timeZone:value})}catch{throw new ApiProblem(400,'VALIDATION_FAILED','The report time zone is invalid.')}return value};

const readTransaction=async(pool,work)=>{const client=await pool.connect();try{await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await work(client);await client.query('COMMIT');return result}finally{client.release()}};

/** Recognized sales: completed orders whose immutable receipt was issued in the period. */
const salesCte=outletClause=>`
  WITH sales AS (
    SELECT o.id,o.outlet_id,o.created_by,o.currency,o.grand_total_minor,o.refunded_amount_minor,
      COALESCE((d.snapshot->>'discountTotalMinor')::bigint,0) AS discount_minor,
      COALESCE((d.snapshot->'taxes'->>'netMinor')::bigint,0) AS net_minor,
      COALESCE((d.snapshot->'taxes'->>'vatMinor')::bigint,0) AS vat_minor,
      COALESCE((d.snapshot->'taxes'->>'levyMinor')::bigint,0) AS levy_minor
    FROM pos_orders o
    JOIN business_documents d ON d.business_id=o.business_id AND d.id=o.receipt_document_id AND d.document_type='SALES_RECEIPT'
    WHERE o.business_id=$1 AND o.state='COMPLETED' AND o.receipt_document_id IS NOT NULL
      AND (d.issued_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date ${outletClause}
  )`;
const outletFilter='AND ($5::uuid IS NULL OR o.outlet_id=$5)';
const summaryParams=(businessId,timeZone,start,end,outletId)=>[businessId,timeZone,start,end,outletId];

export async function salesSummary(pool,actor,{start,end,outletId=null,timeZone}={}){
 requireReportAccess(actor);
 const from=day(start),to=day(end);if(to<from)throw new ApiProblem(400,'VALIDATION_FAILED','The report end date must not precede its start date.');
 const tz=zone(timeZone),params=summaryParams(actor.businessId,tz,from,to,outletId);
 return readTransaction(pool,async client=>{
  const totals=(await client.query(`${salesCte(outletFilter)}
    SELECT count(*)::int AS "salesCount",COALESCE(sum(grand_total_minor),0)::bigint AS "grossMinor",
      COALESCE(sum(discount_minor),0)::bigint AS "discountMinor",COALESCE(sum(net_minor),0)::bigint AS "netMinor",
      COALESCE(sum(vat_minor),0)::bigint AS "vatMinor",COALESCE(sum(levy_minor),0)::bigint AS "levyMinor",
      COALESCE(sum(refunded_amount_minor),0)::bigint AS "refundsMinor",
      COALESCE(sum(grand_total_minor-refunded_amount_minor),0)::bigint AS "netSalesMinor"
    FROM sales`,params)).rows[0];
  const payments=(await client.query(`${salesCte(outletFilter)}
    SELECT p.method,count(*)::int AS "paymentCount",COALESCE(sum(p.amount_minor),0)::bigint AS "amountMinor"
    FROM order_payments p JOIN sales ON sales.id=p.order_id GROUP BY p.method ORDER BY "amountMinor" DESC`,params)).rows;
  const outlets=(await client.query(`${salesCte(outletFilter)}
    SELECT o.outlet_id,COALESCE(sum(o.grand_total_minor),0)::bigint AS "grossMinor",count(*)::int AS "salesCount"
    FROM pos_orders o JOIN sales ON sales.id=o.id GROUP BY o.outlet_id ORDER BY "grossMinor" DESC`,params)).rows;
  const operators=(await client.query(`${salesCte(outletFilter)}
    SELECT o.created_by AS "staffId",COALESCE(sum(o.grand_total_minor),0)::bigint AS "grossMinor",count(*)::int AS "salesCount"
    FROM pos_orders o JOIN sales ON sales.id=o.id GROUP BY o.created_by ORDER BY "grossMinor" DESC`,params)).rows;
  const categories=(await client.query(`${salesCte(outletFilter)}
    SELECT COALESCE(l.product_snapshot->>'category','UNSPECIFIED') AS category,COALESCE(sum(l.line_total_minor),0)::bigint AS "grossMinor"
    FROM pos_order_lines l JOIN sales ON sales.id=l.order_id WHERE l.state<>'VOIDED' GROUP BY 1 ORDER BY "grossMinor" DESC`,params)).rows;
  const refunds=(await client.query(`SELECT count(*)::int AS "refundCount",COALESCE(sum(amount_minor),0)::bigint AS "refundMinor"
    FROM payment_refunds r WHERE r.business_id=$1 AND (r.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      AND ($5::uuid IS NULL OR r.order_id IN (SELECT o.id FROM pos_orders o WHERE o.business_id=$1 AND o.outlet_id=$5))`,params)).rows[0];
  const collections=(await client.query(`SELECT COALESCE(sum(amount_minor),0)::bigint AS "collectedMinor",
      COALESCE(sum(CASE WHEN method='CASH' THEN amount_minor ELSE 0 END),0)::bigint AS "cashCollectedMinor",
      COALESCE(sum(CASE WHEN method='MPESA' THEN amount_minor ELSE 0 END),0)::bigint AS "mpesaCollectedMinor"
    FROM order_payments WHERE business_id=$1 AND (recorded_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      AND ($5::uuid IS NULL OR order_id IN (SELECT o.id FROM pos_orders o WHERE o.business_id=$1 AND o.outlet_id=$5))`,params)).rows[0];
  return {report:'SALES_SUMMARY',periodStart:from,periodEnd:to,timeZone:tz,outletId,generatedAt:new Date().toISOString(),totals,payments,outlets,operators,categories,refunds,collections};
 });
}
export async function salesRegister(pool,actor,{start,end,outletId=null,timeZone,limit=100,offset=0}={}){
 requireReportAccess(actor);
 const from=day(start),to=day(end);if(to<from)throw new ApiProblem(400,'VALIDATION_FAILED','The report end date must not precede its start date.');
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new ApiProblem(400,'VALIDATION_FAILED','The register page size must be between 1 and 1000.');
 if(!Number.isSafeInteger(offset)||offset<0)throw new ApiProblem(400,'VALIDATION_FAILED','The register offset must not be negative.');
 const tz=zone(timeZone),params=[...summaryParams(actor.businessId,tz,from,to,outletId),limit,offset];
 return readTransaction(pool,async client=>{
  const lines=(await client.query(`${salesCte(outletFilter)}
    SELECT l.id AS "lineId",o.id AS "orderId",d.document_number AS "receiptNumber",d.issued_at AS "issuedAt",
      o.outlet_id AS "outletId",o.created_by AS "staffId",o.currency,
      l.product_snapshot->>'name' AS "product",l.product_snapshot->>'code' AS "productCode",
      l.quantity::text AS quantity,l.unit_price_minor AS "unitPriceMinor",l.discount_minor AS "discountMinor",
      l.net_minor AS "netMinor",l.vat_minor AS "vatMinor",l.levy_minor AS "levyMinor",l.line_total_minor AS "lineTotalMinor",l.state
    FROM pos_order_lines l JOIN sales ON sales.id=l.order_id
    JOIN pos_orders o ON o.business_id=sales.business_id AND o.id=sales.id
    JOIN business_documents d ON d.business_id=o.business_id AND d.id=o.receipt_document_id
    WHERE l.state<>'VOIDED' ORDER BY d.issued_at,o.id,l.id LIMIT $6 OFFSET $7`,params)).rows;
  const totals=(await client.query(`${salesCte(outletFilter)}
    SELECT count(*)::int AS "lineCount",COALESCE(sum(l.line_total_minor),0)::bigint AS "grossMinor",
      COALESCE(sum(l.discount_minor),0)::bigint AS "discountMinor",COALESCE(sum(l.net_minor),0)::bigint AS "netMinor",
      COALESCE(sum(l.vat_minor),0)::bigint AS "vatMinor"
    FROM pos_order_lines l JOIN sales ON sales.id=l.order_id WHERE l.state<>'VOIDED'`,params)).rows[0];
  return {report:'SALES_REGISTER',periodStart:from,periodEnd:to,timeZone:tz,outletId,generatedAt:new Date().toISOString(),limit,offset,totals,lines};
 });
}

/** Current stock on hand with sealed/open bottle state where the stock is bottle-tracked. */
export async function stockOnHand(pool,actor,{locationId=null}={}){
 requireReportAccess(actor);
 const {rows}=await pool.query(`
   SELECT s.id AS "stockItemId",s.name,s.code,s.base_unit AS "baseUnit",s.average_unit_cost_minor AS "averageUnitCostMinor",
     l.id AS "locationId",l.name AS "locationName",b.quantity::text AS quantity,
     b.sealed_containers::text AS "sealedContainers",b.open_quantity::text AS "openQuantity"
   FROM inventory_location_balances b
   JOIN stock_items s ON s.business_id=b.business_id AND s.id=b.stock_item_id
   JOIN stock_locations l ON l.business_id=b.business_id AND l.id=b.location_id
   WHERE b.business_id=$1 AND b.quantity<>0 AND ($2::uuid IS NULL OR b.location_id=$2)
   ORDER BY l.name,s.name`,[actor.businessId,locationId]);
 for(const row of rows)row.valueMinor=Number(BigInt(row.averageUnitCostMinor??0)*BigInt(Math.round(Number(row.quantity))));
 return {report:'STOCK_ON_HAND',generatedAt:new Date().toISOString(),locationId,valuation:'Current average unit cost is reported for current quantities only; historical periods must use transaction cost evidence.',totals:{stockValueMinor:rows.reduce((sum,row)=>sum+row.valueMinor,0),items:rows.length},rows};
}

/** Nightly occupancy from checked-in stays; the exact definition is included in the result. */
export async function occupancy(pool,actor,{start,end,timeZone}={}){
 requireReportAccess(actor);
 const from=day(start),to=day(end);if(to<from)throw new ApiProblem(400,'VALIDATION_FAILED','The report end date must not precede its start date.');
 const tz=zone(timeZone);
 const {rows}=await pool.query(`
   WITH nights AS (SELECT generate_series($2::date,$3::date,'1 day')::date AS night),
   stays AS (
     SELECT st.id,st.room_id,(st.checked_in_at AT TIME ZONE $4)::date AS check_in,
       (COALESCE(st.checked_out_at,now()) AT TIME ZONE $4)::date AS check_out
     FROM business_stays st WHERE st.business_id=$1 AND st.checked_in_at IS NOT NULL
   )
   SELECT n.night::text AS night,
     (SELECT count(*)::int FROM stays WHERE check_in<=n.night AND check_out>n.night) AS "occupiedRooms",
     (SELECT count(*)::int FROM business_rooms r WHERE r.business_id=$1 AND r.archived_at IS NULL AND r.maintenance_state<>'OUT_OF_SERVICE') AS "availableRooms"
   FROM nights n ORDER BY n.night`,[actor.businessId,from,to,tz]);
 const roomNights=rows.reduce((sum,row)=>sum+row.occupiedRooms,0);
 const availableRoomNights=rows.reduce((sum,row)=>sum+row.availableRooms,0);
 return {report:'OCCUPANCY',periodStart:from,periodEnd:to,timeZone:tz,generatedAt:new Date().toISOString(),definition:'A night counts a stay that checked in on or before the night and had not checked out when the night started, in the property time zone. Rooms out of order are excluded from available rooms.',roomNights,availableRoomNights,occupancyPercent:availableRoomNights?Math.round(roomNights*1000/availableRoomNights)/10:0,nights:rows};
}
