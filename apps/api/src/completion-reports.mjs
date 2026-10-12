/**
 * ServOS A-F safe-read reports, v1. No report returned here certifies general
 * ledger close, historical inventory valuation, fiscal compliance or delivered
 * local cash. All queries use business-scoped authoritative PostgreSQL data.
 */
import {ApiProblem} from './command-kernel.mjs';

export const REPORT_KINDS=Object.freeze([
  'expenses','stock-movements','stock-position','supplier-balances',
  'guest-balances','room-conflicts','accounting-coverage','shift-opening'
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const has=(actor,p)=>actor.permissions?.includes('*')||actor.permissions?.includes(p);
const bad=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const exact=value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new ApiProblem(409,'REPORT_AMOUNT_REQUIRES_REVIEW','A report amount is outside the exact integer range. Restrict the period and review the ledger.');return n;};
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const limitValue=value=>{const n=Number(value??100);if(!Number.isSafeInteger(n)||n<1||n>500)bad('Choose a page size from 1 to 500.');return n;};
const offsetValue=value=>{const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0||n>10_000_000)bad('Choose a supported nonnegative report offset.');return n;};
export function validateReportInput(input={}) {
 const kind=String(input.kind||'');if(!REPORT_KINDS.includes(kind))bad('Unsupported report kind.');
 const from=input.from,to=input.to;
 if(!date(from)||!date(to)||from>to||(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000>366)bad('Choose valid dates spanning at most 367 days.');
 const timeZone=input.timeZone||'Africa/Nairobi';if(typeof timeZone!=='string'||timeZone.length>80)bad('Invalid time zone.');
 try{new Intl.DateTimeFormat('en-KE',{timeZone});}catch{bad('Invalid time zone.');}
 const limit=limitValue(input.limit),offset=offsetValue(input.offset);
 const tillId=input.tillId||null;if(tillId&&!UUID.test(tillId))bad('Invalid till identifier.');
 if(kind==='shift-opening'&&!tillId)bad('Select the original till for its opening snapshot.');
 return {kind,from,to,timeZone,limit,offset,tillId};
}
export function requireCompletionAccess(actor,kind){
 if(!has(actor,'reports.view')&&!has(actor,'accounting.view'))throw new ApiProblem(403,'PERMISSION_DENIED','Business reporting access is required.');
 const required={'stock-movements':'inventory.view','stock-position':'inventory.view','supplier-balances':'procurement.view','guest-balances':'rooms.view','room-conflicts':'rooms.view','shift-opening':'till.view','expenses':'finance.expense.view','accounting-coverage':'accounting.view'}[kind];
 // Accounting permission can read expense/coverage information, but not guest,
 // stock, purchasing or cashier details without its owning domain permission.
 if(required&&!has(actor,required)&&!(kind==='expenses'&&has(actor,'accounting.view')))
  throw new ApiProblem(403,'PERMISSION_DENIED',`This report also requires ${required}.`);
}
const read=async(pool,work)=>{
 const client=await pool.connect();try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const value=await work(client);await client.query('COMMIT');return value;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
};
const range=(businessId,{from,to,timeZone})=>[businessId,from,to,timeZone];
const between=column=>`${column} >= ($2::date AT TIME ZONE $4) AND ${column} < (($3::date + 1) AT TIME ZONE $4)`;
const page=(rows,count,input)=>({rows,recordCount:exact(count),limit:input.limit,offset:input.offset,hasMore:input.offset+rows.length<exact(count)});
const preview=(input,extra)=>({report:input.kind.toUpperCase().replace(/-/g,'_'),from:input.from,to:input.to,timeZone:input.timeZone,generatedAt:new Date().toISOString(),certified:false,...extra});

export async function completionReport(pool,actor,unvalidated){
 const input=validateReportInput(unvalidated);requireCompletionAccess(actor,input.kind);
 const params=range(actor.businessId,input),paging=[...params,input.limit,input.offset];
 return read(pool,async db=>{
  if(input.kind==='expenses'){
   const where=`e.business_id=$1 AND e.status='POSTED' AND ${between('e.occurred_at')}`;
   const [summary,data]=await Promise.all([
    db.query(`SELECT count(*)::bigint AS count,COALESCE(sum(amount_minor),0)::bigint AS amount FROM business_expenses e WHERE ${where}`,params),
    db.query(`SELECT e.id,e.occurred_at,e.description,e.kind,e.amount_minor::text,c.name AS category,e.external_reference
      FROM business_expenses e JOIN business_expense_categories c ON c.business_id=e.business_id AND c.id=e.category_id
      WHERE ${where} ORDER BY e.occurred_at,e.id LIMIT $5 OFFSET $6`,paging)
   ]);const s=summary.rows[0];return preview(input,{basis:'POSTED_EXPENSES_ONLY',currency:'KES',totals:{count:exact(s.count),amountMinor:exact(s.amount)},...page(data.rows, s.count,input)});
  }
  if(input.kind==='stock-movements'){
   const where=`m.business_id=$1 AND ${between('m.occurred_at')}`;
   const [summary,data]=await Promise.all([
    db.query(`SELECT count(*)::bigint AS count,count(DISTINCT stock_item_id)::bigint AS stock_items FROM inventory_movements m WHERE ${where}`,params),
    db.query(`SELECT m.id,m.occurred_at,m.stock_item_id,s.name AS stock_name,s.code AS stock_code,s.base_unit,
      m.location_id,l.name AS location_name,m.movement_type,m.reason,m.quantity_delta::text AS quantity_delta,m.source_command_id
      FROM inventory_movements m JOIN stock_items s ON s.business_id=m.business_id AND s.id=m.stock_item_id
      JOIN stock_locations l ON l.business_id=m.business_id AND l.id=m.location_id
      WHERE ${where} ORDER BY m.occurred_at,m.id LIMIT $5 OFFSET $6`,paging)
   ]);const s=summary.rows[0];return preview(input,{basis:'IMMUTABLE_MOVEMENTS',historicalValuationMinor:null,notes:['Quantities remain exact decimal strings; do not add unlike units.','Sealed/open quantities at historical dates require their recorded state-change evidence.'],totals:{count:exact(s.count),stockItems:exact(s.stock_items)},...page(data.rows,s.count,input)});
  }
  if(input.kind==='stock-position'){
   const [summary,data]=await Promise.all([
    db.query('SELECT count(*)::bigint AS count FROM inventory_location_balances b WHERE b.business_id=$1',[actor.businessId]),
    db.query(`SELECT b.stock_item_id,s.name AS stock_name,s.code,s.base_unit,b.location_id,l.name AS location_name,
      b.quantity::text AS physical_quantity,b.sealed_containers::text AS sealed_containers,b.open_quantity::text AS open_quantity,
      s.sealed_container_size::text AS sealed_size,
      CASE WHEN s.sealed_container_size IS NOT NULL AND b.sealed_containers IS NOT NULL AND b.open_quantity IS NOT NULL
        THEN b.quantity=b.sealed_containers*s.sealed_container_size+b.open_quantity ELSE NULL END AS bottle_balanced
      FROM inventory_location_balances b JOIN stock_items s ON s.business_id=b.business_id AND s.id=b.stock_item_id
      JOIN stock_locations l ON l.business_id=b.business_id AND l.id=b.location_id
      WHERE b.business_id=$1 ORDER BY l.name,s.name,b.stock_item_id LIMIT $2 OFFSET $3`,[actor.businessId,input.limit,input.offset])
   ]);const count=summary.rows[0].count;return preview(input,{basis:'CURRENT_AUTHORITY_NOT_HISTORICAL',asOf:new Date().toISOString(),reservedQuantity:null,availableQuantity:null,localOfflinePendingQuantity:null,valuationMinor:null,notes:['Reserved and local pending offline amounts are not centrally complete. Available-for-sale cannot be certified.','Bottle balanced checks physical quantity = sealed × container size + open quantity.'],...page(data.rows,count,input)});
  }
  if(input.kind==='supplier-balances'){
   const [summary,data]=await Promise.all([
    db.query(`SELECT count(*)::bigint AS count,COALESCE(sum(amount_minor-paid_minor) FILTER(WHERE status<>'REVERSED'),0)::bigint AS outstanding
      FROM procurement_payables WHERE business_id=$1 AND status<>'REVERSED'`,[actor.businessId]),
    db.query(`SELECT p.id,p.supplier_id,s.name AS supplier,p.grn_id,p.invoice_number,p.invoice_date,p.due_date,
      p.status,p.amount_minor::text AS amount_minor,p.paid_minor::text AS paid_minor,
      (p.amount_minor-p.paid_minor)::text AS outstanding_minor
      FROM procurement_payables p JOIN procurement_suppliers s ON s.business_id=p.business_id AND s.id=p.supplier_id
      WHERE p.business_id=$1 AND p.status<>'REVERSED' ORDER BY p.created_at,p.id LIMIT $2 OFFSET $3`,[actor.businessId,input.limit,input.offset])
   ]);const s=summary.rows[0];return preview(input,{basis:'CURRENT_OUTSTANDING_NOT_PERIOD_AS_OF',currency:'KES',asOf:new Date().toISOString(),totals:{count:exact(s.count),outstandingMinor:exact(s.outstanding)},...page(data.rows,s.count,input)});
  }
  if(input.kind==='guest-balances'){
   const [summary,data]=await Promise.all([
    db.query(`SELECT count(*)::bigint AS count,COALESCE(sum(balance_minor),0)::bigint AS outstanding
      FROM business_folios WHERE business_id=$1 AND status='OPEN'`,[actor.businessId]),
    db.query(`SELECT f.id AS folio_id,f.reservation_id,r.room_id,f.customer_id,f.status,f.balance_minor::text AS balance_minor,
      f.deposit_minor::text AS deposit_minor,f.opened_at
      FROM business_folios f JOIN business_room_reservations r ON r.business_id=f.business_id AND r.id=f.reservation_id
      WHERE f.business_id=$1 AND f.status='OPEN' ORDER BY f.opened_at,f.id LIMIT $2 OFFSET $3`,[actor.businessId,input.limit,input.offset])
   ]);const s=summary.rows[0];return preview(input,{basis:'CURRENT_OPEN_FOLIOS_NOT_HISTORICAL',currency:'KES',totals:{count:exact(s.count),outstandingMinor:exact(s.outstanding)},...page(data.rows,s.count,input)});
  }
  if(input.kind==='room-conflicts'){
   // Diagnostic only. Actual reservations are still guarded by the authoritative
   // booking advisory lock and expected-version contract.
   const sql=`WITH clashes AS (
     SELECT a.id AS first_id,b.id AS second_id,a.room_id,a.starts_at AS begins_at,
       least(a.blocked_until,b.blocked_until) AS ends_at,'RESERVATION_OVERLAP'::text AS issue
     FROM business_room_reservations a JOIN business_room_reservations b
       ON b.business_id=a.business_id AND b.room_id=a.room_id AND b.id>a.id
       AND b.archived_at IS NULL AND b.status IN ('RESERVED','CHECKED_IN')
     WHERE a.business_id=$1 AND a.archived_at IS NULL AND a.status IN ('RESERVED','CHECKED_IN')
       AND a.starts_at<b.blocked_until AND b.starts_at<a.blocked_until
   )`;
   const [summary,data]=await Promise.all([
    db.query(`${sql} SELECT count(*)::bigint AS count FROM clashes WHERE begins_at < (($3::date + 1) AT TIME ZONE $4) AND ends_at > ($2::date AT TIME ZONE $4)`,params),
    db.query(`${sql} SELECT * FROM clashes WHERE begins_at < (($3::date + 1) AT TIME ZONE $4) AND ends_at > ($2::date AT TIME ZONE $4) ORDER BY begins_at,first_id LIMIT $5 OFFSET $6`,paging)
   ]);return preview(input,{basis:'ACTIVE_RESERVATION_OVERLAP_DIAGNOSTIC',notes:['An empty list does not independently certify safe simultaneous booking.','Room holds, maintenance and concurrency must still be checked by the booking command.'],...page(data.rows,summary.rows[0].count,input)});
  }
  if(input.kind==='accounting-coverage'){
   const [sales,expenses,journals,openTills]=await Promise.all([
    db.query(`SELECT count(*)::bigint AS count FROM pos_orders o WHERE o.business_id=$1 AND o.state='COMPLETED' AND ${between('o.updated_at')}`,params),
    db.query(`SELECT count(*)::bigint AS count,COALESCE(sum(amount_minor),0)::bigint AS amount FROM business_expenses e WHERE e.business_id=$1 AND e.status='POSTED' AND ${between('e.occurred_at')}`,params),
    db.query(`SELECT count(*)::bigint AS count FROM financial_journals j WHERE j.business_id=$1 AND ${between('j.occurred_at')}`,params),
    db.query(`SELECT count(*)::bigint AS count FROM till_sessions t WHERE t.business_id=$1 AND t.status<>'CLOSED' AND t.opened_at < (($3::date + 1) AT TIME ZONE $4)`,params)
   ]);
   return preview(input,{basis:'READ_ONLY_COVERAGE_DIAGNOSTIC',status:'REVIEW_REQUIRED',authoritativeCloseSupported:false,eligibleForClose:false,
    totals:{completedOrders:exact(sales.rows[0].count),postedExpenses:exact(expenses.rows[0].count),postedExpenseMinor:exact(expenses.rows[0].amount),financialJournals:exact(journals.rows[0].count),unclosedTills:exact(openTills.rows[0].count)},
    blockers:['COGS recognition journal and full depreciation/payroll/accrual coverage not certified','Offline cash and unresolved print/cash commands cannot be certified by this report','Room service-period revenue allocation and tax/eTIMS compliance require separate approval'],rows:[]});
  }
  if(input.kind==='shift-opening'){
   const {rows}=await db.query(`SELECT t.id,t.outlet_id,t.operator_id,t.device_id,t.status,t.opened_at,
    t.opening_float_minor::text AS opening_float_minor,t.version
    FROM till_sessions t WHERE t.business_id=$1 AND t.id=$2`,[actor.businessId,input.tillId]);
   if(!rows.length)throw new ApiProblem(404,'RESOURCE_NOT_FOUND','The original till is not available.');
   return preview(input,{basis:'LIVE_TILL_OPENING_FACTS_NOT_ISSUED_DOCUMENT',currency:'KES',rows,recordCount:1,limit:1,offset:0,hasMore:false,
    notes:['Preview only. This is not an immutable issued receipt or proof of physical printing.']});
  }
  throw new ApiProblem(400,'VALIDATION_FAILED','Unsupported report type.');
 });
}
