// Exercise the exact installed backend source without requiring a desktop WebView.
#[path = "../../src-tauri/src/store.rs"]
pub mod store;
#[path = "../../src-tauri/src/printer.rs"]
pub mod printer;
#[cfg(test)]
#[path = "../../src-tauri/src/tests.rs"]
mod tests;
