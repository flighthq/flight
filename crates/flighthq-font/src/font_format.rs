//! Font format inference from URL file extensions.

/// Infers the CSS font format string from a URL's file extension.
///
/// Strips any query string, extracts the extension, and maps it to the
/// corresponding CSS `format()` value. Returns `None` for unrecognized
/// extensions. Mirrors TS `inferFontFormat`.
pub fn infer_font_format(url: &str) -> Option<&'static str> {
    let path = url.split('?').next().unwrap_or(url);
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "woff" => Some("woff"),
        "woff2" => Some("woff2"),
        "ttf" => Some("truetype"),
        "otf" => Some("opentype"),
        "eot" => Some("embedded-opentype"),
        "svg" => Some("svg"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infer_font_format_returns_none_for_unknown_extension() {
        assert!(infer_font_format("font.png").is_none());
    }

    #[test]
    fn infer_font_format_returns_none_for_no_extension() {
        assert!(infer_font_format("font").is_none());
    }

    #[test]
    fn infer_font_format_returns_opentype_for_otf() {
        assert_eq!(infer_font_format("font.otf"), Some("opentype"));
    }

    #[test]
    fn infer_font_format_returns_truetype_for_ttf() {
        assert_eq!(infer_font_format("font.ttf"), Some("truetype"));
    }

    #[test]
    fn infer_font_format_returns_woff_for_woff() {
        assert_eq!(infer_font_format("font.woff"), Some("woff"));
    }

    #[test]
    fn infer_font_format_returns_woff2_for_woff2() {
        assert_eq!(infer_font_format("font.woff2"), Some("woff2"));
    }

    #[test]
    fn infer_font_format_returns_embedded_opentype_for_eot() {
        assert_eq!(infer_font_format("font.eot"), Some("embedded-opentype"));
    }

    #[test]
    fn infer_font_format_returns_svg_for_svg() {
        assert_eq!(infer_font_format("font.svg"), Some("svg"));
    }

    #[test]
    fn infer_font_format_strips_query_string() {
        assert_eq!(infer_font_format("font.woff2?v=123"), Some("woff2"));
    }

    #[test]
    fn infer_font_format_is_case_insensitive() {
        assert_eq!(infer_font_format("font.WOFF2"), Some("woff2"));
        assert_eq!(infer_font_format("font.TTF"), Some("truetype"));
    }
}
