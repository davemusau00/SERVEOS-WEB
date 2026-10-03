//! SQLite -> servos_v2 cutover bootstrap.
//!
//! This module produces the deterministic manifest that describes the current
//! local business state, and the page reader that streams it for import. It
//! deliberately contains no network or Tauri dependency so it can be exercised
//! by the dependency-free `native-tests` crate.
//!
//! Two rules govern everything here:
//!
//! 1. The manifest must never contain secrets. PIN hashes, the cloud publishable
//!    key, the device secret, Auth refresh tokens and OS credential-vault data
//!    are excluded by construction, because only business `records` are read.
//! 2. The manifest must be deterministic. Collections are ordered, records are
//!    ordered by id, and every collection carries a content hash, so the same
//!    database always produces the same manifest hash.

use super::*;
use sha2::{Digest, Sha256};

/// Collections eligible for cutover import.
///
/// This fixed allowlist preserves existing configuration and historical mirrors
/// under their original identities without replaying business effects. Unknown
/// collections are reported and block cutover instead of being silently omitted.
///
/// `orders`, `payments`, `receiptDocuments`, `journalEntries`, `stockMovements`,
/// `folioEntries`, `stayEvents` and `assetEvents` are immutable business history.
/// They are imported with provenance but are never recreated as new activity and
/// never drive stock or financial side effects a second time.
pub const IMPORT_COLLECTIONS: &[&str] = &[
    "organization", "outlets", "products", "stockItems", "stockLocations",
    "stockMovements", "customers", "suppliers", "employees", "assetCategories",
    "assets", "assetAcquisitions", "assetEvents", "roomTypes", "ratePlans",
    "rooms", "roomBlocks", "roomReservations", "stays", "stayEvents",
    "stayExtensions", "folios", "folioEntries", "tables", "orders",
    "tillSessions", "payments", "refunds", "receiptDocuments", "mpesaReceipts",
    "journalEntries", "purchaseOrders", "goodsReceipts", "supplierPayables",
    "maintenanceOrders", "tillPolicy", "hotelServices", "property",
    "paymentConfig", "paymentAccounts", "posPolicy", "priceRules", "purchasePackages",
    "inventoryReceipts", "maintenanceEvents", "cashMovements", "stockCounts",
    "closeDayReports", "supplierPayments", "mpesaDiscrepancies",
    "customerCreditAccounts", "customerCreditEntries", "customerCreditReconciliations",
    "customerCreditDiscrepancies", "recipes", "events", "promoters", "reservations",
    "waitlist", "housekeeping", "maintenance",
];

/// Collections whose records are immutable business history. They are imported
/// with provenance but must never be re-validated as if newly transacted.
pub const HISTORY_COLLECTIONS: &[&str] = &[
    "payments", "refunds", "receiptDocuments", "journalEntries", "stockMovements",
    "folioEntries", "stayEvents", "stayExtensions", "assetEvents", "customerCreditEntries",
    "customerCreditReconciliations", "inventoryReceipts", "maintenanceEvents",
    "cashMovements", "stockCounts", "closeDayReports", "supplierPayments",
];

/// Metadata keys that must never appear in a cutover manifest. The manifest is
/// read from business records only, but this list is asserted in code so a future
/// change cannot silently widen what is exported.
pub const FORBIDDEN_MANIFEST_KEYS: &[&str] = &[
    "pinHash", "pin_hash", "cloudKey", "cloud_key", "deviceToken", "device_token",
    "deviceSecret", "device_secret", "publishableKey", "refreshToken",
    "refresh_token", "accessToken", "access_token",
];

/// Maximum records in one import page. Mirrors the server-side page cap.
pub const MAX_PAGE_RECORDS: usize = 500;

