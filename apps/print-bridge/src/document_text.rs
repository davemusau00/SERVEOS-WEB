//! Explicit multiline snapshot fields; printer control codes are never accepted.
use serde_json::Value;
pub fn multiline(value: &Value, key: &str, max: usize) -> Result<Vec<String>, String> {
    let raw = match value.get(key) {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(Value::String(raw)) => raw,
        _ => return Err(format!("Document {key} must be text")),
    };
    if raw.chars().count() > max
        || raw
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\r')
    {
        return Err(format!(
            "Document {key} exceeds bounds or contains control codes"
        ));
    }
    let normalized = raw.replace("\r\n", "\n");
    if normalized.contains('\r') {
        return Err(format!("Document {key} contains unsupported line endings"));
    }
    Ok(normalized.split('\n').map(str::to_string).collect())
}
/// Read a normalized, bounded PNG data URL from an immutable business snapshot.
pub fn embedded_png(value: &Value, key: &str) -> Result<Option<String>, String> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(raw)) if raw.is_empty() => Ok(None),
        Some(Value::String(raw)) if raw.len() <= 240_000 => {
            let encoded = raw
                .strip_prefix("data:image/png;base64,iVBORw0KGgo")
                .ok_or_else(|| format!("Invalid document {key} PNG signature"))?;
            if encoded.is_empty() || encoded.len() % 4 != 0 {
                return Err(format!("Invalid document {key} PNG encoding"));
            }
            let mut padding = false;
            let mut padding_count = 0;
            for byte in encoded.bytes() {
                if byte == b'=' {
                    padding = true;
                    padding_count += 1;
                    if padding_count > 2 {
                        return Err(format!("Invalid document {key} PNG encoding"));
                    }
                } else if padding || !byte.is_ascii_alphanumeric() && byte != b'+' && byte != b'/' {
                    return Err(format!("Invalid document {key} PNG encoding"));
                }
            }
            Ok(Some(raw.clone()))
        }
        _ => Err(format!("Invalid document {key} PNG snapshot")),
    }
}
