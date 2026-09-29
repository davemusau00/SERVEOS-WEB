use serde_json::Value;
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

pub fn encode_receipt(customer: &[String], business: &[String], profile: &PrinterProfile) -> Vec<u8> {
    let mut bytes = vec![0x1b, b'@'];
    append_copy(&mut bytes, customer, profile);
    append_copy(&mut bytes, business, profile);
    bytes
}

fn append_copy(bytes: &mut Vec<u8>, lines: &[String], profile: &PrinterProfile) {
    if lines.is_empty() { return; }
    bytes.extend_from_slice(&[0x1b, b'a', 0]);
    for line in lines {
        let footer = ["Built By Davemusau.co.ke", "info@davemusau.co.ke", "0746157440"].contains(&line.trim());
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
    if profile.auto_cut {
        bytes.extend_from_slice(b"\n\n\n");
        // ESC/POS GS V 0 selects a full cut on compatible auto-cutter models.
        bytes.extend_from_slice(&[0x1d, b'V', 0]);
    } else {
        bytes.extend_from_slice(b"\n\n\n");
    }
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
        PrinterProfile { mode: "XP80T_LAN_ESC_POS".into(), host: "192.168.1.50".into(), port: 9100, queue: String::new(), columns: 48, auto_cut: true }
    }

    #[test]
    fn receipt_contains_two_individually_cut_copies() {
        let profile = lan_profile();
        let bytes = encode_receipt(&["CUSTOMER COPY".into()], &["BUSINESS RECORD COPY".into()], &profile);
        assert!(bytes.windows(b"CUSTOMER COPY".len()).any(|part| part == b"CUSTOMER COPY"));
        assert!(bytes.windows(b"BUSINESS RECORD COPY".len()).any(|part| part == b"BUSINESS RECORD COPY"));
        assert_eq!(bytes.windows(3).filter(|part| *part == &[0x1d, b'V', 0]).count(), 2);
    }

    #[test]
    fn receipt_wraps_at_configured_width_and_replaces_non_ascii() {
        let mut profile = lan_profile();
        profile.columns = 24;
        profile.auto_cut = false;
        let bytes = encode_receipt(&["KES 1,234.00 café with a long item name".into()], &[], &profile);
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
        let expected = encode_receipt(&["TEST".into()], &[], &profile);
        assert!(send_tcp(address, &expected).is_ok());
        assert_eq!(receiver.join().unwrap(), expected);
    }
}
