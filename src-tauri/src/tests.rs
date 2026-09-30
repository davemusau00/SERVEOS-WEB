use super::store::*;
use serde_json::{json, Value};
use uuid::Uuid;

#[test]
fn native_roles_fail_closed_for_unknown_and_do_not_inherit_server_access() {
    for role in ["Admin", "Manager", "Cashier", "Server", "Chef", "Housekeeper", "Accountant", "Custom"] {
        assert!(!permissions(role).is_empty(), "role should have an explicit profile: {role}");
    }
    assert!(!permissions("Chef").contains(&"pos.sell"));
    assert!(!permissions("Housekeeper").contains(&"till.open"));
    assert!(permissions("Admin").contains(&"till.cashMovement"));
    assert!(!permissions("Admin").contains(&"till.cash_movement"));
    assert!(permissions("not-a-role").is_empty());
}

fn setup() -> (tempfile::TempDir, rusqlite::Connection, Session) {
    let dir = tempfile::tempdir().unwrap();
    let mut db = open(&dir.path().join("test.sqlite")).unwrap();
    initialize(&mut db, "terminal-test", "Owner", "827193", "Test business").unwrap();
    let user: String = db.query_row("SELECT id FROM staff", [], |r| r.get(0)).unwrap();
    let session = login(&db, &user, "827193").unwrap();

    let (property_version, mut property) = get(&db, "property", "property").unwrap();
    property["taxConfigured"] = json!(true); property["pricesIncludeTax"] = json!(true);
    property["vatRatePct"] = json!(0); property["levyRatePct"] = json!(0);
    let mut save_property = cmd("record.save", json!({"collection":"property","id":"property","data":property}));
    save_property.target_version = Some(property_version); execute(&mut db, &session.token, save_property).unwrap();
    run(&mut db,&session,"record.save",json!({"collection":"stockLocations","id":"main","data":{"name":"Main Store","code":"MAIN","baseUnit":"unit"}}));
    run(&mut db,&session,"record.save",json!({"collection":"outlets","id":"main","data":{"name":"Main Bar","propertyId":"property","type":"BAR","active":true,"defaultStockLocationId":"main"}}));
    run(&mut db,&session,"record.save",json!({"collection":"paymentConfig","id":"main","data":{"name":"Payments","methods":["CASH","MPESA","CARD"],"mpesaAccounts":[{"label":"Primary","number":"123456"}]}}));
    run(&mut db,&session,"record.save",json!({"collection":"tillPolicy","id":"main","data":{"name":"Till policy","defaultOpeningFloat":0,"varianceThreshold":50}}));
    set_meta(&db, "last_backup", "2026-09-26T00:00:00Z").unwrap();
    run(&mut db,&session,"record.save",json!({"collection":"products","id":"setup-product","data":{"name":"Setup Product","code":"SETUP","price":1,"routeTo":"SERVICE","category":"TEST","outletIds":["main"],"taxClassId":"A_STANDARD"}}));
    run(&mut db,&session,"roomType.save",json!({"id":"setup-room-type","data":{"name":"Standard room","code":"STD","maxGuests":2}}));
    run(&mut db,&session,"ratePlan.save",json!({"id":"setup-rate","data":{"name":"Standard nightly","roomTypeId":"setup-room-type","mode":"NIGHTLY","priceMinor":15000,"currency":"KES","taxBasisPoints":0}}));
    let property_version=get(&db,"property","property").unwrap().0;
    run(&mut db,&session,"roomStay.settings",json!({"propertyVersion":property_version,"roomTypeId":"setup-room-type","ratePlanId":"setup-rate","nightlyCheckoutTime":"10:00","dayStayCutoffTime":"18:00"}));
    for step in ["BUSINESS_IDENTITY","TAX","PAYMENTS","SERVICE_AREAS","STOCK_LOCATIONS","CATALOG","ROOM_STAYS","OPENING_INVENTORY","STAFF_ACCESS","TILL","BACKUP_SYNC"] {
        run(&mut db,&session,"setup.completeStep",json!({"step":step}));
    }
    run(&mut db,&session,"setup.goLive",json!({}));
    (dir, db, session)
}
fn cmd(op: &str, payload: Value) -> BusinessCommand {
    BusinessCommand {
        id: Uuid::new_v4().to_string(),
        schema_version: 1,
        operation: op.into(),
        target_version: None,
        payload,
    }
}
fn run(db: &mut rusqlite::Connection, s: &Session, op: &str, p: Value) -> Value {
    execute(db, &s.token, cmd(op, p)).unwrap()
}
fn configure_room_stay(db: &mut rusqlite::Connection, s: &Session, room_type_id: &str, rate_plan_id: &str) {
    let property_version = get(db, "property", "property").unwrap().0;
    run(db, s, "roomStay.settings", json!({"propertyVersion":property_version,"roomTypeId":room_type_id,"ratePlanId":rate_plan_id,"nightlyCheckoutTime":"10:00","dayStayCutoffTime":"18:00"}));
}

#[test]
fn guidance_progress_is_staff_scoped_durable_and_outside_business_outbox() {
    let (dir, mut db, admin) = setup();
    let before_outbox: i64 = db.query_row("SELECT COUNT(*) FROM outbox", [], |row| row.get(0)).unwrap();
    let progress=json!({"guideId":"servos.core","guideVersion":1,"state":"IN_PROGRESS","currentStepId":"help","completedStepIds":["workspace","status"]});
    save_guidance_progress(&db,&admin.token,progress.clone()).unwrap();
    assert_eq!(guidance_progress(&db,&admin.token).unwrap()[0]["completedStepIds"],json!(["workspace","status"]));
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap(),before_outbox);
    execute(&mut db,&admin.token,cmd("staff.create",json!({"name":"Server One","role":"Server","pin":"827194"}))).unwrap();
    let server_id: String=db.query_row("SELECT id FROM staff WHERE name='Server One'",[],|row|row.get(0)).unwrap();
    let server=login(&db,&server_id,"827194").unwrap();
    assert!(guidance_progress(&db,&server.token).unwrap().as_array().unwrap().is_empty());
    assert!(save_guidance_progress(&db,&server.token,json!({"guideId":"servos.core","guideVersion":1,"state":"COMPLETED","currentStepId":null,"completedStepIds":["workspace","status","help","staff"]})).is_ok());
    assert_eq!(guidance_progress(&db,&admin.token).unwrap()[0]["state"],"IN_PROGRESS");
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap(),before_outbox+1);
    assert!(save_guidance_progress(&db,&admin.token,json!({"guideId":"bad guide","guideVersion":1,"state":"IN_PROGRESS","currentStepId":null,"completedStepIds":[]})).is_err());
    drop(db);
    let reopened=open(&dir.path().join("test.sqlite")).unwrap();
    let admin_again=login(&reopened,&admin.staff_id,"827193").unwrap();
    assert_eq!(guidance_progress(&reopened,&admin_again.token).unwrap()[0]["guideId"],"servos.core");
}

