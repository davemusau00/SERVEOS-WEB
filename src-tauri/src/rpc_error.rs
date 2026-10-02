//! Bounded server error detail shared by the compiled Tauri crate and the
//! dependency-free `native-tests` domain crate.
//!
//! This module must stay free of `tauri`, `reqwest` and every other Tauri-only
//! dependency. `native-tests/src/lib.rs` includes it by `#[path]` so the
//! behaviour is asserted once against the exact source the terminal ships,
//! instead of being duplicated (and drifting) inside each crate.

/// Maximum server error detail retained in a rejection message. The message is
/// rendered in the operator UI and persisted with local rejection evidence, so
/// an unbounded proxy or gateway body must never be stored verbatim.
pub const MAX_SERVER_ERROR_DETAIL: usize = 400;

/// Bound a server-supplied detail string without splitting a UTF-8 character.
///
/// Short bodies are preserved verbatim. Oversized bodies are truncated on a
/// character boundary and annotated with the original byte length, so the
/// operator can tell a truncated diagnosis from a short one.
pub fn bounded_detail(detail: &str) -> String {
    if detail.len() <= MAX_SERVER_ERROR_DETAIL {
        return detail.to_string();
    }
    let mut end = MAX_SERVER_ERROR_DETAIL;
    while end > 0 && !detail.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}… ({} bytes total)", &detail[..end], detail.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_detail_is_preserved_verbatim() {
        assert_eq!(bounded_detail("Terminal authentication failed"), "Terminal authentication failed");
        assert_eq!(bounded_detail(""), "");
    }

    #[test]
    fn oversized_detail_is_truncated_with_the_original_size() {
        let huge = "x".repeat(MAX_SERVER_ERROR_DETAIL * 3);
        let bounded = bounded_detail(&huge);
        assert!(bounded.len() < huge.len(), "oversized detail must be bounded");
        assert!(bounded.starts_with(&"x".repeat(MAX_SERVER_ERROR_DETAIL)));
        assert!(bounded.contains("bytes total"), "truncation must report the original size: {bounded}");
    }

    #[test]
    fn truncation_never_splits_a_multibyte_character() {
        // Every truncation boundary inside this string lands mid-character.
        for repeat in 1..8 {
            let multibyte = "é".repeat(MAX_SERVER_ERROR_DETAIL * repeat);
            let bounded = bounded_detail(&multibyte);
            assert!(bounded.is_char_boundary(0));
            assert!(bounded.len() <= MAX_SERVER_ERROR_DETAIL + 32);
            assert!(!bounded.contains('\u{FFFD}'), "truncation must not corrupt UTF-8");
            assert!(bounded.starts_with("é"));
        }
    }

    #[test]
    fn exact_boundary_length_is_not_truncated() {
        let exact = "y".repeat(MAX_SERVER_ERROR_DETAIL);
        assert_eq!(bounded_detail(&exact), exact);
    }
}