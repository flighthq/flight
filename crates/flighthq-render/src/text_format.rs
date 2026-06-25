//! Text-format utilities for renderer backends.

use flighthq_types::TextFormat;

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Builds the CSS `font` shorthand string for `format`:
/// `"<style> <weight> <size>px <family>"`.
///
/// Defaults: style = `"normal"`, weight = `"normal"`, size = `12`, family = `"serif"`.
pub fn compute_text_format_font_string(format: &TextFormat) -> String {
    let style = if format.italic.unwrap_or(false) {
        "italic"
    } else {
        "normal"
    };
    let weight = if format.bold.unwrap_or(false) {
        "bold"
    } else {
        "normal"
    };
    let size = format.size.unwrap_or(12.0);
    let family = format.font.as_deref().unwrap_or("serif");
    format!("{style} {weight} {}px {family}", format_size(size))
}

// Formats a font size the way JS `Number.toString` would: whole numbers drop the
// trailing `.0` ("12px", not "12.0px") while fractional sizes keep their decimals.
fn format_size(size: f32) -> String {
    if size.fract() == 0.0 {
        format!("{}", size as i64)
    } else {
        format!("{size}")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_format(
        bold: Option<bool>,
        italic: Option<bool>,
        size: Option<f32>,
        font: Option<String>,
    ) -> TextFormat {
        TextFormat {
            bold,
            italic,
            size,
            font,
            ..Default::default()
        }
    }

    // compute_text_format_font_string

    #[test]
    fn compute_text_format_font_string_defaults() {
        let format = make_format(None, None, None, None);
        let s = compute_text_format_font_string(&format);
        assert_eq!(s, "normal normal 12px serif");
    }

    #[test]
    fn compute_text_format_font_string_bold_italic() {
        let format = make_format(
            Some(true),
            Some(true),
            Some(24.0),
            Some("Arial".to_string()),
        );
        let s = compute_text_format_font_string(&format);
        assert_eq!(s, "italic bold 24px Arial");
    }

    #[test]
    fn compute_text_format_font_string_bold_only() {
        let format = make_format(Some(true), Some(false), Some(16.0), None);
        let s = compute_text_format_font_string(&format);
        assert_eq!(s, "normal bold 16px serif");
    }
}
