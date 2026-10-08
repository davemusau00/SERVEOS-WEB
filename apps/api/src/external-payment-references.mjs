import {ApiProblem} from './command-kernel.mjs';

/** Serialize receipt-reference use across every external-payment workflow. */
export async function assertUniqueExternalPaymentReference(tx,businessId,method,reference){
 const normalized=String(reference||'').trim().toUpperCase();
 if(!normalized)return;
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`external-payment:${businessId}:${method}:${normalized}`]);
 const {rows}=await tx.client.query(`
  SELECT 1 FROM order_payments WHERE business_id=$1 AND method=$2 AND normalized_reference=$3
  UNION ALL SELECT 1 FROM customer_credit_entries WHERE business_id=$1 AND payment_method=$2 AND normalized_reference=$3
  UNION ALL SELECT 1 FROM business_hospitality_payments WHERE business_id=$1 AND normalized_reference=$3 AND account_snapshot->>'method'=$2
  UNION ALL SELECT 1 FROM procurement_supplier_payments WHERE business_id=$1 AND method=$2 AND upper(btrim(reference))=$3
  UNION ALL SELECT 1 FROM business_expenses WHERE business_id=$1 AND status='POSTED' AND kind='EXTERNAL' AND account_snapshot->>'method'=$2 AND upper(btrim(external_reference))=$3
  LIMIT 1`,[businessId,method,normalized]);
 if(rows.length)throw new ApiProblem(409,'PAYMENT_REFERENCE_DUPLICATE','This external receipt reference is already recorded. Review the original transaction before continuing.');
}
