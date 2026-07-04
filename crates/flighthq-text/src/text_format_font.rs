use flighthq_types::TextFormat;

/// Computes a CSS font shorthand string from a `TextFormat`.
///
/// Produces a string such as `"italic bold 12px serif"` suitable for assignment
/// to `CanvasRenderingContext2D.font` or similar CSS contexts. Absent fields
/// fall back to sensible defaults: `normal` style, `normal` weight, `12` px
/// size, and `serif` family.
pub fn compute_text_format_font_string(format: &TextFormat) -> String {
    let style = if format.italic == Some(true) {
        "italic"
    } else {
        "normal"
    };
    let weight = if format.bold == Some(true) {
        "bold"
    } else {
        "normal"
    };
    let size = format.size.unwrap_or(12.0);
    let family = format.font.as_deref().unwrap_or("serif");
    format!("{style} {weight} {size}px {family}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_text_format_font_string_defaults() {
        let result = compute_text_format_font_string(&TextFormat::default());
        assert_eq!(result, "normal normal 12px serif");
    }

    #[test]
    fn compute_text_format_font_string_bold_italic() {
        let format = TextFormat {
            bold: Some(true),
            italic: Some(true),
            size: Some(16.0),
            font: Some("Arial".to_string()),
            ..TextFormat::default()
        };
        assert_eq!(
            compute_text_format_font_string(&format),
            "italic bold 16px Arial"
        );
    }

    #[test]
    fn compute_text_format_font_string_custom_size_and_font() {
        let format = TextFormat {
            size: Some(24.0),
            font: Some("monospace".to_string()),
            ..TextFormat::default()
        };
        assert_eq!(
            compute_text_format_font_string(&format),
            "normal normal 24px monospace"
        );
    }

    #[test]
    fn compute_text_format_font_string_italic_only() {
        let format = TextFormat {
            italic: Some(true),
            ..TextFormat::default()
        };
        assert_eq!(
            compute_text_format_font_string(&format),
            "italic normal 12px serif"
        );
    }

    #[test]
    fn compute_text_format_font_string_bold_only() {
        let format = TextFormat {
            bold: Some(true),
            ..TextFormat::default()
        };
        assert_eq!(
            compute_text_format_font_string(&format),
            "normal bold 12px serif"
        );
    }
}
