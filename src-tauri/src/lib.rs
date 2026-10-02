mod store;
mod printer;
mod rpc_error;
use rpc_error::bounded_detail;
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
    auth_refreshing: Mutex<bool>,
    startup_nonce: String,
}
#[derive(Clone)]
struct OperatorAuth { staff_id: String, access_token: String, expires_at: i64, identity: Value }
/// The business authority is persisted terminal state, never a property of the
/// current login session. An absent `operator_auth` therefore fails closed
/// instead of re-enabling the legacy writer.
fn reject_legacy_business_write_when_v2_active(state:&Runtime,workflow:&str)->store::Result<()>{
    let db=state.db.lock().map_err(|e|e.to_string())?;
    store::reject_legacy_business_write(&db,workflow)
}
/// Produce the deterministic cutover manifest for the current local business
/// state. Read-only: it changes nothing and exports no credentials.
#[tauri::command]
fn runtime_v2_cutover_manifest(state: State<Runtime>) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::cutover::cutover_manifest(&db)
}

/// Read one bounded, ordered import page for a collection.
#[tauri::command]
fn runtime_v2_cutover_page(state: State<Runtime>, collection: String, after_id: String, page_size: Option<usize>) -> store::Result<Value> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::cutover::cutover_page(&db, &collection, &after_id, page_size.unwrap_or(200))
}

