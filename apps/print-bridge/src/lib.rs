//! Local printing infrastructure only. No ServOS business database or command authority.
pub mod journal;
pub mod session;
pub use session::BridgeSession;
pub mod auth;
pub mod actions;
pub mod routing;
pub mod rendering;
pub mod api_claim;
pub mod api_client;

pub mod delivery;

pub mod dispatcher;

pub mod config;

pub mod financial_rendering;

pub mod images;

pub mod close_day_rendering;

pub mod document_text;

pub mod purchase_order_rendering;

pub mod goods_receipt_rendering;

pub mod supplier_payment_rendering;

pub mod supplier_return_rendering;

pub mod customer_credit_rendering;
