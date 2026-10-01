use serde_json::Value;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::io::Write;
use std::net::{IpAddr, SocketAddr, TcpStream};
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct PrinterProfile {
    pub mode: String,
    pub host: String,
    pub port: u16,
    pub queue: String,
    pub columns: usize,
    pub max_logo_width_dots: usize,
    pub max_qr_width_dots: usize,
    pub feed_lines_before_cut: usize,
    pub auto_cut: bool,
}

impl PrinterProfile {
    pub fn from_policy(policy: &Value) -> Result<Self, String> {
        let mode = policy["receiptPrinterMode"]
            .as_str()
            .unwrap_or("OS_PRINT")
            .to_string();
        if !["XP80T_LAN_ESC_POS", "XP80T_USB_ESC_POS", "OS_PRINT", "MANUAL"]
            .contains(&mode.as_str())
        {
            return Err("Choose a supported receipt printer mode in Till Setup".into());
        }
        let port = match policy.get("receiptPrinterPort") {
            Some(value) => value.as_u64().ok_or("Printer TCP port must be a whole number")?,
            None => 9100,
        };
        if port == 0 || port > u16::MAX as u64 {
            return Err("Printer TCP port must be between 1 and 65535".into());
        }
        let columns = match policy.get("receiptPaperColumns") {
            Some(value) => value.as_u64().ok_or("Receipt width must be a whole number")?,
            None => 48,
        };
        if !(24..=64).contains(&columns) {
            return Err("Receipt width must be between 24 and 64 columns".into());
        }
        let max_logo_width_dots = match policy.get("receiptMaxLogoWidthDots") {
            Some(value) => value.as_u64().ok_or("Receipt logo width must be a whole number")? as usize,
            None => 576,
        };
        if !(64..=576).contains(&max_logo_width_dots) {
            return Err("Receipt logo width must be between 64 and 576 printer dots".into());
        }
        let max_qr_width_dots = match policy.get("receiptMaxQrWidthDots") {
            Some(value) => value.as_u64().ok_or("Receipt Till QR width must be a whole number")? as usize,
            None => 320,
        };
        if !(64..=320).contains(&max_qr_width_dots) {
            return Err("Receipt Till QR width must be between 64 and 320 printer dots".into());
        }
        let feed_lines_before_cut = match policy.get("receiptFeedLines") {
            Some(value) => value.as_u64().ok_or("Receipt feed margin must be a whole number")? as usize,
            None => 5,
        };
        if !(2..=12).contains(&feed_lines_before_cut){return Err("Receipt feed margin must be between 2 and 12 lines".into());}
        let profile = Self {
            mode,
            host: policy["receiptPrinterHost"]
                .as_str()
                .unwrap_or("")
                .trim()
                .to_string(),
            port: port as u16,
            queue: policy["receiptPrinterQueue"]
                .as_str()
                .unwrap_or("")
                .trim()
                .to_string(),
            columns: columns as usize,
            max_logo_width_dots,
            max_qr_width_dots,
            feed_lines_before_cut,
            auto_cut: policy["receiptAutoCut"].as_bool().unwrap_or(true),
        };
        match profile.mode.as_str() {
            "XP80T_LAN_ESC_POS" => { profile.socket_address()?; }
            "XP80T_USB_ESC_POS" if profile.queue.is_empty() => {
                return Err("Enter the exact Windows printer queue name for USB printing".into());
            }
            "XP80T_USB_ESC_POS" if profile.queue.chars().any(|c| c.is_control() || c == '/' || c == '\\') => {
                return Err("USB printing requires a local Windows queue name".into());
            }
            _ => {}
        }
        Ok(profile)
    }

