//! Explicit multiline snapshot fields; printer control codes are never accepted.
use serde_json::Value;
pub fn multiline(value:&Value,key:&str,max:usize)->Result<Vec<String>,String>{
 let raw=match value.get(key){None|Some(Value::Null)=>return Ok(Vec::new()),Some(Value::String(raw))=>raw,_=>return Err(format!("Document {key} must be text"))};
 if raw.chars().count()>max||raw.chars().any(|c|c.is_control()&&c!='\n'&&c!='\r'){return Err(format!("Document {key} exceeds bounds or contains control codes"));}
 let normalized=raw.replace("\r\n","\n");if normalized.contains('\r'){return Err(format!("Document {key} contains unsupported line endings"));}
 Ok(normalized.split('\n').map(str::to_string).collect())
}
