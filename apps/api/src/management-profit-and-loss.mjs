import {ApiProblem} from './command-kernel.mjs';

// Read-only management accounting. This does not create a second posting engine,
// rewrite issued documents, post current stock prices, or assert a closed period.
// Original issued POS bills recognise sales; folio journals recognise hotel income.
// Tender receipts/collections, supplier payments and guest deposits are excluded.
const moneySql=value=>`CASE WHEN ${value} ~ '^[0-9]+$' THEN (${value})::numeric END`;
const listSql=value=>`CASE WHEN jsonb_typeof(${value})='array' THEN ${value} ELSE '[]'::jsonb END`;
const departmentSql=item=>`CASE COALESCE(${item}->>'routeTo',${item}->'productSnapshot'->>'routeTo') WHEN 'BAR' THEN 'BAR' WHEN 'KITCHEN' THEN 'KITCHEN' ELSE 'OTHER_POS' END`;
const period=column=>`${column} >= ($2::date AT TIME ZONE $4) AND ${column} < (($3::date+1) AT TIME ZONE $4)`;
const statementCte=`
WITH receipt_candidates AS (
 SELECT d.*,COALESCE(NULLIF(d.snapshot->>'orderId',''),d.id::text) AS order_key,
   row_number() OVER(PARTITION BY COALESCE(NULLIF(d.snapshot->>'orderId',''),d.id::text) ORDER BY d.issued_at,d.id) AS issuance
 FROM business_documents d WHERE d.business_id=$1 AND d.document_type='SALES_RECEIPT'
), receipts AS (SELECT * FROM receipt_candidates WHERE issuance=1),
receipt_items AS (
 SELECT d.id AS document_id,d.document_number,d.issued_at,d.order_key,d.snapshot,item,
   ${departmentSql('item')} AS department,
   ${moneySql("item->>'netMinor'")} AS net_minor,
   ${moneySql("item->>'lineTotalMinor'")} AS gross_minor,
   ${moneySql("item->>'vatMinor'")}+${moneySql("item->>'levyMinor'")} AS tax_minor
 FROM receipts d CROSS JOIN LATERAL jsonb_array_elements(${listSql('d.snapshot->\'items\'')}) item
 WHERE item->>'state' IS DISTINCT FROM 'VOIDED'
), source_lines AS (
 SELECT 'sale:'||r.document_id::text||':'||r.department AS source_key,r.issued_at AS occurred_at,
   'REVENUE'::text AS section,'REVENUE_SALES'::text AS account_code,r.department,
   r.document_number AS reference,'Issued sales receipt'::text AS description,
   sum(r.net_minor) AS amount_minor,'businessDocuments'::text AS collection,r.document_id AS record_id,r.document_id,
   NULL::text AS category
 FROM receipt_items r WHERE ${period('r.issued_at')}
 GROUP BY r.document_id,r.department,r.issued_at,r.document_number
 UNION ALL
 SELECT 'sales-return:'||j.id::text,j.occurred_at,'RETURNS','REVENUE_SALES_RETURN','OTHER_POS',
   COALESCE(d.document_number,'Sales return'),j.source_type,-sum(l.debit_minor-l.credit_minor),
   'journalEntries',j.id,d.id,NULL
 FROM financial_journals j JOIN financial_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id AND l.account_code='REVENUE_SALES'
 LEFT JOIN order_payments p ON p.business_id=j.business_id AND p.id=j.payment_id
 LEFT JOIN customer_credit_entries c ON c.business_id=j.business_id AND c.id=j.customer_credit_entry_id
 LEFT JOIN receipts d ON d.order_key=COALESCE(p.order_id,c.order_id)::text
 WHERE j.business_id=$1 AND ${period('j.occurred_at')} AND l.debit_minor>0 AND d.issued_at<=j.occurred_at
 GROUP BY j.id,j.occurred_at,j.source_type,d.document_number,d.id
 UNION ALL
 SELECT 'room-return:'||r.id::text,r.occurred_at,'RETURNS','REVENUE_SALES_RETURN','OTHER_POS',
   COALESCE(d.document_number,'Room charge reversal'),r.reason,-r.net_minor,'roomChargeReversals',r.id,d.id,NULL
 FROM pos_order_room_charge_reversals r JOIN receipts d ON d.order_key=r.order_id::text AND d.issued_at<=r.occurred_at
 WHERE r.business_id=$1 AND ${period('r.occurred_at')}
 UNION ALL
 SELECT 'hotel:'||j.id::text||':'||l.line_number::text,j.occurred_at,'REVENUE',l.account_code,
   CASE l.account_code WHEN 'REVENUE_ACCOMMODATION' THEN 'ACCOMMODATION' WHEN 'REVENUE_SERVICE' THEN 'HOTEL_SERVICES' ELSE 'HOTEL_ADJUSTMENTS' END,
   COALESCE('Room '||room.number,'Guest folio'),j.description,l.credit_minor-l.debit_minor,'hospitalityJournalEntries',j.id,NULL,NULL
 FROM business_hospitality_journals j JOIN business_hospitality_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id
 LEFT JOIN business_folios f ON f.business_id=j.business_id AND f.id=j.folio_id
 LEFT JOIN business_room_reservations rv ON rv.business_id=f.business_id AND rv.id=f.reservation_id
 LEFT JOIN business_rooms room ON room.business_id=rv.business_id AND room.id=rv.room_id
 WHERE j.business_id=$1 AND ${period('j.occurred_at')} AND l.account_code IN ('REVENUE_ACCOMMODATION','REVENUE_SERVICE','REVENUE_ADJUSTMENT')
 UNION ALL
 SELECT 'consumption:'||c.order_id::text||':'||c.line_id::text||':'||c.stock_item_id::text,r.issued_at,'COGS','EXPENSE_POS_COGS',r.department,
   r.document_number,COALESCE(r.item->>'name',r.item->'productSnapshot'->>'name','Sale item')||' - historical stock consumption',
   c.cost_minor,'stockMovements',c.movement_id,r.document_id,NULL
 FROM receipt_items r JOIN pos_stock_consumptions c ON c.business_id=$1 AND c.order_id::text=r.order_key AND c.line_id::text=r.item->>'id'
 WHERE ${period('r.issued_at')}
 UNION ALL
 SELECT 'stock-return:'||v.order_id::text||':'||v.line_id::text||':'||v.stock_item_id::text,m.occurred_at,'COGS','EXPENSE_POS_COGS_RETURN',r.department,
   r.document_number,'Documented unopened stock return',-v.cost_minor,'stockMovements',v.return_movement_id,r.document_id,NULL
 FROM pos_void_stock_returns v JOIN inventory_movements m ON m.business_id=v.business_id AND m.id=v.return_movement_id
 JOIN receipt_items r ON r.order_key=v.order_id::text AND r.item->>'id'=v.line_id::text AND r.issued_at<=m.occurred_at
 WHERE v.business_id=$1 AND ${period('m.occurred_at')}
 UNION ALL
 SELECT 'expense:'||j.id::text,j.occurred_at,'OPERATING_EXPENSES','EXPENSE_OPERATING','BUSINESS',
   COALESCE(d.document_number,'Expense voucher'),e.description,l.debit_minor-l.credit_minor,'expenses',e.id,e.document_id,cat.name
 FROM business_expense_journals j JOIN business_expense_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id AND l.account_code='EXPENSE_OPERATING'
 JOIN business_expenses e ON e.business_id=j.business_id AND e.id=j.expense_id
 JOIN business_expense_categories cat ON cat.business_id=e.business_id AND cat.id=e.category_id
 LEFT JOIN business_documents d ON d.business_id=e.business_id AND d.id=e.document_id
 WHERE j.business_id=$1 AND e.status='POSTED' AND ${period('j.occurred_at')}
 UNION ALL
 SELECT 'bad-debt:'||j.id::text,j.occurred_at,'OPERATING_EXPENSES','EXPENSE_BAD_DEBT','BUSINESS',
   'Customer credit write-off','Journaled customer debt write-off',l.debit_minor-l.credit_minor,'journalEntries',j.id,NULL,'Bad debt'
 FROM financial_journals j JOIN financial_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id AND l.account_code='EXPENSE_BAD_DEBT'
 WHERE j.business_id=$1 AND ${period('j.occurred_at')}
 UNION ALL
 SELECT 'void-loss:'||c.order_id::text||':'||c.line_id::text||':'||c.stock_item_id::text,o.voided_at,'OPERATING_EXPENSES','EXPENSE_VOID_CONSUMPTION','BUSINESS',
   o.name,'Voided preparation without a documented stock return',c.cost_minor-COALESCE(v.cost_minor,0),'stockMovements',c.movement_id,NULL,'Unrecovered void preparation'
 FROM pos_orders o JOIN pos_stock_consumptions c ON c.business_id=o.business_id AND c.order_id=o.id
 LEFT JOIN pos_void_stock_returns v ON v.business_id=c.business_id AND v.order_id=c.order_id AND v.line_id=c.line_id AND v.stock_item_id=c.stock_item_id
 WHERE o.business_id=$1 AND o.state='VOIDED' AND ${period('o.voided_at')}
   AND NOT EXISTS(SELECT 1 FROM receipt_items r WHERE r.order_key=c.order_id::text AND r.item->>'id'=c.line_id::text)
 UNION ALL
 SELECT 'waste:'||m.id::text,m.occurred_at,'OPERATING_EXPENSES','EXPENSE_STOCK_WASTE','BUSINESS',
   'Stock waste',m.reason,round(abs(m.quantity_delta)*s.average_unit_cost_minor),'stockMovements',m.id,NULL,'Stock waste'
 FROM inventory_movements m LEFT JOIN inventory_movement_states s ON s.business_id=m.business_id AND s.movement_id=m.id
 WHERE m.business_id=$1 AND m.movement_type='WASTE' AND ${period('m.occurred_at')}
 UNION ALL
 SELECT 'waste-correction:'||r.reversal_command_id::text,r.occurred_at,'OPERATING_EXPENSES','EXPENSE_STOCK_WASTE_REVERSAL','BUSINESS',
   'Stock waste correction',r.reason,-round(abs(m.quantity_delta)*s.average_unit_cost_minor),'movementCorrections',r.reversal_command_id,NULL,'Stock waste'
 FROM inventory_reversals r JOIN inventory_movements m ON m.business_id=r.business_id AND m.id=r.original_movement_id AND m.movement_type='WASTE'
 LEFT JOIN inventory_movement_states s ON s.business_id=m.business_id AND s.movement_id=m.id
 WHERE r.business_id=$1 AND ${period('r.occurred_at')}
)
`;