    fn socket_address(&self) -> Result<SocketAddr, String> {
        let ip: IpAddr = self
            .host
            .parse()
            .map_err(|_| "Enter the XP-80T LAN IPv4/IPv6 address".to_string())?;
        let local = match ip {
            IpAddr::V4(ip) => {
                let o = ip.octets();
                o[0] == 10
                    || (o[0] == 172 && (16..=31).contains(&o[1]))
                    || (o[0] == 192 && o[1] == 168)
                    || (o[0] == 169 && o[1] == 254)
            }
            IpAddr::V6(ip) => {
                (ip.segments()[0] & 0xfe00) == 0xfc00
                    || (ip.segments()[0] & 0xffc0) == 0xfe80
            }
        };
        if !local {
            return Err("Printer address must be on the local network".into());
        }
        Ok(SocketAddr::new(ip, self.port))
    }
}

pub fn encode_receipt(customer: &[String], business: &[String], logo: Option<&Value>, qr: Option<&Value>, profile: &PrinterProfile) -> Vec<u8> {
    let mut bytes = vec![0x1b, b'@'];
    // Customer copy: text, then the Till QR, then the fixed footer already inside `lines`, then the logo.
    append_copy(&mut bytes, customer, profile, logo, qr);
    // Business record copy never carries the customer-facing QR or logo.
    append_copy(&mut bytes, business, profile, None, None);
    bytes
}

fn append_copy(bytes: &mut Vec<u8>, lines: &[String], profile: &PrinterProfile, logo: Option<&Value>, qr: Option<&Value>) {
    if lines.is_empty() { return; }
    bytes.extend_from_slice(&[0x1b, b'a', 0]);
    let footer_texts = ["Built By KINGSFORGE", "info@kingsforge.co.ke", "info@davemusau.co.ke", "0746157440", "Built By Davemusau.co.ke"];
    // The QR sits at the bottom of the transactional receipt, immediately before the fixed footer,
    // so it is emitted just before the first footer line rather than after the whole text block.
    let footer_start = lines.iter().position(|line| footer_texts.contains(&line.trim()));
    for (index, line) in lines.iter().enumerate() {
        if Some(index) == footer_start {
            if let Some(qr) = qr { append_qr(bytes, qr, profile); }
        }
        let footer = footer_texts.contains(&line.trim());
        let bold = line.trim_start().starts_with("TOTAL") || line.trim()=="CUSTOMER COPY" || line.trim()=="BUSINESS RECORD COPY";
        bytes.extend_from_slice(&[0x1b, b'M', if footer {1} else {0}, 0x1b, b'E', if bold {1} else {0}]);
        let printable: String = line
            .chars()
            .map(|c| if c.is_ascii() && !c.is_control() { c } else { '?' })
            .collect();
        for wrapped in wrap_line(&printable, profile.columns) {
            bytes.extend_from_slice(wrapped.as_bytes());
            bytes.push(b'\n');
        }
    }
    bytes.extend_from_slice(&[0x1b,b'M',0,0x1b,b'E',0]);
    if let Some(logo)=logo { append_logo(bytes,logo,profile); }
    // Keep the final logo/footer clear of the cutter; the accepted hardware feed remains a separate gate.
    if profile.auto_cut {
        bytes.extend(std::iter::repeat_n(b'\n',profile.feed_lines_before_cut));
        // ESC/POS GS V 0 selects a full cut on compatible auto-cutter models.
        bytes.extend_from_slice(&[0x1d, b'V', 0]);
    } else {
        bytes.extend(std::iter::repeat_n(b'\n',profile.feed_lines_before_cut));
    }
}

fn append_logo(bytes:&mut Vec<u8>,logo:&Value,profile:&PrinterProfile){
    let Some(width)=logo["width"].as_u64().map(|value|value as usize) else{return};
    let Some(height)=logo["height"].as_u64().map(|value|value as usize) else{return};
    let Some(encoded)=logo["base64"].as_str() else{return};
    if width==0||width>profile.max_logo_width_dots||height==0||height>220||encoded.len()>24_000{return;}
    let Ok(raster)=STANDARD.decode(encoded) else{return};
    let row_bytes=(width+7)/8;
    if raster.len()!=row_bytes*height{return;}
    bytes.extend_from_slice(&[0x1b,b'a',1,0x1d,b'v',b'0',0,
        (row_bytes&0xff) as u8,((row_bytes>>8)&0xff) as u8,
        (height&0xff) as u8,((height>>8)&0xff) as u8]);
    bytes.extend_from_slice(&raster);
    bytes.extend_from_slice(&[0x1b,b'a',0,b'\n']);
}

