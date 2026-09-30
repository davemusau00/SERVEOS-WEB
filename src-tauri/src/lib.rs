mod store;
mod printer;
#[cfg(test)]
mod tests;
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

struct Runtime {
    db: Mutex<Connection>,
    path: PathBuf,
    syncing: Mutex<bool>,
    operator_auth: Mutex<Option<OperatorAuth>>,
    startup_nonce: String,
}
struct OperatorAuth { staff_id: String, access_token: String, refresh_token: String }
#[tauri::command]
fn runtime_status(state: State<Runtime>) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    let mut stmt=db.prepare("SELECT id,name,role FROM staff WHERE active=1 ORDER BY name").map_err(|e|e.to_string())?;
    let staff=stmt.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"role":r.get::<_,String>(2)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let intake=store::meta(&db,"intake_profile")?.and_then(|value|serde_json::from_str::<Value>(&value).ok());
    Ok(json!({"enrolled":store::meta(&db,"terminal_id")?.is_some(),"installationStage":store::installation_stage(&db)?,"staff":staff,"intakeProfile":intake}))
}

fn intake_required<'a>(profile: &'a Value, group: &str, key: &str) -> store::Result<&'a str> {
    profile.get(group)
        .and_then(|v| v.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("Intake requires {group}.{key}"))
}
fn reject_intake_secrets(value: &Value) -> store::Result<()> {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let normalized = key.to_ascii_lowercase().replace(['_', '-'], "");
                if ["pin","password","passwordconfirm","accesstoken","devicetoken","devicesecret","publishablekey"].contains(&normalized.as_str()) {
                    return Err(format!("Sensitive credential field '{key}' cannot be persisted in Intake"));
                }
                reject_intake_secrets(child)?;
            }
        }
        Value::Array(items) => for item in items { reject_intake_secrets(item)?; },
        _ => {}
    }
    Ok(())
}
fn validate_intake_profile(profile: &Value, complete: bool) -> store::Result<()> {
    if !profile.is_object() { return Err("Intake profile must be an object".into()); }
    reject_intake_secrets(profile)?;
    if !complete { return Ok(()); }

    intake_required(profile,"business","tradingName")?;
    let owner_email=intake_required(profile,"owner","email")?;
    intake_required(profile,"owner","fullName")?;
    let admin_email=intake_required(profile,"initialAdministrator","email")?;
    intake_required(profile,"initialAdministrator","fullName")?;
    intake_required(profile,"initialAdministrator","jobTitle")?;
    if !owner_email.contains('@') || !admin_email.contains('@') {
        return Err("Owner and Administrator emails must be valid email addresses".into());
    }

    for key in ["paymentMethods","serviceAreas","stockAreas"] {
        if !profile.get(key).and_then(Value::as_array).is_some_and(|v| !v.is_empty()) {
            return Err(format!("Intake requires at least one {key} entry"));
        }
    }
    Ok(())
}

#[tauri::command]
fn runtime_intake_save(state: State<Runtime>, profile: Value) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    if store::meta(&db,"terminal_id")?.is_some(){return Err("Intake cannot be changed after enrollment".into());}
    validate_intake_profile(&profile,false)?;
    store::set_meta(&db,"intake_profile",&profile.to_string())?; store::set_meta(&db,"installation_stage","INTAKE_IN_PROGRESS")?; Ok(profile)
}
#[tauri::command]
fn runtime_intake_complete(state: State<Runtime>, profile: Value) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    if store::meta(&db,"terminal_id")?.is_some(){return Err("Intake cannot be changed after enrollment".into());}
    validate_intake_profile(&profile,true)?;
    store::set_meta(&db,"intake_profile",&profile.to_string())?; store::set_meta(&db,"installation_stage","READY_FOR_ENROLLMENT")?; Ok(profile)
}
#[tauri::command]
fn runtime_intake_reopen(state: State<Runtime>) -> store::Result<()> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    if store::meta(&db,"terminal_id")?.is_some(){return Err("Intake cannot be reopened after enrollment".into());}
    if store::meta(&db,"intake_profile")?.is_none(){return Err("No saved Intake profile is available".into());}
    store::set_meta(&db,"installation_stage","INTAKE_IN_PROGRESS")
}
#[tauri::command]
fn runtime_intake_clear(state: State<Runtime>) -> store::Result<()> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    if store::meta(&db,"terminal_id")?.is_some(){return Err("Intake cannot be cleared after enrollment".into());}
    db.execute("DELETE FROM metadata WHERE key IN ('intake_profile','installation_stage')",[]).map_err(|e|e.to_string())?; Ok(())
}
#[tauri::command]
fn runtime_login(
    state: State<Runtime>,
    staff_id: String,
    pin: String,
    email: String,
    password: String,
) -> store::Result<store::Session> {
    let local = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        store::login(&db, &staff_id, &pin)?
    };
    let (url,key,terminal) = {
        let db=state.db.lock().map_err(|e|e.to_string())?;
        (store::meta(&db,"cloud_url")?.ok_or("Terminal is not connected to its business server")?,
         store::meta(&db,"cloud_key")?.ok_or("Terminal is not connected to its business server")?,
         store::meta(&db,"terminal_id")?.ok_or("Terminal has not been paired")?)
    };
    let auth_result=tauri::async_runtime::block_on(async {
        let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e|e.to_string())?;
        let response=client.post(format!("{url}/auth/v1/token?grant_type=password"))
            .header("apikey",&key).json(&json!({"email":email,"password":password})).send().await
            .map_err(|_|"Authentication server unavailable".to_string())?;
        if !response.status().is_success(){return Err("Sign-in failed. Check the operator credentials and invitation status.".into());}
        let auth:Value=response.json().await.map_err(|_|"Invalid authentication response".to_string())?;
        let access=auth["access_token"].as_str().ok_or("Authentication token missing")?.to_string();
        let refresh=auth["refresh_token"].as_str().ok_or("Refresh token missing")?.to_string();
        let paired={let db=state.db.lock().map_err(|e|e.to_string())?;store::meta(&db,"v2_device_paired")?.as_deref()==Some("true")};
        if !paired {
            rpc(&url,&key,Some(&access),"servos_v2_register_device",json!({"device_id":terminal,"label":"ServOS Terminal","kind":"DESKTOP"})).await?;
            let db=state.db.lock().map_err(|e|e.to_string())?;
            store::set_meta(&db,"v2_device_paired","true")?;
        }
        let identity=rpc(&url,&key,Some(&access),"servos_v2_terminal_identity",json!({"device_id":terminal})).await?;
        if identity["staffId"].as_str()!=Some(local.staff_id.as_str()){
            let _=client.post(format!("{url}/auth/v1/logout")).header("apikey",&key).bearer_auth(&access).send().await;
            return Err("This Auth account is not bound to the selected local staff ID. Ask an Admin to bind the correct staff record.".into());
        }
        let entry=keyring::Entry::new("ServOS",&format!("{}:{}",terminal,local.staff_id)).map_err(|_|"OS secure credential storage is unavailable".to_string())?;
        entry.set_password(&refresh).map_err(|_|"Could not securely store the operator session".to_string())?;
        *state.operator_auth.lock().map_err(|e|e.to_string())?=Some(OperatorAuth{staff_id:local.staff_id.clone(),access_token:access,refresh_token:refresh});
        Ok(local)
    });
    if auth_result.is_err(){let _=state.db.lock().map(|db|db.execute("DELETE FROM sessions WHERE token=?",[&local.token]));}
    auth_result
}
#[tauri::command]
fn runtime_lock(state: State<Runtime>, token: String) -> store::Result<()> {
    if let Ok(mut active)=state.operator_auth.lock(){
        if let Some(auth)=active.take(){
            if let Ok(db)=state.db.lock(){
                if let (Ok(Some(url)),Ok(Some(key)),Ok(Some(terminal)))=(store::meta(&db,"cloud_url"),store::meta(&db,"cloud_key"),store::meta(&db,"terminal_id")){
                    if let Ok(entry)=keyring::Entry::new("ServOS",&format!("{}:{}",terminal,auth.staff_id)){let _=entry.delete_credential();}
                    let token=auth.access_token.clone();
                    tauri::async_runtime::spawn(async move{let _=reqwest::Client::new().post(format!("{url}/auth/v1/logout")).header("apikey",key).bearer_auth(token).send().await;});
                }
            }
        }
    }
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute("DELETE FROM sessions WHERE token=?", [token])
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn runtime_snapshot(state: State<Runtime>, token: String) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::snapshot(&db, &token)
}
#[tauri::command]
fn runtime_login_offline(state: State<Runtime>, staff_id: String, pin: String) -> store::Result<store::Session> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    store::login(&db,&staff_id,&pin)
}
#[tauri::command]
fn runtime_guidance_progress(state: State<Runtime>, token: String) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::guidance_progress(&db, &token)
}
#[tauri::command]
fn runtime_guidance_save_progress(state: State<Runtime>, token: String, progress: Value) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::save_guidance_progress(&db, &token, progress)
}
#[tauri::command]
fn runtime_inventory_count_draft(state: State<Runtime>, token: String, location_id: String) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::inventory_count_draft(&db, &token, &location_id)
}
#[tauri::command]
fn runtime_save_inventory_count_draft(state: State<Runtime>, token: String, location_id: String, draft: Value) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::save_inventory_count_draft(&db, &token, &location_id, draft)
}
#[tauri::command]
fn runtime_clear_inventory_count_draft(state: State<Runtime>, token: String, location_id: String) -> store::Result<()> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::clear_inventory_count_draft(&db, &token, &location_id)
}
#[tauri::command]
fn runtime_command(
    state: State<Runtime>,
    token: String,
    command: store::BusinessCommand,
) -> store::Result<Value> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    store::execute(&mut db, &token, command)
}
#[tauri::command]
fn runtime_manager_approve(state: State<Runtime>, token: String, approver_id: String, pin: String, permission: String, target: Option<String>) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    store::create_approval(&db,&token,&approver_id,&pin,&permission,target.as_deref())
}