/// Move this terminal between business authorities. Only a forward move is
/// possible, a reason is mandatory, and the move is recorded as immutable
/// evidence. Entering CUTOVER_PREP freezes legacy business mutation; entering
/// SHARED_V2 additionally closes local PIN business writes entirely.
#[tauri::command]
fn runtime_set_authority_mode(state: State<Runtime>, token: String, mode: String, cutover_id: Option<String>, reason: String) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    let actor=store::actor(&db,&token,false)?;
    if !store::permissions(&actor.role).contains(&"system.configure"){
        return Err("Permission required: system.configure".into());
    }
    let next=match mode.as_str(){
        "LEGACY_LOCAL"=>store::AuthorityMode::LegacyLocal,
        "CUTOVER_PREP"=>store::AuthorityMode::CutoverPrep,
        "SHARED_V2"=>store::AuthorityMode::SharedV2,
        other=>return Err(format!("Unknown business authority mode: {other}")),
    };
    let current=store::set_authority_mode(&db,next,Some(&actor.staff_id),cutover_id.as_deref(),&reason)?;
    Ok(json!({"authorityMode":current.as_str(),"legacyWritesFenced":current.legacy_writes_fenced(),"unresolvedLegacyCommands":store::unresolved_legacy_outbox(&db)?}))
}
/// Formally close legacy outbox work as superseded by a verified v2 cutover.
/// `server_ready` must reflect a real READY response from the cutover RPC; the
/// rows are preserved and evidenced, never deleted.
#[tauri::command]
fn runtime_resolve_legacy_outbox(state: State<Runtime>, token: String, cutover_id: String, server_ready: bool) -> store::Result<Value> {
    let mut db=state.db.lock().map_err(|e|e.to_string())?;
    let actor=store::actor(&db,&token,false)?;
    if !store::permissions(&actor.role).contains(&"system.configure"){
        return Err("Permission required: system.configure".into());
    }
    let resolved=store::supersede_legacy_outbox(&mut db,&cutover_id,server_ready)?;
    Ok(json!({"cutoverId":cutover_id,"resolution":"SUPERSEDED_BY_V2_CUTOVER","resolvedCommands":resolved,"unresolvedLegacyCommands":store::unresolved_legacy_outbox(&db)?,"authorityMode":store::authority_mode(&db)?.as_str()}))
}
#[tauri::command]
fn runtime_status(state: State<Runtime>) -> store::Result<Value> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    let mut stmt=db.prepare("SELECT id,name,role FROM staff WHERE active=1 ORDER BY name").map_err(|e|e.to_string())?;
    let staff=stmt.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"role":r.get::<_,String>(2)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let intake=store::meta(&db,"intake_profile")?.and_then(|value|serde_json::from_str::<Value>(&value).ok());
    let mode=store::authority_mode(&db)?;
    Ok(json!({"enrolled":store::meta(&db,"terminal_id")?.is_some(),"installationStage":store::installation_stage(&db)?,"staff":staff,"intakeProfile":intake,"authorityMode":mode.as_str(),"legacyWritesFenced":mode.legacy_writes_fenced(),"unresolvedLegacyCommands":store::unresolved_legacy_outbox(&db)?}))
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
    reject_legacy_business_write_when_v2_active(&state,"Intake setup")?;
    let db=state.db.lock().map_err(|e|e.to_string())?;
    if store::meta(&db,"terminal_id")?.is_some(){return Err("Intake cannot be changed after enrollment".into());}
    validate_intake_profile(&profile,false)?;
    store::set_meta(&db,"intake_profile",&profile.to_string())?; store::set_meta(&db,"installation_stage","INTAKE_IN_PROGRESS")?; Ok(profile)
}
#[tauri::command]
fn runtime_intake_complete(state: State<Runtime>, profile: Value) -> store::Result<Value> {
    reject_legacy_business_write_when_v2_active(&state,"Intake setup")?;
    let db=state.db.lock().map_err(|e|e.to_string())?;
    if store::meta(&db,"terminal_id")?.is_some(){return Err("Intake cannot be changed after enrollment".into());}
    validate_intake_profile(&profile,true)?;
    store::set_meta(&db,"intake_profile",&profile.to_string())?; store::set_meta(&db,"installation_stage","READY_FOR_ENROLLMENT")?; Ok(profile)
}
#[tauri::command]
fn runtime_intake_reopen(state: State<Runtime>) -> store::Result<()> {
    reject_legacy_business_write_when_v2_active(&state,"Intake setup")?;
    let db=state.db.lock().map_err(|e|e.to_string())?;
    if store::meta(&db,"terminal_id")?.is_some(){return Err("Intake cannot be reopened after enrollment".into());}
    if store::meta(&db,"intake_profile")?.is_none(){return Err("No saved Intake profile is available".into());}
    store::set_meta(&db,"installation_stage","INTAKE_IN_PROGRESS")
}
#[tauri::command]
fn runtime_intake_clear(state: State<Runtime>) -> store::Result<()> {
    reject_legacy_business_write_when_v2_active(&state,"Intake setup")?;
    let db=state.db.lock().map_err(|e|e.to_string())?;
    if store::meta(&db,"terminal_id")?.is_some(){return Err("Intake cannot be cleared after enrollment".into());}
    db.execute("DELETE FROM metadata WHERE key IN ('intake_profile','installation_stage')",[]).map_err(|e|e.to_string())?; Ok(())
}
#[tauri::command]
async fn runtime_login(
    state: State<'_, Runtime>,
    staff_id: String,
    pin: String,
    email: String,
    password: String,
) -> store::Result<store::Session> {
    if email.trim().is_empty() && password.is_empty() {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        return store::login(&db, &staff_id, &pin);
    }
    if email.trim().is_empty() || password.is_empty() {
        return Err("Enter both your business account email and password, or leave both blank for local PIN access.".into());
    }
    let config:store::Result<(String,String,String)> = (|| {
        let db=state.db.lock().map_err(|e|e.to_string())?;
        Ok((store::meta(&db,"cloud_url")?.ok_or("Terminal is not connected to its business server")?,
         store::meta(&db,"cloud_key")?.ok_or("Terminal is not connected to its business server")?,
         store::meta(&db,"terminal_id")?.ok_or("Terminal has not been paired")?))
    })();
    let (url,key,terminal)=config?;
    let mut local_session_token:Option<String>=None;
    let auth_result=async {
        let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e|e.to_string())?;
        let response=client.post(format!("{url}/auth/v1/token?grant_type=password"))
            .header("apikey",&key).json(&json!({"email":email,"password":password})).send().await
            .map_err(|_|"Authentication server unavailable".to_string())?;
        if !response.status().is_success(){return Err("Sign-in failed. Check the operator credentials and invitation status.".into());}
        let auth:Value=response.json().await.map_err(|_|"Invalid authentication response".to_string())?;
        let access=auth["access_token"].as_str().ok_or("Authentication token missing")?.to_string();
        let refresh=auth["refresh_token"].as_str().ok_or("Refresh token missing")?.to_string();
        let expires_in=auth["expires_in"].as_i64().unwrap_or(3600).clamp(60,86400);
        let paired={let db=state.db.lock().map_err(|e|e.to_string())?;store::meta(&db,"v2_device_paired")?.as_deref()==Some("true")};
        if !paired {
            rpc(&url,&key,Some(&access),"servos_v2_register_device",json!({"device_id":terminal,"label":"ServOS Terminal","kind":"DESKTOP"})).await?;
            let db=state.db.lock().map_err(|e|e.to_string())?;
            store::set_meta(&db,"v2_device_paired","true")?;
        }
        let identity=rpc(&url,&key,Some(&access),"servos_v2_terminal_identity",json!({"device_id":terminal})).await?;
        if identity["staffId"].as_str()!=Some(staff_id.as_str()) || identity["actorId"].as_str().is_none() || identity["deviceId"].as_str()!=Some(terminal.as_str()){
            let _=client.post(format!("{url}/auth/v1/logout")).header("apikey",&key).bearer_auth(&access).send().await;
            return Err("This Auth account is not bound to the selected local staff ID. Ask an Admin to bind the correct staff record.".into());
        }
        let local={let db=state.db.lock().map_err(|e|e.to_string())?;store::login_authenticated(&db,&staff_id)?};
        local_session_token=Some(local.token.clone());
        { let db=state.db.lock().map_err(|e|e.to_string())?; store::seed_native_v2_state(&db,&identity)?; }
        let entry=keyring::Entry::new("ServOS",&format!("{}:{}",terminal,local.staff_id)).map_err(|_|"OS secure credential storage is unavailable".to_string())?;
        entry.set_password(&refresh).map_err(|_|"Could not securely store the operator session".to_string())?;
        *state.operator_auth.lock().map_err(|e|e.to_string())?=Some(OperatorAuth{staff_id:local.staff_id.clone(),access_token:access,expires_at:chrono::Utc::now().timestamp()+expires_in,identity});
        Ok(local)
    }.await;
    if auth_result.is_err(){if let Some(token)=local_session_token{let _=state.db.lock().map(|db|db.execute("DELETE FROM sessions WHERE token=?",[token]));}}
    auth_result
}
async fn refresh_operator_auth_inner(state:&Runtime,force_refresh:bool)->store::Result<bool>{
    let active=state.operator_auth.lock().map_err(|e|e.to_string())?.clone();
    let Some(active)=active else{return Ok(false)};
    if !force_refresh&&active.expires_at>chrono::Utc::now().timestamp()+120{return Ok(false)};
    let (url,key,terminal)={
        let db=state.db.lock().map_err(|e|e.to_string())?;
        (store::meta(&db,"cloud_url")?.ok_or("Cloud synchronization is not configured")?,store::meta(&db,"cloud_key")?.ok_or("Cloud publishable key is missing")?,store::meta(&db,"terminal_id")?.ok_or("Terminal identity is missing")?)
    };
    let entry=keyring::Entry::new("ServOS",&format!("{}:{}",terminal,active.staff_id)).map_err(|_|"OS secure credential storage is unavailable".to_string())?;
    let refresh=entry.get_password().map_err(|_|"Secure operator credential is unavailable; sign in again".to_string())?;
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e|e.to_string())?;
    let response=client.post(format!("{url}/auth/v1/token?grant_type=refresh_token")).header("apikey",&key).json(&json!({"refresh_token":refresh})).send().await.map_err(|_|"Authentication server unavailable; local work remains available".to_string())?;
    if !response.status().is_success(){
        if response.status().as_u16()==400||response.status().as_u16()==401{
            let _=entry.delete_credential();
            *state.operator_auth.lock().map_err(|e|e.to_string())?=None;
            return Err("Business sign-in expired or was revoked. Sign in again to restore online identity.".into());
        }
        return Err("Authentication server rejected session renewal; local work remains available".into());
    }
    let refreshed:Value=response.json().await.map_err(|_|"Invalid refreshed authentication response".to_string())?;
    let access=refreshed["access_token"].as_str().ok_or("Refreshed access token missing")?.to_string();
    let refresh=refreshed["refresh_token"].as_str().ok_or("Rotated refresh token missing")?.to_string();
    let expires_in=refreshed["expires_in"].as_i64().unwrap_or(3600).clamp(60,86400);
    // Persist the newly rotated single-use token before any subsequent network work.
    if entry.set_password(&refresh).is_err(){let _=entry.delete_credential();*state.operator_auth.lock().map_err(|e|e.to_string())?=None;return Err("Could not securely save the rotated operator credential; sign in again".into());}
    {
        let mut current=state.operator_auth.lock().map_err(|e|e.to_string())?;
        if let Some(auth)=current.as_mut().filter(|auth|auth.staff_id==active.staff_id){
            auth.access_token=access.clone();auth.expires_at=chrono::Utc::now().timestamp()+expires_in;
        }else{return Ok(false)}
    }
    let identity=rpc(&url,&key,Some(&access),"servos_v2_terminal_identity",json!({"device_id":terminal})).await?;
    if identity["staffId"].as_str()!=Some(active.staff_id.as_str())||identity["deviceId"].as_str()!=Some(terminal.as_str()){
        let _=entry.delete_credential();
        *state.operator_auth.lock().map_err(|e|e.to_string())?=None;
        return Err("Server operator or terminal authorization changed; sign in again".into());
    }
    { let db=state.db.lock().map_err(|e|e.to_string())?; store::seed_native_v2_state(&db,&identity)?; }
    if let Some(auth)=state.operator_auth.lock().map_err(|e|e.to_string())?.as_mut().filter(|auth|auth.staff_id==active.staff_id){auth.identity=identity;}
    Ok(true)
}
#[tauri::command]
async fn runtime_refresh_operator_auth(state:State<'_,Runtime>,force_refresh:bool)->store::Result<bool>{
    {
        let mut busy=state.auth_refreshing.lock().map_err(|e|e.to_string())?;
        if *busy{return Ok(false)}
        *busy=true;
    }
    let result=refresh_operator_auth_inner(&state,force_refresh).await;
    if let Ok(mut busy)=state.auth_refreshing.lock(){*busy=false;}
    result
}
#[tauri::command]
async fn runtime_v2_install_snapshot(state:State<'_,Runtime>)->store::Result<Value>{
    if !refresh_operator_auth_inner(&state,true).await? { return Err("Sign in online to initialize the v2 replica".into()); }
    let active=state.operator_auth.lock().map_err(|e|e.to_string())?.clone().ok_or("Online operator session is unavailable")?;
    let (url,key,terminal)={
        let db=state.db.lock().map_err(|e|e.to_string())?;
        let terminal=store::meta(&db,"terminal_id")?.ok_or("Terminal is not paired")?;
        (store::meta(&db,"cloud_url")?.ok_or("Cloud URL is not configured")?,store::meta(&db,"cloud_key")?.ok_or("Cloud publishable key is missing")?,terminal)
    };
    let session=rpc(&url,&key,Some(&active.access_token),"servos_v2_session",json!({})).await?;
    let business_id=store::text(&session,"businessId")?.to_string();
    let actor_id=store::text(&session,"actorId")?;
    if active.identity["businessId"].as_str()!=Some(business_id.as_str())||active.identity["actorId"].as_str()!=Some(actor_id){
        return Err("Authenticated v2 identity changed; sign in again before snapshot".into());
    }
    let policy=store::text(&session,"policyVersion")?.to_string();
    let mut cursor:Option<i64>=None;
    let mut after_collection=String::new();
    let mut after_id=String::new();
    let mut records:Vec<Value>=Vec::new();
    for page_number in 0..200 {
        let page=rpc(&url,&key,Some(&active.access_token),"servos_v2_snapshot",json!({
            "after_collection":after_collection,"after_id":after_id,"expected_cursor":cursor,
            "expected_policy":policy,"page_size":500
        })).await?;
        let page_cursor=page["cursor"].as_i64().filter(|value|*value>=0).ok_or("Snapshot cursor missing")?;
        if cursor.is_some_and(|previous|previous!=page_cursor)||page["policyVersion"].as_str()!=Some(policy.as_str()){
            return Err("Server snapshot changed during pagination; no baseline installed".into());
        }
        cursor=Some(page_cursor);
        let batch=page["records"].as_array().ok_or("Snapshot records missing")?;
        if records.len()+batch.len()>100_000 { return Err("V2 snapshot exceeds the 100,000 record safety limit".into()); }
        records.extend(batch.iter().cloned());
        if page["hasMore"]==true {
            let next_collection=store::text(&page,"afterCollection")?.to_string();
            let next_id=store::text(&page,"afterId")?.to_string();
            if next_collection==after_collection&&next_id==after_id { return Err("V2 snapshot pagination made no progress".into()); }
            after_collection=next_collection;after_id=next_id;
        } else {
            let snapshot_cursor=cursor.ok_or("Snapshot cursor missing")?;
            let mut db=state.db.lock().map_err(|e|e.to_string())?;
            store::install_native_v2_snapshot(&mut db,&terminal,&business_id,snapshot_cursor,&policy,&records)?;
            return Ok(json!({"installed":true,"records":records.len(),"cursor":snapshot_cursor,"policyVersion":policy,"pageCount":page_number+1}));
        }
    }
    Err("V2 snapshot exceeded the 200-page safety limit; no baseline installed".into())
}
#[tauri::command]
async fn runtime_v2_sync_replica(state:State<'_,Runtime>)->store::Result<Value>{
    {
        let mut running=state.syncing.lock().map_err(|e|e.to_string())?;
        if *running{return Err("Another synchronization is already running".into());}
        *running=true;
    }
    let result=async {
        if !refresh_operator_auth_inner(&state,true).await? { return Err("Sign in online to synchronize the v2 replica".into()); }
        let active=state.operator_auth.lock().map_err(|e|e.to_string())?.clone().ok_or("Online operator session is unavailable")?;
        let acknowledged=flush_native_v2_pending(&state,&active).await?;
        let mut report=sync_native_v2_feed(&state,&active).await?;
        report["acknowledgedCommands"]=json!(acknowledged);
        Ok(report)
    }.await;
    if let Ok(mut running)=state.syncing.lock(){*running=false;}
    result
}
async fn flush_native_v2_pending(state:&Runtime,active:&OperatorAuth)->store::Result<usize>{
    let (url,key,terminal,expected_actor)={
        let db=state.db.lock().map_err(|e|e.to_string())?;
        let legacy_pending:i64=db.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|row|row.get(0)).map_err(|e|e.to_string())?;
        if legacy_pending>0{return Err("V2 dispatch is blocked while legacy terminal commands remain unacknowledged".into());}
        (store::meta(&db,"cloud_url")?.ok_or("Cloud URL is not configured")?,store::meta(&db,"cloud_key")?.ok_or("Cloud publishable key is missing")?,store::meta(&db,"terminal_id")?.ok_or("Terminal is not paired")?,store::text(&active.identity,"actorId")?.to_string())
    };
    let mut sent=0;
    loop{
        let queued={let db=state.db.lock().map_err(|e|e.to_string())?;store::next_native_v2_pending(&db,&terminal)?};
        let Some((command_id,actor_id,envelope))=queued else{break};
        if actor_id!=expected_actor{return Err("A queued v2 command belongs to another operator. Sign in as that operator and synchronize it first".into());}
        {let db=state.db.lock().map_err(|e|e.to_string())?;store::mark_native_v2_attempt(&db,&command_id)?;}
        let result=rpc(&url,&key,Some(&active.access_token),"servos_v2_execute",json!({"command":envelope})).await?;
        if result["commandId"].as_str()!=Some(command_id.as_str()){return Err("Server acknowledged a different v2 command; the durable queue is retained".into());}
        let status=result["status"].as_str().unwrap_or("").to_string();
        {let mut db=state.db.lock().map_err(|e|e.to_string())?;store::acknowledge_native_v2_command(&mut db,&result)?;}
        sent+=1;
        if status!="SYNCHRONIZED"{
            let _=sync_native_v2_feed(state,active).await;
            let detail=result["error"]["message"].as_str().unwrap_or("The server rejected this command");
            return Err(format!("V2 command {status}: {detail}. The result is recorded; review before submitting a replacement."));
        }
    }
    Ok(sent)
}
async fn sync_native_v2_feed(state:&Runtime,active:&OperatorAuth)->store::Result<Value>{
    let (url,key,terminal,business_id,mut cursor,snapshot_policy,complete)={
        let db=state.db.lock().map_err(|e|e.to_string())?;
        let legacy_pending:i64=db.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|row|row.get(0)).map_err(|e|e.to_string())?;
        if legacy_pending>0{return Err("V2 feed sync is blocked until the legacy outbox is drained and reconciled".into());}
        let terminal=store::meta(&db,"terminal_id")?.ok_or("Terminal is not paired")?;
        let row:Option<(String,i64,Option<String>,i64)>=db.query_row("SELECT business_id,feed_cursor,snapshot_policy,snapshot_complete FROM native_v2_state WHERE device_id=?",[&terminal],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|e|e.to_string())?;
        let (business,cursor,policy,installed)=row.ok_or("Authenticated v2 device state is missing")?;
        (store::meta(&db,"cloud_url")?.ok_or("Cloud URL is not configured")?,store::meta(&db,"cloud_key")?.ok_or("Cloud publishable key is missing")?,terminal,business,cursor,policy,installed==1)
    };
    if !complete{return Err("Install the authorized v2 shadow baseline before feed synchronization".into());}
    let session=rpc(&url,&key,Some(&active.access_token),"servos_v2_session",json!({})).await?;
    if session["actorId"].as_str()!=active.identity["actorId"].as_str()||session["businessId"].as_str()!=Some(business_id.as_str()){
        return Err("Authenticated v2 identity changed; sign in again".into());
    }
    if session["policyVersion"].as_str()!=snapshot_policy.as_deref(){
        return Err("V2 permissions changed since baseline. Reinstall the shadow snapshot before continuing".into());
    }
    let mut total_changes=0usize;
    for _ in 0..100 {
        let page=rpc(&url,&key,Some(&active.access_token),"servos_v2_pull",json!({"after_sequence":cursor,"page_size":100})).await?;
        let next=page["cursor"].as_i64().filter(|value|*value>=cursor).ok_or("Invalid v2 feed cursor")?;
        let change_count=page["changes"].as_array().ok_or("V2 feed changes missing")?.len();
        if page["hasMore"]==true&&next==cursor{return Err("V2 change feed made no progress".into());}
        {let mut db=state.db.lock().map_err(|e|e.to_string())?;store::apply_native_v2_page(&mut db,&terminal,&page)?;}
        total_changes+=change_count;cursor=next;
        if page["hasMore"]!=true{return Ok(json!({"appliedChanges":total_changes,"cursor":cursor,"hasMore":false}));}
    }
    Ok(json!({"appliedChanges":total_changes,"cursor":cursor,"hasMore":true}))
}
#[tauri::command]
fn runtime_lock(state: State<Runtime>, token: String) -> store::Result<()> {
    let active=state.operator_auth.lock().map_err(|e|e.to_string())?.take();
    let mut credential_clear_failed=false;
    if let Some(auth)=active{
        let config=state.db.lock().ok().and_then(|db|Some((store::meta(&db,"cloud_url").ok()??,store::meta(&db,"cloud_key").ok()??,store::meta(&db,"terminal_id").ok()??)));
        if let Some((url,key,terminal))=config{
            match keyring::Entry::new("ServOS",&format!("{}:{}",terminal,auth.staff_id)){
                Ok(entry)=>credential_clear_failed=entry.delete_credential().is_err(),
                Err(_)=>credential_clear_failed=true,
            }
            let auth_token=auth.access_token.clone();
            tauri::async_runtime::spawn(async move{let _=reqwest::Client::new().post(format!("{url}/auth/v1/logout")).header("apikey",key).bearer_auth(auth_token).send().await;});
        }else{credential_clear_failed=true;}
    }
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute("DELETE FROM sessions WHERE token=?", [token])
        .map_err(|e| e.to_string())?;
    if credential_clear_failed{return Err("The active terminal session was cleared, but its OS credential could not be removed. Contact an administrator before another operator signs in.".into());}
    Ok(())
}
#[tauri::command]
async fn runtime_snapshot(state: State<'_,Runtime>, token: String) -> store::Result<Value> {
    // The persisted authority decides the read source. Falling back to the legacy
    // operational snapshot here would expose stale local state as current truth.
    let mode={
        let db=state.db.lock().map_err(|e|e.to_string())?;
        store::authority_mode(&db)?
    };
    if mode==store::AuthorityMode::SharedV2&&state.operator_auth.lock().map_err(|e|e.to_string())?.is_none(){
        return Err("This terminal is in shared v2 authority. Sign in online to view current business records.".into());
    }
    if state.operator_auth.lock().map_err(|e|e.to_string())?.is_some(){
        // Revalidate the grant fingerprint before exposing the shared shadow;
        // periodic refresh alone leaves a revocation window between polls.
        refresh_operator_auth_inner(&state,true).await?;
    }
    let active=state.operator_auth.lock().map_err(|e|e.to_string())?.clone();
    let use_v2=active.as_ref().is_some_and(|auth|auth.identity["enabled"]==true);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if use_v2{
        let local=store::actor(&db,&token,false)?;
        if active.as_ref().is_some_and(|auth|auth.staff_id!=local.staff_id){return Err("The local operator and authenticated v2 operator do not match".into());}
        let device=store::meta(&db,"terminal_id")?.ok_or("Terminal is not paired")?;
        let installed:Option<i64>=db.query_row("SELECT snapshot_complete FROM native_v2_state WHERE device_id=?",[&device],|row|row.get(0)).optional().map_err(|e|e.to_string())?;
        if installed==Some(1){
            let saved_policy:Option<String>=db.query_row("SELECT snapshot_policy FROM native_v2_state WHERE device_id=?",[&device],|row|row.get(0)).optional().map_err(|e|e.to_string())?.flatten();
            let current_policy=active.as_ref().and_then(|auth|auth.identity["policyVersion"].as_str());
            if saved_policy.as_deref()!=current_policy{return Err("Operator permissions changed since this v2 snapshot was installed. Refresh the authorized snapshot before viewing shared records.".into());}
            let server_permissions=active.as_ref().map(|auth|&auth.identity["permissions"]).ok_or("Authenticated operator identity is unavailable")?;
            let mut snapshot=store::native_v2_snapshot(&db,&token,&device,server_permissions)?;
            if let Some(identity)=active.as_ref().map(|auth|&auth.identity){
                snapshot["actor"]["permissions"]=identity["permissions"].clone();
                snapshot["actor"]["role"]=identity["role"].clone();
                snapshot["actor"]["name"]=identity["name"].clone();
            }
            return Ok(snapshot);
        }
        // SHARED_V2 without a complete baseline must fail closed rather than serve
        // legacy records as if they were current business truth.
        if mode==store::AuthorityMode::SharedV2{
            return Err("The shared v2 baseline is not installed on this terminal. Install or refresh the authorized snapshot before viewing business records.".into());
        }
    }
    store::snapshot(&db, &token)
}
#[tauri::command]
fn runtime_login_offline(state: State<Runtime>, staff_id: String, pin: String) -> store::Result<store::Session> {
    let db=state.db.lock().map_err(|e|e.to_string())?;
    // Signed v2 offline grants do not exist yet. Rather than silently creating a
    // second writer, shared authority requires an online sign-in; the cached v2
    // view stays readable through the Auth-bound session only.
    if store::authority_mode(&db)?==store::AuthorityMode::SharedV2{
        return Err("This terminal is in shared v2 authority. An online sign-in is required; local PIN unlock cannot create a business write session.".into());
    }
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
async fn runtime_command(
    state: State<'_,Runtime>,
    token: String,
    command: store::BusinessCommand,
    expected_versions: Option<Value>,
) -> store::Result<Value> {
    // Routing is decided by the PERSISTED business authority, not by whether an
    // Auth session happens to be loaded. Deciding from `operator_auth` allowed
    // this unsafe sequence: v2 active -> operator signs out -> local PIN unlock
    // -> operator_auth = None -> fall back to store::execute -> a second writer
    // whose outbox could never upload because the server had fenced legacy.
    let (mode,active)={
        let db=state.db.lock().map_err(|e|e.to_string())?;
        let mode=store::authority_mode(&db)?;
        // Fail closed before any write when shared authority needs online Auth.
        if mode==store::AuthorityMode::SharedV2&&state.operator_auth.lock().map_err(|e|e.to_string())?.is_none(){
            return Err("This terminal is in shared v2 authority. Sign in online to send a business command; local PIN access cannot write business records.".into());
        }
        (mode,state.operator_auth.lock().map_err(|e|e.to_string())?.clone())
    };
    if mode==store::AuthorityMode::SharedV2||active.as_ref().is_some_and(|auth|auth.identity["enabled"]==true){
        {
            let mut running=state.syncing.lock().map_err(|e|e.to_string())?;
            if *running{return Err("Another synchronization is already running".into());}
            *running=true;
        }
        let result=async {
            if !refresh_operator_auth_inner(&state,true).await? {return Err("Online operator authentication is required for shared v2 writes".into());}
            let active=state.operator_auth.lock().map_err(|e|e.to_string())?.clone().ok_or("Online operator session is unavailable")?;
            // Never silently fall back to the legacy writer. Losing v2 during a
            // refresh is a hard stop, not a licence to create a second authority.
            if active.identity["enabled"]!=true{
                return Err("Shared v2 authority is active but this session is not authorized for it. Sign in online again; this action was not sent and nothing was written locally.".into());
            }
            let (url,key,terminal,business_id)={
                let db=state.db.lock().map_err(|e|e.to_string())?;
                let local=store::actor(&db,&token,false)?;
                if local.staff_id!=active.staff_id{return Err("The local operator and authenticated v2 operator do not match".into());}
                (store::meta(&db,"cloud_url")?.ok_or("Cloud URL is not configured")?,store::meta(&db,"cloud_key")?.ok_or("Cloud publishable key is missing")?,store::meta(&db,"terminal_id")?.ok_or("Terminal is not paired")?,store::text(&active.identity,"businessId")?.to_string())
            };
            let session=rpc(&url,&key,Some(&active.access_token),"servos_v2_session",json!({})).await?;
            if session["enabled"]!=true{return Err("V2 authority changed during sign-in refresh; retry after synchronizing terminal state".into());}
            if session["actorId"].as_str()!=active.identity["actorId"].as_str()||session["businessId"].as_str()!=Some(business_id.as_str()){
                return Err("Authenticated v2 actor or business changed; sign in again".into());
            }
            let replayed=flush_native_v2_pending(&state,&active).await?;
            if replayed>0{
                if sync_native_v2_feed(&state,&active).await.is_err(){return Err("A previously queued v2 command was acknowledged by the server, but this new action was not sent and the local shared view is still refreshing. Do not repeat the earlier action.".into());}
                return Err("A previously queued v2 command was just acknowledged. This new action was not sent; review the refreshed business state before retrying.".into());
            }
            let versions=expected_versions.unwrap_or_else(||json!([]));
            let envelope={
                let mut db=state.db.lock().map_err(|e|e.to_string())?;
                store::queue_native_v2_command(&mut db,&terminal,&business_id,store::text(&active.identity,"actorId")?,&command,&versions)?
            };
            let command_id=store::text(&envelope,"id")?.to_string();
            // Short explicit lock scope: take the connection, read the pending command, then drop the guard.
             let pending={let db=state.db.lock().map_err(|e|e.to_string())?;store::next_native_v2_pending(&db,&terminal)?}.ok_or("Durable v2 command queue entry disappeared")?;
            if pending.0!=command_id{return Err("V2 command sequence changed before dispatch".into());}
            {let db=state.db.lock().map_err(|e|e.to_string())?;store::mark_native_v2_attempt(&db,&command_id)?;}
            let server_result=rpc(&url,&key,Some(&active.access_token),"servos_v2_execute",json!({"command":pending.2})).await?;
            if server_result["commandId"].as_str()!=Some(command_id.as_str()){return Err("Server acknowledged a different v2 command; durable command retained".into());}
            let status=server_result["status"].as_str().unwrap_or("").to_string();
            let mut result={let mut db=state.db.lock().map_err(|e|e.to_string())?;store::acknowledge_native_v2_command(&mut db,&server_result)?};
            if status!="SYNCHRONIZED"{
                let _=sync_native_v2_feed(&state,&active).await;
                let detail=server_result["error"]["message"].as_str().unwrap_or("The server rejected this command");
                return Err(format!("V2 command {status}: {detail}. The result is recorded; review before submitting a replacement."));
            }
            if sync_native_v2_feed(&state,&active).await.is_err(){result["syncPending"]=json!(true);}
            Ok(result)
        }.await;
        if let Ok(mut running)=state.syncing.lock(){*running=false;}
        return result;
    }
    let mut db=state.db.lock().map_err(|e|e.to_string())?;
    store::execute(&mut db,&token,command)
}
#[tauri::command]
fn runtime_manager_approve(state: State<Runtime>, token: String, approver_id: String, pin: String, permission: String, target: Option<String>) -> store::Result<Value> {
    reject_legacy_business_write_when_v2_active(&state,"Manager approval")?;
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
/// Maximum server error detail retained in a rejection message and the bounded
/// formatter itself live in `rpc_error`, which the dependency-free
/// `native-tests` crate also compiles. See `src-tauri/src/rpc_error.rs`.
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
    let status = res.status();
    if !status.is_success() {
        // A PostgREST failure carries the actionable cause in the body
        // (PGRST202 missing function, PGRST203 bad signature, the raised
        // exception text). Discarding it forced debugging through HTTP status
        // alone, so the detail is surfaced with a bounded length.
        let body = res.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("error").and_then(|v| v.as_str()))
                    .map(str::to_string)
            })
            .unwrap_or_else(|| {
                if body.trim().is_empty() {
                    "No server error details returned".to_string()
                } else {
                    body
                }
            });
        return Err(format!(
            "Server rejected request ({status}): {}; local data retained",
            bounded_detail(&detail)
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
    let auth_user=reqwest::Client::new().get(format!("{url}/auth/v1/user")).header("apikey",&publishable_key).bearer_auth(&access_token).send().await.map_err(|_|"Could not verify the enrolling Auth account".to_string())?;
    if !auth_user.status().is_success(){return Err("The enrolling Auth session could not be verified".into());}
    let auth_user:Value=auth_user.json().await.map_err(|_|"Invalid enrolling Auth user response".to_string())?;
    let auth_id=auth_user["id"].as_str().filter(|id|uuid::Uuid::parse_str(id).is_ok()).ok_or("Enrolling Auth user ID is invalid")?;
    let admin_staff_id=format!("auth:{auth_id}");

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
    store::initialize_from_intake_with_admin_id(&mut db, &terminal, &pin, &profile,&admin_staff_id)?;
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
    let result=async {
        // Shared authority owns synchronization: only the native v2 outbox and
        // the v2 change feed may run. Reaching sync_inner here would call
        // servos_upload, which the server has fenced, and would present a
        // permanent failure as a business problem.
        let (mode,v2_active)={
            let db=state.db.lock().map_err(|e|e.to_string())?;
            (store::authority_mode(&db)?,state.operator_auth.lock().map_err(|e|e.to_string())?.as_ref().is_some_and(|auth|auth.identity["enabled"]==true))
        };
        if mode==store::AuthorityMode::SharedV2||v2_active{
            if !refresh_operator_auth_inner(&state,true).await?{return Err("Online operator authentication is required for v2 synchronization".into());}
            let active=state.operator_auth.lock().map_err(|e|e.to_string())?.clone().ok_or("Online operator session is unavailable")?;
            if active.identity["enabled"]==true{
                let acknowledged=flush_native_v2_pending(&state,&active).await?;
                let mut report=sync_native_v2_feed(&state,&active).await?;
                report["acknowledgedCommands"]=json!(acknowledged);
                return Ok(report);
            }
            if mode==store::AuthorityMode::SharedV2{
                return Err("Shared v2 authority is active but this session is not authorized for it. Sign in online again; the legacy upload path is closed.".into());
            }
        }
        sync_inner(&state,&token).await
    }.await;
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
    reject_legacy_business_write_when_v2_active(&state,"Import apply")?;
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
            let thermal_logo=payload.get("thermalLogo");
            let logo_fallback=if thermal_logo.map_or(true,Value::is_null)||!printer::logo_supported(thermal_logo,&profile){Some("Thermal logo is unavailable or exceeds this printer profile; this job uses the text-only receipt.")}else{None};
            // The QR is snapshotted with the receipt. A missing or out-of-profile QR is reported
            // explicitly and never blocks the receipt, the payment or a later reprint.
            let qr=match payload.get("mpesaTillQr"){Some(value) if !value.is_null()&&value["enabled"].as_bool()==Some(true)=>Some(value),_=>None};
            let qr_fallback=if qr.is_some()&&!printer::qr_supported(qr,&profile){Some("M-Pesa Till QR exceeds this printer profile or is unusable; this customer copy printed without it.")}else{None};
            let warnings=[logo_fallback,qr_fallback];
            let note=||format!("{}",warnings.iter().flatten().map(|warning|format!(" {warning}")).collect::<String>());
            let bytes = printer::encode_receipt(&customer, &business, thermal_logo, qr, &profile);
            match printer::send(&profile, &bytes) {
                Ok(message) => ("SENT",format!("{}{}",message,note())),
                Err(printer::SendFailure::Queued(message)) => ("QUEUED",format!("{}{}",message,note())),
                Err(printer::SendFailure::Uncertain(message)) => ("DELIVERY_UNCERTAIN",format!("{}{}",message,note())),
            }
        }
        Err(message) => ("QUEUED", message),
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE receipt_print_jobs SET state=?,message=?,updated_at=? WHERE id=?", rusqlite::params![result.0,result.1,chrono::Utc::now().to_rfc3339(),job_id]).map_err(|e| e.to_string())?;
    Ok(json!({"jobId":job_id,"orderId":order_id,"state":result.0,"message":result.1}))
}