const integer=value=>{const number=Number(value);if(!Number.isSafeInteger(number))throw new ApiProblem(409,'REPORT_AMOUNT_REQUIRES_REVIEW','The statement contains an unsupported amount. Review the source ledger before reporting it.');return number};
const add=(a,b)=>integer(BigInt(a)+BigInt(b));
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const parameters=async(db,businessId,from,to)=>{
 if(!date(from)||!date(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>366)throw new ApiProblem(400,'VALIDATION_FAILED','Choose a valid statement range of at most 367 calendar days.');
 const business=await db.query('SELECT time_zone FROM businesses WHERE id=$1',[businessId]);
 if(!business.rows.length)throw new ApiProblem(404,'RESOURCE_NOT_FOUND','The business is unavailable.');
 return [businessId,from,to,business.rows[0].time_zone||'Africa/Nairobi'];
};
const read=async(pool,work)=>{const db=await pool.connect();try{await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await work(db);await db.query('COMMIT');return result}catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}};

export async function profitAndLoss(pool,businessId,from,to){
 return read(pool,async db=>{
  const params=await parameters(db,businessId,from,to);
  const totals=await db.query(`${statementCte} SELECT section,account_code,department,category,count(*)::text AS source_count,count(*) FILTER(WHERE amount_minor IS NULL)::text AS unknown_count,COALESCE(sum(amount_minor),0)::text AS amount_minor FROM source_lines GROUP BY section,account_code,department,category ORDER BY section,account_code,department,category`,params);
  const controls=await db.query(`${statementCte}
   SELECT
   (SELECT count(*) FROM receipt_items r WHERE ${period('r.issued_at')} AND (r.net_minor IS NULL OR r.tax_minor IS NULL OR r.gross_minor IS NULL OR r.gross_minor<>r.net_minor+r.tax_minor))::text AS invalid_items,
   (SELECT count(*) FROM receipts d WHERE ${period('d.issued_at')} AND (${moneySql("d.snapshot->'taxes'->>'netMinor'")} IS NULL OR NOT EXISTS(SELECT 1 FROM receipt_items i WHERE i.document_id=d.id) OR ${moneySql("d.snapshot->'taxes'->>'netMinor'")} IS DISTINCT FROM (SELECT sum(i.net_minor) FROM receipt_items i WHERE i.document_id=d.id)))::text AS invalid_receipts,
   (SELECT count(*) FROM receipt_candidates d WHERE issuance>1 AND ${period('d.issued_at')})::text AS subsequent_receipts,
   (SELECT count(*) FROM receipt_items r WHERE ${period('r.issued_at')} AND jsonb_typeof(COALESCE(r.item->'ingredientSnapshot',r.item->'productSnapshot'->'ingredientSnapshot')) IS DISTINCT FROM 'array')::text AS unknown_recipes,
   (SELECT count(*) FROM receipt_items r CROSS JOIN LATERAL jsonb_array_elements(${listSql("COALESCE(r.item->'ingredientSnapshot',r.item->'productSnapshot'->'ingredientSnapshot')")}) ingredient WHERE ${period('r.issued_at')} AND NOT EXISTS(SELECT 1 FROM pos_stock_consumptions c WHERE c.business_id=$1 AND c.order_id::text=r.order_key AND c.line_id::text=r.item->>'id' AND c.stock_item_id::text=ingredient->>'stockItemId'))::text AS missing_consumptions,
   (SELECT count(*) FROM receipt_items r JOIN pos_stock_consumptions c ON c.business_id=$1 AND c.order_id::text=r.order_key AND c.line_id::text=r.item->>'id' WHERE ${period('r.issued_at')} AND c.unit_cost_minor=0)::text AS zero_cost_consumptions,
   (SELECT count(*) FROM business_expenses e WHERE e.business_id=$1 AND e.status='DRAFT' AND ${period('e.occurred_at')})::text AS draft_expenses,
   (SELECT count(*) FROM pos_orders o WHERE o.business_id=$1 AND o.state IN ('OPEN','FIRED') AND o.created_at<(($3::date+1) AT TIME ZONE $4) AND EXISTS(SELECT 1 FROM pos_stock_consumptions c WHERE c.business_id=o.business_id AND c.order_id=o.id))::text AS unissued_preparation,
   (SELECT count(*) FROM business_expenses e LEFT JOIN business_expense_journals j ON j.business_id=e.business_id AND j.expense_id=e.id WHERE e.business_id=$1 AND e.status='POSTED' AND ${period('e.occurred_at')} AND (j.id IS NULL OR j.amount_minor<>e.amount_minor))::text AS expense_journal_exceptions,
   (SELECT COALESCE(sum(l.credit_minor-l.debit_minor),0) FROM financial_journals j JOIN financial_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id WHERE j.business_id=$1 AND ${period('j.occurred_at')} AND l.account_code='REVENUE_SALES')::text AS pos_journal_revenue,
   (SELECT COALESCE(sum(l.credit_minor-l.debit_minor),0) FROM business_hospitality_journals j JOIN business_hospitality_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id WHERE j.business_id=$1 AND ${period('j.occurred_at')} AND l.account_code='REVENUE_SALES')::text AS room_charge_journal_revenue,
   statement_timestamp() AS generated_at`,params);
  const control=Object.fromEntries(Object.entries(controls.rows[0]).filter(([key])=>key!=='generated_at').map(([key,value])=>[key,integer(value)]));
  const lines=totals.rows.map(row=>({section:row.section,accountCode:row.account_code,department:row.department,category:row.category,sourceCount:integer(row.source_count),unknownCount:integer(row.unknown_count),amountMinor:integer(row.amount_minor)}));
  const sum=predicate=>lines.filter(predicate).reduce((amount,line)=>add(amount,line.amountMinor),0);
  const salesMinor=sum(line=>line.accountCode==='REVENUE_SALES');
  const returnsMinor=sum(line=>line.section==='RETURNS');
  const posNetRevenueMinor=add(salesMinor,returnsMinor),netRevenueMinor=sum(line=>['REVENUE','RETURNS'].includes(line.section));
  const cogsMinor=sum(line=>line.section==='COGS'),operatingExpensesMinor=sum(line=>line.section==='OPERATING_EXPENSES');
  const coverage=[];
  const warn=(code,count,message,blocksPosMargin=false)=>{if(count)coverage.push({code,count,message,blocksPosMargin})};
  warn('RECEIPT_ALLOCATION',control.invalid_items+control.invalid_receipts,'Issued item amounts or tax allocations need reconciliation.',true);
  warn('REISSUED_BILLS',control.subsequent_receipts,'An order has additional issued receipts. Only its original bill is recognised; review later changes.',true);
  warn('UNKNOWN_RECIPE',control.unknown_recipes,'Historical recipe evidence is missing; inventory costs cannot be assumed to be zero.',true);
  warn('MISSING_CONSUMPTION',control.missing_consumptions,'Issued ingredient snapshots lack matching sale-time consumption evidence.',true);
  warn('ZERO_COST_REVIEW',control.zero_cost_consumptions,'Zero sale-time inventory costs require review before a supported margin is shown.',true);
  warn('UNPRICED_COST',lines.reduce((n,line)=>n+line.unknownCount,0),'Some inventory costs lack historical valuation evidence. Their amounts are excluded, not treated as zero.');
  warn('DRAFT_EXPENSES',control.draft_expenses,'Expense drafts are excluded until authorised posting.');
  warn('UNISSUED_PREPARATION',control.unissued_preparation,'Prepared open orders are excluded from issued-sales revenue and COGS; review their period allocation.');
  warn('EXPENSE_JOURNAL_EXCEPTION',control.expense_journal_exceptions,'Posted expense sources and journals do not reconcile.');
  coverage.push({code:'ACCOUNTING_COVERAGE',count:null,message:'Hotel direct costs, depreciation, financing, payroll/accrual completeness and closing adjustments are not certified. Whole-business profit and tax remain unavailable.',blocksPosMargin:false});
  coverage.push({code:'HOTEL_SERVICE_PERIOD',count:null,message:'Accommodation follows existing folio charge journals, including booked periods charged upfront. Deferred revenue and service-period allocation require an approved policy; this is not a certified accrual statement.',blocksPosMargin:false});
  const posGrossProfitMinor=coverage.some(issue=>issue.blocksPosMargin)?null:add(posNetRevenueMinor,-cogsMinor);
  return {reportVersion:1,from,to,timeZone:params[3],currency:'KES',generatedAt:controls.rows[0].generated_at.toISOString(),status:'INCOMPLETE',periodStatus:'NOT_CLOSED',basis:'ISSUED_POS_BILLS_AND_FOLIO_ACCRUAL',
   totals:{posSalesBeforeReturnsMinor:salesMinor,salesReturnsMinor:returnsMinor,posNetRevenueMinor,netRevenueMinor,recordedPosCogsMinor:cogsMinor,postedOperatingExpensesMinor:operatingExpensesMinor,posGrossProfitMinor,grossProfitMinor:null,operatingProfitMinor:null,profitBeforeTaxMinor:null,taxMinor:null,netProfitMinor:null},
   lines,coverage,sourceCount:lines.reduce((count,line)=>count+line.sourceCount,0),
   reconciliation:{posRevenueJournalMinor:add(control.pos_journal_revenue,control.room_charge_journal_revenue),issuedPosNetRevenueMinor:posNetRevenueMinor,timingDifferenceMinor:add(posNetRevenueMinor,-add(control.pos_journal_revenue,control.room_charge_journal_revenue)),note:'POS journal revenue is posted on tender/credit/room charge; this statement recognises the original issued bill. Timing differences require a reviewed bridge, not an automatic adjustment.'},
   definitions:[
    {key:'REVENUE_SALES',label:'Issued POS sales',basis:'Original immutable receipt item net amounts; configured VAT and levy excluded. Department follows the issued station snapshot, not today\'s catalogue.'},
    {key:'REVENUE_SALES_RETURN',label:'Sales returns',basis:'Original revenue debit journals and POS room-charge reversals, only after an issued bill exists. Returns are not re-applied from mutable refunded order totals.'},
    {key:'EXPENSE_POS_COGS',label:'POS cost of sales',basis:'Immutable ingredient consumption cost recognised with the issued bill; documented unopened returns reverse original cost at return time. Refunds alone do not restore stock.'},
    {key:'REVENUE_ACCOMMODATION',label:'Accommodation revenue',basis:'Folio accrual revenue journal lines, excluding tax, tender collections and deposits.'},
    {key:'EXPENSE_OPERATING',label:'Operating expenses',basis:'Authorised expense journal lines by posting date/category; supplier payments and asset acquisition values are excluded.'},
    {key:'EXPENSE_STOCK_WASTE',label:'Stock waste',basis:'Waste quantity valued at its immutable movement-state cost; missing historical cost is a coverage exception.'},
   ],
  };
 });
}