/// Decode a snapshot QR raster only when it is square and inside the configured printer dot width.
/// Nothing derived from user image data ever becomes a raw printer control byte.
fn decode_qr(qr:&Value,profile:&PrinterProfile)->Option<(usize,usize,Vec<u8>)>{
    let raster=qr["thermalRaster"].as_object()?;
    let width=raster["width"].as_u64()? as usize;
    let height=raster["height"].as_u64()? as usize;
    let encoded=raster["base64"].as_str()?;
    if width==0||width>profile.max_qr_width_dots||height!=width||encoded.len()>24_000{return None;}
    let decoded=STANDARD.decode(encoded).ok()?;
    if decoded.len()!=((width+7)/8)*height{return None;}
    Some((width,height,decoded))
}

/// Center a bounded square QR raster and surround it with explicit blank rows so it never touches the
/// totals above or the fixed footer below. The cutter feed is never reused as the QR's bottom margin.
fn append_qr(bytes:&mut Vec<u8>,qr:&Value,profile:&PrinterProfile){
    let Some((width,height,raster))=decode_qr(qr,profile) else{return};
    let text_dots=profile.columns.clamp(24,64)*8;
    let pad=text_dots.saturating_sub(width)/2;
    let row_bytes=(width+7)/8;
    // ESC/POS GS v 0 is normal-density byte mode: xL/xH and yL/yH bound the raster.
    // Blank rows before and after keep the QR clear of the totals and the footer.
    bytes.extend(std::iter::repeat_n(b'\n',2));
    // Center by moving to an absolute horizontal position, then restore the left margin afterwards.
    bytes.extend_from_slice(&[0x1b,b'a',1,0x1d,b'!',(pad/8) as u8]);
    bytes.extend_from_slice(&[0x1d,b'v',0,0,
        (row_bytes&0xff) as u8,((row_bytes>>8)&0xff) as u8,
        (height&0xff) as u8,((height>>8)&0xff) as u8]);
    bytes.extend_from_slice(&raster);
    bytes.extend_from_slice(&[0x1d,b'!',0,0x1b,b'a',0]);
    bytes.extend(std::iter::repeat_n(b'\n',2));
    bytes.push(b'\n');
}

pub fn qr_supported(qr:Option<&Value>,profile:&PrinterProfile)->bool{
    match qr{Some(value)=>decode_qr(value,profile).is_some(),None=>false}
}

pub fn logo_supported(logo:Option<&Value>,profile:&PrinterProfile)->bool{
    let Some(logo)=logo else{return false};
    let Some(width)=logo["width"].as_u64().map(|value|value as usize) else{return false};
    let Some(height)=logo["height"].as_u64().map(|value|value as usize) else{return false};
    let Some(encoded)=logo["base64"].as_str() else{return false};
    if width==0||width>profile.max_logo_width_dots||height==0||height>220||encoded.len()>24_000{return false;}
    let Ok(raster)=STANDARD.decode(encoded) else{return false};
    raster.len()==((width+7)/8)*height
}

fn wrap_line(line: &str, columns: usize) -> Vec<String> {
    if line.is_empty() { return vec![String::new()]; }
    let mut result = Vec::new();
    let mut remaining = line;
    while remaining.len() > columns {
        let boundary = remaining[..columns]
            .rfind(' ')
            .filter(|index| *index > 0)
            .unwrap_or(columns);
        result.push(remaining[..boundary].to_string());
        remaining = remaining[boundary..].trim_start();
    }
    if !remaining.is_empty() { result.push(remaining.to_string()); }
    result
}

pub enum SendFailure {
    Queued(String),
    Uncertain(String),
}