#[test]
fn inventory_scanner_draft_is_persistent_staff_scoped_and_outside_business_outbox() {
    let (dir,mut db,admin)=setup();
    run(&mut db,&admin,"record.save",json!({"collection":"stockItems","id":"draft-stock","data":{"name":"Draft Stock","code":"DRAFT-STOCK","baseUnit":"bottle","scanUnitQuantity":6,"averageUnitCost":0,"currentStock":{"main":20}}}));
    run(&mut db,&admin,"inventory.adjust",json!({"stockItemId":"draft-stock","locationId":"main","countedQty":20,"reason":"Establish test ledger balance"}));
    let draft=json!({"sessionId":"test-draft","revision":1,"baseline":{"draft-stock":{"name":"Draft Stock","baseUnit":"bottle","scanUnitQuantity":6,"expectedQuantity":20}},"counts":{"draft-stock":12.0},"scanCounts":{"draft-stock":2},"unknownScans":[{"barcode":"UNKNOWN-42","count":3}]});
    let outbox_before:i64=db.query_row("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap();
    let saved=save_inventory_count_draft(&db,&admin.token,"main",draft.clone()).unwrap();
    assert_eq!(saved["counts"]["draft-stock"],12.0);
    assert_eq!(get(&db,"stockItems","draft-stock").unwrap().1["currentStock"]["main"],20.0);
    assert_eq!(list(&db,"stockMovements").unwrap().len(),1);
    assert_eq!(inventory_count_draft(&db,&admin.token,"main").unwrap()["unknownScans"][0]["count"],3);
    assert!(save_inventory_count_draft(&db,&admin.token,"main",json!({"counts":{"missing":1},"scanCounts":{},"unknownScans":[]})).is_err());
    assert!(save_inventory_count_draft(&db,&admin.token,"main",json!({"counts":{"draft-stock":0.0000001},"scanCounts":{},"unknownScans":[]})).is_err());

    run(&mut db,&admin,"staff.create",json!({"name":"Draft Server","role":"Server","pin":"492736"}));
    let server_id:String=db.query_row("SELECT id FROM staff WHERE name='Draft Server'",[],|row|row.get(0)).unwrap();
    let server=login(&db,&server_id,"492736").unwrap();
    assert!(inventory_count_draft(&db,&server.token,"main").unwrap().is_null());
    save_inventory_count_draft(&db,&server.token,"main",json!({"sessionId":"server-draft","revision":1,"baseline":{},"counts":{},"scanCounts":{},"unknownScans":[]})).unwrap();
    assert_eq!(inventory_count_draft(&db,&admin.token,"main").unwrap()["counts"]["draft-stock"],12.0);
    assert_eq!(inventory_count_draft(&db,&server.token,"main").unwrap()["counts"],json!({}));

    drop(server); drop(admin); drop(db);
    let reopened=open(&dir.path().join("test.sqlite")).unwrap();
    let admin_id:String=reopened.query_row("SELECT id FROM staff WHERE name='Owner'",[],|row|row.get(0)).unwrap();
    let admin_again=login(&reopened,&admin_id,"827193").unwrap();
    assert_eq!(inventory_count_draft(&reopened,&admin_again.token,"main").unwrap()["counts"]["draft-stock"],12.0);
    clear_inventory_count_draft(&reopened,&admin_again.token,"main").unwrap();
    assert!(inventory_count_draft(&reopened,&admin_again.token,"main").unwrap().is_null());
    assert_eq!(reopened.query_row::<i64,_,_>("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap(),outbox_before+1);
}

#[test]
fn schema_ten_upgrades_to_thirteen_for_scanner_drafts_and_credit() {
    let dir=tempfile::tempdir().unwrap();
    let path=dir.path().join("upgrade.sqlite");
    let db=open(&path).unwrap();
    db.execute_batch("DROP TABLE inventory_count_closed_sessions; DROP TABLE inventory_count_drafts; PRAGMA user_version=10;").unwrap();
    drop(db);
    let upgraded=open(&path).unwrap();
    let version:i64=upgraded.query_row("PRAGMA user_version",[],|row|row.get(0)).unwrap();
    assert_eq!(version,13);
    assert!(upgraded.query_row("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_count_drafts'",[],|row|row.get::<_,String>(0)).is_ok());
}

#[test]
fn scanner_review_is_atomic_replayable_and_cannot_be_resurrected() {
    let (_dir,mut db,admin)=setup();
    run(&mut db,&admin,"record.save",json!({"collection":"stockItems","id":"scan","data":{"name":"Scan","code":"SCAN","baseUnit":"bottle","scanUnitQuantity":1,"averageUnitCost":0}}));
    run(&mut db,&admin,"inventory.adjust",json!({"stockItemId":"scan","locationId":"main","countedQty":20,"reason":"Fixture ledger"}));
    let mut draft=json!({"sessionId":"session-one","revision":1,"locationId":"main","baseline":{"scan":{"name":"Scan","baseUnit":"bottle","scanUnitQuantity":1,"expectedQuantity":20}},"counts":{"scan":18},"scanCounts":{"scan":18},"unknownScans":[]});
    save_inventory_count_draft(&db,&admin.token,"main",draft.clone()).unwrap();
    save_inventory_count_draft(&db,&admin.token,"main",draft.clone()).unwrap();
    let mut conflicting=draft.clone(); conflicting["counts"]["scan"]=json!(17);
    assert!(save_inventory_count_draft(&db,&admin.token,"main",conflicting).is_err());
    let command=cmd("inventory.countLocation",json!({"locationId":"main","draftSessionId":"session-one","draftRevision":2,"rows":[{"stockItemId":"scan","expectedQuantity":20,"countedQuantity":18}]}));
    draft["revision"]=json!(2); draft["pendingCommand"]=json!({"id":command.id,"payload":command.payload});
    save_inventory_count_draft(&db,&admin.token,"main",draft.clone()).unwrap();
    let mut edited=draft.clone(); edited["revision"]=json!(3);
    assert!(save_inventory_count_draft(&db,&admin.token,"main",edited).is_err());
    let first=execute(&mut db,&admin.token,command.clone()).unwrap();
    assert!(inventory_count_draft(&db,&admin.token,"main").unwrap().is_null());
    assert!(save_inventory_count_draft(&db,&admin.token,"main",draft).is_err());
    assert_eq!(execute(&mut db,&admin.token,command).unwrap(),first);
    assert_eq!(list(&db,"stockCounts").unwrap().len(),1);
    assert_eq!(get(&db,"stockItems","scan").unwrap().1["currentStock"]["main"],18.0);
}

#[test]
fn scanner_failed_commit_retains_review_and_catalog_changes_require_recount() {
    let (_dir,mut db,admin)=setup();
    run(&mut db,&admin,"record.save",json!({"collection":"stockItems","id":"scan","data":{"name":"Scan","code":"SCAN","baseUnit":"bottle","scanUnitQuantity":1,"averageUnitCost":0}}));
    let command=cmd("inventory.countLocation",json!({"locationId":"main","draftSessionId":"session-two","draftRevision":1,"rows":[{"stockItemId":"scan","expectedQuantity":0,"countedQuantity":2}]}));
    let draft=json!({"sessionId":"session-two","revision":1,"baseline":{"scan":{"name":"Old name","baseUnit":"bottle","scanUnitQuantity":1,"expectedQuantity":0}},"counts":{"scan":2},"scanCounts":{"scan":2},"unknownScans":[],"pendingCommand":{"id":command.id,"payload":command.payload}});
    save_inventory_count_draft(&db,&admin.token,"main",draft).unwrap();
    assert!(execute(&mut db,&admin.token,command).unwrap_err().contains("catalog changed"));
    assert!(!inventory_count_draft(&db,&admin.token,"main").unwrap().is_null());
    assert!(list(&db,"stockCounts").unwrap().is_empty());
    assert!(list(&db,"stockMovements").unwrap().is_empty());
}

#[test]
fn ad_hoc_delivery_is_atomic_authorized_and_idempotent() {
    let (_dir,mut db,admin)=setup();
    run(&mut db,&admin,"record.save",json!({"collection":"suppliers","id":"supplier","data":{"name":"Supplier","code":"SUPPLIER"}}));
    run(&mut db,&admin,"record.save",json!({"collection":"stockItems","id":"delivery-stock","data":{"name":"Delivery Stock","code":"DELIVERY","baseUnit":"bottle","scanUnitQuantity":1,"averageUnitCost":0}}));
    let payload=json!({"supplierId":"supplier","supplierInvoiceNumber":"INV-1","locationId":"main","lines":[{"stockItemId":"delivery-stock","quantityDelivered":12,"quantityRejected":2,"rejectionReason":"Broken","unitPrice":60}]});
    let mut invalid=payload.clone(); invalid["locationId"]=json!("missing");
    assert!(execute(&mut db,&admin.token,cmd("procurement.receiveDelivery",invalid)).is_err());
    for collection in ["purchaseOrders","goodsReceipts","supplierPayables","journalEntries","stockMovements"] { assert!(list(&db,collection).unwrap().is_empty(),"{collection}"); }
    run(&mut db,&admin,"staff.create",json!({"name":"Receiver","role":"Server","pin":"492736"}));
    let staff_id:String=db.query_row("SELECT id FROM staff WHERE name='Receiver'",[],|r|r.get(0)).unwrap();
    let receiver=login(&db,&staff_id,"492736").unwrap();
    assert!(execute(&mut db,&receiver.token,cmd("procurement.receiveDelivery",payload.clone())).unwrap_err().contains("Purchasing and receiving"));
    let command=cmd("procurement.receiveDelivery",payload);
    let first=execute(&mut db,&admin.token,command.clone()).unwrap();
    assert_eq!(execute(&mut db,&admin.token,command).unwrap(),first);
    assert_eq!(get(&db,"stockItems","delivery-stock").unwrap().1["currentStock"]["main"],10.0);
    for collection in ["purchaseOrders","goodsReceipts","supplierPayables","journalEntries","stockMovements"] { assert_eq!(list(&db,collection).unwrap().len(),1,"{collection}"); }
    assert_eq!(list(&db,"supplierPayables").unwrap()[0]["data"]["amount"],600.0);
}

#[test]
fn simple_rooms_and_property_share_existing_domain_safeguards() {
    let (_dir,mut db,admin)=setup();
    let command=cmd("room.quickCreate",json!({"numbers":["104","105"],"newType":{"name":"Standard","capacity":2,"nightlyPrice":3500}}));
    let first=execute(&mut db,&admin.token,command.clone()).unwrap();
    assert_eq!(execute(&mut db,&admin.token,command).unwrap(),first);
    assert_eq!(list(&db,"rooms").unwrap().len(),2);
    assert_eq!(list(&db,"roomTypes").unwrap().len(),2);
    assert_eq!(list(&db,"ratePlans").unwrap().len(),2);
    assert!(execute(&mut db,&admin.token,cmd("room.quickCreate",json!({"numbers":["106","104"],"newType":{"name":"Must rollback","capacity":2,"nightlyPrice":100}}))).is_err());
    assert_eq!(list(&db,"rooms").unwrap().len(),2);
    assert_eq!(list(&db,"roomTypes").unwrap().len(),2);
    // Validation late in the orchestration also rolls back the new type and rate.
    assert!(execute(&mut db,&admin.token,cmd("room.quickCreate",json!({"numbers":["106"],"newType":{"name":"Invalid room","capacity":2,"nightlyPrice":100},"details":{"capacity":3}}))).is_err());
    assert_eq!(list(&db,"roomTypes").unwrap().len(),2);
    let room_id=list(&db,"rooms").unwrap()[0]["id"].as_str().unwrap().to_string();
    run(&mut db,&admin,"asset.quickCreate",json!({"name":"Samsung TV","roomId":room_id}));
    let assets=list(&db,"assets").unwrap();
    assert_eq!(assets.len(),1);
    assert!(assets[0]["data"]["tag"].as_str().unwrap().starts_with("PROP-"));
    assert_eq!(assets[0]["data"]["custodianId"],Value::Null);
    assert!(list(&db,"stockMovements").unwrap().is_empty());
    assert!(list(&db,"journalEntries").unwrap().is_empty());
    run(&mut db,&admin,"maintenance.report",json!({"id":"room-problem","roomId":room_id,"description":"Tap leaking","priority":"MEDIUM"}));
    assert_eq!(get(&db,"maintenanceOrders","room-problem").unwrap().1["status"],"REPORTED");
}

#[test]
fn schema_eleven_upgrade_preserves_enrollment_ledger_and_legacy_drafts() {
    let (dir,db,admin)=setup();
    set_meta(&db,"cloud_url","https://retained.supabase.co").unwrap();
    set_meta(&db,"device_token","fixture-device-token").unwrap();
    db.execute("INSERT INTO inventory_count_drafts(staff_id,location_id,payload,updated_at) VALUES(?,'main',?,?)",rusqlite::params![admin.staff_id,json!({"locationId":"main","counts":{},"scanCounts":{},"unknownScans":[]}).to_string(),"2026-09-28T00:00:00Z"]).unwrap();
    let records=list(&db,"products").unwrap();
    let outbox:i64=db.query_row("SELECT COUNT(*) FROM outbox",[],|r|r.get(0)).unwrap();
    db.execute_batch("DROP TABLE inventory_count_closed_sessions; PRAGMA user_version=11;").unwrap();
    drop(db);
    let upgraded=open(&dir.path().join("test.sqlite")).unwrap();
    assert_eq!(meta(&upgraded,"terminal_id").unwrap().as_deref(),Some("terminal-test"));
    assert_eq!(meta(&upgraded,"device_token").unwrap().as_deref(),Some("fixture-device-token"));
    assert_eq!(installation_stage(&upgraded).unwrap(),"LIVE");
    assert_eq!(list(&upgraded,"products").unwrap(),records);
    assert_eq!(upgraded.query_row::<i64,_,_>("SELECT COUNT(*) FROM outbox",[],|r|r.get(0)).unwrap(),outbox);
    assert_eq!(inventory_count_draft(&upgraded,&admin.token,"main").unwrap()["counts"],json!({}));
    let audit=production_health_audit(&upgraded,&admin.token).unwrap();
    assert_eq!(audit["installation"]["projectHostname"],"retained.supabase.co");
    assert!(!audit.to_string().contains("fixture-device-token"));
}
fn order(db: &mut rusqlite::Connection, s: &Session) -> String {
    let product = Uuid::new_v4().to_string();
    run(
        db,
        s,
        "record.save",
        json!({"collection":"products","id":product,"data":{"name":"Service","code":product,"price":100,"routeTo":"SERVICE","outletIds":["main"]}}),
    );
    let result = run(db, s, "order.create", json!({"name":"Walk-in","outletId":"main"}));
    let id = result["recordIds"][0].as_str().unwrap().to_string();
    run(
        db,
        s,
        "order.addItem",
        json!({"orderId":id,"productId":product}),
    );
    id
}
#[test]
fn duplicate_payment_is_idempotent_and_survives_restart() {
    let (dir, mut db, s) = setup();
    run(&mut db, &s, "till.open", json!({"floatAmount":200}));
    let id = order(&mut db, &s);
    let payment = cmd(
        "payment.record",
        json!({"orderId":id,"method":"CASH","amount":100,"cashTendered":100}),
    );
    let first = execute(&mut db, &s.token, payment.clone()).unwrap();
    assert_eq!(first, execute(&mut db, &s.token, payment).unwrap());
    assert_eq!(list(&db, "payments").unwrap().len(), 1);
    assert_eq!(list(&db, "journalEntries").unwrap().len(), 1);
    assert_eq!(get(&db, "orders", &id).unwrap().1["amountPaid"], 100.0);
    drop(db);
    let reopened = open(&dir.path().join("test.sqlite")).unwrap();
    assert_eq!(list(&reopened, "payments").unwrap().len(), 1);
}

#[test]
fn receipt_is_atomic_immutable_and_keeps_cash_header_and_partial_history() {
    let (dir,mut db,s)=setup();
    run(&mut db,&s,"till.open",json!({"floatAmount":200}));
    let oid=order(&mut db,&s);
    let first=cmd("payment.record",json!({"orderId":oid,"method":"CASH","amount":40,"cashTendered":50}));
    execute(&mut db,&s.token,first.clone()).unwrap();
    execute(&mut db,&s.token,first).unwrap();
    let original=receipts::load(&db,&s.token,&oid,None).unwrap();
    assert_eq!(original["balanceMinor"],6000);
    assert_eq!(original["payments"][0]["cashTenderedMinor"],5000);
    assert_eq!(original["payments"][0]["changeMinor"],1000);
    assert_eq!(list(&db,"receiptDocuments").unwrap().len(),1);
    let (version,mut business)=get(&db,"organization","business").unwrap();
    business["name"]=json!("Changed business");
    let mut update=cmd("record.save",json!({"collection":"organization","id":"business","data":business}));update.target_version=Some(version);
    execute(&mut db,&s.token,update).unwrap();
    run(&mut db,&s,"payment.split",json!({"orderId":oid,"payments":[{"method":"CASH","amount":20,"cashTendered":20},{"method":"CARD","amount":40,"cardAuthCode":"APPROVED-1"}]}));
    let latest=receipts::load(&db,&s.token,&oid,None).unwrap();
    assert_eq!(latest["balanceMinor"],0);
    assert_eq!(latest["payments"].as_array().unwrap().len(),3);
    assert_eq!(latest["business"]["name"],"Changed business");
    let original_id=original["id"].as_str().unwrap();
    assert_eq!(receipts::load(&db,&s.token,&oid,Some(original_id)).unwrap(),original);
    assert!(db.execute("UPDATE records SET data='{}' WHERE collection='receiptDocuments'",[]).is_err());
    assert!(db.execute("DELETE FROM records WHERE collection='receiptDocuments'",[]).is_err());
    assert!(receipts::load(&db,&s.token,"other-order",Some(original_id)).is_err());
    let lines=receipts::lines(&latest,false,48,true).join("\n");
    for footer in receipts::FOOTER{assert!(lines.contains(footer));}
    assert!(lines.contains("REPRINT"));assert!(!lines.contains("eTIMS"));
    drop(db);
    let reopened=open(&dir.path().join("test.sqlite")).unwrap();
    assert_eq!(get(&reopened,"receiptDocuments",original_id).unwrap().1,original);
}

#[test]
fn failed_split_captures_no_receipt_or_payment() {
    let (_dir,mut db,s)=setup();run(&mut db,&s,"till.open",json!({"floatAmount":0}));let oid=order(&mut db,&s);
    let result=execute(&mut db,&s.token,cmd("payment.split",json!({"orderId":oid,"payments":[{"method":"CASH","amount":50,"cashTendered":50},{"method":"CARD","amount":50,"cardAuthCode":""}]})));
    assert!(result.is_err());assert!(list(&db,"payments").unwrap().is_empty());assert!(list(&db,"receiptDocuments").unwrap().is_empty());
}

#[test]
fn business_identity_is_atomic_versioned_and_printer_policy_is_validated() {
    let (_dir,mut db,s)=setup();let (ov,_)=get(&db,"organization","business").unwrap();let(pv,_)=get(&db,"property","property").unwrap();
    let update=cmd("business.identity",json!({"organizationVersion":ov,"propertyVersion":pv,"data":{"name":"Updated","legalName":"Updated Ltd","registrationNumber":"REG","address":"Nairobi","phone":"0700000000","email":"hello@example.test"}}));
    execute(&mut db,&s.token,update).unwrap();assert_eq!(get(&db,"organization","business").unwrap().1["name"],"Updated");assert_eq!(get(&db,"property","property").unwrap().1["phone"],"0700000000");
    assert!(execute(&mut db,&s.token,cmd("business.identity",json!({"organizationVersion":ov,"propertyVersion":pv,"data":{"name":"Stale"}}))).is_err());
    let(version,mut policy)=get(&db,"tillPolicy","main").unwrap();policy["receiptPaperColumns"]=json!(5);
    let mut invalid=cmd("record.save",json!({"collection":"tillPolicy","id":"main","data":policy}));invalid.target_version=Some(version);
    assert!(execute(&mut db,&s.token,invalid).is_err());assert_eq!(get(&db,"tillPolicy","main").unwrap().0,version);
}

#[test]
fn room_stay_policy_uses_one_rate_and_enforces_nightly_checkout_and_day_cutoff() {
    let (_dir,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"customers","id":"stay-guest","data":{"name":"Stay Guest"}}));
    run(&mut db,&s,"roomType.save",json!({"id":"stay-type","data":{"name":"Stay room","code":"STAY","maxGuests":2}}));
    run(&mut db,&s,"ratePlan.save",json!({"id":"stay-rate","data":{"name":"Room stay","roomTypeId":"stay-type","mode":"NIGHTLY","priceMinor":10000,"currency":"KES","taxBasisPoints":0}}));
    run(&mut db,&s,"room.save",json!({"id":"stay-room","data":{"number":"STAY-1","roomTypeId":"stay-type","capacity":2,"turnaroundMinutes":0}}));
    let (property_version,mut property)=get(&db,"property","property").unwrap();
    property["roomStayRoomTypeId"]=Value::Null;property["roomStayRatePlanId"]=Value::Null;
    let mut clear_policy=cmd("record.save",json!({"collection":"property","id":"property","data":property}));
    clear_policy.target_version=Some(property_version);execute(&mut db,&s.token,clear_policy).unwrap();
    let missing_rate=execute(&mut db,&s.token,cmd("roomReservation.create",json!({"id":"missing-rate","roomId":"stay-room","customerId":"stay-guest","guests":1,"stayType":"NIGHTLY","startsAt":"2030-01-01T14:00:00+03:00","endsAt":"2030-01-02T10:00:00+03:00"}))).unwrap_err();
    assert!(missing_rate.contains("VALIDATION_FAILED: configure the room stay rate in Settings"));
    let property_version=get(&db,"property","property").unwrap().0;
    run(&mut db,&s,"roomStay.settings",json!({"propertyVersion":property_version,"roomTypeId":"stay-type","ratePlanId":"stay-rate","nightlyCheckoutTime":"10:00","dayStayCutoffTime":"18:00"}));
    run(&mut db,&s,"roomReservation.create",json!({"id":"night-stay","roomId":"stay-room","customerId":"stay-guest","guests":1,"stayType":"NIGHTLY","startsAt":"2030-01-01T14:00:00+03:00","endsAt":"2030-01-02T10:00:00+03:00"}));
    let bad_night=execute(&mut db,&s.token,cmd("roomReservation.create",json!({"id":"bad-night","roomId":"stay-room","customerId":"stay-guest","guests":1,"stayType":"NIGHTLY","startsAt":"2030-01-03T14:00:00+03:00","endsAt":"2030-01-04T11:00:00+03:00"}))).unwrap_err();
    assert!(bad_night.contains("nightly departure"));
    let bad_day=execute(&mut db,&s.token,cmd("roomReservation.create",json!({"id":"bad-day","roomId":"stay-room","customerId":"stay-guest","guests":1,"stayType":"DAY","startsAt":"2030-01-03T14:00:00+03:00","endsAt":"2030-01-03T18:30:00+03:00"}))).unwrap_err();
    assert!(bad_day.contains("day stay"));
}
#[test]
fn invalid_split_rolls_back_every_effect() {
    let (_, mut db, s) = setup();
    run(&mut db, &s, "till.open", json!({"floatAmount":0}));
    let id = order(&mut db, &s);
    let before: i64 = db
        .query_row("SELECT COUNT(*) FROM outbox", [], |r| r.get(0))
        .unwrap();
    let result = execute(
        &mut db,
        &s.token,
        cmd(
            "payment.split",
            json!({"orderId":id,"payments":[{"method":"CASH","amount":40,"cashTendered":40},{"method":"CARD","amount":60,"cardAuthCode":""}]}),
        ),
    );
    assert!(result.is_err());
    assert!(list(&db, "payments").unwrap().is_empty());
    assert!(list(&db, "journalEntries").unwrap().is_empty());
    assert_eq!(get(&db, "orders", &id).unwrap().1["amountPaid"], 0);
    assert_eq!(
        list(&db, "tillSessions").unwrap()[0]["data"]["cashSalesTotal"],
        0
    );
    assert_eq!(
        before,
        db.query_row("SELECT COUNT(*) FROM outbox", [], |r| r.get::<_, i64>(0))
            .unwrap()
    );
}
#[test]
fn receipt_allocation_prevents_double_spending() {
    let (_, mut db, s) = setup();
    run(&mut db, &s, "till.open", json!({"floatAmount":0}));
    let first = order(&mut db, &s);
    let second = order(&mut db, &s);
    let receipt = json!({"code":"ABC123XYZ","account":"123456","receivedAmount":100,"receivedAt":"2026-09-24T08:00:00+03:00","confirmed":true});
    run(
        &mut db,
        &s,
        "payment.record",
        json!({"orderId":first,"method":"MPESA","amount":100,"mpesa":receipt}),
    );
    assert!(execute(
        &mut db,
        &s.token,
        cmd(
            "payment.record",
            json!({"orderId":second,"method":"MPESA","amount":100,"mpesa":receipt})
        )
    )
    .is_err());
    assert_eq!(list(&db, "payments").unwrap().len(), 1);
    assert_eq!(list(&db, "mpesaReceipts").unwrap().len(), 1);
}

#[test]
fn mpesa_statement_variance_requires_audited_resolution() {
    let (_, mut db, s) = setup();
    run(&mut db, &s, "till.open", json!({"floatAmount":0}));
    let order_id = order(&mut db, &s);
    let receipt = json!({"code":"VAR123XYZ","account":"123456","receivedAmount":100,"receivedAt":"2026-09-24T08:00:00+03:00","confirmed":true});
    run(&mut db, &s, "payment.record", json!({"orderId":order_id,"method":"MPESA","amount":100,"mpesa":receipt}));
    let receipt_id = list(&db, "mpesaReceipts").unwrap()[0]["id"].as_str().unwrap().to_string();
    let mismatch = execute(&mut db, &s.token, cmd("mpesa.reconcile", json!({"receiptId":receipt_id,"statementAmount":90,"statementReference":"STMT-1","notes":"Difference"}))).unwrap_err();
    assert!(mismatch.to_string().contains("record and resolve the discrepancy"));
    run(&mut db, &s, "mpesa.discrepancy", json!({"receiptId":receipt_id,"statementAmount":90,"statementReference":"STMT-1","reason":"Account statement shows a partial amount"}));
    let discrepancy_id = list(&db, "mpesaDiscrepancies").unwrap()[0]["id"].as_str().unwrap().to_string();
    run(&mut db, &s, "mpesa.discrepancy.resolve", json!({"discrepancyId":discrepancy_id,"outcome":"ACCEPTED_VARIANCE","resolution":"Verified this statement line is a partial settlement"}));
    let wrong_amount = execute(&mut db, &s.token, cmd("mpesa.reconcile", json!({"receiptId":receipt_id,"statementAmount":80,"statementReference":"STMT-1","notes":"Wrong line"}))).unwrap_err();
    assert!(wrong_amount.to_string().contains("record and resolve the discrepancy"));
    run(&mut db, &s, "mpesa.reconcile", json!({"receiptId":receipt_id,"statementAmount":90,"statementReference":"STMT-1","notes":"Resolved accepted variance"}));
    assert_eq!(get(&db, "mpesaReceipts", &receipt_id).unwrap().1["reconciliationStatus"], "RECONCILED_WITH_DISCREPANCY");
    assert_eq!(get(&db, "mpesaDiscrepancies", &discrepancy_id).unwrap().1["status"], "RESOLVED");
}
#[test]
fn version_conflicts_cannot_overwrite_records() {
    let (_, mut db, s) = setup();
    let version = get(&db, "property", "property").unwrap().0;
    let mut update = cmd(
        "record.save",
        json!({"collection":"property","id":"property","data":{"name":"Changed"}}),
    );
    assert!(execute(&mut db, &s.token, update.clone()).is_err());
    update.target_version = Some(version);
    execute(&mut db, &s.token, update.clone()).unwrap();
    update.id = Uuid::new_v4().to_string();
    assert!(execute(&mut db, &s.token, update).is_err());
}
#[test]
fn server_cannot_edit_catalog_or_create_staff() {
    let (_, mut db, s) = setup();
    run(
        &mut db,
        &s,
        "staff.create",
        json!({"name":"Cashier","pin":"982761","role":"Server"}),
    );
    let staff: String = db
        .query_row("SELECT id FROM staff WHERE role='Server'", [], |r| r.get(0))
        .unwrap();
    let cashier = login(&db, &staff, "982761").unwrap();
    assert!(execute(
        &mut db,
        &cashier.token,
        cmd(
            "record.save",
            json!({"collection":"products","id":"p","data":{"name":"X","code":"X","price":1}})
        )
    )
    .is_err());
    assert!(execute(
        &mut db,
        &cashier.token,
        cmd(
            "staff.create",
            json!({"name":"Escalation","pin":"111111","role":"Admin"})
        )
    )
    .is_err());
}
#[test]
fn pin_throttling_is_persistent() {
    let (dir, db, s) = setup();
    for _ in 0..5 {
        assert!(login(&db, &s.staff_id, "000000").is_err());
    }
    drop(db);
    let reopened = open(&dir.path().join("test.sqlite")).unwrap();
    assert!(login(&reopened, &s.staff_id, "827193").is_err());
}
#[test]
fn production_health_audit_is_read_only_and_excludes_secrets() {
    let (_, db, s) = setup();
    set_meta(&db, "cloud_url", "https://example.supabase.co").unwrap();
    set_meta(&db, "cloud_key", "secret-cloud-key").unwrap();
    set_meta(&db, "device_token", "secret-device-token").unwrap();
    let before: (i64, i64, i64, i64) = db.query_row(
        "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    ).unwrap();
    let health = production_health_audit(&db, &s.token).unwrap();
    assert_eq!(health["mode"], "READ_ONLY_LOCAL_AUDIT");
    assert_eq!(health["database"]["quickCheck"], "ok");
    assert_eq!(health["installation"]["stage"], "LIVE");
    assert_eq!(health["installation"]["cloudConfigured"], true);
    assert!(health["records"]["manifest"].as_array().unwrap().len() > 0);
    let rendered = health.to_string();
    assert!(!rendered.contains("secret-cloud-key"));
    assert!(!rendered.contains("secret-device-token"));
    let after: (i64, i64, i64, i64) = db.query_row(
        "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    ).unwrap();
    assert_eq!(before, after);
}

// SERVOS_PATCH_02A_RECONCILIATION
#[test]
fn reconciliation_classifies_replica_drift_without_mutating_local_state() {
    let (_, db, s) = setup();

    let mut stmt = db.prepare("SELECT collection,id,version,data,archived FROM records ORDER BY collection,id").unwrap();
    let rows = stmt.query_map([], |r| Ok(json!({
        "collection": r.get::<_,String>(0)?,
        "id": r.get::<_,String>(1)?,
        "version": r.get::<_,i64>(2)?,
        "data": serde_json::from_str::<Value>(&r.get::<_,String>(3)?).unwrap(),
        "archived": r.get::<_,bool>(4)?,
    }))).unwrap();
    let mut cloud_records: Vec<Value> = rows.map(|r|r.unwrap()).collect();
    drop(stmt);

    db.execute("UPDATE records SET version=version+1 WHERE collection='products' AND id='setup-product'", []).unwrap();

    let property = cloud_records.iter_mut().find(|r|r["collection"]=="property"&&r["id"]=="property").unwrap();
    property["version"] = json!(property["version"].as_i64().unwrap()+1);

    let organization = cloud_records.iter_mut().find(|r|r["collection"]=="organization"&&r["id"]=="business").unwrap();
    organization["data"]["name"] = json!("Different cloud business");

    cloud_records.retain(|r| !(r["collection"]=="paymentConfig"&&r["id"]=="main"));
    cloud_records.push(json!({
        "collection":"customers","id":"cloud-only","version":1,
        "data":{"id":"cloud-only","name":"CLOUD SECRET CUSTOMER"},"archived":false
    }));

    let local_last: i64 = db.query_row("SELECT COALESCE(MAX(sequence),0) FROM outbox", [], |r|r.get(0)).unwrap();
    let cloud = json!({
        "mode":"READ_ONLY_CLOUD_REPLICA",
        "generatedAt":"2026-09-27T00:00:00Z",
        "terminal":{"id":"terminal-test","lastSequence":local_last,"lastSeen":"2026-09-27T00:00:00Z"},
        "operations":{"count":local_last},
        "records":cloud_records
    });

    let before: (i64,i64,i64,i64) = db.query_row(
        "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
        [], |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
    ).unwrap();
    let report = reconciliation_compare(&db,&s.token,&cloud).unwrap();
    let after: (i64,i64,i64,i64) = db.query_row(
        "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
        [], |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
    ).unwrap();

    assert_eq!(before,after);
    assert_eq!(report["mode"],"READ_ONLY_RECONCILIATION");
    assert!(report["summary"]["matched"].as_i64().unwrap()>0);
    assert_eq!(report["summary"]["localAhead"],1);
    assert_eq!(report["summary"]["cloudMissing"],1);
    assert_eq!(report["summary"]["cloudAhead"],2);
    assert_eq!(report["summary"]["diverged"],1);
    assert_eq!(report["controlTotals"]["matches"],false);
    assert!(report["controlTotals"]["local"]["collections"].get("products").is_some());
    assert!(report["controlTotals"]["local"]["movementQuantityMicros"].is_object());
    assert_eq!(report["cutoverReady"],false);
    assert!(!report.to_string().contains("CLOUD SECRET CUSTOMER"));
}

// SERVOS_PATCH_03_IMPORT_CENTER
#[test]
fn import_center_stages_valid_csv_without_mutating_business_history() {
    let (_, mut db, s)=setup();
    let before:(i64,i64,i64,i64)=db.query_row(
        "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
        [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
    ).unwrap();
    let csv="external_id,code,name,category,barcode,selling_price,taxable,route_to,outlet_external_ids,active\nproduct-import-1,IMP1,Imported Soda,Soft Drinks,616110000099,150.00,true,BAR,outlet-main,true\n";
    let batch=import_stage(&mut db,&s.token,"products","products.csv",csv).unwrap();
    assert_eq!(batch["status"],"READY");
    assert_eq!(batch["rowCount"],1);
    assert_eq!(batch["validCount"],1);
    assert_eq!(batch["invalidCount"],0);
    assert_eq!(batch["rows"][0]["normalized"]["selling_price"],150.0);
    assert_eq!(batch["rows"][0]["normalized"]["taxable"],true);
    let after:(i64,i64,i64,i64)=db.query_row(
        "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
        [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
    ).unwrap();
    assert_eq!(before,after);
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM import_batches",[],|r|r.get(0)).unwrap(),1);
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM import_events",[],|r|r.get(0)).unwrap(),1);
}
#[test]
fn import_center_preserves_invalid_rows_and_rejects_credentials() {
    let (_, mut db, s)=setup();
    let csv="external_id,code,name,selling_price,taxable\nproduct-import-1,IMP1,Bad Price,-5,maybe\nproduct-import-1,IMP2,Duplicate,10,true\n";
    let batch=import_stage(&mut db,&s.token,"products","products.csv",csv).unwrap();
    assert_eq!(batch["status"],"NEEDS_REVIEW");
    assert_eq!(batch["invalidCount"],2);
    assert!(batch["rows"][0]["errors"].as_array().unwrap().len()>=2);
    assert!(batch["rows"][1]["errors"].as_array().unwrap().iter().any(|v|v.as_str().unwrap().contains("external_id")));
    let secret="external_id,full_name,job_title,role,pin\nemployee-1,Jane,Duty Manager,MANAGER,1234\n";
    assert!(import_stage(&mut db,&s.token,"employees","employees.csv",secret).is_err());
}

// SERVOS_PATCH_04_CONTROLLED_IMPORT
#[test]
fn controlled_import_dry_run_and_apply_use_domain_commands_and_are_idempotent() {
    let (_, mut db, s)=setup();
    let csv="external_id,name,phone,email,credit_limit,notes,active\ncustomer-import-1,Imported Customer,+254700100100,imported@example.com,0,Migration,true\n";
    let batch=import_stage(&mut db,&s.token,"customers","customers.csv",csv).unwrap();
    let before:(i64,i64,i64)=db.query_row(
        "SELECT (SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
        [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
    ).unwrap();
    let plan=import_plan(&mut db,&s.token,batch["id"].as_str().unwrap()).unwrap();
    assert_eq!(plan["status"],"READY"); assert_eq!(plan["summary"]["create"],1);
    let plan_id=plan["id"].as_str().unwrap().to_string();
    assert_eq!(import_apply(&mut db,&s.token,&plan_id).unwrap()["status"],"APPLIED");
    let after:(i64,i64,i64)=db.query_row(
        "SELECT (SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
        [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
    ).unwrap();
    assert_eq!(after.0,before.0+1);assert_eq!(after.1,before.1+1);assert_eq!(after.2,before.2+1);
    assert_eq!(import_apply(&mut db,&s.token,&plan_id).unwrap()["status"],"APPLIED");
    let rerun=import_stage(&mut db,&s.token,"customers","customers.csv",csv).unwrap();
    let rerun_plan=import_plan(&mut db,&s.token,rerun["id"].as_str().unwrap()).unwrap();
    assert_eq!(rerun_plan["summary"]["noChange"],1);
    let rerun_id=rerun_plan["id"].as_str().unwrap().to_string();
    assert_eq!(import_apply(&mut db,&s.token,&rerun_id).unwrap()["status"],"APPLIED");
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM import_external_ids WHERE namespace='customers' AND external_id='customer-import-1'",[],|r|r.get(0)).unwrap(),1);
}
#[test]
fn controlled_import_blocks_live_opening_inventory_and_promotes_hotel_services() {
    let (_, mut db, s)=setup();
    let seed_batch=Uuid::new_v4().to_string();let stamp="2026-09-27T00:00:00Z";
    db.execute(
        "INSERT INTO import_batches(id,template_key,file_name,status,created_by,created_at,updated_at,row_count,valid_count,invalid_count,source_hash,headers,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rusqlite::params![seed_batch,"stock_locations","seed.csv","APPLIED",s.staff_id,stamp,stamp,0,0,0,"seed","[]",""]
    ).unwrap();
    db.execute(
        "INSERT INTO import_external_ids(namespace,external_id,collection,record_id,batch_id,created_at) VALUES('stock_locations','stock-main','stockLocations','main',?,?)",
        rusqlite::params![seed_batch,stamp]
    ).unwrap();
    let inventory="external_id,stock_item_external_id,stock_item_name,code,barcode,base_unit,location_external_id,opening_quantity,average_unit_cost,reorder_level\ninventory-live,stock-live,Live Stock,LIVE1,,unit,stock-main,10,5,2\n";
    let batch=import_stage(&mut db,&s.token,"inventory","inventory.csv",inventory).unwrap();
    let plan=import_plan(&mut db,&s.token,batch["id"].as_str().unwrap()).unwrap();
    assert_eq!(plan["status"],"BLOCKED");
    assert!(plan["steps"].as_array().unwrap().iter().any(|x|x["reason"].as_str().unwrap().contains("after Go Live")));
    let services="external_id,code,name,category,unit_price,taxable,active\nservice-x,ROOM-SVC,Room Service,ROOM_SERVICE,1000,true,true\n";
    let service_batch=import_stage(&mut db,&s.token,"hotel_services","hotel_services.csv",services).unwrap();
    let service_plan=import_plan(&mut db,&s.token,service_batch["id"].as_str().unwrap()).unwrap();
    assert_eq!(service_plan["status"],"READY");
    assert_eq!(service_plan["steps"][0]["operation"],"hotelService.save");
    let service_plan_id=service_plan["id"].as_str().unwrap().to_string();
    assert_eq!(import_apply(&mut db,&s.token,&service_plan_id).unwrap()["status"],"APPLIED");
    assert_eq!(list(&db,"hotelServices").unwrap().len(),1);
}

// SERVOS_PATCH_05_ROOMS_ENGINE
#[test]
fn rooms_engine_blocks_overlap_turnaround_and_preserves_rate_snapshot() {
    let (_,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"customers","id":"guest-a","data":{"name":"Guest A","phone":"+254700000001"}}));
    run(&mut db,&s,"record.save",json!({"collection":"customers","id":"guest-b","data":{"name":"Guest B","phone":"+254700000002"}}));
    run(&mut db,&s,"roomType.save",json!({"id":"type-standard","data":{"name":"Standard","code":"STD-2","maxGuests":2}}));
    run(&mut db,&s,"ratePlan.save",json!({"id":"rate-standard","data":{"name":"Standard Night","roomTypeId":"type-standard","mode":"NIGHTLY","priceMinor":10000,"currency":"KES","taxBasisPoints":0,"minNights":1,"maxNights":30}}));
    configure_room_stay(&mut db,&s,"type-standard","rate-standard");
    run(&mut db,&s,"room.save",json!({"id":"room-101","data":{"number":"101","roomTypeId":"type-standard","capacity":2,"turnaroundMinutes":30,"floor":"1"}}));
    run(&mut db,&s,"roomReservation.create",json!({"id":"res-a","roomId":"room-101","ratePlanId":"rate-standard","customerId":"guest-a","guests":2,"startsAt":"2030-01-01T12:00:00Z","endsAt":"2030-01-02T10:00:00Z"}));
    let first=get(&db,"roomReservations","res-a").unwrap().1;
    assert_eq!(first["quotedAmountMinor"],10000);
    assert_eq!(first["blockedUntil"],"2030-01-02T10:30:00+00:00");
    assert!(execute(&mut db,&s.token,cmd("roomReservation.create",json!({"id":"res-overlap","roomId":"room-101","ratePlanId":"rate-standard","customerId":"guest-b","guests":1,"startsAt":"2030-01-02T10:15:00Z","endsAt":"2030-01-03T10:00:00Z"}))).is_err());
    run(&mut db,&s,"roomReservation.create",json!({"id":"res-b","roomId":"room-101","ratePlanId":"rate-standard","customerId":"guest-b","guests":1,"startsAt":"2030-01-02T10:30:00Z","endsAt":"2030-01-03T10:00:00Z"}));
    let (rate_version,_)=get(&db,"ratePlans","rate-standard").unwrap();
    let mut update=cmd("ratePlan.save",json!({"id":"rate-standard","data":{"name":"Standard Night","roomTypeId":"type-standard","mode":"NIGHTLY","priceMinor":15000,"currency":"KES","taxBasisPoints":0,"minNights":1,"maxNights":30}}));
    update.target_version=Some(rate_version);execute(&mut db,&s.token,update).unwrap();
    assert_eq!(get(&db,"roomReservations","res-a").unwrap().1["rateSnapshot"]["priceMinor"],10000);
}
#[test]
fn rooms_engine_enforces_blocks_housekeeping_and_reservation_closure() {
    let (_,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"customers","id":"guest","data":{"name":"Guest","phone":"+254700000003"}}));
    run(&mut db,&s,"roomType.save",json!({"id":"type","data":{"name":"Suite","code":"STE","maxGuests":3}}));
    run(&mut db,&s,"ratePlan.save",json!({"id":"rate","data":{"name":"Suite Night","roomTypeId":"type","mode":"NIGHTLY","priceMinor":20000,"currency":"KES","taxBasisPoints":0}}));
    configure_room_stay(&mut db,&s,"type","rate");
    run(&mut db,&s,"room.save",json!({"id":"room","data":{"number":"201","roomTypeId":"type","capacity":3,"turnaroundMinutes":0,"initialStatus":"DIRTY"}}));
    let (v,_)=get(&db,"rooms","room").unwrap();let mut out=cmd("room.condition",json!({"id":"room","state":"OUT_OF_ORDER","reason":"Inspection hold"}));out.target_version=Some(v);execute(&mut db,&s.token,out).unwrap();
    assert_eq!(get(&db,"rooms","room").unwrap().1["maintenanceState"],"OUT_OF_ORDER");assert_eq!(get(&db,"rooms","room").unwrap().1["housekeepingState"],"DIRTY");
    let (v,_)=get(&db,"rooms","room").unwrap();let mut available=cmd("room.condition",json!({"id":"room","state":"AVAILABLE","reason":"Inspection passed"}));available.target_version=Some(v);execute(&mut db,&s.token,available).unwrap();
    let (v,_)=get(&db,"rooms","room").unwrap();let mut clean=cmd("room.housekeeping",json!({"id":"room","state":"CLEANING"}));clean.target_version=Some(v);execute(&mut db,&s.token,clean).unwrap();
    let (v,_)=get(&db,"rooms","room").unwrap();let mut inspect=cmd("room.housekeeping",json!({"id":"room","state":"INSPECTION"}));inspect.target_version=Some(v);execute(&mut db,&s.token,inspect).unwrap();
    let (v,_)=get(&db,"rooms","room").unwrap();let mut ready=cmd("room.housekeeping",json!({"id":"room","state":"CLEAN"}));ready.target_version=Some(v);execute(&mut db,&s.token,ready).unwrap();
    run(&mut db,&s,"room.block",json!({"id":"block","roomId":"room","startsAt":"2030-02-01T08:00:00Z","endsAt":"2030-02-02T08:00:00Z","reason":"Painting"}));
    assert!(execute(&mut db,&s.token,cmd("roomReservation.create",json!({"id":"blocked","roomId":"room","ratePlanId":"rate","customerId":"guest","guests":1,"startsAt":"2030-02-01T10:00:00Z","endsAt":"2030-02-02T07:00:00Z"}))).is_err());
    let (bv,_)=get(&db,"roomBlocks","block").unwrap();let mut unblock=cmd("room.unblock",json!({"id":"block","inspection":"Paint cured and room inspected"}));unblock.target_version=Some(bv);execute(&mut db,&s.token,unblock).unwrap();
    run(&mut db,&s,"roomReservation.create",json!({"id":"res","roomId":"room","ratePlanId":"rate","customerId":"guest","guests":1,"startsAt":"2030-02-01T10:00:00Z","endsAt":"2030-02-02T07:00:00Z"}));
    let (v,_)=get(&db,"rooms","room").unwrap();let mut blocked_condition=cmd("room.condition",json!({"id":"room","state":"OUT_OF_ORDER","reason":"Active reservation"}));blocked_condition.target_version=Some(v);assert!(execute(&mut db,&s.token,blocked_condition).is_err());
    let (rv,_)=get(&db,"roomReservations","res").unwrap();let mut cancel=cmd("roomReservation.cancel",json!({"id":"res","reason":"Guest cancelled"}));cancel.target_version=Some(rv);execute(&mut db,&s.token,cancel).unwrap();
    assert_eq!(get(&db,"roomReservations","res").unwrap().1["status"],"CANCELLED");
}
#[test]
fn room_csv_imports_apply_through_native_room_commands() {
    let (_,mut db,s)=setup();
    let types="external_id,name,code,capacity_adults,capacity_children,base_rate,active\nroomtype-standard,Standard Room,STD-CSV,2,1,6500,true\n";
    let b=import_stage(&mut db,&s.token,"room_types","room_types.csv",types).unwrap();
    let p=import_plan(&mut db,&s.token,b["id"].as_str().unwrap()).unwrap();assert_eq!(p["status"],"READY");
    import_apply(&mut db,&s.token,p["id"].as_str().unwrap()).unwrap();
    let rooms="external_id,room_number,room_type_external_id,floor,wing,initial_status,active\nroom-101,101,roomtype-standard,1,Main,READY,true\n";
    let b=import_stage(&mut db,&s.token,"rooms","rooms.csv",rooms).unwrap();let p=import_plan(&mut db,&s.token,b["id"].as_str().unwrap()).unwrap();assert_eq!(p["status"],"READY");import_apply(&mut db,&s.token,p["id"].as_str().unwrap()).unwrap();
    let room_id=list(&db,"rooms").unwrap()[0]["id"].as_str().unwrap().to_string();
    let (room_version,_)=get(&db,"rooms",&room_id).unwrap();
    let mut dirty=cmd("room.housekeeping",json!({"id":room_id,"state":"DIRTY"}));
    dirty.target_version=Some(room_version);execute(&mut db,&s.token,dirty).unwrap();
    let (room_version,_)=get(&db,"rooms",&room_id).unwrap();
    let mut cleaning=cmd("room.housekeeping",json!({"id":room_id,"state":"CLEANING"}));
    cleaning.target_version=Some(room_version);execute(&mut db,&s.token,cleaning).unwrap();
    let rooms_update="external_id,room_number,room_type_external_id,floor,wing,initial_status,active\nroom-101,101,roomtype-standard,2,East,OUT_OF_ORDER,true\n";
    let b=import_stage(&mut db,&s.token,"rooms","rooms.csv",rooms_update).unwrap();
    let p=import_plan(&mut db,&s.token,b["id"].as_str().unwrap()).unwrap();
    assert_eq!(p["status"],"READY");
    assert_eq!(p["steps"][0]["action"],"UPDATE");
    assert!(p["steps"][0]["payload"]["data"].get("initialStatus").is_none());
    import_apply(&mut db,&s.token,p["id"].as_str().unwrap()).unwrap();
    let updated=get(&db,"rooms",&room_id).unwrap().1;
    assert_eq!(updated["floor"],"2");assert_eq!(updated["wing"],"East");
    assert_eq!(updated["housekeepingState"],"CLEANING");assert_eq!(updated["maintenanceState"],"AVAILABLE");
    let rates="external_id,name,room_type_external_id,meal_plan,currency,nightly_rate,min_nights,max_nights,active\nrate-standard,Standard BB,roomtype-standard,BB,KES,7500,1,30,true\n";
    let b=import_stage(&mut db,&s.token,"rate_plans","rate_plans.csv",rates).unwrap();let p=import_plan(&mut db,&s.token,b["id"].as_str().unwrap()).unwrap();assert_eq!(p["status"],"READY");import_apply(&mut db,&s.token,p["id"].as_str().unwrap()).unwrap();
    assert_eq!(list(&db,"roomTypes").unwrap().len(),2);assert_eq!(list(&db,"rooms").unwrap().len(),1);assert_eq!(list(&db,"ratePlans").unwrap().len(),2);
}

// SERVOS_PATCH_06_FRONT_DESK
#[test]
fn front_desk_check_in_creates_stay_folio_and_due_accommodation_atomically() {
    let (_,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"customers","id":"front-guest","data":{"name":"Front Guest","phone":"+254700000004"}}));
    run(&mut db,&s,"roomType.save",json!({"id":"front-type","data":{"name":"Front Type","code":"FRT","maxGuests":2}}));
    run(&mut db,&s,"ratePlan.save",json!({"id":"front-rate","data":{"name":"Front Rate","roomTypeId":"front-type","mode":"NIGHTLY","priceMinor":12000,"currency":"KES","taxBasisPoints":0}}));
    configure_room_stay(&mut db,&s,"front-type","front-rate");
    run(&mut db,&s,"room.save",json!({"id":"front-room","data":{"number":"301","roomTypeId":"front-type","capacity":2,"turnaroundMinutes":30}}));
    let arrival=(chrono::Utc::now()-chrono::Duration::minutes(5)).to_rfc3339();
    let departure=(chrono::Utc::now()+chrono::Duration::days(1)).to_rfc3339();
    run(&mut db,&s,"roomReservation.create",json!({"id":"front-res","roomId":"front-room","ratePlanId":"front-rate","customerId":"front-guest","guests":1,"startsAt":arrival,"endsAt":departure}));
    let (reservation_version,_)=get(&db,"roomReservations","front-res").unwrap();
    let (room_version,_)=get(&db,"rooms","front-room").unwrap();
    let before:(i64,i64)=db.query_row("SELECT (SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit)",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
    let mut checkin=cmd("stay.checkIn",json!({"id":"front-res","roomVersion":room_version}));
    checkin.target_version=Some(reservation_version);
    execute(&mut db,&s.token,checkin).unwrap();
    let after:(i64,i64)=db.query_row("SELECT (SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit)",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
    assert_eq!(after.0,before.0+1);assert_eq!(after.1,before.1+1);
    assert_eq!(get(&db,"roomReservations","front-res").unwrap().1["status"],"CHECKED_IN");
    assert_eq!(get(&db,"stays","front-res").unwrap().1["status"],"CHECKED_IN");
    let folio=get(&db,"folios","front-res").unwrap().1;
    assert_eq!(folio["balanceMinor"],12000);assert_eq!(folio["depositMinor"],0);assert_eq!(folio["status"],"OPEN");
    assert_eq!(list(&db,"folioEntries").unwrap().iter().filter(|r|r["data"]["sourceType"]=="ACCOMMODATION").count(),1);
}
#[test]
fn front_desk_room_move_preserves_quote_and_dirties_old_room() {
    let (_,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"customers","id":"move-guest","data":{"name":"Move Guest","phone":"+254700000005"}}));
    run(&mut db,&s,"roomType.save",json!({"id":"move-type","data":{"name":"Move Type","code":"MOV","maxGuests":2}}));
    run(&mut db,&s,"ratePlan.save",json!({"id":"move-rate","data":{"name":"Move Rate","roomTypeId":"move-type","mode":"NIGHTLY","priceMinor":14000,"currency":"KES","taxBasisPoints":0}}));
    configure_room_stay(&mut db,&s,"move-type","move-rate");
    run(&mut db,&s,"room.save",json!({"id":"move-a","data":{"number":"401","roomTypeId":"move-type","capacity":2,"turnaroundMinutes":20}}));
    run(&mut db,&s,"room.save",json!({"id":"move-b","data":{"number":"402","roomTypeId":"move-type","capacity":2,"turnaroundMinutes":25}}));
    let arrival=(chrono::Utc::now()-chrono::Duration::minutes(5)).to_rfc3339();
    let departure=(chrono::Utc::now()+chrono::Duration::days(2)).to_rfc3339();
    run(&mut db,&s,"roomReservation.create",json!({"id":"move-res","roomId":"move-a","ratePlanId":"move-rate","customerId":"move-guest","guests":2,"startsAt":arrival,"endsAt":departure}));
    let (rv,_)=get(&db,"roomReservations","move-res").unwrap();let (av,_)=get(&db,"rooms","move-a").unwrap();
    let mut checkin=cmd("stay.checkIn",json!({"id":"move-res","roomVersion":av}));checkin.target_version=Some(rv);execute(&mut db,&s.token,checkin).unwrap();
    let quote=get(&db,"roomReservations","move-res").unwrap().1["quotedAmountMinor"].clone();
    let (sv,_)=get(&db,"stays","move-res").unwrap();let (rv,_)=get(&db,"roomReservations","move-res").unwrap();let (fv,_)=get(&db,"folios","move-res").unwrap();let (av,_)=get(&db,"rooms","move-a").unwrap();let (bv,_)=get(&db,"rooms","move-b").unwrap();
    let mut moving=cmd("stay.move",json!({"id":"move-res","destinationRoomId":"move-b","reservationVersion":rv,"folioVersion":fv,"currentRoomVersion":av,"destinationRoomVersion":bv,"reason":"Guest request"}));moving.target_version=Some(sv);execute(&mut db,&s.token,moving).unwrap();
    let reservation=get(&db,"roomReservations","move-res").unwrap().1;assert_eq!(reservation["roomId"],"move-b");assert_eq!(reservation["quotedAmountMinor"],quote);
    assert_eq!(get(&db,"stays","move-res").unwrap().1["roomId"],"move-b");
    assert_eq!(get(&db,"rooms","move-a").unwrap().1["housekeepingState"],"DIRTY");
    let blocks=list(&db,"roomBlocks").unwrap();assert!(blocks.iter().any(|b|b["data"]["stayId"]=="move-res"&&b["data"]["sourceType"]=="MOVE_TURNAROUND"));
}
#[test]
fn front_desk_rejects_early_check_in_and_financially_incomplete_checkout() {
    let (_,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"customers","id":"gate-guest","data":{"name":"Gate Guest","phone":"+254700000006"}}));
    run(&mut db,&s,"roomType.save",json!({"id":"gate-type","data":{"name":"Gate Type","code":"GAT","maxGuests":1}}));
    run(&mut db,&s,"ratePlan.save",json!({"id":"gate-rate","data":{"name":"Gate Rate","roomTypeId":"gate-type","mode":"NIGHTLY","priceMinor":9000,"currency":"KES","taxBasisPoints":0}}));
    configure_room_stay(&mut db,&s,"gate-type","gate-rate");
    run(&mut db,&s,"room.save",json!({"id":"gate-room","data":{"number":"501","roomTypeId":"gate-type","capacity":1,"turnaroundMinutes":0}}));
    let base=chrono::Utc::now();
    let arrival=(base+chrono::Duration::days(2)).to_rfc3339();
    let departure=(base+chrono::Duration::days(3)).to_rfc3339();
    run(&mut db,&s,"roomReservation.create",json!({"id":"gate-res","roomId":"gate-room","ratePlanId":"gate-rate","customerId":"gate-guest","guests":1,"startsAt":arrival,"endsAt":departure}));
    let (rv,_)=get(&db,"roomReservations","gate-res").unwrap();let (roomv,_)=get(&db,"rooms","gate-room").unwrap();
    let mut early=cmd("stay.checkIn",json!({"id":"gate-res","roomVersion":roomv}));early.target_version=Some(rv);assert!(execute(&mut db,&s.token,early).unwrap_err().contains("arrival time"));
    let (rv,_)=get(&db,"roomReservations","gate-res").unwrap();let mut cancel=cmd("roomReservation.cancel",json!({"id":"gate-res","reason":"Early-arrival gate test complete"}));cancel.target_version=Some(rv);execute(&mut db,&s.token,cancel).unwrap();
    let current_base=chrono::Utc::now();
    let current_arrival=(current_base-chrono::Duration::minutes(5)).to_rfc3339();
    let current_departure=(current_base+chrono::Duration::days(2)).to_rfc3339();
    run(&mut db,&s,"roomReservation.create",json!({"id":"gate-live","roomId":"gate-room","ratePlanId":"gate-rate","customerId":"gate-guest","guests":1,"startsAt":current_arrival,"endsAt":current_departure}));
    let (rv,_)=get(&db,"roomReservations","gate-live").unwrap();let (roomv,_)=get(&db,"rooms","gate-room").unwrap();
    let mut checkin=cmd("stay.checkIn",json!({"id":"gate-live","roomVersion":roomv}));checkin.target_version=Some(rv);execute(&mut db,&s.token,checkin).unwrap();
    let (sv,_)=get(&db,"stays","gate-live").unwrap();let (rv,res)=get(&db,"roomReservations","gate-live").unwrap();let (fv,_)=get(&db,"folios","gate-live").unwrap();let (roomv,_)=get(&db,"rooms",res["roomId"].as_str().unwrap()).unwrap();
    let mut checkout=cmd("stay.checkOut",json!({"id":"gate-live","reservationVersion":rv,"folioVersion":fv,"roomVersion":roomv}));checkout.target_version=Some(sv);
    assert!(execute(&mut db,&s.token,checkout).unwrap_err().contains("SETTLEMENT_REQUIRED"));
}