fn validate_url(url: &str) -> store::Result<String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Invalid Supabase URL")?;
    if parsed.scheme() != "https"
        || !parsed.host_str().unwrap_or("").ends_with(".supabase.co")
        || parsed.path() != "/"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Use the HTTPS project URL ending in .supabase.co".into());
    }
    Ok(url.trim_end_matches('/').into())
}
async fn rpc(
    url: &str,
    key: &str,
    auth: Option<&str>,
    name: &str,
    body: Value,
) -> store::Result<Value> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client
        .post(format!("{url}/rest/v1/rpc/{name}"))
        .header("apikey", key)
        .json(&body);
    if let Some(token) = auth {
        req = req.bearer_auth(token);
    }
    let res = req
        .send()
        .await
        .map_err(|_| "Server unreachable; all local operations remain queued")?;
    if !res.status().is_success() {
        return Err(format!(
            "Server rejected request ({}); local data retained",
            res.status()
        ));
    }
    res.json()
        .await
        .map_err(|_| "Invalid server response; local data retained".into())
}
#[tauri::command]
async fn runtime_enroll(
    state: State<'_, Runtime>,
    url: String,
    publishable_key: String,
    access_token: String,
    pin: String,
) -> store::Result<()> {
    let url = validate_url(&url)?;
    store::hash_pin(&pin)?;
    let profile = {
        let db=state.db.lock().map_err(|e|e.to_string())?;
        let stage=store::installation_stage(&db)?;
        if !["READY_FOR_ENROLLMENT","ENROLLMENT_PENDING"].contains(&stage.as_str()){
            return Err("Complete and confirm the Intake Wizard before owner enrollment".into());
        }
        let raw=store::meta(&db,"intake_profile")?.ok_or("Confirmed Intake profile is missing")?;
        let profile:Value=serde_json::from_str(&raw).map_err(|_|"Stored Intake profile is invalid".to_string())?;
        validate_intake_profile(&profile,true)?;
        store::set_meta(&db,"installation_stage","ENROLLMENT_PENDING")?;
        profile
    };
    let business_name=intake_required(&profile,"business","tradingName")?.to_string();

    let (terminal, credential) = {
        let mut db = state.db.lock().map_err(|e| e.to_string())?;
        if store::meta(&db, "terminal_id")?.is_some() { return Err("Already enrolled".into()); }
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let terminal = store::meta(&tx, "pending_terminal")?.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let credential = store::meta(&tx, "device_token")?.unwrap_or_else(|| format!("{}{}",uuid::Uuid::new_v4().simple(),uuid::Uuid::new_v4().simple()));
        store::set_meta(&tx, "pending_terminal", &terminal)?;
        store::set_meta(&tx, "device_token", &credential)?;
        store::set_meta(&tx, "cloud_url", &url)?;
        store::set_meta(&tx, "cloud_key", &publishable_key)?;
        tx.commit().map_err(|e| e.to_string())?;
        (terminal, credential)
    };

    let result=rpc(&url,&publishable_key,Some(&access_token),"servos_enroll",json!({"business_name":business_name,"installation_id":terminal,"device_secret":credential})).await?;
    if store::text(&result, "terminalId")? != terminal { return Err("Unexpected enrollment response".into()); }

    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    store::initialize_from_intake(&mut db, &terminal, &pin, &profile)?;
    Ok(())
}
#[tauri::command]
async fn runtime_sync(state: State<'_, Runtime>, token: String) -> store::Result<Value> {
    {
        let mut running = state.syncing.lock().map_err(|e| e.to_string())?;
        if *running {
            return Err("Synchronization already running".into());
        }
        *running = true;
    }
    let result = sync_inner(&state, &token).await;
    if let Ok(mut running) = state.syncing.lock() {
        *running = false;
    }
    result
}
async fn sync_inner(state: &Runtime, token: &str) -> store::Result<Value> {
    let (url, key, credential, terminal, operations) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        store::actor(&db, token, false)?;
        let required =
            |k| store::meta(&db, k)?.ok_or_else(|| format!("Cloud configuration missing: {k}"));
        let mut stmt=db.prepare("SELECT envelope FROM outbox WHERE acknowledged_at IS NULL ORDER BY sequence LIMIT 100").map_err(|e|e.to_string())?;
        let strings = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let operations = strings
            .iter()
            .map(|s| serde_json::from_str::<Value>(s).map_err(|e| e.to_string()))
            .collect::<store::Result<Vec<_>>>()?;
        (
            required("cloud_url")?,
            required("cloud_key")?,
            required("device_token")?,
            required("terminal_id")?,
            operations,
        )
    };
    let result = rpc(
        &url,
        &key,
        None,
        "servos_upload",
        json!({"terminal_id":terminal,"device_token":credential,"operations":operations}),
    )
    .await?;
    let cursor = result["acknowledgedSequence"]
        .as_i64()
        .ok_or("Server acknowledgement missing")?;
    let maximum = operations
        .last()
        .and_then(|v| v["sequence"].as_i64())
        .unwrap_or(cursor);
    if cursor > maximum {
        return Err("Unexpected server acknowledgement; queue retained".into());
    }
    {
        let mut db = state.db.lock().map_err(|e| e.to_string())?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        // Acknowledgements apply only to operations actually included in this request.
        for op in &operations {
            let seq = op["sequence"].as_i64().ok_or("Invalid local sequence")?;
            if seq <= cursor {
                tx.execute(
                    "UPDATE outbox SET acknowledged_at=? WHERE sequence=?",
                    rusqlite::params![chrono::Utc::now().to_rfc3339(), seq],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        store::set_meta(&tx, "last_sync", &chrono::Utc::now().to_rfc3339())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    // Apply requests only after the terminal has uploaded its entire current queue.
    let pending: i64 = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?
    };
    if pending == 0 {
        let requests = rpc(
            &url,
            &key,
            None,
            "servos_poll_requests",
            json!({"terminal_id":terminal,"device_token":credential}),
        )
        .await?;
        for request in requests
            .as_array()
            .ok_or("Invalid remote request response")?
        {
            let request_id = store::text(request, "id")?.to_string();
            let outcome = {
                let mut db = state.db.lock().map_err(|e| e.to_string())?;
                let cached: Option<String> = db
                    .query_row(
                        "SELECT result FROM remote_requests WHERE id=?",
                        [&request_id],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                if let Some(result) = cached {
                    serde_json::from_str::<Value>(&result).map_err(|e| e.to_string())?
                } else {
                    let operation = store::text(request, "operation")?;
                    let allowed = ["record.save", "record.archive"].contains(&operation)
                        && ["products", "tables", "customers", "suppliers", "priceRules"]
                            .contains(&request["payload"]["collection"].as_str().unwrap_or(""));
                    let result = if !allowed {
                        Err("Remote operation is not permitted".into())
                    } else {
                        let actor = store::Session {
                            token: String::new(),
                            staff_id: format!("remote:{}", store::text(request, "authorId")?),
                            name: "Remote manager".into(),
                            role: "Manager".into(),
                        };
                        store::execute_as(
                            &mut db,
                            &actor,
                            store::BusinessCommand {
                                id: request_id.clone(),
                                schema_version: 1,
                                operation: operation.into(),
                                target_version: request["expectedVersion"].as_i64(),
                                payload: request["payload"].clone(),
                            },
                        )
                    };
                    let outcome = match result {
                        Ok(result) => json!({"status":"applied","result":result}),
                        Err(message) => {
                            json!({"status":if message.starts_with("CONFLICT:"){"conflict"}else{"rejected"},"result":{"message":message}})
                        }
                    };
                    db.execute(
                        "INSERT INTO remote_requests VALUES(?,?,?)",
                        rusqlite::params![
                            request_id,
                            outcome["status"].as_str(),
                            outcome.to_string()
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                    outcome
                }
            };
            // Successful effects must be replicated before the remote UI can say applied.
            let can_ack = if outcome["status"] == "applied" {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                db.query_row("SELECT EXISTS(SELECT 1 FROM outbox WHERE command_id=? AND acknowledged_at IS NOT NULL)",[&request_id],|r|r.get::<_,bool>(0)).map_err(|e|e.to_string())?
            } else {
                true
            };
            if can_ack {
                rpc(&url,&key,None,"servos_ack_request",json!({"terminal_id":terminal,"device_token":credential,"request_id":request_id,"request_status":outcome["status"],"request_result":outcome["result"]})).await?;
            }
        }
    }
    Ok(result)
}
#[tauri::command]
fn runtime_health_audit(state: State<Runtime>, token: String) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::production_health_audit(&db, &token)
}

// SERVOS_PATCH_02A_RECONCILIATION
#[tauri::command]
async fn runtime_reconciliation_compare(state: State<'_, Runtime>, token: String) -> store::Result<Value> {
    let (url, key, terminal, credential) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let actor = store::actor(&db, &token, false)?;
        if !store::permissions(&actor.role).contains(&"audit.view") {
            return Err("Audit permission required".into());
        }
        let url = validate_url(&store::meta(&db, "cloud_url")?.ok_or("Cloud synchronization is not configured")?)?;
        let key = store::meta(&db, "cloud_key")?.ok_or("Cloud publishable key is missing")?;
        let terminal = store::meta(&db, "terminal_id")?.ok_or("Terminal identity is missing")?;
        let credential = store::meta(&db, "device_token")?.ok_or("Terminal device credential is missing")?;
        (url, key, terminal, credential)
    };

    let mut all_records: Vec<Value> = vec![];
    let mut after_collection: Option<String> = None;
    let mut after_id: Option<String> = None;
    let mut header: Option<Value> = None;
    let mut completed = false;

    for _ in 0..200 {
        let page = rpc(
            &url,
            &key,
            None,
            "servos_reconciliation_manifest",
            json!({
                "terminal_id": terminal.clone(),
                "device_token": credential.clone(),
                "after_collection": after_collection.clone(),
                "after_id": after_id.clone(),
                "page_size": 500
            }),
        )
        .await?;

        if page.get("mode").and_then(Value::as_str) != Some("READ_ONLY_CLOUD_REPLICA") {
            return Err("Unexpected cloud reconciliation response".into());
        }
        if header.is_none() {
            header = Some(page.clone());
        }
        let records = page
            .get("records")
            .and_then(Value::as_array)
            .ok_or("Cloud reconciliation response is missing records")?;
        if all_records.len() + records.len() > 100_000 {
            return Err("Cloud reconciliation exceeds the supported 100,000 record safety limit".into());
        }
        all_records.extend(records.iter().cloned());

        if !page.get("hasMore").and_then(Value::as_bool).unwrap_or(false) {
            completed = true;
            break;
        }
        let cursor = page.get("nextCursor").ok_or("Cloud reconciliation response is missing a continuation cursor")?;
        let next_collection = cursor.get("collection").and_then(Value::as_str).ok_or("Invalid cloud continuation collection")?.to_string();
        let next_id = cursor.get("id").and_then(Value::as_str).ok_or("Invalid cloud continuation record ID")?.to_string();
        if after_collection.as_deref() == Some(next_collection.as_str()) && after_id.as_deref() == Some(next_id.as_str()) {
            return Err("Cloud reconciliation cursor did not advance".into());
        }
        after_collection = Some(next_collection);
        after_id = Some(next_id);
    }

    if !completed {
        return Err("Cloud reconciliation exceeded the pagination safety limit".into());
    }
    let first = header.ok_or("Cloud reconciliation returned no response")?;
    let cloud = json!({
        "mode": "READ_ONLY_CLOUD_REPLICA",
        "generatedAt": first["generatedAt"].clone(),
        "terminal": first["terminal"].clone(),
        "operations": first["operations"].clone(),
        "records": all_records,
    });
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::reconciliation_compare(&db, &token, &cloud)
}


// SERVOS_PATCH_03_IMPORT_CENTER
#[tauri::command]
fn runtime_import_list(state: State<Runtime>, token: String) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    store::import_list(&db,&token)
}
#[tauri::command]
fn runtime_import_detail(state: State<Runtime>, token: String, batch_id: String) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    store::import_detail(&db,&token,&batch_id)
}
#[tauri::command]
fn runtime_import_stage(state: State<Runtime>, token: String, template_key: String, file_name: String, csv_text: String) -> store::Result<Value> {
    let mut db=state.db.lock().map_err(|e|e.to_string())?;
    store::import_stage(&mut db,&token,&template_key,&file_name,&csv_text)
}
#[tauri::command]
fn runtime_import_cancel(state: State<Runtime>, token: String, batch_id: String) -> store::Result<()> {
    let mut db=state.db.lock().map_err(|e|e.to_string())?;
    store::import_cancel(&mut db,&token,&batch_id)
}

// SERVOS_PATCH_04_CONTROLLED_IMPORT
#[tauri::command]
fn runtime_import_plan(state: State<Runtime>, token: String, batch_id: String) -> store::Result<Value> {
    let mut db=state.db.lock().map_err(|e|e.to_string())?;
    store::import_plan(&mut db,&token,&batch_id)
}
#[tauri::command]
fn runtime_import_plan_detail(state: State<Runtime>, token: String, plan_id: String) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    store::import_plan_detail(&db,&token,&plan_id)
}
#[tauri::command]
fn runtime_import_apply(state: State<Runtime>, token: String, plan_id: String) -> store::Result<Value> {
    let mut db=state.db.lock().map_err(|e|e.to_string())?;
    store::import_apply(&mut db,&token,&plan_id)
}