pub fn send(profile: &PrinterProfile, bytes: &[u8]) -> Result<&'static str, SendFailure> {
    match profile.mode.as_str() {
        "XP80T_LAN_ESC_POS" => {
            let address = profile.socket_address().map_err(SendFailure::Queued)?;
            send_tcp(address, bytes)
        }
        "XP80T_USB_ESC_POS" => send_windows_raw(&profile.queue, bytes),
        _ => Err(SendFailure::Queued("Select an XP-80T direct printer mode before sending a native print job".into())),
    }
}

fn send_tcp(address: SocketAddr, bytes: &[u8]) -> Result<&'static str, SendFailure> {
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))
        .map_err(|e| SendFailure::Queued(format!("Could not connect to printer: {e}")))?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    stream
        .write_all(bytes)
        .map_err(|e| SendFailure::Uncertain(format!("Connection opened but receipt delivery is uncertain: {e}")))?;
    Ok("LAN socket accepted the receipt data; physical paper output is not acknowledged by this protocol.")
}

#[cfg(windows)]
fn send_windows_raw(queue: &str, bytes: &[u8]) -> Result<&'static str, SendFailure> {
    use std::{ffi::c_void, ptr};
    type Handle = *mut c_void;
    #[repr(C)]
    struct DocInfo1W {
        document_name: *mut u16,
        output_file: *mut u16,
        data_type: *mut u16,
    }
    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterW(name: *mut u16, handle: *mut Handle, defaults: *mut c_void) -> i32;
        fn ClosePrinter(handle: Handle) -> i32;
        fn StartDocPrinterW(handle: Handle, level: u32, info: *mut u8) -> u32;
        fn EndDocPrinter(handle: Handle) -> i32;
        fn StartPagePrinter(handle: Handle) -> i32;
        fn EndPagePrinter(handle: Handle) -> i32;
        fn WritePrinter(handle: Handle, data: *const c_void, count: u32, written: *mut u32) -> i32;
    }

    let mut name: Vec<u16> = queue.encode_utf16().collect();
    if name.is_empty() || name.contains(&0) { return Err(SendFailure::Queued("Windows printer queue name is invalid".into())); }
    name.push(0);
    let mut handle: Handle = ptr::null_mut();
    // SAFETY: the queue name and output handle remain valid for the duration of each Winspool call.
    let opened = unsafe { OpenPrinterW(name.as_mut_ptr(), &mut handle, ptr::null_mut()) };
    if opened == 0 { return Err(SendFailure::Queued(format!("Could not open Windows printer queue: {}", std::io::Error::last_os_error()))); }
    let mut document: Vec<u16> = "ServOS receipt".encode_utf16().chain(std::iter::once(0)).collect();
    let mut raw: Vec<u16> = "RAW".encode_utf16().chain(std::iter::once(0)).collect();
    let mut info = DocInfo1W { document_name: document.as_mut_ptr(), output_file: ptr::null_mut(), data_type: raw.as_mut_ptr() };
    // SAFETY: the DOC_INFO_1W strings live until EndDocPrinter and have the expected UTF-16 NUL termination.
    let doc = unsafe { StartDocPrinterW(handle, 1, &mut info as *mut _ as *mut u8) };
    if doc == 0 { unsafe { ClosePrinter(handle); } return Err(SendFailure::Queued(format!("Windows spooler rejected the print job: {}", std::io::Error::last_os_error()))); }
    // SAFETY: all Winspool calls use a handle returned by OpenPrinterW and byte buffers valid for each call.
    let page_started = unsafe { StartPagePrinter(handle) } != 0;
    if !page_started {
        unsafe { EndDocPrinter(handle); ClosePrinter(handle); }
        return Err(SendFailure::Uncertain(format!("Windows spooler started the job but failed to start its page: {}", std::io::Error::last_os_error())));
    }
    let mut written = 0u32;
    let wrote = unsafe { WritePrinter(handle, bytes.as_ptr() as *const c_void, bytes.len().min(u32::MAX as usize) as u32, &mut written) } != 0;
    let page_ended = unsafe { EndPagePrinter(handle) } != 0;
    let doc_ended = unsafe { EndDocPrinter(handle) } != 0;
    unsafe { ClosePrinter(handle); }
    if !wrote || written != bytes.len() as u32 || !page_ended || !doc_ended {
        return Err(SendFailure::Uncertain(format!("Windows spooler may have accepted part of the job ({written}/{} bytes). Check the printer before retrying.", bytes.len())));
    }
    Ok("Windows spooler accepted the receipt data; physical paper output is not acknowledged by the spooler.")
}