// SERVOS_PATCH_07_FOLIOS
fn hotel_booking_fixture(db:&mut rusqlite::Connection,s:&Session,prefix:&str,price_minor:i64)->String{
    let customer=format!("{prefix}-guest");let room_type=format!("{prefix}-type");let rate=format!("{prefix}-rate");let room=format!("{prefix}-room");let reservation=format!("{prefix}-reservation");
    run(db,s,"record.save",json!({"collection":"customers","id":customer,"data":{"name":format!("{prefix} Guest"),"phone":"+254700000099"}}));
    run(db,s,"roomType.save",json!({"id":room_type,"data":{"name":format!("{prefix} Type"),"code":prefix.to_ascii_uppercase(),"maxGuests":2}}));
    run(db,s,"ratePlan.save",json!({"id":rate,"data":{"name":format!("{prefix} Night"),"roomTypeId":room_type,"mode":"NIGHTLY","priceMinor":price_minor,"currency":"KES","taxBasisPoints":0,"minNights":1,"maxNights":30}}));
    run(db,s,"room.save",json!({"id":room,"data":{"number":format!("R-{prefix}"),"roomTypeId":room_type,"capacity":2,"turnaroundMinutes":30}}));
    configure_room_stay(db,s,&room_type,&rate);
    let arrival=(chrono::Utc::now()-chrono::Duration::minutes(5)).to_rfc3339();
    let departure=(chrono::Utc::now()+chrono::Duration::days(1)).to_rfc3339();
    run(db,s,"roomReservation.create",json!({"id":reservation,"roomId":room,"ratePlanId":rate,"customerId":customer,"guests":1,"startsAt":arrival,"endsAt":departure}));
    reservation
}
fn hotel_check_in(db:&mut rusqlite::Connection,s:&Session,reservation_id:&str){
    let (rv,reservation)=get(db,"roomReservations",reservation_id).unwrap();
    let (roomv,_)=get(db,"rooms",reservation["roomId"].as_str().unwrap()).unwrap();
    let mut payload=json!({"id":reservation_id,"roomVersion":roomv});
    if let Ok((fv,_))=get(db,"folios",reservation_id){payload["folioVersion"]=json!(fv);}
    let mut command=cmd("stay.checkIn",payload);command.target_version=Some(rv);execute(db,&s.token,command).unwrap();
}
#[test]
fn folio_deposit_accommodation_settlement_and_checkout_conserve_money() {
    let (_dir,mut db,s)=setup();run(&mut db,&s,"till.open",json!({"floatAmount":500}));
    let rid=hotel_booking_fixture(&mut db,&s,"folioa",10_000);
    let (rv,_)=get(&db,"roomReservations",&rid).unwrap();
    let mut open=cmd("folio.open",json!({"id":rid}));open.target_version=Some(rv);execute(&mut db,&s.token,open).unwrap();
    let (fv,_)=get(&db,"folios",&rid).unwrap();
    let mut deposit=cmd("folio.deposit",json!({"id":rid,"amountMinor":5_000,"method":"CARD","reference":"DEP-FOLIO-A","manuallyConfirmed":true}));deposit.target_version=Some(fv);execute(&mut db,&s.token,deposit).unwrap();
    let folio=get(&db,"folios",&rid).unwrap().1;assert_eq!(folio["balanceMinor"],0);assert_eq!(folio["depositMinor"],5_000);
    hotel_check_in(&mut db,&s,&rid);
    let folio=get(&db,"folios",&rid).unwrap().1;assert_eq!(folio["balanceMinor"],10_000);assert_eq!(folio["depositMinor"],5_000);
    assert_eq!(list(&db,"folioEntries").unwrap().iter().filter(|r|r["data"]["sourceType"]=="ACCOMMODATION").count(),1);
    let (fv,_)=get(&db,"folios",&rid).unwrap();let mut repost=cmd("folio.postAccommodation",json!({"id":rid}));repost.target_version=Some(fv);execute(&mut db,&s.token,repost).unwrap();
    assert_eq!(list(&db,"folioEntries").unwrap().iter().filter(|r|r["data"]["sourceType"]=="ACCOMMODATION").count(),1);

    let (stayv,_)=get(&db,"stays",&rid).unwrap();let (rv,res)=get(&db,"roomReservations",&rid).unwrap();let (fv,_)=get(&db,"folios",&rid).unwrap();let (roomv,_)=get(&db,"rooms",res["roomId"].as_str().unwrap()).unwrap();
    let mut early=cmd("stay.checkOut",json!({"id":rid,"reservationVersion":rv,"folioVersion":fv,"roomVersion":roomv}));early.target_version=Some(stayv);
    assert!(execute(&mut db,&s.token,early).unwrap_err().contains("SETTLEMENT_REQUIRED"));

    let (fv,_)=get(&db,"folios",&rid).unwrap();let mut apply=cmd("folio.applyDeposit",json!({"id":rid,"amountMinor":5_000}));apply.target_version=Some(fv);execute(&mut db,&s.token,apply).unwrap();
    let (fv,_)=get(&db,"folios",&rid).unwrap();let mut pay=cmd("folio.pay",json!({"id":rid,"amountMinor":5_000,"method":"CARD","reference":"SETTLE-FOLIO-A","manuallyConfirmed":true}));pay.target_version=Some(fv);execute(&mut db,&s.token,pay).unwrap();
    let folio=get(&db,"folios",&rid).unwrap().1;assert_eq!(folio["balanceMinor"],0);assert_eq!(folio["depositMinor"],0);

    let (stayv,_)=get(&db,"stays",&rid).unwrap();let (rv,res)=get(&db,"roomReservations",&rid).unwrap();let (fv,_)=get(&db,"folios",&rid).unwrap();let (roomv,_)=get(&db,"rooms",res["roomId"].as_str().unwrap()).unwrap();
    let checkout_id=Uuid::new_v4().to_string();let checkout=BusinessCommand{id:checkout_id.clone(),schema_version:1,operation:"stay.checkOut".into(),target_version:Some(stayv),payload:json!({"id":rid,"reservationVersion":rv,"folioVersion":fv,"roomVersion":roomv})};
    let first_result=execute(&mut db,&s.token,checkout.clone()).unwrap();
    assert_eq!(get(&db,"folios",&rid).unwrap().1["status"],"CLOSED");
    assert_eq!(get(&db,"stays",&rid).unwrap().1["status"],"CHECKED_OUT");
    assert_eq!(get(&db,"rooms",res["roomId"].as_str().unwrap()).unwrap().1["housekeepingState"],"DIRTY");
    let receipt_id=format!("receipt-{checkout_id}");let receipt=get(&db,"receiptDocuments",&receipt_id).unwrap().1;assert_eq!(receipt["documentType"],"HOTEL_FOLIO");assert_eq!(receipt["balanceMinor"],0);
    assert_eq!(first_result,execute(&mut db,&s.token,checkout).unwrap());
    assert!(db.execute("UPDATE records SET data='{}' WHERE collection='folioEntries'",[]).is_err());
    assert!(db.execute("DELETE FROM records WHERE collection='journalEntries'",[]).is_err());
}
#[test]
fn pos_room_charge_moves_receivable_without_inflating_cash_or_revenue_twice() {
    let (_dir,mut db,s)=setup();run(&mut db,&s,"till.open",json!({"floatAmount":500}));
    let rid=hotel_booking_fixture(&mut db,&s,"posroom",10_000);hotel_check_in(&mut db,&s,&rid);
    let before_balance=get(&db,"folios",&rid).unwrap().1["balanceMinor"].as_i64().unwrap();
    let oid=order(&mut db,&s);run(&mut db,&s,"order.fire",json!({"orderId":oid}));
    let (ov,_)=get(&db,"orders",&oid).unwrap();let (fv,_)=get(&db,"folios",&rid).unwrap();
    let room_cmd_id=Uuid::new_v4().to_string();let room_cmd=BusinessCommand{id:room_cmd_id.clone(),schema_version:1,operation:"pos.roomCharge".into(),target_version:Some(ov),payload:json!({"orderId":oid,"folioId":rid,"folioVersion":fv})};
    execute(&mut db,&s.token,room_cmd).unwrap();
    assert_eq!(get(&db,"folios",&rid).unwrap().1["balanceMinor"].as_i64().unwrap(),before_balance+10_000);
    let order_record=get(&db,"orders",&oid).unwrap().1;assert_eq!(order_record["state"],"COMPLETED");assert_eq!(order_record["paymentMethod"],"ROOM_CHARGE");
    let transfer=list(&db,"payments").unwrap().into_iter().find(|r|r["data"]["orderId"]==oid).unwrap()["data"].clone();
    assert_eq!(transfer["status"],"TRANSFERRED");assert_eq!(transfer["tenderType"],"ROOM_CHARGE");
    let journal=list(&db,"journalEntries").unwrap().into_iter().find(|r|r["data"]["sourceType"]=="POS_ROOM_CHARGE").unwrap()["data"].clone();
    assert_eq!(journal["lines"][0]["accountId"],"GUEST_RECEIVABLE");assert_eq!(journal["lines"][0]["debitMinor"],10_000);
    let receipt=get(&db,"receiptDocuments",&format!("receipt-{room_cmd_id}")).unwrap().1;assert_eq!(receipt["payments"][0]["tenderType"],"ROOM_CHARGE");assert_eq!(receipt["balanceMinor"],0);

    let (fv,_)=get(&db,"folios",&rid).unwrap();let mut reverse=cmd("folio.reverse",json!({"id":rid,"entryId":format!("pos-room-{oid}"),"reason":"Posted to wrong room"}));reverse.target_version=Some(fv);execute(&mut db,&s.token,reverse).unwrap();
    assert_eq!(get(&db,"folios",&rid).unwrap().1["balanceMinor"].as_i64().unwrap(),before_balance);
    assert!(list(&db,"refunds").unwrap().iter().any(|r|r["data"]["kind"]=="ROOM_CHARGE_REVERSAL"&&r["data"]["orderId"]==oid));
}
#[test]
fn paid_extension_is_atomic_and_duplicate_external_reference_rolls_back() {
    let (_dir,mut db,s)=setup();run(&mut db,&s,"till.open",json!({"floatAmount":500}));
    let rid=hotel_booking_fixture(&mut db,&s,"extend",10_000);hotel_check_in(&mut db,&s,&rid);
    let rate_id=get(&db,"roomReservations",&rid).unwrap().1["ratePlanId"].as_str().unwrap().to_string();
    let build=|db:&rusqlite::Connection,reference:&str|{
        let (sv,_)=get(db,"stays",&rid).unwrap();let (rv,res)=get(db,"roomReservations",&rid).unwrap();let (fv,_)=get(db,"folios",&rid).unwrap();let (roomv,_)=get(db,"rooms",res["roomId"].as_str().unwrap()).unwrap();let (ratev,_)=get(db,"ratePlans",&rate_id).unwrap();
        let mut x=cmd("stay.extend",json!({"id":rid,"ratePlanId":rate_id,"units":1,"reservationVersion":rv,"folioVersion":fv,"roomVersion":roomv,"ratePlanVersion":ratev,"payment":{"amountMinor":10_000,"method":"CARD","reference":reference,"manuallyConfirmed":true}}));x.target_version=Some(sv);x
    };
    let first=build(&db,"EXT-CARD-A");execute(&mut db,&s.token,first).unwrap();
    let after_first=get(&db,"roomReservations",&rid).unwrap().1["endsAt"].clone();
    assert_eq!(list(&db,"stayExtensions").unwrap().len(),1);
    let second=build(&db,"EXT-CARD-A");assert!(execute(&mut db,&s.token,second).unwrap_err().contains("DUPLICATE_REFERENCE"));
    assert_eq!(get(&db,"roomReservations",&rid).unwrap().1["endsAt"],after_first);
    assert_eq!(list(&db,"stayExtensions").unwrap().len(),1);
}