#[tauri::command]
fn runtime_backup(state: State<Runtime>, token: String) -> store::Result<String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let actor = store::actor(&db, &token, true)?;
    if !store::permissions(&actor.role).contains(&"backup.create") { return Err("Backup permission required".into()); }
    let folder = state
        .path
        .parent()
        .ok_or("Missing application folder")?
        .join("backups");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let path = folder.join(format!(
        "servos-{}.sqlite",
        chrono::Utc::now().format("%Y%m%dT%H%M%S%f")
    ));
    db.backup(rusqlite::DatabaseName::Main, &path, None).map_err(|e|e.to_string())?;
    store::set_meta(&db,"last_backup",&chrono::Utc::now().to_rfc3339())?;
    Ok(path.to_string_lossy().into())
}

fn printer_policy(db: &Connection) -> Value {
    store::get(db, "tillPolicy", "main")
        .map(|(_, policy)| policy)
        .unwrap_or_else(|_| json!({}))
}

fn require_printer_permission(db: &Connection, token: &str, permission: &str) -> store::Result<store::Session> {
    let actor = store::actor(db, token, true)?;
    if !store::permissions(&actor.role).contains(&permission) {
        return Err(format!("Permission required: {permission}"));
    }
    Ok(actor)
}

fn execute_printer_job(state: &Runtime, job_id: &str) -> store::Result<Value> {
    let (policy, payload, order_id) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let row: (String, String, String) = db.query_row(
            "SELECT profile,payload,order_id FROM receipt_print_jobs WHERE id=?",
            [job_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).map_err(|e| e.to_string())?;
        db.execute("UPDATE receipt_print_jobs SET state='SENDING',message='Sending to printer',updated_at=? WHERE id=?", rusqlite::params![chrono::Utc::now().to_rfc3339(), job_id]).map_err(|e| e.to_string())?;
        (
            serde_json::from_str::<Value>(&row.0).map_err(|e| e.to_string())?,
            serde_json::from_str::<Value>(&row.1).map_err(|e| e.to_string())?,
            row.2,
        )
    };

    let result = match printer::PrinterProfile::from_policy(&policy) {
        Ok(profile) => {
            let customer = payload["customerLines"].as_array().map(|lines| lines.iter().filter_map(Value::as_str).map(str::to_string).collect::<Vec<_>>()).unwrap_or_default();
            let business = payload["businessLines"].as_array().map(|lines| lines.iter().filter_map(Value::as_str).map(str::to_string).collect::<Vec<_>>()).unwrap_or_default();
            let bytes = printer::encode_receipt(&customer, &business, &profile);
            match printer::send(&profile, &bytes) {
                Ok(message) => ("SENT", message.to_string()),
                Err(printer::SendFailure::Queued(message)) => ("QUEUED", message),
                Err(printer::SendFailure::Uncertain(message)) => ("DELIVERY_UNCERTAIN", message),
            }
        }
        Err(message) => ("QUEUED", message),
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE receipt_print_jobs SET state=?,message=?,updated_at=? WHERE id=?", rusqlite::params![result.0,result.1,chrono::Utc::now().to_rfc3339(),job_id]).map_err(|e| e.to_string())?;
    Ok(json!({"jobId":job_id,"orderId":order_id,"state":result.0,"message":result.1}))
}

fn queue_printer_job(state: &Runtime, job_id: String, order_id: String, policy: Value, customer_lines: Vec<String>, business_lines: Vec<String>) -> store::Result<Value> {
    let payload = json!({"customerLines":customer_lines,"businessLines":business_lines});
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let existing: Option<(String,String)> = db.query_row("SELECT state,message FROM receipt_print_jobs WHERE id=?", [&job_id], |r| Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e| e.to_string())?;
        if let Some((state,message)) = existing {
            return Ok(json!({"jobId":job_id,"orderId":order_id,"state":state,"message":message}));
        }
        db.execute("INSERT INTO receipt_print_jobs(id,order_id,profile,payload,state,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", rusqlite::params![job_id,order_id,policy.to_string(),payload.to_string(),"QUEUED","Waiting to send",chrono::Utc::now().to_rfc3339(),chrono::Utc::now().to_rfc3339()]).map_err(|e| e.to_string())?;
    }
    execute_printer_job(state, &job_id)
}

