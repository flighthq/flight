use flighthq_types::{TextFormat, TextFormatRange};

/// Allocates a new `TextFormatRange` covering `[start, end)` with `format`.
pub fn create_text_format_range(format: TextFormat, start: usize, end: usize) -> TextFormatRange {
    TextFormatRange { end, format, start }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::TextFormat;

    #[test]
    fn create_text_format_range_fields() {
        let r = create_text_format_range(TextFormat::default(), 2, 8);
        assert_eq!(r.start, 2);
        assert_eq!(r.end, 8);
    }
}