// SERVOS_PATCH_08_ASSETS_MAINTENANCE
fn asset_fixture(db:&mut rusqlite::Connection,s:&Session,prefix:&str)->String{
    let category=format!("{prefix}-category");
    run(db,s,"assetCategory.save",json!({"id":category,"data":{"name":format!("{prefix} Equipment"),"code":prefix.to_ascii_uppercase(),"depreciationMethod":"STRAIGHT_LINE","usefulLifeMonths":60}}));
    let asset=format!("{prefix}-asset");
    run(db,s,"asset.save",json!({"id":asset,"data":{"name":format!("{prefix} Pump"),"tag":format!("{}-001",prefix.to_ascii_uppercase()),"assetCategoryId":category,"locationId":"main","purchaseCostMinor":10000}}));
    asset
}
fn technician(db:&mut rusqlite::Connection,s:&Session,name:&str)->String{
    run(db,s,"staff.create",json!({"name":name,"pin":"456789","role":"Server","jobTitle":"Technician"}));
    db.query_row("SELECT id FROM staff WHERE name=?",[name],|r|r.get(0)).unwrap()
}
#[test]
fn asset_domain_enforces_permanent_tags_custody_location_and_immutable_events() {
    let (_dir,mut db,s)=setup();
    let asset=asset_fixture(&mut db,&s,"pump");
    let duplicate=execute(&mut db,&s.token,cmd("asset.save",json!({"id":"pump-duplicate","data":{"name":"Other Pump","tag":"pump-001","assetCategoryId":"pump-category","locationId":"main","purchaseCostMinor":1}})));
    assert!(duplicate.unwrap_err().contains("DUPLICATE_REFERENCE"));

    run(&mut db,&s,"record.save",json!({"collection":"stockLocations","id":"workshop","data":{"name":"Workshop","code":"WORKSHOP","type":"STORE","active":true,"propertyId":"property"}}));
    let (version,data)=get(&db,"assets",&asset).unwrap();
    let mut illegal=cmd("asset.save",json!({"id":asset,"data":{"name":data["name"],"tag":data["tag"],"assetCategoryId":data["assetCategoryId"],"locationId":"workshop","purchaseCostMinor":10000}}));illegal.target_version=Some(version);
    assert!(execute(&mut db,&s.token,illegal).unwrap_err().contains("asset.transfer"));

    let tech=technician(&mut db,&s,"Asset Tech");
    let (v,_)=get(&db,"assets",&asset).unwrap();let mut assign=cmd("asset.assign",json!({"id":asset,"custodianId":tech,"reason":"Issued for engineering shift"}));assign.target_version=Some(v);execute(&mut db,&s.token,assign).unwrap();
    let (v,_)=get(&db,"assets",&asset).unwrap();let mut retire=cmd("asset.retire",json!({"id":asset,"reason":"Old"}));retire.target_version=Some(v);assert!(execute(&mut db,&s.token,retire).unwrap_err().contains("return assigned asset"));
    let (v,_)=get(&db,"assets",&asset).unwrap();let mut returned=cmd("asset.return",json!({"id":asset,"reason":"Back to engineering store"}));returned.target_version=Some(v);execute(&mut db,&s.token,returned).unwrap();
    let (v,_)=get(&db,"assets",&asset).unwrap();let mut transfer=cmd("asset.transfer",json!({"id":asset,"locationId":"workshop","reason":"Move to workshop"}));transfer.target_version=Some(v);execute(&mut db,&s.token,transfer).unwrap();
    let (v,_)=get(&db,"assets",&asset).unwrap();let mut inspect=cmd("asset.inspect",json!({"id":asset,"condition":"FAIR","nextInspectionAt":"2027-03-01","reason":"Quarterly inspection"}));inspect.target_version=Some(v);execute(&mut db,&s.token,inspect).unwrap();
    let current=get(&db,"assets",&asset).unwrap().1;assert_eq!(current["locationId"],"workshop");assert_eq!(current["condition"],"FAIR");assert_eq!(current["custodianId"],Value::Null);
    assert!(list(&db,"assetEvents").unwrap().len()>=5);
    assert!(db.execute("UPDATE records SET data='{}' WHERE collection='assetEvents'",[]).is_err());
    assert!(db.execute("DELETE FROM records WHERE collection='assetEvents'",[]).is_err());
}
#[test]
fn maintenance_completion_consumes_parts_and_posts_service_payable_atomically() {
    let (_dir,mut db,s)=setup();
    let asset=asset_fixture(&mut db,&s,"maint");
    let tech=technician(&mut db,&s,"Maintenance Tech");
    run(&mut db,&s,"record.save",json!({"collection":"stockItems","id":"bearing","data":{"name":"Bearing","code":"BEARING","baseUnit":"unit","averageUnitCost":1.5}}));
    run(&mut db,&s,"inventory.adjust",json!({"stockItemId":"bearing","locationId":"main","countedQty":10,"reason":"Maintenance stock fixture"}));
    run(&mut db,&s,"record.save",json!({"collection":"suppliers","id":"repair-supplier","data":{"name":"Repair Supplier","code":"REPAIR","active":true}}));

    run(&mut db,&s,"maintenance.report",json!({"id":"work-1","assetId":asset,"description":"Replace pump bearing","priority":"HIGH"}));
    let (v,_)=get(&db,"maintenanceOrders","work-1").unwrap();let mut assign=cmd("maintenance.assign",json!({"id":"work-1","assigneeId":tech}));assign.target_version=Some(v);execute(&mut db,&s.token,assign).unwrap();
    let (v,_)=get(&db,"maintenanceOrders","work-1").unwrap();let mut start=cmd("maintenance.start",json!({"id":"work-1"}));start.target_version=Some(v);execute(&mut db,&s.token,start).unwrap();

    let before_stock=get(&db,"stockItems","bearing").unwrap().1["currentStock"]["main"].as_f64().unwrap();
    let before_movements=list(&db,"stockMovements").unwrap().len();
    let (wv,_)=get(&db,"maintenanceOrders","work-1").unwrap();let (sv,_)=get(&db,"stockItems","bearing").unwrap();
    let mut fail=cmd("maintenance.complete",json!({"id":"work-1","resolution":"Bearing replaced","parts":[{"stockItemId":"bearing","stockItemVersion":sv,"locationId":"main","quantity":2}],"serviceCostMinor":500,"supplierId":"missing","invoiceReference":"INV-FAIL"}));fail.target_version=Some(wv);
    assert!(execute(&mut db,&s.token,fail).is_err());
    assert_eq!(get(&db,"stockItems","bearing").unwrap().1["currentStock"]["main"].as_f64().unwrap(),before_stock);
    assert_eq!(list(&db,"stockMovements").unwrap().len(),before_movements);
    assert_eq!(get(&db,"maintenanceOrders","work-1").unwrap().1["status"],"IN_PROGRESS");
    assert!(list(&db,"supplierPayables").unwrap().iter().all(|r|r["data"]["sourceId"]!="work-1"));

    let (wv,_)=get(&db,"maintenanceOrders","work-1").unwrap();let (sv,_)=get(&db,"stockItems","bearing").unwrap();
    let mut complete=cmd("maintenance.complete",json!({"id":"work-1","resolution":"Bearing replaced and tested","parts":[{"stockItemId":"bearing","stockItemVersion":sv,"locationId":"main","quantity":2}],"serviceCostMinor":500,"supplierId":"repair-supplier","invoiceReference":"INV-MAINT-1"}));complete.target_version=Some(wv);
    execute(&mut db,&s.token,complete).unwrap();
    assert_eq!(get(&db,"stockItems","bearing").unwrap().1["currentStock"]["main"],8.0);
    let work=get(&db,"maintenanceOrders","work-1").unwrap().1;assert_eq!(work["status"],"COMPLETED");assert_eq!(work["partsCostMinor"],300);assert_eq!(work["serviceCostMinor"],500);
    assert!(list(&db,"stockMovements").unwrap().iter().any(|r|r["data"]["movementType"]=="MAINTENANCE"&&r["data"]["sourceId"]=="work-1"));
    assert!(list(&db,"supplierPayables").unwrap().iter().any(|r|r["data"]["sourceType"]=="MAINTENANCE"&&r["data"]["sourceId"]=="work-1"&&r["data"]["status"]=="MATCHED_UNPAID"));
    let maintenance_journals:Vec<Value>=list(&db,"journalEntries").unwrap().into_iter().filter(|r|r["data"]["sourceId"]=="work-1").collect();
    assert_eq!(maintenance_journals.len(),2);
}
#[test]
fn maintenance_linked_room_block_requires_closed_work_and_inspected_release() {
    let (_dir,mut db,s)=setup();
    let tech=technician(&mut db,&s,"Room Maintenance Tech");
    run(&mut db,&s,"roomType.save",json!({"id":"maint-room-type","data":{"name":"Maintenance Room","code":"MROOM","maxGuests":2}}));
    run(&mut db,&s,"room.save",json!({"id":"maint-room","data":{"number":"M-01","roomTypeId":"maint-room-type","capacity":2,"turnaroundMinutes":30}}));
    run(&mut db,&s,"maintenance.report",json!({"id":"room-work","roomId":"maint-room","description":"Repair bathroom plumbing","priority":"CRITICAL"}));
    let start=(chrono::Utc::now()+chrono::Duration::days(2)).to_rfc3339();let end=(chrono::Utc::now()+chrono::Duration::days(3)).to_rfc3339();
    run(&mut db,&s,"room.block",json!({"id":"maintenance-block","roomId":"maint-room","startsAt":start,"endsAt":end,"reason":"Plumbing repair","maintenanceOrderId":"room-work"}));
    let (bv,_)=get(&db,"roomBlocks","maintenance-block").unwrap();let mut release=cmd("room.unblock",json!({"id":"maintenance-block","inspection":"Premature"}));release.target_version=Some(bv);
    assert!(execute(&mut db,&s.token,release).unwrap_err().contains("resolve maintenance"));

    let (v,_)=get(&db,"maintenanceOrders","room-work").unwrap();let mut assign=cmd("maintenance.assign",json!({"id":"room-work","assigneeId":tech}));assign.target_version=Some(v);execute(&mut db,&s.token,assign).unwrap();
    let (v,_)=get(&db,"maintenanceOrders","room-work").unwrap();let mut start_work=cmd("maintenance.start",json!({"id":"room-work"}));start_work.target_version=Some(v);execute(&mut db,&s.token,start_work).unwrap();
    let (v,_)=get(&db,"maintenanceOrders","room-work").unwrap();let mut complete=cmd("maintenance.complete",json!({"id":"room-work","resolution":"Leak repaired and pressure tested","parts":[],"serviceCostMinor":0}));complete.target_version=Some(v);execute(&mut db,&s.token,complete).unwrap();
    assert_eq!(get(&db,"roomBlocks","maintenance-block").unwrap().1["status"],"ACTIVE");
    let (bv,_)=get(&db,"roomBlocks","maintenance-block").unwrap();let mut release=cmd("room.unblock",json!({"id":"maintenance-block","inspection":"Room inspected after repair"}));release.target_version=Some(bv);execute(&mut db,&s.token,release).unwrap();
    assert_eq!(get(&db,"roomBlocks","maintenance-block").unwrap().1["status"],"RELEASED");
}

