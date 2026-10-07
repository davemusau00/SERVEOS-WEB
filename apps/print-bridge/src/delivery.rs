//! A single authorized attempt. No listener, replay dispatcher or automatic retry.
use crate::{
    actions::BridgeAction, api_claim::FreshSubmit, auth::VerifiedRequest, journal::JobStatus,
    rendering::prepare_document, routing::ConfiguredPrinters, BridgeSession,
};
use servos_printer_transport::{send, SendFailure};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

fn now() -> Result<i64, String> {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid system clock")?
        .as_secs();
    i64::try_from(seconds).map_err(|_| "System clock exceeds supported range".into())
}
/// Stable local identity per authoritative attempt, including after a lost response.
/// An existing identity is evidence to reconcile, never permission to send again.
pub fn local_attempt_id(api_job_id: &str, api_attempt: i64) -> Result<String, String> {
    let namespace = Uuid::parse_str(api_job_id).map_err(|_| "Invalid API job identity")?;
    if namespace.to_string() != api_job_id || api_attempt < 1 {
        return Err("Invalid API attempt identity".into());
    }
    Ok(Uuid::new_v5(
        &namespace,
        format!("SERVOS_PRINT_ATTEMPT_V1:{api_attempt}").as_bytes(),
    )
    .to_string())
}

/// Caller must durably journal the signed request before entering this boundary.
/// Consumes the fresh observation; it cannot be reused for a second send.
/// A returned error after transport requires journal lookup, never blind retry.
pub fn deliver(
    session: &mut BridgeSession,
    printers: &ConfiguredPrinters,
    request: &VerifiedRequest,
    fresh: FreshSubmit,
) -> Result<JobStatus, String> {
    if fresh.action().fingerprint() != request.fingerprint() {
        return Err("Delivery belongs to a different verified request".into());
    }
    fresh.ensure_fresh(now()?)?;
    let (job_id, role, copies) = match fresh.action().action() {
        BridgeAction::Submit {
            job_id,
            printer_role,
            copies,
            ..
        } => (job_id, *printer_role, *copies),
        _ => return Err("Delivery requires authorized submit".into()),
    };
    let local_id = local_attempt_id(job_id, fresh.api_attempt())?;
    // Fail closed even for a QUEUED job left by an interrupted preparation.
    if session.journal().get(&local_id)?.is_some() {
        return Err(format!("Local attempt {local_id} already exists; reconcile its durable status before any reviewed API retry"));
    }
    let profile = printers.profile(role)?;
    let document = prepare_document(fresh.action())?;
    let copy = document.encode(profile)?;
    let total = copy
        .len()
        .checked_mul(usize::from(copies))
        .ok_or("Print buffer size overflow")?;
    if total > 4 * 1024 * 1024 {
        return Err("Combined print copies exceed 4 MiB".into());
    }
    let mut bytes = Vec::with_capacity(total);
    for _ in 0..copies {
        bytes.extend_from_slice(&copy);
    }
    // The signed claim payload binds immutable document hash, role, copies and API attempt.
    session.journal_mut().link_attempt(request, &local_id)?;
    let queued = session
        .journal_mut()
        .enqueue(&local_id, fresh.claim_payload())?;
    let sending = session
        .journal_mut()
        .begin_send(&local_id, queued.revision)?;
    // Recheck after durable writes and immediately before opening printer transport.
    if fresh.ensure_fresh(now()?).is_err() {
        return session.journal_mut().finish_send(
            &local_id,
            sending.revision,
            "FAILED",
            "Live claim observation expired before opening transport; no output sent",
        );
    }
    let (state, detail) = match send(profile, &bytes) {
        Ok(_) => (
            "SENT_TO_SPOOLER",
            "Transport accepted output; physical delivery is unconfirmed",
        ),
        Err(SendFailure::Queued(_)) => (
            "FAILED",
            "Transport failed before output; review before a new API attempt",
        ),
        Err(SendFailure::Uncertain(_)) => (
            "DELIVERY_UNCERTAIN",
            "Transport may have produced output; operator confirmation required before retry",
        ),
    };
    // If this commit fails, SENDING remains durable and startup marks it uncertain.
    session
        .journal_mut()
        .finish_send(&local_id, sending.revision, state, detail)
}
