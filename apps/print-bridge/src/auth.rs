use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SignedRequest {
    pub bridge_id: String,
    pub business_id: String,
    pub device_id: String,
    pub origin: String,
    pub request_id: String,
    pub issued_at_unix: i64,
    pub expires_at_unix: i64,
    pub payload_json: String,
    pub signature: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicJwk {
    pub kty: String,
    pub crv: String,
    pub x: String,
    pub y: String,
    pub ext: Option<bool>,
    pub key_ops: Option<Vec<String>>,
    pub alg: Option<String>,
}
/// Loaded from locally approved pairing state, never from the submitted request.
pub struct PairedDevice {
    bridge_id: String,
    business_id: String,
    device_id: String,
    origin: String,
    key: VerifyingKey,
}
pub struct VerifiedRequest {
    request: SignedRequest,
    fingerprint: String,
}
fn canonical_id(value: &str) -> bool {
    Uuid::parse_str(value)
        .map(|id| id.to_string() == value)
        .unwrap_or(false)
}
fn trusted_origin(value: &str) -> bool {
    url::Url::parse(value)
        .map(|url| {
            url.scheme() == "https"
                && url.origin().ascii_serialization() == value
                && url.username().is_empty()
                && url.password().is_none()
        })
        .unwrap_or(false)
}
impl PairedDevice {
    pub fn from_approved_pairing(
        bridge_id: String,
        business_id: String,
        device_id: String,
        origin: String,
        jwk: PublicJwk,
    ) -> Result<Self, String> {
        if ![&bridge_id, &business_id, &device_id]
            .iter()
            .all(|id| canonical_id(id))
            || !trusted_origin(&origin)
        {
            return Err("Pairing identities/origin are invalid".into());
        }
        let key = public_key(jwk)?;
        Ok(Self {
            bridge_id,
            business_id,
            device_id,
            origin,
            key,
        })
    }
    pub fn verify(
        &self,
        http_origin: &str,
        request: SignedRequest,
        now_unix: i64,
    ) -> Result<VerifiedRequest, String> {
        if request.bridge_id != self.bridge_id
            || request.business_id != self.business_id
            || request.device_id != self.device_id
            || request.origin != self.origin
            || http_origin != self.origin
            || !canonical_id(&request.request_id)
        {
            return Err("Request does not match the approved origin/device pairing".into());
        }
        let duration = request
            .expires_at_unix
            .checked_sub(request.issued_at_unix)
            .ok_or("Invalid request validity window")?;
        if !(1..=120).contains(&duration)
            || request.issued_at_unix > now_unix.saturating_add(30)
            || request.expires_at_unix < now_unix
        {
            return Err("Bridge request expired or has an invalid clock window".into());
        }
        if request.payload_json.is_empty()
            || request.payload_json.len() > 1024 * 1024
            || request.signature.len() > 128
        {
            return Err("Bridge request exceeds payload/signature bounds".into());
        }
        let hash = format!("{:x}", Sha256::digest(request.payload_json.as_bytes()));
        let message = format!(
            "SERVOS_PRINT_BRIDGE_V1\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
            request.bridge_id,
            request.business_id,
            request.device_id,
            request.origin,
            request.request_id,
            request.issued_at_unix,
            request.expires_at_unix,
            hash
        );
        let bytes = URL_SAFE_NO_PAD
            .decode(&request.signature)
            .map_err(|_| "Invalid bridge request signature encoding")?;
        let signature = Signature::from_slice(&bytes)
            .map_err(|_| "Bridge signatures must use WebCrypto P1363 format")?;
        self.key
            .verify(message.as_bytes(), &signature)
            .map_err(|_| "Bridge request signature did not verify")?;
        let fingerprint = format!("{:x}", Sha256::digest(message.as_bytes()));
        Ok(VerifiedRequest {
            request,
            fingerprint,
        })
    }
}
impl VerifiedRequest {
    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }
    pub fn bridge_id(&self) -> &str {
        &self.request.bridge_id
    }
    pub fn request_id(&self) -> &str {
        &self.request.request_id
    }
    pub fn payload_json(&self) -> &str {
        &self.request.payload_json
    }
    pub fn business_id(&self) -> &str {
        &self.request.business_id
    }
    pub fn device_id(&self) -> &str {
        &self.request.device_id
    }
}

pub(crate) fn public_key(jwk: PublicJwk) -> Result<VerifyingKey, String> {
    if jwk.kty != "EC"
        || jwk.crv != "P-256"
        || jwk.alg.as_deref().is_some_and(|alg| alg != "ES256")
        || jwk.key_ops.as_ref().is_some_and(|ops| {
            !ops.iter().any(|op| op == "verify") || ops.iter().any(|op| op != "verify")
        })
    {
        return Err("Pairing needs an EC P-256 public verification key".into());
    }
    let x = URL_SAFE_NO_PAD
        .decode(jwk.x)
        .map_err(|_| "Invalid public key coordinate")?;
    let y = URL_SAFE_NO_PAD
        .decode(jwk.y)
        .map_err(|_| "Invalid public key coordinate")?;
    if x.len() != 32 || y.len() != 32 {
        return Err("Invalid P-256 public key length".into());
    }
    let mut point = vec![4u8];
    point.extend(x);
    point.extend(y);
    let key = VerifyingKey::from_sec1_bytes(&point).map_err(|_| "Invalid P-256 public point")?;
    Ok(key)
}
