//! flight-compiler: rust-only

pub(crate) fn utf16_len(text: &str) -> usize {
    return text.encode_utf16().count();
}
