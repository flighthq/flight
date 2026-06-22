use flighthq_types::TextFormat;

const DEFAULT_SIZE: f32 = 12.0;

/// Returns the ascent (cap-height approximation) for `format` in pixels.
pub fn get_text_format_ascent(format: &TextFormat) -> f32 {
    format.size.unwrap_or(DEFAULT_SIZE)
}

/// Returns the descent for `format` in pixels.
pub fn get_text_format_descent(format: &TextFormat) -> f32 {
    format.size.unwrap_or(DEFAULT_SIZE) * 0.185
}

/// Returns the total line height (ascent + descent + leading) for `format`.
pub fn get_text_format_height(format: &TextFormat) -> f32 {
    get_text_format_ascent(format)
        + get_text_format_descent(format)
        + get_text_format_leading(format)
}

/// Returns the leading (extra gap between lines) for `format` in pixels.
pub fn get_text_format_leading(format: &TextFormat) -> f32 {
    format.leading.unwrap_or(0.0)
}

/// Merges `override_format` on top of `base`: any `Some` field in
/// `override_format` replaces the corresponding field in the result.
pub fn merge_text_format(base: &TextFormat, override_format: &TextFormat) -> TextFormat {
    let mut result = base.clone();
    if override_format.align.is_some() {
        result.align = override_format.align;
    }
    if override_format.block_indent.is_some() {
        result.block_indent = override_format.block_indent;
    }
    if override_format.bold.is_some() {
        result.bold = override_format.bold;
    }
    if override_format.bullet.is_some() {
        result.bullet = override_format.bullet;
    }
    if override_format.color.is_some() {
        result.color = override_format.color;
    }
    if override_format.font.is_some() {
        result.font = override_format.font.clone();
    }
    if override_format.indent.is_some() {
        result.indent = override_format.indent;
    }
    if override_format.italic.is_some() {
        result.italic = override_format.italic;
    }
    if override_format.kerning.is_some() {
        result.kerning = override_format.kerning;
    }
    if override_format.leading.is_some() {
        result.leading = override_format.leading;
    }
    if override_format.left_margin.is_some() {
        result.left_margin = override_format.left_margin;
    }
    if override_format.letter_spacing.is_some() {
        result.letter_spacing = override_format.letter_spacing;
    }
    if override_format.right_margin.is_some() {
        result.right_margin = override_format.right_margin;
    }
    if override_format.size.is_some() {
        result.size = override_format.size;
    }
    if override_format.strikethrough.is_some() {
        result.strikethrough = override_format.strikethrough;
    }
    if override_format.tab_stops.is_some() {
        result.tab_stops = override_format.tab_stops.clone();
    }
    if override_format.target.is_some() {
        result.target = override_format.target.clone();
    }
    if override_format.underline.is_some() {
        result.underline = override_format.underline;
    }
    if override_format.url.is_some() {
        result.url = override_format.url.clone();
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::TextFormat;

    fn format_size(size: f32) -> TextFormat {
        TextFormat {
            size: Some(size),
            ..Default::default()
        }
    }

    #[test]
    fn get_text_format_ascent_default() {
        assert_eq!(get_text_format_ascent(&TextFormat::default()), 12.0);
    }

    #[test]
    fn get_text_format_ascent_explicit() {
        assert_eq!(get_text_format_ascent(&format_size(24.0)), 24.0);
    }

    #[test]
    fn get_text_format_descent_default() {
        let expected = 12.0 * 0.185;
        let actual = get_text_format_descent(&TextFormat::default());
        assert!((actual - expected).abs() < f32::EPSILON);
    }

    #[test]
    fn get_text_format_height_is_sum() {
        let f = TextFormat::default();
        let expected =
            get_text_format_ascent(&f) + get_text_format_descent(&f) + get_text_format_leading(&f);
        assert!((get_text_format_height(&f) - expected).abs() < f32::EPSILON);
    }

    #[test]
    fn get_text_format_leading_default() {
        assert_eq!(get_text_format_leading(&TextFormat::default()), 0.0);
    }

    #[test]
    fn merge_text_format_override_size() {
        let base = TextFormat {
            size: Some(12.0),
            bold: Some(false),
            ..Default::default()
        };
        let over = TextFormat {
            bold: Some(true),
            color: Some(0xff0000),
            ..Default::default()
        };
        let result = merge_text_format(&base, &over);
        assert_eq!(result.size, Some(12.0));
        assert_eq!(result.bold, Some(true));
        assert_eq!(result.color, Some(0xff0000));
    }

    #[test]
    fn merge_text_format_skips_none() {
        let base = TextFormat {
            size: Some(12.0),
            ..Default::default()
        };
        let result = merge_text_format(&base, &TextFormat::default());
        assert_eq!(result.size, Some(12.0));
        assert_eq!(result.bold, None);
    }

    #[test]
    fn merge_text_format_does_not_mutate_base() {
        let base = TextFormat {
            size: Some(12.0),
            ..Default::default()
        };
        let over = TextFormat {
            size: Some(24.0),
            ..Default::default()
        };
        let _ = merge_text_format(&base, &over);
        assert_eq!(base.size, Some(12.0));
    }
}
