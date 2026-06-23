use flighthq_types::{TextFormat, TextLayoutGroup};

/// Allocates an empty `TextLayoutGroup` covering `[start_index, end_index)`.
///
/// The group is zeroed except for the supplied `format` and index bounds;
/// `compute_text_layout` fills the remaining metrics and glyph positions.
pub fn create_text_layout_group(
    format: TextFormat,
    start_index: usize,
    end_index: usize,
) -> TextLayoutGroup {
    TextLayoutGroup {
        ascent: 0.0,
        descent: 0.0,
        end_index,
        format,
        height: 0.0,
        leading: 0.0,
        line_index: 0,
        offset_x: 0.0,
        offset_y: 0.0,
        positions: Vec::new(),
        start_index,
        width: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::TextFormat;

    #[test]
    fn create_text_layout_group_fields() {
        let g = create_text_layout_group(TextFormat::default(), 0, 5);
        assert_eq!(g.start_index, 0);
        assert_eq!(g.end_index, 5);
        assert_eq!(g.width, 0.0);
        assert!(g.positions.is_empty());
    }
}