/// Validate authenticated server evidence before resolving any local work.
/// The frontend's boolean is never sufficient proof of a successful cutover.
pub fn verify_server_evidence(evidence: &Value, cutover_id: &str, terminal_id: &str, business_id: &str, manifest_hash: Option<&str>, committed: bool) -> Result<()> {
    if Uuid::parse_str(cutover_id).is_err()
        || evidence["cutoverId"].as_str()!=Some(cutover_id)
        || evidence["sourceTerminalId"].as_str()!=Some(terminal_id)
        || evidence["businessId"].as_str()!=Some(business_id) {
        return Err("Server cutover evidence does not match this business, terminal and cutover".into());
    }
    let status=evidence["status"].as_str().unwrap_or("");
    if (committed && status!="COMMITTED") || (!committed && status!="READY" && status!="COMMITTED") {
        return Err("A verified server cutover is required before resolving local work".into());
    }
    let digest=evidence["verificationHash"].as_str().unwrap_or("");
    if digest.len()!=64 || !digest.bytes().all(|byte|byte.is_ascii_hexdigit()) {
        return Err("Server cutover verification hash is missing or invalid".into());
    }
    if manifest_hash.is_some_and(|hash|evidence["sourceManifestHash"].as_str()!=Some(hash)) {
        return Err("Server cutover manifest does not match the frozen SQLite source".into());
    }
    Ok(())
}
/// Serialize a value with object keys sorted, so a content hash does not depend
/// on the order fields happened to be written in.
pub fn canonical_json(value: &Value) -> String {
    fn write(value: &Value, out: &mut String) {
        match value {
            Value::Object(map) => {
                let mut keys: Vec<&String> = map.keys().collect();
                keys.sort();
                out.push('{');
                for (index, key) in keys.into_iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    out.push_str(&Value::String(key.clone()).to_string());
                    out.push(':');
                    write(&map[key], out);
                }
                out.push('}');
            }
            Value::Array(items) => {
                out.push('[');
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    write(item, out);
                }
                out.push(']');
            }
            Value::Number(number) => out.push_str(&canonical_number(&number.to_string())),
            other => out.push_str(&other.to_string()),
        }
    }
    let mut out = String::new();
    write(value, &mut out);
    out
}

// PostgreSQL jsonb expands scientific notation and preserves decimal scale.
// Hash numbers as plain decimals without insignificant zeros on both runtimes.
fn canonical_number(raw:&str)->String {
    let negative=raw.starts_with('-');
    let unsigned=raw.trim_start_matches('-');
    let (mantissa,exponent)=unsigned.split_once(['e','E']).map(|(m,e)|(m,e.parse::<i32>().unwrap_or(0))).unwrap_or((unsigned,0));
    let decimal=mantissa.find('.').unwrap_or(mantissa.len()) as i32+exponent;
    let digits=mantissa.replace('.',"");
    let mut result=if decimal<=0 {
        format!("0.{}{}","0".repeat((-decimal) as usize),digits)
    }else if decimal as usize>=digits.len(){
        format!("{}{}",digits,"0".repeat(decimal as usize-digits.len()))
    }else{
        format!("{}.{}",&digits[..decimal as usize],&digits[decimal as usize..])
    };
    if result.contains('.') {
        result=result.trim_end_matches('0').trim_end_matches('.').to_string();
    }
    if negative && result!="0"{result.insert(0,'-');}
    result
}

/// Content hash of one record, bound to its collection, id and version so a
/// hash cannot be reused for a different record or a stale version.
pub fn record_hash(collection: &str, id: &str, version: i64, data: &Value) -> String {
    let mut digest = Sha256::new();
    digest.update(collection.as_bytes());
    digest.update([0x1f]);
    digest.update(id.as_bytes());
    digest.update([0x1f]);
    digest.update(version.to_string().as_bytes());
    digest.update([0x1f]);
    digest.update(canonical_json(data).as_bytes());
    format!("{:x}", digest.finalize())
}

