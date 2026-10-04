use servos_domain_tests::store;
use serde_json::json;

// Disposable, synthetic cross-runtime fixture. Never opens an installed database.
fn main() {
    let directory=tempfile::tempdir().unwrap();
    let mut db=store::open(&directory.path().join("fixture.sqlite")).unwrap();
    store::set_meta(&db,"terminal_id","10000000-0000-4000-8000-000000000001").unwrap();
    if std::env::args().any(|arg|arg=="--baseline") {
        use std::io::Read;
        let mut input=String::new();std::io::stdin().read_to_string(&mut input).unwrap();
        let input:serde_json::Value=serde_json::from_str(&input).unwrap();
        let device=input["deviceId"].as_str().unwrap();let business=input["businessId"].as_str().unwrap();let policy=input["policyVersion"].as_str().unwrap();let cursor=input["cursor"].as_i64().unwrap();
        db.execute("UPDATE authority_state SET mode='CUTOVER_PREP' WHERE singleton=1",[]).unwrap();
        store::seed_native_v2_state(&db,&json!({"deviceId":device,"businessId":business,"lastSequence":0,"cursor":cursor})).unwrap();
        store::install_native_v2_snapshot(&mut db,device,business,cursor,policy,input["records"].as_array().unwrap()).unwrap();
        println!("{}",store::verify_native_v2_baseline(&db,device,business,policy,cursor).unwrap());
        return;
    }
    store::set_meta(&db,"order_sequence","700").unwrap();
    store::set_meta(&db,"receipt_sequence","900").unwrap();
    let rows=[
        ("customers","unicode",json!({"id":"unicode","name":"Mũsau \"guest\"","nested":{"z":1.0,"a":[0.000001,-0.0,1e20]}}),false),
        ("customers","archived",json!({"id":"archived","name":"Historical Guest"}),true),
        ("stockItems","fractional",json!({"id":"fractional","name":"Measured stock","currentStock":{"main":6.125001,"bar":0.000001}}),false),
        ("tillSessions","closed-till",json!({"id":"closed-till","status":"CLOSED","expectedCashInDrawer":12.34}),false),
        ("orders","closed-order",json!({"id":"closed-order","orderNumber":"ORD-000500","state":"COMPLETED","grandTotal":1250.25}),false),
        ("receiptDocuments","historical-receipt",json!({"id":"historical-receipt","number":"R-000950","orderId":"closed-order","totalMinor":5000,"brandingSnapshot":{"version":7,"footerLines":["Original immutable footer"],"tillQr":{"source":"Synthetic historical QR fixture"}}}),true),
        ("property","property",json!({"id":"property","name":"Existing Property","currency":"KES"}),false),
        ("customerCreditAccounts","credit-account",json!({"id":"credit-account","customerId":"unicode","limitMinor":100000,"status":"HOLD"}),false),
        ("customerCreditEntries","credit-charge",json!({"id":"credit-charge","customerId":"unicode","creditAccountId":"credit-account","kind":"CHARGE","balanceDeltaMinor":5000,"amountMinor":5000,"sourceType":"ORDER","sourceId":"closed-order","actorId":"original-staff","occurredAt":"2026-10-01T12:00:00Z"}),false),
        ("customerCreditEntries","credit-payment",json!({"id":"credit-payment","customerId":"unicode","creditAccountId":"credit-account","kind":"SETTLEMENT","balanceDeltaMinor":-2000,"amountMinor":2000,"sourceType":"CASH","sourceId":"original-payment","actorId":"original-staff","occurredAt":"2026-10-01T13:00:00Z"}),false),
        ("mpesaReceipts","manual-receipt",json!({"id":"manual-receipt","code":"SYNTHETIC123","account":"till","receivedAmount":50.25,"allocatedAmount":20.00,"receivedAt":"2026-10-01T13:00:00Z","reconciliationStatus":"DISCREPANCY","cashierId":"original-staff"}),false),
        ("mpesaDiscrepancies","manual-discrepancy",json!({"id":"manual-discrepancy","receiptId":"manual-receipt","receivedAmount":50.25,"statementAmount":50.00,"variance":-0.25,"statementReference":"fixture-statement","reason":"Statement differs","status":"OPEN","openedAt":"2026-10-01T14:00:00Z"}),false),
        ("customerCreditReconciliations","credit-reviewed",json!({"id":"credit-reviewed","customerId":"unicode","expectedBalanceMinor":3000,"statementBalanceMinor":3000,"reference":"fixture-credit-statement","notes":"Original review","reviewedAt":"2026-10-01T14:00:00Z"}),false),
        ("customerCreditDiscrepancies","credit-discrepancy",json!({"id":"credit-discrepancy","customerId":"unicode","expectedBalanceMinor":3000,"statementBalanceMinor":2900,"differenceMinor":-100,"reference":"fixture-credit-difference","status":"OPEN","openedAt":"2026-10-01T15:00:00Z"}),false),
    ];
    for(collection,id,data,archived)in rows {
        db.execute("INSERT INTO records(collection,id,version,data,archived) VALUES(?,?,3,?,?)",rusqlite::params![collection,id,data.to_string(),archived]).unwrap();
    }
    let manifest=store::cutover::cutover_manifest(&db).unwrap();
    let mut pages=Vec::new();
    for collection in store::cutover::IMPORT_COLLECTIONS {
        let page=store::cutover::cutover_page(&db,collection,"",500).unwrap();
        if !page["records"].as_array().unwrap().is_empty(){pages.push(page);}
    }
    println!("{}",json!({"manifest":manifest,"pages":pages}));
}