#[tauri::command]
fn runtime_print_receipt(state: State<Runtime>, token: String, job_id: String, order_id: String, receipt_id: String, reprint: bool) -> store::Result<Value> {
    let (policy, document) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        require_printer_permission(&db, &token, "pos.sell")?;
        (printer_policy(&db), store::receipts::load(&db, &token, &order_id, Some(&receipt_id))?)
    };
    let profile = printer::PrinterProfile::from_policy(&policy)?;
    match profile.mode.as_str() {
        "OS_PRINT" => return Ok(json!({"state":"OS_DIALOG","mode":profile.mode})),
        "MANUAL" => return Ok(json!({"state":"MANUAL","mode":profile.mode})),
        _ => {}
    }
    let customer_lines=store::receipts::lines(&document,false,profile.columns,reprint);
    let business_lines=store::receipts::lines(&document,true,profile.columns,reprint);
    queue_printer_job(&state, job_id, order_id, policy, customer_lines, business_lines)
}

#[tauri::command]
fn runtime_receipt(state: State<Runtime>, token: String, order_id: String, receipt_id: Option<String>) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    let document=store::receipts::load(&db,&token,&order_id,receipt_id.as_deref())?;
    // A misconfigured printer must not prevent viewing an already-paid receipt.
    let columns=printer::PrinterProfile::from_policy(&printer_policy(&db)).map(|p|p.columns).unwrap_or(48);
    Ok(json!({"document":document,"customerLines":store::receipts::lines(&document,false,columns,false),"businessLines":store::receipts::lines(&document,true,columns,false)}))
}