#[test]
fn asset_operational_lifecycle_and_maintenance_are_blocked_before_go_live() {
    let dir=tempfile::tempdir().unwrap();let mut db=open(&dir.path().join("assets-prelive.sqlite")).unwrap();
    initialize(&mut db,"terminal-assets-prelive","Owner","827193","Prelive assets").unwrap();
    let user:String=db.query_row("SELECT id FROM staff",[],|r|r.get(0)).unwrap();let session=login(&db,&user,"827193").unwrap();
    for operation in ["asset.assign","asset.transfer","asset.inspect","asset.retire","maintenance.report","maintenance.assign","maintenance.start","maintenance.complete","maintenance.cancel"] {
        let blocked=execute(&mut db,&session.token,cmd(operation,json!({"id":"missing","reason":"test"}))).unwrap_err();
        assert!(blocked.contains("Complete business setup"),"{operation}: {blocked}");
    }
}
#[test]
fn asset_csv_imports_apply_categories_then_assets_through_native_commands() {
    let (_dir,mut db,s)=setup();
    let seed_batch=Uuid::new_v4().to_string();let stamp="2026-09-27T00:00:00Z";
    db.execute(
        "INSERT INTO import_batches(id,template_key,file_name,status,created_by,created_at,updated_at,row_count,valid_count,invalid_count,source_hash,headers,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rusqlite::params![seed_batch,"stock_locations","seed.csv","APPLIED",s.staff_id,stamp,stamp,0,0,0,"seed","[]",""]
    ).unwrap();
    db.execute(
        "INSERT INTO import_external_ids(namespace,external_id,collection,record_id,batch_id,created_at) VALUES('stock_locations','stock-main','stockLocations','main',?,?)",
        rusqlite::params![seed_batch,stamp]
    ).unwrap();

    let categories="external_id,name,code,depreciation_method,useful_life_months,active\nassetcat-electronics,Electronics,ELEC,STRAIGHT_LINE,60,true\n";
    let batch=import_stage(&mut db,&s.token,"asset_categories","asset_categories.csv",categories).unwrap();
    let plan=import_plan(&mut db,&s.token,batch["id"].as_str().unwrap()).unwrap();assert_eq!(plan["status"],"READY");
    assert_eq!(plan["steps"][0]["operation"],"assetCategory.save");let plan_id=plan["id"].as_str().unwrap().to_string();import_apply(&mut db,&s.token,&plan_id).unwrap();

    let assets="external_id,asset_tag,name,category_external_id,serial_number,location_external_id,acquisition_date,acquisition_cost,status,notes\nasset-tv-001,TV-001,Guest Room Smart TV,assetcat-electronics,SN-001,stock-main,2026-01-15,45000.00,IN_SERVICE,Imported asset\n";
    let batch=import_stage(&mut db,&s.token,"assets","assets.csv",assets).unwrap();
    let plan=import_plan(&mut db,&s.token,batch["id"].as_str().unwrap()).unwrap();assert_eq!(plan["status"],"READY");
    assert_eq!(plan["steps"][0]["operation"],"asset.save");let plan_id=plan["id"].as_str().unwrap().to_string();import_apply(&mut db,&s.token,&plan_id).unwrap();
    let asset=list(&db,"assets").unwrap().into_iter().find(|r|r["data"]["tag"]=="TV-001").unwrap()["data"].clone();
    assert_eq!(asset["locationId"],"main");assert_eq!(asset["purchaseCostMinor"],4_500_000);assert_eq!(asset["status"],"ACTIVE");
}

