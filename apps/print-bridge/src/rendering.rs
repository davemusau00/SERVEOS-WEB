use crate::actions::{BridgeAction, PrinterRole, ValidatedAction};
use chrono::{DateTime, FixedOffset};
use serde_json::Value;
use servos_printer_transport::{encode_document, PrinterProfile};
use uuid::Uuid;

/// Renderer output only; it does not prove API issuance or authorize transport.
pub struct PreparedDocument {
    pub(crate) lines: Vec<String>,
    pub(crate) logo: Option<String>,
    pub(crate) qr: Option<String>,
    pub(crate) footer_start: Option<usize>,
}
impl PreparedDocument {
    pub fn encode(&self, profile: &PrinterProfile) -> Result<Vec<u8>, String> {
        {
            let logo = self
                .logo
                .as_deref()
                .map(|image| crate::images::raster(image, false, profile))
                .transpose()?;
            let qr = self
                .qr
                .as_deref()
                .map(|image| crate::images::raster(image, true, profile))
                .transpose()?;
            match self.footer_start {
                Some(footer) => servos_printer_transport::encode_document_at_footer(
                    &self.lines,
                    footer,
                    logo.as_ref(),
                    qr.as_ref(),
                    profile,
                ),
                None => encode_document(&self.lines, logo.as_ref(), qr.as_ref(), profile),
            }
        }
    }
    pub fn lines(&self) -> &[String] {
        &self.lines
    }
}
fn text(value: &Value, key: &str, max: usize, required: bool) -> Result<String, String> {
    let raw = match value.get(key) {
        None | Some(Value::Null) if !required => return Ok(String::new()),
        Some(Value::String(raw)) => raw,
        _ => return Err(format!("Ticket {key} must be text")),
    };
    if raw.chars().count() > max
        || raw.chars().any(|c| c.is_control())
        || required && raw.trim().is_empty()
    {
        return Err(format!(
            "Ticket {key} is empty, excessive or contains control codes"
        ));
    }
    Ok(raw.trim().to_string())
}
fn identity(value: &Value, key: &str) -> Result<String, String> {
    let raw = text(value, key, 36, true)?;
    let parsed = Uuid::parse_str(&raw).map_err(|_| format!("Ticket {key} is not a UUID"))?;
    if parsed.to_string() != raw {
        return Err(format!("Ticket {key} is not canonical"));
    }
    Ok(raw)
}
/// Strict initial bridge renderer for existing immutable KOT/BOT layout version 1.
pub fn prepare_preparation_ticket(input: &ValidatedAction) -> Result<PreparedDocument, String> {
    let (document, role) = match input.action() {
        BridgeAction::Submit {
            document,
            printer_role,
            ..
        } => (document, *printer_role),
        _ => return Err("Rendering requires a submit action".into()),
    };
    let (route, title) =
        match document.document_type.as_str() {
            "KOT" if role == PrinterRole::Kitchen => ("KITCHEN", "KITCHEN ORDER TICKET"),
            "BOT" if role == PrinterRole::Bar => ("BAR", "BAR ORDER TICKET"),
            _ => return Err(
                "This renderer supports kitchen/bar tickets on their matching station role only"
                    .into(),
            ),
        };
    let snapshot: Value = serde_json::from_str(&document.canonical_snapshot)
        .map_err(|_| "Invalid immutable ticket snapshot")?;
    let order_id = identity(&snapshot, "orderId")?;
    let outlet_id = identity(&snapshot, "outletId")?;
    let staff_id = identity(&snapshot, "staffId")?;
    identity(&snapshot, "deviceId")?;
    let issued = text(&snapshot, "issuedAt", 40, true)?;
    let at = DateTime::parse_from_rfc3339(&issued).map_err(|_| "Invalid ticket issue time")?;
    let local =
        at.with_timezone(&FixedOffset::east_opt(3 * 3600).ok_or("Invalid local time zone")?);
    let mut lines = vec![
        title.to_string(),
        document.document_number.clone(),
        local.format("%Y-%m-%d %H:%M:%S EAT").to_string(),
        format!("Order: {}", text(&snapshot, "orderName", 120, true)?),
        format!("Order ID: {order_id}"),
        format!("Outlet: {outlet_id}"),
        format!("Staff: {staff_id}"),
    ];
    let destination = text(&snapshot, "serviceDestination", 80, true)?;
    lines.push(format!("Service: {destination}"));
    let reference = text(&snapshot, "serviceReference", 160, false)?;
    if !reference.is_empty() {
        lines.push(format!("Reference: {reference}"));
    }
    let items = snapshot
        .get("items")
        .and_then(Value::as_array)
        .ok_or("Ticket items must be a list")?;
    if items.is_empty() || items.len() > 500 {
        return Err("Ticket requires 1 to 500 fired items".into());
    }
    let mut ids = std::collections::HashSet::new();
    for item in items {
        let id = identity(item, "id")?;
        if !ids.insert(id) {
            return Err("Ticket line identity repeats".into());
        }
        if text(item, "routeTo", 20, true)? != route
            || text(item, "state", 20, true)? != "FIRED"
            || item.get("stockFired").and_then(Value::as_bool) != Some(true)
        {
            return Err("Ticket line must be fired at the matching station".into());
        }
        let quantity = item
            .get("quantity")
            .and_then(Value::as_f64)
            .ok_or("Ticket quantity must be numeric")?;
        if !quantity.is_finite()
            || quantity <= 0.0
            || quantity > 1_000_000.0
            || (quantity * 1_000_000.0 - (quantity * 1_000_000.0).round()).abs() > 0.0001
        {
            return Err("Ticket quantity exceeds supported precision/range".into());
        }
        let formatted = format!("{quantity:.6}");
        let formatted = formatted.trim_end_matches('0').trim_end_matches('.');
        lines.push("--------------------------------".into());
        lines.push(format!(
            "{} x {}",
            formatted,
            text(item, "name", 160, true)?
        ));
        if let Some(portion) = item.get("portionSnapshot").filter(|value| !value.is_null()) {
            lines.push(format!("Portion: {}", text(portion, "name", 100, true)?));
        }
        let course = text(item, "courseName", 80, false)?;
        if !course.is_empty() {
            lines.push(format!("Course: {course}"));
        }
        if let Some(round) = item.get("roundNo").filter(|value| !value.is_null()) {
            let round = round
                .as_u64()
                .filter(|n| (1..=1000000).contains(n))
                .ok_or("Invalid ticket round")?;
            lines.push(format!("Round: {round}"));
        }
        let modifiers = item
            .get("modifierSnapshots")
            .and_then(Value::as_array)
            .ok_or("Ticket modifier snapshots must be a list")?;
        if modifiers.len() > 50 {
            return Err("Ticket modifier list exceeds bounds".into());
        }
        for modifier in modifiers {
            lines.push(format!("Option: {}", text(modifier, "name", 100, true)?));
        }
        let notes = match item.get("notes") {
            None | Some(Value::Null) => "",
            Some(Value::String(value)) => value.as_str(),
            _ => return Err("Ticket notes must be text".into()),
        };
        if notes.chars().count() > 500 || notes.chars().any(|c| c.is_control() && c != '\n') {
            return Err("Ticket preparation notes exceed bounds or contain control codes".into());
        }
        if !notes.is_empty() {
            for note in notes.split('\n') {
                lines.push(format!("Note: {note}"));
            }
        }
    }
    lines.push("--------------------------------".into());
    Ok(PreparedDocument {
        lines,
        logo: None,
        qr: None,
        footer_start: None,
    })
}