/// Reject any manifest payload carrying a credential field, at any depth. This
/// is a last line of defence behind the record-only read path.
pub fn reject_secret_keys(value: &Value) -> Result<()> {
    fn walk(value: &Value) -> Result<()> {
        match value {
            Value::Object(map) => {
                for (key, child) in map {
                    if FORBIDDEN_MANIFEST_KEYS
                        .iter()
                        .any(|forbidden| forbidden.eq_ignore_ascii_case(key))
                    {
                        return Err(format!(
                            "Cutover manifest must not contain credential field '{key}'"
                        ));
                    }
                    walk(child)?;
                }
            }
            Value::Array(items) => {
                for item in items {
                    walk(item)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    walk(value)
}

/// Financial and stock control totals. These are the numbers an operator
/// reconciles by hand, so they are computed once here and re-verified server side
/// before any cutover may commit.
#[derive(Default)]
struct Totals {
    payment_by_tender: Vec<(String, i64)>,
    stock_quantity: f64,
    stock_movements: i64,
    open_till_minor: i64,
    closed_till_minor: i64,
    till_count: i64,
    credit_outstanding_minor: i64,
    credit_entries: i64,
    payable_outstanding_minor: i64,
    receipt_total_minor: i64,
    order_total_minor: i64,
}

impl Totals {
    fn bump(list: &mut Vec<(String, i64)>, key: &str, amount: i64) {
        match list.iter_mut().find(|(name, _)| name == key) {
            Some((_, value)) => *value += amount,
            None => list.push((key.to_string(), amount)),
        }
    }
    fn absorb(&mut self, collection: &str, data: &Value) {
        let minor = |key: &str| data[key].as_i64().unwrap_or(0);
        match collection {
            "payments" => {
                let tender = data["tenderType"]
                    .as_str()
                    .unwrap_or("UNKNOWN")
                    .to_ascii_uppercase()
                    .replace(['-', '_', ' '], "");
                Self::bump(&mut self.payment_by_tender, &tender, minor("amountMinor"));
            }
            "stockMovements" => self.stock_movements += 1,
            "tillSessions" => {
                self.till_count += 1;
                let expected = data["expectedCashInDrawerMinor"].as_i64().unwrap_or_else(||
                    (data["expectedCashInDrawer"].as_f64().unwrap_or(0.0)*100.0).round() as i64);
                match data["status"].as_str() {
                    Some("OPEN") => self.open_till_minor += expected,
                    _ => self.closed_till_minor += expected,
                }
            }
            "customerCreditEntries" => {
                self.credit_entries += 1;
                self.credit_outstanding_minor += minor("balanceDeltaMinor");
            }
            "supplierPayables" => {
                self.payable_outstanding_minor += minor("outstandingMinor").max(0);
            }
            "receiptDocuments" => self.receipt_total_minor += minor("totalMinor"),
            "orders" => self.order_total_minor += data["grandTotalMinor"].as_i64().or_else(||data["totalMinor"].as_i64())
                .unwrap_or_else(||(data["grandTotal"].as_f64().unwrap_or(0.0)*100.0).round() as i64).max(0),
            "stockItems" => {
                if let Some(map) = data["currentStock"].as_object() {
                    for quantity in map.values() {
                        self.stock_quantity += quantity.as_f64().unwrap_or(0.0);
                    }
                }
            }
            _ => {}
        }
    }
    fn to_json(&self) -> Value {
        let mut tenders = serde_json::Map::new();
        let mut sorted = self.payment_by_tender.clone();
        sorted.sort_by(|a, b| a.0.cmp(&b.0));
        for (name, amount) in sorted {
            tenders.insert(name, json!(amount));
        }
        json!({
            "paymentByTender":Value::Object(tenders),
            "stockQuantity":(self.stock_quantity*1_000_000.0).round()/1_000_000.0,
            "stockMovements":self.stock_movements,
            "tillCount":self.till_count,
            "openTillCashMinor":self.open_till_minor,
            "closedTillCashMinor":self.closed_till_minor,
            "creditEntries":self.credit_entries,
            "creditOutstandingMinor":self.credit_outstanding_minor,
            "payableOutstandingMinor":self.payable_outstanding_minor,
            "receiptTotalMinor":self.receipt_total_minor,
            "orderTotalMinor":self.order_total_minor,
        })
    }
}
/// Build an immutable, deterministic manifest of the current local business
/// state. The manifest hash is the cutover evidence: the server verifies that the
/// state it imported is the state this terminal intended to hand over.
pub fn cutover_manifest(db: &Connection) -> Result<Value> {
    let terminal = meta(db, "terminal_id")?.unwrap_or_default();
    let schema_version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(error)?;
    let mode = authority_mode(db)?;
    if mode == AuthorityMode::SharedV2 {
        return Err(
            "This terminal is already in shared v2 authority; there is no local state left to cut over"
                .into(),
        );
    }

    let mut collections = Vec::new();
    // A fixed export allowlist must not silently discard unhandled source collections.
    // Device setup stays local and is preserved by the checkpoint backup.
    let unsupported_collections: Vec<Value> = {
        let mut stmt=db.prepare("SELECT collection,COUNT(*) FROM records GROUP BY collection ORDER BY collection").map_err(error)?;
        let rows=stmt.query_map([],|row|Ok((row.get::<_,String>(0)?,row.get::<_,i64>(1)?))).map_err(error)?;
        let mut unsupported=Vec::new();
        for row in rows {
            let (collection,count)=row.map_err(error)?;
            if !IMPORT_COLLECTIONS.contains(&collection.as_str()) && !["installationProfile","businessSetup"].contains(&collection.as_str()) {
                unsupported.push(json!({"collection":collection,"recordCount":count}));
            }
        }
        unsupported
    };
    let mut totals = Totals::default();
    let mut record_total = 0i64;

    for collection in IMPORT_COLLECTIONS {
        let rows: Vec<(String, i64, String, i64)> = {
            let mut stmt = db
                .prepare("SELECT id,version,data,archived FROM records WHERE collection=? ORDER BY id")
                .map_err(error)?;
            let collected = stmt
                .query_map([collection], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
                .map_err(error)?
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(error)?;
            collected
        };

        let mut entries = Vec::new();
        let mut digest = Sha256::new();
        let active = rows.iter().filter(|row| row.3 == 0).count() as i64;
        let archived = rows.len() as i64 - active;
        for (id, version, data, archived_flag) in &rows {
            let parsed: Value = serde_json::from_str(data).map_err(error)?;
            reject_secret_keys(&parsed)?;
            let hash = record_hash(collection, id, *version, &parsed);
            digest.update(hash.as_bytes());
            // Archived records are still hashed, so the manifest proves they were
            // seen, but they contribute nothing to the active control totals.
            entries.push(json!({"id":id,"version":version,"archived":*archived_flag!=0,"hash":hash}));
            if *archived_flag == 0 {
                totals.absorb(collection, &parsed);
            }
        }
        digest.update(active.to_string().as_bytes());
        record_total += active;
        collections.push(json!({
            "collection":collection,
            "activeCount":active,
            "archivedCount":archived,
            "collectionHash":format!("{:x}",digest.finalize()),
            "records":entries,
        }));
    }

    // Sequence bounds and outbox disposition travel with the manifest so the
    // server can prove nothing was silently dropped.
    let legacy_sequence: i64 = db
        .query_row("SELECT COALESCE(MAX(sequence),0) FROM outbox", [], |r| r.get(0))
        .map_err(error)?;
    let audit_count: i64 = db.query_row("SELECT COUNT(*) FROM audit", [], |r| r.get(0)).map_err(error)?;

    let body = json!({
        "schemaVersion":1,
        "terminalId":terminal,
        "sqliteSchemaVersion":schema_version,
        "authorityMode":mode.as_str(),
        "recordCount":record_total,
        "legacyOutboxMaxSequence":legacy_sequence,
        "legacyAuditCount":audit_count,
        "unresolvedLegacyCommands":unresolved_legacy_outbox(db)?,
        "collections":collections,
        "unsupportedCollections":unsupported_collections,
        "totals":totals.to_json(),
    });
    reject_secret_keys(&body)?;
    let manifest_hash = sha256_hex(canonical_json(&body).as_bytes());
    let mut manifest = body;
    manifest["generatedAt"] = json!(now());
    manifest["manifestHash"] = json!(manifest_hash);
    Ok(manifest)
}

/// Read one import page for a collection, ordered by id so paging is stable and a
/// retried page returns identical content.
pub fn cutover_page(
    db: &Connection,
    collection: &str,
    after_id: &str,
    page_size: usize,
) -> Result<Value> {
    if !IMPORT_COLLECTIONS.contains(&collection) {
        return Err(format!("Collection '{collection}' is not eligible for cutover import"));
    }
    if page_size == 0 || page_size > MAX_PAGE_RECORDS {
        return Err(format!("Cutover page size must be between 1 and {MAX_PAGE_RECORDS}"));
    }
    let rows: Vec<(String, i64, String, i64)> = {
        let mut stmt = db
            .prepare(
                "SELECT id,version,data,archived FROM records WHERE collection=? AND id>? ORDER BY id LIMIT ?",
            )
            .map_err(error)?;
        let collected = stmt
            .query_map(rusqlite::params![collection, after_id, page_size as i64 + 1], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .map_err(error)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(error)?;
        collected
    };

    let has_more = rows.len() > page_size;
    let mut records = Vec::new();
    let mut last_id = after_id.to_string();
    for (id, version, data, archived) in rows.into_iter().take(page_size) {
        let parsed: Value = serde_json::from_str(&data).map_err(error)?;
        reject_secret_keys(&parsed)?;
        records.push(json!({
            "id":id,
            "version":version,
            "archived":archived!=0,
            "data":parsed,
            "source":"LEGACY_SQLITE_CUTOVER",
            "hash":record_hash(collection,&id,version,&parsed),
        }));
        last_id = id;
    }
    Ok(json!({
        "collection":collection,
        "records":records,
        "afterId":last_id,
        "hasMore":has_more,
        "pageSize":page_size,
        "historyCollection":HISTORY_COLLECTIONS.contains(&collection),
    }))
}

/// Active record count for one collection, used to verify an import completed.
pub fn cutover_collection_count(db: &Connection, collection: &str) -> Result<i64> {
    db.query_row(
        "SELECT COUNT(*) FROM records WHERE collection=? AND archived=0",
        [collection],
        |r| r.get(0),
    )
    .map_err(error)
}
