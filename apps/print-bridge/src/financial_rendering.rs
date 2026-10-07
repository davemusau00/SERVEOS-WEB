//! Immutable financial snapshot formatting. No live price/tax/payment calculations.
use crate::{
    actions::{BridgeAction, PrinterRole, ValidatedAction},
    rendering::PreparedDocument,
};
use chrono::{DateTime, FixedOffset};
use serde_json::Value;
use uuid::Uuid;
fn text(value: &Value, key: &str, required: bool) -> Result<String, String> {
    match value.get(key) {
        None | Some(Value::Null) if !required => Ok(String::new()),
        Some(Value::String(raw))
            if raw.chars().count() <= 500
                && !raw.chars().any(|c| c.is_control())
                && (!required || !raw.trim().is_empty()) =>
        {
            Ok(raw.clone())
        }
        _ => Err(format!("Invalid financial document {key}")),
    }
}
fn identity(value: &Value, key: &str) -> Result<String, String> {
    let raw = text(value, key, true)?;
    if Uuid::parse_str(&raw)
        .map(|id| id.to_string() != raw)
        .unwrap_or(true)
    {
        return Err(format!("Invalid {key} identity"));
    }
    Ok(raw)
}
fn amount(value: &Value, key: &str) -> Result<i64, String> {
    value
        .get(key)
        .and_then(Value::as_i64)
        .filter(|value| (0..=9007199254740991).contains(value))
        .ok_or_else(|| format!("Missing or invalid issued amount {key}"))
}
fn money(value: i64) -> String {
    format!("{}.{:02}", value / 100, value % 100)
}
fn push_text(lines: &mut Vec<String>, value: &Value, key: &str, label: &str) -> Result<(), String> {
    if ["address", "footer"].contains(&key) {
        lines.extend(crate::document_text::multiline(value, key, 2000)?);
        return Ok(());
    }
    let raw = text(value, key, false)?;
    if !raw.is_empty() {
        lines.push(format!("{label}{raw}"));
    }
    Ok(())
}
pub fn prepare_financial_document(input: &ValidatedAction) -> Result<PreparedDocument, String> {
    let (document, role) = match input.action() {
        BridgeAction::Submit {
            document,
            printer_role,
            ..
        } => (document, *printer_role),
        _ => return Err("Financial rendering requires submit".into()),
    };
    if role != PrinterRole::Receipt {
        return Err("Financial documents require the receipt printer role".into());
    }
    let snapshot: Value = serde_json::from_str(&document.canonical_snapshot)
        .map_err(|_| "Invalid immutable financial snapshot")?;
    let title = match document.document_type.as_str() {
        "SALES_RECEIPT" => "SALES RECEIPT",
        "PAYMENT_ACKNOWLEDGEMENT" => "PAYMENT ACKNOWLEDGEMENT",
        "REFUND_RECEIPT" => "REFUND RECEIPT",
        _ => return Err("Unsupported financial layout".into()),
    };
    let business = &snapshot["business"];
    let logo = crate::document_text::embedded_png(business, "logoPngDataUrl")?;
    let qr = if document.document_type == "SALES_RECEIPT"
        && business.get("paymentQrEnabled").and_then(Value::as_bool) == Some(true)
    {
        Some(
            crate::document_text::embedded_png(business, "paymentQrPngDataUrl")?
                .ok_or("Enabled payment QR is missing from the issued snapshot")?,
        )
    } else {
        None
    };
    let mut lines = Vec::new();
    for (key, label) in [
        ("businessName", ""),
        ("address", ""),
        ("contact", ""),
        ("taxPin", "Tax PIN: "),
    ] {
        push_text(&mut lines, business, key, label)?;
    }
    lines.push(title.into());
    lines.push(document.document_number.clone());
    let issued = text(&snapshot, "issuedAt", true)?;
    let time =
        DateTime::parse_from_rfc3339(&issued).map_err(|_| "Invalid issued financial timestamp")?;
    lines.push(
        time.with_timezone(&FixedOffset::east_opt(10800).ok_or("Invalid local time zone")?)
            .format("%Y-%m-%d %H:%M:%S EAT")
            .to_string(),
    );
    lines.push(format!("Order ID: {}", identity(&snapshot, "orderId")?));
    push_text(&mut lines, &snapshot, "orderName", "Order: ")?;
    lines.push("--------------------------------".into());
    if document.document_type == "PAYMENT_ACKNOWLEDGEMENT" {
        let currency = text(&snapshot, "currency", true)?;
        if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
            return Err("Invalid issued currency".into());
        }
        for (key, label) in [
            ("amountReceivedMinor", "Received"),
            ("orderTotalMinor", "Order total"),
            ("amountPaidMinor", "Total paid"),
            ("balanceMinor", "Balance"),
        ] {
            lines.push(format!(
                "{label} ({currency}): {}",
                money(amount(&snapshot, key)?)
            ));
        }
        let payments = snapshot
            .get("payments")
            .and_then(Value::as_array)
            .ok_or("Payment acknowledgement requires issued tender records")?;
        if payments.is_empty() || payments.len() > 50 {
            return Err("Issued tender count exceeds bounds".into());
        }
        let total = append_payments(&mut lines, payments)?;
        if total != amount(&snapshot, "amountReceivedMinor")? {
            return Err("Issued tender amounts do not reconcile".into());
        }
    } else if document.document_type == "SALES_RECEIPT" {
        append_sale(&mut lines, &snapshot)?;
    } else {
        lines.push(format!(
            "Returned: {}",
            money(amount(&snapshot, "amountReturnedMinor")?)
        ));
        let method = text(&snapshot, "method", true)?;
        if !["CASH", "MPESA", "CARD", "BANK"].contains(&method.as_str()) {
            return Err("Invalid issued refund method".into());
        }
        lines.push(format!("Method: {method}"));
        lines.push(format!("Reason: {}", text(&snapshot, "reason", true)?));
        push_text(
            &mut lines,
            &snapshot,
            "externalReference",
            "Return reference: ",
        )?;
        lines.push(format!(
            "Original payment: {}",
            identity(&snapshot, "paymentId")?
        ));
        identity(&snapshot, "refundId")?;
        if let Some(tax) = snapshot.get("taxReversal").filter(|value| !value.is_null()) {
            for (key, label) in [
                ("netMinor", "Net reversed"),
                ("vatMinor", "VAT reversed"),
                ("levyMinor", "Levy reversed"),
            ] {
                lines.push(format!("{label}: {}", money(amount(tax, key)?)));
            }
        }
        lines.push("No automatic stock return".into());
        push_text(&mut lines, &snapshot, "staffId", "Staff: ")?;
    }
    lines.push("--------------------------------".into());
    let footer_start = lines.len();
    let footer = crate::document_text::multiline(&snapshot, "footer", 2000)?;
    if footer.iter().all(|line| line.is_empty()) {
        push_text(&mut lines, business, "footer", "")?;
    } else {
        lines.extend(footer);
    }
    Ok(PreparedDocument {
        lines,
        logo,
        qr,
        footer_start: Some(footer_start),
    })
}