#[cfg(not(windows))]
fn send_windows_raw(_queue: &str, _bytes: &[u8]) -> Result<&'static str, SendFailure> {
    Err(SendFailure::Queued("Direct XP-80T USB queue printing is currently supported by the Windows native app only".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::net::TcpListener;
    use std::thread;

    fn lan_profile() -> PrinterProfile {
        PrinterProfile { mode: "XP80T_LAN_ESC_POS".into(), host: "192.168.1.50".into(), port: 9100, queue: String::new(), columns: 48, max_logo_width_dots:576, max_qr_width_dots:320, feed_lines_before_cut:5, auto_cut: true }
    }

    /// A square 16-dot raster (2 bytes per row) with an all-zero body, plus a matching PNG data URL.
    fn qr() -> Value {
        let raster = STANDARD.encode(vec![0u8; (16 + 7) / 8 * 16]);
        serde_json::json!({"enabled":true,"dataUrl":"data:image/png;base64,AA==","thermalRaster":{"width":16,"height":16,"base64":raster}})
    }

    /// Byte offsets of the first footer line and the first cut command.
    fn footer_and_cut(bytes: &[u8]) -> (usize, usize) {
        let at = |needle: &[u8]| bytes.windows(needle.len()).position(|part| part == needle).unwrap_or(usize::MAX);
        (at(b"Built By KINGSFORGE"), at(&[0x1d, b'V', 0]))
    }

    #[test]
    fn receipt_contains_two_individually_cut_copies() {
        let profile = lan_profile();
        let bytes = encode_receipt(&["CUSTOMER COPY".into()], &["BUSINESS RECORD COPY".into()], None, None, &profile);
        assert!(bytes.windows(b"CUSTOMER COPY".len()).any(|part| part == b"CUSTOMER COPY"));
        assert!(bytes.windows(b"BUSINESS RECORD COPY".len()).any(|part| part == b"BUSINESS RECORD COPY"));
        assert_eq!(bytes.windows(3).filter(|part| *part == &[0x1d, b'V', 0]).count(), 2);
    }

    #[test]
    fn receipt_wraps_at_configured_width_and_replaces_non_ascii() {
        let mut profile = lan_profile();
        profile.columns = 24;
        profile.auto_cut = false;
        let bytes = encode_receipt(&["KES 1,234.00 café with a long item name".into()], &[], None, None, &profile);
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("caf?"));
        assert!(text.contains("\n\n\n"));
        assert!(text.lines().all(|line| line.len() <= 24 || line.starts_with('\u{1b}')));
    }

    #[test]
    fn lan_profile_rejects_public_addresses() {
        let mut profile = lan_profile();
        profile.host = "8.8.8.8".into();
        assert!(profile.socket_address().is_err());
    }

    #[test]
    fn lan_transport_sends_receipt_bytes_to_tcp_9100_style_socket() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let receiver = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut bytes = Vec::new();
            stream.read_to_end(&mut bytes).unwrap();
            bytes
        });
        let mut profile = lan_profile();
        profile.host = address.ip().to_string();
        profile.port = address.port();
        let expected = encode_receipt(&["TEST".into()], &[], None, None, &profile);
        assert!(send_tcp(address, &expected).is_ok());
        assert_eq!(receiver.join().unwrap(), expected);
    }

    fn customer_lines() -> Vec<String> {
        vec![
            "CUSTOMER COPY".into(),
            "TOTAL: KES 250.00".into(),
            "Thank you for your business.".into(),
            "Built By KINGSFORGE".into(),
            "info@kingsforge.co.ke".into(),
            "info@davemusau.co.ke".into(),
            "0746157440".into(),
        ]
    }

    /// The QR is the last customer-facing block before the fixed footer, and the footer precedes the cut.
    #[test]
    fn till_qr_prints_after_thank_you_and_before_the_fixed_footer() {
        let profile = lan_profile();
        let bytes = encode_receipt(&customer_lines(), &["BUSINESS RECORD COPY".into()], None, Some(&qr()), &profile);
        let text = String::from_utf8_lossy(&bytes);
        let (footer, cut) = footer_and_cut(&bytes);
        let raster = bytes.windows(6).position(|part| part == &[0x1d, b'v', 0, 0, 2, 0]).unwrap();
        assert!(raster < footer, "QR raster must precede the fixed footer");
        assert!(text.find("Thank you").unwrap() < raster);
        assert!(footer < cut, "footer must precede the cutter feed");
    }

    /// The business record copy never carries the customer-facing QR.
    #[test]
    fn business_record_copy_omits_the_till_qr() {
        let profile = lan_profile();
        let bytes = encode_receipt(&customer_lines(), &customer_lines(), None, Some(&qr()), &profile);
        // Exactly one raster: the second copy received `None`.
        assert_eq!(bytes.windows(6).filter(|part| *part == &[0x1d, b'v', 0, 0, 2, 0]).count(), 1);
    }

    /// No QR configured or configured-but-unsupported leaves a valid, unchanged receipt.
    #[test]
    fn missing_or_unsupported_till_qr_leaves_the_receipt_valid() {
        let profile = lan_profile();
        let plain = encode_receipt(&customer_lines(), &[], None, None, &profile);
        assert!(!qr_supported(None, &profile));
        assert!(plain.windows(b"Built By KINGSFORGE".len()).any(|part| part == b"Built By KINGSFORGE"));

        let oversized = serde_json::json!({"thermalRaster":{"width":600,"height":600,"base64":"AA=="}});
        assert!(!qr_supported(Some(&oversized), &profile));
        let non_square = serde_json::json!({"thermalRaster":{"width":16,"height":32,"base64":"AA=="}});
        assert!(!qr_supported(Some(&non_square), &profile));
        let bytes = encode_receipt(&customer_lines(), &[], None, Some(&oversized), &profile);
        assert_eq!(bytes.windows(6).filter(|part| *part == &[0x1d, b'v', 0, 0, 2, 0]).count(), 0);
    }

    /// The QR raster stays inside the configured printer dot width and honours the accepted feed margin.
    #[test]
    fn till_qr_width_stays_inside_the_printer_profile_and_feeds_after_content() {
        let mut profile = lan_profile();
        let qr_value = qr();
        assert!(qr_supported(Some(&qr_value), &profile));
        let bytes = encode_receipt(&customer_lines(), &[], None, Some(&qr_value), &profile);
        let (_, cut) = footer_and_cut(&bytes);
        // Configured feed lines still follow the final customer-facing content before the cut.
        let trailing = &bytes[cut.saturating_sub(profile.feed_lines_before_cut)..cut];
        assert!(trailing.iter().all(|byte| *byte == b'\n'));
    }

    /// The Till QR width bound is validated exactly like the existing logo bound.
    #[test]
    fn printer_profile_validates_the_till_qr_width() {
        let policy = serde_json::json!({"receiptPrinterMode":"MANUAL","receiptMaxQrWidthDots":700});
        assert!(PrinterProfile::from_policy(&policy).is_err());
        let policy = serde_json::json!({"receiptPrinterMode":"MANUAL","receiptMaxQrWidthDots":300});
        assert_eq!(PrinterProfile::from_policy(&policy).unwrap().max_qr_width_dots, 300);
        let policy = serde_json::json!({"receiptPrinterMode":"MANUAL"});
        assert_eq!(PrinterProfile::from_policy(&policy).unwrap().max_qr_width_dots, 320);
    }
}