#[tauri::command]
fn runtime_receipt_history(state: State<Runtime>, token: String) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    require_printer_permission(&db,&token,"pos.sell")?;
    let mut query=db.prepare("SELECT data FROM records WHERE collection='receiptDocuments' AND archived=0 ORDER BY rowid DESC LIMIT 100").map_err(|e|e.to_string())?;
    let rows=query.query_map([],|row|row.get::<_,String>(0)).map_err(|e|e.to_string())?;
    let mut result=vec![];
    for row in rows {
        let doc:Value=serde_json::from_str(&row.map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        result.push(json!({"id":doc["id"],"orderId":doc["orderId"],"orderNumber":doc["orderNumber"],"issuedAt":doc["issuedAt"],"totalMinor":doc["totalMinor"]}));
    }
    Ok(json!(result))
}

#[tauri::command]
fn runtime_printer_test(state: State<Runtime>, token: String) -> store::Result<Value> {
    let policy = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        require_printer_permission(&db, &token, "business.configure")?;
        printer_policy(&db)
    };
    let profile = printer::PrinterProfile::from_policy(&policy)?;
    if !["XP80T_LAN_ESC_POS", "XP80T_USB_ESC_POS"].contains(&profile.mode.as_str()) {
        return Err("Select XP-80T LAN or Windows USB queue mode before sending a test slip".into());
    }
    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    queue_printer_job(&state, uuid::Uuid::new_v4().to_string(), "PRINTER_TEST".into(), policy, vec!["SERVOS XP-80T PRINTER TEST".into(),format!("Sent at {stamp}"),"Paper output must be checked at the printer.".into()], vec![])
}

#[tauri::command]
fn runtime_printer_retry(state: State<Runtime>, token: String, job_id: String, confirm_duplicate: bool) -> store::Result<Value> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        require_printer_permission(&db, &token, "pos.sell")?;
        let state: String = db.query_row("SELECT state FROM receipt_print_jobs WHERE id=?", [&job_id], |r| r.get(0)).map_err(|e| e.to_string())?;
        if state == "DELIVERY_UNCERTAIN" && !confirm_duplicate {
            return Err("The first send may already have printed. Confirm possible duplicate before retrying".into());
        }
        if state != "QUEUED" && state != "DELIVERY_UNCERTAIN" {
            return Err("This print job is already being sent or has been sent".into());
        }
        let claimed = db.execute("UPDATE receipt_print_jobs SET state='SENDING',updated_at=? WHERE id=? AND state=?", rusqlite::params![chrono::Utc::now().to_rfc3339(), job_id, state]).map_err(|e| e.to_string())?;
        if claimed != 1 { return Err("Another print attempt already claimed this job".into()); }
    }
    execute_printer_job(&state, &job_id)
}

#[tauri::command]
fn runtime_printer_jobs(state: State<Runtime>, token: String) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    require_printer_permission(&db, &token, "pos.sell")?;
    let mut stmt = db.prepare("SELECT id,order_id,state,message,created_at FROM receipt_print_jobs WHERE state!='SENT' ORDER BY created_at DESC LIMIT 50").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(json!({"jobId":r.get::<_,String>(0)?,"orderId":r.get::<_,String>(1)?,"state":r.get::<_,String>(2)?,"message":r.get::<_,String>(3)?,"createdAt":r.get::<_,String>(4)?}))).map_err(|e| e.to_string())?;
    let mut jobs=Vec::new();
    for row in rows { jobs.push(row.map_err(|e| e.to_string())?); }
    Ok(json!(jobs))
}

