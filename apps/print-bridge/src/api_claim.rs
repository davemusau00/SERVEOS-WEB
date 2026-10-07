use crate::actions::{BridgeAction, PrinterRole, ValidatedAction};
use crate::auth::{public_key, PublicJwk, VerifiedRequest};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApiClaims {
    protocol_version: u8,
    business_id: String,
    device_id: String,
    staff_id: String,
    bridge_id: String,
    job_id: String,
    job_version: i64,
    attempt: i64,
    document_id: String,
    document_type: String,
    document_number: String,
    layout_version: u32,
    document_hash: String,
    printer_role: PrinterRole,
    copies: u8,
    command_id: String,
    issued_at_unix: i64,
    expires_at_unix: i64,
}
/// A pin comes from trusted installer configuration, never the request envelope.
pub struct ApiAuthority {
    key_id: String,
    key: VerifyingKey,
}
pub struct AuthorizedSubmit {
    action: ValidatedAction,
    claims: ApiClaims,
}
fn id(value: &str) -> bool {
    Uuid::parse_str(value)
        .map(|id| id.to_string() == value)
        .unwrap_or(false)
}
impl ApiAuthority {
    pub fn from_pinned_key(key_id: String, jwk: PublicJwk) -> Result<Self, String> {
        if key_id.is_empty()
            || key_id.len() > 80
            || !key_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        {
            return Err("Invalid pinned API key version".into());
        }
        Ok(Self {
            key_id,
            key: public_key(jwk)?,
        })
    }
    pub fn authorize(
        &self,
        request: &VerifiedRequest,
        action: ValidatedAction,
        now_unix: i64,
    ) -> Result<AuthorizedSubmit, String> {
        if request.fingerprint() != action.fingerprint() {
            return Err("Action does not belong to this verified device request".into());
        }
        let (job_id, version, role, copies, document, authorization) = match action.action() {
            BridgeAction::Submit {
                job_id,
                claimed_job_revision,
                printer_role,
                copies,
                document,
                authorization,
            } => (
                job_id,
                *claimed_job_revision,
                *printer_role,
                *copies,
                document,
                authorization,
            ),
            _ => return Err("API print authorization requires submit".into()),
        };
        if authorization.key_id != self.key_id
            || authorization.payload_json.len() > 8192
            || authorization.signature.len() > 128
        {
            return Err("API claim key or envelope bounds are invalid".into());
        }
        let signature = URL_SAFE_NO_PAD
            .decode(&authorization.signature)
            .map_err(|_| "Invalid API claim signature encoding")?;
        let signature =
            Signature::from_slice(&signature).map_err(|_| "Invalid API claim P1363 signature")?;
        let signed = format!(
            "SERVOS_API_PRINT_CLAIM_V1\n{}\n{}",
            authorization.key_id, authorization.payload_json
        );
        self.key
            .verify(signed.as_bytes(), &signature)
            .map_err(|_| "API claim signature did not verify")?;
        let claims: ApiClaims = serde_json::from_str(&authorization.payload_json)
            .map_err(|_| "Invalid API claim fields")?;
        let duration = claims
            .expires_at_unix
            .checked_sub(claims.issued_at_unix)
            .ok_or("Invalid API claim window")?;
        if claims.protocol_version != 1
            || !(1..=120).contains(&duration)
            || claims.issued_at_unix > now_unix.saturating_add(30)
            || claims.expires_at_unix < now_unix
            || claims.attempt < 1
            || claims.job_version < 1
            || ![
                &claims.staff_id,
                &claims.command_id,
                &claims.job_id,
                &claims.document_id,
            ]
            .iter()
            .all(|value| id(value))
        {
            return Err("API claim identity, attempt or validity window is invalid".into());
        }
        if claims.business_id != request.business_id()
            || claims.device_id != request.device_id()
            || claims.bridge_id != request.bridge_id()
            || claims.job_id != *job_id
            || claims.job_version != version
            || claims.printer_role != role
            || claims.copies != copies
            || claims.document_id != document.id
            || claims.document_type != document.document_type
            || claims.document_number != document.document_number
            || claims.layout_version != document.layout_version
            || claims.document_hash != document.hash
        {
            return Err(
                "API claim does not authorize this device/job/document/role/copy selection".into(),
            );
        }
        Ok(AuthorizedSubmit { action, claims })
    }
}
impl AuthorizedSubmit {
    pub fn action(&self) -> &ValidatedAction {
        &self.action
    }
    pub fn job_version(&self) -> i64 {
        self.claims.job_version
    }
    pub fn attempt(&self) -> i64 {
        self.claims.attempt
    }
    pub fn expires_at_unix(&self) -> i64 {
        self.claims.expires_at_unix
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LiveCheck {
    protocol_version: u8,
    claim_hash: String,
    active: bool,
    checked_at_unix: i64,
    expires_at_unix: i64,
}
/// Ephemeral observation proof, never a durable lease or physical-delivery acknowledgement.
pub struct FreshSubmit {
    authorized: AuthorizedSubmit,
    expires_at_unix: i64,
    observed: std::time::Instant,
    max_age: std::time::Duration,
}
impl ApiAuthority {
    pub fn verify_live_check(
        &self,
        authorized: AuthorizedSubmit,
        response: crate::actions::ApiAuthorization,
        now_unix: i64,
    ) -> Result<FreshSubmit, String> {
        if response.key_id != self.key_id
            || response.payload_json.len() > 4096
            || response.signature.len() > 128
        {
            return Err("Live check key or response bounds are invalid".into());
        }
        let bytes = URL_SAFE_NO_PAD
            .decode(&response.signature)
            .map_err(|_| "Invalid live check signature encoding")?;
        let signature =
            Signature::from_slice(&bytes).map_err(|_| "Invalid live check signature")?;
        let message = format!(
            "SERVOS_API_PRINT_CHECK_V1\n{}\n{}",
            response.key_id, response.payload_json
        );
        self.key
            .verify(message.as_bytes(), &signature)
            .map_err(|_| "Live claim check signature did not verify")?;
        let check: LiveCheck = serde_json::from_str(&response.payload_json)
            .map_err(|_| "Invalid live claim check fields")?;
        let duration = check
            .expires_at_unix
            .checked_sub(check.checked_at_unix)
            .ok_or("Invalid live check interval")?;
        if check.protocol_version != 1
            || !check.active
            || !(1..=5).contains(&duration)
            || check.checked_at_unix > now_unix.saturating_add(1)
            || check.expires_at_unix <= now_unix
            || check.expires_at_unix > authorized.expires_at_unix()
        {
            return Err("Claim is inactive or its live observation expired; synchronize and review before transport".into());
        }
        let token = authorized.authorization();
        let hash = format!("{:x}", Sha256::digest(token.payload_json.as_bytes()));
        if check.claim_hash != hash {
            return Err("Live check belongs to a different API claim".into());
        }
        let max_age =
            std::time::Duration::from_secs((check.expires_at_unix - now_unix).min(5) as u64);
        Ok(FreshSubmit {
            authorized,
            expires_at_unix: check.expires_at_unix,
            observed: std::time::Instant::now(),
            max_age,
        })
    }
}
impl AuthorizedSubmit {
    pub fn authorization(&self) -> &crate::actions::ApiAuthorization {
        match self.action.action() {
            BridgeAction::Submit { authorization, .. } => authorization,
            _ => unreachable!("AuthorizedSubmit only contains submit"),
        }
    }
}
impl FreshSubmit {
    /// Check immediately before opening transport; monotonic age also guards wall-clock rollback.
    pub fn ensure_fresh(&self, now_unix: i64) -> Result<(), String> {
        if now_unix >= self.expires_at_unix
            || now_unix >= self.authorized.expires_at_unix()
            || self.observed.elapsed() >= self.max_age
        {
            return Err("Live print claim observation expired before transport".into());
        }
        Ok(())
    }
    pub fn action(&self) -> &ValidatedAction {
        self.authorized.action()
    }
    pub fn api_attempt(&self) -> i64 {
        self.authorized.attempt()
    }
    pub fn claim_payload(&self) -> &str {
        &self.authorized.authorization().payload_json
    }
}
