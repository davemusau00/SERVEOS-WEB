//! Printer transport only. No database, business commands, authentication or server.
mod native_transport;
pub use native_transport::{PrinterProfile,SendFailure,send,logo_supported,qr_supported};
use serde_json::Value;

/// Render one bounded document copy through the retained native image/text pipeline.
/// The bridge service must authenticate and verify the signed canonical job first.
/// This function does not accept caller-supplied ESC/POS bytes.
pub fn encode_document(lines:&[String],logo:Option<&Value>,qr:Option<&Value>,profile:&PrinterProfile)->Result<Vec<u8>,String>{
 if lines.is_empty()||lines.len()>2000{return Err("Document requires 1 to 2000 lines".into());}
 let mut size=0usize;
 for line in lines{
  if line.len()>2048||line.chars().any(|character|character.is_control()){return Err("Document lines must be bounded text without control codes".into());}
  size=size.checked_add(line.len()).ok_or("Document text is too large")?;
 }
 if size>256*1024{return Err("Document text exceeds 256 KiB".into());}
 // Invalid raster evidence is refused, never silently dropped from a canonical job.
 if logo.is_some()&&!logo_supported(logo,profile){return Err("Logo raster is not supported by this printer profile".into());}
 if qr.is_some()&&!qr_supported(qr,profile){return Err("QR raster is not supported by this printer profile".into());}
 let bytes=native_transport::encode_receipt(lines,&[],logo,qr,profile);
 if bytes.len()>2*1024*1024{return Err("Rendered document exceeds 2 MiB".into());}
 Ok(bytes)
}