// SERVOS_PATCH_09_ASSET_REGISTER
#[test]
fn classified_procurement_splits_stock_expense_asset_without_double_inventory() {
    let (_dir,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"stockItems","id":"linen","data":{"name":"Bed Linen","code":"LINEN","baseUnit":"unit","averageUnitCost":0}}));
    run(&mut db,&s,"record.save",json!({"collection":"suppliers","id":"mixed-supplier","data":{"name":"Mixed Supplier","code":"MIXED","active":true}}));
    run(&mut db,&s,"assetCategory.save",json!({"id":"tv-category","data":{"name":"Televisions","code":"TV","depreciationMethod":"STRAIGHT_LINE","usefulLifeMonths":60}}));

    run(&mut db,&s,"purchaseOrder.create",json!({
        "supplierId":"mixed-supplier",
        "items":[
            {"lineId":"line-stock","treatment":"STOCK","stockItemId":"linen","quantityOrdered":5,"unitPrice":1000},
            {"lineId":"line-expense","treatment":"EXPENSE","description":"Laundry chemicals","expenseCategory":"GENERAL","quantityOrdered":2,"unitPrice":500},
            {"lineId":"line-asset","treatment":"ASSET","assetName":"Guest Room Smart TV","assetCategoryId":"tv-category","quantityOrdered":2,"unitPrice":45000}
        ]
    }));
    let order=list(&db,"purchaseOrders").unwrap().into_iter().find(|r|r["data"]["supplierId"]=="mixed-supplier").unwrap();
    let order_id=order["id"].as_str().unwrap().to_string();
    let (version,_)=get(&db,"purchaseOrders",&order_id).unwrap();
    let mut receive=cmd("purchaseOrder.receive",json!({
        "purchaseOrderId":order_id,"locationId":"main","supplierInvoiceNumber":"INV-MIXED-1",
        "lines":[
            {"lineId":"line-stock","quantityDelivered":5,"quantityAccepted":5,"quantityRejected":0},
            {"lineId":"line-expense","quantityDelivered":2,"quantityAccepted":2,"quantityRejected":0},
            {"lineId":"line-asset","quantityDelivered":2,"quantityAccepted":2,"quantityRejected":0}
        ]
    }));
    receive.target_version=Some(version);execute(&mut db,&s.token,receive).unwrap();

    assert_eq!(get(&db,"stockItems","linen").unwrap().1["currentStock"]["main"],5.0);
    let acquisitions:Vec<Value>=list(&db,"assetAcquisitions").unwrap().into_iter().filter(|r|r["data"]["purchaseOrderId"]==order_id).collect();
    assert_eq!(acquisitions.len(),2);
    assert!(acquisitions.iter().all(|r|r["data"]["status"]=="PENDING_COMMISSION"));
    assert_eq!(list(&db,"assets").unwrap().len(),0);
    let receipt=list(&db,"goodsReceipts").unwrap().into_iter().find(|r|r["data"]["purchaseOrderId"]==order_id).unwrap()["data"].clone();
    assert_eq!(receipt["treatmentTotals"]["stockMinor"],500_000);
    assert_eq!(receipt["treatmentTotals"]["expenseMinor"],100_000);
    assert_eq!(receipt["treatmentTotals"]["assetMinor"],9_000_000);
    let journal=list(&db,"journalEntries").unwrap().into_iter().find(|r|r["data"]["sourceType"]=="SUPPLIER_RECEIPT"&&r["data"]["sourceId"]==receipt["id"]).unwrap()["data"].clone();
    assert!(journal["lines"].as_array().unwrap().iter().any(|l|l["accountId"]=="INVENTORY"&&l["debitMinor"]==500_000));
    assert!(journal["lines"].as_array().unwrap().iter().any(|l|l["accountId"]=="OPERATING_EXPENSE"&&l["debitMinor"]==100_000));
    assert!(journal["lines"].as_array().unwrap().iter().any(|l|l["accountId"]=="ASSET_CLEARING"&&l["debitMinor"]==9_000_000));
    assert!(journal["lines"].as_array().unwrap().iter().any(|l|l["accountId"]=="ACCOUNTS_PAYABLE"&&l["creditMinor"]==9_600_000));

    let payable=list(&db,"supplierPayables").unwrap().into_iter().find(|r|r["data"]["purchaseOrderId"]==order_id).unwrap();
    let payable_id=payable["id"].as_str().unwrap().to_string();let (pv,_)=get(&db,"supplierPayables",&payable_id).unwrap();
    let receipt_lines=receipt["lines"].as_array().unwrap();
    let invoice_lines:Vec<Value>=receipt_lines.iter().map(|line|json!({"lineId":line["lineId"],"quantityBilled":line["quantityAccepted"],"unitPrice":line["unitCost"]})).collect();
    let mut matched=cmd("supplierPayable.matchInvoice",json!({"payableId":payable_id,"invoiceNumber":"INV-MIXED-1","invoiceDate":"2026-09-27","dueDate":"2026-10-27","invoiceAmount":96000.0,"lines":invoice_lines}));
    matched.target_version=Some(pv);execute(&mut db,&s.token,matched).unwrap();
    assert_eq!(get(&db,"supplierPayables",&payable_id).unwrap().1["status"],"MATCHED_UNPAID");
}

#[test]
fn asset_commission_reclassifies_clearing_and_never_creates_stock() {
    let (_dir,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"suppliers","id":"asset-supplier","data":{"name":"Asset Supplier","code":"ASSET-SUP","active":true}}));
    run(&mut db,&s,"assetCategory.save",json!({"id":"generator-category","data":{"name":"Generators","code":"GEN","depreciationMethod":"STRAIGHT_LINE","usefulLifeMonths":120}}));
    run(&mut db,&s,"purchaseOrder.create",json!({"supplierId":"asset-supplier","items":[{"lineId":"generator-line","treatment":"ASSET","assetName":"Backup Generator","assetCategoryId":"generator-category","quantityOrdered":1,"unitPrice":250000}]}));
    let order=list(&db,"purchaseOrders").unwrap().into_iter().find(|r|r["data"]["supplierId"]=="asset-supplier").unwrap();let order_id=order["id"].as_str().unwrap().to_string();
    let (ov,_)=get(&db,"purchaseOrders",&order_id).unwrap();let mut receipt=cmd("purchaseOrder.receive",json!({"purchaseOrderId":order_id,"lines":[{"lineId":"generator-line","quantityDelivered":1,"quantityAccepted":1,"quantityRejected":0}]}));receipt.target_version=Some(ov);execute(&mut db,&s.token,receipt).unwrap();
    let acquisition=list(&db,"assetAcquisitions").unwrap().into_iter().find(|r|r["data"]["purchaseOrderId"]==order_id).unwrap();let acquisition_id=acquisition["id"].as_str().unwrap().to_string();
    let before_stock=list(&db,"stockMovements").unwrap().len();
    let (av,_)=get(&db,"assetAcquisitions",&acquisition_id).unwrap();
    let mut commission=cmd("asset.commission",json!({"acquisitionId":acquisition_id,"tag":"GEN-001","locationId":"main","serialNumber":"SER-GEN-001","warrantyUntil":"2028-09-27","notes":"Commissioned from PO"}));commission.target_version=Some(av);
    execute(&mut db,&s.token,commission).unwrap();
    let asset=list(&db,"assets").unwrap().into_iter().find(|r|r["data"]["tag"]=="GEN-001").unwrap()["data"].clone();
    assert_eq!(asset["purchaseCostMinor"],25_000_000);assert_eq!(asset["acquisitionId"],acquisition_id);assert_eq!(asset["locationId"],"main");
    assert_eq!(get(&db,"assetAcquisitions",&acquisition_id).unwrap().1["status"],"COMMISSIONED");
    assert_eq!(list(&db,"stockMovements").unwrap().len(),before_stock);
    let journal=list(&db,"journalEntries").unwrap().into_iter().find(|r|r["data"]["sourceType"]=="ASSET_COMMISSIONING").unwrap()["data"].clone();
    assert!(journal["lines"].as_array().unwrap().iter().any(|l|l["accountId"]=="FIXED_ASSETS"&&l["debitMinor"]==25_000_000));
    assert!(journal["lines"].as_array().unwrap().iter().any(|l|l["accountId"]=="ASSET_CLEARING"&&l["creditMinor"]==25_000_000));

    let (av,_)=get(&db,"assetAcquisitions",&acquisition_id).unwrap();let mut again=cmd("asset.commission",json!({"acquisitionId":acquisition_id,"tag":"GEN-002","locationId":"main"}));again.target_version=Some(av);
    assert!(execute(&mut db,&s.token,again).unwrap_err().contains("already commissioned"));
}

#[test]
fn classified_asset_quantity_requires_whole_units_and_commissioning_is_live_only() {
    let (_dir,mut db,s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"suppliers","id":"whole-supplier","data":{"name":"Whole Supplier","code":"WHOLE","active":true}}));
    run(&mut db,&s,"assetCategory.save",json!({"id":"whole-category","data":{"name":"Equipment","code":"WHOLECAT","depreciationMethod":"STRAIGHT_LINE","usefulLifeMonths":60}}));
    let bad=execute(&mut db,&s.token,cmd("purchaseOrder.create",json!({"supplierId":"whole-supplier","items":[{"treatment":"ASSET","assetName":"Machine","assetCategoryId":"whole-category","quantityOrdered":1.5,"unitPrice":1000}]})));
    assert!(bad.unwrap_err().contains("whole number"));

    let dir=tempfile::tempdir().unwrap();let mut pre=open(&dir.path().join("commission-prelive.sqlite")).unwrap();
    initialize(&mut pre,"terminal-commission-prelive","Owner","928174","Prelive commission").unwrap();
    let uid:String=pre.query_row("SELECT id FROM staff",[],|r|r.get(0)).unwrap();let session=login(&pre,&uid,"928174").unwrap();
    let blocked=execute(&mut pre,&session.token,cmd("asset.commission",json!({"acquisitionId":"missing","tag":"X","locationId":"main"}))).unwrap_err();
    assert!(blocked.contains("Complete business setup"));
}

