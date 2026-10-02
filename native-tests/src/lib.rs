// Exercise the exact installed backend source without requiring a desktop WebView.
#[path = "../../src-tauri/src/store.rs"]
pub mod store;
#[path = "../../src-tauri/src/printer.rs"]
pub mod printer;
// Shared with the Tauri crate: the bounded server-error formatter must be
// asserted once against the shipped source, not duplicated per crate.
#[path = "../../src-tauri/src/rpc_error.rs"]
pub mod rpc_error;
#[cfg(test)]
#[path = "../../src-tauri/src/tests.rs"]
mod tests;