export async function profitAndLossSources(pool,businessId,from,to,{section='ALL',before=null,limit=50}={}){
 if(!['ALL','REVENUE','RETURNS','COGS','OPERATING_EXPENSES'].includes(section)||!Number.isInteger(limit)||limit<1||limit>100)throw new ApiProblem(400,'VALIDATION_FAILED','Choose a supported statement section and page size.');
 let cursor=null;
 if(before){try{cursor=JSON.parse(Buffer.from(before,'base64url').toString('utf8'));if(typeof cursor.at!=='string'||!Number.isFinite(Date.parse(cursor.at))||typeof cursor.key!=='string'||cursor.key.length>250||cursor.from!==from||cursor.to!==to||cursor.section!==section)throw new Error()}catch{throw new ApiProblem(400,'VALIDATION_FAILED','The source cursor is invalid for this report.');}}
 return read(pool,async db=>{
  const params=await parameters(db,businessId,from,to);
  const result=await db.query(`${statementCte} SELECT source_key,occurred_at,section,account_code,department,reference,description,amount_minor::text,collection,record_id,document_id,category FROM source_lines WHERE ($5='ALL' OR section=$5) AND ($6::timestamptz IS NULL OR (occurred_at,source_key)<($6::timestamptz,$7::text)) ORDER BY occurred_at DESC,source_key DESC LIMIT $8`,[...params,section,cursor?.at??null,cursor?.key??null,limit+1]);
  const hasMore=result.rows.length>limit,rows=result.rows.slice(0,limit),last=rows.at(-1);
  return {from,to,timeZone:params[3],currency:'KES',section,items:rows.map(row=>({sourceKey:row.source_key,occurredAt:row.occurred_at.toISOString(),section:row.section,accountCode:row.account_code,department:row.department,reference:row.reference,description:row.description,amountMinor:row.amount_minor===null?null:integer(row.amount_minor),collection:row.collection,recordId:row.record_id,documentId:row.document_id,category:row.category})),hasMore,nextCursor:hasMore?Buffer.from(JSON.stringify({at:last.occurred_at.toISOString(),key:last.source_key,from,to,section})).toString('base64url'):null};
 });
}
