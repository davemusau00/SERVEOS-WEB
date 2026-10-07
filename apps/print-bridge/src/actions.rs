use crate::auth::VerifiedRequest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PrinterRole {
    Receipt,
    Kitchen,
    Bar,
    Office,
    Label,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document {
    pub id: String,
    pub document_type: String,
    pub document_number: String,
    pub layout_version: u32,
    pub hash: String,
    pub canonical_snapshot: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApiAuthorization {
    pub key_id: String,
    pub payload_json: String,
    pub signature: String,
}
#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum BridgeAction {
    Submit {
        job_id: String,
        claimed_job_revision: i64,
        printer_role: PrinterRole,
        copies: u8,
        document: Document,
        authorization: ApiAuthorization,
    },
    Status {
        job_id: String,
    },
    RequestStatus {
        original_request_id: String,
    },
    Retry {
        job_id: String,
        expected_revision: i64,
        reason: String,
        possible_duplicate_acknowledged: bool,
    },
    Cancel {
        job_id: String,
        expected_revision: i64,
        reason: String,
    },
}
pub struct ValidatedAction {
    action: BridgeAction,
    fingerprint: String,
}
fn id(value: &str) -> bool {
    Uuid::parse_str(value)
        .map(|id| id.to_string() == value)
        .unwrap_or(false)
}
fn reason(value: &str) -> bool {
    (3..=500).contains(&value.trim().chars().count()) && !value.chars().any(|c| c.is_control())
}
fn bounded_numbers(value: &Value) -> bool {
    match value {
        Value::Number(number) => number
            .as_f64()
            .is_some_and(|value| value.is_finite() && value.abs() <= 9007199254740991.0),
        Value::Array(rows) => rows.iter().all(bounded_numbers),
        Value::Object(fields) => fields.values().all(bounded_numbers),
        _ => true,
    }
}
impl ValidatedAction {
    pub fn parse(request: &VerifiedRequest) -> Result<Self, String> {
        let action: BridgeAction = serde_json::from_str(request.payload_json())
            .map_err(|e| format!("Unsupported or malformed bridge action: {e}"))?;
        match &action {
            BridgeAction::Submit {
                job_id,
                claimed_job_revision,
                copies,
                document,
                ..
            } => {
                if !id(job_id)
                    || !id(&document.id)
                    || *claimed_job_revision < 1
                    || !(1..=2).contains(copies)
                    || document.layout_version != 1
                {
                    return Err(
                        "Print job identity, copies, claim revision or layout is invalid".into(),
                    );
                }
                if ![
                    "SUPPLIER_RETURN_NOTE",
                    "SUPPLIER_PAYMENT_VOUCHER",
                    "GOODS_RECEIPT",
                    "PURCHASE_ORDER",
                    "SALES_RECEIPT",
                    "PAYMENT_ACKNOWLEDGEMENT",
                    "REFUND_RECEIPT",
                    "KOT",
                    "BOT",
                    "KOT_CANCEL",
                    "BOT_CANCEL",
                    "ORDER_VOID_NOTICE",
                    "CLOSE_DAY_REPORT",
                    "CUSTOMER_CREDIT_INVOICE",
                    "CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT",
                    "CUSTOMER_CREDIT_WRITE_OFF_NOTICE",
                    "CUSTOMER_CREDIT_REVERSAL_NOTICE",
                ]
                .contains(&document.document_type.as_str())
                    || document.document_number.is_empty()
                    || document.document_number.len() > 160
                    || document.document_number.chars().any(|c| c.is_control())
                {
                    return Err("Document type/number is not supported".into());
                }
                if document.hash.len() != 64
                    || !document
                        .hash
                        .bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                    || document.canonical_snapshot.is_empty()
                    || document.canonical_snapshot.len() > 768 * 1024
                {
                    return Err("Document hash/snapshot bounds are invalid".into());
                }
                let actual = format!(
                    "{:x}",
                    Sha256::digest(document.canonical_snapshot.as_bytes())
                );
                if actual != document.hash {
                    return Err("Immutable document snapshot hash did not match".into());
                }
                let snapshot: Value = serde_json::from_str(&document.canonical_snapshot)
                    .map_err(|_| "Document snapshot is invalid JSON")?;
                if !snapshot.is_object() || !bounded_numbers(&snapshot) {
                    return Err(
                        "Document snapshot must be an object with supported numeric ranges".into(),
                    );
                }
            }
            BridgeAction::Status { job_id } => {
                if !id(job_id) {
                    return Err("Invalid job ID".into());
                }
            }
            BridgeAction::RequestStatus {
                original_request_id,
            } => {
                if !id(original_request_id) {
                    return Err("Invalid original request ID".into());
                }
            }
            BridgeAction::Retry {
                job_id,
                expected_revision,
                reason: explanation,
                ..
            }
            | BridgeAction::Cancel {
                job_id,
                expected_revision,
                reason: explanation,
            } => {
                if !id(job_id) || *expected_revision < 1 || !reason(explanation) {
                    return Err("Job revision and a bounded review reason are required".into());
                }
            }
        }
        Ok(Self {
            action,
            fingerprint: request.fingerprint().to_string(),
        })
    }
    pub(crate) fn fingerprint(&self) -> &str {
        &self.fingerprint
    }
    pub fn action(&self) -> &BridgeAction {
        &self.action
    }
}
