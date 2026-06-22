use flighthq_types::{TextLayoutResult, TextMetrics};

/// Allocates a zeroed `TextMetrics`.
pub fn create_text_metrics() -> TextMetrics {
    TextMetrics {
        width: 0.0,
        height: 0.0,
        num_lines: 0,
    }
}

/// Fills `out` with the measured content size from a computed layout (glyph
/// extent, ceil'd to whole pixels). Call after ensuring the layout is current.
pub fn get_text_metrics(out: &mut TextMetrics, layout: &TextLayoutResult) {
    out.width = layout.text_width.ceil();
    out.height = layout.text_height.ceil();
    out.num_lines = layout.num_lines;
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::TextLayoutResult;

    #[test]
    fn create_text_metrics_zeros() {
        let m = create_text_metrics();
        assert_eq!(m.width, 0.0);
        assert_eq!(m.height, 0.0);
        assert_eq!(m.num_lines, 0);
    }

    #[test]
    fn get_text_metrics_ceil() {
        let mut layout = TextLayoutResult::default();
        layout.text_width = 10.3;
        layout.text_height = 14.7;
        layout.num_lines = 2;
        let mut out = create_text_metrics();
        get_text_metrics(&mut out, &layout);
        assert_eq!(out.width, 11.0);
        assert_eq!(out.height, 15.0);
        assert_eq!(out.num_lines, 2);
    }

    #[test]
    fn get_text_metrics_exact() {
        let mut layout = TextLayoutResult::default();
        layout.text_width = 12.0;
        layout.text_height = 16.0;
        layout.num_lines = 1;
        let mut out = create_text_metrics();
        get_text_metrics(&mut out, &layout);
        assert_eq!(out.width, 12.0);
        assert_eq!(out.height, 16.0);
    }
}