fn append_payments(lines: &mut Vec<String>, payments: &[Value]) -> Result<i64, String> {
    if payments.len() > 1000 {
        return Err("Issued tender list exceeds bounds".into());
    }
    let mut total = 0i64;
    let mut ids = std::collections::HashSet::new();
    for payment in payments {
        let id = identity(payment, "id")?;
        if !ids.insert(id) {
            return Err("Issued payment identity repeats".into());
        }
        let method = text(payment, "method", true)?;
        if !["CASH", "MPESA", "CARD", "BANK"].contains(&method.as_str()) {
            return Err("Unsupported issued payment method".into());
        }
        let paid = amount(payment, "amountMinor")?;
        total = total
            .checked_add(paid)
            .ok_or("Tender total exceeds bounds")?;
        lines.push(format!("{method}: {}", money(paid)));
        push_text(&mut lines, payment, "reference", "Reference: ")?;
        let origin = text(payment, "origin", true)?;
        if method == "CASH" {
            if origin != "CASHIER_CASH" {
                return Err("Issued cash origin is unsupported".into());
            }
            let tendered = amount(payment, "cashTenderedMinor")?;
            let change = amount(payment, "changeMinor")?;
            if tendered.checked_sub(change) != Some(paid) {
                return Err("Issued cash tender/change does not reconcile".into());
            }
            lines.push(format!("Tendered: {}", money(tendered)));
            lines.push(format!("Change: {}", money(change)));
        } else if origin == "CASHIER_CONFIRMED_EXTERNAL" {
            lines.push("Manually confirmed by cashier".into());
        } else {
            return Err(
                "Issued external payment origin needs an explicitly supported renderer".into(),
            );
        }
    }
    Ok(total)
}
fn append_sale(lines: &mut Vec<String>, snapshot: &Value) -> Result<(), String> {
    let currency = text(snapshot, "currency", true)?;
    if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err("Invalid issued currency".into());
    }
    identity(snapshot, "staffId")?;
    identity(snapshot, "deviceId")?;
    push_text(lines, &snapshot["cashier"], "name", "Cashier: ")?;
    let items = snapshot
        .get("items")
        .and_then(Value::as_array)
        .ok_or("Receipt requires issued items")?;
    if items.is_empty() || items.len() > 500 {
        return Err("Issued item count exceeds bounds".into());
    }
    let mut ids = std::collections::HashSet::new();
    let mut sum = 0i64;
    let mut discounts = 0i64;
    let mut tax_sum = [0i64; 3];
    for item in items {
        if !ids.insert(identity(item, "id")?) {
            return Err("Receipt line identity repeats".into());
        }
        if text(item, "state", true)? != "FIRED" {
            return Err("Receipt contains an unfired line".into());
        }
        let qty = item
            .get("quantity")
            .and_then(Value::as_f64)
            .filter(|n| n.is_finite() && *n > 0.0 && *n <= 1_000_000.0)
            .ok_or("Invalid issued receipt quantity")?;
        if (qty * 1_000_000.0 - (qty * 1_000_000.0).round()).abs() > 0.0001 {
            return Err("Issued quantity precision exceeds bounds".into());
        }
        let formatted = format!("{qty:.6}");
        let formatted = formatted.trim_end_matches('0').trim_end_matches('.');
        let line_total = amount(item, "lineTotalMinor")?;
        lines.push(text(item, "name", true)?);
        lines.push(format!(
            "{formatted} x {} = {}",
            money(amount(item, "unitPriceMinor")?),
            money(line_total)
        ));
        if let Some(portion) = item.get("portionSnapshot").filter(|value| !value.is_null()) {
            push_text(lines, portion, "name", "Portion: ")?;
        }
        let modifiers = item
            .get("modifierSnapshots")
            .and_then(Value::as_array)
            .ok_or("Receipt modifier snapshots must be a list")?;
        if modifiers.len() > 50 {
            return Err("Receipt modifiers exceed bounds".into());
        }
        for modifier in modifiers {
            lines.push(format!("Option: {}", text(modifier, "name", true)?));
        }
        let discount = amount(item, "discountMinor")?;
        if discount > 0 {
            lines.push(format!("Reduction: {}", money(discount)));
        }
        if item.get("comped").and_then(Value::as_bool) == Some(true) {
            lines.push(format!(
                "Complimentary: {}",
                text(item, "compReason", true)?
            ));
        }
        push_text(lines, item, "courseName", "Course: ")?;
        if let Some(Value::String(notes)) = item.get("notes") {
            if notes.chars().count() > 500 || notes.chars().any(|c| c.is_control() && c != '\n') {
                return Err("Receipt notes exceed bounds".into());
            }
            for note in notes.split('\n').filter(|line| !line.is_empty()) {
                lines.push(format!("Note: {note}"));
            }
        }
        sum = sum
            .checked_add(line_total)
            .ok_or("Receipt totals exceed bounds")?;
        discounts = discounts
            .checked_add(discount)
            .ok_or("Receipt discounts exceed bounds")?;
        for (index, key) in ["netMinor", "vatMinor", "levyMinor"].iter().enumerate() {
            tax_sum[index] = tax_sum[index]
                .checked_add(amount(item, key)?)
                .ok_or("Receipt taxes exceed bounds")?;
        }
    }
    let total = amount(snapshot, "totalMinor")?;
    let tax_total = tax_sum
        .iter()
        .try_fold(0i64, |sum, value| sum.checked_add(*value))
        .ok_or("Receipt taxes exceed bounds")?;
    if sum != total || discounts != amount(snapshot, "discountTotalMinor")? || tax_total != total {
        return Err("Issued receipt lines/taxes do not reconcile".into());
    }
    for (index, (key, label)) in [
        ("netMinor", "Net"),
        ("vatMinor", "VAT"),
        ("levyMinor", "Levy"),
    ]
    .iter()
    .enumerate()
    {
        let issued = amount(&snapshot["taxes"], key)?;
        if issued != tax_sum[index] {
            return Err("Issued tax allocation does not reconcile".into());
        }
        lines.push(format!("{label}: {}", money(issued)));
    }
    lines.push(format!("TOTAL ({currency}): {}", money(total)));
    if discounts > 0 {
        lines.push(format!("Discounts / comps: {}", money(discounts)));
    }
    if snapshot.get("refundedAmountMinor").is_some() {
        let returned = amount(snapshot, "refundedAmountMinor")?;
        if returned > 0 {
            lines.push(format!("Refunds recorded separately: {}", money(returned)));
        }
    }
    let payments = snapshot
        .get("payments")
        .and_then(Value::as_array)
        .ok_or("Receipt requires issued payment list")?;
    if snapshot.get("noPaymentRequired").and_then(Value::as_bool) == Some(true) {
        if total != 0 || !payments.is_empty() {
            return Err("No-payment receipt contradicts issued totals".into());
        }
        lines.push("No payment required. No money received.".into());
    } else if append_payments(lines, payments)? != total {
        return Err("Issued sale tenders do not reconcile".into());
    }
    Ok(())
}