/// Dispatch only implemented immutable layouts; unsupported types require browser fallback.
pub fn prepare_document(input: &ValidatedAction) -> Result<PreparedDocument, String> {
    let kind = match input.action() {
        BridgeAction::Submit { document, .. } => document.document_type.as_str(),
        _ => return Err("Rendering requires submit".into()),
    };
    match kind {
        "SUPPLIER_RETURN_NOTE" => crate::supplier_return_rendering::prepare_supplier_return(input),
        "SUPPLIER_PAYMENT_VOUCHER" => {
            crate::supplier_payment_rendering::prepare_supplier_payment(input)
        }
        "GOODS_RECEIPT" => crate::goods_receipt_rendering::prepare_goods_receipt(input),
        "PURCHASE_ORDER" => crate::purchase_order_rendering::prepare_purchase_order(input),
        "CLOSE_DAY_REPORT" => crate::close_day_rendering::prepare_close_day(input),
        "CUSTOMER_CREDIT_INVOICE"
        | "CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT"
        | "CUSTOMER_CREDIT_WRITE_OFF_NOTICE"
        | "CUSTOMER_CREDIT_REVERSAL_NOTICE" => {
            crate::customer_credit_rendering::prepare_customer_credit(input)
        }
        "SALES_RECEIPT" | "PAYMENT_ACKNOWLEDGEMENT" | "REFUND_RECEIPT" => {
            crate::financial_rendering::prepare_financial_document(input)
        }
        "KOT" | "BOT" => prepare_preparation_ticket(input),
        "KOT_CANCEL" | "BOT_CANCEL" | "ORDER_VOID_NOTICE" => prepare_void_notice(input),
        _ => Err("This document needs a dedicated bridge renderer; use browser fallback".into()),
    }
}
pub fn prepare_void_notice(input: &ValidatedAction) -> Result<PreparedDocument, String> {
    let (document, role) = match input.action() {
        BridgeAction::Submit {
            document,
            printer_role,
            ..
        } => (document, *printer_role),
        _ => return Err("Rendering requires submit".into()),
    };
    let (route, title) = match document.document_type.as_str() {
        "KOT_CANCEL" if role == PrinterRole::Kitchen => (Some("KITCHEN"), "KITCHEN CANCELLATION"),
        "BOT_CANCEL" if role == PrinterRole::Bar => (Some("BAR"), "BAR CANCELLATION"),
        "ORDER_VOID_NOTICE" if role == PrinterRole::Office => (None, "ORDER VOID NOTICE"),
        _ => return Err("Void/cancellation notice must use its matching printer role".into()),
    };
    let snapshot: Value =
        serde_json::from_str(&document.canonical_snapshot).map_err(|_| "Invalid void snapshot")?;
    let order_id = identity(&snapshot, "orderId")?;
    let staff_id = identity(&snapshot, "staffId")?;
    let issued = text(&snapshot, "issuedAt", 40, true)?;
    let at = DateTime::parse_from_rfc3339(&issued).map_err(|_| "Invalid void issue time")?;
    let local =
        at.with_timezone(&FixedOffset::east_opt(3 * 3600).ok_or("Invalid local time zone")?);
    let explanation = text(&snapshot, "reason", 500, true)?;
    if explanation.chars().count() < 3 {
        return Err("Void reason is incomplete".into());
    }
    let disposition = text(&snapshot, "disposition", 40, true)?;
    if ![
        "NOT_FIRED",
        "RETURN_SEALED",
        "WASTE",
        "CONSUMED",
        "MANAGER_ADJUSTMENT",
    ]
    .contains(&disposition.as_str())
    {
        return Err("Invalid void stock disposition".into());
    }
    let restored = snapshot
        .get("stockRestored")
        .and_then(Value::as_bool)
        .ok_or("Void stock-restoration evidence is required")?;
    let correction = snapshot
        .get("inventoryCorrectionRequired")
        .and_then(Value::as_bool)
        .ok_or("Void correction evidence is required")?;
    if restored != (disposition == "RETURN_SEALED")
        || correction != (disposition == "MANAGER_ADJUSTMENT")
    {
        return Err("Void stock evidence contradicts its disposition".into());
    }
    let total = snapshot
        .get("originalTotalMinor")
        .and_then(Value::as_u64)
        .filter(|n| *n <= 9007199254740991)
        .ok_or("Void original amount is missing or invalid")?;
    let mut lines = vec![
        title.to_string(),
        "ORDER VOIDED - STOP PREPARATION/SERVICE".into(),
        document.document_number.clone(),
        local.format("%Y-%m-%d %H:%M:%S EAT").to_string(),
        format!("Order: {}", text(&snapshot, "orderName", 120, true)?),
        format!("Order ID: {order_id}"),
        format!("Staff: {staff_id}"),
        format!("Reason: {explanation}"),
        format!("Stock disposition: {disposition}"),
        format!("Original total KES: {}.{:02}", total / 100, total % 100),
    ];
    lines.push(
        if restored {
            "Original sealed bottles returned to stock."
        } else {
            "No automatic stock return."
        }
        .into(),
    );
    if correction {
        lines.push("Separate reviewed inventory correction required.".into());
    }
    let unresolved = snapshot
        .get("unresolvedTicketIds")
        .and_then(Value::as_array)
        .ok_or("Void unresolved ticket evidence must be a list")?;
    if unresolved.len() > 1000 {
        return Err("Void unresolved ticket list exceeds bounds".into());
    }
    let mut unresolved_ids = std::collections::HashSet::new();
    for ticket in unresolved {
        let raw = ticket.as_str().ok_or("Unresolved ticket ID must be text")?;
        let parsed = Uuid::parse_str(raw).map_err(|_| "Invalid unresolved ticket ID")?;
        if parsed.to_string() != raw || !unresolved_ids.insert(raw) {
            return Err("Invalid/repeated unresolved ticket ID".into());
        }
    }
    if !unresolved.is_empty() {
        lines.push(
            "Earlier tickets may have printed. Confirm cancellation with station staff.".into(),
        );
    }
    let items = snapshot
        .get("items")
        .and_then(Value::as_array)
        .ok_or("Void items must be a list")?;
    if items.len() > 500 || route.is_some() && items.is_empty() {
        return Err("Void item count exceeds bounds or cancellation is empty".into());
    }
    let mut ids = std::collections::HashSet::new();
    for item in items {
        let id = identity(item, "id")?;
        if !ids.insert(id) {
            return Err("Void line identity repeats".into());
        }
        let state = text(item, "state", 20, true)?;
        if !["DRAFT", "FIRED"].contains(&state.as_str()) {
            return Err("Void line needs original draft/fired evidence".into());
        }
        if let Some(station) = route {
            if text(item, "routeTo", 20, true)? != station
                || state != "FIRED"
                || item.get("stockFired").and_then(Value::as_bool) != Some(true)
            {
                return Err(
                    "Cancellation item must be an originally fired line at this station".into(),
                );
            }
        }
        let quantity = item
            .get("quantity")
            .and_then(Value::as_f64)
            .ok_or("Void quantity must be numeric")?;
        if !quantity.is_finite()
            || quantity <= 0.0
            || quantity > 1_000_000.0
            || (quantity * 1_000_000.0 - (quantity * 1_000_000.0).round()).abs() > 0.0001
        {
            return Err("Void quantity precision/range is invalid".into());
        }
        let formatted = format!("{quantity:.6}");
        let formatted = formatted.trim_end_matches('0').trim_end_matches('.');
        lines.push("--------------------------------".into());
        lines.push(format!(
            "CANCEL {} x {}",
            formatted,
            text(item, "name", 160, true)?
        ));
        if let Some(portion) = item.get("portionSnapshot").filter(|value| !value.is_null()) {
            lines.push(format!("Portion: {}", text(portion, "name", 100, true)?));
        }
        let course = text(item, "courseName", 80, false)?;
        if !course.is_empty() {
            lines.push(format!("Course: {course}"));
        }
        let modifiers = item
            .get("modifierSnapshots")
            .and_then(Value::as_array)
            .ok_or("Void modifier evidence must be a list")?;
        if modifiers.len() > 50 {
            return Err("Void modifier list exceeds bounds".into());
        }
        for modifier in modifiers {
            lines.push(format!("Option: {}", text(modifier, "name", 100, true)?));
        }
        let notes = match item.get("notes") {
            None | Some(Value::Null) => "",
            Some(Value::String(value)) => value.as_str(),
            _ => return Err("Void notes must be text".into()),
        };
        if notes.chars().count() > 500 || notes.chars().any(|c| c.is_control() && c != '\n') {
            return Err("Void preparation notes exceed bounds or contain control codes".into());
        }
        if !notes.is_empty() {
            for note in notes.split('\n') {
                lines.push(format!("Original note: {note}"));
            }
        }
    }
    lines.push("THIS NOTICE DOES NOT REFUND MONEY.".into());
    Ok(PreparedDocument {
        lines,
        logo: None,
        qr: None,
        footer_start: None,
    })
}
