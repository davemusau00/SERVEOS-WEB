//! Additive bottle/count contracts. All mutations run in the existing command transaction.
use super::*;

pub(super) fn reviewed_versions(tx: &Connection, p: &Value) -> Result<()> {
    if let Some(versions) = p.get("expectedVersions") {
        for entry in versions.as_array().filter(|v| v.len() <= 10010).ok_or("Invalid reviewed versions")? {
            let collection = text(entry, "collection")?; let key = text(entry, "id")?;
            let expected = entry["version"].as_i64().filter(|v| *v >= 0).ok_or("Invalid reviewed version")?;
            let actual: Option<i64> = tx.query_row("SELECT version FROM records WHERE collection=? AND id=? AND archived=0", params![collection,key], |r|r.get(0)).optional().map_err(error)?;
            if actual.unwrap_or(0) != expected { return Err(format!("CONFLICT: {collection} changed; review the original observation")); }
        }
    }
    Ok(())
}

pub(super) fn product_rules(tx: &Connection, key: &str, product: &Value, proposed_stock: Option<&Value>) -> Result<()> {
    let mode = product["sellingMode"].as_str();
    if mode.is_some_and(|m| !["BOTTLE_ONLY","BOTTLE_AND_PORTIONS"].contains(&m)) { return Err("Invalid selling method".into()); }
    let stock_id = product["stockItemId"].as_str();
    if mode.is_some() {
        let stock = if let Some(stock)=proposed_stock { stock.clone() } else { get(tx,"stockItems",stock_id.ok_or("Bottle selling requires a stock link")?)?.1 };
        let size=stock["sealedContainerSize"].as_f64().filter(|n| *n>0.0).ok_or("Set the size of one bottle before choosing a selling method")?;
        if stock["baseUnit"]!="ml" { return Err("Bottle selling requires configured ml stock".into()); }
        if mode==Some("BOTTLE_ONLY") {
            if !product["recipeIngredients"].as_array().is_none_or(|v|v.is_empty()) || product["modifiers"].as_array().is_some_and(|v|v.iter().any(|m|m["ingredientAdjustments"].as_array().is_some_and(|a|!a.is_empty()))) { return Err("Review recipe and modifier consumption before enabling sealed bottles only".into()); }
            if (product["portionVolume"].as_f64().unwrap_or(1.0)-size).abs()>0.000001 { return Err("Default sale must be one whole bottle".into()); }
            let portions=product["portions"].as_array().ok_or("Configure a whole bottle sale")?;
            if portions.is_empty() || portions.iter().any(|portion|portion["wholeContainerSale"]!=true || (portion["volume"].as_f64().unwrap_or(0.0)-size).abs()>0.000001) { return Err("Remove measured portions before enabling sealed bottles only".into()); }
            if stock["currentStock"].as_object().is_some_and(|locations|locations.iter().any(|(location,quantity)|stock["sealedOpenStock"][location]["openQuantity"].as_f64().unwrap_or_else(||quantity.as_f64().unwrap_or(0.0)%size)>0.000001)) { return Err("Resolve existing open liquid before enabling sealed bottles only".into()); }
            for record in list(tx,"products")? { let other=&record["data"]; if record["id"].as_str()==Some(key) {continue;}
                if consumes_stock(other,stock_id.unwrap_or("")) { return Err("Another product consumes this stock through a recipe or modifier; review it first".into()); }
            }
        }
    }
    // New recipe/modifier routes may not circumvent a reviewed bottle-only stock link.
    for record in list(tx,"products")? { let other=&record["data"]; if record["id"].as_str()==Some(key)||other["sellingMode"]!="BOTTLE_ONLY" {continue;}
        if let Some(other_stock)=other["stockItemId"].as_str() { if (consumes_stock(product,other_stock) || stock_id==Some(other_stock)) && (stock_id!=Some(other_stock) || mode!=Some("BOTTLE_ONLY")) {return Err("Stock is linked to sealed-only selling; review all linked products before adding measured consumption".into());} }
    }
    Ok(())
}
fn consumes_stock(product:&Value,key:&str)->bool {
    product["recipeIngredients"].as_array().is_some_and(|lines|lines.iter().any(|line|line["stockItemId"].as_str()==Some(key))) || product["modifiers"].as_array().is_some_and(|mods|mods.iter().any(|m|m["ingredientAdjustments"].as_array().is_some_and(|lines|lines.iter().any(|line|line["stockItemId"].as_str()==Some(key)))))
}