// SERVOS_PATCH_10_TERMINAL_ACCEPTANCE
fn acceptance_actor(db:&Connection,token:&str)->store::Result<store::Session>{
    let actor=store::actor(db,token,true)?;
    if !store::permissions(&actor.role).contains(&"system.configure"){
        return Err("System configuration permission required".into());
    }
    Ok(actor)
}
fn acceptance_insert(db:&Connection,actor:&store::Session,kind:&str,details:Value)->store::Result<Value>{
    let allowed=[
        "BACKUP_RESTORE_REHEARSAL","PRINTER_PAPER_OBSERVED","SCANNER_INPUT","CASH_DRAWER_MANUAL",
        "RESTART_RECOVERY","OFFLINE_LOCAL_PROBE","CLOUD_RESYNC","FINAL_ACCEPTANCE"
    ];
    if !allowed.contains(&kind){return Err("Unsupported terminal acceptance evidence".into());}
    let id=uuid::Uuid::new_v4().to_string();let occurred_at=chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT INTO terminal_acceptance_evidence(id,kind,details,actor_id,actor_name,occurred_at) VALUES(?,?,?,?,?,?)",
        rusqlite::params![&id,kind,details.to_string(),&actor.staff_id,&actor.name,&occurred_at]
    ).map_err(|e|e.to_string())?;
    Ok(json!({"id":id,"kind":kind,"details":details,"actorId":actor.staff_id.clone(),"actorName":actor.name.clone(),"occurredAt":occurred_at}))
}
fn acceptance_status_value(db:&Connection,current_nonce:&str)->store::Result<Value>{
    let schema_version:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let quick_check:String=db.query_row("PRAGMA quick_check",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let stage=store::installation_stage(db)?;
    let terminal_id=store::meta(db,"terminal_id")?;
    let cloud_configured=store::meta(db,"cloud_url")?.is_some();
    let last_sync=store::meta(db,"last_sync")?;
    let last_backup=store::meta(db,"last_backup")?;
    let outbox_pending:i64=db.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let open_tills:i64=db.query_row("SELECT COUNT(*) FROM records WHERE collection='tillSessions' AND archived=0 AND json_extract(data,'$.status')='OPEN'",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let unresolved_print_jobs:i64=db.query_row("SELECT COUNT(*) FROM receipt_print_jobs WHERE state!='SENT'",[],|r|r.get(0)).map_err(|e|e.to_string())?;

    let intake=store::meta(db,"intake_profile")?.and_then(|raw|serde_json::from_str::<Value>(&raw).ok()).unwrap_or_else(||json!({}));
    let printer_expected=intake["printerExpected"].as_bool().unwrap_or(false);
    let scanner_expected=intake["barcodeScannerExpected"].as_bool().unwrap_or(false);
    let drawer_expected=intake["drawerExpected"].as_bool().unwrap_or(false);

    let mut evidence=serde_json::Map::<String,Value>::new();
    let mut stmt=db.prepare("SELECT id,kind,details,actor_id,actor_name,occurred_at FROM terminal_acceptance_evidence ORDER BY occurred_at DESC,rowid DESC").map_err(|e|e.to_string())?;
    let rows=stmt.query_map([],|r|Ok((
        r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,
        r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?
    ))).map_err(|e|e.to_string())?;
    for row in rows{
        let (id,kind,details_raw,actor_id,actor_name,occurred_at)=row.map_err(|e|e.to_string())?;
        if evidence.contains_key(&kind){continue;}
        let details:Value=serde_json::from_str(&details_raw).map_err(|e|e.to_string())?;
        evidence.insert(kind,json!({"id":id,"details":details,"actorId":actor_id,"actorName":actor_name,"occurredAt":occurred_at}));
    }

    let mut required=vec![
        "BACKUP_RESTORE_REHEARSAL".to_string(),
        "RESTART_RECOVERY".to_string(),
        "OFFLINE_LOCAL_PROBE".to_string()
    ];
    if printer_expected{required.push("PRINTER_PAPER_OBSERVED".into());}
    if scanner_expected{required.push("SCANNER_INPUT".into());}
    if drawer_expected{required.push("CASH_DRAWER_MANUAL".into());}
    if cloud_configured{required.push("CLOUD_RESYNC".into());}

    let restart_nonce=store::meta(db,"acceptance_restart_nonce")?;
    let restart_started_at=store::meta(db,"acceptance_restart_started_at")?;
    let restart_pending=restart_nonce.is_some();
    let can_confirm_restart=restart_nonce.as_deref().is_some_and(|nonce|nonce!=current_nonce);

    let mut blockers=Vec::<String>::new();
    if schema_version<9{blockers.push(format!("Database schema is v{schema_version}; Patch 10 requires v9")); }
    if quick_check!="ok"{blockers.push(format!("SQLite quick_check returned {quick_check}")); }
    if stage!="LIVE"{blockers.push(format!("Installation stage is {stage}; final acceptance requires LIVE")); }
    if terminal_id.is_none(){blockers.push("Terminal identity is missing".into());}
    if !cloud_configured{blockers.push("Cloud synchronization is not configured".into());}
    if outbox_pending>0{blockers.push(format!("{outbox_pending} local operation(s) are awaiting cloud acknowledgement")); }
    if open_tills>0{blockers.push("Close the active till before final terminal acceptance".into());}
    if unresolved_print_jobs>0{blockers.push(format!("{unresolved_print_jobs} printer job(s) are queued or delivery-uncertain")); }
    if restart_pending{blockers.push("Restart recovery challenge is still pending confirmation".into());}
    for kind in &required{
        if !evidence.contains_key(kind){blockers.push(format!("Missing acceptance evidence: {kind}")); }
    }

    if let Some(backup)=evidence.get("BACKUP_RESTORE_REHEARSAL"){
        if backup["details"]["schemaVersion"].as_i64()!=Some(schema_version){
            blockers.push("Backup/restore rehearsal predates the current database schema".into());
        }
    }
    if let (Some(offline),Some(cloud))=(evidence.get("OFFLINE_LOCAL_PROBE"),evidence.get("CLOUD_RESYNC")){
        let offline_at=offline["occurredAt"].as_str().unwrap_or("");
        let cloud_at=cloud["occurredAt"].as_str().unwrap_or("");
        if !offline_at.is_empty()&&!cloud_at.is_empty()&&cloud_at<=offline_at{
            blockers.push("Cloud recovery evidence must be recorded after the offline rehearsal".into());
        }
    }

    let accepted=evidence.get("FINAL_ACCEPTANCE").is_some_and(|final_evidence|{
        final_evidence["details"]["schemaVersion"].as_i64()==Some(schema_version)
            && final_evidence["details"]["terminalId"].as_str()==terminal_id.as_deref()
    });
    let accepted_at=if accepted{evidence.get("FINAL_ACCEPTANCE").and_then(|v|v["occurredAt"].as_str()).map(str::to_string)}else{None};

    Ok(json!({
        "mode":"TERMINAL_ACCEPTANCE",
        "generatedAt":chrono::Utc::now().to_rfc3339(),
        "facts":{
            "schemaVersion":schema_version,"quickCheck":quick_check,"installationStage":stage,
            "terminalId":terminal_id,"cloudConfigured":cloud_configured,"lastSync":last_sync,"lastBackup":last_backup,
            "outboxPending":outbox_pending,"openTills":open_tills,"unresolvedPrinterJobs":unresolved_print_jobs
        },
        "expectations":{"printer":printer_expected,"scanner":scanner_expected,"cashDrawer":drawer_expected},
        "requiredEvidence":required,
        "evidence":Value::Object(evidence),
        "restart":{"pending":restart_pending,"canConfirm":can_confirm_restart,"startedAt":restart_started_at},
        "blockers":blockers,
        "readyToFinalize":blockers.is_empty(),
        "accepted":accepted,"acceptedAt":accepted_at
    }))
}
#[tauri::command]
fn runtime_acceptance_status(state:State<Runtime>,token:String)->store::Result<Value>{
    let db=state.db.lock().map_err(|e|e.to_string())?;
    acceptance_actor(&db,&token)?;
    acceptance_status_value(&db,&state.startup_nonce)
}
#[tauri::command]
fn runtime_acceptance_action(state:State<Runtime>,token:String,action:String,payload:Value)->store::Result<Value>{
    let db=state.db.lock().map_err(|e|e.to_string())?;
    let actor=acceptance_actor(&db,&token)?;
    match action.as_str(){
        "BACKUP_REHEARSAL"=>{
            if !store::permissions(&actor.role).contains(&"backup.create")||!store::permissions(&actor.role).contains(&"backup.restore"){
                return Err("Backup create and restore permissions are required".into());
            }
            let folder=state.path.parent().ok_or("Missing application folder")?.join("backups");
            std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
            let backup_path=folder.join(format!("servos-acceptance-{}.sqlite",chrono::Utc::now().format("%Y%m%dT%H%M%S%f")));
            db.backup(rusqlite::DatabaseName::Main,&backup_path,None).map_err(|e|e.to_string())?;
            let rehearsal_path=folder.join(format!("rehearsal-{}.sqlite",uuid::Uuid::new_v4()));
            std::fs::copy(&backup_path,&rehearsal_path).map_err(|e|e.to_string())?;
            let live_schema:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            let live_counts:(i64,i64,i64,i64)=db.query_row(
                "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
                [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
            ).map_err(|e|e.to_string())?;
            let live_terminal=store::meta(&db,"terminal_id")?;
            let restored=Connection::open_with_flags(&rehearsal_path,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e|e.to_string())?;
            let restored_check:String=restored.query_row("PRAGMA quick_check",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            let restored_schema:i64=restored.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            let restored_counts:(i64,i64,i64,i64)=restored.query_row(
                "SELECT (SELECT COUNT(*) FROM records),(SELECT COUNT(*) FROM commands),(SELECT COUNT(*) FROM audit),(SELECT COUNT(*) FROM outbox)",
                [],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
            ).map_err(|e|e.to_string())?;
            let restored_terminal=store::meta(&restored,"terminal_id")?;
            drop(restored);
            if restored_check!="ok"||restored_schema!=live_schema||restored_counts!=live_counts||restored_terminal!=live_terminal{
                let _=std::fs::remove_file(&rehearsal_path);
                return Err("Backup restore rehearsal did not reproduce the live database identity/counts".into());
            }

            // Exercise the restored copy as a writable ServOS database and replay one identical command ID.
            // The temporary customer exists only in the rehearsal copy and is deleted with that file.
            let mut writable=store::open(&rehearsal_path)?;
            let commands_before:i64=writable.query_row("SELECT COUNT(*) FROM commands",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            let probe_record=uuid::Uuid::new_v4().to_string();
            let probe_command=store::BusinessCommand{
                id:uuid::Uuid::new_v4().to_string(),schema_version:1,operation:"record.save".into(),target_version:None,
                payload:json!({"collection":"customers","id":probe_record,"data":{"name":"ServOS restore rehearsal","phone":"0700000000"}})
            };
            let first=store::execute(&mut writable,&token,probe_command.clone())?;
            let second=store::execute(&mut writable,&token,probe_command.clone())?;
            let commands_after:i64=writable.query_row("SELECT COUNT(*) FROM commands",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            let probe_count:i64=writable.query_row("SELECT COUNT(*) FROM records WHERE collection='customers' AND id=?",[&probe_record],|r|r.get(0)).map_err(|e|e.to_string())?;
            let writable_check:String=writable.query_row("PRAGMA quick_check",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            drop(writable);
            let _=std::fs::remove_file(&rehearsal_path);
            if first!=second||commands_after!=commands_before+1||probe_count!=1||writable_check!="ok"{
                return Err("Restored-copy command replay/idempotency rehearsal failed".into());
            }

            let stamp=chrono::Utc::now().to_rfc3339();
            store::set_meta(&db,"last_backup",&stamp)?;
            store::set_meta(&db,"last_restore_rehearsal",&stamp)?;
            acceptance_insert(&db,&actor,"BACKUP_RESTORE_REHEARSAL",json!({
                "schemaVersion":live_schema,"quickCheck":restored_check,"writableQuickCheck":writable_check,
                "records":live_counts.0,"commands":live_counts.1,"auditEntries":live_counts.2,"outbox":live_counts.3,
                "terminalId":live_terminal,"idempotentCommandReplay":true,"restoredCopyWritable":true,
                "backupFile":backup_path.file_name().and_then(|v|v.to_str()).unwrap_or("servos-backup.sqlite")
            }))?;
        }
        "PRINTER_CONFIRM"=>{
            if payload["paperObserved"]!=true{return Err("Confirm physical paper output before recording printer acceptance".into());}
            let job_id=payload["jobId"].as_str().map(str::trim).filter(|v|!v.is_empty()).ok_or("Printer test job ID is required")?;
            let (order_id,job_state,updated_at):(String,String,String)=db.query_row(
                "SELECT order_id,state,updated_at FROM receipt_print_jobs WHERE id=?",[job_id],
                |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
            ).map_err(|e|e.to_string())?;
            if order_id!="PRINTER_TEST"{return Err("Only a ServOS printer-test job can satisfy printer acceptance".into());}
            if !["SENT","DELIVERY_UNCERTAIN"].contains(&job_state.as_str()){return Err("Printer test has not reached the printer transport yet".into());}
            if job_state=="DELIVERY_UNCERTAIN"{
                db.execute(
                    "UPDATE receipt_print_jobs SET state='SENT',message='Physical paper output confirmed during terminal acceptance',updated_at=? WHERE id=? AND state='DELIVERY_UNCERTAIN'",
                    rusqlite::params![chrono::Utc::now().to_rfc3339(),job_id]
                ).map_err(|e|e.to_string())?;
            }
            acceptance_insert(&db,&actor,"PRINTER_PAPER_OBSERVED",json!({"jobId":job_id,"transportState":job_state,"transportUpdatedAt":updated_at,"physicalPaperObserved":true,"uncertainTransportResolvedByPhysicalObservation":job_state=="DELIVERY_UNCERTAIN"}))?;
        }
        "SCANNER_CONFIRM"=>{
            let length=payload["codeLength"].as_i64().unwrap_or(0);
            if !(1..=256).contains(&length){return Err("Scanner capture length is invalid".into());}
            acceptance_insert(&db,&actor,"SCANNER_INPUT",json!({"capture":"keyboard-wedge","codeLength":length,"rawValueStored":false}))?;
        }
        "CASH_DRAWER_CONFIRM"=>{
            if payload["observed"]!=true{return Err("Confirm the physical/manual drawer test before recording acceptance".into());}
            acceptance_insert(&db,&actor,"CASH_DRAWER_MANUAL",json!({"manualPhysicalObservation":true,"directDrawerAdapter":false}))?;
        }
        "RESTART_BEGIN"=>{
            store::set_meta(&db,"acceptance_restart_nonce",&state.startup_nonce)?;
            store::set_meta(&db,"acceptance_restart_started_at",&chrono::Utc::now().to_rfc3339())?;
        }
        "RESTART_CONFIRM"=>{
            let prior=store::meta(&db,"acceptance_restart_nonce")?.ok_or("No restart recovery challenge is pending")?;
            if prior==state.startup_nonce{return Err("ServOS has not restarted yet. Close and relaunch the native app, sign in, then confirm.".into());}
            let started=store::meta(&db,"acceptance_restart_started_at")?;
            acceptance_insert(&db,&actor,"RESTART_RECOVERY",json!({"challengeStartedAt":started,"newProcessObserved":true,"sessionsDoNotSurviveRestart":true}))?;
            db.execute("DELETE FROM metadata WHERE key IN ('acceptance_restart_nonce','acceptance_restart_started_at')",[]).map_err(|e|e.to_string())?;
        }
        "OFFLINE_PROBE"=>{
            if payload["navigatorOffline"]!=true{return Err("Disconnect this terminal from the network before running the offline probe".into());}
            let quick:String=db.query_row("PRAGMA quick_check",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            if quick!="ok"{return Err(format!("SQLite quick_check returned {quick}"));}
            let records:i64=db.query_row("SELECT COUNT(*) FROM records",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            acceptance_insert(&db,&actor,"OFFLINE_LOCAL_PROBE",json!({"navigatorOffline":true,"sqliteQuickCheck":quick,"recordsReadable":records,"localEvidenceWriteCommitted":true}))?;
        }
        "CLOUD_CONFIRM"=>{
            if store::meta(&db,"cloud_url")?.is_none(){return Err("Cloud synchronization is not configured".into());}
            let pending:i64=db.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|r|r.get(0)).map_err(|e|e.to_string())?;
            if pending!=0{return Err(format!("{pending} operation(s) remain pending cloud acknowledgement"));}
            let last_sync=store::meta(&db,"last_sync")?.ok_or("No successful synchronization is recorded")?;
            let parsed=chrono::DateTime::parse_from_rfc3339(&last_sync).map_err(|_|"Stored last_sync timestamp is invalid".to_string())?.with_timezone(&chrono::Utc);
            let age=chrono::Utc::now().signed_duration_since(parsed);
            if age.num_minutes()>15||age.num_seconds()<0{return Err("Run synchronization now, then confirm cloud recovery within 15 minutes".into());}
            acceptance_insert(&db,&actor,"CLOUD_RESYNC",json!({"lastSync":last_sync,"pendingOutbox":0,"cloudConfigured":true}))?;
        }
        "FINALIZE"=>{
            if actor.role!="Admin"{return Err("Final terminal acceptance requires the Admin account".into());}
            let status=acceptance_status_value(&db,&state.startup_nonce)?;
            if !status["blockers"].as_array().is_some_and(|v|v.is_empty()){
                return Err(format!("Terminal acceptance still has blockers: {}",status["blockers"]));
            }
            acceptance_insert(&db,&actor,"FINAL_ACCEPTANCE",json!({
                "schemaVersion":status["facts"]["schemaVersion"],"terminalId":status["facts"]["terminalId"],
                "quickCheck":status["facts"]["quickCheck"],"outboxPending":0,
                "requiredEvidence":status["requiredEvidence"],"acceptedByRole":actor.role.clone()
            }))?;
            store::set_meta(&db,"terminal_acceptance_complete",&chrono::Utc::now().to_rfc3339())?;
        }
        _=>return Err("Unsupported terminal acceptance action".into())
    }
    acceptance_status_value(&db,&state.startup_nonce)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let folder = app.path().app_data_dir()?;
            std::fs::create_dir_all(&folder)?;
            let path = folder.join("servos.sqlite");
            let db = store::open(&path).map_err(std::io::Error::other)?;
            // Sessions never survive process restart.
            db.execute("DELETE FROM sessions", [])?;
            db.execute_batch("CREATE TABLE IF NOT EXISTS receipt_print_jobs (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,profile TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); UPDATE receipt_print_jobs SET state='DELIVERY_UNCERTAIN',message='App restarted while the printer send was in progress. Check paper before retrying.' WHERE state='SENDING';")?;
            app.manage(Runtime {
                db: Mutex::new(db),
                path,
                syncing: Mutex::new(false),
                operator_auth: Mutex::new(None),
                startup_nonce: uuid::Uuid::new_v4().to_string(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            runtime_intake_save,
            runtime_intake_complete,
            runtime_intake_reopen,
            runtime_intake_clear,
            runtime_login,
            runtime_login_offline,
            runtime_lock,
            runtime_snapshot,
            runtime_guidance_progress,
            runtime_guidance_save_progress,
            runtime_inventory_count_draft,
            runtime_save_inventory_count_draft,
            runtime_clear_inventory_count_draft,
            runtime_command,
            runtime_manager_approve,
            runtime_enroll,
            runtime_sync,
            runtime_backup,
            runtime_health_audit,
            runtime_acceptance_status,
            runtime_acceptance_action,
            runtime_import_list,
            runtime_import_detail,
            runtime_import_stage,
            runtime_import_cancel,
            runtime_import_plan,
            runtime_import_plan_detail,
            runtime_import_apply,
            runtime_reconciliation_compare,
            runtime_print_receipt,
            runtime_receipt,
            runtime_receipt_history,
            runtime_printer_test,
            runtime_printer_retry,
            runtime_printer_jobs
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start ServOS");
}
