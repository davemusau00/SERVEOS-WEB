use crate::actions::ApiAuthorization;
use crate::api_claim::{ApiAuthority, AuthorizedSubmit, FreshSubmit};
use std::io::Read;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The origin is installer-approved configuration, never supplied by a document/request.
pub struct ClaimCheckClient {
    client: reqwest::blocking::Client,
    endpoint: url::Url,
}
impl ClaimCheckClient {
    pub fn from_approved_origin(origin: &str) -> Result<Self, String> {
        let url = url::Url::parse(origin).map_err(|_| "Invalid API origin")?;
        if url.scheme() != "https"
            || url.origin().ascii_serialization() != origin
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Claim checks require an exact approved HTTPS API origin".into());
        }
        let endpoint = url
            .join("/v1/print-bridge/check-claim")
            .map_err(|_| "Invalid claim check endpoint")?;
        let client = reqwest::blocking::Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(5))
            .no_proxy()
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { client, endpoint })
    }
    pub fn check(
        &self,
        authority: &ApiAuthority,
        authorized: AuthorizedSubmit,
    ) -> Result<FreshSubmit, String> {
        let response = self
            .client
            .post(self.endpoint.clone())
            .json(authorized.authorization())
            .send()
            .map_err(|_| "Live API claim check is unavailable; nothing may be sent")?;
        if !response.status().is_success() {
            return Err(
                "API refused the live claim check; synchronize and review the original print claim"
                    .into(),
            );
        }
        let mut body = Vec::new();
        response
            .take(16385)
            .read_to_end(&mut body)
            .map_err(|_| "Cannot read live claim check")?;
        if body.len() > 16384 {
            return Err("Live claim response exceeds bounds".into());
        }
        let envelope: ApiAuthorization =
            serde_json::from_slice(&body).map_err(|_| "Invalid live claim response")?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "System clock is invalid")?
            .as_secs();
        let now = i64::try_from(now).map_err(|_| "System clock exceeds supported range")?;
        authority.verify_live_check(authorized, envelope, now)
    }
}