pub(super) fn count(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<()> {
    let p=&cmd.payload; authorize(tx,user,"inventory.count",p,None)?; reviewed_versions(tx,p)?;
    let location=text(p,"locationId")?; let location_record=get(tx,"stockLocations",location)?.1;
    let rows=p["rows"].as_array().filter(|rows|!rows.is_empty()&&rows.len()<=5000).ok_or("Count must include between 1 and 5000 stock items")?;
    let active:std::collections::BTreeSet<String>=list(tx,"stockItems")?.iter().filter_map(|record|record["id"].as_str().map(str::to_string)).collect();
    let ids:std::collections::BTreeSet<String>=rows.iter().map(|row|text(row,"stockItemId").map(str::to_string)).collect::<Result<_>>()?;
    if ids.len()!=rows.len() || !ids.is_subset(&active) {return Err("Count contains duplicate or inactive stock items".into());}
    let selected=cmd.operation=="inventory.countSelected";
    if selected { let raw=p["selectedStockItemIds"].as_array().ok_or("Select stock items explicitly")?; let scope:std::collections::BTreeSet<String>=raw.iter().map(|v|v.as_str().filter(|s|!s.is_empty()).map(str::to_string).ok_or("Invalid selected item".into())).collect::<Result<_>>()?;
        if raw.len()!=scope.len()||scope!=ids {return Err("Quick count rows must exactly match selected stock items".into());}
    } else if ids!=active {return Err("Count must include every active stock item".into());}
    let reason=p["reason"].as_str().map(str::trim).filter(|s|!s.is_empty()).unwrap_or("Location stock count"); if reason.len()>500 {return Err("Count note cannot exceed 500 characters".into());}
    let saved=if let Some(session)=p["draftSessionId"].as_str() { let saved=inventory_count_draft(tx,&user.token,location)?;
        if saved["sessionId"]!=session||saved["revision"]!=p["draftRevision"]||saved["pendingCommand"]["id"]!=cmd.id||saved["pendingCommand"]["payload"]!=*p {return Err("CONFLICT: Confirm the exact reviewed count draft".into());}
        if !saved["unknownScans"].as_array().is_some_and(|v|v.is_empty()) {return Err("Resolve unknown scans before confirming".into());} Some(saved)
    }else{None};
    let count_id=format!("count-{}",cmd.id); let mut results=Vec::new(); let mut matches=0; let mut short=0; let mut over=0;
    let mut sorted=rows.clone(); sorted.sort_by_key(|row|row["stockItemId"].as_str().unwrap_or("").to_string());
    for row in &sorted {
        if row["measurementMethod"].as_str().is_some_and(|method|!["EXACT","ESTIMATED"].contains(&method)){return Err("Invalid count measurement method".into());}
        let key=text(row,"stockItemId")?; let (_,stock)=get(tx,"stockItems",key)?; let expected=quantity(row,"expectedQuantity")?; let actual=quantity(row,"countedQuantity")?;
        if (stock["currentStock"][location].as_f64().unwrap_or(0.0)-expected).abs()>0.000001 {return Err("CONFLICT: Stock changed while this count was open; recount affected items".into());}
        if let Some(draft)=&saved {
            let baseline=&draft["baseline"][key];
            if baseline["expectedQuantity"].as_f64()!=Some(expected)||draft["counts"][key].as_f64()!=Some(actual) {return Err("Count differs from reviewed draft".into());}
            if baseline["name"]!=stock["name"]||baseline["baseUnit"]!=stock["baseUnit"]||baseline["scanUnitQuantity"].as_f64()!=Some(stock["scanUnitQuantity"].as_f64().filter(|q|*q>0.0).unwrap_or(1.0)) {return Err("CONFLICT: stock catalog changed; recount the affected items".into());}
        }
        if let Some(expected_routes)=row.get("consumptionProductIds") {
            let mut current_routes:Vec<String>=list(tx,"products")?.iter().filter(|record|record["data"]["stockItemId"].as_str()==Some(key)||consumes_stock(&record["data"],key)).filter_map(|record|record["id"].as_str().map(str::to_string)).collect();current_routes.sort();
            if *expected_routes!=json!(current_routes){return Err("CONFLICT: Consumption configuration changed; recount affected items".into());}
        }
        let size=stock["sealedContainerSize"].as_f64().filter(|n|*n>0.0&&stock["baseUnit"]=="ml");
        let delta=((actual-expected)*1e6).round()/1e6;
        if delta==0.0 {matches+=1;}else if delta<0.0 {short+=1;}else{over+=1;}
        let mut result=row.clone();result["stockItemName"]=stock["name"].clone();result["baseUnit"]=stock["baseUnit"].clone();result["variance"]=json!(delta);
        if let Some(size)=size {
            let sealed=quantity(row,"countedSealedContainers")?; let open=quantity(row,"countedOpenQuantity")?;
            if sealed.fract()!=0.0||open>=size||(actual-sealed*size-open).abs()>0.000001 {return Err("Counted total must match whole sealed bottles plus open ml below one bottle".into());}
            if row["containerSize"].as_f64().is_some_and(|n|(n-size).abs()>0.000001) {return Err("CONFLICT: Bottle size changed".into());}
            if delta!=0.0||stock["sealedOpenStock"][location].is_null() {stock_state_correction(tx,user,key,location,sealed,open,"COUNT_ADJUSTMENT",&cmd.id,reason,changes)?;}

        } else { if !row["countedSealedContainers"].is_null()||!row["countedOpenQuantity"].is_null(){return Err("Bottle fields require configured ml stock".into());} if delta!=0.0{stock_delta(tx,user,key,location,delta,"COUNT_ADJUSTMENT",&cmd.id,reason,changes)?;} }
        results.push(result);
    }
    put(tx,"stockCounts",&count_id,json!({"id":count_id,"scope":if selected{"SELECTED"}else{"FULL"},"selectedStockItemIds":ids,"locationId":location,"locationName":location_record["name"],"rows":results,"itemCount":rows.len(),"matches":matches,"short":short,"over":over,"reason":reason,"status":"COMMITTED","createdAt":now(),"createdBy":user.staff_id,"sourceCommandId":cmd.id}),changes)?;
    if let Some(draft)=saved {tx.execute("INSERT INTO inventory_count_closed_sessions(staff_id,session_id,closed_at) VALUES(?,?,?)",params![user.staff_id,text(&draft,"sessionId")?,now()]).map_err(error)?;tx.execute("DELETE FROM inventory_count_drafts WHERE staff_id=? AND location_id=?",params![user.staff_id,location]).map_err(error)?;}
    Ok(())
}

pub(super) fn physical_movement(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<bool> {
    let p=&cmd.payload; if !["inventory.transfer","inventory.waste"].contains(&cmd.operation.as_str())||p["disposition"].is_null(){return Ok(false);}
    let permission=if cmd.operation=="inventory.transfer"{"inventory.transfer"}else{"inventory.waste"};authorize(tx,user,permission,p,None)?;reviewed_versions(tx,p)?;
    let key=text(p,"stockItemId")?;let location=text(p,"locationId")?;let (_,stock)=get(tx,"stockItems",key)?;let size=stock["sealedContainerSize"].as_f64().filter(|n|*n>0.0&&stock["baseUnit"]=="ml").ok_or("Set the size of one bottle first")?;
    let reason=text(p,"reason")?;let amount=quantity(p,"quantity")?;if amount<=0.0{return Err("Quantity must be positive".into());}
    let sealed_request=text(p,"disposition")?=="SEALED";if !sealed_request&&p["disposition"]!="OPEN" {return Err("Choose sealed bottles or open liquid".into());}
    if sealed_request&&(amount/size).fract().abs()>0.000001 {return Err("Enter whole sealed bottles".into());}
    let current=stock["currentStock"][location].as_f64().unwrap_or(0.0);let source_sealed=stock["sealedOpenStock"][location]["sealedContainers"].as_f64().unwrap_or_else(||(current/size).floor());let source_open=stock["sealedOpenStock"][location]["openQuantity"].as_f64().unwrap_or(current-source_sealed*size);
    if sealed_request&&source_sealed*size<amount-0.000001||!sealed_request&&source_open<amount-0.000001{return Err("Insufficient stock in the selected physical state".into());}
    if cmd.operation=="inventory.transfer" { let target=text(p,"toLocationId")?;if target==location{return Err("Choose a different destination".into());}get(tx,"stockLocations",target)?;let target_qty=stock["currentStock"][target].as_f64().unwrap_or(0.0);let target_sealed=stock["sealedOpenStock"][target]["sealedContainers"].as_f64().unwrap_or_else(||(target_qty/size).floor());let target_open=stock["sealedOpenStock"][target]["openQuantity"].as_f64().unwrap_or(target_qty-target_sealed*size);
        if !sealed_request&&target_open+amount>=size{return Err("Destination would contain more than one open bottle; transfer rejected".into());}
        physical_state(tx,user,key,target,target_sealed+if sealed_request{amount/size}else{0.0},target_open+if sealed_request{0.0}else{amount},"TRANSFER_IN",&cmd.id,reason,changes)?;
    }
    physical_state(tx,user,key,location,source_sealed-if sealed_request{amount/size}else{0.0},source_open-if sealed_request{0.0}else{amount},if cmd.operation=="inventory.transfer"{"TRANSFER_OUT"}else{"WASTE"},&cmd.id,reason,changes)?;
    Ok(true)
}
fn physical_state(tx:&Transaction,user:&Session,key:&str,location:&str,sealed:f64,open:f64,kind:&str,source:&str,reason:&str,changes:&mut Vec<Value>)->Result<()> {
    stock_state_correction(tx,user,key,location,sealed,open,kind,source,reason,changes)
}

pub(super) fn receipt_baseline(tx:&Transaction, receipt_id:&str, order_before:&Value, stock_before:&Value, changes:&mut Vec<Value>)->Result<()> {
    let receipt=get(tx,"goodsReceipts",receipt_id)?.1;let order_id=text(&receipt,"purchaseOrderId")?;
    let mut snapshots=Vec::new();let mut seen=std::collections::HashSet::new();
    for line in receipt["lines"].as_array().ok_or("Receipt lines missing")? {
        if line["treatment"].as_str().unwrap_or("STOCK")!="STOCK"||line["quantityAccepted"].as_f64().unwrap_or(0.0)<=0.0{continue;}
        let key=text(line,"stockItemId")?;if !seen.insert(key.to_string()){continue;}
        let (version,_)=get(tx,"stockItems",key)?;
        snapshots.push(json!({"stockItemId":key,"before":stock_before[key],"afterVersion":version}));
    }
    let payables:Vec<Value>=list(tx,"supplierPayables")?.into_iter().filter(|record|record["data"]["goodsReceiptId"]==receipt_id).map(|record|json!({"id":record["id"],"version":record["version"]})).collect();
    put(tx,"procurementCorrectionBaselines",receipt_id,json!({"receiptId":receipt_id,"orderBefore":order_before,"orderAfterVersion":get(tx,"purchaseOrders",order_id)?.0,"stockSnapshots":snapshots,"payables":payables,"sourceCommandId":receipt["sourceCommandId"]}),changes)
}
pub(super) fn reverse_unused_receipt(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<()> {
    let p=&cmd.payload;authorize(tx,user,"procurement.pay",p,None)?;authorize(tx,user,"procurement.manage",p,None)?;reviewed_versions(tx,p)?;
    let key=text(p,"goodsReceiptId")?;let reason=text(p,"reason")?;if reason.trim().is_empty()||reason.len()>500||p["confirmedUnusedDuplicate"]!=true{return Err("Confirm an unused duplicate receipt and explain the mistake".into());}
    if list(tx,"receiptCorrections")?.iter().any(|r|r["data"]["goodsReceiptId"]==key){return Err("Receipt has already been fully corrected".into());}
    let (_,receipt)=get(tx,"goodsReceipts",key)?;
    if receipt["lines"].as_array().is_none_or(|lines|lines.iter().any(|line|line["treatment"].as_str().unwrap_or("STOCK")!="STOCK")) {return Err("Asset and expense receipt correction requires the accounting design".into());}
    let snapshot=get(tx,"procurementCorrectionBaselines",key).map_err(|_|"This older receipt has no verified correction baseline; use the accounting correction review".to_string())?.1;
    let order_id=text(&receipt,"purchaseOrderId")?;let (order_version,_)=get(tx,"purchaseOrders",order_id)?;
    if snapshot["orderBefore"].is_null()||snapshot["orderAfterVersion"].as_i64()!=Some(order_version){return Err("Later PO activity blocks exact receipt reversal".into());}
    let payables=snapshot["payables"].as_array().ok_or("Receipt payable baseline missing")?;
    for payable in payables {let id=text(payable,"id")?;let (version,data)=get(tx,"supplierPayables",id)?;
        if version!=payable["version"].as_i64().unwrap_or(-1)||data["status"]!="RECEIVED_UNINVOICED"||data["paidAmount"].as_f64().unwrap_or(0.0)!=0.0 {return Err("Invoice matching or supplier settlement blocks this reversal; accounting review required".into());}}
    let snapshots=snapshot["stockSnapshots"].as_array().ok_or("Stock baseline missing")?;
    for entry in snapshots {let key=text(entry,"stockItemId")?;let (version,_)=get(tx,"stockItems",key)?;if entry["before"].is_null()||entry["afterVersion"].as_i64()!=Some(version){return Err("Later stock or cost activity blocks exact reversal; accounting review required".into());}}
    let correction_id=format!("receipt-correction-{}",cmd.id);
    for entry in snapshots {let key=text(entry,"stockItemId")?;let before=&entry["before"];let (_,current)=get(tx,"stockItems",key)?;let location=text(&receipt,"locationId")?;
        let target=before["currentStock"][location].as_f64().unwrap_or(0.0);let qty=current["currentStock"][location].as_f64().unwrap_or(0.0);
        if let Some(size)=before["sealedContainerSize"].as_f64().filter(|n|*n>0.0&&before["baseUnit"]=="ml") {let sealed=before["sealedOpenStock"][location]["sealedContainers"].as_f64().unwrap_or_else(||(target/size).floor());let open=before["sealedOpenStock"][location]["openQuantity"].as_f64().unwrap_or(target-sealed*size);stock_state_correction(tx,user,key,location,sealed,open,"RECEIPT_REVERSAL",&correction_id,reason,changes)?;}
        else{stock_delta_with_cost(tx,user,key,location,target-qty,"RECEIPT_REVERSAL",&correction_id,reason,current["averageUnitCost"].as_f64(),changes)?;}
        // Versions above prove every field remains untouched after the receipt.
        let (_,mut fresh)=get(tx,"stockItems",key)?;for field in ["averageUnitCost","currentStock","sealedOpenStock"] {if before.get(field).is_some(){fresh[field]=before[field].clone();}else{fresh.as_object_mut().unwrap().remove(field);}}put(tx,"stockItems",key,fresh,changes)?;
    }
    for payable in payables {let key=text(payable,"id")?;let (_,mut data)=get(tx,"supplierPayables",key)?;data["amountDue"]=json!(0);data["status"]=json!("REVERSED");data["correctionId"]=json!(correction_id);put(tx,"supplierPayables",key,data,changes)?;}
    let journals:Vec<Value>=list(tx,"journalEntries")?.into_iter().filter(|record|record["data"]["sourceId"]==key&&record["data"]["sourceType"]=="SUPPLIER_RECEIPT").collect();
    if journals.len()!=1 {return Err("Original receipt journal is missing or ambiguous; accounting review required".into());}
    let original=&journals[0]["data"];let mut lines=Vec::new();for line in original["lines"].as_array().ok_or("Original journal lines missing")? {let mut reversed=line.clone();reversed["id"]=json!(id());reversed["debit"]=line["credit"].clone();reversed["credit"]=line["debit"].clone();reversed["debitMinor"]=line["creditMinor"].clone();reversed["creditMinor"]=line["debitMinor"].clone();lines.push(reversed);}
    let journal_id=format!("receipt-reversal-{}",cmd.id);put(tx,"journalEntries",&journal_id,json!({"entryNumber":format!("JE-{}",cmd.id),"propertyId":"property","sourceType":"RECEIPT_CORRECTION","sourceId":correction_id,"reversesJournalId":journals[0]["id"],"occurredAt":now(),"postedAt":now(),"memo":reason,"lines":lines,"totalDebit":original["totalCredit"],"totalCredit":original["totalDebit"],"balanced":true}),changes)?;
    put(tx,"purchaseOrders",order_id,snapshot["orderBefore"].clone(),changes)?;
    let linked:Vec<Value>=changes.iter().map(|c|json!({"collection":c["collection"],"id":c["id"]})).collect();
    put(tx,"receiptCorrections",&correction_id,json!({"goodsReceiptId":key,"purchaseOrderId":order_id,"kind":"UNUSED_DUPLICATE_FULL_REVERSAL","correctedAmount":receipt["acceptedValue"],"remainingCorrectableAmount":0,"linkedRecords":linked,"reason":reason,"occurredAt":now(),"actorId":user.staff_id,"sourceCommandId":cmd.id}),changes)
}

pub(super) fn restore_master(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<()> {
    let p=&cmd.payload;let collection=text(p,"collection")?;let key=text(p,"id")?;
    if !["products","stockItems","stockLocations","suppliers","customers"].contains(&collection){return Err("Use the dedicated restore workflow for this master".into());}
    let permission=master_permission(collection).ok_or("Unsupported master collection")?;authorize(tx,user,permission,p,None)?;
    let record:Option<(i64,String,bool)>=tx.query_row("SELECT version,data,archived FROM records WHERE collection=? AND id=?",params![collection,key],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(error)?;
    let (version,encoded,archived)=record.ok_or("Archived master not found")?;if !archived||cmd.target_version!=Some(version){return Err("CONFLICT: Archived master changed; refresh before restoring".into());}
    let data:Value=serde_json::from_str(&encoded).map_err(error)?;
    for field in ["code","barcode"] {if let Some(value)=data[field].as_str().filter(|s|!s.is_empty()){let duplicate:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM records WHERE collection=? AND id<>? AND archived=0 AND lower(json_extract(data,?))=lower(?))",params![collection,key,format!("$.{field}"),value],|r|r.get(0)).map_err(error)?;if duplicate{return Err(format!("An active master already uses this {field}"));}}}
    if collection=="products" {if let Some(stock)=data["stockItemId"].as_str().filter(|s|!s.is_empty()){get(tx,"stockItems",stock)?;}for line in data["recipeIngredients"].as_array().into_iter().flatten(){get(tx,"stockItems",text(line,"stockItemId")?)?;}for outlet in data["outletIds"].as_array().into_iter().flatten(){get(tx,"outlets",outlet.as_str().ok_or("Invalid outlet")?)?;}product_rules(tx,key,&data,None)?;}
    if collection=="stockItems"&&data["currentStock"].as_object().is_some_and(|locations|locations.values().any(|v|v.as_f64().unwrap_or(0.0)!=0.0)){return Err("Archived stock balance is not zero; investigate before restoring".into());}
    tx.execute("UPDATE records SET archived=0 WHERE collection=? AND id=?",params![collection,key]).map_err(error)?;put(tx,collection,key,data,changes)
}

pub(super) fn movement_baseline(tx:&Transaction,cmd:&BusinessCommand,before:&Value,changes:&mut Vec<Value>)->Result<()> {
    let key=text(&cmd.payload,"stockItemId")?;put(tx,"inventoryMovementBaselines",&cmd.id,json!({"stockItemId":key,"before":before,"afterVersion":get(tx,"stockItems",key)?.0,"operation":cmd.operation,"sourceCommandId":cmd.id}),changes)
}
pub(super) fn reverse_movement(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<()> {
    let p=&cmd.payload;authorize(tx,user,"inventory.adjust",p,None)?;reviewed_versions(tx,p)?;let reason=text(p,"reason")?;if reason.trim().is_empty()||reason.len()>500{return Err("Explain the correction in up to 500 characters".into());}
    if p["confirmedRecordingMistake"]!=true {return Err("Confirm that this was a recording mistake; physical stock has not moved".into());}
    let movement_id=text(p,"movementId")?;let (_,movement)=get(tx,"stockMovements",movement_id)?;
    if !["WASTE","TRANSFER_IN","TRANSFER_OUT"].contains(&movement["movementType"].as_str().unwrap_or("")){return Err("Use a current balance correction or the transaction's dedicated correction workflow".into());}
    let original=text(&movement,"sourceId")?;
    if list(tx,"movementCorrections")?.iter().any(|record|record["data"]["reversesCommandId"]==original){return Err("This movement has already been fully reversed".into());}
    let baseline=get(tx,"inventoryMovementBaselines",original).map_err(|_|"This older movement has no verified reversal baseline; correct the current physical balance instead".to_string())?.1;
    let key=text(&baseline,"stockItemId")?;let (version,current)=get(tx,"stockItems",key)?;
    if baseline["afterVersion"].as_i64()!=Some(version){return Err("Later stock or cost activity prevents reversal. Correct the current physical balance instead".into());}
    let before=&baseline["before"];let correction=format!("movement-correction-{}",cmd.id);
    let locations:std::collections::BTreeSet<String>=current["currentStock"].as_object().into_iter().flat_map(|m|m.keys().cloned()).chain(before["currentStock"].as_object().into_iter().flat_map(|m|m.keys().cloned())).collect();
    for location in locations {let target=before["currentStock"][&location].as_f64().unwrap_or(0.0);let actual=current["currentStock"][&location].as_f64().unwrap_or(0.0);if (target-actual).abs()<0.000001{continue;}
        if let Some(size)=before["sealedContainerSize"].as_f64().filter(|n|*n>0.0&&before["baseUnit"]=="ml"){let sealed=before["sealedOpenStock"][&location]["sealedContainers"].as_f64().unwrap_or_else(||(target/size).floor());let open=before["sealedOpenStock"][&location]["openQuantity"].as_f64().unwrap_or(target-sealed*size);stock_state_correction(tx,user,key,&location,sealed,open,"MOVEMENT_REVERSAL",&correction,reason,changes)?;}else{stock_delta(tx,user,key,&location,target-actual,"MOVEMENT_REVERSAL",&correction,reason,changes)?;}
    }
    put(tx,"stockItems",key,before.clone(),changes)?;
    put(tx,"movementCorrections",&correction,json!({"movementId":movement_id,"reversesCommandId":original,"stockItemId":key,"remainingCorrectableQuantity":0,"reason":reason,"actorId":user.staff_id,"occurredAt":now(),"sourceCommandId":cmd.id}),changes)
}
