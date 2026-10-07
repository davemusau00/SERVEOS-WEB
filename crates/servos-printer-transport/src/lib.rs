//! Printer transport only. No database, business commands, authentication or server.
mod native_transport;
pub use native_transport::{logo_supported, qr_supported, send, PrinterProfile, SendFailure};
use serde_json::Value;

/// Render one bounded document copy through the retained native image/text pipeline.
/// The bridge service must authenticate and verify the signed canonical job first.
/// This function does not accept caller-supplied ESC/POS bytes.
pub fn encode_document(
    lines: &[String],
    logo: Option<&Value>,
    qr: Option<&Value>,
    profile: &PrinterProfile,
) -> Result<Vec<u8>, String> {
    let footer_markers = [
        "Built By KINGSFORGE",
        "info@kingsforge.co.ke",
        "info@davemusau.co.ke",
        "0746157440",
        "Built By Davemusau.co.ke",
    ];
    let footer = lines
        .iter()
        .position(|line| footer_markers.contains(&line.trim()))
        .unwrap_or(lines.len());
    encode_document_at_footer(lines, footer, logo, qr, profile)
}
/// Explicit immutable footer boundary for business documents with custom footer text.
pub fn encode_document_at_footer(
    lines: &[String],
    footer: usize,
    logo: Option<&Value>,
    qr: Option<&Value>,
    profile: &PrinterProfile,
) -> Result<Vec<u8>, String> {
    if footer > lines.len() {
        return Err("Invalid document footer boundary".into());
    }
    if lines.is_empty() || lines.len() > 2000 {
        return Err("Document requires 1 to 2000 lines".into());
    }
    let mut size = 0usize;
    for line in lines {
        if line.len() > 2048 || line.chars().any(|character| character.is_control()) {
            return Err("Document lines must be bounded text without control codes".into());
        }
        size = size
            .checked_add(line.len())
            .ok_or("Document text is too large")?;
    }
    if size > 256 * 1024 {
        return Err("Document text exceeds 256 KiB".into());
    }
    // Invalid raster evidence is refused, never silently dropped from a canonical job.
    if logo.is_some() && !logo_supported(logo, profile) {
        return Err("Logo raster is not supported by this printer profile".into());
    }
    if qr.is_some() && !qr_supported(qr, profile) {
        return Err("QR raster is not supported by this printer profile".into());
    }
    if !(24..=64).contains(&profile.columns) || !(2..=12).contains(&profile.feed_lines_before_cut) {
        return Err("Printer width/feed profile is invalid".into());
    }
    let mut bytes = vec![0x1b, b'@'];
    if let Some(image) = logo {
        native_transport::append_logo(&mut bytes, image, profile);
    }
    append_text(&mut bytes, &lines[..footer], profile);
    if let Some(image) = qr {
        append_text(
            &mut bytes,
            &["Scan to Pay via One app".to_string()],
            profile,
        );
        native_transport::append_qr(&mut bytes, image, profile);
    }
    append_text(&mut bytes, &lines[footer..], profile);
    bytes.extend(std::iter::repeat_n(b'\n', profile.feed_lines_before_cut));
    if profile.auto_cut {
        bytes.extend_from_slice(&[0x1d, b'V', 0]);
    }
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Rendered document exceeds 2 MiB".into());
    }
    Ok(bytes)
}

fn append_text(bytes: &mut Vec<u8>, lines: &[String], profile: &PrinterProfile) {
    for line in lines {
        // Normalize before byte-indexed legacy wrapping so UTF-8 boundaries cannot panic.
        let ascii: String = line
            .chars()
            .map(|character| if character.is_ascii() { character } else { '?' })
            .collect();
        for wrapped in native_transport::wrap_line(&ascii, profile.columns) {
            bytes.extend(wrapped.chars().map(|character| {
                if character.is_ascii() {
                    character as u8
                } else {
                    b'?'
                }
            }));
            bytes.push(b'\n');
        }
    }
}