// SERVOS_PATCH_10_TERMINAL_ACCEPTANCE
#[test]
fn terminal_acceptance_evidence_is_local_immutable_and_latest_schema() {
    let (_dir,db,s)=setup();
    let schema:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).unwrap();
    assert_eq!(schema,13);
    let before:(i64,i64,i64)=db.query_row(
        "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM outbox),(SELECT COUNT(*) FROM commands)",
        [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
    ).unwrap();
    db.execute(
        "INSERT INTO terminal_acceptance_evidence(id,kind,details,actor_id,actor_name,occurred_at) VALUES(?,?,?,?,?,?)",
        rusqlite::params!["acceptance-test","SCANNER_INPUT",r#"{"rawValueStored":false,"codeLength":8}"#,s.staff_id,s.name,"2026-09-27T00:00:00Z"]
    ).unwrap();
    let after:(i64,i64,i64)=db.query_row(
        "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM outbox),(SELECT COUNT(*) FROM commands)",
        [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
    ).unwrap();
    assert_eq!(before,after);
    assert!(db.execute("UPDATE terminal_acceptance_evidence SET kind='OTHER' WHERE id='acceptance-test'",[]).is_err());
    assert!(db.execute("DELETE FROM terminal_acceptance_evidence WHERE id='acceptance-test'",[]).is_err());
    let details:String=db.query_row("SELECT details FROM terminal_acceptance_evidence WHERE id='acceptance-test'",[],|r|r.get(0)).unwrap();
    assert!(!details.contains("12345678"));
    assert!(details.contains(r#""rawValueStored":false"#));
}

#[test]
fn audit_cannot_be_modified() {
    let (_, db, _) = setup();
    assert!(db.execute("DELETE FROM audit", []).is_err());
    assert!(db.execute("UPDATE audit SET actor_id='x'", []).is_err());
}
#[test]
fn changed_payload_cannot_reuse_command_id() {
    let (_, mut db, s) = setup();
    let mut command = cmd("till.open", json!({"floatAmount":10}));
    execute(&mut db, &s.token, command.clone()).unwrap();
    command.payload = json!({"floatAmount":99});
    assert!(execute(&mut db, &s.token, command).is_err());
}
#[test]
fn transfer_and_waste_cannot_create_negative_stock() {
    let (_, mut db, s) = setup();
    run(
        &mut db,
        &s,
        "record.save",
        json!({"collection":"stockItems","id":"stock","data":{"name":"Flour","code":"FLOUR","baseUnit":"g","averageUnitCost":0.03,"currentStock":{"main":999}}}),
    );
    assert_eq!(
        get(&db, "stockItems", "stock").unwrap().1["currentStock"],
        json!({})
    );
    run(
        &mut db,
        &s,
        "inventory.adjust",
        json!({"stockItemId":"stock","locationId":"main","countedQty":10,"reason":"Opening stock count"}),
    );
    assert!(execute(
        &mut db,
        &s.token,
        cmd(
            "inventory.waste",
            json!({"stockItemId":"stock","locationId":"main","quantity":11,"reason":"Damaged"})
        )
    )
    .is_err());
    assert_eq!(
        get(&db, "stockItems", "stock").unwrap().1["currentStock"]["main"],
        10.0
    );
    assert_eq!(list(&db, "stockMovements").unwrap().len(), 1);
}
#[test]
fn tax_snapshots_and_partial_payment_rounding_preserve_totals() {
    let (_, mut db, s) = setup();
    let (version, mut property) = get(&db, "property", "property").unwrap();
    property["vatRatePct"] = json!(16);
    property["levyRatePct"] = json!(2);
    let mut policy = cmd(
        "record.save",
        json!({"collection":"property","id":"property","data":property}),
    );
    policy.target_version = Some(version);
    execute(&mut db, &s.token, policy).unwrap();
    run(&mut db, &s, "till.open", json!({"floatAmount":0}));
    let order_id = order(&mut db, &s);
    for amount in [33.33, 33.33, 33.34] {
        run(
            &mut db,
            &s,
            "payment.record",
            json!({"orderId":order_id,"method":"CASH","amount":amount,"cashTendered":amount}),
        );
    }
    let journals = list(&db, "journalEntries").unwrap();
    let mut credit = 0i64;
    let mut vat = 0i64;
    for entry in journals {
        for line in entry["data"]["lines"].as_array().unwrap() {
            credit += line["creditMinor"].as_i64().unwrap();
            if line["accountId"] == "VAT" {
                vat += line["creditMinor"].as_i64().unwrap();
            }
        }
    }
    assert_eq!(credit, 10000);
    assert_eq!(vat, 1356);
    assert_eq!(
        get(&db, "orders", &order_id).unwrap().1["state"],
        "COMPLETED"
    );
}

fn layout_table(key: &str, label: &str) -> Value {
    json!({"id":key,"label":label,"capacity":4,"section":"MAIN_DECK","shape":"SQUARE","posX":10,"posY":20,"minimumSpend":0,"isJoinable":true})
}
fn layout(db: &rusqlite::Connection, tables: Value) -> BusinessCommand {
    let baseline: Vec<Value> = list(db, "tables")
        .unwrap()
        .into_iter()
        .filter(|r| r["data"]["outletId"] == "main")
        .map(|r| json!({"id":r["id"],"version":r["version"]}))
        .collect();
    cmd(
        "floorplan.save",
        json!({"outletId":"main","baseline":baseline,"tables":tables}),
    )
}
#[test]
fn paid_table_requires_cleaning_and_readiness_survives_restart() {
    let (dir, mut db, s) = setup();
    let key = Uuid::new_v4().to_string();
    let create = layout(&db, json!([layout_table(&key, "1")]));
    execute(&mut db, &s.token, create).unwrap();
    let product = Uuid::new_v4().to_string();
    run(
        &mut db,
        &s,
        "record.save",
        json!({"collection":"products","id":product,"data":{"name":"Service","code":product,"price":100,"routeTo":"SERVICE","outletIds":["main"]}}),
    );
    run(&mut db, &s, "till.open", json!({"floatAmount":0}));
    let result = run(&mut db, &s, "order.create", json!({"tableId":key,"outletId":"main"}));
    let order_id = result["recordIds"][0].as_str().unwrap();
    run(
        &mut db,
        &s,
        "order.addItem",
        json!({"orderId":order_id,"productId":product}),
    );
    run(
        &mut db,
        &s,
        "payment.record",
        json!({"orderId":order_id,"method":"CASH","amount":100,"cashTendered":100}),
    );
    let (version, table) = get(&db, "tables", &key).unwrap();
    assert_eq!(table["state"], "CLEANING");
    assert!(execute(
        &mut db,
        &s.token,
        cmd("order.create", json!({"tableId":key,"outletId":"main"}))
    )
    .is_err());
    let mut ready = cmd("table.ready", json!({"tableId":key,"outletId":"main"}));
    ready.target_version = Some(version - 1);
    assert!(execute(&mut db, &s.token, ready.clone()).is_err());
    ready.target_version = Some(version);
    let result = execute(&mut db, &s.token, ready.clone()).unwrap();
    assert_eq!(execute(&mut db, &s.token, ready).unwrap(), result);
    drop(db);
    let mut db = open(&dir.path().join("test.sqlite")).unwrap();
    let table = get(&db, "tables", &key).unwrap().1;
    assert_eq!(table["state"], "AVAILABLE");
    assert_eq!(table["cleanedBy"], s.staff_id);
    run(&mut db, &s, "order.create", json!({"tableId":key,"outletId":"main"}));
    assert_eq!(list(&db, "orders").unwrap().len(), 2);
}
#[test]
fn floorplan_rejects_stale_saves_and_rolls_back_active_table_removal() {
    let (_, mut db, s) = setup();
    let a = Uuid::new_v4().to_string();
    let b = Uuid::new_v4().to_string();
    let create = layout(&db, json!([layout_table(&a, "1"), layout_table(&b, "2")]));
    execute(&mut db, &s.token, create).unwrap();
    let stale = layout(
        &db,
        json!([layout_table(&a, "Changed"), layout_table(&b, "2")]),
    );
    run(&mut db, &s, "order.create", json!({"tableId":b,"outletId":"main"}));
    assert!(execute(&mut db, &s.token, stale).is_err());
    let before = list(&db, "tables").unwrap();
    let audit_before: i64 = db
        .query_row("SELECT count(*) FROM audit", [], |r| r.get(0))
        .unwrap();
    let remove = layout(&db, json!([layout_table(&a, "Changed")]));
    assert!(execute(&mut db, &s.token, remove).is_err());
    assert_eq!(list(&db, "tables").unwrap(), before);
    assert_eq!(
        db.query_row("SELECT count(*) FROM audit", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        audit_before
    );
}
#[test]
fn floorplan_changes_preserve_occupied_table_and_archive_removed_table() {
    let (dir, mut db, s) = setup();
    let a = Uuid::new_v4().to_string();
    let b = Uuid::new_v4().to_string();
    let create = layout(&db, json!([layout_table(&a, "1"), layout_table(&b, "2")]));
    execute(&mut db, &s.token, create).unwrap();
    let order = run(&mut db, &s, "order.create", json!({"tableId":a,"outletId":"main"}))["recordIds"][0].clone();
    let mut moved = layout_table(&a, "Patio 1");
    moved["posX"] = json!(80);
    moved["state"] = json!("AVAILABLE");
    moved["currentOrderId"] = Value::Null;
    let save = layout(&db, json!([moved]));
    execute(&mut db, &s.token, save).unwrap();
    drop(db);
    let db = open(&dir.path().join("test.sqlite")).unwrap();
    let table = get(&db, "tables", &a).unwrap().1;
    assert_eq!(table["currentOrderId"], order);
    assert_eq!(table["state"], "ORDERING");
    assert_eq!(table["posX"], 80);
    assert!(get(&db, "tables", &b).is_err());
}
#[test]
fn floorplan_requires_manager_and_prevents_duplicate_labels() {
    let (_, mut db, s) = setup();
    let a = Uuid::new_v4().to_string();
    let b = Uuid::new_v4().to_string();
    let duplicate = layout(
        &db,
        json!([layout_table(&a, "Table 1"), layout_table(&b, " table 1 ")]),
    );
    assert!(execute(&mut db, &s.token, duplicate).is_err());
    assert!(list(&db, "tables").unwrap().is_empty());
    run(
        &mut db,
        &s,
        "staff.create",
        json!({"name":"Server","pin":"123987","role":"Server"}),
    );
    let staff: String = db
        .query_row("SELECT id FROM staff WHERE role='Server'", [], |r| r.get(0))
        .unwrap();
    let server = login(&db, &staff, "123987").unwrap();
    let create = layout(&db, json!([layout_table(&a, "1")]));
    assert!(execute(&mut db, &server.token, create).is_err());
}

#[test]
fn trading_is_blocked_until_native_go_live() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = open(&dir.path().join("prelive.sqlite")).unwrap();
    initialize(&mut db, "terminal-prelive", "Owner", "827193", "Prelive business").unwrap();
    let user: String = db.query_row("SELECT id FROM staff", [], |r| r.get(0)).unwrap();
    let session = login(&db, &user, "827193").unwrap();
    assert_eq!(installation_stage(&db).unwrap(), "SETUP_REQUIRED");
    assert!(execute(&mut db, &session.token, cmd("till.open", json!({"floatAmount":0}))).is_err());
    assert!(execute(&mut db, &session.token, cmd("order.create", json!({"outletId":"missing","name":"Nope"}))).is_err());
    for operation in ["folio.open","folio.deposit","folio.pay","stay.extend","stay.checkOut","pos.roomCharge"] {
        let blocked=execute(&mut db,&session.token,cmd(operation,json!({"id":"missing","orderId":"missing"}))).unwrap_err();
        assert!(blocked.contains("Complete business setup"),"{operation}: {blocked}");
    }
}

#[test]
fn payment_reverse_uses_its_declared_permission_and_requires_go_live() {
    let dir = tempfile::tempdir().unwrap();
    let mut prelive = open(&dir.path().join("reverse-prelive.sqlite")).unwrap();
    initialize(&mut prelive, "terminal-prelive", "Owner", "827193", "Prelive business").unwrap();
    let owner_id: String = prelive.query_row("SELECT id FROM staff", [], |r| r.get(0)).unwrap();
    let owner = login(&prelive, &owner_id, "827193").unwrap();
    let blocked = execute(&mut prelive, &owner.token, cmd("payment.reverse", json!({"paymentId":"missing","reason":"Test"}))).unwrap_err();
    assert!(blocked.to_string().contains("Complete business setup"));

    let (_, mut db, admin) = setup();
    run(&mut db, &admin, "staff.create", json!({"name":"Cashier","pin":"123987","role":"Server"}));
    run(&mut db, &admin, "till.open", json!({"floatAmount":100}));
    let admin_id: String = db.query_row("SELECT id FROM staff WHERE role='Admin'", [], |r| r.get(0)).unwrap();
    let cashier_id: String = db.query_row("SELECT id FROM staff WHERE role='Server'", [], |r| r.get(0)).unwrap();
    let cashier = login(&db, &cashier_id, "123987").unwrap();
    let order_id = run(&mut db, &cashier, "order.create", json!({"outletId":"main","name":"Reverse permission"}))["recordIds"][0].as_str().unwrap().to_string();
    run(&mut db, &cashier, "order.addItem", json!({"orderId":order_id,"productId":"setup-product"}));
    run(&mut db, &cashier, "order.fire", json!({"orderId":order_id}));
    run(&mut db, &cashier, "payment.record", json!({"orderId":order_id,"method":"CASH","amount":1,"cashTendered":1}));
    let payment_id = list(&db, "payments").unwrap().last().unwrap()["id"].as_str().unwrap().to_string();
    let approval = create_approval(&db, &cashier.token, &admin_id, "827193", "payment.reverse", Some(&payment_id)).unwrap();
    run(&mut db, &cashier, "payment.reverse", json!({"paymentId":payment_id,"reason":"Approved reversal","approvalToken":approval["token"]}));
    assert_eq!(list(&db, "refunds").unwrap().last().unwrap()["data"]["amount"], 1.0);
}

#[test]
fn manager_approval_is_targeted_and_single_use() {
    let (_, mut db, admin) = setup();
    run(&mut db,&admin,"staff.create",json!({"name":"Manager","pin":"654321","role":"Manager","jobTitle":"Supervisor"}));
    run(&mut db,&admin,"staff.create",json!({"name":"Bartender","pin":"123456","role":"Server","jobTitle":"Bartender"}));
    let manager_id:String=db.query_row("SELECT id FROM staff WHERE role='Manager'",[],|r|r.get(0)).unwrap();
    let server_id:String=db.query_row("SELECT id FROM staff WHERE role='Server'",[],|r|r.get(0)).unwrap();
    let server=login(&db,&server_id,"123456").unwrap();
    let order_id=run(&mut db,&server,"order.create",json!({"outletId":"main","name":"Approval test"}))["recordIds"][0].as_str().unwrap().to_string();
    run(&mut db,&server,"order.addItem",json!({"orderId":order_id,"productId":"setup-product"}));
    let approval=create_approval(&db,&server.token,&manager_id,"654321","order.discount",Some(&order_id)).unwrap();
    let token=approval["token"].as_str().unwrap();
    run(&mut db,&server,"order.discount",json!({"orderId":order_id,"percent":10,"reason":"Approved promotion","approvalToken":token}));
    assert!(execute(&mut db,&server.token,cmd("order.discount",json!({"orderId":order_id,"percent":5,"reason":"Second use","approvalToken":token}))).is_err());
    let other=run(&mut db,&server,"order.create",json!({"outletId":"main","name":"Other tab"}))["recordIds"][0].as_str().unwrap().to_string();
    run(&mut db,&server,"order.addItem",json!({"orderId":other,"productId":"setup-product"}));
    let approval=create_approval(&db,&server.token,&manager_id,"654321","order.discount",Some(&order_id)).unwrap();
    assert!(execute(&mut db,&server.token,cmd("order.discount",json!({"orderId":other,"percent":5,"reason":"Wrong target","approvalToken":approval["token"]}))).is_err());
}

#[test]
fn portion_modifier_recipe_snapshot_depletes_stock_once() {
    let (_, mut db, s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"stockItems","id":"spirit","data":{"name":"Spirit","code":"SPIRIT","baseUnit":"ml","averageUnitCost":1,"currentStock":{}}}));
    run(&mut db,&s,"record.save",json!({"collection":"stockItems","id":"mixer","data":{"name":"Mixer","code":"MIX","baseUnit":"ml","averageUnitCost":0.2,"currentStock":{}}}));
    run(&mut db,&s,"inventory.adjust",json!({"stockItemId":"spirit","locationId":"main","countedQty":750,"reason":"Test opening"}));
    run(&mut db,&s,"inventory.adjust",json!({"stockItemId":"mixer","locationId":"main","countedQty":1000,"reason":"Test opening"}));
    run(&mut db,&s,"record.save",json!({"collection":"products","id":"whisky","data":{"name":"Whisky","code":"WHISKY","price":250,"routeTo":"BAR","category":"SPIRITS","outletIds":["main"],"stockItemId":"spirit","taxClassId":"A_STANDARD","portions":[{"id":"double","name":"Double","volume":60,"price":450}],"modifiers":[{"id":"mixer","name":"Mixer","priceDelta":50,"ingredientAdjustments":[{"stockItemId":"mixer","quantityDelta":100}]}]}}));
    let result=run(&mut db,&s,"order.create",json!({"outletId":"main","name":"Portion test"}));
    let order_id=result["recordIds"][0].as_str().unwrap().to_string();
    run(&mut db,&s,"order.addItem",json!({"orderId":order_id,"productId":"whisky","quantity":2,"portionId":"double","modifierIds":["mixer"]}));
    let before=get(&db,"orders",&order_id).unwrap().1["items"][0].clone();
    assert_eq!(before["portionSnapshot"]["volume"],60);
    assert_eq!(before["ingredientSnapshot"].as_array().unwrap().len(),2);
    run(&mut db,&s,"order.fire",json!({"orderId":order_id}));
    assert_eq!(get(&db,"stockItems","spirit").unwrap().1["currentStock"]["main"],630.0);
    assert_eq!(get(&db,"stockItems","mixer").unwrap().1["currentStock"]["main"],800.0);
    run(&mut db,&s,"order.fire",json!({"orderId":order_id}));
    assert_eq!(get(&db,"stockItems","spirit").unwrap().1["currentStock"]["main"],630.0);
}

#[test]
fn product_families_keep_container_variants_and_sale_formats_on_separate_stock() {
    let (_, mut db, s)=setup();
    for (id,code,name) in [("whisky-350-stock","WHISKY-350-STOCK","Whisky 350 stock"),("whisky-750-stock","WHISKY-750-STOCK","Whisky 750 stock")] {
        run(&mut db,&s,"record.save",json!({"collection":"stockItems","id":id,"data":{"name":name,"code":code,"baseUnit":"ml","averageUnitCost":1,"currentStock":{}}}));
    }
    run(&mut db,&s,"inventory.adjust",json!({"stockItemId":"whisky-350-stock","locationId":"main","countedQty":1000,"reason":"Opening count"}));
    run(&mut db,&s,"inventory.adjust",json!({"stockItemId":"whisky-750-stock","locationId":"main","countedQty":2000,"reason":"Opening count"}));
    let small=json!({"name":"Whisky 350 ml bottle","code":"WHISKY-350","price":900,"routeTo":"BAR","category":"SPIRITS","outletIds":["main"],"stockItemId":"whisky-350-stock","productFamilyId":"whisky-family","productFamilyName":"Whisky","packageType":"Bottle","containerQuantity":350,"containerUnit":"ml","variantLabel":"350 ml bottle","portionVolume":350,"portions":[{"id":"small-whole","name":"Whole bottle","volume":350,"price":900},{"id":"small-single","name":"Single","volume":30,"price":100}]});
    run(&mut db,&s,"record.save",json!({"collection":"products","id":"whisky-350","data":small}));
    let large=json!({"name":"Whisky 750 ml bottle","code":"WHISKY-750","price":1800,"routeTo":"BAR","category":"SPIRITS","outletIds":["main"],"stockItemId":"whisky-750-stock","productFamilyId":"whisky-family","productFamilyName":"Whisky","packageType":"Bottle","containerQuantity":750,"containerUnit":"ml","variantLabel":"750 ml bottle","portionVolume":750,"portions":[{"id":"large-whole","name":"Whole bottle","volume":750,"price":1800},{"id":"large-single","name":"Single","volume":30,"price":150}]});
    run(&mut db,&s,"record.save",json!({"collection":"products","id":"whisky-750","data":large}));
    let mut duplicate_size=small.clone(); duplicate_size["code"]=json!("WHISKY-DUP-SIZE"); duplicate_size["stockItemId"]=Value::Null;
    let duplicate_size=execute(&mut db,&s.token,cmd("record.save",json!({"collection":"products","id":"whisky-duplicate-size","data":duplicate_size}))).unwrap_err();
    assert!(duplicate_size.to_string().contains("already has that physical size"));
    let mut shared_stock=large.clone(); shared_stock["code"]=json!("WHISKY-SHARED"); shared_stock["variantLabel"]=json!("1 L bottle");
    let shared_stock=execute(&mut db,&s.token,cmd("record.save",json!({"collection":"products","id":"whisky-shared-stock","data":shared_stock}))).unwrap_err();
    assert!(shared_stock.to_string().contains("needs its own stock item"));

    let order_id=run(&mut db,&s,"order.create",json!({"outletId":"main","name":"Variant stock check"}))["recordIds"][0].as_str().unwrap().to_string();
    run(&mut db,&s,"order.addItem",json!({"orderId":order_id,"productId":"whisky-350","portionId":"small-single"}));
    run(&mut db,&s,"order.addItem",json!({"orderId":order_id,"productId":"whisky-750","portionId":"large-whole"}));
    run(&mut db,&s,"order.fire",json!({"orderId":order_id}));
    assert_eq!(get(&db,"stockItems","whisky-350-stock").unwrap().1["currentStock"]["main"],970.0);
    assert_eq!(get(&db,"stockItems","whisky-750-stock").unwrap().1["currentStock"]["main"],1250.0);
}

#[test]
fn atomic_catalog_setup_creates_linked_stock_and_opening_movement_once() {
    let (_,mut db,s)=setup();
    let outbox_before:i64=db.query_row("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap();
    let product=json!({"name":"Atomic Whisky 750 ml bottle","code":"ATOMIC-WHISKY-750","price":1800,"routeTo":"BAR","category":"SPIRITS","outletIds":["main"],"barcode":"5012345678900","productFamilyId":"atomic-whisky","productFamilyName":"Atomic Whisky","packageType":"Bottle","containerQuantity":750,"containerUnit":"ml","variantLabel":"750 ml bottle","portionVolume":750,"portions":[{"id":"atomic-whole","name":"Whole bottle","volume":750,"price":1800}]});
    let payload=json!({"product":product,"stockItem":{"name":"Atomic Whisky 750 ml","code":"ATOMIC-STOCK-750","barcode":"5012345678900","baseUnit":"ml","scanUnitQuantity":750,"averageUnitCost":0.25,"reorderLevel":1500},"locationId":"main","startingQuantity":9000});
    let command=cmd("catalog.createWithOpeningStock",payload);
    let result=execute(&mut db,&s.token,command.clone()).unwrap();
    assert_eq!(result["recordIds"].as_array().unwrap().len(),3);
    let products=list(&db,"products").unwrap();
    let product=products.iter().find(|row|row["data"]["code"]=="ATOMIC-WHISKY-750").unwrap();
    let stock_id=product["data"]["stockItemId"].as_str().unwrap();
    let stock=get(&db,"stockItems",stock_id).unwrap().1;
    assert_eq!(stock["currentStock"]["main"],9000.0);
    assert_eq!(stock["barcode"],"5012345678900");
    let movements=list(&db,"stockMovements").unwrap();
    let opening=movements.iter().find(|row|row["data"]["sourceId"]==command.id).unwrap();
    assert_eq!(opening["data"]["movementType"],"OPENING_BALANCE");
    assert_eq!(opening["data"]["quantityDelta"],9000.0);
    assert_eq!(opening["data"]["totalCostValuation"],2250.0);
    let audit_count:i64=db.query_row("SELECT COUNT(*) FROM audit WHERE command_id=?",[command.id.as_str()],|row|row.get(0)).unwrap();
    assert_eq!(audit_count,1);
    assert_eq!(execute(&mut db,&s.token,command).unwrap(),result);
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap(),outbox_before+1);
    assert_eq!(list(&db,"stockMovements").unwrap().iter().filter(|row|row["data"]["sourceId"]==opening["data"]["sourceId"]).count(),1);
}

#[test]
fn atomic_catalog_setup_rolls_back_and_requires_both_permissions() {
    let (_,mut db,s)=setup();
    let mut payload=json!({"product":{"name":"Atomic item","code":"ATOMIC-ITEM","price":100,"routeTo":"BAR","category":"TEST","outletIds":["main"]},"stockItem":{"name":"Atomic stock","code":"ATOMIC-STOCK","baseUnit":"piece","averageUnitCost":0,"scanUnitQuantity":1,"reorderLevel":0},"locationId":"missing-location","startingQuantity":4});
    assert!(execute(&mut db,&s.token,cmd("catalog.createWithOpeningStock",payload.clone())).is_err());
    assert!(!list(&db,"products").unwrap().iter().any(|row|row["data"]["code"]=="ATOMIC-ITEM"));
    assert!(!list(&db,"stockItems").unwrap().iter().any(|row|row["data"]["code"]=="ATOMIC-STOCK"));
    payload["locationId"]=json!("main");
    db.execute_batch("CREATE TRIGGER reject_atomic_opening BEFORE INSERT ON records WHEN NEW.collection='stockMovements' BEGIN SELECT RAISE(ABORT,'forced opening movement failure'); END;").unwrap();
    assert!(execute(&mut db,&s.token,cmd("catalog.createWithOpeningStock",payload.clone())).is_err());
    assert!(!list(&db,"products").unwrap().iter().any(|row|row["data"]["code"]=="ATOMIC-ITEM"));
    assert!(!list(&db,"stockItems").unwrap().iter().any(|row|row["data"]["code"]=="ATOMIC-STOCK"));
    db.execute_batch("DROP TRIGGER reject_atomic_opening;").unwrap();
    execute(&mut db,&s.token,cmd("staff.create",json!({"name":"Server One","role":"Server","pin":"827194"}))).unwrap();
    let server_id:String=db.query_row("SELECT id FROM staff WHERE name='Server One'",[],|row|row.get(0)).unwrap();
    let server=login(&db,&server_id,"827194").unwrap();
    let error=execute(&mut db,&server.token,cmd("catalog.createWithOpeningStock",payload)).unwrap_err();
    assert!(error.contains("catalog.manage")||error.contains("inventory.adjust"));
}

#[test]
fn location_count_commits_full_review_as_one_audited_inventory_transaction() {
    let (_,mut db,s)=setup();
    for (stock_id,name,code,opening) in [("count-beer","Beer","COUNT-BEER",24.0),("count-soda","Soda","COUNT-SODA",12.0)] {
        run(&mut db,&s,"record.save",json!({"collection":"stockItems","id":stock_id,"data":{"name":name,"code":code,"baseUnit":"bottle","averageUnitCost":10,"currentStock":{}}}));
        run(&mut db,&s,"inventory.adjust",json!({"stockItemId":stock_id,"locationId":"main","countedQty":opening,"reason":"Setup"}));
    }
    let before_outbox:i64=db.query_row("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap();
    let command=cmd("inventory.countLocation",json!({"locationId":"main","reason":"Weekly count","rows":[{"stockItemId":"count-beer","expectedQuantity":24,"countedQuantity":26},{"stockItemId":"count-soda","expectedQuantity":12,"countedQuantity":12}]}));
    let result=execute(&mut db,&s.token,command.clone()).unwrap();
    assert_eq!(get(&db,"stockItems","count-beer").unwrap().1["currentStock"]["main"],26.0);
    assert_eq!(get(&db,"stockItems","count-soda").unwrap().1["currentStock"]["main"],12.0);
    let counts=list(&db,"stockCounts").unwrap();
    assert_eq!(counts.len(),1);
    assert_eq!(counts[0]["data"]["itemCount"],2);
    assert_eq!(counts[0]["data"]["matches"],1);
    assert_eq!(counts[0]["data"]["short"],0);
    assert_eq!(counts[0]["data"]["over"],1);
    assert_eq!(counts[0]["data"]["rows"][0]["variance"],2.0);
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM audit WHERE command_id=?",[command.id.as_str()],|row|row.get(0)).unwrap(),1);
    assert_eq!(list(&db,"stockMovements").unwrap().iter().filter(|row|row["data"]["sourceId"]==command.id).count(),1);
    assert_eq!(execute(&mut db,&s.token,command).unwrap(),result);
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap(),before_outbox+1);
}

#[test]
fn location_count_rejects_stale_partial_and_failed_multi_item_writes() {
    let (_,mut db,s)=setup();
    for (stock_id,name,code) in [("count-one","Count One","COUNT-ONE"),("count-two","Count Two","COUNT-TWO")] {
        run(&mut db,&s,"record.save",json!({"collection":"stockItems","id":stock_id,"data":{"name":name,"code":code,"baseUnit":"piece","averageUnitCost":0,"currentStock":{}}}));
        run(&mut db,&s,"inventory.adjust",json!({"stockItemId":stock_id,"locationId":"main","countedQty":5,"reason":"Setup"}));
    }
    let outbox_before:i64=db.query_row("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap();
    let partial=cmd("inventory.countLocation",json!({"locationId":"main","rows":[{"stockItemId":"count-one","expectedQuantity":5,"countedQuantity":8}]}));
    assert!(execute(&mut db,&s.token,partial).unwrap_err().contains("every active stock item"));
    let stale=cmd("inventory.countLocation",json!({"locationId":"main","rows":[{"stockItemId":"count-one","expectedQuantity":4,"countedQuantity":8},{"stockItemId":"count-two","expectedQuantity":5,"countedQuantity":5}]}));
    assert!(execute(&mut db,&s.token,stale).unwrap_err().contains("changed while this count was open"));
    db.execute_batch("CREATE TRIGGER reject_second_count BEFORE INSERT ON records WHEN NEW.collection='stockMovements' AND json_extract(NEW.data,'$.stockItemId')='count-two' BEGIN SELECT RAISE(ABORT,'forced second variance failure'); END;").unwrap();
    let failed=cmd("inventory.countLocation",json!({"locationId":"main","rows":[{"stockItemId":"count-one","expectedQuantity":5,"countedQuantity":8},{"stockItemId":"count-two","expectedQuantity":5,"countedQuantity":2}]}));
    assert!(execute(&mut db,&s.token,failed).is_err());
    assert_eq!(get(&db,"stockItems","count-one").unwrap().1["currentStock"]["main"],5.0);
    assert_eq!(get(&db,"stockItems","count-two").unwrap().1["currentStock"]["main"],5.0);
    assert!(list(&db,"stockCounts").unwrap().is_empty());
    assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM outbox",[],|row|row.get(0)).unwrap(),outbox_before);
    db.execute_batch("DROP TRIGGER reject_second_count;").unwrap();
    run(&mut db,&s,"staff.create",json!({"name":"Count Server","role":"Server","pin":"827195"}));
    let server_id:String=db.query_row("SELECT id FROM staff WHERE name='Count Server'",[],|row|row.get(0)).unwrap();
    let server=login(&db,&server_id,"827195").unwrap();
    let denied=cmd("inventory.countLocation",json!({"locationId":"main","rows":[{"stockItemId":"count-one","expectedQuantity":5,"countedQuantity":5},{"stockItemId":"count-two","expectedQuantity":5,"countedQuantity":5}]}));
    assert!(execute(&mut db,&server.token,denied).is_err());
}

#[test]
fn refund_reverses_money_without_automatic_stock_return() {
    let (_, mut db, s)=setup();
    run(&mut db,&s,"record.save",json!({"collection":"stockItems","id":"beer-stock","data":{"name":"Beer","code":"BEER-STOCK","baseUnit":"bottle","averageUnitCost":100,"currentStock":{}}}));
    run(&mut db,&s,"inventory.adjust",json!({"stockItemId":"beer-stock","locationId":"main","countedQty":5,"reason":"Opening"}));
    run(&mut db,&s,"record.save",json!({"collection":"products","id":"beer","data":{"name":"Beer","code":"BEER","price":300,"routeTo":"BAR","category":"BEER","outletIds":["main"],"stockItemId":"beer-stock","portionVolume":1,"taxClassId":"A_STANDARD"}}));
    run(&mut db,&s,"till.open",json!({"floatAmount":1000}));
    let order_id=run(&mut db,&s,"order.create",json!({"outletId":"main","name":"Refund test"}))["recordIds"][0].as_str().unwrap().to_string();
    run(&mut db,&s,"order.addItem",json!({"orderId":order_id,"productId":"beer"}));
    run(&mut db,&s,"order.fire",json!({"orderId":order_id}));
    run(&mut db,&s,"payment.record",json!({"orderId":order_id,"method":"CASH","amount":300,"cashTendered":300}));
    let payment_id=list(&db,"payments").unwrap().last().unwrap()["id"].as_str().unwrap().to_string();
    assert_eq!(get(&db,"stockItems","beer-stock").unwrap().1["currentStock"]["main"],4.0);
    run(&mut db,&s,"payment.refund",json!({"paymentId":payment_id,"amount":300,"reason":"Guest refund"}));
    assert_eq!(get(&db,"stockItems","beer-stock").unwrap().1["currentStock"]["main"],4.0);
    assert_eq!(list(&db,"refunds").unwrap().len(),1);
    assert!(list(&db,"journalEntries").unwrap().iter().any(|r|r["data"]["sourceType"]=="REFUND"));
}

#[test]
fn close_day_refuses_open_tabs_then_persists_report() {
    let (_, mut db, s)=setup();
    run(&mut db,&s,"till.open",json!({"floatAmount":500}));
    let id=order(&mut db,&s);
    let till_id=list(&db,"tillSessions").unwrap()[0]["id"].as_str().unwrap().to_string();
    assert!(execute(&mut db,&s.token,cmd("till.close",json!({"tillId":till_id,"countedCash":500,"reason":""}))).is_err());
    run(&mut db,&s,"payment.record",json!({"orderId":id,"method":"CASH","amount":100,"cashTendered":100}));
    run(&mut db,&s,"till.close",json!({"tillId":till_id,"countedCash":600,"reason":""}));
    run(&mut db,&s,"closeDay.generate",json!({"tillId":till_id}));
    let reports=list(&db,"closeDayReports").unwrap();
    assert_eq!(reports.len(),1);
    assert_eq!(reports[0]["data"]["sales"]["gross"],100.0);
    assert_eq!(reports[0]["data"]["tenders"]["cash"],100.0);
}


#[test]
fn repeat_round_rebuilds_the_last_fired_round() {
    let (_, mut db, s) = setup();
    run(&mut db, &s, "till.open", json!({"floatAmount":0}));
    let order_id = run(
        &mut db,
        &s,
        "order.create",
        json!({"outletId":"main","name":"Round test"}),
    )["recordIds"][0].as_str().unwrap().to_string();

    run(
        &mut db,
        &s,
        "order.addItem",
        json!({"orderId":order_id,"productId":"setup-product"}),
    );
    run(&mut db, &s, "order.fire", json!({"orderId":order_id}));

    let first = get(&db, "orders", &order_id).unwrap().1;
    let first_id = first["items"][0]["id"].as_str().unwrap().to_string();
    assert_eq!(first["items"][0]["roundNo"], 1);
    assert_eq!(first["currentRoundNo"], 2);

    run(&mut db, &s, "order.repeatRound", json!({"orderId":order_id}));
    let repeated = get(&db, "orders", &order_id).unwrap().1;
    assert_eq!(repeated["items"].as_array().unwrap().len(), 2);
    assert_ne!(repeated["items"][1]["id"].as_str().unwrap(), first_id);
    assert_eq!(repeated["items"][1]["roundNo"], 2);
    assert_eq!(repeated["items"][1]["stockFired"], false);
}

#[test]
fn named_customer_tab_persists_customer_identity() {
    let (_, mut db, s) = setup();
    run(
        &mut db,
        &s,
        "record.save",
        json!({"collection":"customers","id":"customer-1","data":{"name":"Kamau","phone":"0712345678","email":"","notes":""}}),
    );
    let result = run(
        &mut db,
        &s,
        "order.create",
        json!({"outletId":"main","customerId":"customer-1","name":"Kamau tab"}),
    );
    let order_id = result["recordIds"][0].as_str().unwrap();
    let order = get(&db, "orders", order_id).unwrap().1;
    assert_eq!(order["customerId"], "customer-1");
    assert_eq!(order["customerName"], "Kamau");
    assert_eq!(order["tabName"], "Kamau tab");
}

#[test]
fn backup_sync_step_requires_backup_evidence() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = open(&dir.path().join("backup-gate.sqlite")).unwrap();
    initialize(&mut db, "terminal-backup-gate", "Owner", "827193", "Backup gate").unwrap();
    let user: String = db.query_row("SELECT id FROM staff", [], |r| r.get(0)).unwrap();
    let session = login(&db, &user, "827193").unwrap();

    let err = execute(
        &mut db,
        &session.token,
        cmd("setup.completeStep", json!({"step":"BACKUP_SYNC"})),
    ).unwrap_err();
    assert!(err.contains("Create a successful local backup"));

    set_meta(&db, "last_backup", "2026-09-26T00:00:00Z").unwrap();
    execute(
        &mut db,
        &session.token,
        cmd("setup.completeStep", json!({"step":"BACKUP_SYNC"})),
    ).unwrap();
}


#[test]
fn customer_credit_charge_settlement_and_reconciliation_are_atomic() {
    let (_dir,mut db,admin)=setup();
    run(&mut db,&admin,"record.save",json!({"collection":"customers","id":"credit-customer","data":{"name":"Kamau","phone":"0712345678","email":"","notes":""}}));
    run(&mut db,&admin,"customerCredit.configure",json!({"customerId":"credit-customer","limit":1000,"termsDays":30,"status":"ACTIVE","notes":"Approved house account"}));
    run(&mut db,&admin,"till.open",json!({"floatAmount":0}));
    let order_id=run(&mut db,&admin,"order.create",json!({"outletId":"main","customerId":"credit-customer","name":"Kamau tab"}))["recordIds"][0].as_str().unwrap().to_string();
    run(&mut db,&admin,"order.addItem",json!({"orderId":order_id,"productId":"setup-product"}));
    run(&mut db,&admin,"order.fire",json!({"orderId":order_id}));
    run(&mut db,&admin,"customerCredit.charge",json!({"orderId":order_id}));
    let order=get(&db,"orders",&order_id).unwrap().1;
    assert_eq!(order["state"],"COMPLETED");
    assert_eq!(order["amountPaid"],0);
    assert_eq!(order["amountCredited"],1.0);
    assert_eq!(list(&db,"customerCreditEntries").unwrap().len(),1);
    assert_eq!(list(&db,"receiptDocuments").unwrap().len(),1);
    run(&mut db,&admin,"customerCredit.settle",json!({"customerId":"credit-customer","amount":0.4,"method":"CASH","notes":"Part payment"}));
    let till=list(&db,"tillSessions").unwrap().into_iter().find(|r|r["data"]["status"]=="OPEN").unwrap()["data"].clone();
    assert_eq!(till["creditCollectionsCash"],0.4);
    assert_eq!(till["expectedCashInDrawer"],0.4);
    run(&mut db,&admin,"customerCredit.settle",json!({"customerId":"credit-customer","amount":0.6,"method":"MPESA","notes":"Balance","mpesa":{"code":"CREDIT1","account":"123456","receivedAmount":0.6,"receivedAt":"2026-09-28T20:00:00+03:00","confirmed":true}}));
    let balance:i64=list(&db,"customerCreditEntries").unwrap().iter().filter(|r|r["data"]["customerId"]=="credit-customer").map(|r|r["data"]["balanceDeltaMinor"].as_i64().unwrap_or(0)).sum();
    assert_eq!(balance,0);
    assert_eq!(list(&db,"mpesaReceipts").unwrap()[0]["data"]["purpose"],"CUSTOMER_CREDIT_SETTLEMENT");
    run(&mut db,&admin,"customerCredit.reconcile",json!({"customerId":"credit-customer","statementBalance":0,"reference":"SEP-2026","notes":"Matches customer statement"}));
    assert_eq!(list(&db,"customerCreditReconciliations").unwrap().len(),1);
}

#[test]
fn customer_credit_failure_and_archive_rules_preserve_financial_truth() {
    let (_dir,mut db,admin)=setup();
    run(&mut db,&admin,"record.save",json!({"collection":"customers","id":"credit-limit","data":{"name":"Limit Customer","phone":"","email":"","notes":""}}));
    run(&mut db,&admin,"customerCredit.configure",json!({"customerId":"credit-limit","limit":0,"termsDays":7,"status":"ACTIVE","notes":""}));
    let oid=run(&mut db,&admin,"order.create",json!({"outletId":"main","customerId":"credit-limit","name":"Limit"}))["recordIds"][0].as_str().unwrap().to_string();
    run(&mut db,&admin,"order.addItem",json!({"orderId":oid,"productId":"setup-product"}));run(&mut db,&admin,"order.fire",json!({"orderId":oid}));
    // Admin carries override authority, so put account on HOLD to prove no ledger side effects on rejection.
    run(&mut db,&admin,"customerCredit.configure",json!({"customerId":"credit-limit","limit":0,"termsDays":7,"status":"HOLD","notes":"Review"}));
    assert!(execute(&mut db,&admin.token,cmd("customerCredit.charge",json!({"orderId":oid}))).is_err());
    assert!(list(&db,"customerCreditEntries").unwrap().is_empty());
    let rec=get(&db,"customers","credit-limit").unwrap();
    let mut archive=cmd("record.archive",json!({"collection":"customers","id":"credit-limit"}));archive.target_version=Some(rec.0);
    assert!(execute(&mut db,&admin.token,archive).is_err());
}