fn queue_printer_job(state: &Runtime, job_id: String, order_id: String, policy: Value, customer_lines: Vec<String>, business_lines: Vec<String>, thermal_logo: Value, mpesa_till_qr: Value) -> store::Result<Value> {
    let payload = json!({"customerLines":customer_lines,"businessLines":business_lines,"thermalLogo":thermal_logo,"mpesaTillQr":mpesa_till_qr});
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
    queue_printer_job(&state, job_id, order_id, policy, customer_lines, business_lines, document["brandingSnapshot"]["thermalLogo"].clone(), document["brandingSnapshot"]["mpesaTillQr"].clone())
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

/// Build the synthetic full-format acceptance receipt content.
///
/// A text-only connection slip only proves the queue or socket is reachable.
/// This exercises the real pipeline: header, contact lines, short and long items,
/// quantity x unit price, discount, VAT, bold TOTAL, split tender, a 20+ item
/// long receipt, the fixed footer, and both copies. The content is clearly
/// marked NOT A SALE and never touches an order, payment or business outbox.
fn printer_acceptance_lines(profile: &printer::PrinterProfile) -> (Vec<String>, Vec<String>) {
    let width = profile.columns;
    let money = |minor: i64| store::receipts::receipt_money(minor, "KES");
    let centered = |text: &str| format!("{text:^width$}");
    let pair = |left: &str, right: &str| {
        if left.len() + right.len() + 1 > width {
            format!("{left}\n{right:>width$}")
        } else {
            format!("{left}{}{right}", " ".repeat(width - left.len() - right.len()))
        }
    };
    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let long_name = "Imported premium single-origin Arabica beans 1kg whole bean roasted";

    let mut customer = vec![
        centered("SERVOS PRINTER ACCEPTANCE - NOT A SALE"),
        centered("CountrySide Business Centre"),
        centered("Nairobi, Kenya"),
        centered("+254 700 000 000"),
        centered("billing@countryside.example"),
        centered("OUTLET: MAIN BAR"),
        centered("CUSTOMER COPY"),
        "Receipt: PRINTER-ACCEPTANCE".to_string(),
        format!("Printed: {stamp}"),
        "Cashier: Acceptance Runner".to_string(),
        "-".repeat(width),
        pair("Item / Qty x Unit", "Amount"),
        "Cola 500ml".to_string(),
        pair(&format!("2 x {}", money(150)), &money(300)),
        "+ no ice".to_string(),
        long_name.to_string(),
        pair(&format!("1 x {}", money(120_000)), &money(120_000)),
        "-".repeat(width),
        pair("Subtotal", &money(120_300)),
        pair("Discount", &format!("-{}", money(5_000))),
        pair("VAT included (16%)", &money(17_800)),
        pair("TOTAL", &money(115_300)),
        "-".repeat(width),
        pair("CASH", &money(60_000)),
        pair("MPESA", &money(55_300)),
        "M-Pesa ref: ACCEPTANCE123".to_string(),
        pair("Cash tendered", &money(60_000)),
        pair("Change", &money(5_200)),
        pair("Paid", &money(115_300)),
        pair("Balance", &money(0)),
        centered("Thank you for your business."),
    ];
    // A 20+ item receipt proves the long path does not corrupt amount alignment.
    for index in 1..=21 {
        customer.push(pair(&format!("{index}. Additional line item"), &money(1_000 + index)));
    }
    for footer in store::receipts::FOOTER {
        customer.push(centered(footer));
    }

    let mut business = vec![
        centered("SERVOS PRINTER ACCEPTANCE - NOT A SALE"),
        centered("BUSINESS RECORD COPY"),
        format!("Printed: {stamp}"),
        "-".repeat(width),
        pair("Items on this slip", "22"),
        pair("Gross", &money(120_300)),
        pair("Discount", &format!("-{}", money(5_000))),
        pair("TOTAL", &money(115_300)),
        pair("Paid", &money(115_300)),
        pair("Balance", &money(0)),
    ];
    for footer in store::receipts::FOOTER {
        business.push(centered(footer));
    }
    (customer, business)
}
/// Print a full-format acceptance receipt and record the settings under test.
#[tauri::command]
fn runtime_printer_acceptance(state: State<Runtime>, token: String) -> store::Result<Value> {
    let policy = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        require_printer_permission(&db, &token, "business.configure")?;
        printer_policy(&db)
    };
    let profile = printer::PrinterProfile::from_policy(&policy)?;
    if !["XP80T_LAN_ESC_POS", "XP80T_USB_ESC_POS"].contains(&profile.mode.as_str()) {
        return Err("Select XP-80T LAN or Windows USB queue mode before sending the acceptance receipt".into());
    }
    let (customer, business) = printer_acceptance_lines(&profile);

    // Reuse the configured branding so the acceptance run exercises the same
    // logo and QR bytes a real receipt would send.
    let (thermal_logo, mpesa_qr) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let branding: Value = db
            .query_row("SELECT data FROM records WHERE collection='property' AND id='property'", [], |r| r.get::<_, String>(0))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or(Value::Null);
        (
            branding.get("receiptThermalLogo").cloned().unwrap_or(Value::Null),
            branding
                .get("receiptMpesaTillQr")
                .filter(|qr| qr["enabled"].as_bool() == Some(true))
                .cloned()
                .unwrap_or(Value::Null),
        )
    };

    let endpoint = if profile.mode == "XP80T_LAN_ESC_POS" {
        format!("tcp {}:{}", profile.host, profile.port)
    } else {
        format!("windows queue {}", profile.queue)
    };
    let settings = json!({
        "kind":"PRINTER_PAPER_OBSERVED",
        "printerMode":profile.mode,
        "endpoint":endpoint,
        "columns":profile.columns,
        "feedLines":profile.feed_lines_before_cut,
        "autoCut":profile.auto_cut,
        "maxQrWidthDots":profile.max_qr_width_dots,
        "maxLogoWidthDots":profile.max_logo_width_dots,
        "acceptedAt":chrono::Utc::now().to_rfc3339(),
        "note":"Synthetic acceptance slip. NOT A SALE. Verify header, amounts, TOTAL emphasis, Till QR scan, footer centering, logo, and the cut between copies.",
    });
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let actor = store::actor(&db, &token, false)?;
        acceptance_insert(&db, &actor, "PRINTER_PAPER_OBSERVED", settings)?;
    }
    queue_printer_job(
        &state,
        uuid::Uuid::new_v4().to_string(),
        "PRINTER_ACCEPTANCE".into(),
        policy,
        customer,
        business,
        thermal_logo,
        mpesa_qr,
    )
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
    queue_printer_job(&state, uuid::Uuid::new_v4().to_string(), "PRINTER_TEST".into(), policy, vec!["SERVOS XP-80T PRINTER TEST".into(),format!("Sent at {stamp}"),"Paper output must be checked at the printer.".into()], vec![], Value::Null, Value::Null)
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
    reject_legacy_business_write_when_v2_active(&state,"Terminal acceptance record")?;
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
                auth_refreshing: Mutex::new(false),
                startup_nonce: uuid::Uuid::new_v4().to_string(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            runtime_set_authority_mode,
            runtime_v2_cutover_manifest,
            runtime_v2_cutover_page,
            runtime_resolve_legacy_outbox,
            runtime_intake_save,
            runtime_intake_complete,
            runtime_intake_reopen,
            runtime_intake_clear,
            runtime_login,
            runtime_login_offline,
            runtime_refresh_operator_auth,
            runtime_v2_install_snapshot,
            runtime_v2_sync_replica,
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
            runtime_printer_acceptance,
            runtime_printer_retry,
            runtime_printer_jobs
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start ServOS");
}
