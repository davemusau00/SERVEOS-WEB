//! Immutable customer-credit document formatting. No live account or payment calculations.
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
        _ => Err(format!("Invalid customer credit document {key}")),
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
        .filter(|amount| (0..=9007199254740991).contains(amount))
        .ok_or_else(|| format!("Missing or invalid issued amount {key}"))
}
fn money(value: i64) -> String {
    format!("{}.{:02}", value / 100, value % 100)
}
fn at(value: &Value, key: &str) -> Result<String, String> {
    let raw = text(value, key, true)?;
    let parsed =
        DateTime::parse_from_rfc3339(&raw).map_err(|_| format!("Invalid {key} timestamp"))?;
    Ok(parsed
        .with_timezone(&FixedOffset::east_opt(10800).ok_or("Invalid local time zone")?)
        .format("%Y-%m-%d %H:%M:%S EAT")
        .to_string())
}
fn person(snapshot: &Value) -> Result<String, String> {
    let customer = snapshot
        .get("customer")
        .filter(|value| value.is_object())
        .ok_or("Customer identity is required")?;
    identity(customer, "id")?;
    text(customer, "name", true)
}
fn business_header(lines: &mut Vec<String>, business: &Value) -> Result<Option<String>, String> {
    for (key, label) in [
        ("businessName", ""),
        ("address", ""),
        ("contact", ""),
        ("taxPin", "Tax PIN: "),
    ] {
        if key == "address" {
            lines.extend(crate::document_text::multiline(business, key, 2000)?);
        } else {
            let value = text(business, key, false)?;
            if !value.is_empty() {
                lines.push(format!("{label}{value}"));
            }
        }
    }
    crate::document_text::embedded_png(business, "logoPngDataUrl")
}
pub fn prepare_customer_credit(input: &ValidatedAction) -> Result<PreparedDocument, String> {
    let (document, role) = match input.action() {
        BridgeAction::Submit {
            document,
            printer_role,
            ..
        } => (document, *printer_role),
        _ => return Err("Customer credit rendering requires submit".into()),
    };
    let expected_role = if document.document_type == "CUSTOMER_CREDIT_INVOICE" {
        PrinterRole::Receipt
    } else {
        PrinterRole::Office
    };
    if role != expected_role {
        return Err("Customer credit document requires its configured receipt/office role".into());
    }
    let snapshot: Value = serde_json::from_str(&document.canonical_snapshot)
        .map_err(|_| "Invalid immutable customer credit snapshot")?;
    let title = match document.document_type.as_str() {
        "CUSTOMER_CREDIT_INVOICE" => "CUSTOMER CREDIT INVOICE",
        "CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT" => "CUSTOMER PAYMENT ACKNOWLEDGEMENT",
        "CUSTOMER_CREDIT_WRITE_OFF_NOTICE" => "CUSTOMER CREDIT WRITE-OFF NOTICE",
        "CUSTOMER_CREDIT_REVERSAL_NOTICE" => "CUSTOMER CREDIT REVERSAL NOTICE",
        _ => return Err("Unsupported customer credit layout".into()),
    };
    let mut lines = Vec::new();
    let logo = if expected_role == PrinterRole::Receipt {
        business_header(&mut lines, &snapshot["business"])?
    } else {
        None
    };
    lines.push(title.into());
    lines.push(document.document_number.clone());
    let timestamp = if document.document_type == "CUSTOMER_CREDIT_INVOICE" {
        "issuedAt"
    } else {
        "recordedAt"
    };
    lines.push(at(&snapshot, timestamp)?);
    lines.push(format!("Customer: {}", person(&snapshot)?));
    lines.push("--------------------------------".into());
    let qr = None;
    match document.document_type.as_str() {
        "CUSTOMER_CREDIT_INVOICE" => {
            let currency = text(&snapshot, "currency", true)?;
            if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
                return Err("Invalid issued currency".into());
            }
            lines.push(format!("Order: {}", text(&snapshot, "orderName", true)?));
            lines.push(format!("Order ID: {}", identity(&snapshot, "orderId")?));
            let items = snapshot
                .get("items")
                .and_then(Value::as_array)
                .filter(|items| !items.is_empty() && items.len() <= 500)
                .ok_or("Invoice items are missing or exceed bounds")?;
            let mut total = 0i64;
            let mut taxes = [0i64; 3];
            let mut ids = std::collections::HashSet::new();
            for item in items {
                if !ids.insert(identity(item, "id")?) {
                    return Err("Invoice line identity repeats".into());
                }
                let quantity = item
                    .get("quantity")
                    .and_then(Value::as_f64)
                    .filter(|qty| qty.is_finite() && *qty > 0.0 && *qty <= 1_000_000.0)
                    .ok_or("Invalid invoice quantity")?;
                if (quantity * 1_000_000.0 - (quantity * 1_000_000.0).round()).abs() > 0.0001 {
                    return Err("Invoice quantity precision exceeds bounds".into());
                }
                let quantity = format!("{quantity:.6}");
                let quantity = quantity.trim_end_matches('0').trim_end_matches('.');
                let line_total = amount(item, "lineTotalMinor")?;
                lines.push(text(item, "name", true)?);
                lines.push(format!(
                    "{quantity} x {} = {}",
                    money(amount(item, "unitPriceMinor")?),
                    money(line_total)
                ));
                total = total
                    .checked_add(line_total)
                    .ok_or("Invoice total exceeds bounds")?;
                for (index, key) in ["netMinor", "vatMinor", "levyMinor"].iter().enumerate() {
                    taxes[index] = taxes[index]
                        .checked_add(amount(item, key)?)
                        .ok_or("Invoice tax exceeds bounds")?;
                }
            }
            let issued = amount(&snapshot, "amountMinor")?;
            let order_total = amount(&snapshot, "amountPaidMinor")?
                .checked_add(amount(&snapshot, "amountCreditedMinor")?)
                .ok_or("Original order total exceeds bounds")?;
            if total != order_total
                || taxes
                    .iter()
                    .try_fold(0i64, |sum, value| sum.checked_add(*value))
                    != Some(order_total)
            {
                return Err(
                    "Invoice item evidence does not reconcile to the original order".into(),
                );
            }
            let mut allocated_tax = 0i64;
            for (key, label) in [
                ("netMinor", "Net"),
                ("vatMinor", "VAT"),
                ("levyMinor", "Levy"),
            ] {
                let allocated = amount(&snapshot["taxes"], key)?;
                allocated_tax = allocated_tax
                    .checked_add(allocated)
                    .ok_or("Credit tax allocation exceeds bounds")?;
                lines.push(format!("{label} on account charge: {}", money(allocated)));
            }
            if allocated_tax != issued {
                return Err("Credit tax allocation does not reconcile to the issued charge".into());
            }
            lines.push(format!("CREDIT TOTAL ({currency}): {}", money(issued)));
            lines.push("Payment received: 0.00".into());
            lines.push(format!(
                "Due: {} ({} day terms)",
                at(&snapshot, "dueAt")?,
                snapshot
                    .get("termsDays")
                    .and_then(Value::as_u64)
                    .filter(|days| *days <= 365)
                    .ok_or("Invalid credit terms")?
            ));
            lines.push(format!(
                "Account balance before: {}",
                money(amount(&snapshot, "accountBalanceBeforeMinor")?)
            ));
            lines.push(format!(
                "Account balance after: {}",
                money(amount(&snapshot, "accountBalanceAfterMinor")?)
            ));
            lines.push("This records an account charge, not payment received.".into());
        }
        "CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT" => {
            let method = text(&snapshot, "paymentMethod", true)?;
            if !["CASH", "MPESA", "CARD", "BANK"].contains(&method.as_str()) {
                return Err("Invalid customer payment method".into());
            }
            let payment = amount(&snapshot, "amountMinor")?;
            let before = amount(&snapshot, "balanceBeforeMinor")?;
            let after = amount(&snapshot, "balanceAfterMinor")?;
            if before.checked_sub(payment) != Some(after) {
                return Err("Customer payment balance does not reconcile".into());
            }
            lines.push(format!("FUNDS RECEIVED: {}", money(payment)));
            lines.push(format!("Method: {method}"));
            let account = snapshot
                .get("paymentAccount")
                .filter(|value| value.is_object())
                .ok_or("Payment account snapshot is required")?;
            identity(account, "id")?;
            lines.push(format!("Account: {}", text(account, "name", true)?));
            let reference = text(&snapshot, "reference", false)?;
            if !reference.is_empty() {
                lines.push(format!("Reference: {reference}"));
            }
            let received_at = if snapshot.get("receivedAt").and_then(Value::as_str).is_some() {
                at(&snapshot, "receivedAt")?
            } else if method == "CASH" {
                at(&snapshot, "recordedAt")?
            } else {
                return Err(
                    "External customer payment must retain its actual received time".into(),
                );
            };
            lines.push(format!("Received: {received_at}"));
            lines.push(format!("Balance before: {}", money(before)));
            lines.push(format!("Balance after: {}", money(after)));
            lines.push("Cashier-confirmed funds; no provider confirmation is asserted.".into());
            identity(&snapshot, "entryId")?;
            identity(&snapshot, "confirmedBy")?;
        }
        "CUSTOMER_CREDIT_WRITE_OFF_NOTICE" => {
            identity(&snapshot, "entryId")?;
            let amount_minor = amount(&snapshot, "amountMinor")?;
            let before = amount(&snapshot, "balanceBeforeMinor")?;
            if before.checked_sub(amount_minor) != Some(amount(&snapshot, "balanceAfterMinor")?) {
                return Err("Write-off account balance does not reconcile".into());
            }
            lines.push(format!(
                "ACCOUNTS RECEIVABLE WRITTEN OFF: {}",
                money(amount_minor)
            ));
            lines.push(format!("Balance before: {}", money(before)));
            lines.push(format!(
                "Balance after: {}",
                money(amount(&snapshot, "balanceAfterMinor")?)
            ));
            lines.push(format!("Reason: {}", text(&snapshot, "reason", true)?));
            lines.push(format!(
                "Recorded by: {}",
                identity(&snapshot, "recordedBy")?
            ));
            lines.push("This is not a cash refund or customer payment.".into());
        }
        "CUSTOMER_CREDIT_REVERSAL_NOTICE" => {
            identity(&snapshot, "entryId")?;
            identity(&snapshot, "originalEntryId")?;
            let amount_minor = amount(&snapshot, "amountMinor")?;
            let before = amount(&snapshot, "balanceBeforeMinor")?;
            let after = amount(&snapshot, "balanceAfterMinor")?;
            let kind = text(&snapshot, "kind", true)?;
            if ![
                "CHARGE_REVERSAL",
                "SETTLEMENT_REVERSAL",
                "WRITE_OFF_REVERSAL",
            ]
            .contains(&kind.as_str())
            {
                return Err("Invalid customer credit reversal kind".into());
            }
            let reconciled = if kind == "CHARGE_REVERSAL" {
                before.checked_sub(amount_minor) == Some(after)
            } else {
                before.checked_add(amount_minor) == Some(after)
            };
            if !reconciled {
                return Err("Reversal account balance does not reconcile".into());
            }
            lines.push(format!("{kind}: {}", money(amount_minor)));
            lines.push(format!(
                "Original entry: {}",
                identity(&snapshot, "originalEntryId")?
            ));
            lines.push(format!(
                "Reversal entry: {}",
                identity(&snapshot, "entryId")?
            ));
            lines.push(format!("Balance before: {}", money(before)));
            lines.push(format!("Balance after: {}", money(after)));
            lines.push(format!("Reason: {}", text(&snapshot, "reason", true)?));
            let reference = text(&snapshot, "externalReference", false)?;
            if !reference.is_empty() {
                lines.push(format!("Return reference: {reference}"));
            }
            lines.push(format!(
                "Recorded by: {}",
                identity(&snapshot, "recordedBy")?
            ));
            lines.push(text(&snapshot, "notice", true)?);
        }
        _ => unreachable!(),
    }
    lines.push("--------------------------------".into());
    let footer = crate::document_text::multiline(&snapshot, "footer", 2000)?;
    let footer_start = Some(lines.len());
    if footer.iter().all(|line| line.is_empty()) {
        if expected_role == PrinterRole::Receipt {
            lines.extend(crate::document_text::multiline(
                &snapshot["business"],
                "footer",
                2000,
            )?);
        }
    } else {
        lines.extend(footer);
    }
    Ok(PreparedDocument {
        lines,
        logo,
        qr,
        footer_start,
    })
}
